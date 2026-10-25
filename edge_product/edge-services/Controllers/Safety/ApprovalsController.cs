using MaritimeEdge.Data;
using MaritimeEdge.Services.Core;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Maritime.Shared.Models.Sync;

namespace MaritimeEdge.Controllers.Safety;

[ApiController]
[Route("api/approvals")]
public sealed class ApprovalsController(EdgeDbContext db, ApprovalService approvals, IConfiguration configuration) : ControllerBase
{
    [HttpGet("{module}/{key}/context")]
    public async Task<IActionResult> Context(string module, string key, [FromQuery] string action)
    {
        try { return Ok(await approvals.ContextAsync(HttpContext, module, key, action)); }
        catch (ApprovalException ex) { return StatusCode(ex.Status, new { message = ex.Message }); }
    }

    [HttpGet("{module}/{key}/history")]
    public async Task<IActionResult> History(string module, string key)
    {
        try { key = ApprovalService.NormalizeKey(module, key); }
        catch (ApprovalException ex) { return StatusCode(ex.Status, new { message = ex.Message }); }
        var permission = module switch { "sms" or "permit" => "hsqe.view", "pms" => "pms.work.view", "receipt" => "pms.receipts.view", _ when SigningRecords.All.TryGetValue(module, out var signing) => signing.Permission + ".view", _ => "" };
        if (permission == "") return BadRequest();
        var current = HttpContext.Items["EffectivePermissions"] as EffectivePermissions;
        if (current == null || !PermissionRegistry.Allows(current.Grants.ToHashSet(), permission)) return Forbid();
        var doc = await db.ApprovalDocuments.AsNoTracking().SingleOrDefaultAsync(d => d.Module == module && d.RecordKey == key);
        if (doc == null) return Ok(new { legacy = true, message = "Chưa có xác nhận bằng tài khoản. Dấu ký cũ chưa được xác thực.", actions = Array.Empty<object>(), revisions = Array.Empty<object>() });
        return Ok(new { document = doc, revisions = await db.ApprovalRevisions.AsNoTracking().Where(r => r.DocumentId == doc.Id).OrderBy(r => r.Revision).ToListAsync(),
            actions = await db.ApprovalActions.AsNoTracking().Where(a => a.DocumentId == doc.Id).OrderBy(a => a.CreatedAt)
                .Select(a => new { a.Id, a.RevisionId, a.ActorUserId, a.ActorUsername, a.ActorName, a.ActorRank, a.CrewId, a.Authority, a.Action, a.Reason, a.ContentHash, a.AuthenticationMethod, a.CreatedAt }).ToListAsync() });
    }

    public sealed record ActionRequest(string? Reason);
    [HttpPost("{module}/{key}/{action}")]
    public async Task<IActionResult> Act(string module, string key, string action, [FromBody] ActionRequest request)
    {
        key = ApprovalService.NormalizeKey(module, key);
        var snapshot = await approvals.SnapshotAsync(module, key);
        var actor = (ApprovalActor)HttpContext.Items["ApprovalActor"]!;
        request = request with { Reason = Uri.UnescapeDataString(HttpContext.Request.Headers["X-Approval-Reason"].ToString()) };
        if (action is "reject" or "amend" or "suspend" && string.IsNullOrWhiteSpace(request.Reason))
            return BadRequest(new { message = "Cần nhập lý do." });
        if (snapshot.Entity is MaritimeEdge.Models.SmsFilledRecord sms)
        {
            if (action == "reject" && sms.Status == "Submitted") sms.Status = "Returned";
            else if (action == "amend" && (sms.Status is "Returned" or "Approved" || sms.Status == "Submitted" && !await db.ApprovalDocuments.AnyAsync(d => d.Module == "sms" && d.RecordKey == key))) sms.Status = "Draft";
            else return Conflict(new { message = "Thao tác không phù hợp trạng thái hồ sơ." });
            // Earlier signatures remain in immutable evidence; the current draft has no valid signature.
            sms.DigitalSignatures = "[]";
            sms.UpdatedAt = DateTime.UtcNow;
            sms.IsSynced = false;
        }
        else if (snapshot.Entity is MaritimeEdge.Models.HsqeWorkPermit permit)
        {
            var now = DateTime.UtcNow;
            switch (action)
            {
                case "submit" when permit.Status == "Draft":
                    if (permit.PermitType is not ("Cold" or "Hot" or "Aloft" or "Enclosed")) return BadRequest(new { message = "Loại giấy phép không hợp lệ." });
                    if (string.IsNullOrWhiteSpace(permit.Location) || string.IsNullOrWhiteSpace(permit.Title) || permit.DurationHours <= 0 || permit.DurationHours > 24 || permit.RiskAssessmentId == null)
                        return BadRequest(new { message = "Cần công việc, địa điểm, đánh giá rủi ro và thời hạn 1–24 giờ." });
                    if (!await db.HsqeRiskAssessments.AnyAsync(r => r.Id == permit.RiskAssessmentId)) return BadRequest(new { message = "Đánh giá rủi ro không tồn tại." });
                    try
                    {
                        using var precautions = JsonDocument.Parse(permit.PrecautionsJson);
                        if (precautions.RootElement.ValueKind != JsonValueKind.Array || precautions.RootElement.GetArrayLength() == 0 || precautions.RootElement.EnumerateArray().Any(p => !p.TryGetProperty("checked", out var value) || value.ValueKind != JsonValueKind.True))
                            return BadRequest(new { message = "Cần kiểm tra đầy đủ biện pháp an toàn trước khi gửi." });
                    }
                    catch (JsonException) { return BadRequest(new { message = "Biện pháp an toàn không hợp lệ." }); }
                    permit.Status = "PendingCheck";
                    break;
                case "check" when permit.Status == "PendingCheck":
                    permit.Status = "PendingIssue";
                    permit.ChiefOfficerSigned = true;
                    break;
                case "issue" when permit.Status == "PendingIssue":
                    // Company SMS supplies gas limits and freshness; demo limits are not certified policy.
                    if (permit.PermitType is "Hot" or "Enclosed")
                    {
                        var policy = configuration.GetSection("Approval:PermitGasPolicy");
                        if (new[] { "MinO2", "MaxO2", "MaxLEL", "MaxCO", "MaxH2S", "MaxAgeMinutes", "Version" }.Any(k => string.IsNullOrWhiteSpace(policy[k])) || policy.GetValue<int>("MaxAgeMinutes") <= 0 || policy.GetValue<double>("MinO2") >= policy.GetValue<double>("MaxO2") || policy.GetValue<double>("MaxLEL") <= 0 || policy.GetValue<double>("MaxCO") <= 0 || policy.GetValue<double>("MaxH2S") < 0)
                            return Conflict(new { message = "Cần cấu hình đầy đủ tiêu chí đo khí và phiên bản SMS của công ty." });
                        using var frozen = JsonDocument.Parse(snapshot.Snapshot);
                        if (!frozen.RootElement.TryGetProperty("PermitGasPolicy", out var signedPolicy) || ApprovalSnapshot.Canonicalize(signedPolicy) != ApprovalSnapshot.Canonicalize(ApprovalService.GasPolicy(configuration)))
                            return Conflict(new { message = "Tiêu chí đo khí đã thay đổi. Sửa đổi và kiểm tra lại giấy phép." });
                        if (!policy.GetValue<bool>("Enabled")) return Conflict(new { message = "Chưa cấu hình tiêu chí đo khí của công ty cho phép này." });
                        if (permit.GasTestAt == null || permit.GasTestAt > now || permit.GasTestAt < now.AddMinutes(-policy.GetValue<int>("MaxAgeMinutes")) || string.IsNullOrWhiteSpace(permit.GasTestDevice) || string.IsNullOrWhiteSpace(permit.GasTestBy))
                            return BadRequest(new { message = "Cần kết quả đo khí mới, người đo và thiết bị đo." });
                        if (permit.GasTestO2 < policy.GetValue<double>("MinO2") || permit.GasTestO2 > policy.GetValue<double>("MaxO2") || permit.GasTestLEL >= policy.GetValue<double>("MaxLEL") || permit.GasTestCO >= policy.GetValue<double>("MaxCO") || permit.GasTestH2S > policy.GetValue<double>("MaxH2S"))
                            return BadRequest(new { message = "Kết quả đo khí vượt tiêu chí của công ty." });
                    }
                    var check = await db.ApprovalActions.Where(a => a.DocumentId == db.ApprovalDocuments.Where(d => d.Module == "permit" && d.RecordKey == key).Select(d => d.Id).FirstOrDefault() && a.Action == "check").OrderByDescending(a => a.CreatedAt).FirstOrDefaultAsync();
                    if (check == null || check.ActorUserId == actor.UserId) return Conflict(new { message = "Người cấp phép phải khác người kiểm tra." });
                    if (now >= permit.StartTime.AddHours(permit.DurationHours)) return Conflict(new { message = "Giấy phép đã hết thời hạn. Sửa đổi và kiểm tra lại." });
                    permit.Status = "Issued";
                    permit.CaptainApproved = true;
                    break;
                case "close" when permit.Status is "Issued" or "Suspended": permit.Status = "Closed"; break;
                case "suspend" when permit.Status == "Issued": permit.Status = "Suspended"; break;
                case "reject" when permit.Status is "PendingCheck" or "PendingIssue": permit.Status = "Returned"; break;
                case "amend" when permit.Status is "Returned" or "Suspended" or "Closed" or "Active" or "Issued":
                    permit.Status = "Draft"; permit.ChiefOfficerSigned = false; permit.CaptainApproved = false; permit.DigitalSignatures = "[]"; break;
                default: return Conflict(new { message = "Thao tác không phù hợp trạng thái giấy phép." });
            }
            permit.UpdatedAt = now;
            permit.IsSynced = false;
        }
        else if (SigningRecords.All.TryGetValue(module, out var signing))
        {
            if (module is "report" or "report-amendment" || module is "hsqe-document" or "drill-log" && action != "amend") return BadRequest(new { message = "Dùng thao tác phê duyệt báo cáo." });
            if (module == "report-engineer")
            {
                var parent = await db.MaritimeReports.FindAsync(Guid.Parse(key));
                if (parent == null || !string.IsNullOrEmpty(parent.MasterSignature)) return Conflict(new { message = "Báo cáo đã duyệt. Dùng quy trình sửa đổi báo cáo." });
            }
            if (action == "sign")
            {
                if (SigningRecords.IsSigned(snapshot.Entity, signing)) return Conflict(new { message = "Hồ sơ đã ký." });
                snapshot.Entity.GetType().GetProperty(signing.SignatureField)!.SetValue(snapshot.Entity, actor.Name);
                snapshot.Entity.GetType().GetProperty("SignedAt")?.SetValue(snapshot.Entity, DateTime.UtcNow);
                snapshot.Entity.GetType().GetProperty(signing.SignatureField.Replace("Signature", "SignedAt"))?.SetValue(snapshot.Entity, DateTime.UtcNow);
                if (module is "report-weekly" or "report-monthly") snapshot.Entity.GetType().GetProperty("Status")?.SetValue(snapshot.Entity, "APPROVED");
            }
            else if (action == "amend")
            {
                if (!SigningRecords.IsSigned(snapshot.Entity, signing)) return Conflict(new { message = "Hồ sơ chưa ký." });
                // Abstract log signatures share the same content: changing it invalidates both current confirmations.
                foreach (var definition in SigningRecords.All.Values.Where(d => d.EntityType == snapshot.Entity.GetType()))
                    snapshot.Entity.GetType().GetProperty(definition.SignatureField)!.SetValue(snapshot.Entity, null);
                snapshot.Entity.GetType().GetProperty("SignedAt")?.SetValue(snapshot.Entity, null);
                snapshot.Entity.GetType().GetProperty("MasterSignedAt")?.SetValue(snapshot.Entity, null);
                snapshot.Entity.GetType().GetProperty("ChiefEngineerSignedAt")?.SetValue(snapshot.Entity, null);
                if (module == "hsqe-document")
                {
                    snapshot.Entity.GetType().GetProperty("DigitalSignature")?.SetValue(snapshot.Entity, null);
                    snapshot.Entity.GetType().GetProperty("ApprovedAt")?.SetValue(snapshot.Entity, null);
                    snapshot.Entity.GetType().GetProperty("Status")?.SetValue(snapshot.Entity, "Draft");
                }
                if (module == "drill-log")
                {
                    snapshot.Entity.GetType().GetProperty("IsLocked")?.SetValue(snapshot.Entity, false);
                    snapshot.Entity.GetType().GetProperty("VerifiedDate")?.SetValue(snapshot.Entity, null);
                }
                if (module is "report-weekly" or "report-monthly") snapshot.Entity.GetType().GetProperty("Status")?.SetValue(snapshot.Entity, "DRAFT");
            }
            else return BadRequest();
            snapshot.Entity.GetType().GetProperty("UpdatedAt")?.SetValue(snapshot.Entity, DateTime.UtcNow);
            snapshot.Entity.GetType().GetProperty("IsSynced")?.SetValue(snapshot.Entity, false);
        }
        else if (snapshot.Entity is MaritimeEdge.Models.StockReceipt receipt && action == "reject")
        {
            if (receipt.Status != "Submitted") return Conflict(new { message = "Chỉ trả lại phiếu nhập đang chờ duyệt." });
            receipt.Status = "Draft";
            receipt.UpdatedAt = DateTime.UtcNow;
            receipt.IsSynced = false;
        }
        else return BadRequest(new { message = "Dùng thao tác của module PMS hoặc phiếu nhập." });
        await db.SaveChangesAsync();
        return Ok(new { status = snapshot.Entity.GetType().GetProperty("Status")?.GetValue(snapshot.Entity), message = "Đã lưu xác nhận." });
    }
}
