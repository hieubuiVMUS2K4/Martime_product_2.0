using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace MaritimeEdge.DTOs;

// Reject fields that belong to execution/approval or material assignment instead of silently ignoring them.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class SavePmsJobDto
{
    public int? ExpectedVersion { get; set; }
    [Required, MaxLength(50)] public string Code { get; set; } = "";
    [MaxLength(50)] public string? WorkCode { get; set; }
    [Required, MaxLength(200)] public string Name { get; set; } = "";
    public Guid? EquipmentAssetId { get; set; }
    [RegularExpression("^(PERIODIC|DRY_DOCK|ON_DEMAND|VOYAGE)$")] public string Category { get; set; } = "PERIODIC";
    [RegularExpression("^(CALENDAR|RUNNING_HOURS|HYBRID)$")] public string IntervalType { get; set; } = "CALENDAR";
    [Range(1, 36500)] public int? IntervalDays { get; set; }
    [Range(1, 1200)] public int? IntervalMonths { get; set; }
    [Range(1, 100)] public int? IntervalYears { get; set; }
    [Range(1, 10000000)] public int? IntervalHours { get; set; }
    public DateTime? BaselineAt { get; set; }
    [Range(0, 1000000000)] public double? BaselineRunningHours { get; set; }
    [MaxLength(1000)] public string? BaselineSource { get; set; }
    [MaxLength(1000)] public string? ChangeReason { get; set; }
    [Range(0, 3650)] public int WarningDays { get; set; } = 7;
    [Range(0, 1000000)] public double WarningHours { get; set; } = 50;
    [RegularExpression("^(ON_UPCOMING|ON_DUE)$")] public string ReleasePolicy { get; set; } = "ON_UPCOMING";
    public bool AutoGenerate { get; set; }
    [RegularExpression("^(CRITICAL|HIGH|NORMAL|LOW)$")] public string Priority { get; set; } = "NORMAL";
    [MaxLength(20)] public string? Department { get; set; }
    public int? ResponsibleRankId { get; set; }
    public Guid? ResponsibleCrewId { get; set; }
    [RegularExpression("^(ON_RELEASE|PREASSIGNED)$")] public string AssignmentPolicy { get; set; } = "ON_RELEASE";
    [MaxLength(50)] public string? DefaultCrewId { get; set; }
    [MaxLength(20000)] public string? Instructions { get; set; }
    [MaxLength(500)] public List<ChecklistItemTemplateDto> Checklist { get; set; } = [];
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ChangePmsJobStateDto(int ExpectedVersion, string State, string Reason);

public sealed class PmsJobQuery
{
    [Range(1, 100000)] public int Page { get; set; } = 1;
    [Range(1, 100)] public int PageSize { get; set; } = 20;
    [MaxLength(200)] public string? Name { get; set; }
    [MaxLength(200)] public string? Equipment { get; set; }
    public Guid? EquipmentAssetId { get; set; }
    public string? Category { get; set; }
    public string? State { get; set; }
    public string? Department { get; set; }
    public Guid? ResponsibleCrewId { get; set; }
    public DateTime? DueFrom { get; set; }
    public DateTime? DueTo { get; set; }
    [Range(0, 1000000000)] public double? DueHoursFrom { get; set; }
    [Range(0, 1000000000)] public double? DueHoursTo { get; set; }
    public string Sort { get; set; } = "name";
    public bool Descending { get; set; }
}

public sealed class PmsWorkOrderQuery
{
    [Range(1, 100000)] public int Page { get; set; } = 1;
    [Range(1, 100)] public int PageSize { get; set; } = 20;
    [MaxLength(200)] public string? Name { get; set; }
    [MaxLength(50)] public string? Code { get; set; }
    [MaxLength(200)] public string? Equipment { get; set; }
    public Guid? EquipmentAssetId { get; set; }
    public Guid? JobId { get; set; }
    public string? Status { get; set; } = "OPEN";
    public string? DueState { get; set; }
    public string? AssignedTo { get; set; }
    public string? Department { get; set; }
    public string? Priority { get; set; }
    public DateTime? DueFrom { get; set; }
    public DateTime? DueTo { get; set; }
    [Range(0, 1000000000)] public double? DueHoursFrom { get; set; }
    [Range(0, 1000000000)] public double? DueHoursTo { get; set; }
    public string Sort { get; set; } = "due";
    public bool Descending { get; set; }
}

public sealed class PmsHistoryQuery
{
    [Range(1, 100000)] public int Page { get; set; } = 1;
    [Range(1, 100)] public int PageSize { get; set; } = 20;
    public string? CompletedBy { get; set; }
    public DateTime? SourceFrom { get; set; }
    public DateTime? SourceTo { get; set; }
    public double? HoursFrom { get; set; }
    public double? HoursTo { get; set; }
    public string Sort { get; set; } = "sourceTime";
    public bool Descending { get; set; } = true;
}

public sealed record PmsPage<T>(IReadOnlyList<T> Items, int Total, int Page, int PageSize);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ImportPmsJobsDto
{
    public bool ValidateOnly { get; set; } = true;
    [Required, MinLength(1), MaxLength(1000)] public List<ImportPmsJobRow> Rows { get; set; } = [];
}

// Import intentionally has no baseline, last-execution, next-due, auto-generate or result fields.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class ImportPmsJobRow
{
    public int RowNumber { get; set; }
    public string AssetCode { get; set; } = "";
    public string Code { get; set; } = "";
    public string? WorkCode { get; set; }
    public string Name { get; set; } = "";
    public string Category { get; set; } = "PERIODIC";
    public string IntervalType { get; set; } = "CALENDAR";
    public int? IntervalDays { get; set; }
    public int? IntervalMonths { get; set; }
    public int? IntervalYears { get; set; }
    public int? IntervalHours { get; set; }
    public string Priority { get; set; } = "NORMAL";
    public string? Department { get; set; }
    public string? Instructions { get; set; }
}

public sealed record PmsImportIssue(int RowNumber, string Code, string[] Errors);
public sealed record PmsImportResult(bool Valid, int Imported, int Count, IReadOnlyList<PmsImportIssue> Errors);

public sealed record PmsJobRow(Guid Id, string Code, string? WorkCode, string Name, Guid? EquipmentAssetId,
    string? EquipmentName, string Category, string IntervalType, int? IntervalDays, int? IntervalMonths,
    int? IntervalYears, int? IntervalHours, DateTime? LastSubmittedAt, double? LastRunningHours,
    DateTime? NextDueAt, double? NextDueHours, string? Department, int? ResponsibleRankId,
    Guid? ResponsibleCrewId, string? ResponsibleName, string? State, int Version, bool AutoGenerate,
    Guid? OpenWorkOrderId, string? OpenWorkOrderCode);

public sealed record PmsWorkOrderRow(Guid Id, string Code, Guid? JobId, string Name,
    Guid? EquipmentAssetId, string? EquipmentName, DateTime? DueAt, double? DueHours,
    string? DueState, string Status, string? AssignedTo, string? AssignedName, string? Department,
    string Priority, int ReportRevision, DateTime UpdatedAt, int WorkflowVersion = 0);

public sealed class PmsRequestException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record AssignPmsWorkOrderDto(int ExpectedVersion, string CrewId, string[] SupportingCrewIds, string? Reason);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record StartPmsWorkOrderDto(int ExpectedVersion);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record CancelPmsWorkOrderDto(int ExpectedVersion, string Reason);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ReleasePmsWorkOrderDto(Guid JobId, int ExpectedJobVersion, string ExpectedCycleKey, string? EarlyReleaseReason);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record DecidePmsWorkOrderDto(int ExpectedVersion, int Revision, string ReportHash, string? Reason);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public class SavePmsExecutionDto
{
    public int ExpectedVersion { get; set; }
    [MaxLength(20000)] public string? Notes { get; set; }
    [Range(0, 525600)] public int? ActualDurationMinutes { get; set; }
    [Range(0, 1000000000)] public double? RunningHours { get; set; }
    [MaxLength(500)] public List<PmsChecklistResultDto> Checklist { get; set; } = [];
    [MaxLength(200)] public List<PmsMaterialUsageDto> Materials { get; set; } = [];
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class SubmitPmsExecutionDto : SavePmsExecutionDto { public Guid CommandId { get; set; } }
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PmsChecklistResultDto(Guid Id, bool Completed, double? Reading, string? Remarks);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PmsMaterialUsageDto(Guid MaterialItemId, decimal Quantity);
public sealed record PmsWorkflowResult(Guid Id, string Status, int Version, int Revision, Guid? ReportId = null, string? ReportHash = null);
public sealed record PmsExecutionActor(long UserId, string CrewId);
public sealed record PmsSubmittedChecklist(Guid Id, string? Description, bool Completed, double? Reading, string? Unit, string? Remarks, bool IsAbnormal);
public sealed record PmsSubmittedMaterial(Guid MaterialItemId, string Code, string Name, string? Unit, decimal Quantity);
public sealed record PmsSubmissionSnapshot(int SchemaVersion, Guid WorkOrderId, string Code, Guid? JobId, string? JobSnapshot,
    Guid? EquipmentAssetId, string Name, DateTime? DueAt, double? DueHours, DateTime SubmittedAt,
    long SubmittedByUserId, string SubmittedByCrewId, string? Notes, int DurationMinutes, double? RunningHours,
    IReadOnlyList<PmsSubmittedChecklist> Checklist, IReadOnlyList<PmsSubmittedMaterial> Materials, IReadOnlyList<PmsExecutionActor> Contributors);
public sealed record PmsApprovalEvidence(Guid ActionId, Guid RevisionId, string ContentHash);
