using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Core;

public sealed record ApprovalActor(long UserId, string Username, string? CrewId, string Name, string Rank, string Authority);
public sealed class ApprovalException(int status, string message) : Exception(message) { public int Status { get; } = status; }

public sealed class ApprovalService(EdgeDbContext db, RankPermissionService permissions, IEdgeRuntimeConfigService runtime, ISyncFileStorageService files, IConfiguration configuration)
{
    public static object GasPolicy(IConfiguration configuration)
    {
        var policy = configuration.GetSection("Approval:PermitGasPolicy");
        return new { Enabled = policy.GetValue<bool>("Enabled"), Version = policy["Version"] ?? "unconfigured",
            MaxAgeMinutes = policy.GetValue<int?>("MaxAgeMinutes"), MinO2 = policy.GetValue<double?>("MinO2"),
            MaxO2 = policy.GetValue<double?>("MaxO2"), MaxLEL = policy.GetValue<double?>("MaxLEL"),
            MaxCO = policy.GetValue<double?>("MaxCO"), MaxH2S = policy.GetValue<double?>("MaxH2S") };
    }
    public static string NormalizeKey(string module, string key) => module == "receipt" && int.TryParse(key, out var number) ? number.ToString(System.Globalization.CultureInfo.InvariantCulture)
        : Guid.TryParse(key, out var id) && id != Guid.Empty ? id.ToString() : throw new ApprovalException(400, "Mã hồ sơ không hợp lệ.");
    private static readonly ConcurrentDictionary<string, Queue<DateTime>> Failures = new();
    private static readonly JsonSerializerOptions Json = new() { ReferenceHandler = ReferenceHandler.IgnoreCycles };
    private static readonly HashSet<string> Excluded = ["IsSynced", "UpdatedAt", "Status", "DigitalSignatures", "ChiefOfficerSigned", "CaptainApproved", "FormTemplate", "Items"];

    public async Task<(object Entity, string Snapshot, string State)> SnapshotAsync(string module, string key)
    {
        key = NormalizeKey(module, key);
        object? entity = module switch
        {
            "sms" when Guid.TryParse(key, out var id) => await db.SmsFilledRecords.FindAsync(id),
            "permit" when Guid.TryParse(key, out var id) => await db.HsqeWorkPermits.FindAsync(id),
            "pms" when Guid.TryParse(key, out var id) => await db.MaintenanceTasks.FindAsync(id),
            "receipt" when int.TryParse(key, out var id) => await db.StockReceipts.FindAsync(id),
            _ when SigningRecords.All.TryGetValue(module, out var record) && Guid.TryParse(key, out var id) => await db.FindAsync(record.EntityType, id),
            _ => null
        };
        if (module == "report-engineer") entity = await db.BunkerReports.SingleOrDefaultAsync(r => r.MaritimeReportId == Guid.Parse(key));
        if (module.StartsWith("pms-risk") || module.StartsWith("pms-inspection"))
        {
            var task = await db.MaintenanceTasks.SingleOrDefaultAsync(t => t.Id == Guid.Parse(key) && !t.IsDeleted);
            entity = task == null ? null : module.StartsWith("pms-risk") ? await db.TaskRiskAssessments.SingleOrDefaultAsync(r => r.TaskId == task.TaskId) : (object?)await db.TaskInspectionReports.SingleOrDefaultAsync(r => r.TaskId == task.TaskId);
        }
        if (entity == null) throw new ApprovalException(404, "Không tìm thấy hồ sơ.");
        if (entity.GetType().GetProperty("IsDeleted")?.GetValue(entity) is true || entity.GetType().GetProperty("DeletedAt")?.GetValue(entity) != null) throw new ApprovalException(404, "Hồ sơ đã bị xóa.");
        var state = SigningRecords.State(entity, module);
        if (module == "pms" && entity is MaritimeEdge.Models.MaintenanceTask { PmsProtocolVersion: 2 } order)
        {
            if (!configuration.GetValue<bool>("Pms:ReworkApiEnabled")) throw new ApprovalException(503, "Workflow WO mới chưa được bật.");
            var report = await db.PmsWorkOrderReports.AsNoTracking().SingleOrDefaultAsync(r => r.WorkOrderId == order.Id && r.Revision == order.ReportRevision)
                ?? throw new ApprovalException(409, "WO chưa có bản gửi để kiểm tra.");
            if (ApprovalSnapshot.Hash(report.SnapshotJson) != report.ContentHash) throw new ApprovalException(409, "Báo cáo không còn khớp nội dung đã gửi.");
            var node = await runtime.GetSyncConfigAsync();
            return (entity, ApprovalSnapshot.Canonicalize(new { SchemaVersion = 2, order.Id, order.WorkflowVersion, report.Revision,
                report.ContentHash, SubmittedReport = report.SnapshotJson, node.NodeId, node.ShoreVesselId, node.VesselImo }), state);
        }
        var previous = await db.ApprovalRevisions.AsNoTracking().Where(r => db.ApprovalDocuments.Any(d => d.Id == r.DocumentId && d.Module == module && d.RecordKey == key)).OrderByDescending(r => r.Revision).FirstOrDefaultAsync();
        // Refer to the submitted version, including the original template, risk assessment and frozen files.
        if (previous != null && (module == "sms" && state is "Submitted" or "Approved" || module == "permit" && state is "PendingCheck" or "PendingIssue" or "Issued" or "Suspended" or "Closed" || module == "receipt" && state is "Submitted" or "Approved" or "Completed" || SigningRecords.All.ContainsKey(module) && state == "Signed"))
            return (entity, previous.SnapshotJson, state);
        var properties = db.Entry(entity).Properties.Where(p => !Excluded.Contains(p.Metadata.Name) && !p.Metadata.Name.EndsWith("Signature") && p.Metadata.Name != "ChiefEngineerApproval" && p.Metadata.Name != "SignedAt")
            .ToDictionary(p => p.Metadata.Name, p => p.CurrentValue);
        var identity = await runtime.GetSyncConfigAsync();
        properties["OriginNode"] = identity.NodeId;
        properties["VesselIdentity"] = new { identity.NodeId, identity.ShoreVesselId, identity.VesselImo, identity.VesselName };
        if (module == "permit") properties["PermitGasPolicy"] = GasPolicy(configuration);
        if (module == "hsqe-document") properties["Attachments"] = await db.HsqeDocumentAttachments.AsNoTracking().Where(a => a.DocumentId == Guid.Parse(key)).OrderBy(a => a.Id).ToListAsync();
        if (SigningRecords.All.ContainsKey(module) && previous == null)
            properties["LegacyUnverifiedSignatures"] = db.Entry(entity).Properties.Where(p => (p.Metadata.Name.EndsWith("Signature") || p.Metadata.Name == "ChiefEngineerApproval") && p.CurrentValue != null).ToDictionary(p => p.Metadata.Name, p => p.CurrentValue);
        if (module.StartsWith("log-abstract"))
        {
            var legs = await db.AbstractLogLegs.AsNoTracking().Where(l => l.AbstractLogVoyageId == Guid.Parse(key)).OrderBy(l => l.Id).ToListAsync();
            properties["Legs"] = legs;
            var legIds = legs.Select(l => l.Id).ToArray();
            properties["DailyEntries"] = await db.AbstractLogDailyEntries.AsNoTracking().Where(e => legIds.Contains(e.AbstractLogLegId)).OrderBy(e => e.Id).ToListAsync();
        }
        if (module == "report")
        {
            var reportId = Guid.Parse(key);
            properties["Noon"] = await db.NoonReports.AsNoTracking().FirstOrDefaultAsync(r => r.MaritimeReportId == reportId);
            properties["Departure"] = await db.DepartureReports.AsNoTracking().FirstOrDefaultAsync(r => r.MaritimeReportId == reportId);
            properties["Arrival"] = await db.ArrivalReports.AsNoTracking().FirstOrDefaultAsync(r => r.MaritimeReportId == reportId);
            properties["Bunker"] = await db.BunkerReports.AsNoTracking().FirstOrDefaultAsync(r => r.MaritimeReportId == reportId);
            properties["Position"] = await db.PositionReports.AsNoTracking().FirstOrDefaultAsync(r => r.MaritimeReportId == reportId);
            properties["Attachments"] = await db.ReportAttachments.AsNoTracking().Where(r => r.MaritimeReportId == reportId).OrderBy(r => r.Id).ToListAsync();
        }
        if (entity is MaritimeEdge.Models.SmsFilledRecord sms)
        {
            var template = await db.SmsFormTemplates.AsNoTracking().Include(t => t.Procedure).SingleAsync(t => t.Id == sms.SmsFormTemplateId);
            properties["Template"] = new { template.Id, template.FormCode, template.Title, template.ContentSchema,
                Procedure = template.Procedure == null ? null : new { template.Procedure.Id, template.Procedure.Version, template.Procedure.Content, template.Procedure.FilePath } };
        }
        if (entity is MaritimeEdge.Models.HsqeWorkPermit permit && permit.RiskAssessmentId.HasValue)
            properties["RiskAssessment"] = await db.HsqeRiskAssessments.AsNoTracking().SingleOrDefaultAsync(r => r.Id == permit.RiskAssessmentId);
        if (module == "receipt" && int.TryParse(key, out var receiptId))
            properties["Items"] = await db.StockReceiptItems.AsNoTracking().Where(i => i.ReceiptId == receiptId).OrderBy(i => i.Id).ToListAsync();
        if (module == "pms" && Guid.TryParse(key, out var taskId))
        {
            var task = (MaritimeEdge.Models.MaintenanceTask)entity;
            properties["Details"] = await db.MaintenanceTaskDetails.AsNoTracking().Where(i => i.MaintenanceTaskId == taskId).OrderBy(i => i.Id).ToListAsync();
            properties["Checklist"] = await db.TaskChecklistItems.AsNoTracking().Where(i => i.TaskId == task.TaskId).OrderBy(i => i.Id).ToListAsync();
            properties["RiskAssessment"] = await db.TaskRiskAssessments.AsNoTracking().SingleOrDefaultAsync(i => i.TaskId == task.TaskId);
            properties["InspectionReport"] = await db.TaskInspectionReports.AsNoTracking().SingleOrDefaultAsync(i => i.TaskId == task.TaskId);
        }
        if (previous == null && entity is MaritimeEdge.Models.SmsFilledRecord legacy && legacy.DigitalSignatures != "[]")
        {
            properties["LegacyUnverifiedSignatures"] = legacy.DigitalSignatures;
            properties["LegacyStatus"] = legacy.Status;
        }
        if (previous == null && entity is MaritimeEdge.Models.HsqeWorkPermit legacyPermit && (legacyPermit.DigitalSignatures != "[]" || legacyPermit.CaptainApproved || legacyPermit.ChiefOfficerSigned))
            properties["LegacyUnverifiedSignatures"] = new { legacyPermit.DigitalSignatures, legacyPermit.CaptainApproved, legacyPermit.ChiefOfficerSigned, legacyPermit.Status };
        if (!properties.ContainsKey("Files"))
        {
            var references = new List<object>();
            foreach (var path in FindFiles(JsonSerializer.SerializeToElement(properties, Json)).Distinct().OrderBy(p => p))
            {
                if (path.Contains('\\') || path.Split('/').Any(segment => segment is "." or "..") || !files.Exists(path)) throw new ApprovalException(409, "Tệp đính kèm chưa có hoặc đường dẫn không hợp lệ: " + path);
                var fileHash = await files.ComputeSha256HexAsync(path, default);
                var frozenPath = "/uploads/approval-evidence/" + fileHash + Path.GetExtension(path);
                if (!files.Exists(frozenPath)) await files.CopyAsync(path, frozenPath, default);
                if (await files.ComputeSha256HexAsync(frozenPath, default) != fileHash) throw new ApprovalException(409, "Tệp vừa thay đổi. Kiểm tra và ký lại.");
                references.Add(new { sourcePath = path, filePath = frozenPath, sha256 = fileHash, sizeBytes = files.GetFileSize(frozenPath) });
            }
            properties["Files"] = references;
        }
        return (entity, ApprovalSnapshot.Canonicalize(properties), state);
    }

    private static IEnumerable<string> FindFiles(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
            return element.EnumerateObject().SelectMany(p => FindFiles(p.Value));
        if (element.ValueKind == JsonValueKind.Array)
            return element.EnumerateArray().SelectMany(FindFiles);
        if (element.ValueKind == JsonValueKind.String)
        {
            var text = element.GetString() ?? "";
            if (text.StartsWith("/uploads/", StringComparison.Ordinal)) return [text.Split('?')[0]];
            if (text.StartsWith('{') || text.StartsWith('['))
                try { using var doc = JsonDocument.Parse(text); return FindFiles(doc.RootElement).ToArray(); } catch (JsonException) { }
        }
        return [];
    }

    public async Task<ApprovalActor> ActorAsync(HttpContext http, string module, string action)
    {
        var id = http.GetUserId() ?? throw new ApprovalException(401, "Cần đăng nhập.");
        var user = await db.Users.AsNoTracking().Include(u => u.Role).SingleOrDefaultAsync(u => u.Id == id && u.IsActive);
        if (user?.Role?.IsActive != true) throw new ApprovalException(403, "Tài khoản không hoạt động.");
        var crew = string.IsNullOrEmpty(user.CrewId) ? null : await db.CrewMembers.AsNoTracking().Include(c => c.Rank).SingleOrDefaultAsync(c => c.CrewId == user.CrewId);
        var required = module switch {
            "sms" => "hsqe.records." + (action == "submit" ? "sign" : action is "amend" ? "sign" : action),
            "permit" => "hsqe.permits." + (action is "submit" or "amend" ? "check" : action),
            "pms" => "pms.work." + (action == "submit" ? "execute" : action),
            "receipt" => "pms.receipts." + (action == "submit" ? "create" : action == "complete" ? "execute" : action == "reject" ? "approve" : action),
            _ when SigningRecords.All.TryGetValue(module, out var signing) => action is "sign" or "amend" ? signing.SignPermission ?? signing.Permission + ".approve" : signing.Permission + "." + action,
            _ => throw new ApprovalException(400, "Module không hợp lệ.")
        };
        var current = await permissions.GetAsync(id);
        var grants = current.Grants.ToHashSet();
        if (module is "sms" or "permit" || SigningRecords.All.ContainsKey(module))
        {
            // A system administrator does not impersonate an onboard officer.
            if (crew?.Rank?.IsActive != true || !(crew.IsOnboard || crew.OnboardStatus == "Approved"))
                throw new ApprovalException(403, "Cần tài khoản liên kết thuyền viên đang trên tàu có chức danh hoạt động.");
            var config = await db.RankPermissionConfigs.AsNoTracking().SingleOrDefaultAsync(c => c.RankId == crew.RankId);
            grants = (config == null ? [] : JsonSerializer.Deserialize<string[]>(config.GrantsJson) ?? []).ToHashSet();
        }
        if (!PermissionRegistry.Allows(grants, required) && !(module == "receipt" && action == "submit" && PermissionRegistry.Allows(grants, "pms.receipts.update")))
            throw new ApprovalException(403, "Chưa được giao quyền " + required + ".");
        return new(id, user.Username, crew?.CrewId, crew?.FullName ?? user.Username, crew?.Rank?.RankName ?? (current.IsAdmin ? "ADMIN" : "Account"), required);
    }

    public async Task ReauthenticateAsync(HttpContext http, ApprovalActor actor)
    {
        var keys = new[] { "user:" + actor.UserId, "ip:" + (http.Connection.RemoteIpAddress?.ToString() ?? "local") };
        foreach (var key in keys)
        {
            var queue = Failures.GetOrAdd(key, _ => new());
            lock (queue) {
                while (queue.TryPeek(out var time) && time < DateTime.UtcNow.AddMinutes(-5)) queue.Dequeue();
                if (queue.Count >= 5) throw new ApprovalException(429, "Quá nhiều lần sai mật khẩu. Thử lại sau 5 phút.");
            }
        }
        var password = http.Request.Headers["X-Approval-Password"].ToString();
        if (string.IsNullOrEmpty(password)) throw new ApprovalException(428, "Nhập lại mật khẩu để ký xác nhận.");
        var user = await db.Users.AsNoTracking().SingleAsync(u => u.Id == actor.UserId);
        var valid = user.LockoutUntil <= DateTime.UtcNow || user.LockoutUntil == null;
        valid &= !string.IsNullOrEmpty(user.PasswordSalt) ? AuthService.VerifyPassword(password, user.PasswordHash, user.PasswordSalt) : AuthService.VerifyLegacyPassword(password, user.PasswordHash);
        if (!valid) {
            foreach (var key in keys) { var queue = Failures[key]; lock (queue) queue.Enqueue(DateTime.UtcNow); }
            throw new ApprovalException(403, "Mật khẩu xác nhận không đúng hoặc tài khoản đang khóa.");
        }
    }

    public async Task<object> ContextAsync(HttpContext http, string module, string key, string action)
    {
        key = NormalizeKey(module, key);
        var actor = await ActorAsync(http, module, action);
        var snapshot = await SnapshotAsync(module, key);
        var node = (await runtime.GetSyncConfigAsync()).NodeId;
        var document = await db.ApprovalDocuments.AsNoTracking().SingleOrDefaultAsync(d => d.OriginNode == node && d.Module == module && d.RecordKey == key);
        return new { actor, module, recordKey = key, action, state = snapshot.State, version = document?.Version ?? 0,
            revision = document?.CurrentRevision ?? 0, contentHash = ApprovalSnapshot.Hash(snapshot.Snapshot), snapshot = JsonSerializer.Deserialize<JsonElement>(snapshot.Snapshot) };
    }
}
