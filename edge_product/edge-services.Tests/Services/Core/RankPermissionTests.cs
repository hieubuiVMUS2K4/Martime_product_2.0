using System.Text.Json;
using MaritimeEdge.Controllers.Core;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Tests.Inventory;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

public class RankPermissionTests
{
    [Fact]
    public void Materials_AreReadOnlyAndReceiptWorkflowRightsAreIndependent()
    {
        Assert.Equal(new[] { "view" }, PermissionRegistry.Data.Modules.Single(m => m.Code == "pms.materials").Actions);
        var grants = new HashSet<string> { "pms.receipts.access", "pms.receipts.update" };
        Assert.False(PermissionRegistry.Allows(grants, "pms.receipts.approve"));
        Assert.False(PermissionRegistry.Allows(grants, "pms.receipts.execute"));
        Assert.Equal(new[] { "pms.receipts.approve" }, PermissionRegistry.Resolve("StockReceipt", "Approve"));
        Assert.Equal(new[] { "pms.receipts.execute" }, PermissionRegistry.Resolve("StockReceipt", "Complete"));
    }
    [Fact]
    public void ModuleAccess_IsReadOnlyAcrossTheEntireRegistry()
    {
        foreach (var module in PermissionRegistry.Data.Modules)
        {
            var grants = new HashSet<string> { module.Code + ".access" };
            Assert.True(PermissionRegistry.Allows(grants, module.Code + ".view"));
            foreach (var action in module.Actions.Where(a => a != "view"))
                Assert.False(PermissionRegistry.Allows(grants, module.Code + "." + action));
        }
    }

    [Fact]
    public void ActionBundles_OnlyExpandDeclaredActionsAndStillRequireAccess()
    {
        foreach (var module in PermissionRegistry.Data.Modules)
        foreach (var bundle in new[] { new[] { "create", "delete", "import" }, new[] { "update", "assign" } })
        foreach (var selected in bundle.Where(module.Actions.Contains))
        {
            var grants = new HashSet<string> { module.Code + ".access", module.Code + "." + selected };
            var normalized = PermissionRegistry.ConfigurableGrants(grants).ToHashSet();
            foreach (var action in bundle)
                Assert.Equal(module.Actions.Contains(action), PermissionRegistry.Allows(grants, module.Code + "." + action));
            foreach (var action in module.Actions.Where(a => a != "view" && !bundle.Contains(a)))
                Assert.False(PermissionRegistry.Allows(normalized, module.Code + "." + action));
            grants.Remove(module.Code + ".access");
            Assert.False(PermissionRegistry.Allows(grants, module.Code + "." + selected));
        }
    }

    [Fact]
    public async Task EquipmentAccessSwitch_RejectsEveryMutationWithoutActionGrants()
    {
        await using var db = Database(); var (user, rankId) = await Seed(db);
        db.RankPermissionConfigs.Add(new() { RankId = rankId, GrantsJson = "[\"pms.assets.access\"]" });
        await db.SaveChangesAsync();
        Assert.True(await Call(db, user.Id, "EquipmentAsset", "GetAll", "GET"));
        foreach (var binding in PermissionRegistry.Data.Bindings.Where(b => b.Controller == "EquipmentAsset" &&
            b.Grants.Contains("pms.assets.create") || b.Controller == "EquipmentAsset" &&
            b.Grants.Any(g => g is "pms.assets.update" or "pms.assets.delete" or "pms.assets.import" or "pms.assets.assign")))
            Assert.False(await Call(db, user.Id, binding.Controller, binding.Action, "POST"));
    }
    private static EdgeDbContext Database() => new(new DbContextOptionsBuilder<EdgeDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options) { SuppressSyncQueue = true };

    [Fact]
    public async Task ReceiptUpdate_DoesNotAllowApprovalOrCompletion()
    {
        await using var db = Database();
        var (user, rankId) = await Seed(db);
        var config = new RankPermissionConfig { RankId = rankId,
            GrantsJson = "[\"pms.receipts.access\",\"pms.receipts.update\"]" };
        db.RankPermissionConfigs.Add(config);
        await db.SaveChangesAsync();
        Assert.True(await Call(db, user.Id, "StockReceipt", "Update", "PUT"));
        Assert.True(await Call(db, user.Id, "StockReceipt", "Submit", "PUT"));
        Assert.False(await Call(db, user.Id, "StockReceipt", "Approve", "PUT"));
        Assert.False(await Call(db, user.Id, "StockReceipt", "Complete", "PUT"));
        config.GrantsJson = "[\"pms.receipts.access\",\"pms.receipts.approve\"]";
        await db.SaveChangesAsync();
        Assert.True(await Call(db, user.Id, "StockReceipt", "Approve", "PUT"));
        Assert.False(await Call(db, user.Id, "StockReceipt", "Update", "PUT"));
        Assert.False(await Call(db, user.Id, "StockReceipt", "Submit", "PUT"));
        Assert.False(await Call(db, user.Id, "StockReceipt", "Complete", "PUT"));
        config.GrantsJson = "[\"pms.receipts.access\",\"pms.receipts.execute\"]";
        await db.SaveChangesAsync();
        Assert.True(await Call(db, user.Id, "StockReceipt", "Complete", "PUT"));
        Assert.False(await Call(db, user.Id, "StockReceipt", "Approve", "PUT"));
    }
    private static async Task<(User User, int RankId)> Seed(EdgeDbContext db)
    {
        var rank = new Maritime.Shared.Models.Crew.Rank { RankCode = "TEST", RankName = "Test rank" };
        var role = new Role { RoleCode = "CREW", RoleName = "Crew" };
        db.Ranks.Add(rank); db.Roles.Add(role);
        await db.SaveChangesAsync();
        db.CrewMembers.Add(new() { CrewId = "CREW-1", FullName = "Test crew", RankId = rank.Id, IsOnboard = true });
        var user = new User { Username = "crew-1", CrewId = "CREW-1", RoleId = role.Id, PasswordHash = "test" };
        db.Users.Add(user); await db.SaveChangesAsync();
        return (user, rank.Id);
    }

    [Fact]
    public async Task CrewPermissions_FollowCurrentRankAndRevokeImmediately()
    {
        await using var db = Database(); var (user, rankId) = await Seed(db);
        var service = new RankPermissionService(db);
        Assert.Equal(PermissionRegistry.DefaultGrants, (await service.GetAsync(user.Id)).Grants);
        db.RankPermissionConfigs.Add(new() { RankId = rankId, GrantsJson = "[\"pms.work.access\",\"pms.work.view\"]" });
        await db.SaveChangesAsync();
        Assert.Contains("pms.work.view", (await service.GetAsync(user.Id)).Grants);
        var crew = await db.CrewMembers.SingleAsync(); crew.RankId = null; await db.SaveChangesAsync();
        Assert.Equal(PermissionRegistry.DefaultGrants, (await service.GetAsync(user.Id)).Grants);
        crew.RankId = rankId; await db.SaveChangesAsync();
        var rank = await db.Ranks.SingleAsync(); rank.IsActive = false; await db.SaveChangesAsync();
        Assert.Equal(PermissionRegistry.DefaultGrants, (await service.GetAsync(user.Id)).Grants);
        user.IsActive = false; await db.SaveChangesAsync();
        Assert.False((await service.GetAsync(user.Id)).IsAccountActive);
    }

    [Fact]
    public async Task AccessAndView_DoNotGrantWritesOrUnknownEndpoints()
    {
        await using var db = Database(); var (user, rankId) = await Seed(db);
        db.RankPermissionConfigs.Add(new() { RankId = rankId, GrantsJson = "[\"pms.assets.access\",\"pms.assets.view\"]" });
        await db.SaveChangesAsync();
        Assert.True(await Call(db, user.Id, "EquipmentAsset", "GetAll", "GET"));
        Assert.False(await Call(db, user.Id, "EquipmentAsset", "Create", "POST"));
        Assert.False(await Call(db, user.Id, "EquipmentAsset", "FutureUnmappedEndpoint", "POST"));
        var config = await db.RankPermissionConfigs.SingleAsync(); config.GrantsJson = "[\"pms.assets.view\"]"; await db.SaveChangesAsync();
        Assert.False(await Call(db, user.Id, "EquipmentAsset", "GetAll", "GET"));
    }

    [Fact]
    public async Task AdminKeepsAccess_ButCannotWriteShoreCatalogue()
    {
        await using var db = Database(); var (user, _) = await Seed(db);
        var role = await db.Roles.SingleAsync(); role.RoleCode = "ADMIN"; await db.SaveChangesAsync();
        Assert.True((await new RankPermissionService(db).GetAsync(user.Id)).IsAdmin);
        Assert.True(await Call(db, user.Id, "EquipmentAsset", "Create", "POST"));
        Assert.False(await Call(db, user.Id, "Ranks", "CreateRank", "POST"));
    }

    [Fact]
    public async Task RankList_PreloadsSavedAndEmptyConfigs_WithoutGrantingCrewAccess()
    {
        await using var db = Database(); var (user, rankId) = await Seed(db);
        db.Ranks.AddRange(new Maritime.Shared.Models.Crew.Rank { RankCode = "EMPTY", RankName = "Empty rank" },
            new Maritime.Shared.Models.Crew.Rank { RankCode = "OFF", RankName = "Inactive rank", IsActive = false });
        db.RankPermissionConfigs.Add(new() { RankId = rankId, Version = 3, GrantsJson = "[\"pms.work.access\",\"pms.work.view\"]" });
        await db.SaveChangesAsync();
        var http = new DefaultHttpContext(); http.Items["UserId"] = user.Id;
        var controller = new RankPermissionsController(db, new RankPermissionService(db))
        { ControllerContext = new ControllerContext { HttpContext = http } };
        Assert.Equal(403, Assert.IsType<StatusCodeResult>(await controller.Ranks()).StatusCode);
        var role = await db.Roles.SingleAsync(); role.RoleCode = "ADMIN"; await db.SaveChangesAsync();
        var result = Assert.IsType<OkObjectResult>(await controller.Ranks());
        var rows = JsonSerializer.SerializeToElement(result.Value).EnumerateArray().ToArray();
        Assert.Equal(2, rows.Length);
        var saved = rows.Single(r => r.GetProperty("Id").GetInt32() == rankId);
        Assert.Equal(3, saved.GetProperty("Version").GetInt64());
        Assert.Equal(2, saved.GetProperty("Grants").GetArrayLength());
        var empty = rows.Single(r => r.GetProperty("RankCode").GetString() == "EMPTY");
        Assert.Equal(0, empty.GetProperty("Version").GetInt64());
        Assert.Equal(0, empty.GetProperty("Grants").GetArrayLength());
        Assert.False(empty.GetProperty("IsConfigured").GetBoolean());
        Assert.Single(await db.RankPermissionConfigs.ToListAsync());
    }

    [Fact]
    public async Task AccountRoleChanges_RejectProfessionalRanksAsSecurityRoles()
    {
        await using var db = Database(); var (user, _) = await Seed(db);
        var legacy = new Role { RoleCode = "CAPTAIN", RoleName = "Captain" };
        db.Roles.Add(legacy); await db.SaveChangesAsync();
        using var cache = new Microsoft.Extensions.Caching.Memory.MemoryCache(new Microsoft.Extensions.Caching.Memory.MemoryCacheOptions());
        var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?> { ["Auth:TokenSigningKey"] = new string('x', 40) }).Build();
        var auth = new AuthService(db, cache, Microsoft.Extensions.Logging.Abstractions.NullLogger<AuthService>.Instance,
            Moq.Mock.Of<ISystemLogService>(), config);
        var oldRole = user.RoleId;
        Assert.False((await auth.UpdateUserRoleAsync(user.Id, legacy.Id)).Success);
        Assert.Equal(oldRole, user.RoleId);
        Assert.False((await auth.CreateUserForCrewAsync("CREW-1", legacy.Id)).Success);
    }

    public sealed class ApprovalRequest { public bool IsApproved { get; set; } public string ApprovedBy { get; set; } = ""; }
    [Fact]
    public async Task AdminWithoutCrew_CanReviewButCannotExecute_RecordsAuthenticatedActor()
    {
        await using var db = Database();
        var role = new Role { RoleCode = "ADMIN", RoleName = "Administrator" };
        db.Roles.Add(role); await db.SaveChangesAsync();
        var admin = new User { Username = "admin", RoleId = role.Id, PasswordHash = "test" };
        db.Users.Add(admin); await db.SaveChangesAsync();
        var approve = new ApprovalRequest { IsApproved = true };
        Assert.True(await Call(db, admin.Id, "Maintenance", "ApproveTask", "POST", approve));
        Assert.Equal("admin", approve.ApprovedBy);
        Assert.True(await Call(db, admin.Id, "TaskWorkflow", "VerifyTask", "POST", new { Action = "APPROVE" }));
        Assert.True(await Call(db, admin.Id, "TaskWorkflow", "VerifyTask", "POST", new { Action = "REJECT" }));
        Assert.True(await Call(db, admin.Id, "TaskWorkflow", "BulkVerifyTasks", "POST", new { Action = "APPROVE" }));
        Assert.True(await Call(db, admin.Id, "TaskWorkflow", "BulkVerifyTasks", "POST", new { Action = "REJECT" }));
        Assert.False(await Call(db, admin.Id, "TaskWorkflow", "StartTask", "POST"));
        Assert.False(await Call(db, admin.Id, "Maintenance", "ApproveTask", "POST", new ApprovalRequest { IsApproved = true, ApprovedBy = "OTHER" }));
    }

    [Fact]
    public async Task ReviewerPermissions_AreIndependentOfTaskAssignmentAndExecutionEligibility()
    {
        await using var db = Database(); var (user, rankId) = await Seed(db);
        var crew = await db.CrewMembers.SingleAsync(); crew.IsOnboard = false; crew.OnboardStatus = "Pending";
        var config = new RankPermissionConfig { RankId = rankId, GrantsJson = "[\"pms.work.access\",\"pms.work.approve\"]" };
        db.RankPermissionConfigs.Add(config);
        var task = new MaintenanceTask { TaskId = "OTHER-PERFORMER", AssignedTo = "SOMEONE-ELSE", Status = "PENDING_APPROVAL" };
        db.MaintenanceTasks.Add(task); await db.SaveChangesAsync();
        Assert.True(await Call(db, user.Id, "TaskWorkflow", "VerifyTask", "POST", new { Action = "APPROVE" }, task.Id));
        Assert.False(await Call(db, user.Id, "TaskWorkflow", "VerifyTask", "POST", new { Action = "REJECT" }, task.Id));
        Assert.False(await Call(db, user.Id, "TaskWorkflow", "StartTask", "POST", id: task.Id));
        config.GrantsJson = "[\"pms.work.access\",\"pms.work.reject\"]"; await db.SaveChangesAsync();
        Assert.False(await Call(db, user.Id, "TaskWorkflow", "VerifyTask", "POST", new { Action = "APPROVE" }, task.Id));
        Assert.True(await Call(db, user.Id, "TaskWorkflow", "VerifyTask", "POST", new { Action = "REJECT" }, task.Id));
        config.GrantsJson = "[\"pms.work.access\",\"pms.work.view\"]"; await db.SaveChangesAsync();
        Assert.False(await Call(db, user.Id, "TaskWorkflow", "VerifyTask", "POST", new { Action = "APPROVE" }, task.Id));
        Assert.False(await Call(db, user.Id, "TaskWorkflow", "VerifyTask", "POST", new { Action = "REJECT" }, task.Id));
    }

    [Fact]
    public async Task Approval_RejectsSpoofedActorAndRequiresSeparateRejectionPermission()
    {
        await using var db = Database(); var (user, rankId) = await Seed(db);
        db.RankPermissionConfigs.Add(new() { RankId = rankId, GrantsJson = "[\"pms.work.access\",\"pms.work.approve\"]" });
        await db.SaveChangesAsync();
        Assert.False(await Call(db, user.Id, "Maintenance", "ApproveTask", "POST", new ApprovalRequest { IsApproved = true, ApprovedBy = "SOMEONE-ELSE" }));
        var request = new ApprovalRequest { IsApproved = true };
        Assert.True(await Call(db, user.Id, "Maintenance", "ApproveTask", "POST", request));
        Assert.Equal(user.CrewId, request.ApprovedBy);
        Assert.False(await Call(db, user.Id, "Maintenance", "ApproveTask", "POST", new ApprovalRequest { IsApproved = false }));
    }

    [Fact]
    public async Task TaskUpdate_CannotBypassApprovalThroughGenericStatusUpdate()
    {
        await using var db = Database(); var (user, rankId) = await Seed(db);
        db.RankPermissionConfigs.Add(new() { RankId = rankId, GrantsJson = "[\"pms.work.access\",\"pms.work.update\"]" });
        var task = new MaintenanceTask { TaskId = "TEST-STATUS", EquipmentId = "E1", EquipmentName = "Engine", Status = "IN_PROGRESS", NextDueAt = DateTime.UtcNow.AddDays(1) };
        db.MaintenanceTasks.Add(task); await db.SaveChangesAsync();
        Assert.False(await Call(db, user.Id, "Maintenance", "UpdateTaskStatus", "PATCH", new { Status = "COMPLETED" }, task.Id));
        Assert.True(await Call(db, user.Id, "Maintenance", "PatchTask", "PATCH", JsonSerializer.SerializeToElement(new { assignedTo = "SOMEONE" }), task.Id));
        Assert.Equal("IN_PROGRESS", task.Status);
    }

    [Fact]
    public async Task CrewUpdate_CannotEscalateByAssigningAnotherRankAboard()
    {
        await using var db = Database(); var (user, rankId) = await Seed(db);
        db.RankPermissionConfigs.Add(new() { RankId = rankId, GrantsJson = "[\"crew.access\",\"crew.update\",\"crew.create\"]" });
        await db.SaveChangesAsync();
        var crew = await db.CrewMembers.SingleAsync();
        Assert.False(await Call(db, user.Id, "Crew", "UpdateCrew", "PUT", new Maritime.Shared.Models.Crew.CrewMember { CrewId = crew.CrewId, RankId = rankId + 1 }, crew.Id));
        Assert.False(await Call(db, user.Id, "Crew", "AddCrew", "POST", new Maritime.Shared.Models.Crew.CrewMember { CrewId = "OTHER", RankId = rankId }));
    }

    [Fact]
    public async Task FormerMyTasksList_ReturnsWholeVesselEvenWithUnknownCrewParameter()
    {
        await using var db = Database();
        db.MaintenanceTasks.AddRange(new MaintenanceTask { TaskId = "T1", EquipmentId = "E1", EquipmentName = "Engine", AssignedTo = "OTHER", NextDueAt = DateTime.UtcNow.AddDays(1) },
            new MaintenanceTask { TaskId = "T2", EquipmentId = "E2", EquipmentName = "Engine 2", NextDueAt = DateTime.UtcNow.AddDays(1) });
        await db.SaveChangesAsync();
        var controller = new MaritimeEdge.Controllers.Maintenance.MaintenanceController(db, null!, Microsoft.Extensions.Logging.Abstractions.NullLogger<MaritimeEdge.Controllers.Maintenance.MaintenanceController>.Instance);
        var result = Assert.IsType<OkObjectResult>(await controller.GetMyTasks(crewId: "UNKNOWN"));
        Assert.Equal(2, JsonSerializer.SerializeToElement(result.Value).GetArrayLength());
    }

    private static async Task<bool> Call(EdgeDbContext db, long userId, string controller, string action, string method, object? body = null, Guid? id = null)
    {
        var http = new DefaultHttpContext(); http.Items["UserId"] = userId; http.Request.Method = method;
        var descriptor = new ControllerActionDescriptor { ControllerName = controller, ActionName = action };
        var context = new ActionContext(http, new(), descriptor, new ModelStateDictionary());
        var arguments = new Dictionary<string, object?>(); if (body != null) arguments["request"] = body;
        if (id.HasValue) arguments["id"] = id.Value;
        var executing = new ActionExecutingContext(context, [], arguments, new object());
        var called = false;
        await new RankPermissionFilter(new(db), db).OnActionExecutionAsync(executing, () =>
        { called = true; return Task.FromResult(new ActionExecutedContext(context, [], new object())); });
        return called;
    }

    [Fact]
    public void Registry_CoversEveryActionInRegisteredBusinessControllers()
    {
        var controllers = PermissionRegistry.Data.Bindings.Select(b => b.Controller).ToHashSet();
        foreach (var type in typeof(RankPermissionsController).Assembly.GetTypes().Where(t => t.Name.EndsWith("Controller")))
        {
            var name = type.Name[..^10]; if (!controllers.Contains(name)) continue;
            foreach (var method in type.GetMethods().Where(m => m.GetCustomAttributes(true).OfType<Microsoft.AspNetCore.Mvc.Routing.HttpMethodAttribute>().Any()))
                Assert.NotNull(PermissionRegistry.Resolve(name, method.Name));
        }
        Assert.All(PermissionRegistry.Data.Bindings.SelectMany(b => b.Grants), g => Assert.Contains(g, PermissionRegistry.Codes));
    }

    [Fact]
    public async Task MaterialView_AllowsReadingAssignedEquipmentButNotChangingLinks()
    {
        await using var db = Database(); var (user, rankId) = await Seed(db);
        db.RankPermissionConfigs.Add(new() { RankId = rankId,
            GrantsJson = "[\"pms.materials.access\",\"pms.materials.view\"]" });
        await db.SaveChangesAsync();
        Assert.True(await Call(db, user.Id, "Material", "GetAllItems", "GET"));
        Assert.True(await Call(db, user.Id, "Material", "GetAssignedEquipment", "GET"));
        Assert.True(await Call(db, user.Id, "Material", "GetEquipmentCounts", "GET"));
        Assert.False(await Call(db, user.Id, "Material", "AssignEquipment", "POST"));
        Assert.False(await Call(db, user.Id, "Material", "UpdateEquipmentAssignment", "PUT"));
        Assert.False(await Call(db, user.Id, "Material", "RemoveEquipmentAssignment", "DELETE"));
        var config = await db.RankPermissionConfigs.SingleAsync();
        config.GrantsJson = "[\"pms.materials.view\"]";
        await db.SaveChangesAsync();
        Assert.False(await Call(db, user.Id, "Material", "GetAssignedEquipment", "GET"));
    }

    [Fact]
    public async Task Dashboard_IsDefaultReadOnlyForActiveAccountsWithoutRankPermissions()
    {
        await using var db = Database(); var (user, _) = await Seed(db);
        foreach (var (controller, action) in new[] { ("Dashboard", "GetStats"), ("Telemetry", "GetLatestNavigation"),
            ("Alarms", "GetActiveAlarms"), ("Material", "GetLowStockItems"), ("Maintenance", "GetAllTasks") })
            Assert.True(await Call(db, user.Id, controller, action, "GET"));
        Assert.False(await Call(db, user.Id, "Alarms", "CreateAlarm", "POST"));
        Assert.False(await Call(db, user.Id, "Alarms", "AcknowledgeAlarm", "POST"));
        Assert.False(await Call(db, user.Id, "Alarms", "ResolveAlarm", "POST"));
        user.CrewId = null; await db.SaveChangesAsync();
        Assert.True(await Call(db, user.Id, "Dashboard", "GetStats", "GET"));
        user.IsActive = false; await db.SaveChangesAsync();
        Assert.False(await Call(db, user.Id, "Dashboard", "GetStats", "GET"));
    }

    [Fact]
    public async Task RemovedAndDefaultPermissions_DoNotLeakIntoEditableRankConfig()
    {
        await using var db = Database(); var (user, rankId) = await Seed(db);
        db.RankPermissionConfigs.Add(new() { RankId = rankId, GrantsJson =
            "[\"dashboard.access\",\"dashboard.view\",\"dashboard.create\",\"ship-data.create\",\"pms.materials.create\",\"pms.materials.access\",\"pms.materials.view\"]" });
        await db.SaveChangesAsync();
        var effective = await new RankPermissionService(db).GetAsync(user.Id);
        Assert.Contains("dashboard.view", effective.Grants);
        Assert.DoesNotContain("dashboard.create", effective.Grants);
        Assert.DoesNotContain("pms.materials.create", effective.Grants);
        var context = new DefaultHttpContext(); context.Items["UserId"] = user.Id;
        context.Items["EffectivePermissions"] = new EffectivePermissions(true, null, null, []);
        var controller = new RankPermissionsController(db, new(db)) { ControllerContext = new() { HttpContext = context } };
        var catalog = Assert.IsType<PermissionModule[]>(Assert.IsType<OkObjectResult>(controller.Catalog()).Value);
        Assert.DoesNotContain(catalog, m => m.Code == "dashboard");
        var result = JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(await controller.Get(rankId)).Value);
        Assert.Equal(2, result.GetProperty("Grants").GetArrayLength());
    }

    [Fact]
    public async Task ReadsAndSubmissions_DoNotRequireUnrelatedAssignmentOrApprovalRights()
    {
        await using var db = Database(); var (user, rankId) = await Seed(db);
        db.RankPermissionConfigs.Add(new() { RankId = rankId, GrantsJson =
            "[\"voyage.access\",\"voyage.view\",\"hsqe.access\",\"hsqe.update\",\"pms.assets.access\",\"pms.assets.view\",\"crew.access\",\"crew.update\"]" });
        await db.SaveChangesAsync();
        Assert.True(await Call(db, user.Id, "Voyage", "GetCrewAssignments", "GET"));
        Assert.False(await Call(db, user.Id, "Voyage", "AssignCrew", "POST"));
        Assert.True(await Call(db, user.Id, "Hsqe", "SubmitDocumentForReview", "POST"));
        Assert.False(await Call(db, user.Id, "Hsqe", "ApproveDocument", "POST"));
        Assert.False(await Call(db, user.Id, "Inventory", "Export", "GET"));
        Assert.True(await Call(db, user.Id, "Logbook", "SignOffFollowUp", "POST"));
        Assert.False(await Call(db, user.Id, "Crew", "ApproveCrew", "POST"));
    }

    [Fact]
    public async Task FinancialRejection_IsSeparateFromApproval()
    {
        await using var db = Database(); var (user, rankId) = await Seed(db);
        db.RankPermissionConfigs.Add(new() { RankId = rankId, GrantsJson = "[\"voyage.access\",\"voyage.approve\"]" });
        await db.SaveChangesAsync();
        Assert.True(await Call(db, user.Id, "VoyageFinancial", "TransitionExpenseRequest", "POST", new { NewStatus = "APPROVED" }));
        Assert.False(await Call(db, user.Id, "VoyageFinancial", "TransitionExpenseRequest", "POST", new { NewStatus = "REJECTED" }));
        var config = await db.RankPermissionConfigs.SingleAsync();
        config.GrantsJson = "[\"voyage.access\",\"voyage.reject\"]"; await db.SaveChangesAsync();
        Assert.True(await Call(db, user.Id, "VoyageFinancial", "TransitionExpenseRequest", "POST", new { NewStatus = "REJECTED" }));
    }

    [Fact]
    public void EveryConfigurableAction_HasAnActualBindingOrReviewedRejectionDecision()
    {
        var direct = PermissionRegistry.Data.Bindings.SelectMany(b => b.Grants).ToHashSet();
        var decisions = new HashSet<string> { "voyage.reject", "pms.work.reject" };
        foreach (var module in PermissionRegistry.Data.Modules)
            foreach (var action in module.Actions)
                Assert.True(direct.Contains(module.Code + "." + action) || decisions.Contains(module.Code + "." + action),
                    $"{module.Code}.{action} has no implemented operation.");
    }
}

[Collection("PMS inventory")]
public class RankPermissionPostgresTests(PmsDatabaseFixture fixture)
{
    [PmsPostgresFact]
    public async Task Save_ValidatesVersionAndUnknownCodes_WritesAuditWithoutSyncEcho()
    {
        await using var db = fixture.CreateContext(); db.SuppressSyncQueue = true;
        var role = new Role { RoleCode = "ADMIN-" + Guid.NewGuid().ToString("N")[..8], RoleName = "Admin" };
        // Reuse canonical admin role if already seeded in this isolated database.
        var adminRole = await db.Roles.FirstOrDefaultAsync(r => r.RoleCode == "ADMIN");
        if (adminRole == null) { role.RoleCode = "ADMIN"; db.Roles.Add(role); await db.SaveChangesAsync(); adminRole = role; }
        var user = new User { Username = "perm-" + Guid.NewGuid().ToString("N")[..10], RoleId = adminRole.Id, PasswordHash = "test" };
        var rank = new Maritime.Shared.Models.Crew.Rank { RankCode = Guid.NewGuid().ToString("N")[..8], RankName = "Permission test" };
        db.Users.Add(user); db.Ranks.Add(rank); await db.SaveChangesAsync();
        var http = new DefaultHttpContext(); http.Items["UserId"] = user.Id;
        var controller = new RankPermissionsController(db, new(db)) { ControllerContext = new() { HttpContext = http } };
        var queueBefore = await db.SyncQueue.CountAsync();
        db.SuppressSyncQueue = false;
        Assert.IsType<OkObjectResult>(await controller.Save(rank.Id, new(0, ["pms.assets.access", "pms.assets.view"])));
        Assert.IsType<ConflictObjectResult>(await controller.Save(rank.Id, new(0, [])));
        Assert.IsType<BadRequestObjectResult>(await controller.Save(rank.Id, new(1, ["unknown.grant"])));
        Assert.Equal(1, await db.RankPermissionConfigs.Where(c => c.RankId == rank.Id).Select(c => c.Version).SingleAsync());
        Assert.Equal(1, await db.SystemLogs.CountAsync(l => l.Action == "RANK_PERMISSIONS_CHANGED" && l.EntityId == rank.Id.ToString()));
        Assert.Equal(queueBefore, await db.SyncQueue.CountAsync());
    }
}
