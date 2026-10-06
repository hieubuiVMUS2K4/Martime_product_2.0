using System.Security.Cryptography;
using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Npgsql;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

public sealed class ShorePostgresTheoryAttribute : TheoryAttribute
{
    public ShorePostgresTheoryAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SHORE_PMS_TEST_CONNECTION_STRING")))
            Skip = "Requires an isolated codex_pms_tests_* PostgreSQL database.";
    }
}

public partial class SyncReliabilityTests
{
    private static async Task<AppDbContext> Database(params IInterceptor[] interceptors)
    {
        var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("SHORE_PMS_TEST_CONNECTION_STRING"));
        if (!connection.Database!.StartsWith("codex_pms_tests_")) throw new InvalidOperationException("An isolated test database is required.");
        connection.Database += "_" + Guid.NewGuid().ToString("N")[..12];
        var context = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection.ConnectionString).AddInterceptors(interceptors).Options);
        await context.Database.EnsureCreatedAsync();
        return context;
    }

    private static SyncOutboxService Outbox(AppDbContext db) => new(db, NullLogger<SyncOutboxService>.Instance, Mock.Of<ISyncFileStorageService>());

    private static SyncInboxService Inbox(AppDbContext db) => new(db,
        new ConflictResolverService(NullLogger<ConflictResolverService>.Instance), NullLogger<SyncInboxService>.Instance,
        Mock.Of<ProductApi.Services.INotificationService>(), new ConfigurationBuilder().Build(),
        Mock.Of<ISyncFileStorageService>(), new ProductApi.Services.Background.ReportEvaluationQueue());

    private static async Task<Guid> BindNode(AppDbContext db, string node)
    {
        var vessel = new Vessel { Id = Guid.NewGuid(), IMO = Guid.NewGuid().ToString("N")[..7], Name = node, BuildDate = DateTime.UtcNow };
        db.Vessels.Add(vessel);
        db.SyncNodeTrackers.Add(new() { NodeId = node, VesselId = vessel.Id, ImoNumber = vessel.IMO, IsRegistered = true });
        await db.SaveChangesAsync();
        return vessel.Id;
    }

    private static SyncQueueItemDto Event(string node, Guid stream, Guid key, long sequence, string action, object payload) => new()
    {
        EventId = Guid.NewGuid(), StreamId = stream, TableName = "equipment_asset", RecordKey = key.ToString(),
        OriginNode = node, SyncVersion = sequence, ActionType = action, Timestamp = DateTime.UtcNow.AddSeconds(sequence),
        Payload = JsonSerializer.Serialize(payload)
    };

    [ShorePostgresFact]
    public async Task DeliveryMigration_UpgradesExistingOutboxWithoutDeletingPendingEvents()
    {
        await using var db = await Database(); var outbox = Outbox(db);
        await outbox.BroadcastAsync("rank", "1", SyncActionType.SNAPSHOT, new { Id = 1 });
        await db.Database.ExecuteSqlRawAsync("DROP TABLE sync_outbox_deliveries, sync_record_identities, sync_record_cursors, sync_stream_state");
        var migrations = db.GetService<IMigrationsAssembly>();
        var migration = migrations.CreateMigration(migrations.Migrations["20261005130000_HardenSyncDelivery"], "Npgsql.EntityFrameworkCore.PostgreSQL");
        foreach (var command in db.GetService<IMigrationsSqlGenerator>().Generate(migration.UpOperations, db.Model))
            await db.Database.ExecuteSqlRawAsync(command.CommandText);
        var pending = Assert.Single((await outbox.GetPendingItemsAsync("A", null, null, 50)).Items);
        Assert.NotEqual(Guid.Empty, pending.StreamId);
        await outbox.AcknowledgeDeliveryAsync("A", [pending.OutboxId]);
        Assert.Single((await outbox.GetPendingItemsAsync("B", null, null, 50)).Items);
        Assert.Empty(await db.SyncRecordIdentities.ToListAsync()); Assert.Empty(await db.SyncRecordCursors.ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task MissingDeltaFails_AndOldEventsCannotResurrectDeletedRows()
    {
        await using var db = await Database(); await BindNode(db, "A");
        var stream = Guid.NewGuid(); var key = Guid.NewGuid(); var inbox = Inbox(db);
        var missing = Event("A", stream, key, 1, "UPDATE", new { Notes = "partial" });
        var result = await inbox.ProcessBatchAsync([missing]);
        Assert.Equal(1, result.Failed); Assert.Empty(result.AcknowledgedEventIds);
        Assert.Contains("dependency_missing", Assert.Single(result.FailedItems).Error);
        var snapshot = Event("A", stream, key, 2, "SNAPSHOT", new { AssetCode = "A1", AssetName = "Pump", Category = "ENGINE", Notes = "old" });
        Assert.Equal(1, (await inbox.ProcessBatchAsync([snapshot])).Succeeded);
        var update = Event("A", stream, key, 3, "UPDATE", new { Notes = (string?)null, AssetName = "" });
        Assert.Equal(1, (await inbox.ProcessBatchAsync([update])).Succeeded);
        db.ChangeTracker.Clear();
        var stored = await db.EquipmentAssets.SingleAsync(a => a.Id == key);
        Assert.Null(stored.Notes); Assert.Equal("", stored.AssetName); Assert.Equal("ENGINE", stored.Category);
        var deletion = Event("A", stream, key, 4, "DELETE", new { });
        Assert.Equal(1, (await inbox.ProcessBatchAsync([deletion])).Succeeded);
        snapshot.EventId = Guid.NewGuid(); // An older distinct event is stale even without an event receipt.
        Assert.Equal(1, (await inbox.ProcessBatchAsync([snapshot])).Succeeded);
        Assert.False(await db.EquipmentAssets.AnyAsync(a => a.Id == key));
        Assert.True(await inbox.IsAlreadyProcessedAsync("equipment_asset", key.ToString(), 4, "A", deletion.EventId, stream));
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task VesselLocalKeyCollisions_AreMappedWithoutChangingAnotherVesselsData()
    {
        await using var db = await Database(); var a = await BindNode(db, "A"); var b = await BindNode(db, "B");
        var key = Guid.NewGuid(); var parent = Guid.NewGuid(); var inbox = Inbox(db);
        foreach (var node in new[] { "A", "B" })
        {
            var stream = Guid.NewGuid();
            var result = await inbox.ProcessBatchAsync([
                Event(node, stream, parent, 1, "SNAPSHOT", new { AssetCode = "P", AssetName = "Parent " + node, Category = "ENGINE" }),
                Event(node, stream, key, 2, "SNAPSHOT", new { AssetCode = "C", AssetName = "Child " + node, Category = "ENGINE", ParentId = parent })]);
            Assert.Equal(2, result.Succeeded); Assert.Empty(result.FailedItems);
        }
        db.ChangeTracker.Clear();
        var rows = await db.EquipmentAssets.ToListAsync(); Assert.Equal(4, rows.Count);
        foreach (var owner in new[] { a, b })
        {
            var children = Assert.Single(rows, r => r.VesselId == owner && r.AssetCode == "C");
            Assert.Equal(Assert.Single(rows, r => r.VesselId == owner && r.AssetCode == "P").Id, children.ParentId);
        }
        Assert.Equal(4, await db.SyncRecordIdentities.CountAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task NumericLocalKeys_AndTheirChildForeignKeys_AreMappedPerNode()
    {
        await using var db = await Database(); await BindNode(db, "A"); await BindNode(db, "B"); var inbox = Inbox(db);
        foreach (var node in new[] { "A", "B" })
        {
            var stream = Guid.NewGuid();
            SyncQueueItemDto Item(string table, string key, long sequence, object payload) => new()
            {
                EventId = Guid.NewGuid(), StreamId = stream, OriginNode = node, TableName = table, RecordKey = key,
                SyncVersion = sequence, ActionType = "SNAPSHOT", Timestamp = DateTime.UtcNow,
                Payload = JsonSerializer.Serialize(payload)
            };
            var result = await inbox.ProcessBatchAsync([
                Item("material_request", "7", 1, new { Id = 7, RequestCode = "MR-" + node, RequestDate = DateTime.UtcNow, Status = "DRAFT" }),
                Item("material_request_item", "9", 2, new { Id = 9, RequestId = 7, RequestCode = "MR-" + node, ItemName = "Pump " + node, QuantityRequested = 3, Unit = "PCS" })]);
            Assert.Empty(result.FailedItems); Assert.Equal(2, result.Succeeded);
        }
        db.ChangeTracker.Clear(); var parents = await db.MaterialRequests.ToListAsync(); var children = await db.MaterialRequestItems.ToListAsync();
        Assert.Equal(2, parents.Count); Assert.Equal(2, children.Count);
        Assert.NotEqual(parents[0].Id, parents[1].Id); Assert.NotEqual(children[0].Id, children[1].Id);
        foreach (var node in new[] { "A", "B" }) Assert.Equal(Assert.Single(parents, p => p.RequestCode == "MR-" + node).Id,
            Assert.Single(children, p => p.ItemName == "Pump " + node).RequestId);
        var parentB = Assert.Single(parents, parent => parent.RequestCode == "MR-B");
        var childB = Assert.Single(children, child => child.ItemName == "Pump B");
        var outbox = Outbox(db);
        await outbox.EnqueueAsync("B", "material_request_item", childB.Id.ToString(), SyncActionType.SNAPSHOT,
            new { Id = childB.Id, RequestId = parentB.Id, ItemName = childB.ItemName, QuantityApproved = 2 });
        var reply = Assert.Single((await outbox.GetPendingItemsAsync("B", null, null, 50)).Items);
        Assert.Equal("9", reply.RecordKey);
        using (var body = JsonDocument.Parse(reply.Payload))
        {
            Assert.Equal(9, body.RootElement.GetProperty("id").GetInt32());
            Assert.Equal(7, body.RootElement.GetProperty("requestId").GetInt32());
        }
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task UnprovisionedVesselRoutes_WaitForOneNode_AndUnknownOriginsDoNotCreateVessels()
    {
        await using var db = await Database(); var vessel = new Vessel { Id = Guid.NewGuid(), IMO = "7654321", Name = "Unbound", BuildDate = DateTime.UtcNow };
        db.Vessels.Add(vessel); await db.SaveChangesAsync(); var outbox = Outbox(db);
        await outbox.EnqueueAsync(vessel.IMO, "rank", "1", SyncActionType.SNAPSHOT, new { Id = 1 });
        Assert.Equal("vessel:" + vessel.Id, (await db.SyncOutbox.SingleAsync()).TargetNode);
        Assert.Empty((await outbox.GetPendingItemsAsync("UNRELATED", null, null, 50)).Items);
        db.SyncNodeTrackers.Add(new() { NodeId = "A", VesselId = vessel.Id, ImoNumber = vessel.IMO, IsRegistered = true }); await db.SaveChangesAsync();
        Assert.Single((await outbox.GetPendingItemsAsync("A", null, null, 50)).Items);
        db.ChangeTracker.Clear(); Assert.Equal("A", (await db.SyncOutbox.SingleAsync()).TargetNode);
        await Assert.ThrowsAsync<InvalidOperationException>(() => Inbox(db).ProcessBatchAsync([Event("UNKNOWN", Guid.NewGuid(), Guid.NewGuid(), 1, "SNAPSHOT", new { })]));
        Assert.Equal(1, await db.Vessels.CountAsync());
        // Legacy rows can lack IMO; two active VesselId bindings still require explicit correction.
        db.SyncNodeTrackers.Add(new() { NodeId = "B", VesselId = vessel.Id, IsRegistered = true });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task Broadcast_IsDeliveredIndependently_AndRepeatedAckIsSafe()
    {
        await using var db = await Database();
        var outbox = Outbox(db);
        await outbox.BroadcastAsync("rank", "1", SyncActionType.SNAPSHOT, new { Id = 1, RankCode = "CAPT" });
        var a = await outbox.GetPendingItemsAsync("A", null, null, 50);
        var b = await outbox.GetPendingItemsAsync("B", null, null, 50);
        Assert.Single(a.Items); Assert.Single(b.Items);
        await outbox.AcknowledgeDeliveryAsync("A", [a.Items[0].OutboxId]);
        await outbox.AcknowledgeDeliveryAsync("A", [a.Items[0].OutboxId]);
        Assert.Empty((await outbox.GetPendingItemsAsync("A", null, null, 50)).Items);
        Assert.Single((await outbox.GetPendingItemsAsync("B", null, null, 50)).Items);
        Assert.Single(await db.SyncOutboxDeliveries.ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task AckForAnOldSnapshot_CannotConsumeTheNewSnapshot()
    {
        await using var db = await Database();
        var outbox = Outbox(db);
        await outbox.EnqueueAsync("A", "rank", "1", SyncActionType.SNAPSHOT, new { Name = "V1" });
        var first = Assert.Single((await outbox.GetPendingItemsAsync("A", null, null, 50)).Items);
        await outbox.EnqueueAsync("A", "rank", "1", SyncActionType.SNAPSHOT, new { Name = "V2" });
        await outbox.AcknowledgeDeliveryAsync("A", [first.OutboxId]);
        var second = Assert.Single((await outbox.GetPendingItemsAsync("A", null, null, 50)).Items);
        Assert.NotEqual(first.OutboxId, second.OutboxId);
        Assert.Contains("V2", second.Payload);
        await db.Database.EnsureDeletedAsync();
    }

    private sealed class RejectOutbox : SaveChangesInterceptor
    {
        public override ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData data, InterceptionResult<int> result, CancellationToken token = default)
        {
            if (data.Context!.ChangeTracker.Entries<SyncOutbox>().Any(e => e.State == EntityState.Added))
                throw new InvalidOperationException("Injected outbox write failure");
            return ValueTask.FromResult(result);
        }
    }

    [ShorePostgresFact]
    public async Task BusinessChange_RollsBackWhenItsOutboxCannotBeWritten()
    {
        await using var db = await Database(new RejectOutbox());
        db.Countries.Add(new() { CountryCode = "ZZ", CountryName = "Test" });
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
        db.ChangeTracker.Clear();
        Assert.False(await db.Countries.AnyAsync(c => c.CountryCode == "ZZ"));
        Assert.False(await db.SyncOutbox.AnyAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [Fact]
    public void IdempotencyKeys_AreNamespacedByNode_AndStableAcrossRetries()
    {
        var eventId = Guid.NewGuid();
        var a = SyncInboxService.BuildIdempotencyKey("store_location", "1", 5, "A", eventId);
        Assert.Equal(a, SyncInboxService.BuildIdempotencyKey("store_location", "1", 5, "A", eventId));
        Assert.NotEqual(a, SyncInboxService.BuildIdempotencyKey("store_location", "1", 5, "B", eventId));
        Assert.NotEqual(SyncInboxService.BuildIdempotencyKey("store_location", "1", 5, "A", Guid.Empty),
            SyncInboxService.BuildIdempotencyKey("store_location", "1", 5, "B", Guid.Empty));
    }

    [ShorePostgresFact]
    public async Task NonceRemainsRejected_AfterChangingTheServiceInstance()
    {
        await using var db = await Database();
        var nonce = Guid.NewGuid().ToString("N");
        Assert.True(await new SyncNonceRegistryService(db, NullLogger<SyncNonceRegistryService>.Instance).RegisterNonceAsync(nonce, "A", DateTime.UtcNow));
        db.ChangeTracker.Clear();
        Assert.False(await new SyncNonceRegistryService(db, NullLogger<SyncNonceRegistryService>.Instance).RegisterNonceAsync(nonce, "A", DateTime.UtcNow));
        Assert.DoesNotContain(db.ChangeTracker.Entries(), e => e.State == EntityState.Added);
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task PullHonorsOfflineAndIridiumPriorities()
    {
        await using var db = await Database();
        var outbox = Outbox(db);
        await outbox.EnqueueAsync("A", "rank", "1", SyncActionType.SNAPSHOT, new { Id = 1 });
        await outbox.EnqueueAsync("A", "safety_alarm", "2", SyncActionType.SNAPSHOT, new { Id = 2 });
        Assert.Empty((await outbox.GetPendingItemsAsync("A", null, null, 50, NetworkType.None)).Items);
        Assert.Equal("safety_alarm", Assert.Single((await outbox.GetPendingItemsAsync("A", null, null, 50, NetworkType.Satellite_Iridium)).Items).TableName);
        Assert.Equal(2, (await outbox.GetPendingItemsAsync("A", null, null, 50, NetworkType.Satellite_LEO)).Items.Count);
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresTheory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public async Task ChunkUpload_ResumesWithoutDeletingCommittedChunks_AfterServiceRestart(bool delta, bool missingBase)
    {
        await using var db = await Database();
        var files = new Dictionary<string, byte[]>();
        var storage = new Mock<ISyncFileStorageService>();
        storage.Setup(s => s.CreateRelativeStagingPath(It.IsAny<Guid>(), It.IsAny<string>())).Returns((Guid id, string _) => "staging/" + id);
        storage.Setup(s => s.CreateRelativeStoragePath(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>())).Returns("final.bin");
        storage.Setup(s => s.Exists(It.IsAny<string>())).Returns((string path) => files.ContainsKey(path));
        storage.Setup(s => s.GetFileSize(It.IsAny<string>())).Returns((string path) => files[path].LongLength);
        storage.Setup(s => s.DeleteIfExistsAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns((string path, CancellationToken _) => { files.Remove(path); return Task.CompletedTask; });
        storage.Setup(s => s.WriteChunkAsync(It.IsAny<string>(), It.IsAny<long>(), It.IsAny<byte[]>(), It.IsAny<CancellationToken>())).Returns((string path, long offset, byte[] bytes, CancellationToken _) =>
        {
            var data = files.GetValueOrDefault(path) ?? [];
            Array.Resize(ref data, (int)Math.Max(data.Length, offset + bytes.Length));
            bytes.CopyTo(data, offset); files[path] = data; return Task.CompletedTask;
        });
        storage.Setup(s => s.ComputeSha256HexAsync(It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns((string path, CancellationToken _) => Task.FromResult(Hash(files[path])));
        storage.Setup(s => s.MoveAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns((string src, string dst, CancellationToken _) => { files[dst] = files[src]; files.Remove(src); return Task.CompletedTask; });
        storage.Setup(s => s.CopyAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>())).Returns((string src, string dst, CancellationToken _) => { files[dst] = files[src].ToArray(); return Task.CompletedTask; });
        var configuration = new ConfigurationBuilder().Build();
        SyncFileTransferService Service() => new(db, storage.Object, configuration, NullLogger<SyncFileTransferService>.Instance);
        var content = delta ? new byte[] { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 } : new byte[] { 1, 2, 3, 4, 5, 6, 7, 8 };
        var recordKey = "1";
        if (delta)
        {
            db.SuppressAutoOutbox = true;
            var crew = new Maritime.Shared.Models.Crew.CrewMember { Id = Guid.NewGuid(), CrewId = "TEST", FullName = "Test" };
            var document = new Maritime.Shared.Models.Documents.TravelDocument { Id = Guid.NewGuid(), CrewMemberId = crew.Id, DocumentNumber = "P1", DocumentType = "PASSPORT", FileUrl = "base.bin" };
            db.CrewMembers.Add(crew); db.TravelDocuments.Add(document); await db.SaveChangesAsync();
            recordKey = document.Id.ToString(); files["base.bin"] = [90, 91, 92, 93, 5, 6, 7, 8, 94, 95, 96, 97];
        }
        var request = new SyncFileTransferRequestDto { RequestId = Guid.NewGuid(), ManifestId = Guid.NewGuid(), RequesterNodeId = "SHORE", SupplierNodeId = "A", TableName = delta ? "travel_document" : "test_file", RecordKey = recordKey, FileRole = "attachment", FileName = "test.bin", SizeBytes = content.Length, Sha256 = Hash(content) };
        Assert.True((await Service().RegisterRequestAsync(request, default)).Success);
        var negotiate = new SyncFileChunkSessionDto { RequestId = request.RequestId, ManifestId = request.ManifestId, RequesterNodeId = "SHORE", SupplierNodeId = "A", TableName = request.TableName, RecordKey = request.RecordKey, FileRole = request.FileRole, FileName = request.FileName, SizeBytes = content.Length, Sha256 = Hash(content), ChunkSizeBytes = 4, TotalChunks = 2, IsDeltaSession = delta, RequestedChunkIndexes = delta ? [0, 2] : [], ReceiverBaseSha256 = delta ? Hash(files["base.bin"]) : null };
        if (missingBase) files.Remove("base.bin");
        var session = await Service().RegisterUploadSessionAsync(negotiate, default);
        Assert.Equal(delta && !missingBase, session.IsDeltaSession);
        SyncFileChunkDto Chunk(int index, string token)
        {
            var fileIndex = session.IsDeltaSession ? session.RequestedChunkIndexes[index] : index;
            var bytes = content.Skip(fileIndex * 4).Take(4).ToArray();
            return new() { RequestId = request.RequestId, ManifestId = request.ManifestId, RequesterNodeId = "SHORE", SupplierNodeId = "A", TotalChunks = session.TotalChunks, ChunkSizeBytes = 4, OffsetBytes = fileIndex * 4, SessionId = session.SessionId, ResumeToken = token, ChunkIndex = index, FileChunkIndex = fileIndex, Base64Content = Convert.ToBase64String(bytes), ChunkSha256 = Hash(bytes), IsLastChunk = index == session.TotalChunks - 1 };
        }
        var foreignChunk = Chunk(0, session.ResumeToken); foreignChunk.SupplierNodeId = "B";
        await Assert.ThrowsAsync<InvalidOperationException>(() => Service().AcceptUploadedChunkAsync(foreignChunk, default));
        var foreignAck = new SyncFileTransferAckDto { RequestId = request.RequestId, ManifestId = request.ManifestId, RequesterNodeId = "SHORE", SupplierNodeId = "B" };
        await Assert.ThrowsAsync<InvalidOperationException>(() => Service().AcknowledgeReceiptAsync(foreignAck, default));
        Assert.Equal(SyncFileRequestStatus.Pending, (await db.SyncFileTransferRequests.SingleAsync()).Status);
        Assert.True((await Service().AcceptUploadedChunkAsync(Chunk(0, session.ResumeToken), default)).Success);
        db.ChangeTracker.Clear();
        var resumed = await Service().RegisterUploadSessionAsync(negotiate, default);
        Assert.Equal(1, resumed.NextChunkIndex);
        Assert.Equal(content.Take(4), files["staging/" + session.SessionId].Take(4));
        if (session.IsDeltaSession) Assert.Equal(content.Length, files["staging/" + session.SessionId].Length);
        for (var index = 1; index < resumed.TotalChunks; index++)
        {
            var completed = await Service().AcceptUploadedChunkAsync(Chunk(index, resumed.ResumeToken), default);
            Assert.True(completed.Success, completed.Message);
        }
        Assert.Equal(content, files["final.bin"]);
        Assert.True((await Service().AcceptUploadedChunkAsync(Chunk(resumed.TotalChunks - 1, resumed.ResumeToken), default)).Success);
        await Service().RegisterRequestAsync(request, default);
        Assert.Equal(SyncFileRequestStatus.Completed, (await db.SyncFileTransferRequests.SingleAsync()).Status);
        await db.Database.EnsureDeletedAsync();
    }

    [ShorePostgresFact]
    public async Task ShoreFileManifests_AreScopedToTheReceiver_AndCannotUseAClientSuppliedSourcePath()
    {
        await using var db = await Database();
        var storage = new Mock<ISyncFileStorageService>(); var hash = Hash([1, 2, 3]);
        storage.Setup(files => files.Exists("source.pdf")).Returns(true);
        storage.Setup(files => files.ResolveLocalPath("source.pdf")).Returns(Path.Combine(Path.GetTempPath(), "source.pdf"));
        storage.Setup(files => files.ComputeSha256HexAsync("source.pdf", It.IsAny<CancellationToken>())).ReturnsAsync(hash);
        storage.Setup(files => files.GetFileSize("source.pdf")).Returns(3);
        var outbox = new SyncOutboxService(db, NullLogger<SyncOutboxService>.Instance, storage.Object);
        await outbox.BroadcastAsync("travel_document", Guid.NewGuid().ToString(), SyncActionType.SNAPSHOT, new { FileUrl = "source.pdf" });
        var a = Assert.Single(Assert.Single((await outbox.GetPendingItemsAsync("A", null, null, 50)).Items).FileRefs);
        var b = Assert.Single(Assert.Single((await outbox.GetPendingItemsAsync("B", null, null, 50)).Items).FileRefs);
        Assert.NotEqual(a.FileId, b.FileId);
        var manifest = await db.SyncFileManifests.SingleAsync(file => file.Id == a.FileId);
        var service = new SyncFileTransferService(db, storage.Object, new ConfigurationBuilder().Build(), NullLogger<SyncFileTransferService>.Instance);
        var request = new SyncFileTransferRequestDto { RequestId = Guid.NewGuid(), ManifestId = a.FileId, RequesterNodeId = "A", SupplierNodeId = "SHORE",
            TableName = manifest.TableName, RecordKey = manifest.RecordKey, FileRole = manifest.FileRole,
            FileName = "source.pdf", SourcePath = "/etc/passwd", Sha256 = hash, SizeBytes = 3 };
        Assert.True((await service.RegisterRequestAsync(request, default)).Success);
        Assert.Equal("source.pdf", (await db.SyncFileManifests.SingleAsync(file => file.Id == a.FileId)).SourcePath);
        request.ManifestId = b.FileId;
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.RegisterRequestAsync(request, default));
        Assert.Equal("B", (await db.SyncFileManifests.SingleAsync(file => file.Id == b.FileId)).ReceiverNodeId);
        request.ManifestId = Guid.NewGuid();
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.RegisterRequestAsync(request, default));
        await db.Database.EnsureDeletedAsync();
    }

    private static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
}
