using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace MaritimeEdge.Services.Core;

public sealed class RankPermissionFilter(RankPermissionService permissions, MaritimeEdge.Data.EdgeDbContext db) : IAsyncActionFilter
{
    private static readonly HashSet<string> OwnAuthActions = ["Login", "LoginLegacy", "Logout", "RefreshToken", "ChangePassword", "ValidateSession", "Health"];
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (context.ActionDescriptor is not ControllerActionDescriptor action) { await next(); return; }
        var http = context.HttpContext;
        var controller = action.ControllerName;
        var name = action.ActionName;
        // Public and machine endpoints retain existing authentication/node-token policies.
        if (controller == "Health" || (controller == "Auth" && OwnAuthActions.Contains(name)) ||
            (controller == "Telemetry" && name == "PostNavigationData")) { await next(); return; }
        var userId = http.GetUserId();
        if (!userId.HasValue && controller is "Sync" or "EdgeProvisioning") { await next(); return; }
        if (!userId.HasValue) { context.Result = new UnauthorizedResult(); return; }
        var current = await permissions.GetAsync(userId.Value);
        if (!current.IsAccountActive) { context.Result = new UnauthorizedResult(); return; }
        // Refresh coarse account role used by legacy admin helpers; never trust the session cache.
        http.Items["RoleCode"] = current.IsAdmin ? "ADMIN" : "CREW";
        http.Items["EffectivePermissions"] = current;
        if (controller == "RankPermissions") { await next(); return; } // Controller enforces admin/self separately.
        if (controller == "Crew" && name == "AddCrew")
        {
            context.Result = new ObjectResult(new { error = "Tạo thuyền viên và gán chức danh trên bờ, sau đó đồng bộ xuống tàu." }) { StatusCode = 403 };
            return;
        }
        if (controller == "Crew" && name == "UpdateCrew")
        {
            var id = context.ActionArguments.Values.OfType<Guid>().FirstOrDefault();
            var requested = context.ActionArguments.Values.OfType<Maritime.Shared.Models.Crew.CrewMember>().FirstOrDefault();
            var existing = await db.CrewMembers.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id);
            if (existing != null && requested != null && (requested.RankId != existing.RankId || requested.CrewId != existing.CrewId))
            {
                context.Result = new ObjectResult(new { error = "Chức danh và mã thuyền viên do công ty quản lý. Hãy cập nhật trên bờ và đồng bộ xuống tàu." }) { StatusCode = 403 };
                return;
            }
        }
        // Shore-owned rank/country catalogues cannot be edited aboard, including by ADMIN.
        if (controller is "Ranks" or "Countries" or "RankCertificates" or "CountryCertificates")
        {
            if (http.Request.Method != "GET") { Deny(context); return; }
            await next(); return;
        }
        var required = PermissionRegistry.Resolve(controller, name);
        if (controller == "Maintenance" && name is "UpdateTask" or "PatchTask" or "UpdateTaskStatus")
        {
            var id = context.ActionArguments.Values.OfType<Guid>().FirstOrDefault();
            var task = await db.MaintenanceTasks.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id && !t.IsDeleted);
            var body = context.ActionArguments.Values.FirstOrDefault(v => v != null && v is not Guid);
            if (task != null && body != null)
            {
                var payload = body is JsonElement json ? json : JsonSerializer.SerializeToElement(body, new JsonSerializerOptions(JsonSerializerDefaults.Web));
                var extra = new List<string>();
                if (payload.TryGetProperty("status", out var status) && status.GetString() is string nextStatus && nextStatus != task.Status)
                {
                    // Completion/approval must use workflow endpoints and their side effects.
                    if (nextStatus is "COMPLETED" or "PENDING_APPROVAL" or "SUBMITTED" or "RECTIFY" or "APPROVED")
                    { context.Result = new BadRequestObjectResult(new { error = "Hãy sử dụng thao tác workflow để hoàn thành hoặc duyệt công việc." }); return; }
                    extra.Add("pms.work.execute");
                }
                if (payload.TryGetProperty("assignedTo", out var assigned) && assigned.GetString() != task.AssignedTo)
                    extra.Add("pms.work.assign");
                if (!current.IsAdmin && extra.Any(p => !PermissionRegistry.Allows(current.Grants.ToHashSet(), p)))
                { Deny(context); return; }
            }
        }
        // Approval endpoints also accept rejection. Check the actual submitted decision.
        var rejecting = context.ActionArguments.Values.Any(v => v?.GetType().GetProperty("IsApproved")?.GetValue(v) is false ||
            v?.GetType().GetProperty("Action")?.GetValue(v) is string decision && decision.Equals("REJECT", StringComparison.OrdinalIgnoreCase) ||
            v?.GetType().GetProperty("NewStatus")?.GetValue(v) is string statusDecision && statusDecision.Equals("REJECTED", StringComparison.OrdinalIgnoreCase));
        if (rejecting && required != null) required = required.Select(p => p.EndsWith(".approve") ? p[..^8] + ".reject" : p).ToArray();
        if (required?.Any(p => p is "pms.work.execute" or "pms.work.approve" or "pms.work.reject") == true)
        {
            var actor = await db.Users.Where(u => u.Id == userId).Select(u => new { u.CrewId, u.Username }).SingleAsync();
            // Execution needs an onboard crew identity; review is governed by approve/reject grants.
            if (required.Contains("pms.work.execute") &&
                (string.IsNullOrWhiteSpace(actor.CrewId) || !await db.CrewMembers.AnyAsync(c => c.CrewId == actor.CrewId &&
                    c.Rank != null && c.Rank.IsActive && (c.IsOnboard || c.OnboardStatus == "Approved"))))
            { context.Result = new ObjectResult(new { error = "Tài khoản phải liên kết với thuyền viên đang trên tàu để thực hiện công việc." }) { StatusCode = 403 }; return; }
            var actorId = !string.IsNullOrWhiteSpace(actor.CrewId) && await db.CrewMembers.AnyAsync(c => c.CrewId == actor.CrewId)
                ? actor.CrewId : actor.Username;
            http.Items["WorkflowActorId"] = actorId;
            foreach (var argument in context.ActionArguments.Values.Where(v => v != null))
                foreach (var field in new[] { "ApprovedBy", "CompletedBy", "PerformedBy" })
                {
                    var property = argument!.GetType().GetProperty(field);
                    if (property?.PropertyType != typeof(string) || !property.CanWrite) continue;
                    if (property.GetValue(argument) is string claimed && !string.IsNullOrWhiteSpace(claimed) && claimed != actorId)
                    { Deny(context); return; }
                    property.SetValue(argument, actorId);
                }
        }
        if (current.IsAdmin) { await next(); return; }
        // Auth administration is reserved for ADMIN. Own-account endpoints are exempt above.
        if (controller == "Auth") { Deny(context); return; }
        if (required == null || !required.Any(p => PermissionRegistry.Allows(current.Grants.ToHashSet(), p)))
        { Deny(context); return; }
        await next();
    }
    private static void Deny(ActionExecutingContext context) => context.Result = new ObjectResult(
        new { error = "Bạn không có quyền truy cập hoặc thực hiện thao tác này." }) { StatusCode = 403 };
}
