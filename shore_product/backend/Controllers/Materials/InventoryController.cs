using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;

namespace ProductApi.Controllers.Materials;

[ApiController]
[Route("api/inventory")]
public class InventoryController : ControllerBase
{
    private readonly AppDbContext _context;

    public InventoryController(AppDbContext context) => _context = context;

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 50,
        [FromQuery] string? storeLocationId = null, [FromQuery] string? q = null,
        [FromQuery] Guid? vesselId = null)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var stockQuery = _context.InventoryStocks.AsNoTracking();
        if (vesselId.HasValue) stockQuery = stockQuery.Where(s => s.VesselId == vesselId.Value);
        if (!string.IsNullOrEmpty(storeLocationId) && Guid.TryParse(storeLocationId, out var locId))
            stockQuery = stockQuery.Where(s => s.StoreLocationId == locId);

        var query = from s in stockQuery
                    join m in _context.MaterialItemShips.AsNoTracking() on s.MaterialItemId equals m.Id
                    join l in _context.StoreLocations.AsNoTracking() on s.StoreLocationId equals l.Id
                    join cat in _context.MaterialItems.AsNoTracking() on m.MaterialItemCode equals cat.ItemCode into catj
                    from cat in catj.DefaultIfEmpty()
                    where m.IsActive
                    select new
                    {
                        s.Id,
                        s.MaterialItemId,
                        s.StoreLocationId,
                        itemCode = m.ShipItemCode,
                        itemName = cat != null ? cat.Name : m.MaterialItemCode,
                        unit = m.Unit,
                        storeLocationName = l.Name,
                        s.Quantity,
                        s.UnitCost,
                        totalValue = s.Quantity * s.UnitCost,
                        isLowStock = m.MinStock != null && (double)s.Quantity <= m.MinStock,
                        minStock = m.MinStock,
                        s.LastReceiptDate
                    };

        if (!string.IsNullOrWhiteSpace(q))
        {
            var normalized = q.Trim().ToLower();
            query = query.Where(x => x.itemCode.ToLower().Contains(normalized) || x.itemName.ToLower().Contains(normalized));
        }

        var total = await query.CountAsync();
        
        var pagedItems = await query
            .OrderBy(x => x.itemCode)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var totalValue = await query.SumAsync(x => x.totalValue);

        return Ok(new { items = pagedItems, total, totalValue, page, pageSize });
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary()
    {
        var totalItems = await _context.InventoryStocks.CountAsync();
        
        var totalValue = await _context.InventoryStocks.SumAsync(s => s.Quantity * s.UnitCost);
        
        var lowStockCount = await (
            from s in _context.InventoryStocks.AsNoTracking()
            join m in _context.MaterialItemShips.AsNoTracking() on s.MaterialItemId equals m.Id
            where m.MinStock != null && (double)s.Quantity <= m.MinStock.Value
            select s
        ).CountAsync();

        return Ok(new { totalItems, totalValue, lowStockCount });
    }

    [HttpGet("by-location")]
    public async Task<IActionResult> GetByLocation()
    {
        var locations = await _context.StoreLocations.Where(l => l.IsActive).AsNoTracking().ToListAsync();
        var locIds = locations.Select(l => l.Id).ToList();

        // Single query: aggregate all stocks grouped by location
        var stockSummaries = await _context.InventoryStocks
            .AsNoTracking()
            .Where(s => locIds.Contains(s.StoreLocationId))
            .GroupBy(s => s.StoreLocationId)
            .Select(g => new
            {
                LocationId = g.Key,
                ItemCount = g.Count(),
                TotalValue = g.Sum(s => s.Quantity * s.UnitCost)
            })
            .ToDictionaryAsync(x => x.LocationId);

        var result = locations.Select(loc => new
        {
            locationId = loc.Id.ToString(),
            locationName = loc.Name,
            parentId = loc.ParentId?.ToString(),
            itemCount = stockSummaries.TryGetValue(loc.Id, out var s) ? s.ItemCount : 0,
            totalValue = stockSummaries.TryGetValue(loc.Id, out var sv) ? sv.TotalValue : 0m
        });
        return Ok(result);
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] string? storeLocationId)
    {
        // Returns JSON for CSV export (frontend handles actual CSV generation)
        var stockQuery = _context.InventoryStocks.AsNoTracking();
        if (!string.IsNullOrEmpty(storeLocationId) && Guid.TryParse(storeLocationId, out var locId))
            stockQuery = stockQuery.Where(s => s.StoreLocationId == locId);
        var stocks = await stockQuery.ToListAsync();
        return Ok(stocks);
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory(
        [FromQuery] string? storeLocationId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        // For now return completed stock receipts as history
        var query = _context.StockReceipts.Where(r => r.Status == "Completed").AsNoTracking();
        if (!string.IsNullOrEmpty(storeLocationId) && Guid.TryParse(storeLocationId, out var locId))
            query = query.Where(r => r.Items.Any(i => i.StoreLocationId == locId));
        var total = await query.CountAsync();
        var receipts = await query.Include(r => r.Items)
            .OrderByDescending(r => r.UpdatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync();
        var items = receipts.SelectMany(r => r.Items.Select(i => new
        {
            date = r.UpdatedAt.ToString("yyyy-MM-dd"),
            type = "RECEIPT", itemCode = i.ItemCode ?? "", itemName = i.ItemName,
            quantity = (double)i.QuantityReceived, note = i.Note ?? ""
        })).ToList();
        return Ok(new { items, total, page, pageSize });
    }

    [HttpPost("declare")]
    public async Task<IActionResult> Declare([FromBody] DeclareRequest request)
    {
        foreach (var item in request.Items)
        {
            var stock = await _context.InventoryStocks.AsTracking().FirstOrDefaultAsync(
                s => s.MaterialItemId == item.MaterialItemId && s.StoreLocationId == item.StoreLocationId);
            if (stock == null)
            {
                _context.InventoryStocks.Add(new InventoryStock
                {
                    MaterialItemId = item.MaterialItemId, StoreLocationId = item.StoreLocationId,
                    Quantity = (decimal)item.Quantity, UnitCost = (decimal)item.UnitCost,
                    LastReceiptDate = DateTime.UtcNow,
                });
            }
            else
            {
                stock.Quantity = (decimal)item.Quantity;
                stock.UnitCost = (decimal)item.UnitCost;
                stock.UpdatedAt = DateTime.UtcNow;
            }
        }
        await _context.SaveChangesAsync();
        return Ok(new { success = true, count = request.Items.Count });
    }

    [HttpPost("adjust")]
    public async Task<IActionResult> Adjust([FromBody] AdjustRequest request)
    {
        var stock = await _context.InventoryStocks.AsTracking().FirstOrDefaultAsync(
            s => s.MaterialItemId == request.MaterialItemId && s.StoreLocationId == request.StoreLocationId);
        if (stock == null) return NotFound();
        stock.Quantity += (decimal)request.AdjustQuantity;
        if (stock.Quantity < 0) stock.Quantity = 0;
        stock.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return Ok(new { success = true, newQuantity = stock.Quantity });
    }

    public record DeclareItem(Guid MaterialItemId, Guid StoreLocationId, double Quantity, double UnitCost);
    public record DeclareRequest(List<DeclareItem> Items);
    public record AdjustRequest(Guid MaterialItemId, Guid StoreLocationId, double AdjustQuantity, string? Reason);
}
