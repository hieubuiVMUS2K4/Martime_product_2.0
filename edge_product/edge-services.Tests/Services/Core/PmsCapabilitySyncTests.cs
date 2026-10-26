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
    public async Task PmsCapabilitySync_RenamedMasterRankQueuesNewSnapshotWithoutRewritingOriginalEvent()
    {
        var epoch = Guid.NewGuid(); var stream = Guid.NewGuid(); var codes = new List<string>();
        var (services, sync) = Build(true, async request =>
        {
            if (request.Method == HttpMethod.Get) return Response(JsonSerializer.Serialize(new { protocolVersion = 2, datasetId = epoch, streamId = stream }));
            var batch = JsonSerializer.Deserialize<List<SyncQueueItemDto>>(await request.Content!.ReadAsStringAsync(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            var item = Assert.Single(batch); var code = JsonDocument.Parse(item.Payload).RootElement.GetProperty("ResponsibleRankCode").GetString()!; codes.Add(code);
            return Response(JsonSerializer.Serialize(new { total = 1, succeeded = code == "NEW" ? 1 : 0, failed = code == "NEW" ? 0 : 1,
                acknowledgedEventIds = code == "NEW" ? new[] { item.EventId } : Array.Empty<Guid>(),
                failedItems = code == "NEW" ? Array.Empty<object>() : new object[] { new { item.EventId, error = "dependency_missing: rank" } }, pmsSyncVersion = 2 }));
        });
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>();
            db.SyncState.AddRange(new() { Key = "pms-dataset-id", Value = epoch.ToString(), UpdatedAt = DateTime.UtcNow },
                new() { Key = "pms-cutover-state", Value = "ACTIVE", UpdatedAt = DateTime.UtcNow },
                new() { Key = "sync-stream-id", Value = stream.ToString(), UpdatedAt = DateTime.UtcNow }); await db.SaveChangesAsync();
            var rank = new Maritime.Shared.Models.Crew.Rank { RankCode = "OLD", RankName = "Officer" }; db.Ranks.Add(rank); await db.SaveChangesAsync();
            db.MaintenanceSchedules.Add(new() { ScheduleCode = "RANK-RENAME", ScheduleName = "Inspect", PmsProtocolVersion = 2, ResponsibleRankId = rank.Id }); await db.SaveChangesAsync();
            var original = await db.SyncQueue.SingleAsync(q => q.TableName == "maintenance_schedule"); var payload = original.Payload; var eventId = original.EventId;
            rank.RankCode = "NEW"; await db.SaveChangesAsync(); await sync.ExecuteSyncAsync(default); await sync.ExecuteSyncAsync(default);
            db.ChangeTracker.Clear(); Assert.Equal(new[] { "OLD", "NEW" }, codes);
            var events = await db.SyncQueue.Where(q => q.TableName == "maintenance_schedule").OrderBy(q => q.Id).ToListAsync();
            Assert.Equal(2, events.Count); Assert.Equal(payload, events[0].Payload); Assert.Equal(eventId, events[0].EventId);
            Assert.NotEqual(eventId, events[1].EventId); Assert.NotNull(events[1].SyncedAt);
        }
    }
    [Fact]
    public async Task PmsCapabilitySync_JobCapturesEffectiveChecklistAtomicallyAndAcknowledgesItWithParent()
    {
        var epoch = Guid.NewGuid(); var stream = Guid.NewGuid();
        var (services, sync) = Build(true, async request =>
        {
            if (request.Method == HttpMethod.Get) return Response(JsonSerializer.Serialize(new { protocolVersion = 2, datasetId = epoch, streamId = stream }));
            var batch = JsonSerializer.Deserialize<List<SyncQueueItemDto>>(await request.Content!.ReadAsStringAsync(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            return Response(JsonSerializer.Serialize(new { total = batch.Count, succeeded = batch.Count, failed = 0,
                acknowledgedEventIds = batch.Select(i => i.EventId), pmsSyncVersion = 2 }));
        });
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>();
            db.SyncState.AddRange(new() { Key = "pms-dataset-id", Value = epoch.ToString(), UpdatedAt = DateTime.UtcNow },
                new() { Key = "pms-cutover-state", Value = "ACTIVE", UpdatedAt = DateTime.UtcNow },
                new() { Key = "sync-stream-id", Value = stream.ToString(), UpdatedAt = DateTime.UtcNow }); await db.SaveChangesAsync();
            var job = new MaritimeEdge.Models.MaintenanceSchedule { ScheduleCode = "AGGREGATE", ScheduleName = "Inspect", PmsProtocolVersion = 2 };
            var first = new MaritimeEdge.Models.ScheduleChecklistTemplate { ScheduleId = job.Id, SequenceOrder = 1, CheckpointDescription = "First" };
            db.AddRange(job, first); await db.SaveChangesAsync();
            Assert.DoesNotContain(await db.SyncQueue.ToListAsync(), q => q.TableName == "schedule_checklist_template");
            var create = await db.SyncQueue.SingleAsync(q => q.TableName == "maintenance_schedule");
            Assert.Equal("First", JsonDocument.Parse(create.Payload).RootElement.GetProperty("PmsChecklistTemplates")[0].GetProperty("CheckpointDescription").GetString());
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear(); Assert.True((await db.ScheduleChecklistTemplates.SingleAsync()).IsSynced);
            job = await db.MaintenanceSchedules.SingleAsync(); first = await db.ScheduleChecklistTemplates.SingleAsync();
            db.ScheduleChecklistTemplates.Remove(first); job.ScheduleName = "Updated"; job.UpdatedAt = DateTime.UtcNow;
            db.ScheduleChecklistTemplates.Add(new() { ScheduleId = job.Id, SequenceOrder = 1, CheckpointDescription = "Replacement" }); await db.SaveChangesAsync();
            var update = await db.SyncQueue.OrderByDescending(q => q.Id).FirstAsync(q => q.TableName == "maintenance_schedule");
            var rows = JsonDocument.Parse(update.Payload).RootElement.GetProperty("PmsChecklistTemplates");
            Assert.Equal(1, rows.GetArrayLength()); Assert.Equal("Replacement", rows[0].GetProperty("CheckpointDescription").GetString());
        }
    }

    [MaritimeEdge.Tests.Inventory.PmsPostgresFact]
    public async Task PmsCapabilitySync_NewestFullJobDefinitionArrivesBeforeItsObsoletePendingReferences()
    {
        var epoch = Guid.NewGuid(); var stream = Guid.NewGuid(); var sent = new List<string>();
        var (services, sync) = Build(true, async request =>
        {
            if (request.Method == HttpMethod.Get) return Response(JsonSerializer.Serialize(new { protocolVersion = 2, datasetId = epoch, streamId = stream }));
            var batch = JsonSerializer.Deserialize<List<SyncQueueItemDto>>(await request.Content!.ReadAsStringAsync(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            sent.AddRange(batch.Where(i => i.TableName == "maintenance_schedule").Select(i => JsonDocument.Parse(i.Payload).RootElement.GetProperty("ScheduleName").GetString()!));
            return Response(JsonSerializer.Serialize(new { total = batch.Count, succeeded = batch.Count, failed = 0,
                acknowledgedEventIds = batch.Select(i => i.EventId), pmsSyncVersion = 2 }));
        }, PostgresConnection());
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>();
            await db.Database.EnsureCreatedAsync();
            try
            {
                db.SyncState.AddRange(new() { Key = "pms-dataset-id", Value = epoch.ToString(), UpdatedAt = DateTime.UtcNow },
                    new() { Key = "pms-cutover-state", Value = "ACTIVE", UpdatedAt = DateTime.UtcNow },
                    new() { Key = "sync-stream-id", Value = stream.ToString(), UpdatedAt = DateTime.UtcNow }); await db.SaveChangesAsync();
                var job = new MaritimeEdge.Models.MaintenanceSchedule { PmsProtocolVersion = 2, ScheduleCode = "LATEST-FIRST", ScheduleName = "Original" };
                db.MaintenanceSchedules.Add(job); await db.SaveChangesAsync();
                job.ScheduleName = "Correction"; await db.SaveChangesAsync(); job.ScheduleName = "Latest"; await db.SaveChangesAsync();
                await sync.ExecuteSyncAsync(default); await sync.ExecuteSyncAsync(default); await sync.ExecuteSyncAsync(default);
                Assert.Equal(new[] { "Latest", "Correction", "Original" }, sent);
                db.ChangeTracker.Clear();
                Assert.All(await db.SyncQueue.Where(q => q.TableName == "maintenance_schedule").ToListAsync(), q => Assert.NotNull(q.SyncedAt));
            }
            finally { await db.Database.EnsureDeletedAsync(); }
        }
    }
    [Theory]
    [InlineData(2, true, 2, true)]
    [InlineData(1, true, 2, false)]
    [InlineData(2, false, 2, false)]
    [InlineData(2, true, 0, false)]
    public async Task PmsCapabilitySync_RequiresMatchingNegotiationAndPersistenceReceipt(int peerProtocol, bool matchingDataset, int receiptVersion, bool delivered)
    {
        var dataset = Guid.NewGuid(); var stream = Guid.NewGuid(); var posts = 0; var gets = 0;
        var payload = JsonSerializer.Serialize(new { PmsDatasetId = dataset, PmsProtocolVersion = 2,
            JobSnapshot = "{ \"source\":\"keep exact text /uploads/file.png\" }" });
        var (services, sync) = Build(true, async request =>
        {
            if (request.Method == HttpMethod.Get)
            {
                gets++; Assert.EndsWith("/api/sync/pms-capabilities", request.RequestUri!.AbsolutePath);
                return Response(JsonSerializer.Serialize(new { protocolVersion = peerProtocol, datasetId = matchingDataset ? dataset : Guid.NewGuid(), streamId = stream }));
            }
            posts++;
            var batch = JsonSerializer.Deserialize<List<SyncQueueItemDto>>(await request.Content!.ReadAsStringAsync(),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            Assert.Equal(payload, Assert.Single(batch).Payload);
            return Response(JsonSerializer.Serialize(new { total = batch.Count, succeeded = batch.Count, failed = 0,
                acknowledgedEventIds = batch.Select(i => i.EventId), pmsSyncVersion = receiptVersion }));
        });
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>();
            db.SyncState.Add(new() { Key = "sync-stream-id", Value = stream.ToString(), UpdatedAt = DateTime.UtcNow });
            var item = new SyncQueue { TableName = "maintenance_task", RecordKey = Guid.NewGuid().ToString(), Payload = payload, Priority = SyncPriority.Critical };
            db.SyncQueue.Add(item); await db.SaveChangesAsync();
            await sync.ExecuteSyncAsync(default); db.ChangeTracker.Clear();
            var stored = await db.SyncQueue.SingleAsync(); Assert.Equal(1, gets);
            Assert.Equal(peerProtocol == 2 && matchingDataset ? 1 : 0, posts);
            Assert.Equal(delivered, stored.SyncedAt.HasValue); Assert.Equal(payload, stored.Payload);
        }
    }

    [Fact]
    public async Task PmsCapabilitySync_StampsDatasetAtCaptureAndNeverRelabelsQueuedEvents()
    {
        var (services, _) = Build(false, _ => throw new InvalidOperationException("Disabled"));
        using (services)
        {
            var db = services.GetRequiredService<EdgeDbContext>(); var first = Guid.NewGuid(); var second = Guid.NewGuid();
            var epoch = new SyncState { Key = "pms-dataset-id", Value = first.ToString(), UpdatedAt = DateTime.UtcNow };
            db.SyncState.Add(epoch); await db.SaveChangesAsync();
            db.SyncState.Add(new() { Key = "pms-cutover-state", Value = "ACTIVE", UpdatedAt = DateTime.UtcNow }); await db.SaveChangesAsync();
            var task = new MaritimeEdge.Models.MaintenanceTask { TaskId = "WO-EPOCH", PmsProtocolVersion = 2 };
            db.MaintenanceTasks.Add(task); await db.SaveChangesAsync();
            var captured = await db.SyncQueue.SingleAsync(q => q.TableName == "maintenance_task"); var original = captured.Payload;
            epoch.Value = second.ToString(); await db.SaveChangesAsync();
            Assert.Equal(first, JsonDocument.Parse(captured.Payload).RootElement.GetProperty("PmsDatasetId").GetGuid());
            Assert.Equal(original, (await db.SyncQueue.SingleAsync(q => q.Id == captured.Id)).Payload);
        }
    }
}
