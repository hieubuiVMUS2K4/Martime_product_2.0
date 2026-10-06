using System.Net;
using System.Text;
using System.Text.Json;
using Maritime.Shared.Models.Sync;
using Maritime.Shared.DTOs.Sync;
using MaritimeEdge.Data;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using Moq;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

public partial class SyncReliabilityTests
{
    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) => send(request);
    }

    private static (ServiceProvider Services, SyncService Sync) Build(bool enabled, Func<HttpRequestMessage, Task<HttpResponseMessage>> send,
        string? connection = null, Dictionary<string, string?>? overrides = null, ISyncFileStorageService? storage = null, ISyncFilePreparationService? preparation = null)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ShoreAPI:Enabled"] = enabled.ToString(), ["Sync:ReconnectWarmupMaxSeconds"] = "0",
            ["Sync:RetryTokenBucket:Burst"] = "100", ["Sync:AdaptiveProfiles:Shore_WiFi:MetadataBytes"] = "65536"
        }).AddInMemoryCollection(overrides ?? []).Build();
        var databaseName = Guid.NewGuid().ToString();
        var services = new ServiceCollection().AddDbContext<EdgeDbContext>(o => { if (connection == null) o.UseInMemoryDatabase(databaseName); else o.UseNpgsql(connection); })
            .AddScoped<ISyncConflictHandler>(_ => new SyncConflictHandler(NullLogger<SyncConflictHandler>.Instance)).BuildServiceProvider();
        var runtime = new Mock<IEdgeRuntimeConfigService>();
        runtime.Setup(r => r.GetSyncConfigAsync()).ReturnsAsync(new EdgeSyncConfig { NodeId = overrides?.GetValueOrDefault("SyncSecurity:NodeId") ?? "TEST-" + Guid.NewGuid(), ShoreBaseUrl = "https://shore.test", NetworkType = "Shore_WiFi", BatchSize = 100 });
        var client = new HttpClient(new Handler(send)) { Timeout = Timeout.InfiniteTimeSpan };
        var clients = new Mock<IHttpClientFactory>(); clients.Setup(c => c.CreateClient("ShoreAPI")).Returns(client);
        var signer = new Mock<ISyncRequestSigningService>();
        signer.Setup(s => s.CreateSignedRequestAsync(It.IsAny<HttpMethod>(), It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((HttpMethod method, string url, string? body, CancellationToken _) => new HttpRequestMessage(method, url) { Content = body == null ? null : new StringContent(body, Encoding.UTF8, "application/json") });
        var sync = new SyncService(services, NullLogger<SyncService>.Instance, configuration, runtime.Object, clients.Object, signer.Object,
            storage ?? Mock.Of<ISyncFileStorageService>(), preparation ?? Mock.Of<ISyncFilePreparationService>());
        return (services, sync);
    }

    private static SyncQueue Queue(string key = "1") => new() { TableName = "engine_data", RecordKey = key, Payload = "{}", Priority = SyncPriority.Critical };
    private static HttpResponseMessage Response(string json) => new(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    [Fact]
    public async Task AnOfflineActiveLink_PreventsPushAndPullEvenIfTheProfileSaysWifi()
    {
        var file = Path.GetTempFileName(); await File.WriteAllTextAsync(file, "None");
        try
        {
            var (services, sync) = Build(true, _ => throw new InvalidOperationException("Offline requests must not be sent"),
                overrides: new() { ["Sync:ActiveLinkFile"] = file });
            using (services)
            {
                var db = services.GetRequiredService<EdgeDbContext>(); db.SyncQueue.Add(Queue()); await db.SaveChangesAsync();
                await sync.ExecuteSyncAsync(default); await sync.PullFromShoreAsync(default);
                Assert.Null((await db.SyncQueue.SingleAsync()).SyncedAt);
            }
        }
        finally { File.Delete(file); }
    }

    [Fact]
    public async Task AnExhaustedByteAllowance_DefersWithoutSendingOrAcknowledging()
    {
        var (services, sync) = Build(true, _ => throw new InvalidOperationException("Budget must be reserved before sending"),
            overrides: new() { ["Sync:DailyByteBudgets:Shore_WiFi"] = "1" });
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); db.SyncQueue.Add(Queue()); await db.SaveChangesAsync();
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
            var item = await db.SyncQueue.SingleAsync(); Assert.Null(item.SyncedAt); Assert.Contains("budget", item.LastError!, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task LostPullAck_ReplaysOnlyTheReceipt_AndOlderEventsCannotOverwriteNewerData()
    {
        var gets = 0; var acks = 0; var stream = Guid.NewGuid(); var restored = Guid.NewGuid();
        SyncQueueItemDto Item(long id, string name) => new() { OutboxId = id, SyncVersion = id, TableName = "rank", RecordKey = "101",
            ActionType = "SNAPSHOT", OriginNode = "SHORE", StreamId = gets >= 4 ? restored : stream, Timestamp = DateTime.UtcNow, Payload = JsonSerializer.Serialize(new { Id = 101, RankCode = "TEST", RankName = name }) };
        var (services, sync) = Build(true, request =>
        {
            if (request.Method == HttpMethod.Get)
            {
                gets++;
                return Task.FromResult(Response(JsonSerializer.Serialize(new SyncPullResponse { Items = gets <= 2 ? [Item(900, "First")] : gets == 3 ? [Item(1000, "Latest"), Item(899, "Stale")] : [Item(1, "Restored stream")] })));
            }
            acks++;
            return Task.FromResult(acks == 1 ? new HttpResponseMessage(HttpStatusCode.ServiceUnavailable) : Response("{}"));
        });
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); await sync.PullFromShoreAsync(default);
            var rank = await db.Ranks.SingleAsync(); Assert.Equal("First", rank.RankName);
            rank.RankName = "After first receipt"; await db.SaveChangesAsync();
            await sync.PullFromShoreAsync(default); db.ChangeTracker.Clear(); Assert.Equal("After first receipt", (await db.Ranks.SingleAsync()).RankName);
            await sync.PullFromShoreAsync(default); db.ChangeTracker.Clear(); Assert.Equal("Latest", (await db.Ranks.SingleAsync()).RankName);
            await sync.PullFromShoreAsync(default); db.ChangeTracker.Clear(); Assert.Equal("Restored stream", (await db.Ranks.SingleAsync()).RankName);
            Assert.Equal(4, gets); Assert.Equal(4, acks); Assert.Empty(await db.SyncQueue.ToListAsync());
        }
    }

    [Fact]
    public async Task ADownloadedFile_IsRetainedAndItsLostAckIsRetriedWithoutDownloadingAgain()
    {
        var manifestId = Guid.NewGuid(); var requestId = Guid.NewGuid(); var downloads = 0; var acks = 0;
        byte[] bytes = [1, 2, 3]; var hash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)).ToLowerInvariant();
        var files = new Dictionary<string, byte[]>(); var storage = new Mock<ISyncFileStorageService>();
        storage.Setup(file => file.Exists(It.IsAny<string>())).Returns((string path) => files.ContainsKey(path));
        storage.Setup(file => file.CreateRelativeStoragePath(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>())).Returns("download.bin");
        storage.Setup(file => file.WriteAllBytesAsync(It.IsAny<string>(), It.IsAny<byte[]>(), It.IsAny<CancellationToken>()))
            .Returns((string path, byte[] data, CancellationToken _) => { files[path] = data; return Task.CompletedTask; });
        storage.Setup(file => file.GetFileSize(It.IsAny<string>())).Returns((string path) => files[path].LongLength);
        storage.Setup(file => file.ComputeSha256HexAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns((string path, CancellationToken _) => Task.FromResult(Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(files[path])).ToLowerInvariant()));
        var (services, sync) = Build(true, request =>
        {
            var path = request.RequestUri!.AbsolutePath;
            if (path.EndsWith("file-requests")) return Task.FromResult(Response("[]"));
            if (path.EndsWith("file-request")) return Task.FromResult(Response(JsonSerializer.Serialize(new SyncFileTransferResultDto { Success = true, RequestId = requestId, ManifestId = manifestId })));
            if (path.EndsWith("file-download"))
            {
                downloads++;
                return Task.FromResult(Response(JsonSerializer.Serialize(new SyncFileContentDto { RequestId = requestId, ManifestId = manifestId, FileId = manifestId,
                    RequesterNodeId = "TEST-FILE", SupplierNodeId = "SHORE", TableName = "travel_document", RecordKey = "missing", FileRole = "attachment",
                    FileName = "test.bin", SizeBytes = bytes.Length, Sha256 = hash, Base64Content = Convert.ToBase64String(bytes) })));
            }
            if (path.EndsWith("file-ack")) return Task.FromResult(++acks == 1 ? new HttpResponseMessage(HttpStatusCode.ServiceUnavailable) :
                Response(JsonSerializer.Serialize(new SyncFileTransferResultDto { Success = true, RequestId = requestId, ManifestId = manifestId })));
            throw new InvalidOperationException("Unexpected file request " + path);
        }, overrides: new() { ["SyncSecurity:NodeId"] = "TEST-FILE" }, storage: storage.Object);
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>();
            db.SyncFileManifests.Add(new() { Id = manifestId, OwnerNodeId = "SHORE", ReceiverNodeId = "TEST-FILE", TableName = "travel_document", RecordKey = "missing",
                FileRole = "attachment", FileName = "test.bin", SizeBytes = bytes.Length, Sha256 = hash });
            db.SyncFileTransferRequests.Add(new() { Id = requestId, ManifestId = manifestId, RequesterNodeId = "TEST-FILE", SupplierNodeId = "SHORE" });
            await db.SaveChangesAsync(); await sync.ExecuteFileTransfersAsync(default); db.ChangeTracker.Clear();
            var pending = await db.SyncFileTransferRequests.SingleAsync(); Assert.Equal(SyncFileRequestStatus.Deferred, pending.Status);
            Assert.Equal(bytes, files["download.bin"]); pending.NextRetryAt = DateTime.UtcNow.AddMinutes(-1); await db.SaveChangesAsync();
            await sync.ExecuteFileTransfersAsync(default); db.ChangeTracker.Clear();
            Assert.Equal(SyncFileRequestStatus.Completed, (await db.SyncFileTransferRequests.SingleAsync()).Status);
            Assert.Equal(1, downloads); Assert.Equal(2, acks);
        }
    }

    private static string PostgresConnection()
    {
        var builder = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("PMS_TEST_CONNECTION_STRING"));
        if (builder.Database?.StartsWith("codex_pms_tests_", StringComparison.Ordinal) != true) throw new InvalidOperationException("An isolated database is required.");
        builder.Database += "_" + Guid.NewGuid().ToString("N")[..12];
        return builder.ConnectionString;
    }

    [MaritimeEdge.Tests.Inventory.PmsPostgresFact]
    public async Task MigrationBackfillsDistinctStableEventIds_AndReconciliationReachesRowsPast200()
    {
        var (services, sync) = Build(false, _ => throw new InvalidOperationException("Disabled"), PostgresConnection());
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); await db.Database.EnsureCreatedAsync(); db.SuppressSyncQueue = true;
            for (var i = 0; i < 250; i++) db.Ports.Add(new() { PortCode = "T" + i.ToString("D4"), PortName = "Test " + i });
            await db.SaveChangesAsync(); var keys = await db.Ports.OrderBy(p => p.Id).Select(p => p.Id.ToString()).ToListAsync();
            foreach (var key in keys.Take(200)) db.SyncQueue.Add(new() { TableName = "port", RecordKey = key, Payload = "{}" });
            await db.SaveChangesAsync(); db.ChangeTracker.Clear();
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE sync_queue DROP COLUMN event_id");
            var migrations = db.GetService<IMigrationsAssembly>();
            var migration = migrations.CreateMigration(migrations.Migrations["20261005130000_HardenSyncDelivery"], "Npgsql.EntityFrameworkCore.PostgreSQL");
            foreach (var command in db.GetService<IMigrationsSqlGenerator>().Generate(migration.UpOperations, db.Model)) await db.Database.ExecuteSqlRawAsync(command.CommandText);
            var ids = await db.SyncQueue.Select(q => q.EventId).ToListAsync(); Assert.Equal(200, ids.Distinct().Count()); Assert.DoesNotContain(Guid.Empty, ids);
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
            Assert.Equal(250, await db.SyncQueue.CountAsync(q => q.TableName == "port"));
            Assert.Equal(50, await db.SyncQueue.CountAsync(q => q.TableName == "port" && q.ActionType == SyncActionType.SNAPSHOT));
            await db.Database.EnsureDeletedAsync();
        }
    }

    private sealed class RejectOutbox : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data, InterceptionResult<int> result, CancellationToken token = default)
        {
            if (data.Context!.ChangeTracker.Entries<SyncQueue>().Any(e => e.State == EntityState.Added)) throw new InvalidOperationException("Injected outbox failure");
            return ValueTask.FromResult(result);
        }
    }

    [MaritimeEdge.Tests.Inventory.PmsPostgresFact]
    public async Task GeneratedBusinessKeys_AreRolledBackWhenTheDeferredQueueWriteFails()
    {
        await using var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>().UseNpgsql(PostgresConnection()).AddInterceptors(new RejectOutbox()).Options);
        await db.Database.EnsureCreatedAsync();
        db.Ports.Add(new() { PortCode = "ZZZZZ", PortName = "Rollback" });
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync()); db.ChangeTracker.Clear();
        Assert.False(await db.Ports.AnyAsync(c => c.PortCode == "ZZZZZ")); Assert.Empty(await db.SyncQueue.ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [Fact]
    public async Task DisablingShoreApi_DoesNotDiscardPendingEvents()
    {
        var (services, sync) = Build(false, _ => throw new InvalidOperationException("Disabled sync must not send"));
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); db.SyncQueue.Add(Queue()); await db.SaveChangesAsync();
            await sync.ExecuteSyncAsync(default);
            Assert.Null((await db.SyncQueue.SingleAsync()).SyncedAt);
        }
    }

    [Theory]
    [InlineData("{}")] [InlineData("not json")]
    [InlineData("{\"succeeded\":1,\"failed\":0,\"total\":1}")]
    public async Task MissingOrMalformedReceipt_DoesNotAcknowledgeAnEvent(string body)
    {
        var (services, sync) = Build(true, _ => Task.FromResult(Response(body)));
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); db.SyncQueue.Add(Queue()); await db.SaveChangesAsync();
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
            var pending = await db.SyncQueue.SingleAsync();
            Assert.Null(pending.SyncedAt); Assert.NotNull(pending.NextRetryAt);
        }
    }

    [Fact]
    public async Task TransportOutage_DoesNotExhaustDelivery_AndRetryKeepsItsEventId()
    {
        var events = new List<Guid>(); var requests = 0;
        var (services, sync) = Build(true, async request =>
        {
            using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
            var id = body.RootElement[0].GetProperty("eventId").GetGuid(); events.Add(id);
            if (++requests == 1) throw new HttpRequestException("Injected outage");
            return Response(JsonSerializer.Serialize(new { total = 1, succeeded = 1, failed = 0, acknowledgedEventIds = new[] { id } }));
        });
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); var item = Queue(); item.RetryCount = 99; item.MaxRetries = 5;
            db.SyncQueue.Add(item); await db.SaveChangesAsync();
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
            var pending = await db.SyncQueue.SingleAsync(); Assert.Null(pending.SyncedAt);
            pending.NextRetryAt = null; await db.SaveChangesAsync();
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
            Assert.NotNull((await db.SyncQueue.SingleAsync()).SyncedAt);
            Assert.Equal(2, events.Count); Assert.Equal(events[0], events[1]);
        }
    }

    [Fact]
    public async Task AReportRemainsQueuedUntilEveryRequiredReceiptIsConfirmed()
    {
        var calls = 0;
        var (services, sync) = Build(true, async request =>
        {
            var items = JsonSerializer.Deserialize<List<SyncQueueItemDto>>(await request.Content!.ReadAsStringAsync(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            var confirmed = ++calls == 1 ? items.Take(1).Select(item => item.EventId).ToList() : items.Select(item => item.EventId).ToList();
            return Response(JsonSerializer.Serialize(new { total = items.Count, succeeded = confirmed.Count, failed = items.Count - confirmed.Count, acknowledgedEventIds = confirmed }));
        });
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); var first = Queue("1"); var second = Queue("2");
            db.SyncQueue.AddRange(first, second);
            db.ReportTransmissionLogs.Add(new() { Status = "QUEUED", MaritimeReportId = Guid.NewGuid(), TransmissionDateTime = DateTime.UtcNow,
                SyncEventIdsJson = JsonSerializer.Serialize(new[] { first.EventId, second.EventId }) });
            await db.SaveChangesAsync(); await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
            Assert.Equal("QUEUED", (await db.ReportTransmissionLogs.SingleAsync()).Status);
            var pending = await db.SyncQueue.SingleAsync(item => item.SyncedAt == null); pending.NextRetryAt = DateTime.UtcNow.AddMinutes(-1); await db.SaveChangesAsync();
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
            Assert.Equal("SUCCESS", (await db.ReportTransmissionLogs.SingleAsync()).Status);
        }
    }

    [Fact]
    public async Task PartialReceipt_OnlyAcknowledgesTheConfirmedEvent()
    {
        Guid confirmed = default;
        var (services, sync) = Build(true, async request =>
        {
            using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
            confirmed = body.RootElement[0].GetProperty("eventId").GetGuid();
            return Response(JsonSerializer.Serialize(new { total = 2, succeeded = 1, failed = 1, acknowledgedEventIds = new[] { confirmed } }));
        });
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); db.SyncQueue.AddRange(Queue("1"), Queue("2")); await db.SaveChangesAsync();
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
            var items = await db.SyncQueue.ToListAsync();
            Assert.NotNull(items.Single(i => i.EventId == confirmed).SyncedAt);
            Assert.Null(items.Single(i => i.EventId != confirmed).SyncedAt);
        }
    }
}
