using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

public partial class SyncReliabilityTests
{
    [Fact]
    public async Task PmsSyncFence_ReconcilesLostReportQueueWithoutRewritingSignedSnapshot()
    {
        var (services, sync) = Build(true, _ => throw new InvalidOperationException("No PMS upload before receiver is ready"));
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>();
            const string snapshot = "{ \"schemaVersion\": 2, \"notes\": \"keep exact bytes\" }";
            var report = new MaritimeEdge.Models.PmsWorkOrderReport { WorkOrderId = Guid.NewGuid(),
                SnapshotJson = snapshot, ContentHash = "frozen-content-hash", Revision = 1, SubmitCommandId = Guid.NewGuid() };
            db.PmsWorkOrderReports.Add(report); await db.SaveChangesAsync();
            db.SyncQueue.RemoveRange(await db.SyncQueue.ToListAsync()); await db.SaveChangesAsync();
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
            var queued = await db.SyncQueue.SingleAsync(q => q.TableName == "pms_work_order_report");
            Assert.Null(queued.SyncedAt);
            Assert.Equal(snapshot, JsonDocument.Parse(queued.Payload).RootElement.GetProperty("SnapshotJson").GetString());
            Assert.Equal(snapshot, (await db.PmsWorkOrderReports.SingleAsync()).SnapshotJson);
            Assert.False((await db.PmsWorkOrderReports.SingleAsync()).IsSynced);
        }
    }

    [Fact]
    public async Task PmsSyncFence_ProtocolStampSurvivesUnrelatedUpdateAndDelete()
    {
        var (services, _) = Build(false, _ => throw new InvalidOperationException("Disabled"));
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>();
            var task = new MaritimeEdge.Models.MaintenanceTask { TaskId = "WO-STAMP", PmsProtocolVersion = 2 };
            db.MaintenanceTasks.Add(task); await db.SaveChangesAsync();
            task.Notes = "Changed without modifying protocol version"; await db.SaveChangesAsync();
            db.MaintenanceTasks.Remove(task); await db.SaveChangesAsync();
            var events = await db.SyncQueue.Where(q => q.RecordKey == task.Id.ToString()).ToListAsync();
            Assert.Equal(3, events.Count);
            Assert.All(events, e => Assert.True(PmsSyncProtocol.RequiresDedicatedReceiver(e.TableName, e.Payload)));
            var update = Assert.Single(events, e => e.ActionType == SyncActionType.UPDATE);
            Assert.Contains("Changed without modifying protocol version", update.Payload);
        }
    }

    [Fact]
    public async Task PmsSyncFence_OlderUnstampedDeltaIsHeldUsingSourceIdentity()
    {
        var (services, sync) = Build(true, _ => throw new InvalidOperationException("PMS must not leave Edge"));
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>();
            var task = new MaritimeEdge.Models.MaintenanceTask { TaskId = "WO-OLD-DELTA", PmsProtocolVersion = 2 };
            db.MaintenanceTasks.Add(task); await db.SaveChangesAsync();
            db.SyncQueue.RemoveRange(await db.SyncQueue.ToListAsync()); await db.SaveChangesAsync();
            var delta = new SyncQueue { TableName = "maintenance_task", RecordKey = task.Id.ToString(), Payload = "{\"Status\":\"COMPLETED\"}" };
            db.SyncQueue.Add(delta); await db.SaveChangesAsync();
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
            var held = await db.SyncQueue.SingleAsync(q => q.Id == delta.Id);
            Assert.Null(held.SyncedAt); Assert.Equal(delta.Payload, held.Payload);
            Assert.Contains("pms_protocol_upgrade_required", held.LastError!);
        }
    }

    [Theory]
    [InlineData("maintenance_task", "{\"PmsProtocolVersion\":2}", true)]
    [InlineData("maintenance_schedule", "{\"pmsProtocolVersion\":2}", true)]
    [InlineData("MAINTENANCE_TASKS", "{\"pms_protocol_version\":2}", true)]
    [InlineData("maintenance_schedules", "{\"PmsProtocolVersion\":3}", true)]
    [InlineData("maintenance_task", "{\"PmsProtocolVersion\":\"2\"}", true)]
    [InlineData("maintenance_task", "{\"PmsProtocolVersion\":1,\"pmsProtocolVersion\":2}", true)]
    [InlineData("maintenance_task", "not json", true)]
    [InlineData("maintenance_task", "[]", true)]
    [InlineData("pms_work_order_reports", "{}", true)]
    [InlineData("pms_work_order_material_postings", "{}", true)]
    [InlineData("maintenance_task", "{\"PmsProtocolVersion\":null}", false)]
    [InlineData("maintenance_schedule", "{\"PmsProtocolVersion\":1}", false)]
    [InlineData("maintenance_task", "{}", false)]
    [InlineData("rank", "{\"PmsProtocolVersion\":2}", false)]
    public void PmsSyncFence_DistinguishesLegacyFromDedicatedProtocol(string table, string payload, bool blocked)
        => Assert.Equal(blocked, PmsSyncProtocol.RequiresDedicatedReceiver(table, payload));

    [Fact]
    public async Task PmsSyncFence_MixedBatchKeepsNewEventsUnchangedAndStillDeliversOtherModules()
    {
        var sent = new List<SyncQueueItemDto>();
        var (services, sync) = Build(true, async request =>
        {
            var batch = JsonSerializer.Deserialize<List<SyncQueueItemDto>>(await request.Content!.ReadAsStringAsync(),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            sent.AddRange(batch);
            return Response(JsonSerializer.Serialize(new { total = batch.Count, succeeded = batch.Count, failed = 0,
                acknowledgedEventIds = batch.Select(i => i.EventId) }));
        });
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>();
            var pms = new SyncQueue { TableName = "maintenance_task", RecordKey = Guid.NewGuid().ToString(),
                Payload = "{\"PmsProtocolVersion\":2,\"JobSnapshot\":\"signed original\"}", Priority = SyncPriority.Critical };
            var report = new SyncQueue { TableName = "pms_work_order_reports", RecordKey = Guid.NewGuid().ToString(),
                Payload = "{\"SnapshotJson\":\"frozen report\"}", Priority = SyncPriority.Critical };
            var ordinary = Queue(); var original = pms.Payload; var eventId = pms.EventId;
            db.SyncQueue.AddRange(pms, report, ordinary); await db.SaveChangesAsync();
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
            Assert.Single(sent); Assert.Equal("engine_data", sent[0].TableName);
            var held = await db.SyncQueue.SingleAsync(q => q.Id == pms.Id);
            Assert.Null(held.SyncedAt); Assert.Equal(original, held.Payload); Assert.Equal(eventId, held.EventId);
            Assert.Contains("pms_protocol_upgrade_required", held.LastError!); Assert.NotNull(held.NextRetryAt);
            Assert.Null((await db.SyncQueue.SingleAsync(q => q.Id == report.Id)).SyncedAt);
            Assert.NotNull((await db.SyncQueue.SingleAsync(q => q.Id == ordinary.Id)).SyncedAt);
        }
    }

    [Fact]
    public async Task PmsSyncFence_PullDoesNotApplyOrAcknowledgeProtocolTwo()
    {
        var acknowledgements = 0;
        var (services, sync) = Build(true, request =>
        {
            if (request.Method == HttpMethod.Get)
                return Task.FromResult(Response(JsonSerializer.Serialize(new SyncPullResponse { Items =
                [new SyncQueueItemDto { OutboxId = 81, SyncVersion = 81, StreamId = Guid.NewGuid(),
                    TableName = "maintenance_schedule", RecordKey = Guid.NewGuid().ToString(), OriginNode = "SHORE",
                    Payload = "{\"PmsProtocolVersion\":2}" }] })));
            acknowledgements++; return Task.FromResult(Response("{}"));
        });
        using (services)
        {
            await sync.PullFromShoreAsync(default);
            var db = services.GetRequiredService<EdgeDbContext>();
            Assert.Empty(await db.MaintenanceSchedules.ToListAsync());
            Assert.Equal(0, acknowledgements);
            Assert.Empty(await db.SyncState.Where(s => s.Key.StartsWith("shore:")).ToListAsync());
        }
    }
}
