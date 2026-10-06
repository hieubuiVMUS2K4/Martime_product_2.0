using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.Services.Sync;
using Maritime.Shared.Models.Sync;

namespace ProductApi.Controllers.Materials;

[ApiController]
[Route("api/material")]
public class MaterialController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly ISyncOutboxService? _syncOutbox;

    public MaterialController(AppDbContext context, ISyncOutboxService? syncOutbox = null)
    {
        _context = context;
        _syncOutbox = syncOutbox;
    }

    // ============================================================
    // CATEGORIES
    // ============================================================

    [HttpGet("categories")]
    public async Task<IActionResult> GetCategories([FromQuery] string? q)
    {
        var query = _context.MaterialCategories.Where(c => c.IsActive).AsNoTracking();
        if (!string.IsNullOrEmpty(q))
            query = query.Where(c => c.Name.Contains(q) || c.CategoryCode.Contains(q));
        return Ok(await query.OrderBy(c => c.CategoryCode).ToListAsync());
    }

    [HttpGet("categories/detailed")]
    public async Task<IActionResult> GetCategoriesDetailed([FromQuery] string? q)
    {
        var cats = await _context.MaterialCategories.Where(c => c.IsActive).AsNoTracking().ToListAsync();
        var itemCounts = await _context.MaterialItems
            .Where(i => i.IsActive)
            .GroupBy(i => i.CategoryId)
            .Select(g => new { categoryId = g.Key, count = g.Count() })
            .ToListAsync();
        var countMap = itemCounts.ToDictionary(x => x.categoryId, x => x.count);
        var result = cats.Select(c => new
        {
            c.Id, c.CategoryCode, c.Name, c.Description, c.ParentCategoryId, c.IsActive, c.CreatedAt,
            itemCount = countMap.GetValueOrDefault(c.Id, 0)
        });
        return Ok(result);
    }

    [HttpGet("categories/{id:long}")]
    public async Task<IActionResult> GetCategoryById(long id)
    {
        var item = await _context.MaterialCategories.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id);
        return item == null ? NotFound() : Ok(item);
    }

    [HttpPost("categories")]
    public async Task<IActionResult> CreateCategory([FromBody] MaterialCategory dto)
    {
        if (await _context.MaterialCategories.AnyAsync(c => c.CategoryCode == dto.CategoryCode))
            return Conflict(new { message = "Category code already exists" });
        var entity = new MaterialCategory { CategoryCode = dto.CategoryCode, Name = dto.Name, Description = dto.Description, ParentCategoryId = dto.ParentCategoryId };
        _context.MaterialCategories.Add(entity);
        await _context.SaveChangesAsync();
        await BroadcastCategoryAsync(entity, SyncActionType.CREATE);
        return CreatedAtAction(nameof(GetCategoryById), new { id = entity.Id }, entity);
    }

    [HttpPut("categories/{id:long}")]
    public async Task<IActionResult> UpdateCategory(long id, [FromBody] MaterialCategory dto)
    {
        var entity = await _context.MaterialCategories.FindAsync(id);
        if (entity == null) return NotFound();
        entity.Name = dto.Name;
        entity.Description = dto.Description;
        entity.ParentCategoryId = dto.ParentCategoryId;
        entity.IsActive = dto.IsActive;
        await _context.SaveChangesAsync();
        await BroadcastCategoryAsync(entity, SyncActionType.UPDATE);
        return Ok(entity);
    }

    [HttpDelete("categories/{id:long}")]
    public async Task<IActionResult> DeleteCategory(long id)
    {
        var entity = await _context.MaterialCategories.FindAsync(id);
        if (entity == null) return NotFound();
        entity.IsActive = false;
        await _context.SaveChangesAsync();
        await BroadcastCategoryAsync(entity, SyncActionType.UPDATE);
        return Ok(new { message = "Deleted", id, categoryCode = entity.CategoryCode, name = entity.Name });
    }

    // Đẩy danh mục loại vật tư xuống tất cả tàu (shore làm chủ).
    private async Task BroadcastCategoryAsync(MaterialCategory c, SyncActionType action)
    {
        if (_syncOutbox == null) return;
        await _syncOutbox.BroadcastAsync("material_category", c.Id.ToString(), action, c);
    }

    [HttpGet("categories/{id:long}/items")]
    public async Task<IActionResult> GetItemsByCategory(long id, [FromQuery] string? q)
    {
        // Vật tư theo tàu (material_item_ship) thuộc loại này, kèm tên lấy từ danh mục chung.
        var query = from i in _context.MaterialItemShips.AsNoTracking()
                    where i.CategoryId == id && i.IsActive
                    join c in _context.MaterialItems.AsNoTracking() on i.MaterialItemCode equals c.ItemCode into cj
                    from c in cj.DefaultIfEmpty()
                    select new { i, name = c != null ? c.Name : i.MaterialItemCode };
        if (!string.IsNullOrEmpty(q))
            query = query.Where(x => x.name.Contains(q) || x.i.ShipItemCode.Contains(q) || x.i.MaterialItemCode.Contains(q));
        var rows = await query.OrderBy(x => x.i.ShipItemCode).ToListAsync();
        return Ok(rows.Select(x => Project(x.i, x.name)));
    }

    // Helper: chuẩn hoá dữ liệu vật tư theo tàu trả về cho FE (giữ field itemCode/name như cũ).
    private static object Project(MaterialItemShip i, string name) => new
    {
        i.Id, itemCode = i.ShipItemCode, shipItemCode = i.ShipItemCode, materialItemCode = i.MaterialItemCode,
        name, i.CategoryId, i.Specification, i.Unit, i.OnHandQuantity, i.MinStock, i.MaxStock,
        i.ReorderLevel, i.ReorderQuantity, i.Location, i.Manufacturer, i.Supplier, i.PartNumber,
        i.Barcode, i.UnitCost, i.Currency, i.Notes, i.ImageUrl, i.IsActive, i.VesselId, i.CreatedAt, i.UpdatedAt
    };

    // ============================================================
    // CATALOG ITEMS (danh mục vật tư dùng chung — material_items)
    // ============================================================

    [HttpGet("catalog")]
    public async Task<IActionResult> GetCatalog([FromQuery] string? q, [FromQuery] long? categoryId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var query = _context.MaterialItems.Where(i => i.IsActive).AsNoTracking();
        if (!string.IsNullOrEmpty(q))
            query = query.Where(i => i.Name.Contains(q) || i.ItemCode.Contains(q));
        if (categoryId.HasValue)
            query = query.Where(i => i.CategoryId == categoryId.Value);
        var total = await query.CountAsync();
        var items = await query.OrderBy(i => i.ItemCode).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        return Ok(new { items, total, page, pageSize });
    }

    [HttpGet("catalog/{id:guid}")]
    public async Task<IActionResult> GetCatalogById(Guid id)
    {
        var item = await _context.MaterialItems.AsNoTracking().FirstOrDefaultAsync(i => i.Id == id);
        return item == null ? NotFound() : Ok(item);
    }

    public sealed class CatalogImportRow
    {
        public string ItemCode { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string CategoryCode { get; set; } = string.Empty;
        public decimal? UnitPrice { get; set; }
    }

    [HttpPost("catalog/import")]
    public async Task<IActionResult> ImportCatalog([FromBody] List<CatalogImportRow> rows)
    {
        if (rows.Count == 0 || rows.Count > 1000)
            return BadRequest(new { message = "Mỗi lần import cần từ 1 đến 1000 vật tư." });
        var categories = await _context.MaterialCategories.Where(c => c.IsActive).ToListAsync();
        var errors = new List<string>();
        var codes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < rows.Count; index++)
        {
            var row = rows[index];
            row.ItemCode = (row.ItemCode ?? "").Trim();
            row.Name = (row.Name ?? "").Trim();
            row.CategoryCode = (row.CategoryCode ?? "").Trim();
            if (row.ItemCode.Length is 0 or > 50 || row.Name.Length is 0 or > 200)
                errors.Add($"Dòng {index + 2}: mã (tối đa 50 ký tự) và tên (tối đa 200 ký tự) là bắt buộc.");
            if (!codes.Add(row.ItemCode)) errors.Add($"Dòng {index + 2}: trùng mã vật tư {row.ItemCode}.");
            if (!categories.Any(c => c.CategoryCode == row.CategoryCode))
                errors.Add($"Dòng {index + 2}: mã loại vật tư {row.CategoryCode} chưa có trong danh mục.");
            if (row.UnitPrice < 0) errors.Add($"Dòng {index + 2}: đơn giá không được âm.");
        }
        if (errors.Count > 0) return BadRequest(new { message = string.Join("\n", errors) });

        await using var transaction = await _context.Database.BeginTransactionAsync();
        var existing = await _context.MaterialItems.Where(i => codes.Contains(i.ItemCode)).ToListAsync();
        var created = 0;
        var updated = 0;
        var changes = new List<(string TableName, string RecordKey, SyncActionType Action, object Payload)>();
        foreach (var row in rows)
        {
            var entity = existing.FirstOrDefault(i => i.ItemCode == row.ItemCode);
            var action = entity == null ? SyncActionType.CREATE : SyncActionType.UPDATE;
            if (entity == null)
            {
                entity = new MaterialItem { ItemCode = row.ItemCode };
                _context.MaterialItems.Add(entity);
                created++;
            }
            else updated++;
            entity.Name = row.Name;
            entity.CategoryId = categories.Single(c => c.CategoryCode == row.CategoryCode).Id;
            entity.UnitPrice = row.UnitPrice;
            entity.IsActive = true;
            entity.UpdatedAt = DateTime.UtcNow;
            changes.Add(("material_item_catalog", entity.Id.ToString(), action, entity));
        }
        await _context.SaveChangesAsync();
        if (_syncOutbox != null) await _syncOutbox.EnqueueBatchAsync("*", changes);
        await transaction.CommitAsync();
        return Ok(new { created, updated });
    }

    [HttpPost("catalog")]
    public async Task<IActionResult> CreateCatalog([FromBody] MaterialItem dto)
    {
        if (await _context.MaterialItems.AnyAsync(i => i.ItemCode == dto.ItemCode))
            return Conflict(new { message = "Item code already exists" });
        var entity = new MaterialItem
        {
            ItemCode = dto.ItemCode, Name = dto.Name, CategoryId = dto.CategoryId, UnitPrice = dto.UnitPrice,
        };
        _context.MaterialItems.Add(entity);
        await _context.SaveChangesAsync();
        await BroadcastCatalogAsync(entity, SyncActionType.CREATE);
        return CreatedAtAction(nameof(GetCatalogById), new { id = entity.Id }, entity);
    }

    [HttpPut("catalog/{id:guid}")]
    public async Task<IActionResult> UpdateCatalog(Guid id, [FromBody] MaterialItem dto)
    {
        var entity = await _context.MaterialItems.FindAsync(id);
        if (entity == null) return NotFound();
        entity.Name = dto.Name; entity.CategoryId = dto.CategoryId; entity.UnitPrice = dto.UnitPrice;
        entity.IsActive = dto.IsActive; entity.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        await BroadcastCatalogAsync(entity, SyncActionType.UPDATE);
        return Ok(entity);
    }

    [HttpDelete("catalog/{id:guid}")]
    public async Task<IActionResult> DeleteCatalog(Guid id)
    {
        var entity = await _context.MaterialItems.FindAsync(id);
        if (entity == null) return NotFound();
        entity.IsActive = false; entity.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        await BroadcastCatalogAsync(entity, SyncActionType.UPDATE);
        return Ok(new { message = "Deleted", id, itemCode = entity.ItemCode, name = entity.Name });
    }

    // Đẩy danh mục vật tư dùng chung xuống tất cả tàu (shore làm chủ).
    private async Task BroadcastCatalogAsync(MaterialItem c, SyncActionType action)
    {
        if (_syncOutbox == null) return;
        await _syncOutbox.BroadcastAsync("material_item_catalog", c.Id.ToString(), action, c);
    }

    // Đồng bộ TOÀN BỘ danh mục hiện có xuống tàu (initial/full resync).
    // Đẩy loại vật tư trước, rồi tới vật tư (vì catalog tham chiếu category_id).
    [HttpPost("sync/broadcast-all")]
    public async Task<IActionResult> BroadcastAllCatalog()
    {
        if (_syncOutbox == null) return Ok(new { message = "Sync outbox không khả dụng" });
        var cats = await _context.MaterialCategories.Where(c => c.IsActive).AsNoTracking().ToListAsync();
        foreach (var c in cats)
            await _syncOutbox.BroadcastAsync("material_category", c.Id.ToString(), SyncActionType.CREATE, c);
        var items = await _context.MaterialItems.Where(i => i.IsActive).AsNoTracking().ToListAsync();
        foreach (var i in items)
            await _syncOutbox.BroadcastAsync("material_item_catalog", i.Id.ToString(), SyncActionType.CREATE, i);
        return Ok(new { message = "Đã đẩy toàn bộ danh mục xuống tàu", categories = cats.Count, items = items.Count });
    }

    // ============================================================
    // SHIP ITEMS (vật tư theo tàu — material_item_ship)
    // ============================================================

    [HttpGet("items")]
    public async Task<IActionResult> GetItems([FromQuery] string? q, [FromQuery] long? categoryId,
        [FromQuery] bool? lowStock, [FromQuery] Guid? vesselId, [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        var baseQuery = from i in _context.MaterialItemShips.AsNoTracking()
                        where i.IsActive
                        join c in _context.MaterialItems.AsNoTracking() on i.MaterialItemCode equals c.ItemCode into cj
                        from c in cj.DefaultIfEmpty()
                        select new { i, name = c != null ? c.Name : i.MaterialItemCode };
        if (!string.IsNullOrEmpty(q))
            baseQuery = baseQuery.Where(x => x.name.Contains(q) || x.i.ShipItemCode.Contains(q)
                || x.i.MaterialItemCode.Contains(q) || (x.i.PartNumber != null && x.i.PartNumber.Contains(q)));
        if (categoryId.HasValue)
            baseQuery = baseQuery.Where(x => x.i.CategoryId == categoryId.Value);
        if (lowStock == true)
            baseQuery = baseQuery.Where(x => x.i.MinStock.HasValue && x.i.OnHandQuantity <= x.i.MinStock.Value);
        if (vesselId.HasValue)
            baseQuery = baseQuery.Where(x => x.i.VesselId == vesselId.Value);
        var total = await baseQuery.CountAsync();
        var rows = await baseQuery.OrderBy(x => x.i.ShipItemCode).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        var items = rows.Select(x => Project(x.i, x.name));
        return Ok(new { items, total, page, pageSize });
    }

    [HttpGet("items/detailed")]
    public async Task<IActionResult> GetItemsDetailed([FromQuery] string? q)
    {
        var baseQuery = from i in _context.MaterialItemShips.AsNoTracking()
                        where i.IsActive
                        join c in _context.MaterialItems.AsNoTracking() on i.MaterialItemCode equals c.ItemCode into cj
                        from c in cj.DefaultIfEmpty()
                        select new { i, name = c != null ? c.Name : i.MaterialItemCode };
        if (!string.IsNullOrEmpty(q))
            baseQuery = baseQuery.Where(x => x.name.Contains(q) || x.i.ShipItemCode.Contains(q) || x.i.MaterialItemCode.Contains(q));
        var rows = await baseQuery.OrderBy(x => x.i.ShipItemCode).ToListAsync();
        var catIds = rows.Select(x => x.i.CategoryId).Distinct().ToList();
        var cats = await _context.MaterialCategories.Where(c => catIds.Contains(c.Id)).AsNoTracking()
            .ToDictionaryAsync(c => c.Id, c => c.Name);
        var result = rows.Select(x => new
        {
            x.i.Id, itemCode = x.i.ShipItemCode, materialItemCode = x.i.MaterialItemCode, name = x.name, x.i.CategoryId,
            categoryName = cats.GetValueOrDefault(x.i.CategoryId, ""),
            x.i.Unit, x.i.OnHandQuantity, x.i.MinStock, x.i.MaxStock, x.i.UnitCost, x.i.IsActive
        });
        return Ok(result);
    }

    [HttpGet("items/low-stock")]
    public async Task<IActionResult> GetLowStock()
    {
        var rows = await (from i in _context.MaterialItemShips.AsNoTracking()
                          where i.IsActive && i.MinStock.HasValue && i.OnHandQuantity <= i.MinStock.Value
                          join c in _context.MaterialItems.AsNoTracking() on i.MaterialItemCode equals c.ItemCode into cj
                          from c in cj.DefaultIfEmpty()
                          select new { i, name = c != null ? c.Name : i.MaterialItemCode }).ToListAsync();
        return Ok(rows.Select(x => Project(x.i, x.name)));
    }

    [HttpGet("items/{id:guid}")]
    public async Task<IActionResult> GetItemById(Guid id)
    {
        var item = await _context.MaterialItemShips.AsNoTracking().FirstOrDefaultAsync(i => i.Id == id);
        if (item == null) return NotFound();
        var name = await _context.MaterialItems.AsNoTracking()
            .Where(c => c.ItemCode == item.MaterialItemCode).Select(c => c.Name).FirstOrDefaultAsync();
        return Ok(Project(item, name ?? item.MaterialItemCode));
    }

    [HttpPost("items")]
    public async Task<IActionResult> CreateItem([FromBody] MaterialItemShip dto)
    {
        // Mã vật tư (MaterialItemCode) phải tồn tại trong danh mục chung.
        if (!await _context.MaterialItems.AnyAsync(c => c.ItemCode == dto.MaterialItemCode))
            return BadRequest(new { message = "MaterialItemCode không tồn tại trong danh mục vật tư" });
        if (await _context.MaterialItemShips.AnyAsync(i => i.VesselId == dto.VesselId && i.ShipItemCode == dto.ShipItemCode))
            return Conflict(new { message = "Ship item code already exists for this vessel" });
        var entity = new MaterialItemShip
        {
            ShipItemCode = dto.ShipItemCode, MaterialItemCode = dto.MaterialItemCode, CategoryId = dto.CategoryId,
            Specification = dto.Specification, Unit = dto.Unit, OnHandQuantity = dto.OnHandQuantity,
            MinStock = dto.MinStock, MaxStock = dto.MaxStock, ReorderLevel = dto.ReorderLevel,
            ReorderQuantity = dto.ReorderQuantity, Location = dto.Location, Manufacturer = dto.Manufacturer,
            Supplier = dto.Supplier, PartNumber = dto.PartNumber, Barcode = dto.Barcode,
            UnitCost = dto.UnitCost, Currency = dto.Currency, Notes = dto.Notes, ImageUrl = dto.ImageUrl,
            VesselId = dto.VesselId,
        };
        _context.MaterialItemShips.Add(entity);
        await _context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetItemById), new { id = entity.Id }, entity);
    }

    [HttpPut("items/{id:guid}")]
    public async Task<IActionResult> UpdateItem(Guid id, [FromBody] MaterialItemShip dto)
    {
        var entity = await _context.MaterialItemShips.FindAsync(id);
        if (entity == null) return NotFound();
        if (!string.IsNullOrEmpty(dto.MaterialItemCode) && dto.MaterialItemCode != entity.MaterialItemCode)
        {
            if (!await _context.MaterialItems.AnyAsync(c => c.ItemCode == dto.MaterialItemCode))
                return BadRequest(new { message = "MaterialItemCode không tồn tại trong danh mục vật tư" });
            entity.MaterialItemCode = dto.MaterialItemCode;
        }
        entity.ShipItemCode = dto.ShipItemCode; entity.CategoryId = dto.CategoryId; entity.Specification = dto.Specification;
        entity.Unit = dto.Unit; entity.MinStock = dto.MinStock; entity.MaxStock = dto.MaxStock;
        entity.ReorderLevel = dto.ReorderLevel; entity.ReorderQuantity = dto.ReorderQuantity;
        entity.Location = dto.Location; entity.Manufacturer = dto.Manufacturer; entity.Supplier = dto.Supplier;
        entity.PartNumber = dto.PartNumber; entity.Barcode = dto.Barcode;
        entity.UnitCost = dto.UnitCost; entity.Currency = dto.Currency;
        entity.Notes = dto.Notes; entity.ImageUrl = dto.ImageUrl; entity.IsActive = dto.IsActive;
        entity.VesselId = dto.VesselId; entity.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return Ok(entity);
    }

    [HttpDelete("items/{id:guid}")]
    public async Task<IActionResult> DeleteItem(Guid id)
    {
        var entity = await _context.MaterialItemShips.FindAsync(id);
        if (entity == null) return NotFound();
        entity.IsActive = false; entity.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return Ok(new { message = "Deleted", id, shipItemCode = entity.ShipItemCode, materialItemCode = entity.MaterialItemCode });
    }

    // ============================================================
    // ITEM-EQUIPMENT LINKS
    // ============================================================

    [HttpGet("items/equipment-counts")]
    public async Task<IActionResult> GetEquipmentCounts()
    {
        var counts = await _context.MaterialItemEquipments
            .GroupBy(m => m.MaterialItemId)
            .Select(g => new { materialItemId = g.Key, count = g.Count() })
            .ToListAsync();
        return Ok(counts);
    }

    [HttpGet("items/{itemId:guid}/equipment")]
    public async Task<IActionResult> GetItemEquipment(Guid itemId)
    {
        var links = await _context.MaterialItemEquipments
            .Where(m => m.MaterialItemId == itemId)
            .AsNoTracking().ToListAsync();
        return Ok(links);
    }

    [HttpGet("items/by-equipment/{equipmentAssetId:guid}")]
    public async Task<IActionResult> GetByEquipment(Guid equipmentAssetId)
    {
        var links = await _context.MaterialItemEquipments
            .Where(m => m.EquipmentAssetId == equipmentAssetId)
            .AsNoTracking().ToListAsync();
        return Ok(links);
    }

    [HttpPost("items/{itemId:guid}/equipment")]
    public async Task<IActionResult> LinkEquipment(Guid itemId, [FromBody] List<Guid> equipmentIds)
    {
        if (!await _context.MaterialItems.AnyAsync(i => i.Id == itemId && i.IsActive)) return NotFound();
        var vesselIds = await (from ship in _context.MaterialItemShips
                               join catalog in _context.MaterialItems on ship.MaterialItemCode equals catalog.ItemCode
                               where catalog.Id == itemId && ship.IsActive select ship.VesselId).ToListAsync();
        var distinctIds = equipmentIds.Distinct().ToList();
        if (await _context.EquipmentAssets.CountAsync(e => distinctIds.Contains(e.Id) && e.IsActive && e.Category != "SYSTEM" && vesselIds.Contains(e.VesselId)) != distinctIds.Count)
            return BadRequest(new { message = "Chỉ gán thiết bị đang hoạt động của tàu có vật tư này; không gán nhóm thiết bị." });
        int created = 0; int skipped = 0;
        foreach (var eId in equipmentIds)
        {
            if (await _context.MaterialItemEquipments.AnyAsync(m => m.MaterialItemId == itemId && m.EquipmentAssetId == eId))
            { skipped++; continue; }
            _context.MaterialItemEquipments.Add(new MaterialItemEquipment { MaterialItemId = itemId, EquipmentAssetId = eId });
            created++;
        }
        await _context.SaveChangesAsync();
        return Ok(new { message = "Linked", created, skipped });
    }

    [HttpDelete("items/{itemId:guid}/equipment/{equipmentId:guid}")]
    public async Task<IActionResult> UnlinkEquipment(Guid itemId, Guid equipmentId)
    {
        var link = await _context.MaterialItemEquipments
            .FirstOrDefaultAsync(m => m.MaterialItemId == itemId && m.EquipmentAssetId == equipmentId);
        if (link == null) return NotFound();
        _context.MaterialItemEquipments.Remove(link);
        await _context.SaveChangesAsync();
        return Ok(new { message = "Unlinked" });
    }
}
