using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace MaritimeEdge.Models;

// Nullable fields deliberately leave legacy rows in the legacy protocol until cutover.
public partial class EquipmentAsset
{
    [Column("maintenance_previous_status"), MaxLength(50)] public string? MaintenancePreviousStatus { get; set; }
}

public partial class MaintenanceSchedule
{
    [Column("pms_protocol_version")] public int? PmsProtocolVersion { get; set; }
    [Column("job_version")] public int? JobVersion { get; set; }
    [Column("job_state"), MaxLength(32)] public string? JobState { get; set; }
    [Column("baseline_at")] public DateTime? BaselineAt { get; set; }
    [Column("baseline_running_hours")] public double? BaselineRunningHours { get; set; }
    [Column("baseline_source")] public string? BaselineSource { get; set; }
    [Column("warning_hours")] public double? WarningHours { get; set; }
    [Column("release_policy"), MaxLength(20)] public string? ReleasePolicy { get; set; }
    [Column("responsible_department"), MaxLength(50)] public string? ResponsibleDepartment { get; set; }
    [Column("responsible_rank_id")] public int? ResponsibleRankId { get; set; }
    [Column("responsible_crew_id")] public Guid? ResponsibleCrewId { get; set; }
    [Column("assignment_policy"), MaxLength(20)] public string? AssignmentPolicy { get; set; }
    [Column("next_cycle_number")] public long? NextCycleNumber { get; set; }
}

public partial class MaintenanceTask
{
    [Column("creation_command_id")] public Guid? CreationCommandId { get; set; }
    [Column("creation_command_hash"), MaxLength(64)] public string? CreationCommandHash { get; set; }
    [Column("created_by_user_id")] public long? CreatedByUserId { get; set; }
    [Column("work_order_instructions")] public string? WorkOrderInstructions { get; set; }
    [Column("draft_checklist_json")] public string? DraftChecklistJson { get; set; }
    [Column("pms_protocol_version")] public int? PmsProtocolVersion { get; set; }
    [Column("cycle_key"), MaxLength(120)] public string? CycleKey { get; set; }
    [Column("job_version")] public int? JobVersion { get; set; }
    [Column("job_snapshot")] public string? JobSnapshot { get; set; }
    [Column("work_order_due_at")] public DateTime? WorkOrderDueAt { get; set; }
    [Column("work_order_due_hours")] public double? WorkOrderDueHours { get; set; }
    [Column("due_state"), MaxLength(24)] public string? DueState { get; set; }
    [Column("report_revision")] public int? ReportRevision { get; set; }
    [Column("workflow_version")] public int? WorkflowVersion { get; set; }
    [Column("supporting_crew_ids")] public string? SupportingCrewIds { get; set; }
    [Column("execution_actors")] public string? ExecutionActors { get; set; }
    [Column("execution_started_hours")] public double? ExecutionStartedHours { get; set; }
    [Column("work_order_warning_days")] public int? WorkOrderWarningDays { get; set; }
    [Column("work_order_warning_hours")] public double? WorkOrderWarningHours { get; set; }
}
