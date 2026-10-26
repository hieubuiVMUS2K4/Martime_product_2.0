using System.Text.Json;
using System.Text.Json.Nodes;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using ProductApi.Models;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

public partial class SyncReliabilityTests
{
    [ShorePostgresFact]
    public async Task PmsMirror_MigrationUpDownPreservesFoundationAndCannotRemoveInstalledFence()
    {
        await using var db = await Database();
        try
        {
            await db.Database.ExecuteSqlRawAsync("DROP TABLE pms_sync_datasets, pms_sync_mirror_records; ALTER TABLE pms_work_order_reports DROP COLUMN vessel_id; ALTER TABLE pms_work_order_material_postings DROP COLUMN vessel_id");
            var assembly = db.GetService<IMigrationsAssembly>();
            var migration = assembly.CreateMigration(assembly.Migrations["20261026110000_AddPmsSyncDatasetFence"], "Npgsql.EntityFrameworkCore.PostgreSQL");
            async Task Apply(IReadOnlyList<Microsoft.EntityFrameworkCore.Migrations.Operations.MigrationOperation> operations)
            {
                foreach (var command in db.GetService<IMigrationsSqlGenerator>().Generate(operations, db.Model)) await db.Database.ExecuteSqlRawAsync(command.CommandText);
            }
            await Apply(migration.UpOperations); await Apply(migration.DownOperations); await Apply(migration.UpOperations);
            db.PmsSyncDatasets.Add(new() { OriginNode = "FENCE-INSTALLED", VesselId = Guid.NewGuid(), DatasetId = Guid.NewGuid(), StreamId = Guid.NewGuid() });
            await db.SaveChangesAsync();
            var error = await Assert.ThrowsAsync<Npgsql.PostgresException>(() => Apply(migration.DownOperations));
            Assert.Contains("cannot be removed", error.Message);
            Assert.Single(await db.PmsSyncDatasets.ToListAsync()); Assert.Empty(await db.PmsWorkOrderReports.ToListAsync());
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }
    [ShorePostgresFact]
    public async Task PmsMirror_ApprovedReportRequiresSignedEvidenceKeepsDecisionAndNeverDeductsShoreStock()
    {
        await using var db = await Database();
        try
        {
            const string node = "PMS-SIGNED"; var vessel = await BindNode(db, node); var dataset = Guid.NewGuid(); var stream = Guid.NewGuid();
            db.PmsSyncDatasets.Add(new() { OriginNode = node, VesselId = vessel, DatasetId = dataset, StreamId = stream, IsActive = true });
            var asset = new EquipmentAsset { AssetCode = "SIGNED-PUMP", AssetName = "Pump", VesselId = vessel };
            db.EquipmentAssets.Add(asset); await db.SaveChangesAsync();
            var inbox = PmsInbox(db); var orderId = Guid.NewGuid(); var reportId = Guid.NewGuid();
            var time = new DateTime(2026, 10, 26, 0, 0, 0, DateTimeKind.Utc); var materialId = Guid.NewGuid();
            var order = PmsEvent(node, dataset, stream, "maintenance_task", orderId, 1,
                new MaintenanceTask { TaskId = "WO-SIGNED", EquipmentAssetId = asset.Id, Status = "PENDING_APPROVAL", ReportRevision = 1, WorkflowVersion = 3 });
            Assert.Equal(1, (await inbox.ProcessBatchAsync([order])).Succeeded);
            var snapshot = ApprovalSnapshot.Canonicalize(new { SchemaVersion = 2, WorkOrderId = orderId, JobId = (Guid?)null,
                SubmittedAt = time, SubmittedByUserId = 5, SubmittedByCrewId = "PIC", DurationMinutes = 60,
                DueAt = (DateTime?)null, DueHours = (double?)null, RunningHours = (double?)null,
                Materials = new[] { new { MaterialItemId = materialId, Code = "SEAL", Name = "Seal", Unit = "PCS", Quantity = 2m } } });
            var report = new PmsWorkOrderReport { WorkOrderId = orderId, Revision = 1, SubmitCommandId = Guid.NewGuid(), SubmittedAt = time,
                SubmittedByUserId = 5, SubmittedByCrewId = "PIC", DurationMinutes = 60, SnapshotJson = snapshot,
                ContentHash = ApprovalSnapshot.Hash(snapshot), CreatedAt = time };
            Assert.Equal(1, (await inbox.ProcessBatchAsync([PmsEvent(node, dataset, stream, "pms_work_order_report", reportId, 2, report)])).Succeeded);
            var document = new ApprovalDocument { Module = "pms", RecordKey = orderId.ToString(), OriginNode = node };
            var signedText = ApprovalSnapshot.Canonicalize(new { SchemaVersion = 2, Id = orderId, WorkflowVersion = 3, Revision = 1,
                report.ContentHash, SubmittedReport = snapshot, NodeId = node });
            var revision = new ApprovalRevision { DocumentId = document.Id, OriginNode = node, Revision = 1, SnapshotJson = signedText, ContentHash = ApprovalSnapshot.Hash(signedText) };
            var action = new ApprovalAction { DocumentId = document.Id, RevisionId = revision.Id, OriginNode = node, ActorUserId = 8,
                ActorUsername = "master", CrewId = "MASTER", Action = "approve", ContentHash = revision.ContentHash };
            report.Decision = "APPROVED"; report.DecidedAt = time; report.DecidedByUserId = 8; report.DecidedByCrewId = "MASTER";
            report.ApprovalEvidenceJson = JsonSerializer.Serialize(new { evidence = new { ActionId = action.Id, RevisionId = revision.Id, ContentHash = revision.ContentHash } });
            var approval = PmsEvent(node, dataset, stream, "pms_work_order_report", reportId, 3, report);
            Assert.Equal(1, (await inbox.ProcessBatchAsync([approval])).Failed);
            SyncQueueItemDto Evidence(string table, Guid id, long sequence, object payload) => new() { TableName = table, RecordKey = id.ToString(), OriginNode = node,
                StreamId = stream, SyncVersion = sequence, EventId = Guid.NewGuid(), ActionType = "SNAPSHOT", Payload = JsonSerializer.Serialize(payload) };
            var accepted = await inbox.ProcessBatchAsync([approval, Evidence("approval_document", document.Id, 4, document),
                Evidence("approval_revision", revision.Id, 5, revision), Evidence("approval_action", action.Id, 6, action)]);
            Assert.True(accepted.Failed == 0, string.Join("; ", accepted.FailedItems.Select(e => e.Error)));
            Assert.Equal(4, accepted.Succeeded);
            Assert.Equal(1, (await inbox.ProcessBatchAsync([approval])).Succeeded);
            db.ChangeTracker.Clear(); var stored = await db.PmsWorkOrderReports.SingleAsync();
            Assert.Equal("APPROVED", stored.Decision); Assert.Equal(snapshot, stored.SnapshotJson); Assert.Equal(report.ApprovalEvidenceJson, stored.ApprovalEvidenceJson);
            var category = new MaterialCategory { CategoryCode = "PMS-SPARE", Name = "Spares" };
            db.MaterialCategories.Add(category); await db.SaveChangesAsync();
            db.MaterialItems.Add(new() { ItemCode = "SEAL", Name = "Seal", CategoryId = category.Id }); await db.SaveChangesAsync();
            var material = new MaterialItemShip { Id = materialId, ShipItemCode = "SEAL", MaterialItemCode = "SEAL", CategoryId = category.Id, VesselId = vessel };
            var location = new StoreLocation { LocationCode = "STORE", Name = "Store", VesselId = vessel };
            db.AddRange(material, location); await db.SaveChangesAsync();
            db.InventoryStocks.Add(new() { MaterialItemId = material.Id, StoreLocationId = location.Id, Quantity = 20, VesselId = vessel }); await db.SaveChangesAsync();
            var posting = PmsEvent(node, dataset, stream, "pms_work_order_material_posting", Guid.NewGuid(), 9,
                new PmsWorkOrderMaterialPosting { WorkOrderId = orderId, ReportId = reportId, MaterialItemId = material.Id, Quantity = 2, StockSnapshotJson = "{\"sourceBalance\":18}" });
            Assert.Equal(1, (await inbox.ProcessBatchAsync([posting])).Succeeded);
            Assert.Equal(1, (await inbox.ProcessBatchAsync([posting])).Succeeded);
            var changedPosting = JsonNode.Parse(posting.Payload)!.AsObject(); changedPosting["Quantity"] = 3;
            var badPosting = new SyncQueueItemDto { OriginNode = node, StreamId = stream, RecordKey = posting.RecordKey,
                TableName = posting.TableName, EventId = Guid.NewGuid(), SyncVersion = 12, ActionType = "SNAPSHOT", Payload = changedPosting.ToJsonString() };
            Assert.Equal(1, (await inbox.ProcessBatchAsync([badPosting])).Failed);
            Assert.Single(await db.PmsWorkOrderMaterialPostings.ToListAsync());
            Assert.Equal(20m, (await db.InventoryStocks.SingleAsync()).Quantity);
            var finished = new MaintenanceTask { TaskId = "WO-SIGNED", EquipmentAssetId = asset.Id, Status = "COMPLETED", ReportRevision = 1, WorkflowVersion = 4 };
            Assert.Equal(1, (await inbox.ProcessBatchAsync([PmsEvent(node, dataset, stream, "maintenance_task", orderId, 10, finished)])).Succeeded);
            finished.Status = "ASSIGNED"; finished.WorkflowVersion = 5;
            Assert.Equal(1, (await inbox.ProcessBatchAsync([PmsEvent(node, dataset, stream, "maintenance_task", orderId, 11, finished)])).Failed);
            db.ChangeTracker.Clear(); Assert.Equal("COMPLETED", (await db.MaintenanceTasks.SingleAsync()).Status);
            report.Decision = null; report.DecidedAt = null; report.DecidedByUserId = null; report.DecidedByCrewId = null; report.ApprovalEvidenceJson = null;
            Assert.Equal(1, (await inbox.ProcessBatchAsync([PmsEvent(node, dataset, stream, "pms_work_order_report", reportId, 7, report)])).Succeeded);
            db.ChangeTracker.Clear(); Assert.Equal("APPROVED", (await db.PmsWorkOrderReports.SingleAsync()).Decision);
            report.DurationMinutes = 999;
            Assert.Equal(1, (await inbox.ProcessBatchAsync([PmsEvent(node, dataset, stream, "pms_work_order_report", reportId, 8, report)])).Failed);
            Assert.Equal(60, (await db.PmsWorkOrderReports.SingleAsync()).DurationMinutes);
            Assert.Equal(20m, (await db.InventoryStocks.SingleAsync()).Quantity);
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }
    private static SyncInboxService PmsInbox(ProductApi.Data.AppDbContext db) => new(db,
        new ConflictResolverService(NullLogger<ConflictResolverService>.Instance), NullLogger<SyncInboxService>.Instance,
        Mock.Of<ProductApi.Services.INotificationService>(), new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        { ["Pms:ReworkSyncEnabled"] = "true" }).Build(), Mock.Of<ISyncFileStorageService>(), new ProductApi.Services.Background.ReportEvaluationQueue());

    private static SyncQueueItemDto PmsEvent(string node, Guid dataset, Guid stream, string table, Guid id, long sequence, object data)
    {
        var json = JsonSerializer.SerializeToNode(data)!.AsObject();
        json["PmsDatasetId"] = dataset; json["OriginNode"] = node; json["PmsProtocolVersion"] = 2; json["Id"] = id;
        if (table == "maintenance_schedule") json["PmsChecklistTemplates"] = JsonSerializer.SerializeToNode(new[] { new { Id = Guid.Parse("30000000-0000-0000-0000-000000000001"), SequenceOrder = 1, CheckpointDescription = "Inspect seal", RequiresReading = true, Unit = "bar", CreatedAt = new DateTime(2026, 10, 26, 0, 0, 0, DateTimeKind.Utc) } });
        return new() { OriginNode = node, StreamId = stream, EventId = Guid.NewGuid(), SyncVersion = sequence,
            ActionType = "SNAPSHOT", TableName = table, RecordKey = id.ToString(), Payload = json.ToJsonString() };
    }

    [ShorePostgresFact]
    public async Task PmsMirror_RemapsTwoVesselsPreservesReportAndRejectsStaleDatasetEvenForDuplicateReceipt()
    {
        await using var db = await Database();
        try
        {
            var a = await BindNode(db, "PMS-A"); var b = await BindNode(db, "PMS-B");
            var rank = new Maritime.Shared.Models.Crew.Rank { RankCode = "CO", RankName = "Chief officer" };
            db.Ranks.Add(rank); await db.SaveChangesAsync();
            var crewA = await Crew(db, a, "PMS-A-PIC"); var crewB = await Crew(db, b, "PMS-B-PIC"); var sourceCrewId = Guid.NewGuid();
            db.SyncRecordIdentities.AddRange(new() { OriginNode = "PMS-A", TableName = "crew_member", LocalKey = sourceCrewId.ToString(), ShoreKey = crewA.Id.ToString() },
                new() { OriginNode = "PMS-B", TableName = "crew_member", LocalKey = sourceCrewId.ToString(), ShoreKey = crewB.Id.ToString() }); await db.SaveChangesAsync();
            var assetId = Guid.NewGuid(); var jobId = Guid.NewGuid(); var orderId = Guid.NewGuid(); var reportId = Guid.NewGuid();
            var epochA = Guid.NewGuid(); var epochB = Guid.NewGuid(); var streamA = Guid.NewGuid(); var streamB = Guid.NewGuid();
            db.PmsSyncDatasets.AddRange(new() { OriginNode = "PMS-A", VesselId = a, DatasetId = epochA, StreamId = streamA, IsActive = true },
                new() { OriginNode = "PMS-B", VesselId = b, DatasetId = epochB, StreamId = streamB, IsActive = true });
            await db.SaveChangesAsync();
            var generic = Inbox(db);
            foreach (var node in new[] { "PMS-A", "PMS-B" })
                Assert.Equal(1, (await generic.ProcessBatchAsync([Event(node, Guid.NewGuid(), assetId, 1, "SNAPSHOT",
                    new { AssetCode = "FIRE-PUMP", AssetName = "Fire pump", Category = "DECK" })])).Succeeded);
            var inbox = PmsInbox(db);
            var submitted = new DateTime(2026, 10, 26, 0, 0, 0, DateTimeKind.Utc);
            var snapshot = ApprovalSnapshot.Canonicalize(new { SchemaVersion = 2, WorkOrderId = orderId, JobId = jobId,
                SubmittedAt = submitted, SubmittedByUserId = 5, SubmittedByCrewId = "PIC", DurationMinutes = 60,
                DueAt = (DateTime?)null, DueHours = 100, RunningHours = 100, Checklist = new[] { new { Description = "Seal", Completed = true } } });
            SyncQueueItemDto[] Batch(string node, Guid epoch, Guid stream) => [
                PmsEvent(node, epoch, stream, "pms_work_order_report", reportId, 30, new PmsWorkOrderReport { WorkOrderId = orderId, JobId = jobId,
                    Revision = 1, SubmitCommandId = Guid.Parse("10000000-0000-0000-0000-000000000001"), SubmittedAt = submitted,
                    SubmittedByUserId = 5, SubmittedByCrewId = "PIC", DurationMinutes = 60, DueHours = 100, ExecutedRunningHours = 100,
                    SnapshotJson = snapshot, ContentHash = ApprovalSnapshot.Hash(snapshot) }),
                PmsEvent(node, epoch, stream, "maintenance_task", orderId, 20, new MaintenanceTask { TaskId = "WO-SAME-SOURCE", ScheduleId = jobId,
                    EquipmentAssetId = assetId, Status = "PENDING_APPROVAL", WorkflowVersion = 3, ReportRevision = 1, JobSnapshot = "{\"source\":true}" }),
                PmsEvent(node, epoch, stream, "maintenance_schedule", jobId, 10, new MaintenanceSchedule { ScheduleCode = "JOB-SAME", ScheduleName = "Check fire pump",
                    EquipmentAssetId = assetId, JobVersion = 1, JobState = "ACTIVE", NextCycleNumber = 1 })];
            var batchA = Batch("PMS-A", epochA, streamA); var batchB = Batch("PMS-B", epochB, streamB);
            // The receiver must accept the same 500-item limit as the Edge Job editor.
            var largeJob = JsonNode.Parse(batchB[2].Payload)!.AsObject();
            largeJob["PmsChecklistTemplates"] = JsonSerializer.SerializeToNode(Enumerable.Range(1, 500).Select(i => new
            { Id = Guid.NewGuid(), SequenceOrder = i, CheckpointDescription = "Inspect seal", RequiresReading = false }));
            batchB[2].Payload = largeJob.ToJsonString();
            foreach (var jobEvent in new[] { batchA[2], batchB[2] })
            {
                var json = JsonNode.Parse(jobEvent.Payload)!.AsObject(); json["ResponsibleCrewId"] = sourceCrewId;
                json["ResponsibleRankId"] = 999999; json["ResponsibleRankCode"] = "CO"; jobEvent.Payload = json.ToJsonString();
            }
            foreach (var batch in new[] { batchA, batchB, batchA })
            {
                var result = await inbox.ProcessBatchAsync(batch.ToList());
                Assert.True(result.Failed == 0, string.Join("; ", result.FailedItems.Select(i => i.Error)));
                Assert.Equal(3, result.Succeeded);
            }
            var revisedJob = JsonNode.Parse(batchA[2].Payload)!.AsObject();
            revisedJob["JobVersion"] = 2; revisedJob["PmsChecklistTemplates"]![0]!["CheckpointDescription"] = "Changed definition";
            var changedJob = new SyncQueueItemDto { TableName = "maintenance_schedule", OriginNode = "PMS-A", StreamId = streamA,
                EventId = Guid.NewGuid(), SyncVersion = 40, RecordKey = jobId.ToString(), ActionType = "SNAPSHOT", Payload = revisedJob.ToJsonString() };
            Assert.Equal(1, (await inbox.ProcessBatchAsync([changedJob])).Succeeded);
            Assert.Equal(1, (await inbox.ProcessBatchAsync([batchA[2]])).Succeeded); // Older definition cannot restore its checklist.
            db.ChangeTracker.Clear();
            var orders = await db.MaintenanceTasks.ToListAsync(); Assert.Equal(2, orders.Count); Assert.Equal(2, orders.Select(t => t.Id).Distinct().Count());
            var jobs = await db.MaintenanceSchedules.ToListAsync(); Assert.All(jobs, j => Assert.Equal(rank.Id, j.ResponsibleRankId));
            // Legacy Shore editors must not mutate the Edge-owned mirror or its checklist.
            var shoreEditor = new ProductApi.Controllers.Pms.MaintenanceSchedulesController(db);
            var mirroredJob = jobs.Single(j => j.VesselId == a);
            Assert.IsType<Microsoft.AspNetCore.Mvc.ConflictObjectResult>(await shoreEditor.Update(mirroredJob.Id,
                new MaintenanceSchedule { ScheduleName = "Shore overwrite" }));
            Assert.IsType<Microsoft.AspNetCore.Mvc.ConflictObjectResult>(await shoreEditor.Delete(mirroredJob.Id));
            db.ChangeTracker.Clear();
            var preservedJob = await db.MaintenanceSchedules.SingleAsync(j => j.Id == mirroredJob.Id);
            Assert.Equal("Check fire pump", preservedJob.ScheduleName); Assert.True(preservedJob.IsActive);
            var templates = await db.ScheduleChecklistTemplates.ToListAsync(); Assert.Equal(501, templates.Count);
            Assert.Contains(templates, t => t.CheckpointDescription == "Inspect seal");
            Assert.Contains(templates, t => t.CheckpointDescription == "Changed definition");
            Assert.Equal(crewA.Id, jobs.Single(j => j.VesselId == a).ResponsibleCrewId);
            Assert.Equal(crewB.Id, jobs.Single(j => j.VesselId == b).ResponsibleCrewId);
            var reports = await db.PmsWorkOrderReports.ToListAsync(); Assert.Equal(2, reports.Count);
            Assert.All(reports, r => { Assert.Equal(snapshot, r.SnapshotJson); Assert.Contains(orders, t => t.Id == r.WorkOrderId && t.VesselId == r.VesselId); });
            var epoch = await db.PmsSyncDatasets.SingleAsync(d => d.OriginNode == "PMS-A"); epoch.IsActive = false; await db.SaveChangesAsync();
            var stale = await inbox.ProcessBatchAsync(batchA.ToList()); Assert.Equal(3, stale.Failed); Assert.Empty(stale.AcknowledgedEventIds);
            var legacy = Event("PMS-A", streamA, jobId, 99, "UPDATE", new { ScheduleName = "Legacy overwrite" }); legacy.TableName = "maintenance_schedule";
            Assert.Equal(1, (await inbox.ProcessBatchAsync([legacy])).Failed);
            Assert.Equal(6, await db.PmsSyncMirrorRecords.CountAsync());
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [ShorePostgresFact]
    public async Task PmsMirror_RejectsMissingParentAndChangedSameSequenceWithoutAcknowledging()
    {
        await using var db = await Database();
        try
        {
            var vessel = await BindNode(db, "PMS-DEPENDENCY"); var epoch = Guid.NewGuid(); var stream = Guid.NewGuid();
            db.PmsSyncDatasets.Add(new() { OriginNode = "PMS-DEPENDENCY", VesselId = vessel, DatasetId = epoch, StreamId = stream, IsActive = true });
            await db.SaveChangesAsync();
            var sourceId = Guid.NewGuid(); var inbox = PmsInbox(db);
            var order = PmsEvent("PMS-DEPENDENCY", epoch, stream, "maintenance_task", sourceId, 1,
                new MaintenanceTask { TaskId = "WO-MISSING-JOB", Status = "ASSIGNED", ScheduleId = Guid.NewGuid(), EquipmentAssetId = Guid.NewGuid() });
            var missing = await inbox.ProcessBatchAsync([order]); Assert.Equal(1, missing.Failed); Assert.Empty(missing.AcknowledgedEventIds);
            Assert.Empty(await db.PmsSyncMirrorRecords.ToListAsync());
            var draft = PmsEvent("PMS-DEPENDENCY", epoch, stream, "maintenance_task", sourceId, 2,
                new MaintenanceTask { TaskId = "WO-DRAFT", Status = "DRAFT", WorkflowVersion = 1 });
            Assert.Equal(1, (await inbox.ProcessBatchAsync([draft])).Succeeded);
            var changed = JsonNode.Parse(draft.Payload)!.AsObject(); changed["TaskDescription"] = "changed same sequence"; draft.Payload = changed.ToJsonString();
            Assert.Equal(1, (await inbox.ProcessBatchAsync([draft])).Failed);
            Assert.Single(await db.MaintenanceTasks.ToListAsync()); Assert.Single(await db.PmsSyncMirrorRecords.ToListAsync());
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }
}
