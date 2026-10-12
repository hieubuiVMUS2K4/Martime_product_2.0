using System.Text.Json;
using Maritime.Shared.Models.Sync;
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
using Moq;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

[Collection("PMS inventory")]
public class ApprovalTests(PmsDatabaseFixture fixture)
{
    private static ApprovalService Service(EdgeDbContext db)
    {
        var runtime = new Mock<IEdgeRuntimeConfigService>();
        runtime.Setup(r => r.GetSyncConfigAsync()).ReturnsAsync(new EdgeSyncConfig { NodeId = "APPROVAL-TEST" });
        return new(db, new(db), runtime.Object, Mock.Of<ISyncFileStorageService>(), new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build());
    }
    private static IEdgeRuntimeConfigService Runtime()
    {
        var runtime = new Mock<IEdgeRuntimeConfigService>();
        runtime.Setup(r => r.GetSyncConfigAsync()).ReturnsAsync(new EdgeSyncConfig { NodeId = "APPROVAL-TEST" });
        return runtime.Object;
    }
    private static async Task<User> Admin(EdgeDbContext db)
    {
        var role = await db.Roles.FirstOrDefaultAsync(r => r.RoleCode == "ADMIN");
        if (role == null) { role = new Role { RoleCode = "ADMIN", RoleName = "Administrator" }; db.Roles.Add(role); await db.SaveChangesAsync(); }
        var salt = Convert.ToBase64String(new byte[32]);
        // Match the established login hash algorithm; no alternate password scheme.
        var hash = Convert.ToBase64String(System.Security.Cryptography.Rfc2898DeriveBytes.Pbkdf2("Approval-test-password", Convert.FromBase64String(salt), 100000, System.Security.Cryptography.HashAlgorithmName.SHA256, 32));
        var user = new User { Username = "sign-" + Guid.NewGuid().ToString("N")[..12], RoleId = role.Id, PasswordSalt = salt, PasswordHash = hash };
        db.Users.Add(user); await db.SaveChangesAsync(); return user;
    }
    private static ActionExecutingContext Request(User user, int id, string hash, string requestId, long version = 0, string password = "Approval-test-password")
    {
        var http = new DefaultHttpContext(); http.Items["UserId"] = user.Id;
        http.Request.Headers["X-Approval-Password"] = password;
        http.Request.Headers["X-Approval-Hash"] = hash;
        http.Request.Headers["X-Approval-Version"] = version.ToString();
        http.Request.Headers["X-Approval-Idempotency-Key"] = requestId;
        var descriptor = new ControllerActionDescriptor { ControllerName = "StockReceipt", ActionName = "Approve" };
        return new(new ActionContext(http, new(), descriptor, new ModelStateDictionary()), [], new Dictionary<string, object?> { ["id"] = id }, new object());
    }
    [Fact]
    public void Snapshot_HashIsStableForPropertyOrder_AndSensitiveToContent()
    {
        var a = ApprovalSnapshot.Canonicalize(JsonSerializer.Deserialize<JsonElement>("{\"b\":2,\"a\":1}"));
        var b = ApprovalSnapshot.Canonicalize(JsonSerializer.Deserialize<JsonElement>("{\"a\":1,\"b\":2}"));
        Assert.Equal(ApprovalSnapshot.Hash(a), ApprovalSnapshot.Hash(b));
        Assert.NotEqual(ApprovalSnapshot.Hash(a), ApprovalSnapshot.Hash("{\"a\":1,\"b\":3}"));
    }
    [Theory]
    [InlineData("log-voyage")]
    [InlineData("log-deck")]
    [InlineData("log-engine")]
    [InlineData("log-oil")]
    [InlineData("log-watchkeeping")]
    [InlineData("log-garbage")]
    [InlineData("log-garbage-i")]
    [InlineData("log-garbage-ii")]
    [InlineData("log-ballast")]
    public async Task LogbookSigning_UsesRealOfficerIdentity_AndLocksSignedContent(string module)
    {
        await using var db = fixture.CreateContext();
        var user = await Admin(db);
        var rank = new Maritime.Shared.Models.Crew.Rank { RankCode = "SIG" + Guid.NewGuid().ToString("N")[..6], RankName = "Second Officer" };
        db.Ranks.Add(rank); await db.SaveChangesAsync();
        user.CrewId = "REAL-" + user.Id;
        db.CrewMembers.Add(new() { CrewId = user.CrewId, FullName = "Actual Officer", RankId = rank.Id, IsOnboard = true });
        var definition = SigningRecords.All[module];
        db.RankPermissionConfigs.Add(new() { RankId = rank.Id, GrantsJson = JsonSerializer.Serialize(new[] { definition.Permission + ".access", definition.Permission + ".approve" }) });
        var entity = Activator.CreateInstance(definition.EntityType)!;
        db.Add(entity); await db.SaveChangesAsync();
        var id = (Guid)entity.GetType().GetProperty("Id")!.GetValue(entity)!;
        var service = Service(db); var snapshot = await service.SnapshotAsync(module, id.ToString());
        var request = Request(user, 0, ApprovalSnapshot.Hash(snapshot.Snapshot), Guid.NewGuid().ToString());
        var descriptor = new ControllerActionDescriptor { ControllerName = definition.Controller, ActionName = "SignEntry" };
        var forged = new MaritimeEdge.DTOs.SignVoyageLogEntryDto { Signature = "Captain Fake" };
        var context = new ActionExecutingContext(new ActionContext(request.HttpContext, new(), descriptor, new ModelStateDictionary()), [], new Dictionary<string, object?> { ["id"] = id, ["dto"] = forged }, new object());
        await new ApprovalActionFilter(db, service, Runtime()).OnActionExecutionAsync(context, async () => {
            Assert.Equal("Actual Officer", forged.Signature);
            entity.GetType().GetProperty(definition.SignatureField)!.SetValue(entity, forged.Signature);
            await db.SaveChangesAsync();
            return new(context, [], new object()) { Result = new OkObjectResult(new { signed = true }) };
        });
        Assert.Null(context.Result);
        var action = await db.ApprovalActions.SingleAsync(a => a.ActorUserId == user.Id);
        Assert.Equal("Actual Officer", action.ActorName); Assert.Equal("Second Officer", action.ActorRank);
        Assert.Equal("password-reauthentication", action.AuthenticationMethod);
        Assert.DoesNotContain("Captain Fake", (await db.ApprovalRevisions.SingleAsync(r => r.Id == action.RevisionId)).SnapshotJson);
        var writeDescriptor = new ControllerActionDescriptor { ControllerName = definition.Controller, ActionName = "UpdateEntry" };
        var http = new DefaultHttpContext(); http.Request.Method = "PUT";
        var write = new ActionExecutingContext(new ActionContext(http, new(), writeDescriptor, new ModelStateDictionary()), [], new Dictionary<string, object?> { ["id"] = id }, new object());
        var called = false;
        await new ApprovalActionFilter(db, service, Runtime()).OnActionExecutionAsync(write, () => { called = true; return Task.FromResult(new ActionExecutedContext(write, [], new object())); });
        Assert.False(called); Assert.Equal(409, Assert.IsType<ObjectResult>(write.Result).StatusCode);
    }
    [PmsPostgresFact]
    public async Task AdminCanReviewReceipt_ButCannotImpersonateShipOfficer()
    {
        await using var db = fixture.CreateContext(); var user = await Admin(db);
        var http = new DefaultHttpContext(); http.Items["UserId"] = user.Id;
        Assert.Equal("ADMIN", (await Service(db).ActorAsync(http, "pms", "approve")).Rank);
        var denied = await Assert.ThrowsAsync<ApprovalException>(() => Service(db).ActorAsync(http, "permit", "issue"));
        Assert.Equal(403, denied.Status);
        await Service(db).ReauthenticateAsync(Request(user, 1, "", Guid.NewGuid().ToString()).HttpContext, new(user.Id, user.Username, null, user.Username, "ADMIN", "pms.work.approve"));
    }
    [PmsPostgresFact]
    public async Task SignedAction_IsAtomic_Idempotent_AndRejectsStaleContent()
    {
        await using var db = fixture.CreateContext(); var user = await Admin(db);
        var receipt = new StockReceipt { ReceiptCode = "SIGN-" + Guid.NewGuid().ToString("N"), CreatedBy = user.Username, Status = "Submitted" };
        db.StockReceipts.Add(receipt); await db.SaveChangesAsync();
        var service = Service(db); var snapshot = await service.SnapshotAsync("receipt", receipt.Id.ToString());
        var hash = ApprovalSnapshot.Hash(snapshot.Snapshot); var requestId = Guid.NewGuid().ToString();
        var count = 0;
        async Task<ActionExecutedContext> Execute(ActionExecutingContext request, bool fail = false)
        {
            count++; receipt.Status = "Approved"; await db.SaveChangesAsync();
            return new(request, [], new object()) { Result = fail ? new ObjectResult(new { message = "failed" }) { StatusCode = 500 } : new OkObjectResult(new { receipt.Id, receipt.Status }) };
        }
        var filter = new ApprovalActionFilter(db, service, Runtime());
        var first = Request(user, receipt.Id, hash, requestId);
        await filter.OnActionExecutionAsync(first, () => Execute(first));
        Assert.Null(first.Result);
        Assert.Equal(1, count);
        var replay = Request(user, receipt.Id, hash, requestId);
        await filter.OnActionExecutionAsync(replay, () => Execute(replay));
        Assert.IsType<ContentResult>(replay.Result); Assert.Equal(1, count);
        Assert.Single(await db.ApprovalActions.Where(a => a.ActorUserId == user.Id).ToListAsync());
        Assert.False(await db.SyncQueue.AnyAsync(q => q.Payload.Contains("Approval-test-password")));
        var stale = Request(user, receipt.Id, hash, Guid.NewGuid().ToString());
        await filter.OnActionExecutionAsync(stale, () => Execute(stale));
        Assert.Equal(409, Assert.IsType<ObjectResult>(stale.Result).StatusCode); Assert.Equal(1, count);
        var action = await db.ApprovalActions.SingleAsync(a => a.ActorUserId == user.Id);
        action.ActorName = "Forged";
        await Assert.ThrowsAsync<InvalidOperationException>(() => db.SaveChangesAsync());
    }
    [PmsPostgresFact]
    public async Task FailedBusinessAction_RollsBackBusinessState_Evidence_AndQueue()
    {
        await using var db = fixture.CreateContext(); var user = await Admin(db);
        var receipt = new StockReceipt { ReceiptCode = "FAIL-" + Guid.NewGuid().ToString("N"), CreatedBy = user.Username, Status = "Submitted" };
        db.StockReceipts.Add(receipt); await db.SaveChangesAsync(); var beforeQueue = await db.SyncQueue.CountAsync();
        var service = Service(db); var snapshot = await service.SnapshotAsync("receipt", receipt.Id.ToString());
        var request = Request(user, receipt.Id, ApprovalSnapshot.Hash(snapshot.Snapshot), Guid.NewGuid().ToString());
        await new ApprovalActionFilter(db, service, Runtime()).OnActionExecutionAsync(request, async () => {
            receipt.Status = "Approved"; await db.SaveChangesAsync();
            return new ActionExecutedContext(request, [], new object()) { Result = new BadRequestObjectResult("Failed business validation") };
        });
        await using var verify = fixture.CreateContext();
        Assert.Equal("Submitted", (await verify.StockReceipts.FindAsync(receipt.Id))!.Status);
        Assert.False(await verify.ApprovalActions.AnyAsync(a => a.ActorUserId == user.Id));
        Assert.Equal(beforeQueue, await verify.SyncQueue.CountAsync());
    }

    [PmsPostgresFact]
    public async Task PermitRequiresCheck_IndependentIssuer_AndKeepsRevisionThroughClose()
    {
        await using var db = fixture.CreateContext(); var checker = await Admin(db); var issuer = await Admin(db);
        var rank = new Maritime.Shared.Models.Crew.Rank { RankCode = "SIGN-" + Guid.NewGuid().ToString("N")[..5], RankName = "Assigned officer" };
        db.Ranks.Add(rank); await db.SaveChangesAsync();
        checker.CrewId = "CHECK-" + checker.Id; issuer.CrewId = "ISSUE-" + issuer.Id;
        db.CrewMembers.AddRange(new() { CrewId = checker.CrewId, FullName = "Checker", RankId = rank.Id, IsOnboard = true }, new() { CrewId = issuer.CrewId, FullName = "Issuer", RankId = rank.Id, IsOnboard = true });
        db.RankPermissionConfigs.Add(new() { RankId = rank.Id, GrantsJson = "[\"hsqe.permits.access\",\"hsqe.permits.check\",\"hsqe.permits.issue\",\"hsqe.permits.close\"]" });
        var risk = new HsqeRiskAssessment { AssessmentCode = "RA-" + Guid.NewGuid().ToString("N"), JobTitle = "Cold work risk assessment" };
        db.HsqeRiskAssessments.Add(risk);
        var permit = new HsqeWorkPermit { PermitType = "Cold", PermitCode = "PTW-" + Guid.NewGuid().ToString("N")[..10], Title = "Cold maintenance", Location = "Deck", RiskAssessmentId = risk.Id, PrecautionsJson = "[{\"label\":\"Isolated\",\"checked\":true}]", DurationHours = 4 };
        db.HsqeWorkPermits.Add(permit); await db.SaveChangesAsync();
        var service = Service(db);
        async Task<IActionResult?> Act(User actor, string action)
        {
            var snapshot = await service.SnapshotAsync("permit", permit.Id.ToString());
            var doc = await db.ApprovalDocuments.SingleOrDefaultAsync(d => d.Module == "permit" && d.RecordKey == permit.Id.ToString());
            var http = Request(actor, 0, ApprovalSnapshot.Hash(snapshot.Snapshot), Guid.NewGuid().ToString(), doc?.Version ?? 0).HttpContext;
            var descriptor = new ControllerActionDescriptor { ControllerName = "Approvals", ActionName = "Act" };
            var context = new ActionExecutingContext(new ActionContext(http, new(), descriptor, new ModelStateDictionary()), [], new Dictionary<string, object?> { ["module"] = "permit", ["key"] = permit.Id.ToString(), ["action"] = action, ["request"] = new MaritimeEdge.Controllers.Safety.ApprovalsController.ActionRequest(null) }, new object());
            IActionResult? result = null;
            await new ApprovalActionFilter(db, service, Runtime()).OnActionExecutionAsync(context, async () => {
                var controller = new MaritimeEdge.Controllers.Safety.ApprovalsController(db, service, new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build()) { ControllerContext = new() { HttpContext = http } };
                result = await controller.Act("permit", permit.Id.ToString(), action, new(null));
                return new ActionExecutedContext(context, [], controller) { Result = result };
            });
            return context.Result ?? result;
        }
        Assert.IsType<ConflictObjectResult>(await Act(issuer, "issue"));
        db.ChangeTracker.Clear(); // Rollback leaves tracked objects unsuitable for a new independent request.
        permit = await db.HsqeWorkPermits.FindAsync(permit.Id) ?? throw new Exception();
        Assert.IsType<OkObjectResult>(await Act(checker, "submit")); Assert.Equal("PendingCheck", permit.Status);
        Assert.IsType<OkObjectResult>(await Act(checker, "check")); Assert.Equal("PendingIssue", permit.Status);
        Assert.Equal(409, Assert.IsAssignableFrom<ObjectResult>(await Act(checker, "issue")).StatusCode);
        db.ChangeTracker.Clear(); permit = (await db.HsqeWorkPermits.FindAsync(permit.Id))!;
        Assert.IsType<OkObjectResult>(await Act(issuer, "issue")); Assert.True(permit.IsEffective);
        Assert.IsType<OkObjectResult>(await Act(issuer, "close")); Assert.Equal("Closed", permit.Status);
        var evidence = await db.ApprovalDocuments.SingleAsync(d => d.Module == "permit" && d.RecordKey == permit.Id.ToString());
        Assert.Equal(4, evidence.Version);
        Assert.Single(await db.ApprovalRevisions.Where(r => r.DocumentId == evidence.Id).ToListAsync());
        Assert.Equal(4, await db.ApprovalActions.CountAsync(a => a.DocumentId == evidence.Id));
    }

    [PmsPostgresFact]
    public async Task AdditiveMigration_KeepsLegacyRecordsAndDoesNotVerifyOldSignatures()
    {
        var connection = new Npgsql.NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("PMS_TEST_CONNECTION_STRING"));
        Assert.StartsWith("codex_pms_tests_", connection.Database);
        connection.Database += "_migration_" + Guid.NewGuid().ToString("N")[..8];
        await using var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>().UseNpgsql(connection.ConnectionString).Options) { SuppressSyncQueue = true };
        await db.Database.EnsureCreatedAsync();
        var legacy = new HsqeWorkPermit { Status = "Active", PermitCode = "LEGACY", Title = "Existing record", Location = "Deck", ChiefOfficerSigned = true, CaptainApproved = true, DigitalSignatures = "[{\"sigCode\":\"SIG-OLD\"}]" };
        db.HsqeWorkPermits.Add(legacy); await db.SaveChangesAsync();
        await db.Database.ExecuteSqlRawAsync("DROP TABLE public.approval_actions, public.approval_revisions, public.approval_documents; ALTER TABLE public.hsqe_work_permits DROP COLUMN gas_test_at, DROP COLUMN gas_test_by, DROP COLUMN gas_test_device");
        var assembly = Microsoft.EntityFrameworkCore.Infrastructure.AccessorExtensions.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrationsAssembly>(db);
        var migrationId = assembly.Migrations.Keys.Single(k => k.EndsWith("_ApprovalEvidence"));
        var migration = assembly.CreateMigration(assembly.Migrations[migrationId], "Npgsql.EntityFrameworkCore.PostgreSQL");
        var generator = Microsoft.EntityFrameworkCore.Infrastructure.AccessorExtensions.GetService<Microsoft.EntityFrameworkCore.Migrations.IMigrationsSqlGenerator>(db);
        foreach (var command in generator.Generate(migration.UpOperations, db.Model)) await db.Database.ExecuteSqlRawAsync(command.CommandText);
        db.ChangeTracker.Clear();
        var record = await db.HsqeWorkPermits.SingleAsync();
        Assert.Equal("Active", record.Status); Assert.Contains("SIG-OLD", record.DigitalSignatures); Assert.False(record.IsEffective);
        Assert.Null(record.GasTestAt); Assert.Empty(await db.ApprovalActions.ToListAsync());
        await db.Database.EnsureDeletedAsync();
    }

    [PmsPostgresFact]
    public async Task ReauthenticationRejectsSharedPin_AndThrottlesFailedPasswords()
    {
        await using var db = fixture.CreateContext(); var user = await Admin(db);
        var service = Service(db);
        var http = new DefaultHttpContext(); http.Connection.RemoteIpAddress = System.Net.IPAddress.Parse("198.51.100.53");
        http.Request.Headers["X-Approval-Password"] = "1111";
        var actor = new ApprovalActor(user.Id, user.Username, null, user.Username, "ADMIN", "pms.work.approve");
        for (var attempt = 0; attempt < 5; attempt++)
            Assert.Equal(403, (await Assert.ThrowsAsync<ApprovalException>(() => service.ReauthenticateAsync(http, actor))).Status);
        Assert.Equal(429, (await Assert.ThrowsAsync<ApprovalException>(() => service.ReauthenticateAsync(http, actor))).Status);
    }
}
