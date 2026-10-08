using System.Net;
using System.Text;
using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Controllers.Core;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Security;
using MaritimeEdge.Services.Core;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Npgsql;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

/// <summary>
/// Một máy tàu chỉ chứa dữ liệu của MỘT tàu. Kích hoạt gói cấu hình của tàu khác → xoá sạch dữ liệu tàu cũ
/// (giữ danh mục dùng chung, tài khoản quản trị), rồi xin bờ gửi lại toàn bộ dữ liệu của tàu mới.
/// Chạy trên PostgreSQL thật (xoá bằng SQL theo thứ tự khoá ngoại).
/// </summary>
public class VesselSwitchTests
{
    private const string OldImo = "1111111";
    private const string NewImo = "2222222";

    private static string Connection()
    {
        var builder = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("PMS_TEST_CONNECTION_STRING"));
        if (builder.Database?.StartsWith("codex_pms_tests_", StringComparison.Ordinal) != true) throw new InvalidOperationException("An isolated database is required.");
        builder.Database += "_" + Guid.NewGuid().ToString("N")[..12];
        return builder.ConnectionString;
    }

    private static async Task<EdgeDbContext> Db()
    {
        var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>().UseNpgsql(Connection()).Options) { SuppressSyncQueue = true };
        await db.Database.EnsureCreatedAsync();
        return db;
    }

    /// <summary>Máy đang chạy tàu cũ: có thuyền viên (kèm tài khoản), chuyến đi, thiết bị, hàng chờ gửi bờ, danh mục, admin.</summary>
    private static async Task<(EdgeProvisioningProfile Current, EdgeProvisioningProfile Next)> SeedOldVessel(EdgeDbContext db, Guid? nextVesselId = null)
    {
        var role = new Role { RoleCode = "ADMIN", RoleName = "Quản trị" };
        db.Roles.Add(role);
        db.Ranks.Add(new Rank { Id = 1, RankCode = "MST", RankName = "Master" });
        db.Ports.Add(new Port { PortCode = "VNHPH", PortName = "Hai Phong", CountryCode = "VN" });
        db.ShipData.Add(new ShipData { Id = Guid.NewGuid(), ImoNumber = OldImo, ShipName = "MV OLD", CallSign = "", Flag = "", PortOfRegistry = "" });
        await db.SaveChangesAsync();

        db.CrewMembers.Add(new CrewMember { Id = Guid.NewGuid(), CrewId = "CREW-OLD-1", FullName = "Thuyen Vien Cu", OriginNode = "SHORE" });
        await db.SaveChangesAsync();
        db.Users.Add(new User { Username = "admin", PasswordHash = "x", RoleId = role.Id });
        db.Users.Add(new User { Username = "CREW-OLD-1", PasswordHash = "x", RoleId = role.Id, CrewId = "CREW-OLD-1" });
        db.VoyageRecords.Add(new VoyageRecord { VoyageNumber = "V-OLD-01" });
        db.EquipmentAssets.Add(new EquipmentAsset { AssetCode = "ME-01", AssetName = "Main engine", Category = "ENGINE", OriginNode = "edge-old" });
        db.SyncQueue.Add(new SyncQueue { TableName = "voyage_record", RecordKey = "x", Payload = "{}" });
        db.SyncState.Add(new SyncState { Key = "shore:abc", Value = "5", UpdatedAt = DateTime.UtcNow });

        var current = Profile(Guid.NewGuid(), OldImo, active: true);
        var next = Profile(nextVesselId ?? Guid.NewGuid(), NewImo, active: false);
        db.EdgeProvisioningProfiles.AddRange(current, next);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        return (current, next);
    }

    private static EdgeProvisioningProfile Profile(Guid vesselId, string imo, bool active) => new()
    {
        IsActive = active, NodeId = $"edge-{imo}-main", VesselImo = imo, VesselName = "MV " + imo, VesselId = vesselId,
        ShoreBaseUrl = "http://localhost:5000", NodeApiToken = "token", SigningKey = "key",
        HandshakeStatus = "success", LastHandshakeAt = DateTime.UtcNow
    };

    private sealed class ShoreStub(Func<EdgeProvisioningProfile?> profile, bool online) : HttpMessageHandler
    {
        public List<JsonElement> Handshakes { get; } = new();

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token)
        {
            if (!online) throw new HttpRequestException("shore offline");
            var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token)).RootElement.Clone();
            Handshakes.Add(body);
            var p = profile()!;
            var json = JsonSerializer.Serialize(new { accepted = true, nodeId = p.NodeId, vesselImo = p.VesselImo, shoreVesselId = p.VesselId, fullSyncQueued = 42 });
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
        }
    }

    private static (EdgeProvisioningController Controller, ShoreStub Shore) Controller(EdgeDbContext db, EdgeProvisioningProfile next, bool shoreOnline = true)
    {
        var encryption = new Mock<IEdgeDataEncryptionService>();
        encryption.Setup(e => e.Decrypt(It.IsAny<string?>())).Returns((string? v) => v);
        var shore = new ShoreStub(() => next, shoreOnline);
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(() => new HttpClient(shore));
        var vesselSwitch = new EdgeVesselSwitchService(db, encryption.Object, factory.Object, NullLogger<EdgeVesselSwitchService>.Instance);

        // Kéo dữ liệu ban đầu chạy nền: ở đây chỉ cần một ISyncService rỗng.
        var sync = new Mock<ISyncService>();
        sync.Setup(s => s.PullFromShoreAsync(It.IsAny<CancellationToken>(), It.IsAny<int?>())).ReturnsAsync(0);
        var services = new ServiceCollection().AddSingleton(sync.Object).BuildServiceProvider();

        return (new EdgeProvisioningController(db, encryption.Object, Mock.Of<IEdgeRuntimeConfigService>(), factory.Object,
            vesselSwitch, services.GetRequiredService<IServiceScopeFactory>(), NullLogger<EdgeProvisioningController>.Instance), shore);
    }

    private static EdgeProvisioningController.ProfileActionRequest Activate(EdgeProvisioningProfile p, bool confirm) =>
        new() { ProfileId = p.Id, ConfirmReset = confirm };

    [Inventory.PmsPostgresFact]
    public async Task SwitchToAnotherVessel_WipesOldVesselData_KeepsSharedCatalogAndAdmin_AndRequestsFullSync()
    {
        await using var db = await Db();
        var (_, next) = await SeedOldVessel(db);
        var (controller, shore) = Controller(db, next);

        var result = await controller.Activate(Activate(next, confirm: true));

        Assert.IsType<OkObjectResult>(result);
        db.ChangeTracker.Clear();
        // Dữ liệu tàu cũ: hết.
        Assert.Empty(await db.CrewMembers.ToListAsync());
        Assert.Empty(await db.VoyageRecords.ToListAsync());
        Assert.Empty(await db.EquipmentAssets.ToListAsync());
        Assert.Empty(await db.SyncQueue.ToListAsync());
        Assert.False(await db.SyncState.AnyAsync(s => s.Key == "shore:abc"));
        // Tài khoản thuyền viên đi cùng thuyền viên; admin, quyền, danh mục dùng chung giữ lại.
        Assert.Equal(["admin"], await db.Users.Select(u => u.Username).ToListAsync());
        Assert.Single(await db.Roles.ToListAsync());
        Assert.Single(await db.Ranks.ToListAsync());
        Assert.Single(await db.Ports.ToListAsync());
        // Danh tính tàu = tàu mới; chỉ một gói đang dùng.
        var ship = await db.ShipData.SingleAsync();
        Assert.Equal(NewImo, ship.ImoNumber);
        Assert.Equal(next.Id, (await db.EdgeProvisioningProfiles.SingleAsync(p => p.IsActive)).Id);
        // Đã xin bờ gửi lại toàn bộ, không còn cờ chờ.
        Assert.True(Assert.Single(shore.Handshakes).GetProperty("requestFullSync").GetBoolean());
        Assert.False(await db.SyncState.AnyAsync(s => s.Key == EdgeVesselSwitchService.FullSyncPendingKey));
        await db.Database.EnsureDeletedAsync();
    }

    [Inventory.PmsPostgresFact]
    public async Task SwitchToAnotherVessel_WithoutConfirmation_IsRefused_AndKeepsEverything()
    {
        await using var db = await Db();
        var (current, next) = await SeedOldVessel(db);
        var (controller, shore) = Controller(db, next);

        var result = await controller.Activate(Activate(next, confirm: false));

        var conflict = Assert.IsType<ConflictObjectResult>(result);
        Assert.Contains("\"pendingUploads\":1", JsonSerializer.Serialize(conflict.Value, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        db.ChangeTracker.Clear();
        Assert.Single(await db.CrewMembers.ToListAsync());
        Assert.Equal(OldImo, (await db.ShipData.SingleAsync()).ImoNumber);
        Assert.Equal(current.Id, (await db.EdgeProvisioningProfiles.SingleAsync(p => p.IsActive)).Id);
        Assert.Empty(shore.Handshakes);
        await db.Database.EnsureDeletedAsync();
    }

    [Inventory.PmsPostgresFact]
    public async Task NewPackageForSameVessel_KeepsAllData()
    {
        await using var db = await Db();
        var (current, _) = await SeedOldVessel(db);
        var rotated = Profile(current.VesselId!.Value, OldImo, active: false);
        rotated.KeyVersion = 2;
        db.EdgeProvisioningProfiles.Add(rotated);
        await db.SaveChangesAsync();
        var (controller, shore) = Controller(db, rotated);

        Assert.IsType<OkObjectResult>(await controller.Activate(Activate(rotated, confirm: false)));

        db.ChangeTracker.Clear();
        Assert.Single(await db.CrewMembers.ToListAsync());
        Assert.Single(await db.VoyageRecords.ToListAsync());
        Assert.Single(await db.SyncQueue.ToListAsync());
        Assert.Empty(shore.Handshakes);
        await db.Database.EnsureDeletedAsync();
    }

    [Inventory.PmsPostgresFact]
    public async Task SwitchWhileShoreOffline_WipesAndRetriesFullSyncLater()
    {
        await using var db = await Db();
        var (_, next) = await SeedOldVessel(db);
        var (offline, _) = Controller(db, next, shoreOnline: false);

        Assert.IsType<OkObjectResult>(await offline.Activate(Activate(next, confirm: true)));
        db.ChangeTracker.Clear();
        Assert.Empty(await db.CrewMembers.ToListAsync());
        Assert.True(await db.SyncState.AnyAsync(s => s.Key == EdgeVesselSwitchService.FullSyncPendingKey));

        // Bờ có lại: chu kỳ đồng bộ xin bờ gửi toàn bộ, gỡ cờ.
        var encryption = new Mock<IEdgeDataEncryptionService>();
        encryption.Setup(e => e.Decrypt(It.IsAny<string?>())).Returns((string? v) => v);
        var shore = new ShoreStub(() => next, online: true);
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(() => new HttpClient(shore));
        var vesselSwitch = new EdgeVesselSwitchService(db, encryption.Object, factory.Object, NullLogger<EdgeVesselSwitchService>.Instance);

        Assert.True(await vesselSwitch.CompletePendingFullSyncAsync());
        Assert.True(Assert.Single(shore.Handshakes).GetProperty("requestFullSync").GetBoolean());
        Assert.False(await db.SyncState.AnyAsync(s => s.Key == EdgeVesselSwitchService.FullSyncPendingKey));
        await db.Database.EnsureDeletedAsync();
    }

    [Inventory.PmsPostgresFact]
    public async Task FirstActivation_OnMachineWithLeftoverData_CleansItToFollowShore()
    {
        await using var db = await Db();
        var (current, next) = await SeedOldVessel(db);
        // Chưa từng kích hoạt gói nào, nhưng máy có dữ liệu không rõ nguồn.
        await db.EdgeProvisioningProfiles.Where(p => p.Id == current.Id).ExecuteDeleteAsync();
        var (controller, _) = Controller(db, next);

        Assert.IsType<ConflictObjectResult>(await controller.Activate(Activate(next, confirm: false)));
        Assert.IsType<OkObjectResult>(await controller.Activate(Activate(next, confirm: true)));
        db.ChangeTracker.Clear();
        Assert.Empty(await db.CrewMembers.ToListAsync());
        Assert.Equal(NewImo, (await db.ShipData.SingleAsync()).ImoNumber);
        await db.Database.EnsureDeletedAsync();
    }
}

/// <summary>
/// Dữ liệu riêng của tàu (thiết bị, lịch bảo dưỡng, báo cáo, chuyến đi) bờ gửi kèm IMO tàu đích: tàu chỉ áp gói của
/// chính nó. Báo cáo do tàu làm chủ: bờ chỉ bổ sung dòng còn thiếu, không sửa dòng tàu đã có.
/// </summary>
public class VesselScopedIncomingTests
{
    private const string OwnImo = "9876543";
    private const string OtherImo = "8765432";

    private static async Task<EdgeDbContext> Db()
    {
        var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options) { SuppressSyncQueue = true };
        db.ShipData.Add(new ShipData { ImoNumber = OwnImo, ShipName = "MV PACIFIC VOYAGER" });
        await db.SaveChangesAsync();
        return db;
    }

    private static SyncConflictHandler Handler() => new(NullLogger<SyncConflictHandler>.Instance);

    private static SyncQueueItemDto Item(string table, string key, object payload, string? imo, string action = "SNAPSHOT")
    {
        var json = JsonSerializer.SerializeToNode(payload, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase })!.AsObject();
        if (imo != null) json[SyncConflictHandler.TargetVesselImoField] = imo;
        return new SyncQueueItemDto { TableName = table, RecordKey = key, ActionType = action, Payload = json.ToJsonString() };
    }

    private static EquipmentAsset Asset(string code) =>
        new() { Id = Guid.NewGuid(), AssetCode = code, AssetName = code, Category = "ENGINE", OriginNode = "SHORE" };

    [Fact]
    public async Task EquipmentForThisShip_IsApplied_ForAnotherShip_IsIgnored()
    {
        await using var db = await Db();
        var mine = Asset("ME-01"); var theirs = Asset("ME-99");

        await Handler().HandleIncomingAsync(db, Item("equipment_asset", mine.Id.ToString(), mine, OwnImo), default);
        await Handler().HandleIncomingAsync(db, Item("equipment_asset", theirs.Id.ToString(), theirs, OtherImo), default);
        await db.SaveChangesAsync();

        Assert.Equal(["ME-01"], await db.EquipmentAssets.Select(e => e.AssetCode).ToListAsync());
    }

    [Fact]
    public async Task EquipmentEditedOnShore_UpdatesTheShipsAsset()
    {
        await using var db = await Db();
        var asset = Asset("ME-01");
        db.EquipmentAssets.Add(asset); await db.SaveChangesAsync(); db.ChangeTracker.Clear();

        asset.AssetName = "Main engine (sửa ở bờ)";
        await Handler().HandleIncomingAsync(db, Item("equipment_asset", asset.Id.ToString(), asset, OwnImo), default);
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();

        Assert.Equal("Main engine (sửa ở bờ)", (await db.EquipmentAssets.SingleAsync()).AssetName);
    }

    [Fact]
    public async Task VoyageForAnotherShip_IsIgnored()
    {
        await using var db = await Db();
        var voyage = new VoyageRecord { Id = Guid.NewGuid(), VoyageNumber = "V-B-01" };
        await Handler().HandleIncomingAsync(db, Item("voyage_record", voyage.Id.ToString(), voyage, OtherImo), default);
        await db.SaveChangesAsync();
        Assert.Empty(await db.VoyageRecords.ToListAsync());
    }

    [Fact]
    public async Task Report_RestoredFromShore_OnlyFillsMissingRows_NeverOverwritesShipCopy()
    {
        await using var db = await Db();
        var existing = new MaritimeReport { Id = Guid.NewGuid(), ReportNumber = "NR-1", ReportTypeId = 1, Status = "DRAFT_ON_SHIP", ReportData = "{}" };
        db.MaritimeReports.Add(existing); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        var missing = new MaritimeReport { Id = Guid.NewGuid(), ReportNumber = "NR-2", ReportTypeId = 1, Status = "TRANSMITTED", ReportData = "{}" };
        var shoreCopy = new MaritimeReport { Id = existing.Id, ReportNumber = "NR-1", ReportTypeId = 1, Status = "SHORE_VERSION", ReportData = "{}" };

        await Handler().HandleIncomingAsync(db, Item("maritime_report", missing.Id.ToString(), missing, OwnImo), default);
        await Handler().HandleIncomingAsync(db, Item("maritime_report", existing.Id.ToString(), shoreCopy, OwnImo), default);
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();

        var reports = await db.MaritimeReports.OrderBy(r => r.ReportNumber).ToListAsync();
        Assert.Equal(["NR-1", "NR-2"], reports.Select(r => r.ReportNumber));
        Assert.Equal("DRAFT_ON_SHIP", reports[0].Status);
    }

    [Fact]
    public async Task SharedCatalog_IsAppliedOnEveryShip_WithoutVesselStamp()
    {
        await using var db = await Db();
        var rank = new Rank { Id = 7, RankCode = "C/O", RankName = "Chief Officer" };
        await Handler().HandleIncomingAsync(db, Item("rank", "7", rank, imo: null), default);
        await db.SaveChangesAsync();
        Assert.Equal("C/O", (await db.Ranks.SingleAsync()).RankCode);
    }
}
