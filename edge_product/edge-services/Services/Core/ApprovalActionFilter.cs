using System.Text.Json;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Core;

/// <summary>Evidence, business effects and durable sync events commit or roll back together.</summary>
public sealed class ApprovalActionFilter(EdgeDbContext db, ApprovalService approvals, IEdgeRuntimeConfigService runtime) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (context.ActionDescriptor is not ControllerActionDescriptor descriptor) { await next(); return; }
        var controller = descriptor.ControllerName;
        var name = descriptor.ActionName;
        if (controller == "PmsWorkOrders" && context.HttpContext.RequestServices.GetService<IConfiguration>()?.GetValue<bool>("Pms:ReworkApiEnabled") != true)
        { await next(); return; }
        if (controller == "Maintenance" && name is "UpdateTask" or "PatchTask" or "UpdateTaskStatus")
        {
            var id = context.ActionArguments.Values.OfType<Guid>().FirstOrDefault();
            var existing = await db.MaintenanceTasks.AsNoTracking().SingleOrDefaultAsync(t => t.Id == id);
            var body = context.ActionArguments.Values.FirstOrDefault(v => v != null && v is not Guid);
            var json = body is JsonElement element ? element : JsonSerializer.SerializeToElement(body, new JsonSerializerOptions(JsonSerializerDefaults.Web));
            var status = json.ValueKind == JsonValueKind.Object && json.TryGetProperty("status", out var value) ? value.GetString() : null;
            if (existing?.Status == "PENDING_APPROVAL" || status == "COMPLETED" && existing?.Status != "COMPLETED")
            { context.Result = new ConflictObjectResult(new { message = "Hồ sơ chờ duyệt bị khóa. Dùng thao tác duyệt / trả lại để thay trạng thái." }); return; }
        }
        if (controller is "TaskChecklistItems" or "PmsForms" && context.HttpContext.Request.Method != "GET")
        {
            var taskKey = context.ActionArguments.TryGetValue("taskId", out var value) ? value?.ToString() : "";
            var task = Guid.TryParse(taskKey, out var taskId) ? await db.MaintenanceTasks.AsNoTracking().SingleOrDefaultAsync(t => t.Id == taskId) : await db.MaintenanceTasks.AsNoTracking().SingleOrDefaultAsync(t => t.TaskId == taskKey);
            if (task?.Status == "PENDING_APPROVAL")
            { context.Result = new ConflictObjectResult(new { message = "Hồ sơ đang chờ duyệt. Trả lại trước khi sửa." }); return; }
        }
        if ((controller == "TaskWorkflow" && name == "BulkVerifyTasks") || (controller == "Hsqe" && name == "SignPermit"))
        { context.Result = new ObjectResult(new { message = "Dùng ký từng hồ sơ qua luồng xác nhận mới." }) { StatusCode = 409 }; return; }
        object? Argument(string key) => context.ActionArguments.TryGetValue(key, out var value) ? value : null;
        var module = controller switch { "Sms" => "sms", "Hsqe" => "permit", "TaskWorkflow" or "Maintenance" or "PmsWorkOrders" => "pms", "StockReceipt" => "receipt", "Approvals" => Argument("module")?.ToString(), _ => SigningRecords.Module(controller) };
        var action = (controller, name) switch {
            ("Sms", "SignRecord") => "submit", ("Sms", "ApproveRecord") => "approve",
            ("Hsqe", "ClosePermit") => "close",
            ("TaskWorkflow", "VerifyTask") => context.ActionArguments.Values.Any(v => v?.GetType().GetProperty("Action")?.GetValue(v)?.ToString() == "REJECT") ? "reject" : "approve",
            ("Maintenance", "ApproveTask") => context.ActionArguments.Values.Any(v => v?.GetType().GetProperty("IsApproved")?.GetValue(v) is false) ? "reject" : "approve",
            ("Maintenance", "CompleteTask") => "approve",
            ("PmsWorkOrders", "Approve") => "approve", ("PmsWorkOrders", "Return") => "reject",
            ("StockReceipt", "Submit") => "submit", ("StockReceipt", "Approve") => "approve", ("StockReceipt", "Complete") => "complete",
            ("Approvals", "Act") => Argument("action")?.ToString(),
            (_, "SignEntry") when SigningRecords.Module(controller) != null => "sign",
            ("Reporting", "ApproveReport") or ("Reporting", "ApproveAmendment") or ("Hsqe", "ApproveDocument") or ("Drill", "ApproveDrillLog") => "approve",
            _ => null
        };
        if (controller == "Hsqe" && name == "ApproveDocument") module = "hsqe-document";
        if (controller == "Drill" && name == "ApproveDrillLog") module = "drill-log";
        if (controller == "Reporting" && name == "ApproveAmendment") module = "report-amendment";
        if (module == null || action == null)
        {
            // Serialize draft writes with signing, preventing a concurrent save from changing a frozen record.
            var protectedWrite = (SigningRecords.Module(controller) != null && context.HttpContext.Request.Method != "GET") ||
                (controller == "WorkItemConfig" && context.HttpContext.Request.Method != "GET" &&
                    !(name == "Import" && context.ActionArguments.Values.Any(v => v?.GetType().GetProperty("ValidateOnly")?.GetValue(v) is true))) ||
                (controller == "TaskWorkflow" && name is "SaveProgress" or "SubmitTask") ||
                (controller == "Sms" && name == "UpdateFilledRecord") || (controller == "Hsqe" && name is "PerformGasTest" or "DeletePermit" or "UpdateDraftPermit");
            if (!protectedWrite) { await next(); return; }
            await using var writeTransaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync() : null;
            if (db.Database.IsNpgsql()) await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(7311042026)");
            try { await ValidateSigningWriteAsync(context, controller, name); }
            catch (ApprovalException ex) { context.Result = new ObjectResult(new { message = ex.Message }) { StatusCode = ex.Status }; return; }
            var result = await next();
            var statusCode = (result.Result as ObjectResult)?.StatusCode ?? (result.Result as StatusCodeResult)?.StatusCode ?? 200;
            if (result.Exception == null && statusCode < 400 && writeTransaction != null) await writeTransaction.CommitAsync();
            return;
        }
        var http = context.HttpContext;
        var key = (module == "report-amendment" ? Argument("amendmentId") : null)?.ToString() ?? Argument("id")?.ToString() ?? Argument("reportId")?.ToString() ?? Argument("key")?.ToString() ?? "";
        try
        {
            key = ApprovalService.NormalizeKey(module, key);
            if (context.ActionArguments.ContainsKey("key")) context.ActionArguments["key"] = key;
            var actor = await approvals.ActorAsync(http, module, action);
            await approvals.ReauthenticateAsync(http, actor);
            if (SigningRecords.All.TryGetValue(module, out var signingRecord))
                foreach (var dto in context.ActionArguments.Values.Where(v => v != null))
                    foreach (var field in dto!.GetType().GetProperties().Where(p => p.CanWrite && p.PropertyType == typeof(string) && (p.Name == "Signature" || p.Name.EndsWith("Signature"))))
                        field.SetValue(dto, actor.Name);
            var node = (await runtime.GetSyncConfigAsync()).NodeId;
            var idempotency = http.Request.Headers["X-Approval-Idempotency-Key"].ToString();
            if (!Guid.TryParse(idempotency, out _)) throw new ApprovalException(428, "Thiếu mã yêu cầu ký.");
            var versionText = http.Request.Headers["X-Approval-Version"].ToString();
            var hash = http.Request.Headers["X-Approval-Hash"].ToString();
            var requestHash = ApprovalSnapshot.Hash(ApprovalSnapshot.Canonicalize(new { module, key, action, hash, versionText, reason = http.Request.Headers["X-Approval-Reason"].ToString(), arguments = context.ActionArguments }));
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync() : null;
            if (db.Database.IsNpgsql()) await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(7311042026)");
            if (db.Database.IsNpgsql())
            {
                await db.Database.ExecuteSqlInterpolatedAsync($"SELECT id FROM users WHERE id = {actor.UserId} FOR SHARE");
                if (actor.CrewId != null)
                {
                    var rankId = await db.CrewMembers.Where(c => c.CrewId == actor.CrewId).Select(c => c.RankId).SingleOrDefaultAsync();
                    if (rankId.HasValue) await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(2026100602, {rankId.Value})");
                }
            }
            actor = await approvals.ActorAsync(http, module, action);
            await approvals.ReauthenticateAsync(http, actor);
            var previous = await db.ApprovalActions.SingleOrDefaultAsync(a => a.OriginNode == node && a.ActorUserId == actor.UserId && a.IdempotencyKey == idempotency);
            if (previous != null)
            {
                if (previous.RequestHash != requestHash) throw new ApprovalException(409, "Mã yêu cầu đã dùng cho nội dung khác.");
                context.Result = new ContentResult { Content = previous.ResponseJson, ContentType = "application/json", StatusCode = 200 };
                return;
            }
            var snapshot = await approvals.SnapshotAsync(module, key);
            if (SigningRecords.All.TryGetValue(module, out var definition) && action is "sign" or "approve" && SigningRecords.IsSigned(snapshot.Entity, definition))
                throw new ApprovalException(409, "Hồ sơ đã ký. Tạo sửa đổi có lý do trước khi ký lại.");
            var document = await db.ApprovalDocuments.SingleOrDefaultAsync(d => d.OriginNode == node && d.Module == module && d.RecordKey == key);
            if (!long.TryParse(versionText, out var expectedVersion) || expectedVersion != (document?.Version ?? 0) || hash != ApprovalSnapshot.Hash(snapshot.Snapshot))
                throw new ApprovalException(409, "Hồ sơ đã thay đổi. Tải lại và kiểm tra nội dung trước khi ký.");
            document ??= new ApprovalDocument { OriginNode = node, Module = module, RecordKey = key };
            var revision = await db.ApprovalRevisions.OrderByDescending(r => r.Revision).FirstOrDefaultAsync(r => r.DocumentId == document.Id);
            if (module == "sms" && action == "approve" || module == "permit" && action == "issue")
            {
                var submitter = await db.ApprovalActions.Where(a => a.DocumentId == document.Id && a.RevisionId == (revision == null ? Guid.Empty : revision.Id) && a.Action == "submit").OrderByDescending(a => a.CreatedAt).Select(a => (long?)a.ActorUserId).FirstOrDefaultAsync();
                if (submitter == actor.UserId) throw new ApprovalException(409, "Người gửi hồ sơ không được tự duyệt hoặc cấp phép cho hồ sơ đó.");
            }
            if (module is "sms" or "permit" && revision != null && action is "approve" or "check" or "issue" && revision.ContentHash != hash)
                throw new ApprovalException(409, "Nội dung đã thay đổi sau khi gửi. Trả lại và ký lại trước khi duyệt.");
            if (revision == null || revision.ContentHash != hash || action == "amend")
            {
                var reason = Uri.UnescapeDataString(http.Request.Headers["X-Approval-Reason"].ToString());
                revision = new ApprovalRevision { DocumentId = document.Id, OriginNode = node, Revision = (revision?.Revision ?? 0) + 1,
                    PreviousRevisionId = revision?.Id, SnapshotJson = snapshot.Snapshot, ContentHash = hash, Reason = reason };
            }
            if (SigningRecords.All.ContainsKey(module))
                foreach (var dto in context.ActionArguments.Values.Where(v => v != null))
                    dto!.GetType().GetProperty("SignedAt")?.SetValue(dto, DateTime.UtcNow);
            http.Items["ApprovalActor"] = actor;
            http.Items["ApprovalActionId"] = Guid.NewGuid();
            http.Items["ApprovalRevisionId"] = revision.Id;
            http.Items["ApprovalContentHash"] = hash;
            var existingHistoryIds = db.MaintenanceHistories.Local.Select(h => h.Id).ToHashSet();
            var executed = await next();
            var status = (executed.Result as ObjectResult)?.StatusCode ?? (executed.Result as StatusCodeResult)?.StatusCode ?? 200;
            if (executed.Exception != null || status >= 400) { if (transaction != null) await transaction.RollbackAsync(); return; }
            if (module == "pms" && action == "approve" && Guid.TryParse(key, out var taskId))
                foreach (var history in db.MaintenanceHistories.Local.Where(h => h.TaskId == taskId && !existingHistoryIds.Contains(h.Id)))
                {
                    var report = System.Text.Json.Nodes.JsonNode.Parse(history.ReportSnapshot ?? "{}") ?? new System.Text.Json.Nodes.JsonObject();
                    report["ApprovalEvidence"] = System.Text.Json.JsonSerializer.SerializeToNode(new { ActionId = (Guid)http.Items["ApprovalActionId"]!, RevisionId = revision.Id,
                        ContentHash = hash, actor.UserId, actor.Username, actor.Name, actor.Rank, actor.Authority, AuthenticationMethod = "password-reauthentication" });
                    history.ReportSnapshot = report.ToJsonString();
                    history.IsSynced = false;
                }
            if (db.Entry(document).State == EntityState.Detached) db.ApprovalDocuments.Add(document);
            if (db.Entry(revision).State == EntityState.Detached) db.ApprovalRevisions.Add(revision);
            document.CurrentRevision = revision.Revision;
            document.Version++;
            document.CurrentState = SigningRecords.State(snapshot.Entity, module);
            document.IsSynced = false;
            var response = executed.Result is ObjectResult result ? JsonSerializer.Serialize(result.Value, new JsonSerializerOptions(JsonSerializerDefaults.Web)) : "{}";
            db.ApprovalActions.Add(new ApprovalAction { Id = (Guid)http.Items["ApprovalActionId"]!, DocumentId = document.Id, RevisionId = revision.Id,
                OriginNode = node, ActorUserId = actor.UserId, ActorUsername = actor.Username, CrewId = actor.CrewId, ActorName = actor.Name, ActorRank = actor.Rank,
                Authority = actor.Authority, Action = action, Reason = Uri.UnescapeDataString(http.Request.Headers["X-Approval-Reason"].ToString()), ContentHash = hash,
                IdempotencyKey = idempotency, RequestHash = requestHash, ResponseJson = response });
            await db.SaveChangesAsync();
            if (transaction != null) await transaction.CommitAsync();
        }
        catch (ApprovalException ex) { context.Result = new ObjectResult(new { message = ex.Message }) { StatusCode = ex.Status }; }
        catch (DbUpdateConcurrencyException) { context.Result = new ConflictObjectResult(new { message = "Hồ sơ vừa được cập nhật. Tải lại trước khi ký." }); }
    }
    private async Task ValidateSigningWriteAsync(ActionExecutingContext context, string controller, string action)
    {
        var module = SigningRecords.Module(controller);
        if (controller == "Hsqe" && !action.Contains("Document")) return;
        if (controller == "Hsqe" && action is "AcknowledgeDocumentSync" or "MarkDocumentAsRead") return;
        if (controller == "Drill" && !action.Contains("Log")) return;
        if (module == null) return;
        var values = context.ActionArguments;
        object? Value(string key) => values.TryGetValue(key, out var value) ? value : null;
        var key = Value("id") ?? Value("reportId") ?? Value("documentId");
        if (controller == "Hsqe" && action == "BulkDeleteDocuments")
        {
            var ids = values.Values.Select(v => v?.GetType().GetProperty("DocumentIds")?.GetValue(v)).OfType<List<Guid>>().SelectMany(v => v).ToArray();
            if (await db.HsqeDocuments.AnyAsync(d => ids.Contains(d.Id) && d.ApprovedBy != null && d.ApprovedBy != "")) throw new ApprovalException(409, "Danh sách có tài liệu đã ký. Tạo sửa đổi trước khi xóa.");
        }
        if (controller == "AbstractLog" && key == null)
        {
            var legId = Value("legId") as Guid?;
            if (Value("entryId") is Guid entryId) legId = await db.AbstractLogDailyEntries.Where(e => e.Id == entryId).Select(e => (Guid?)e.AbstractLogLegId).SingleOrDefaultAsync();
            if (legId.HasValue) key = await db.AbstractLogLegs.Where(l => l.Id == legId).Select(l => (Guid?)l.AbstractLogVoyageId).SingleOrDefaultAsync();
        }
        if (controller == "PmsForms")
        {
            var taskKey = Value("taskId")?.ToString();
            var task = Guid.TryParse(taskKey, out var taskId) ? await db.MaintenanceTasks.SingleOrDefaultAsync(t => t.Id == taskId) : await db.MaintenanceTasks.SingleOrDefaultAsync(t => t.TaskId == taskKey);
            object? form = action == "SaveRiskAssessment" ? await db.TaskRiskAssessments.FirstOrDefaultAsync(r => r.TaskId == (task == null ? taskKey : task.TaskId)) : await db.TaskInspectionReports.FirstOrDefaultAsync(r => r.TaskId == (task == null ? taskKey : task.TaskId));
            if (form != null && SigningRecords.All.Values.Where(d => d.EntityType == form.GetType()).Any(d => SigningRecords.IsSigned(form, d))) throw new ApprovalException(409, "Biểu mẫu đã ký bị khóa. Tạo sửa đổi trước khi lưu.");
            if (Value("body") is JsonElement body && body.ValueKind == JsonValueKind.Object && body.EnumerateObject().Any(p => (p.Name.EndsWith("Signature", StringComparison.OrdinalIgnoreCase) || p.Name == "chiefEngineerApproval") && p.Value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(p.Value.GetString()))) throw new ApprovalException(409, "Không nhập tên chữ ký. Dùng ký xác nhận bằng tài khoản.");
        }
        if (controller is "WeeklyReport" or "MonthlyReport" or "AbstractLog")
            foreach (var dto in values.Values.Where(v => v != null))
                if (dto!.GetType().GetProperty("Status")?.GetValue(dto) is string status && status != "DRAFT") throw new ApprovalException(409, "Hoàn tất/phê duyệt phải dùng ký xác nhận, không đổi trạng thái khi lưu.");
        object? entity = key is Guid id ? await db.FindAsync(SigningRecords.All[module].EntityType, id) : null;
        if (controller == "Reporting" && action is "TransmitReport" or "CreateAmendment" or "SubmitAmendment" or "RejectAmendment") return;
        if (controller == "Reporting" && key is Guid reportKey && action != "TransmitReport" && await db.BunkerReports.AnyAsync(b => b.MaritimeReportId == reportKey && b.ChiefEngineerSignature != null && b.ChiefEngineerSignature != ""))
            throw new ApprovalException(409, "Báo cáo đã có xác nhận Máy trưởng. Tạo sửa đổi trước khi thay đổi.");
        if (entity != null && SigningRecords.All.Values.Where(d => d.EntityType == entity.GetType()).Any(d => SigningRecords.IsSigned(entity, d)))
        {
            // Report transmission remains permitted; its signed contents are unchanged.
            if (controller == "Reporting" && action is "TransmitReport" or "CreateAmendment" or "SubmitAmendment" or "RejectAmendment") return;
            throw new ApprovalException(409, "Nội dung đã ký bị khóa. Dùng sửa đổi có lịch sử trước khi thay đổi.");
        }
        foreach (var dto in values.Values.Where(v => v != null))
            foreach (var property in dto!.GetType().GetProperties().Where(p => p.PropertyType == typeof(string) && p.Name.EndsWith("Signature")))
                if (!string.IsNullOrWhiteSpace(property.GetValue(dto)?.ToString()))
                    throw new ApprovalException(409, "Không nhập chữ ký trong thao tác lưu. Dùng ký xác nhận bằng tài khoản.");
    }

}
