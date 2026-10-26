using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;
using ProductApi.Models;

namespace ProductApi.Services.Sync;

public partial class SyncInboxService
{
    private static readonly Dictionary<string, Type> PmsMirrorTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        ["maintenance_schedule"] = typeof(MaintenanceSchedule), ["maintenance_task"] = typeof(MaintenanceTask),
        ["pms_work_order_report"] = typeof(PmsWorkOrderReport),
        ["pms_work_order_material_posting"] = typeof(PmsWorkOrderMaterialPosting)
    };

    private static string PmsTable(string table) => table.ToLowerInvariant() switch
    {
        "maintenance_schedules" => "maintenance_schedule", "maintenance_tasks" => "maintenance_task",
        "pms_work_order_reports" => "pms_work_order_report",
        "pms_work_order_material_postings" => "pms_work_order_material_posting", _ => table.ToLowerInvariant()
    };

    private static bool IsPmsMirror(SyncQueueItemDto item) =>
        PmsMirrorTypes.ContainsKey(PmsTable(item.TableName)) && PmsSyncProtocol.RequiresDedicatedReceiver(item.TableName, item.Payload);

    private static bool IsPmsLegacyTable(string table) => PmsMirrorTypes.ContainsKey(PmsTable(table)) || PmsTable(table) is
        "maintenance_history" or "task_checklist_item" or "schedule_checklist_template" or "schedule_spare_part" or
        "maintenance_task_detail" or "task_deferral_request";

    private static string MirrorKey(string origin, Guid dataset, string table, Guid sourceId) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{origin}:{dataset:N}:{table}:{sourceId:N}")));

    private async Task GuardRetiredPmsProtocol(SyncQueueItemDto item)
    {
        var table = PmsTable(item.TableName);
        if (IsPmsLegacyTable(table) &&
            !IsPmsMirror(item) && await _context.PmsSyncDatasets.AnyAsync(d => d.OriginNode == item.OriginNode))
            throw new InvalidOperationException("pms_dataset_retired: legacy PMS events cannot cross the dataset reset boundary");
    }

    private async Task ProcessPmsMirrorAsync(SyncQueueItemDto item)
    {
        if (!_configuration.GetValue<bool>("Pms:ReworkSyncEnabled")) throw new InvalidOperationException(PmsSyncProtocol.UpgradeRequired);
        if (item.ActionType is not ("CREATE" or "UPDATE" or "SNAPSHOT"))
            throw new InvalidOperationException("pms_mirror_delete_forbidden: source must send a soft-delete snapshot");
        var table = PmsTable(item.TableName);
        if (!PmsMirrorTypes.TryGetValue(table, out var type) || !Guid.TryParse(item.RecordKey, out var sourceId) || sourceId == Guid.Empty ||
            item.EventId == Guid.Empty || item.SyncVersion <= 0 || item.StreamId == Guid.Empty)
            throw new InvalidOperationException("pms_mirror_invalid_envelope");
        using var json = JsonDocument.Parse(item.Payload);
        if (!json.RootElement.TryGetProperty("PmsDatasetId", out var epoch) || !epoch.TryGetGuid(out var datasetId) || datasetId == Guid.Empty)
            throw new InvalidOperationException("pms_dataset_missing");
        var vessel = await VesselSyncIdentity.ResolveVesselIdAsync(_context, item.OriginNode);
        var dataset = await _context.PmsSyncDatasets.AsNoTracking().SingleOrDefaultAsync(d => d.OriginNode == item.OriginNode);
        if (dataset == null || !dataset.IsActive || dataset.DatasetId != datasetId || dataset.StreamId != item.StreamId || dataset.VesselId != vessel)
            throw new InvalidOperationException("pms_dataset_mismatch: stale, inactive or foreign dataset/stream");

        var incoming = JsonSerializer.Deserialize(item.Payload, type, _jsonOptions) ?? throw new InvalidOperationException("pms_mirror_invalid_payload");
        if ((Guid)type.GetProperty("Id")!.GetValue(incoming)! != sourceId ||
            (int?)type.GetProperty("PmsProtocolVersion")!.GetValue(incoming) != 2 ||
            !json.RootElement.TryGetProperty("OriginNode", out var origin) || origin.GetString() != item.OriginNode)
            throw new InvalidOperationException("pms_mirror_source_identity_mismatch");

        var key = MirrorKey(item.OriginNode, datasetId, table, sourceId);
        var receipt = await _context.PmsSyncMirrorRecords.SingleOrDefaultAsync(r => r.Key == key);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(item.Payload)));
        if (receipt != null && item.SyncVersion <= receipt.Sequence)
        {
            if (item.SyncVersion == receipt.Sequence && hash != receipt.PayloadHash)
                throw new InvalidOperationException("pms_mirror_sequence_reused_with_changed_payload");
            return;
        }
        var shoreId = receipt?.ShoreId ?? sourceId;
        object? stored = receipt == null ? null : await _context.FindAsync(type, shoreId);
        if (receipt == null && await _context.FindAsync(type, shoreId) != null) shoreId = Guid.NewGuid();
        if (receipt != null && stored == null) throw new InvalidOperationException("pms_mirror_receipt_without_record");

        switch (incoming)
        {
            case MaintenanceSchedule job:
                if (job.JobVersion is null or < 1 || stored is MaintenanceSchedule oldJob && job.JobVersion < oldJob.JobVersion)
                    throw new InvalidOperationException("pms_job_version_invalid");
                if (job.EquipmentGroupId.HasValue || !job.EquipmentAssetId.HasValue) throw new InvalidOperationException("pms_job_requires_one_asset");
                job.EquipmentAssetId = await ResolveHistoryParentAsync("equipment_asset", job.EquipmentAssetId.Value, item.OriginNode);
                if (job.ResponsibleCrewId.HasValue)
                    job.ResponsibleCrewId = await ResolveHistoryParentAsync("crew_member", job.ResponsibleCrewId.Value, item.OriginNode);
                // Ranks are Shore master data. Match by source code, never by a local numeric ID alone.
                if (job.ResponsibleRankId.HasValue)
                {
                    if (!json.RootElement.TryGetProperty("ResponsibleRankCode", out var code) || string.IsNullOrWhiteSpace(code.GetString()))
                        throw new InvalidOperationException("dependency_missing: responsible rank code");
                    job.ResponsibleRankId = await _context.Ranks.Where(r => r.RankCode == code.GetString()).Select(r => (int?)r.Id).SingleOrDefaultAsync()
                        ?? throw new InvalidOperationException("dependency_missing: rank");
                }
                job.VesselId = vessel; break;
            case MaintenanceTask order:
                if (order.WorkflowVersion is null or < 1 || stored is MaintenanceTask oldOrder && order.WorkflowVersion < oldOrder.WorkflowVersion)
                    throw new InvalidOperationException("pms_work_order_version_invalid");
                if (order.ScheduleId.HasValue) order.ScheduleId = await ResolvePmsParent("maintenance_schedule", order.ScheduleId.Value, dataset, item.OriginNode);
                if (order.EquipmentAssetId.HasValue)
                    order.EquipmentAssetId = await ResolveHistoryParentAsync("equipment_asset", order.EquipmentAssetId.Value, item.OriginNode);
                else if (order.Status != "DRAFT") throw new InvalidOperationException("pms_work_order_requires_asset");
                if (stored is MaintenanceTask previous)
                {
                    if (previous.CreationCommandId != order.CreationCommandId || previous.CreationCommandHash != order.CreationCommandHash ||
                        previous.CreatedByUserId != order.CreatedByUserId || previous.TaskId != order.TaskId)
                        throw new InvalidOperationException("pms_work_order_identity_immutable");
                    if (previous.Status != "DRAFT" && (previous.ScheduleId != order.ScheduleId || previous.EquipmentAssetId != order.EquipmentAssetId ||
                        previous.CycleKey != order.CycleKey || previous.JobSnapshot != order.JobSnapshot || previous.JobVersion != order.JobVersion ||
                        previous.WorkOrderDueAt != order.WorkOrderDueAt || previous.WorkOrderDueHours != order.WorkOrderDueHours ||
                        previous.WorkOrderWarningDays != order.WorkOrderWarningDays || previous.WorkOrderWarningHours != order.WorkOrderWarningHours))
                        throw new InvalidOperationException("pms_work_order_frozen_snapshot_immutable");
                    if (previous.Status is "COMPLETED" or "CANCELLED" && previous.Status != order.Status)
                        throw new InvalidOperationException("pms_work_order_terminal_state_immutable");
                }
                order.VesselId = vessel; break;
            case PmsWorkOrderReport report:
                ValidatePmsReport(report, stored as PmsWorkOrderReport);
                if (report.Decision != null) await ValidatePmsDecision(report, item.OriginNode);
                report.WorkOrderId = await ResolvePmsParent("maintenance_task", report.WorkOrderId, dataset, item.OriginNode);
                if (report.JobId.HasValue) report.JobId = await ResolvePmsParent("maintenance_schedule", report.JobId.Value, dataset, item.OriginNode);
                var reportOrder = await _context.MaintenanceTasks.SingleAsync(t => t.Id == report.WorkOrderId);
                if (reportOrder.ScheduleId != report.JobId || (reportOrder.ReportRevision ?? 0) < report.Revision || reportOrder.Status == "DRAFT")
                    throw new InvalidOperationException("dependency_missing: matching submitted Work Order revision");
                if (stored is PmsWorkOrderReport { Decision: not null } decided && report.Decision == null)
                {
                    report.Decision = decided.Decision; report.DecidedAt = decided.DecidedAt; report.DecidedByUserId = decided.DecidedByUserId;
                    report.DecidedByCrewId = decided.DecidedByCrewId; report.DecisionReason = decided.DecisionReason;
                    report.ApprovalEvidenceJson = decided.ApprovalEvidenceJson;
                }
                report.VesselId = vessel; break;
            case PmsWorkOrderMaterialPosting posting:
                if (posting.Quantity <= 0) throw new InvalidOperationException("pms_posting_invalid_quantity");
                if (!await _context.MaterialItemShips.AnyAsync(m => m.Id == posting.MaterialItemId && m.VesselId == vessel))
                    throw new InvalidOperationException("dependency_missing: vessel material definition");
                posting.WorkOrderId = await ResolvePmsParent("maintenance_task", posting.WorkOrderId, dataset, item.OriginNode);
                posting.ReportId = await ResolvePmsParent("pms_work_order_report", posting.ReportId, dataset, item.OriginNode);
                var approved = await _context.PmsWorkOrderReports.SingleOrDefaultAsync(r => r.Id == posting.ReportId && r.WorkOrderId == posting.WorkOrderId && r.Decision == "APPROVED");
                if (approved == null)
                    throw new InvalidOperationException("dependency_missing: approved report for material posting");
                using (var signedReport = JsonDocument.Parse(approved.SnapshotJson))
                {
                    var materials = signedReport.RootElement.GetProperty("Materials").EnumerateArray()
                        .Where(m => m.GetProperty("MaterialItemId").GetGuid() == posting.MaterialItemId).ToArray();
                    if (materials.Length != 1 || materials[0].GetProperty("Quantity").GetDecimal() != posting.Quantity)
                        throw new InvalidOperationException("pms_posting_does_not_match_signed_report");
                }
                // This is a source ledger mirror, never another stock deduction.
                posting.VesselId = vessel;
                if (receipt != null && receipt.SourceJson != item.Payload) throw new InvalidOperationException("pms_posting_immutable");
                break;
        }
        type.GetProperty("Id")!.SetValue(incoming, shoreId);
        type.GetProperty("IsSynced")!.SetValue(incoming, true);
        if (incoming is MaintenanceSchedule)
        {
            if (!json.RootElement.TryGetProperty("PmsChecklistTemplates", out var frozen) || frozen.ValueKind != JsonValueKind.Array)
                throw new InvalidOperationException("pms_job_checklist_snapshot_missing");
            var templates = JsonSerializer.Deserialize<ScheduleChecklistTemplate[]>(frozen.GetRawText(), _jsonOptions)!;
            if (templates.Length > 500 || templates.Any(t => t.Id == Guid.Empty || t.SequenceOrder < 1 || string.IsNullOrWhiteSpace(t.CheckpointDescription) ||
                t.CheckpointDescription.Length > 500 || t.Unit?.Length > 20) || templates.Select(t => t.Id).Distinct().Count() != templates.Length ||
                templates.Select(t => t.SequenceOrder).Distinct().Count() != templates.Length)
                throw new InvalidOperationException("pms_job_checklist_invalid");
            var existingTemplates = await _context.ScheduleChecklistTemplates.Where(c => c.ScheduleId == shoreId).ToListAsync();
            var kept = new HashSet<Guid>();
            foreach (var template in templates)
            {
                var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{item.OriginNode}/{datasetId:N}/{sourceId:N}/{template.Id:N}"));
                var templateId = new Guid(bytes.AsSpan(0, 16)); kept.Add(templateId);
                var target = existingTemplates.SingleOrDefault(c => c.Id == templateId);
                if (target == null) { target = new() { Id = templateId, ScheduleId = shoreId }; _context.ScheduleChecklistTemplates.Add(target); }
                target.SequenceOrder = template.SequenceOrder; target.CheckpointDescription = template.CheckpointDescription;
                target.RequiresReading = template.RequiresReading; target.NormalRangeMin = template.NormalRangeMin;
                target.NormalRangeMax = template.NormalRangeMax; target.Unit = template.Unit; target.CreatedAt = template.CreatedAt;
            }
            _context.ScheduleChecklistTemplates.RemoveRange(existingTemplates.Where(c => !kept.Contains(c.Id)));
        }
        if (stored != null) _context.Entry(stored).CurrentValues.SetValues(incoming);
        else
        {
            // Copy scalars only; payload navigation graphs may never insert other entities.
            var clone = Activator.CreateInstance(type)!;
            foreach (var property in _context.Entry(clone).Properties)
                property.CurrentValue = property.Metadata.PropertyInfo!.GetValue(incoming);
            _context.Add(clone);
        }
        if (receipt == null)
        {
            receipt = new() { Key = key, OriginNode = item.OriginNode, VesselId = vessel!.Value, DatasetId = datasetId,
                TableName = table, SourceId = sourceId, ShoreId = shoreId };
            _context.PmsSyncMirrorRecords.Add(receipt);
        }
        receipt.Sequence = item.SyncVersion; receipt.PayloadHash = hash; receipt.SourceJson = item.Payload;
    }

    private async Task<Guid> ResolvePmsParent(string table, Guid sourceId, PmsSyncDataset dataset, string origin)
    {
        var key = MirrorKey(origin, dataset.DatasetId, table, sourceId);
        var parent = await _context.PmsSyncMirrorRecords.AsNoTracking().SingleOrDefaultAsync(r => r.Key == key);
        if (parent == null || parent.VesselId != dataset.VesselId || parent.OriginNode != origin)
            throw new InvalidOperationException($"dependency_missing: {table} in the current PMS dataset");
        return parent.ShoreId;
    }

    private static void ValidatePmsReport(PmsWorkOrderReport report, PmsWorkOrderReport? stored)
    {
        if (report.Revision < 1 || report.SubmitCommandId == Guid.Empty || report.DurationMinutes < 0 ||
            ApprovalSnapshot.Hash(report.SnapshotJson) != report.ContentHash)
            throw new InvalidOperationException("pms_report_snapshot_invalid");
        using var snapshot = JsonDocument.Parse(report.SnapshotJson);
        if (snapshot.RootElement.GetProperty("SchemaVersion").GetInt32() != 2 ||
            snapshot.RootElement.GetProperty("WorkOrderId").GetGuid() != report.WorkOrderId ||
            snapshot.RootElement.GetProperty("SubmittedAt").GetDateTime() != report.SubmittedAt ||
            snapshot.RootElement.GetProperty("SubmittedByUserId").GetInt64() != report.SubmittedByUserId ||
            snapshot.RootElement.GetProperty("SubmittedByCrewId").GetString() != report.SubmittedByCrewId ||
            snapshot.RootElement.GetProperty("DurationMinutes").GetInt32() != report.DurationMinutes ||
            JsonSerializer.Deserialize<Guid?>(snapshot.RootElement.GetProperty("JobId")) != report.JobId ||
            JsonSerializer.Deserialize<DateTime?>(snapshot.RootElement.GetProperty("DueAt")) != report.DueAt ||
            JsonSerializer.Deserialize<double?>(snapshot.RootElement.GetProperty("DueHours")) != report.DueHours ||
            JsonSerializer.Deserialize<double?>(snapshot.RootElement.GetProperty("RunningHours")) != report.ExecutedRunningHours)
            throw new InvalidOperationException("pms_report_metadata_mismatch");
        if (report.Decision is not (null or "APPROVED" or "RETURNED")) throw new InvalidOperationException("pms_report_invalid_decision");
        if (stored == null) return;
        if (stored.SnapshotJson != report.SnapshotJson || stored.ContentHash != report.ContentHash || stored.Revision != report.Revision ||
            stored.SubmitCommandId != report.SubmitCommandId || stored.CommandHash != report.CommandHash || stored.SubmittedAt != report.SubmittedAt ||
            stored.SubmittedByCrewId != report.SubmittedByCrewId || stored.SubmittedByUserId != report.SubmittedByUserId ||
            stored.DurationMinutes != report.DurationMinutes || stored.ExecutedRunningHours != report.ExecutedRunningHours ||
            stored.DueAt != report.DueAt || stored.DueHours != report.DueHours || stored.WasOverdue != report.WasOverdue || stored.CreatedAt != report.CreatedAt)
            throw new InvalidOperationException("pms_report_immutable");
        if (stored.Decision != null && report.Decision != null && (stored.Decision != report.Decision ||
            stored.ApprovalEvidenceJson != report.ApprovalEvidenceJson || stored.DecidedAt != report.DecidedAt ||
            stored.DecidedByUserId != report.DecidedByUserId || stored.DecidedByCrewId != report.DecidedByCrewId || stored.DecisionReason != report.DecisionReason))
            throw new InvalidOperationException("pms_report_decision_immutable");
    }

    private async Task ValidatePmsDecision(PmsWorkOrderReport report, string origin)
    {
        using var evidence = JsonDocument.Parse(report.ApprovalEvidenceJson ?? "{}");
        var signed = evidence.RootElement.GetProperty("evidence");
        var actionId = signed.GetProperty("ActionId").GetGuid(); var revisionId = signed.GetProperty("RevisionId").GetGuid();
        var action = await _context.ApprovalActions.SingleOrDefaultAsync(a => a.Id == actionId && a.RevisionId == revisionId && a.OriginNode == origin);
        if (action == null) throw new InvalidOperationException("dependency_missing: approval_action");
        var revision = await _context.ApprovalRevisions.SingleAsync(r => r.Id == revisionId);
        var document = await _context.ApprovalDocuments.SingleAsync(d => d.Id == action.DocumentId);
        using var snapshot = JsonDocument.Parse(revision.SnapshotJson);
        if (document.OriginNode != origin || document.Module != "pms" || document.RecordKey != report.WorkOrderId.ToString() ||
            action.ContentHash != signed.GetProperty("ContentHash").GetString() || revision.ContentHash != action.ContentHash ||
            snapshot.RootElement.GetProperty("SubmittedReport").GetString() != report.SnapshotJson ||
            snapshot.RootElement.GetProperty("ContentHash").GetString() != report.ContentHash ||
            snapshot.RootElement.GetProperty("NodeId").GetString() != origin ||
            action.ActorUserId != report.DecidedByUserId || action.CrewId != report.DecidedByCrewId || action.Reason != (report.DecisionReason ?? "") ||
            action.Action != (report.Decision == "APPROVED" ? "approve" : "reject"))
            throw new InvalidOperationException("pms_report_approval_evidence_mismatch");
    }
}
