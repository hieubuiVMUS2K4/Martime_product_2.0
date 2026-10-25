using MaritimeEdge.Models;

namespace MaritimeEdge.Services.Core;

public sealed record SigningRecord(Type EntityType, string Controller, string Permission, string SignatureField, string? SignPermission = null);

public static class SigningRecords
{
    public static readonly IReadOnlyDictionary<string, SigningRecord> All = new Dictionary<string, SigningRecord>
    {
        ["log-voyage"] = new(typeof(VoyageLogEntry), "VoyageLog", "logbooks.voyage", "MasterSignature"),
        ["log-deck"] = new(typeof(DeckLogBook), "DeckLogbook", "logbooks.deck", "MasterSignature"),
        ["log-engine"] = new(typeof(EngineLogBook), "EngineLogbook", "logbooks.engine", "ChiefEngineerSignature"),
        ["log-oil"] = new(typeof(OilRecordBook), "OilRecord", "logbooks.oil", "MasterSignature"),
        ["log-watchkeeping"] = new(typeof(WatchkeepingLog), "Watchkeeping", "logbooks.watchkeeping", "MasterSignature"),
        ["log-garbage"] = new(typeof(GarbageRecordBook), "GarbageRecord", "logbooks.garbage", "MasterSignature"),
        ["log-garbage-i"] = new(typeof(GarbageRecordPartI), "GarbagePartI", "logbooks.garbage", "MasterSignature"),
        ["log-garbage-ii"] = new(typeof(GarbageRecordPartII), "GarbagePartII", "logbooks.garbage", "MasterSignature"),
        ["log-ballast"] = new(typeof(BallastWaterRecordBook), "BallastWater", "logbooks.ballast", "MasterSignature"),
        ["log-abstract-master"] = new(typeof(AbstractLogVoyage), "AbstractLog", "logbooks.abstract", "MasterSignature"),
        ["log-abstract-engineer"] = new(typeof(AbstractLogVoyage), "AbstractLog", "logbooks.abstract", "ChiefEngineerSignature"),
        ["report"] = new(typeof(MaritimeReport), "Reporting", "reporting", "MasterSignature"),
        ["report-amendment"] = new(typeof(ReportAmendment), "Reporting", "reporting", "MasterSignature"),
        ["report-engineer"] = new(typeof(BunkerReport), "Reporting", "reporting", "ChiefEngineerSignature"),
        ["pms-risk-worker"] = new(typeof(TaskRiskAssessment), "PmsForms", "pms.work", "WorkerSignature", "pms.work.execute"),
        ["pms-risk-supervisor"] = new(typeof(TaskRiskAssessment), "PmsForms", "pms.work", "SupervisorSignature", "pms.work.approve"),
        ["pms-risk-chief"] = new(typeof(TaskRiskAssessment), "PmsForms", "pms.work", "ChiefEngineerApproval", "pms.work.approve"),
        ["pms-inspection-operator"] = new(typeof(TaskInspectionReport), "PmsForms", "pms.work", "OperatorSignature", "pms.work.execute"),
        ["pms-inspection-chief"] = new(typeof(TaskInspectionReport), "PmsForms", "pms.work", "ChiefEngineerSignature", "pms.work.approve"),
        ["report-weekly"] = new(typeof(WeeklyPerformanceReport), "WeeklyReport", "reporting", "MasterSignature"),
        ["report-monthly"] = new(typeof(MonthlySummaryReport), "MonthlyReport", "reporting", "MasterSignature"),
        ["hsqe-document"] = new(typeof(HsqeDocument), "Hsqe", "hsqe", "ApprovedBy"),
        ["drill-log"] = new(typeof(DrillLog), "Drill", "drills", "VerifiedByCrewId")
    };
    public static string? Module(string controller) => All.FirstOrDefault(p => p.Value.Controller == controller).Key;
    public static bool IsSigned(object entity, SigningRecord record) => !string.IsNullOrWhiteSpace(entity.GetType().GetProperty(record.SignatureField)?.GetValue(entity)?.ToString());
    public static string State(object entity, string module) => All.TryGetValue(module, out var record) && IsSigned(entity, record) ? "Signed" : entity.GetType().GetProperty("Status")?.GetValue(entity)?.ToString() ?? "Draft";
}
