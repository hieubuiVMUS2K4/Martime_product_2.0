using MaritimeEdge.Models;
using MaritimeEdge.Data;
using MaritimeEdge.Services.Inventory;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Controllers.Inventory;

// ========== DTOs ==========
public class CreateStockReceiptDto
{
    public string? VesselName { get; set; }
    public Guid? VoyageId { get; set; }
    public string? VoyageName { get; set; }
    public string? SupplierCode { get; set; }
    public string? SupplierName { get; set; }
    public DateTime ReceivedDate { get; set; }
    public DateTime ReceiptDate { get; set; }
    public string? CreatedBy { get; set; }
    public string? Notes { get; set; }
    public string? Attachments { get; set; }
    public int? MaterialRequestId { get; set; }
    public List<CreateStockReceiptItemDto> Items { get; set; } = new();
}

public class CreateStockReceiptItemDto
{
    public Guid? StoreLocationId { get; set; }
    public Guid? MaterialItemId { get; set; }
    public string? ItemCode { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Unit { get; set; } = "PCS";
    public decimal QuantityRequested { get; set; }
    public decimal QuantityReceived { get; set; }
    public decimal? UnitCost { get; set; }
    public string? Currency { get; set; } = "USD";
    public string? Note { get; set; }
}

public class UpdateStockReceiptDto
{
    public string? VesselName { get; set; }
    public Guid? VoyageId { get; set; }
    public string? VoyageName { get; set; }
    public string? SupplierCode { get; set; }
    public string? SupplierName { get; set; }
    public DateTime? ReceivedDate { get; set; }
    public DateTime? ReceiptDate { get; set; }
    public string? CreatedBy { get; set; }
    public string? Notes { get; set; }
    public string? Attachments { get; set; }
    public string? Status { get; set; }
    public List<CreateStockReceiptItemDto>? Items { get; set; }
}

[ApiController]
[Route("api/stock-receipts")]
public class StockReceiptController : ControllerBase
{
    private readonly EdgeDbContext _context;

    public StockReceiptController(EdgeDbContext context)
    {
        _context = context;
    }

    /// <summary>GET all receipts (paged)</summary>
    [HttpGet]
    public async Task<ActionResult> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? status = null,
        [FromQuery] string? q = null)
    {
        var query = _context.StockReceipts
            .Where(r => r.IsActive)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status))
            query = query.Where(r => r.Status == status);

        if (!string.IsNullOrEmpty(q))
            query = query.Where(r =>
                r.ReceiptCode.Contains(q) ||
                (r.SupplierName != null && r.SupplierName.Contains(q)) ||
                (r.Notes != null && r.Notes.Contains(q)));

        var total = await query.CountAsync();

        var items = await query
            .OrderByDescending(r => r.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new
            {
                r.Id,
                r.ReceiptCode,
                r.VesselName,
                r.VoyageId,
                r.VoyageName,
                r.SupplierCode,
                r.SupplierName,
                r.ReceivedDate,
                r.ReceiptDate,
                r.CreatedBy,
                r.Notes,
                r.Attachments,
                r.Status,
                r.MaterialRequestId,
                RequestCode = r.MaterialRequest != null ? r.MaterialRequest.RequestCode : null,
                r.CreatedAt,
                r.UpdatedAt,
                ItemCount = r.Items.Count,
                TotalValue = r.Items.Sum(i => (i.QuantityReceived * (i.UnitCost ?? 0)))
            })
            .ToListAsync();

        return Ok(new { items, total, page, pageSize });
    }

    /// <summary>GET single receipt with items</summary>
    [HttpGet("{id}")]
    public async Task<ActionResult> GetById(int id)
    {
        var receipt = await _context.StockReceipts
            .Where(r => r.Id == id && r.IsActive)
            .Select(r => new
            {
                r.Id,
                r.ReceiptCode,
                r.VesselName,
                r.VoyageId,
                r.VoyageName,
                r.SupplierCode,
                r.SupplierName,
                r.ReceivedDate,
                r.ReceiptDate,
                r.CreatedBy,
                r.Notes,
                r.Attachments,
                r.Status,
                r.MaterialRequestId,
                RequestCode = r.MaterialRequest != null ? r.MaterialRequest.RequestCode : null,
                r.CreatedAt,
                r.UpdatedAt,
                Items = r.Items.Select(i => new
                {
                    i.Id,
                    i.StoreLocationId,
                    i.MaterialItemId,
                    i.ItemCode,
                    i.ItemName,
                    i.Description,
                    i.Unit,
                    i.QuantityRequested,
                    i.QuantityReceived,
                    i.UnitCost,
                    i.Currency,
                    i.Note
                }).ToList()
            })
            .FirstOrDefaultAsync();

        if (receipt == null) return NotFound();
        return Ok(receipt);
    }

    /// <summary>POST create new receipt (Draft)</summary>
    [HttpPost]
    public async Task<ActionResult> Create([FromBody] CreateStockReceiptDto dto)
    {
        if (!await HasValidLocationsAsync(dto.Items))
            return BadRequest("Vị trí kho không tồn tại hoặc đã ngừng sử dụng.");
        // Generate code: NK-YYYYMMDD-XXX
        var today = DateTime.UtcNow.ToString("yyyyMMdd");
        var countToday = await _context.StockReceipts
            .CountAsync(r => r.ReceiptCode.StartsWith($"NK-{today}"));
        var code = $"NK-{today}-{(countToday + 1):D3}";

        var receipt = new StockReceipt
        {
            ReceiptCode = code,
            VesselName = dto.VesselName,
            VoyageId = dto.VoyageId,
            VoyageName = dto.VoyageName,
            SupplierCode = dto.SupplierCode,
            SupplierName = dto.SupplierName,
            ReceivedDate = DateTime.SpecifyKind(dto.ReceivedDate, DateTimeKind.Utc),
            ReceiptDate = DateTime.SpecifyKind(dto.ReceiptDate, DateTimeKind.Utc),
            CreatedBy = dto.CreatedBy,
            Notes = dto.Notes,
            Attachments = dto.Attachments,
            MaterialRequestId = dto.MaterialRequestId,
            Status = "Draft"
        };

        foreach (var item in dto.Items)
        {
            receipt.Items.Add(new StockReceiptItem
            {
                StoreLocationId = item.StoreLocationId,
                MaterialItemId = item.MaterialItemId,
                ItemCode = item.ItemCode,
                ItemName = item.ItemName,
                Description = item.Description,
                Unit = item.Unit,
                QuantityRequested = item.QuantityRequested,
                QuantityReceived = item.QuantityReceived,
                UnitCost = item.UnitCost,
                Currency = item.Currency,
                Note = item.Note
            });
        }

        _context.StockReceipts.Add(receipt);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = receipt.Id }, new { receipt.Id, receipt.ReceiptCode });
    }

    /// <summary>PUT update receipt</summary>
    [HttpPut("{id}")]
    public async Task<ActionResult> Update(int id, [FromBody] UpdateStockReceiptDto dto)
    {
        await using var transaction = await InventoryWriteScope.BeginAsync(_context);
        var receipt = await _context.StockReceipts
            .Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == id && r.IsActive);

        if (receipt == null) return NotFound();

        if (dto.Items != null && !await HasValidLocationsAsync(dto.Items))
            return BadRequest("Vị trí kho không tồn tại hoặc đã ngừng sử dụng.");
        if (receipt.Status == "Completed")
            return BadRequest("Không thể sửa phiếu nhập đã hoàn tất.");
        if (dto.Status != null && dto.Status != receipt.Status &&
            !(receipt.Status == "Draft" && dto.Status == "Approved"))
            return BadRequest("Chỉ được duyệt phiếu Draft; hoàn tất qua API complete.");

        if (dto.VesselName != null) receipt.VesselName = dto.VesselName;
        if (dto.VoyageId.HasValue) receipt.VoyageId = dto.VoyageId;
        if (dto.VoyageName != null) receipt.VoyageName = dto.VoyageName;
        if (dto.SupplierCode != null) receipt.SupplierCode = dto.SupplierCode;
        if (dto.SupplierName != null) receipt.SupplierName = dto.SupplierName;
        if (dto.ReceivedDate.HasValue) receipt.ReceivedDate = DateTime.SpecifyKind(dto.ReceivedDate.Value, DateTimeKind.Utc);
        if (dto.ReceiptDate.HasValue) receipt.ReceiptDate = DateTime.SpecifyKind(dto.ReceiptDate.Value, DateTimeKind.Utc);
        if (dto.CreatedBy != null) receipt.CreatedBy = dto.CreatedBy;
        if (dto.Notes != null) receipt.Notes = dto.Notes;
        if (dto.Attachments != null) receipt.Attachments = dto.Attachments;
        if (dto.Status != null) receipt.Status = dto.Status;
        receipt.UpdatedAt = DateTime.UtcNow;

        if (dto.Items != null)
        {
            _context.StockReceiptItems.RemoveRange(receipt.Items);
            receipt.Items.Clear();
            foreach (var item in dto.Items)
            {
                receipt.Items.Add(new StockReceiptItem
                {
                    StoreLocationId = item.StoreLocationId,
                    MaterialItemId = item.MaterialItemId,
                    ItemCode = item.ItemCode,
                    ItemName = item.ItemName,
                    Description = item.Description,
                    Unit = item.Unit,
                    QuantityRequested = item.QuantityRequested,
                    QuantityReceived = item.QuantityReceived,
                    UnitCost = item.UnitCost,
                    Currency = item.Currency,
                    Note = item.Note
                });
            }
        }

        await _context.SaveChangesAsync();
        if (transaction != null) await transaction.CommitAsync();
        return Ok(new { receipt.Id, receipt.ReceiptCode, receipt.Status });
    }

    /// <summary>PUT complete receipt → update inventory_stock</summary>
    [HttpPut("{id}/complete")]
    public async Task<ActionResult> Complete(int id)
    {
        await using var transaction = await InventoryWriteScope.BeginAsync(_context);
        var receipt = await _context.StockReceipts
            .Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == id && r.IsActive);

        if (receipt == null) return NotFound();
        if (receipt.Status == "Completed") return BadRequest("Already completed.");
        if (receipt.Status != "Draft" && receipt.Status != "Approved")
            return BadRequest("Trạng thái phiếu không cho phép hoàn tất.");
        if (receipt.Items.Any(i => i.QuantityReceived < 0 || i.UnitCost < 0) ||
            !receipt.Items.Any(i => i.QuantityReceived > 0))
            return BadRequest("Phiếu phải có số lượng thực nhập dương và không chứa số âm.");

        // Validate all received lines before resolving/creating ship materials.
        var receivedItems = receipt.Items.Where(i => i.QuantityReceived > 0).ToList();
        var locationIds = receivedItems.Where(i => i.StoreLocationId.HasValue)
            .Select(i => i.StoreLocationId!.Value).Distinct().ToArray();
        var validLocations = await _context.StoreLocations
            .Where(l => locationIds.Contains(l.Id) && l.IsActive).CountAsync();
        if (receivedItems.Any(i => !i.StoreLocationId.HasValue) || validLocations != locationIds.Length)
            return BadRequest("Mỗi dòng thực nhập phải có vị trí kho đang hoạt động.");

        // Update inventory_stock for each item
        var affectedMaterials = new HashSet<Guid>();
        foreach (var item in receivedItems)
        {

            // Dòng phiếu tham chiếu DANH MỤC vật tư (material_items), còn tồn kho nằm ở
            // material_item_ship. Quy đổi qua ItemCode; tàu chưa có mã này thì tạo mới —
            // đó chính là nghiệp vụ nhập kho lần đầu.
            var shipItemId = await ResolveShipStockItemIdAsync(item);
            if (shipItemId == null)
                return BadRequest($"Không xác định được vật tư cho dòng {item.Id} ({item.ItemCode}).");
            affectedMaterials.Add(shipItemId.Value);

            var stock = _context.InventoryStocks.Local.FirstOrDefault(s =>
                    s.MaterialItemId == shipItemId.Value && s.StoreLocationId == item.StoreLocationId!.Value)
                ?? await _context.InventoryStocks
                .FirstOrDefaultAsync(s =>
                    s.MaterialItemId == shipItemId.Value &&
                    s.StoreLocationId == item.StoreLocationId!.Value);

            if (stock != null)
            {
                stock.Quantity += item.QuantityReceived;
                if (item.UnitCost.HasValue) stock.UnitCost = item.UnitCost.Value;
                stock.LastReceiptDate = DateTime.UtcNow;
                stock.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                _context.InventoryStocks.Add(new InventoryStock
                {
                    MaterialItemId = shipItemId.Value,
                    StoreLocationId = item.StoreLocationId!.Value,
                    Quantity = item.QuantityReceived,
                    UnitCost = item.UnitCost ?? 0,
                    LastReceiptDate = DateTime.UtcNow
                });
            }

            // Also update MaterialItem.OnHandQuantity
            var materialItem = await _context.MaterialItems.FindAsync(shipItemId.Value);
            if (materialItem != null)
            {
                if (item.UnitCost.HasValue) materialItem.UnitCost = item.UnitCost.Value;
                materialItem.UpdatedAt = DateTime.UtcNow;
            }
        }

        await InventoryWriteScope.RefreshTotalsAsync(_context, affectedMaterials);
        receipt.Status = "Completed";
        receipt.UpdatedAt = DateTime.UtcNow;

        // If linked to a request, mark it as Completed
        if (receipt.MaterialRequestId.HasValue)
        {
            var request = await _context.MaterialRequests.FindAsync(receipt.MaterialRequestId.Value);
            if (request != null)
            {
                request.Status = "Completed";
                request.UpdatedAt = DateTime.UtcNow;
            }
        }

        await _context.SaveChangesAsync();
        if (transaction != null) await transaction.CommitAsync();
        return Ok(new { receipt.Id, receipt.Status });
    }

    /// <summary>
    /// Quy đổi dòng phiếu nhập sang dòng tồn kho của tàu (material_item_ship).
    /// Dòng phiếu tham chiếu danh mục công ty (material_items) nên phải khớp qua ItemCode.
    /// Tàu chưa có mã này thì tạo dòng kho mới với số lượng 0 — vòng lặp gọi hàm sẽ cộng vào sau.
    /// </summary>
    private async Task<Guid?> ResolveShipStockItemIdAsync(StockReceiptItem item)
    {
        // Phiếu cũ lưu thẳng id kho tàu — giữ nguyên để không phá dữ liệu đã có.
        if (item.MaterialItemId.HasValue &&
            await _context.MaterialItems.AnyAsync(m => m.Id == item.MaterialItemId.Value))
            return item.MaterialItemId.Value;

        var catalogItem = item.MaterialItemId.HasValue
            ? await _context.MaterialCatalogItems.FirstOrDefaultAsync(c => c.Id == item.MaterialItemId.Value)
            : null;

        var itemCode = !string.IsNullOrWhiteSpace(item.ItemCode) ? item.ItemCode!.Trim() : catalogItem?.ItemCode;
        if (string.IsNullOrWhiteSpace(itemCode)) return null;

        var shipItem = _context.MaterialItems.Local.FirstOrDefault(m => m.ItemCode == itemCode)
            ?? await _context.MaterialItems.FirstOrDefaultAsync(m => m.ItemCode == itemCode);
        if (shipItem != null) return shipItem.Id;

        // A newly created ship item must reference an existing catalog code.
        catalogItem = await _context.MaterialCatalogItems.FirstOrDefaultAsync(c => c.ItemCode == itemCode);
        if (catalogItem == null) return null;

        shipItem = new MaterialItem
        {
            ItemCode = itemCode,
            MaterialItemCode = catalogItem?.ItemCode ?? itemCode,
            Name = !string.IsNullOrWhiteSpace(item.ItemName) ? item.ItemName : (catalogItem?.Name ?? itemCode),
            CategoryId = catalogItem?.CategoryId ?? 1,
            Unit = !string.IsNullOrWhiteSpace(item.Unit) ? item.Unit : "PCS",
            OnHandQuantity = 0,
            UnitCost = item.UnitCost ?? catalogItem?.UnitPrice,
            Currency = item.Currency ?? "USD",
            Specification = item.Description,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.MaterialItems.Add(shipItem);
        return shipItem.Id;
    }

    private async Task<bool> HasValidLocationsAsync(IEnumerable<CreateStockReceiptItemDto> items)
    {
        var ids = items.Where(i => i.StoreLocationId.HasValue)
            .Select(i => i.StoreLocationId!.Value).Distinct().ToArray();
        return await _context.StoreLocations.CountAsync(l => ids.Contains(l.Id) && l.IsActive) == ids.Length;
    }

    /// <summary>DELETE soft-delete</summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(int id)
    {
        await using var transaction = await InventoryWriteScope.BeginAsync(_context);
        var receipt = await _context.StockReceipts.FindAsync(id);
        if (receipt == null || !receipt.IsActive) return NotFound();
        if (receipt.Status == "Completed")
            return BadRequest("Không thể xóa phiếu nhập đã hoàn tất.");

        receipt.IsActive = false;
        receipt.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        if (transaction != null) await transaction.CommitAsync();
        return NoContent();
    }
}
