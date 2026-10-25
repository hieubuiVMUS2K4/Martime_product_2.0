using System.Security.Cryptography;
using System.Text.Json;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Maintenance;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

[Collection("PMS inventory")]
public partial class PmsWorkOrderWorkflowTests(PmsDatabaseFixture fixture)
{
    private const string Password = "Pms-workflow-test-password";
    private static IConfiguration Config() => new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
    { ["Pms:ReworkApiEnabled"] = "true", ["Pms:VesselTimeZone"] = "UTC" }).Build();
    private static IEdgeRuntimeConfigService Runtime()
    {
        var mock = new Mock<IEdgeRuntimeConfigService>(); mock.Setup(r => r.GetSyncConfigAsync()).ReturnsAsync(new EdgeSyncConfig { NodeId = "PMS-WORKFLOW" }); return mock.Object;
    }
    private static PmsWorkOrderWorkflowService Service(EdgeDbContext db) => new(db, new(db), Config());
    private static ApprovalService Approvals(EdgeDbContext db) => new(db, new(db), Runtime(), Mock.Of<ISyncFileStorageService>(), Config());
    private sealed record Setup(Guid JobId, Guid AssetId, Guid MaterialId, User Worker, User Reviewer, User Outsider, PmsWorkflowResult Order);

    private async Task<User> User(EdgeDbContext db, bool admin)
    {
        var code = Guid.NewGuid().ToString("N");
        var roleCode = admin ? "ADMIN" : "CREW";
        var role = await db.Roles.FirstOrDefaultAsync(r => r.RoleCode == roleCode);
        if (role == null) { role = new Role { RoleCode = roleCode, RoleName = roleCode }; db.Roles.Add(role); await db.SaveChangesAsync(); }
        string? crewCode = null;
        if (!admin)
        {
            var rank = new Maritime.Shared.Models.Crew.Rank { RankCode = code[..10], RankName = "Execution rank" };
            db.Ranks.Add(rank); await db.SaveChangesAsync(); crewCode = code;
            db.CrewMembers.Add(new() { CrewId = code, FullName = "Worker " + code[..6], RankId = rank.Id, IsOnboard = true });
            db.RankPermissionConfigs.Add(new() { RankId = rank.Id, GrantsJson = "[\"pms.work.access\",\"pms.work.execute\",\"pms.work.approve\",\"pms.work.reject\"]" });
        }
        var salt = Convert.ToBase64String(new byte[32]);
        var user = new User { Username = code, CrewId = crewCode, RoleId = role.Id, PasswordSalt = salt,
            PasswordHash = Convert.ToBase64String(Rfc2898DeriveBytes.Pbkdf2(Password, Convert.FromBase64String(salt), 100000, HashAlgorithmName.SHA256, 32)) };
        db.Users.Add(user); await db.SaveChangesAsync(); return user;
    }
    private async Task<Setup> Seed()
    {
        await using var db = fixture.CreateContext();
        var worker = await User(db, false); var reviewer = await User(db, true); var outsider = await User(db, false);
        var code = Guid.NewGuid().ToString("N");
        var asset = new EquipmentAsset { AssetCode = code, AssetName = "Fire pump", Category = "DECK", CurrentRunningHours = 1000, Status = "STANDBY" };
        var job = new MaintenanceSchedule { ScheduleCode = code, ScheduleName = "Pump service", EquipmentAssetId = asset.Id,
            IntervalType = "HYBRID", IntervalMonths = 3, IntervalHours = 100, BaselineAt = DateTime.UtcNow.Date.AddDays(7).AddMonths(-3),
            BaselineRunningHours = 1000, AutoGenerate = false, DaysBeforeDue = 7, WarningHours = 50, OriginNode = "PMS-WORKFLOW" };
        PmsJobRules.PrepareForSave(job);
        var category = new MaterialCategory { CategoryCode = code, Name = "Parts" }; db.MaterialCategories.Add(category); await db.SaveChangesAsync();
        var material = new MaterialItem { ItemCode = code, Name = "Gasket", CategoryId = category.Id, OnHandQuantity = 10 };
        var store = new StoreLocation { LocationCode = code, Name = "Engine store" };
        db.AddRange(asset, job, material, store, new ScheduleChecklistTemplate { ScheduleId = job.Id, SequenceOrder = 1,
            CheckpointDescription = "Measure pressure", RequiresReading = true, NormalRangeMin = 1, NormalRangeMax = 10, Unit = "bar" });
        db.InventoryStocks.Add(new() { MaterialItemId = material.Id, StoreLocationId = store.Id, Quantity = 10 }); await db.SaveChangesAsync();
        var workflow = Service(db);
        var released = await workflow.ReleaseAsync(new(job.Id, job.JobVersion!.Value, PmsJobRules.CycleKey(job), null), reviewer.Id);
        var assigned = await workflow.AssignAsync(released.Id, new(released.Version, worker.CrewId!, [], null), reviewer.Id, "WEB");
        return new(job.Id, asset.Id, material.Id, worker, reviewer, outsider, assigned);
    }
    private static async Task<SubmitPmsExecutionDto> Results(EdgeDbContext db, Setup setup, PmsWorkflowResult state, string notes = "Completed", decimal quantity = 2)
    {
        var code = await db.MaintenanceTasks.Where(t => t.Id == setup.Order.Id).Select(t => t.TaskId).SingleAsync();
        var item = await db.TaskChecklistItems.SingleAsync(c => c.TaskId == code);
        return new() { ExpectedVersion = state.Version, CommandId = Guid.NewGuid(), Notes = notes, ActualDurationMinutes = 120, RunningHours = 1001,
            Checklist = [new(item.Id, true, 5, "Normal")], Materials = [new(setup.MaterialId, quantity)] };
    }
    private sealed record SignedRequest(DecidePmsWorkOrderDto Body, string Hash, long DocumentVersion, string RequestId, bool Approve);
    private static async Task<SignedRequest> Prepare(EdgeDbContext db, PmsWorkflowResult state, bool approve, string? reason = null)
    {
        var snapshot = await Approvals(db).SnapshotAsync("pms", state.Id.ToString());
        var document = await db.ApprovalDocuments.SingleOrDefaultAsync(d => d.Module == "pms" && d.RecordKey == state.Id.ToString());
        return new(new(state.Version, state.Revision, state.ReportHash!, reason), ApprovalSnapshot.Hash(snapshot.Snapshot), document?.Version ?? 0, Guid.NewGuid().ToString(), approve);
    }
    private static async Task<PmsWorkflowResult> Sign(EdgeDbContext db, Setup setup, PmsWorkflowResult state, SignedRequest request)
    {
        using var provider = new ServiceCollection().AddSingleton(Config()).BuildServiceProvider();
        var http = new DefaultHttpContext { RequestServices = provider }; http.Items["UserId"] = setup.Reviewer.Id; http.Request.Method = "POST";
        http.Request.Headers["X-Approval-Password"] = Password; http.Request.Headers["X-Approval-Hash"] = request.Hash;
        http.Request.Headers["X-Approval-Version"] = request.DocumentVersion.ToString(); http.Request.Headers["X-Approval-Idempotency-Key"] = request.RequestId;
        http.Request.Headers["X-Approval-Reason"] = Uri.EscapeDataString(request.Body.Reason ?? "");
        var descriptor = new ControllerActionDescriptor { ControllerName = "PmsWorkOrders", ActionName = request.Approve ? "Approve" : "Return" };
        var action = new ActionContext(http, new(), descriptor, new ModelStateDictionary());
        var context = new ActionExecutingContext(action, [], new Dictionary<string, object?> { ["id"] = state.Id, ["dto"] = request.Body }, new object());
        PmsWorkflowResult? result = null;
        await new ApprovalActionFilter(db, Approvals(db), Runtime()).OnActionExecutionAsync(context, async () =>
        {
            var evidence = new PmsApprovalEvidence((Guid)http.Items["ApprovalActionId"]!, (Guid)http.Items["ApprovalRevisionId"]!, (string)http.Items["ApprovalContentHash"]!);
            result = await Service(db).DecideAsync(state.Id, request.Body, setup.Reviewer.Id, request.Approve, evidence, "WEB");
            return new ActionExecutedContext(action, [], new object()) { Result = new OkObjectResult(result) };
        });
        if (context.Result is ContentResult replay) return JsonSerializer.Deserialize<PmsWorkflowResult>(replay.Content!, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        if (context.Result is ObjectResult { StatusCode: >= 400 } failure)
            throw new ApprovalException(failure.StatusCode!.Value, JsonSerializer.Serialize(failure.Value));
        Assert.Null(context.Result); return Assert.IsType<PmsWorkflowResult>(result);
    }

    [PmsPostgresFact]
    public async Task FullWorkflowRetainsEverySubmission_SignsReviewsAndPostsInventoryExactlyOnce()
    {
        var setup = await Seed(); await using var db = fixture.CreateContext(); var workflow = Service(db);
        var state = await workflow.StartAsync(setup.Order.Id, new(setup.Order.Version), setup.Worker.Id, "MOBILE");
        var dto = await Results(db, setup, state, "First report");
        state = await workflow.SaveAsync(state.Id, dto, setup.Worker.Id, "WEB"); dto.ExpectedVersion = state.Version;
        state = await workflow.SubmitAsync(state.Id, dto, setup.Worker.Id, "WEB");
        Assert.Equal(10m, await db.InventoryStocks.Where(s => s.MaterialItemId == setup.MaterialId).Select(s => s.Quantity).SingleAsync());
        var first = await db.PmsWorkOrderReports.SingleAsync(r => r.WorkOrderId == state.Id); var original = first.SnapshotJson;
        var replay = await workflow.SubmitAsync(state.Id, dto, setup.Worker.Id, "WEB"); Assert.Equal(state.ReportId, replay.ReportId);
        state = await Sign(db, setup, state, await Prepare(db, state, false, "Recheck pressure")); Assert.Equal("RECTIFY", state.Status);
        Assert.Equal(original, first.SnapshotJson); Assert.Equal("RETURNED", first.Decision);
        state = await workflow.StartAsync(state.Id, new(state.Version), setup.Worker.Id, "WEB");
        dto = await Results(db, setup, state, "Second report"); state = await workflow.SubmitAsync(state.Id, dto, setup.Worker.Id, "WEB");
        var renamedMaterial = await db.MaterialItems.SingleAsync(m => m.Id == setup.MaterialId);
        renamedMaterial.Name = "Renamed after submission"; await db.SaveChangesAsync();
        var asset = await db.EquipmentAssets.SingleAsync(a => a.Id == setup.AssetId); asset.CurrentRunningHours = 1200; await db.SaveChangesAsync();
        var request = await Prepare(db, state, true); var completed = await Sign(db, setup, state, request);
        Assert.Equal("COMPLETED", completed.Status); Assert.Equal(2, completed.Revision);
        var retried = await Sign(db, setup, state, request); Assert.Equal(completed, retried);
        Assert.Equal(8m, await db.InventoryStocks.Where(s => s.MaterialItemId == setup.MaterialId).Select(s => s.Quantity).SingleAsync());
        Assert.Single(await db.PmsWorkOrderMaterialPostings.Where(p => p.WorkOrderId == state.Id).ToListAsync());
        var job = await db.MaintenanceSchedules.SingleAsync(j => j.Id == setup.JobId);
        var approved = await db.PmsWorkOrderReports.SingleAsync(r => r.WorkOrderId == state.Id && r.Decision == "APPROVED");
        var frozen = JsonSerializer.Deserialize<PmsSubmissionSnapshot>(approved.SnapshotJson, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        Assert.Equal("Gasket", Assert.Single(frozen.Materials).Name);
        Assert.Contains("Gasket", (await db.PmsWorkOrderMaterialPostings.SingleAsync(p => p.WorkOrderId == state.Id)).StockSnapshotJson);
        Assert.Equal(1101d, job.NextDueRunningHours); Assert.Equal(approved.SubmittedAt.AddMonths(3), job.NextDueDate);
        Assert.Equal(1200d, asset.CurrentRunningHours); Assert.Equal("STANDBY", asset.Status);
        Assert.Equal(original, first.SnapshotJson); Assert.Equal(2, await db.ApprovalActions.CountAsync(a => a.ActorUserId == setup.Reviewer.Id));
        var history = await new PmsJobHistoryService(db).ListAsync(setup.JobId, new(), default);
        Assert.Equal(approved.Id, Assert.Single(history.Items).Id); Assert.False(history.Items[0].IsLegacy);
        Assert.True(await db.SyncQueue.AnyAsync(q => q.RecordKey == approved.Id.ToString() && q.TableName == "pms_work_order_report"));
        var evidence = JsonSerializer.Deserialize<JsonElement>(approved.ApprovalEvidenceJson!);
        var actionId = evidence.GetProperty("evidence").GetProperty("ActionId").GetGuid();
        Assert.True(await db.ApprovalActions.AnyAsync(a => a.Id == actionId));
        Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.ReleaseAsync(
            new(job.Id, job.JobVersion!.Value, "PERIODIC:1", "Retry old release after approval"), setup.Reviewer.Id))).Status);
        Assert.Single(await db.MaintenanceTasks.Where(t => t.ScheduleId == job.Id).ToListAsync());
    }

    [PmsPostgresFact]
    public async Task AssignmentOnboardAndIndependentReviewAreEnforced_ReportsCannotBeOverwritten()
    {
        var setup = await Seed(); await using var db = fixture.CreateContext(); var workflow = Service(db);
        Assert.Equal(403, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.StartAsync(setup.Order.Id, new(setup.Order.Version), setup.Outsider.Id, "WEB"))).Status);
        var state = await workflow.StartAsync(setup.Order.Id, new(setup.Order.Version), setup.Worker.Id, "WEB");
        var dto = await Results(db, setup, state); state = await workflow.SubmitAsync(state.Id, dto, setup.Worker.Id, "WEB");
        dto.ExpectedVersion = state.Version;
        Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.SaveAsync(state.Id, dto, setup.Worker.Id, "WEB"))).Status);
        Assert.Equal(403, (await Assert.ThrowsAsync<PmsRequestException>(() => workflow.DecideAsync(state.Id,
            new(state.Version, state.Revision, state.ReportHash!, null), setup.Worker.Id, true, new(Guid.NewGuid(), Guid.NewGuid(), "hash"), "WEB"))).Status);
        var report = await db.PmsWorkOrderReports.SingleAsync(r => r.WorkOrderId == state.Id); report.SnapshotJson = "tampered";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }

    [PmsPostgresFact]
    public async Task InsufficientStockRollsBackDecisionCycleAndSigningEvidence()
    {
        var setup = await Seed();
        await using (var db = fixture.CreateContext())
        {
            var state = await Service(db).StartAsync(setup.Order.Id, new(setup.Order.Version), setup.Worker.Id, "WEB");
            var dto = await Results(db, setup, state, quantity: 11); state = await Service(db).SubmitAsync(state.Id, dto, setup.Worker.Id, "WEB");
            var request = await Prepare(db, state, true);
            Assert.Equal(409, (await Assert.ThrowsAsync<PmsRequestException>(() => Sign(db, setup, state, request))).Status);
        }
        await using var check = fixture.CreateContext();
        Assert.Equal("PENDING_APPROVAL", (await check.MaintenanceTasks.SingleAsync(t => t.Id == setup.Order.Id)).Status);
        Assert.Null((await check.MaintenanceSchedules.SingleAsync(j => j.Id == setup.JobId)).LastExecutedAt);
        Assert.Null((await check.PmsWorkOrderReports.SingleAsync(r => r.WorkOrderId == setup.Order.Id)).Decision);
        Assert.False(await check.PmsWorkOrderMaterialPostings.AnyAsync(p => p.WorkOrderId == setup.Order.Id));
        Assert.False(await check.ApprovalActions.AnyAsync(a => a.ActorUserId == setup.Reviewer.Id));
        Assert.Equal(10m, await check.InventoryStocks.Where(s => s.MaterialItemId == setup.MaterialId).Select(s => s.Quantity).SingleAsync());
    }

    [PmsPostgresFact]
    public async Task ConcurrentSignedApprovalsCommitOneDecisionAndOneStockPosting()
    {
        var setup = await Seed(); PmsWorkflowResult state; SignedRequest first; SignedRequest second;
        await using (var db = fixture.CreateContext())
        {
            state = await Service(db).StartAsync(setup.Order.Id, new(setup.Order.Version), setup.Worker.Id, "WEB");
            state = await Service(db).SubmitAsync(state.Id, await Results(db, setup, state), setup.Worker.Id, "WEB");
            first = await Prepare(db, state, true); second = await Prepare(db, state, true);
        }
        async Task<int> Attempt(SignedRequest request)
        {
            await using var db = fixture.CreateContext();
            try { await Sign(db, setup, state, request); return 200; }
            catch (ApprovalException error) { return error.Status; }
        }
        var results = await Task.WhenAll(Attempt(first), Attempt(second));
        Assert.Equal(new[] { 200, 409 }, results.Order().ToArray());
        await using var check = fixture.CreateContext();
        Assert.Equal(8m, await check.InventoryStocks.Where(s => s.MaterialItemId == setup.MaterialId).Select(s => s.Quantity).SingleAsync());
        Assert.Single(await check.PmsWorkOrderMaterialPostings.Where(p => p.WorkOrderId == state.Id).ToListAsync());
        Assert.Single(await check.ApprovalActions.Where(a => a.ActorUserId == setup.Reviewer.Id).ToListAsync());
        Assert.Equal(2L, (await check.MaintenanceSchedules.SingleAsync(j => j.Id == setup.JobId)).NextCycleNumber);
    }

    [PmsPostgresFact]
    public async Task AdHocOrderNeedsNoFakeJobAndKeepsEquipmentHeldUntilLastOrderEnds()
    {
        var setup = await Seed(); await using var db = fixture.CreateContext();
        var extra = new MaintenanceTask { TaskId = "WO-" + Guid.NewGuid().ToString("N"), PmsProtocolVersion = 2, WorkflowVersion = 1,
            EquipmentAssetId = setup.AssetId, Status = "ASSIGNED", AssignedTo = setup.Worker.CrewId, OriginNode = "PMS-WORKFLOW" };
        db.MaintenanceTasks.Add(extra); await db.SaveChangesAsync(); var workflow = Service(db);
        var periodic = await workflow.StartAsync(setup.Order.Id, new(setup.Order.Version), setup.Worker.Id, "WEB");
        var adHoc = await workflow.StartAsync(extra.Id, new(1), setup.Worker.Id, "WEB");
        adHoc = await workflow.SubmitAsync(extra.Id, new() { ExpectedVersion = adHoc.Version, CommandId = Guid.NewGuid(), ActualDurationMinutes = 30 }, setup.Worker.Id, "WEB");
        await Sign(db, setup, adHoc, await Prepare(db, adHoc, true));
        var report = await db.PmsWorkOrderReports.SingleAsync(r => r.WorkOrderId == extra.Id); Assert.Null(report.JobId);
        Assert.Equal("UNDER_MAINTENANCE", (await db.EquipmentAssets.SingleAsync(a => a.Id == setup.AssetId)).Status);
        Assert.Null((await db.MaintenanceSchedules.SingleAsync(j => j.Id == setup.JobId)).LastExecutedAt);
        await workflow.CancelAsync(periodic.Id, new(periodic.Version, "Cancelled with reason"), setup.Reviewer.Id, "WEB");
        Assert.Equal("STANDBY", (await db.EquipmentAssets.SingleAsync(a => a.Id == setup.AssetId)).Status);
        Assert.Empty((await new PmsJobHistoryService(db).ListAsync(setup.JobId, new(), default)).Items);
    }
}
