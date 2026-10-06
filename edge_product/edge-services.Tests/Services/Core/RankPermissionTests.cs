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
    private static EdgeDbContext Database() => new(new DbContextOptionsBuilder<EdgeDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options) { SuppressSyncQueue = true };
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
        Assert.Empty((await service.GetAsync(user.Id)).Grants);
        db.RankPermissionConfigs.Add(new() { RankId = rankId, GrantsJson = "[\"pms.work.access\",\"pms.work.view\"]" });
        await db.SaveChangesAsync();
        Assert.Contains("pms.work.view", (await service.GetAsync(user.Id)).Grants);
        var crew = await db.CrewMembers.SingleAsync(); crew.RankId = null; await db.SaveChangesAsync();
        Assert.Empty((await service.GetAsync(user.Id)).Grants);
        crew.RankId = rankId; await db.SaveChangesAsync();
        var rank = await db.Ranks.SingleAsync(); rank.IsActive = false; await db.SaveChangesAsync();
        Assert.Empty((await service.GetAsync(user.Id)).Grants);
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
        Assert.False(await Call(db, user.Id, "Maintenance", "PatchTask", "PATCH", JsonSerializer.SerializeToElement(new { assignedTo = "SOMEONE" }), task.Id));
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
