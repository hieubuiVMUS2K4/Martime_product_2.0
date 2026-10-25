using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace ProductApi.Models;

[Table("pms_work_order_reports", Schema = "public")]
[Index(nameof(WorkOrderId), nameof(Revision), IsUnique = true, Name = "ux_pms_report_revision")]
[Index(nameof(WorkOrderId), nameof(SubmitCommandId), IsUnique = true, Name = "ux_pms_report_command")]
public class PmsWorkOrderReport
{
    [Key, Column("id")] public Guid Id { get; set; } = Guid.NewGuid();
    [Column("pms_protocol_version")] public int PmsProtocolVersion { get; set; } = 2;
    [Column("work_order_id")] public Guid WorkOrderId { get; set; }
    [Column("job_id")] public Guid? JobId { get; set; }
    [Column("revision")] public int Revision { get; set; }
    [Column("submit_command_id")] public Guid SubmitCommandId { get; set; }
    [Column("command_hash"), MaxLength(64)] public string CommandHash { get; set; } = "";
    [Column("submitted_at")] public DateTime SubmittedAt { get; set; }
    [Column("executed_running_hours")] public double? ExecutedRunningHours { get; set; }
    [Column("duration_minutes")] public int DurationMinutes { get; set; }
    [Column("due_at")] public DateTime? DueAt { get; set; }
    [Column("due_hours")] public double? DueHours { get; set; }
    [Column("was_overdue")] public bool WasOverdue { get; set; }
    [Column("submitted_by_user_id")] public long SubmittedByUserId { get; set; }
    [Column("submitted_by_crew_id"), MaxLength(50)] public string SubmittedByCrewId { get; set; } = "";
    [Column("snapshot_json")] public string SnapshotJson { get; set; } = "";
    [Column("content_hash"), MaxLength(64)] public string ContentHash { get; set; } = "";
    [Column("decision"), MaxLength(20)] public string? Decision { get; set; }
    [Column("decided_at")] public DateTime? DecidedAt { get; set; }
    [Column("decided_by_user_id")] public long? DecidedByUserId { get; set; }
    [Column("decided_by_crew_id"), MaxLength(50)] public string? DecidedByCrewId { get; set; }
    [Column("decision_reason")] public string? DecisionReason { get; set; }
    [Column("approval_evidence_json")] public string? ApprovalEvidenceJson { get; set; }
    [Column("origin_node"), MaxLength(50)] public string OriginNode { get; set; } = "";
    [Column("is_synced")] public bool IsSynced { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

[Table("pms_work_order_material_postings", Schema = "public")]
[Index(nameof(WorkOrderId), nameof(MaterialItemId), IsUnique = true, Name = "ux_pms_material_posting")]
public class PmsWorkOrderMaterialPosting
{
    [Key, Column("id")] public Guid Id { get; set; } = Guid.NewGuid();
    [Column("pms_protocol_version")] public int PmsProtocolVersion { get; set; } = 2;
    [Column("work_order_id")] public Guid WorkOrderId { get; set; }
    [Column("report_id")] public Guid ReportId { get; set; }
    [Column("material_item_id")] public Guid MaterialItemId { get; set; }
    [Column("quantity", TypeName = "numeric(18,6)")] public decimal Quantity { get; set; }
    [Column("stock_snapshot_json")] public string StockSnapshotJson { get; set; } = "";
    [Column("origin_node"), MaxLength(50)] public string OriginNode { get; set; } = "";
    [Column("is_synced")] public bool IsSynced { get; set; }
    [Column("created_at")] public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
