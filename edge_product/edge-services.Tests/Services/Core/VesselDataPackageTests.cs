using System.IO.Compression;
using System.Text.Json;
using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

/// <summary>
/// Gói dữ liệu tàu (.zip): đổi tàu ở máy A thì TRƯỚC khi xoá, đóng gói toàn bộ dữ liệu tàu cũ (kể cả phần chưa gửi
/// lên bờ). Máy B sau này chạy lại tàu đó: kích hoạt gói cấu hình (nhận từ bờ) rồi nhập gói dữ liệu để bù đủ.
/// </summary>
public partial class VesselSwitchTests
{
    private static ZipArchive OpenZip(string root) =>
        ZipFile.OpenRead(Directory.GetFiles(Path.Combine(root, EdgeVesselDataPackageService.FolderName), "*.zip").Single());

    private static JsonElement[] Rows(ZipArchive zip, string table)
    {
        using var reader = new StreamReader(zip.GetEntry($"data/{table}.json")!.Open());
        return JsonDocument.Parse(reader.ReadToEnd()).RootElement.EnumerateArray().Select(e => e.Clone()).ToArray();
    }

    /// <summary>Máy A: dữ liệu tàu cũ + một ảnh đính kèm; chuyến đi đã đồng bộ, thiết bị CHƯA gửi lên bờ.</summary>
    private static async Task<(EdgeProvisioningProfile Current, EdgeProvisioningProfile Next, string Root, Guid VoyageId, Guid AssetId)> MachineA(EdgeDbContext db)
    {
        var (current, next) = await SeedOldVessel(db);
        await db.VoyageRecords.ExecuteUpdateAsync(s => s.SetProperty(v => v.IsSynced, true));
        await db.EquipmentAssets.ExecuteUpdateAsync(s => s.SetProperty(a => a.AssetName, "Máy chính (sửa trên tàu, chưa gửi bờ)"));
        var root = TempRoot();
        Directory.CreateDirectory(Path.Combine(root, "uploads", "crew", "avatars"));
        await File.WriteAllTextAsync(Path.Combine(root, "uploads", "crew", "avatars", "crew-old-1.jpg"), "anh");
        Directory.CreateDirectory(Path.Combine(root, "uploads", "sync-staging"));
        await File.WriteAllTextAsync(Path.Combine(root, "uploads", "sync-staging", "tam.part"), "tam");
        return (current, next, root,
            await db.VoyageRecords.Select(v => v.Id).SingleAsync(),
            await db.EquipmentAssets.Select(a => a.Id).SingleAsync());
    }

    [Inventory.PmsPostgresFact]
    public async Task SwitchVessel_PacksAllOldVesselDataIntoZip_BeforeWiping()
    {
        await using var db = await Db();
        var (_, next, root, _, _) = await MachineA(db);
        var (controller, _) = Controller(db, next, packages: Packages(db, root));

        var ok = Assert.IsType<OkObjectResult>(await controller.Activate(Activate(next, confirm: true)));

        Assert.Contains("dataPackage", JsonSerializer.Serialize(ok.Value));
        using var zip = OpenZip(root);
        using (var manifest = JsonDocument.Parse(new StreamReader(zip.GetEntry("manifest.json")!.Open()).ReadToEnd()))
        {
            Assert.Equal(OldImo, manifest.RootElement.GetProperty("vesselImo").GetString());
            Assert.Equal(1, manifest.RootElement.GetProperty("pendingUploads").GetInt32());
        }
        Assert.Equal("CREW-OLD-1", Rows(zip, "crew_members").Single().GetProperty("crew_id").GetString());
        Assert.Equal("CREW-OLD-1", Rows(zip, "users").Single().GetProperty("username").GetString());
        Assert.Single(Rows(zip, "voyage_records"));
        Assert.Single(Rows(zip, "sync_queue"));
        Assert.Null(zip.GetEntry("data/sync_state.json"));              // trạng thái riêng của máy cũ
        Assert.NotNull(zip.GetEntry("files/crew/avatars/crew-old-1.jpg"));
        Assert.Null(zip.GetEntry("files/sync-staging/tam.part"));        // thư mục tạm không đóng gói

        db.ChangeTracker.Clear();
        Assert.Empty(await db.CrewMembers.ToListAsync());                // đóng gói xong mới xoá
        await db.Database.EnsureDeletedAsync();
    }

    [Inventory.PmsPostgresFact]
    public async Task SwitchVessel_WhenPackagingFails_NothingIsWiped()
    {
        await using var db = await Db();
        var (current, next) = await SeedOldVessel(db);
        var failing = new Mock<IEdgeVesselDataPackageService>();
        failing.Setup(p => p.CreateAsync(It.IsAny<EdgeProvisioningProfile?>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new IOException("Ổ đĩa đầy"));
        var (controller, shore) = Controller(db, next, packages: failing.Object);

        var result = Assert.IsType<ObjectResult>(await controller.Activate(Activate(next, confirm: true)));

        Assert.Equal(500, result.StatusCode);
        Assert.Contains("CHƯA xoá", JsonSerializer.Serialize(result.Value, new JsonSerializerOptions { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
        db.ChangeTracker.Clear();
        Assert.Single(await db.CrewMembers.ToListAsync());
        Assert.Equal(current.Id, (await db.EdgeProvisioningProfiles.SingleAsync(p => p.IsActive)).Id);
        Assert.Empty(shore.Handshakes);
        await db.Database.EnsureDeletedAsync();
    }

    [Inventory.PmsPostgresFact]
    public async Task MachineB_ImportsPackage_FillsMissingData_KeepsShoreCopy_UnsyncedChangesWin_AndRequeues()
    {
        // Máy A đổi sang tàu khác → có gói dữ liệu của tàu cũ.
        await using var a = await Db();
        var (current, next, rootA, voyageId, assetId) = await MachineA(a);
        var (controllerA, _) = Controller(a, next, packages: Packages(a, rootA));
        Assert.IsType<OkObjectResult>(await controllerA.Activate(Activate(next, confirm: true)));
        var zipPath = Directory.GetFiles(Path.Combine(rootA, EdgeVesselDataPackageService.FolderName), "*.zip").Single();

        // Máy B: vừa kích hoạt gói cấu hình của tàu cũ và nhận một phần dữ liệu từ bờ.
        await using var b = await Db();
        b.Roles.Add(new Role { RoleCode = "ADMIN", RoleName = "Quản trị" });
        var profileB = Profile(current.VesselId!.Value, OldImo, active: true);
        b.EdgeProvisioningProfiles.Add(profileB);
        b.ShipData.Add(new ShipData { Id = Guid.NewGuid(), ImoNumber = OldImo, ShipName = "MV OLD", CallSign = "", Flag = "", PortOfRegistry = "" });
        b.VoyageRecords.Add(new VoyageRecord { Id = voyageId, VoyageNumber = "V-OLD-01", VoyageStatus = "BẢN TỪ BỜ", IsSynced = true });
        b.EquipmentAssets.Add(new EquipmentAsset { Id = assetId, AssetCode = "ME-01", AssetName = "Bản từ bờ", Category = "ENGINE", OriginNode = "SHORE", IsSynced = true });
        await b.SaveChangesAsync();
        b.ChangeTracker.Clear();
        var rootB = TempRoot();

        await using (var zip = File.OpenRead(zipPath))
        {
            var result = await Packages(b, rootB).ImportAsync(zip);
            Assert.Equal(1, result.Requeued);
            Assert.Equal(1, result.Files);
        }

        b.ChangeTracker.Clear();
        Assert.Equal("CREW-OLD-1", (await b.CrewMembers.SingleAsync()).CrewId);                        // bờ chưa có → thêm
        Assert.True(await b.Users.AnyAsync(u => u.CrewId == "CREW-OLD-1"));                             // tài khoản thuyền viên
        Assert.Equal("BẢN TỪ BỜ", (await b.VoyageRecords.SingleAsync()).VoyageStatus);                  // đã đồng bộ → giữ bản bờ
        Assert.Equal("Máy chính (sửa trên tàu, chưa gửi bờ)", (await b.EquipmentAssets.SingleAsync()).AssetName); // chưa gửi bờ → bản tàu cũ thắng
        Assert.Single(await b.SyncQueue.Where(q => q.SyncedAt == null).ToListAsync());                  // đưa lại hàng chờ để gửi lên bờ
        Assert.Equal(OldImo, (await b.ShipData.SingleAsync()).ImoNumber);
        Assert.True(File.Exists(Path.Combine(rootB, "uploads", "crew", "avatars", "crew-old-1.jpg")));

        // Bộ đếm Id đã đẩy lên: thêm mới sau khi nhập không trùng khoá.
        b.SuppressSyncQueue = true;
        b.SyncQueue.Add(new SyncQueue { TableName = "crew_member", RecordKey = "x", Payload = "{}" });
        await b.SaveChangesAsync();

        await a.Database.EnsureDeletedAsync();
        await b.Database.EnsureDeletedAsync();
    }

    [Inventory.PmsPostgresFact]
    public async Task Import_PackageOfAnotherVessel_IsRefused_AndChangesNothing()
    {
        await using var a = await Db();
        var (_, next, rootA, _, _) = await MachineA(a);
        var (controllerA, _) = Controller(a, next, packages: Packages(a, rootA));
        Assert.IsType<OkObjectResult>(await controllerA.Activate(Activate(next, confirm: true)));
        var zipPath = Directory.GetFiles(Path.Combine(rootA, EdgeVesselDataPackageService.FolderName), "*.zip").Single();

        await using var b = await Db();
        b.EdgeProvisioningProfiles.Add(Profile(Guid.NewGuid(), NewImo, active: true)); // máy B đang chạy tàu khác
        await b.SaveChangesAsync();

        await using var zip = File.OpenRead(zipPath);
        var error = await Assert.ThrowsAsync<VesselDataPackageException>(() => Packages(b, TempRoot()).ImportAsync(zip));
        Assert.Contains(OldImo, error.Message);
        Assert.Empty(await b.CrewMembers.ToListAsync());

        await a.Database.EnsureDeletedAsync();
        await b.Database.EnsureDeletedAsync();
    }
}
