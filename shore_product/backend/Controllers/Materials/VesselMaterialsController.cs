using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.Services.Sync;
using System.Text.Json;

namespace ProductApi.Controllers.Materials;

[ApiController]
[Route("api/vessels/{vesselId:guid}/materials")]
public class VesselMaterialsController(AppDbContext context, ISyncOutboxService outbox) : ControllerBase
{
    public const string SyncTable = "vessel_material_definition";

    private static string? Validate(VesselMaterialDefinition row)
    {
        row.ItemCode = (row.ItemCode ?? "").Trim();
        row.Name = (row.Name ?? "").Trim();
        row.Unit = (row.Unit ?? "").Trim();
        if (row.ItemCode.Length is 0 or > 50 || row.Name.Length is 0 or > 200 || row.Unit.Length is 0 or > 20)
            return "Cần mã vật tư (tối đa 50 ký tự), tên (200 ký tự) và đơn vị (20 ký tự).";
        if (row.UnitCost < 0) return "Đơn giá không được âm.";
        if (row.Manufacturer?.Length > 100 || row.PartNumber?.Length > 100 || row.Supplier?.Length > 200)
            return "Hãng sản xuất/mã phụ tùng tối đa 100 ký tự; nhà cung cấp tối đa 200 ký tự.";
        return null;
    }

    private static bool MatchesDefinition(string? payload, VesselMaterialDefinition current)
    {
        if (string.IsNullOrWhiteSpace(payload)) return false;
        VesselMaterialDefinition? sent;
        try { sent = JsonSerializer.Deserialize<VesselMaterialDefinition>(payload, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }); }
        catch (JsonException) { return false; }
        return sent != null && sent.Id == current.Id && sent.VesselId == current.VesselId
            && sent.CatalogId == current.CatalogId && sent.MaterialItemCode == current.MaterialItemCode
            && sent.ItemCode == current.ItemCode && sent.Name == current.Name && sent.Unit == current.Unit
            && sent.Specification == current.Specification && sent.Manufacturer == current.Manufacturer
            && sent.PartNumber == current.PartNumber && sent.Supplier == current.Supplier
            && sent.Notes == current.Notes && sent.UnitCost == current.UnitCost && sent.IsActive == current.IsActive;
    }

    [HttpGet]
    public async Task<IActionResult> List(Guid vesselId)
    {
        if (!await context.Vessels.AnyAsync(v => v.Id == vesselId)) return NotFound();
        var rows = await (from s in context.MaterialItemShips.AsNoTracking()
                          where s.VesselId == vesselId && s.IsActive
                          join c in context.MaterialItems.AsNoTracking() on s.MaterialItemCode equals c.ItemCode into catalog
                          from c in catalog.DefaultIfEmpty()
                          orderby s.ShipItemCode
                          select new { ship = s, name = c == null ? s.ShipItemCode : c.Name, catalogId = c == null ? Guid.Empty : c.Id }).ToListAsync();
        var node = await context.SyncNodeTrackers.AsNoTracking().SingleOrDefaultAsync(n => n.VesselId == vesselId && n.IsRegistered && !n.IsRevoked);
        var keys = rows.Select(r => r.ship.Id.ToString()).ToList();
        var deliveries = node == null ? [] : await context.SyncOutbox.AsNoTracking()
            .Where(o => o.TargetNode == node.NodeId && o.TableName == SyncTable && keys.Contains(o.RecordKey))
            .OrderByDescending(o => o.Id).ToListAsync();
        return Ok(rows.Select(r => {
            var s = r.ship;
            var last = deliveries.FirstOrDefault(o => o.RecordKey == s.Id.ToString());
            var matches = MatchesDefinition(last?.Payload, new VesselMaterialDefinition {
                Id = s.Id, VesselId = vesselId, CatalogId = r.catalogId, MaterialItemCode = s.MaterialItemCode ?? "",
                ItemCode = s.ShipItemCode, Name = r.name, Unit = s.Unit, Specification = s.Specification,
                Manufacturer = s.Manufacturer, PartNumber = s.PartNumber, Supplier = s.Supplier, Notes = s.Notes,
                UnitCost = s.UnitCost, IsActive = s.IsActive
            });
            var status = !matches ? "NotSynced" : last!.DeliveredAt == null ? "Pending" : "Synced";
            return new { s.Id, r.catalogId, itemCode = s.ShipItemCode, r.name, s.Unit, s.Specification, s.Manufacturer,
                s.PartNumber, s.Supplier, s.Notes, s.UnitCost, s.OnHandQuantity, s.MinStock, s.MaxStock,
                s.IsActive, s.VesselId, s.CreatedAt, s.UpdatedAt, syncStatus = status, syncedAt = last?.DeliveredAt };
        }));
    }

    [HttpPost]
    public async Task<IActionResult> Create(Guid vesselId, [FromBody] VesselMaterialDefinition row)
    {
        var error = Validate(row);
        if (error != null) return BadRequest(new { message = error });
        if (!await context.Vessels.AnyAsync(v => v.Id == vesselId)) return NotFound();
        if (await context.MaterialItemShips.AnyAsync(s => s.VesselId == vesselId && s.ShipItemCode == row.ItemCode))
            return Conflict(new { message = "Mã vật tư đã có trên tàu này." });
        await using var transaction = await context.Database.BeginTransactionAsync();
        var catalog = new MaterialItem { ItemCode = Guid.NewGuid().ToString("N"), Name = row.Name };
        var ship = new MaterialItemShip { VesselId = vesselId, MaterialItemCode = catalog.ItemCode, ShipItemCode = row.ItemCode };
        Apply(ship, catalog, row);
        context.MaterialItems.Add(catalog);
        context.MaterialItemShips.Add(ship);
        await context.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(new { ship.Id });
    }

    private static void Apply(MaterialItemShip ship, MaterialItem catalog, VesselMaterialDefinition row)
    {
        catalog.Name = row.Name;
        catalog.UnitPrice = row.UnitCost;
        catalog.UpdatedAt = DateTime.UtcNow;
        ship.ShipItemCode = row.ItemCode;
        ship.Unit = row.Unit;
        ship.Specification = row.Specification;
        ship.Manufacturer = row.Manufacturer;
        ship.PartNumber = row.PartNumber;
        ship.Supplier = row.Supplier;
        ship.Notes = row.Notes;
        ship.UnitCost = row.UnitCost;
        ship.UpdatedAt = catalog.UpdatedAt;
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid vesselId, Guid id, [FromBody] VesselMaterialDefinition row)
    {
        var error = Validate(row);
        if (error != null) return BadRequest(new { message = error });
        var ship = await context.MaterialItemShips.AsTracking().SingleOrDefaultAsync(s => s.Id == id && s.VesselId == vesselId && s.IsActive);
        if (ship == null) return NotFound();
        if (await context.MaterialItemShips.AnyAsync(s => s.VesselId == vesselId && s.Id != id && s.ShipItemCode == row.ItemCode))
            return Conflict(new { message = "Mã vật tư đã có trên tàu này." });
        await using var transaction = await context.Database.BeginTransactionAsync();
        var catalog = await context.MaterialItems.AsTracking().SingleOrDefaultAsync(c => c.ItemCode == ship.MaterialItemCode);
        // A legacy shared catalog must not change another vessel's name/price.
        if (catalog == null || await context.MaterialItemShips.AnyAsync(s => s.MaterialItemCode == ship.MaterialItemCode && s.VesselId != vesselId))
        {
            var oldCatalogId = catalog?.Id;
            catalog = new MaterialItem { ItemCode = Guid.NewGuid().ToString("N") };
            context.MaterialItems.Add(catalog);
            ship.MaterialItemCode = catalog.ItemCode;
            if (oldCatalogId.HasValue)
            {
                var oldLinks = await (from l in context.MaterialItemEquipments
                                      join e in context.EquipmentAssets on l.EquipmentAssetId equals e.Id
                                      where l.MaterialItemId == oldCatalogId.Value && e.VesselId == vesselId select l).ToListAsync();
                foreach (var link in oldLinks) context.MaterialItemEquipments.Add(new MaterialItemEquipment {
                    MaterialItemId = catalog.Id, EquipmentAssetId = link.EquipmentAssetId, Notes = link.Notes
                });
                context.MaterialItemEquipments.RemoveRange(oldLinks);
            }
        }
        Apply(ship, catalog, row);
        await context.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(new { ship.Id });
    }

    [HttpPost("delete")]
    public async Task<IActionResult> Delete(Guid vesselId, [FromBody] List<Guid> ids)
    {
        if (ids.Count == 0) return BadRequest();
        var rows = await context.MaterialItemShips.AsTracking().Where(s => s.VesselId == vesselId && ids.Contains(s.Id)).ToListAsync();
        if (rows.Count != ids.Distinct().Count()) return NotFound();
        foreach (var row in rows) { row.IsActive = false; row.UpdatedAt = DateTime.UtcNow; }
        await context.SaveChangesAsync();
        return Ok(new { deleted = rows.Count });
    }

    [HttpPost("import")]
    public async Task<IActionResult> Import(Guid vesselId, [FromBody] List<VesselMaterialDefinition> rows)
    {
        if (!await context.Vessels.AnyAsync(v => v.Id == vesselId)) return NotFound();
        if (rows.Count is 0 or > 1000) return BadRequest(new { message = "Mỗi lần import cần 1–1000 vật tư." });
        var codes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows)
        {
            var error = Validate(row);
            if (error != null || !codes.Add(row.ItemCode)) return BadRequest(new { message = error ?? "File có mã vật tư trùng nhau." });
        }
        // Reject collisions rather than silently overwriting existing vessel definitions.
        if (await context.MaterialItemShips.AnyAsync(s => s.VesselId == vesselId && codes.Contains(s.ShipItemCode)))
            return Conflict(new { message = "File có mã vật tư đã tồn tại trên tàu. Hãy chỉnh sửa vật tư đã có hoặc bỏ dòng trùng." });
        await using var transaction = await context.Database.BeginTransactionAsync();
        foreach (var row in rows)
        {
            var catalog = new MaterialItem { ItemCode = Guid.NewGuid().ToString("N"), Name = row.Name };
            var ship = new MaterialItemShip { VesselId = vesselId, MaterialItemCode = catalog.ItemCode };
            Apply(ship, catalog, row);
            context.MaterialItems.Add(catalog);
            context.MaterialItemShips.Add(ship);
        }
        await context.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(new { created = rows.Count });
    }

    [HttpPost("sync")]
    public async Task<IActionResult> Sync(Guid vesselId)
    {
        var node = await context.SyncNodeTrackers.SingleOrDefaultAsync(n => n.VesselId == vesselId && n.IsRegistered && !n.IsRevoked);
        if (node == null) return Conflict(new { message = "Tàu chưa có node đồng bộ được đăng ký." });
        await using var transaction = await context.Database.BeginTransactionAsync();
        // Serialize simultaneous sync requests for this vessel before comparing the outbox.
        await context.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({vesselId.ToString()}, 0))");
        var rows = await (from s in context.MaterialItemShips.AsNoTracking()
                          where s.VesselId == vesselId
                          join c in context.MaterialItems.AsNoTracking() on s.MaterialItemCode equals c.ItemCode
                          select new VesselMaterialDefinition {
                              Id = s.Id, VesselId = vesselId, CatalogId = c.Id, MaterialItemCode = c.ItemCode,
                              ItemCode = s.ShipItemCode, Name = c.Name, Unit = s.Unit, Specification = s.Specification,
                              Manufacturer = s.Manufacturer, PartNumber = s.PartNumber, Supplier = s.Supplier,
                              Notes = s.Notes, UnitCost = s.UnitCost, IsActive = s.IsActive, UpdatedAt = s.UpdatedAt
                          }).ToListAsync();
        var keys = rows.Select(r => r.Id.ToString()).ToList();
        var deliveries = await context.SyncOutbox.AsNoTracking()
            .Where(o => o.TargetNode == node.NodeId && o.TableName == SyncTable && keys.Contains(o.RecordKey))
            .OrderByDescending(o => o.Id).ToListAsync();
        var latest = deliveries.GroupBy(o => o.RecordKey).ToDictionary(g => g.Key, g => g.First());
        var changed = rows.Where(row => !latest.TryGetValue(row.Id.ToString(), out var last)
            || !MatchesDefinition(last.Payload, row)).ToList();
        if (changed.Count == 0)
        {
            var pending = rows.Any(row => latest.TryGetValue(row.Id.ToString(), out var last) && last.DeliveredAt == null);
            return Conflict(new {
                code = pending ? "MATERIAL_SYNC_PENDING" : "NO_MATERIAL_CHANGES",
                message = pending ? "Vật tư đã được xếp hàng đồng bộ và đang chờ tàu nhận. Không có thay đổi mới để gửi."
                    : rows.Count == 0 ? "Không có vật tư để đồng bộ."
                    : "Vật tư đã đồng bộ. Không có thay đổi mới để gửi."
            });
        }
        rows = changed;
        // Equipment assignments belong to Edge; catalog delivery must not replace local links.
        foreach (var row in rows) row.UpdatedAt = DateTime.UtcNow;
        await outbox.EnqueueBatchAsync(node.NodeId, rows.Select(row =>
            (SyncTable, row.Id.ToString(), SyncActionType.UPDATE, (object)row)).ToList());
        await transaction.CommitAsync();
        return Ok(new { queued = rows.Count, message = "Đã đưa vào hàng đợi gửi xuống tàu. Khi có kết nối, dịch vụ trên tàu sẽ tự nhận và lưu dữ liệu; không cần người trên tàu xác nhận." });
    }
}
