using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.DTOs;

namespace MaritimeEdge.Controllers.Inventory;

[ApiController]
[Route("api/material")]
public class MaterialController : ControllerBase
{
    private readonly EdgeDbContext _context;
    private readonly ILogger<MaterialController> _logger;

    public MaterialController(EdgeDbContext context, ILogger<MaterialController> logger)
    {
        _context = context;
        _logger = logger;
    }

    // ======== CATEGORIES ========

    /// <summary>
    /// Get all material categories with optional filtering
    /// </summary>
    [HttpGet("categories")]
    public async Task<IActionResult> GetCategories([FromQuery] bool onlyActive = true, [FromQuery] long? parentId = null)
    {
        try
        {
            var q = _context.MaterialCategories.AsNoTracking();
            if (onlyActive) q = q.Where(x => x.IsActive);
            if (parentId.HasValue) q = q.Where(x => x.ParentCategoryId == parentId);
            var data = await q.OrderBy(x => x.Name).ToListAsync();
            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting categories");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get material categories with detailed information including item counts
    /// </summary>
    [HttpGet("categories/detailed")]
    public async Task<IActionResult> GetCategoriesDetailed([FromQuery] bool onlyActive = true)
    {
        try
        {
            var categories = await _context.MaterialCategories
                .AsNoTracking()
                .Where(x => !onlyActive || x.IsActive)
                .ToListAsync();

            var categoryIds = categories.Select(x => x.Id).ToList();
            
            // Count items per category
            var itemCounts = await _context.MaterialItems
                .Where(x => categoryIds.Contains(x.CategoryId))
                .GroupBy(x => x.CategoryId)
                .Select(g => new { CategoryId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.CategoryId, x => x.Count);

            // Count subcategories per category
            var subCategoryCounts = categories
                .Where(x => x.ParentCategoryId.HasValue)
                .GroupBy(x => x.ParentCategoryId!.Value)
                .ToDictionary(g => g.Key, g => g.Count());

            var result = categories.Select(cat => new MaterialCategoryResponseDto
            {
                Id = cat.Id,
                CategoryCode = cat.CategoryCode,
                Name = cat.Name,
                Description = cat.Description,
                ParentCategoryId = cat.ParentCategoryId,
                ParentCategoryName = cat.ParentCategoryId.HasValue 
                    ? categories.FirstOrDefault(x => x.Id == cat.ParentCategoryId)?.Name 
                    : null,
                IsActive = cat.IsActive,
                IsSynced = cat.IsSynced,
                CreatedAt = cat.CreatedAt,
                ItemCount = itemCounts.TryGetValue(cat.Id, out var count) ? count : 0,
                SubCategoryCount = subCategoryCounts.TryGetValue(cat.Id, out var subCount) ? subCount : 0
            }).OrderBy(x => x.Name).ToList();

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting detailed categories");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get a single material category by ID
    /// </summary>
    [HttpGet("categories/{id:long}")]
    public async Task<IActionResult> GetCategoryById(long id)
    {
        try
        {
            var cat = await _context.MaterialCategories.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            return cat is null ? NotFound(new { message = "Category not found" }) : Ok(cat);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting category {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Create a new material category
    /// </summary>
    [HttpPost("categories")]
    public async Task<IActionResult> CreateCategory([FromBody] CreateMaterialCategoryDto dto)
    {
        try
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            if (await _context.MaterialCategories.AnyAsync(x => x.CategoryCode == dto.CategoryCode))
                return Conflict(new { error = $"CategoryCode '{dto.CategoryCode}' already exists" });

            if (dto.ParentCategoryId.HasValue &&
                !await _context.MaterialCategories.AnyAsync(x => x.Id == dto.ParentCategoryId))
                return BadRequest(new { error = "ParentCategoryId not found" });

            var model = new MaterialCategory
            {
                CategoryCode = dto.CategoryCode,
                Name = dto.Name,
                Description = dto.Description,
                ParentCategoryId = dto.ParentCategoryId,
                IsActive = dto.IsActive,
                CreatedAt = DateTime.UtcNow,
                IsSynced = false
            };

            _context.MaterialCategories.Add(model);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetCategoryById), new { id = model.Id }, model);
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "DB error creating category");
            return StatusCode(500, new { error = "Database error" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating category");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Update an existing material category
    /// </summary>
    [HttpPut("categories/{id:long}")]
    public async Task<IActionResult> UpdateCategory(long id, [FromBody] UpdateMaterialCategoryDto dto)
    {
        try
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var cat = await _context.MaterialCategories.FirstOrDefaultAsync(x => x.Id == id);
            if (cat is null) return NotFound(new { error = "Category not found", id });

            if (dto.CategoryCode != cat.CategoryCode)
            {
                var dup = await _context.MaterialCategories.AnyAsync(x => x.CategoryCode == dto.CategoryCode && x.Id != id);
                if (dup) return Conflict(new { error = $"CategoryCode '{dto.CategoryCode}' already exists" });
            }

            if (dto.ParentCategoryId == id)
                return BadRequest(new { error = "ParentCategoryId cannot be self" });

            if (dto.ParentCategoryId.HasValue &&
                !await _context.MaterialCategories.AnyAsync(x => x.Id == dto.ParentCategoryId))
                return BadRequest(new { error = "ParentCategoryId not found" });

            // Check for circular reference
            if (dto.ParentCategoryId.HasValue)
            {
                var hasCircular = await HasCircularReference(id, dto.ParentCategoryId.Value);
                if (hasCircular)
                    return BadRequest(new { error = "Cannot set parent category: circular reference detected" });
            }

            // Update required fields
            cat.CategoryCode = dto.CategoryCode;
            cat.Name = dto.Name;
            cat.IsActive = dto.IsActive;

            // Update nullable fields - only if provided
            if (dto.Description != null) cat.Description = dto.Description;
            cat.ParentCategoryId = dto.ParentCategoryId; // Allow setting to null
            cat.IsSynced = false;

            await _context.SaveChangesAsync();
            return Ok(cat);
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "DB error updating category {Id}", id);
            return StatusCode(500, new { error = "Database error" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating category {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Delete a material category (only if no items are associated)
    /// </summary>
    [HttpDelete("categories/{id:long}")]
    public async Task<IActionResult> DeleteCategory(long id)
    {
        try
        {
            var cat = await _context.MaterialCategories.FindAsync(id);
            if (cat is null) return NotFound(new { error = "Category not found", id });

            var hasItems = await _context.MaterialItems.AnyAsync(x => x.CategoryId == id);
            if (hasItems) 
                return Conflict(new { error = "Cannot delete category with existing items. Please reassign or delete items first." });

            var hasSubCategories = await _context.MaterialCategories.AnyAsync(x => x.ParentCategoryId == id);
            if (hasSubCategories)
                return Conflict(new { error = "Cannot delete category with subcategories. Please delete subcategories first." });

            _context.MaterialCategories.Remove(cat);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Category deleted successfully", id, cat.CategoryCode, cat.Name });
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "DB error deleting category {Id}", id);
            return StatusCode(500, new { error = "Database error" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting category {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get all items in a specific category
    /// </summary>
    [HttpGet("categories/{id:long}/items")]
    public async Task<IActionResult> GetItemsByCategory(long id, [FromQuery] bool onlyActive = true)
    {
        try
        {
            var exist = await _context.MaterialCategories.AnyAsync(x => x.Id == id);
            if (!exist) return NotFound(new { error = "Category not found" });

            var q = _context.MaterialItems.AsNoTracking().Where(x => x.CategoryId == id);
            if (onlyActive) q = q.Where(x => x.IsActive);

            var items = await q.OrderBy(x => x.ItemCode).ToListAsync();
            return Ok(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting items by category {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ======== ITEMS ========

    /// <summary>
    /// Get all material items with optional filtering
    /// </summary>
    [HttpGet("items")]
    public async Task<IActionResult> GetAllItems([FromQuery] long? categoryId = null, [FromQuery] string? q = null, [FromQuery] bool onlyActive = true)
    {
        try
        {
            var query = _context.MaterialItems.AsNoTracking();
            if (onlyActive) query = query.Where(x => x.IsActive);
            if (categoryId.HasValue) query = query.Where(x => x.CategoryId == categoryId);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var w = q.Trim();
                query = query.Where(x =>
                    x.ItemCode.Contains(w) || x.Name.Contains(w) ||
                    (x.PartNumber != null && x.PartNumber.Contains(w)) ||
                    (x.Barcode != null && x.Barcode.Contains(w)));
            }

            var data = await query.OrderBy(x => x.ItemCode).ToListAsync();
            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting items");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// DANH MỤC vật tư của công ty (material_items, đồng bộ từ Shore) — chỉ đọc.
    /// </summary>
    [HttpGet("catalog")]
    public async Task<IActionResult> GetCatalog([FromQuery] string? q = null, [FromQuery] long? categoryId = null)
    {
        try
        {
            var query = _context.MaterialCatalogItems.AsNoTracking().Where(c => c.IsActive);
            if (categoryId.HasValue) query = query.Where(c => c.CategoryId == categoryId.Value);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var w = q.Trim();
                query = query.Where(c => c.ItemCode.Contains(w) || c.Name.Contains(w));
            }
            var items = await query.OrderBy(c => c.ItemCode).ToListAsync();
            var catIds = items.Select(i => i.CategoryId).Distinct().ToList();
            var cats = await _context.MaterialCategories.AsNoTracking()
                .Where(c => catIds.Contains(c.Id))
                .ToDictionaryAsync(c => c.Id, c => c.Name);
            var result = items.Select(i => new
            {
                i.Id,
                i.ItemCode,
                i.Name,
                i.CategoryId,
                categoryName = cats.TryGetValue(i.CategoryId, out var n) ? n : "",
                i.UnitPrice,
                i.IsActive,
                i.CreatedAt,
                i.UpdatedAt
            });
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting material catalog");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get all material items with detailed information including category details
    /// </summary>
    [HttpGet("items/detailed")]
    public async Task<IActionResult> GetAllItemsDetailed([FromQuery] long? categoryId = null, [FromQuery] string? q = null, [FromQuery] bool onlyActive = true)
    {
        try
        {
            var query = _context.MaterialItems.AsNoTracking();
            if (onlyActive) query = query.Where(x => x.IsActive);
            if (categoryId.HasValue) query = query.Where(x => x.CategoryId == categoryId);
            if (!string.IsNullOrWhiteSpace(q))
            {
                var w = q.Trim();
                query = query.Where(x =>
                    x.ItemCode.Contains(w) || x.Name.Contains(w) ||
                    (x.PartNumber != null && x.PartNumber.Contains(w)) ||
                    (x.Barcode != null && x.Barcode.Contains(w)));
            }

            var items = await query.ToListAsync();
            var categoryIds = items.Select(x => x.CategoryId).Distinct().ToList();
            var categories = await _context.MaterialCategories
                .AsNoTracking()
                .Where(x => categoryIds.Contains(x.Id))
                .ToDictionaryAsync(x => x.Id);

            var result = items.Select(item =>
            {
                var category = categories.GetValueOrDefault(item.CategoryId);
                var isLowStock = item.MinStock.HasValue && item.OnHandQuantity < item.MinStock.Value;
                var stockStatus = isLowStock ? "Low" :
                    item.MaxStock.HasValue && item.OnHandQuantity > item.MaxStock.Value ? "Over" : "OK";

                return new MaterialItemResponseDto
                {
                    Id = item.Id,
                    ItemCode = item.ItemCode,
                    Name = item.Name,
                    CategoryId = item.CategoryId,
                    CategoryName = category?.Name ?? "Unknown",
                    CategoryCode = category?.CategoryCode,
                    Specification = item.Specification,
                    Unit = item.Unit,
                    OnHandQuantity = item.OnHandQuantity,
                    MinStock = item.MinStock,
                    MaxStock = item.MaxStock,
                    ReorderLevel = item.ReorderLevel,
                    ReorderQuantity = item.ReorderQuantity,
                    Location = item.Location,
                    Manufacturer = item.Manufacturer,
                    Supplier = item.Supplier,
                    PartNumber = item.PartNumber,
                    Barcode = item.Barcode,
                    BatchTracked = item.BatchTracked,
                    SerialTracked = item.SerialTracked,
                    ExpiryRequired = item.ExpiryRequired,
                    UnitCost = item.UnitCost,
                    Currency = item.Currency,
                    Notes = item.Notes,
                    IsActive = item.IsActive,
                    IsSynced = item.IsSynced,
                    CreatedAt = item.CreatedAt,
                    IsLowStock = isLowStock,
                    TotalValue = item.UnitCost.HasValue ? item.UnitCost.Value * (decimal)item.OnHandQuantity : null,
                    StockStatus = stockStatus
                };
            }).OrderBy(x => x.ItemCode).ToList();

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting detailed items");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get items with low stock (below minimum stock level)
    /// </summary>
    [HttpGet("items/low-stock")]
    public async Task<IActionResult> GetLowStockItems()
    {
        try
        {
            var items = await _context.MaterialItems
                .AsNoTracking()
                .Where(x => x.MinStock.HasValue && x.OnHandQuantity < x.MinStock.Value && x.IsActive)
                .OrderBy(x => x.ItemCode)
                .ToListAsync();

            return Ok(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting low stock items");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get a single material item by ID
    /// </summary>
    [HttpGet("items/{id:guid}")]
    public async Task<IActionResult> GetItemById(Guid id)
    {
        try
        {
            var item = await _context.MaterialItems.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            return item is null ? NotFound(new { message = "Item not found" }) : Ok(item);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting item {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Create a new material item
    /// </summary>
    [HttpPost("items")]
    public async Task<IActionResult> CreateItem([FromBody] CreateMaterialItemDto dto)
    {
        try
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            if (!await _context.MaterialCategories.AnyAsync(x => x.Id == dto.CategoryId))
                return BadRequest(new { error = "CategoryId not found" });

            if (await _context.MaterialItems.AnyAsync(x => x.ItemCode == dto.ItemCode))
                return Conflict(new { error = $"ItemCode '{dto.ItemCode}' already exists" });

            // Validate stock levels
            if (dto.MinStock.HasValue && dto.MaxStock.HasValue && dto.MinStock > dto.MaxStock)
                return BadRequest(new { error = "MinStock cannot be greater than MaxStock" });

            var model = new MaterialItem
            {
                ItemCode = dto.ItemCode,
                Name = dto.Name,
                CategoryId = dto.CategoryId,
                Specification = dto.Specification,
                Unit = dto.Unit,
                OnHandQuantity = dto.OnHandQuantity,
                MinStock = dto.MinStock,
                MaxStock = dto.MaxStock,
                ReorderLevel = dto.ReorderLevel,
                ReorderQuantity = dto.ReorderQuantity,
                Location = dto.Location,
                Manufacturer = dto.Manufacturer,
                Supplier = dto.Supplier,
                PartNumber = dto.PartNumber,
                Barcode = dto.Barcode,
                BatchTracked = dto.BatchTracked,
                SerialTracked = dto.SerialTracked,
                ExpiryRequired = dto.ExpiryRequired,
                UnitCost = dto.UnitCost,
                Currency = dto.Currency,
                Notes = dto.Notes,
                IsActive = dto.IsActive,
                CreatedAt = DateTime.UtcNow,
                IsSynced = false
            };

            _context.MaterialItems.Add(model);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetItemById), new { id = model.Id }, model);
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "DB error creating item");
            return StatusCode(500, new { error = "Database error" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating item");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Update an existing material item
    /// </summary>
    [HttpPut("items/{id}")]
    public async Task<IActionResult> UpdateItem(Guid id, [FromBody] UpdateMaterialItemDto dto)
    {
        try
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var item = await _context.MaterialItems.FirstOrDefaultAsync(x => x.Id == id);
            if (item is null) return NotFound(new { error = "Item not found", id });

            if (item.ItemCode != dto.ItemCode &&
                await _context.MaterialItems.AnyAsync(x => x.ItemCode == dto.ItemCode && x.Id != id))
                return Conflict(new { error = $"ItemCode '{dto.ItemCode}' already exists" });

            if (item.CategoryId != dto.CategoryId &&
                !await _context.MaterialCategories.AnyAsync(x => x.Id == dto.CategoryId))
                return BadRequest(new { error = "CategoryId not found" });

            // Validate stock levels
            if (dto.MinStock.HasValue && dto.MaxStock.HasValue && dto.MinStock > dto.MaxStock)
                return BadRequest(new { error = "MinStock cannot be greater than MaxStock" });

            // Update required fields
            item.ItemCode = dto.ItemCode;
            item.Name = dto.Name;
            item.CategoryId = dto.CategoryId;
            item.Unit = dto.Unit;
            item.OnHandQuantity = dto.OnHandQuantity;
            item.BatchTracked = dto.BatchTracked;
            item.SerialTracked = dto.SerialTracked;
            item.ExpiryRequired = dto.ExpiryRequired;
            item.IsActive = dto.IsActive;

            // Update nullable fields - only if provided
            if (dto.Specification != null) item.Specification = dto.Specification;
            if (dto.MinStock.HasValue) item.MinStock = dto.MinStock;
            if (dto.MaxStock.HasValue) item.MaxStock = dto.MaxStock;
            if (dto.ReorderLevel.HasValue) item.ReorderLevel = dto.ReorderLevel;
            if (dto.ReorderQuantity.HasValue) item.ReorderQuantity = dto.ReorderQuantity;
            if (dto.Location != null) item.Location = dto.Location;
            if (dto.Manufacturer != null) item.Manufacturer = dto.Manufacturer;
            if (dto.Supplier != null) item.Supplier = dto.Supplier;
            if (dto.PartNumber != null) item.PartNumber = dto.PartNumber;
            if (dto.Barcode != null) item.Barcode = dto.Barcode;
            if (dto.UnitCost.HasValue) item.UnitCost = dto.UnitCost;
            if (dto.Currency != null) item.Currency = dto.Currency;
            if (dto.Notes != null) item.Notes = dto.Notes;
            item.IsSynced = false;

            await _context.SaveChangesAsync();
            return Ok(item);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            _logger.LogError(ex, "Concurrency error updating item {Id}", id);
            return Conflict(new { error = "Item was modified by another process" });
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "DB error updating item {Id}", id);
            return StatusCode(500, new { error = "Database error" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating item {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Delete a material item
    /// </summary>
    [HttpDelete("items/{id:guid}")]
    public async Task<IActionResult> DeleteItem(Guid id)
    {
        try
        {
            var item = await _context.MaterialItems.FindAsync(id);
            if (item is null) return NotFound(new { error = "Item not found", id });

            // Set MaterialItemId = null cho các receipt items (giữ lịch sử nhập kho)
            var receiptItems = await _context.MaterialReceiptItems
                .Where(x => x.MaterialItemId == id)
                .ToListAsync();
            
            if (receiptItems.Any())
            {
                foreach (var receiptItem in receiptItems)
                {
                    receiptItem.MaterialItemId = null; // Giữ ItemCode, ItemName để hiển thị lịch sử
                }
            }

            // Soft delete: Set IsActive = false và thêm suffix vào ItemCode để giải phóng ItemCode
            var originalItemCode = item.ItemCode;
            item.IsActive = false;
            item.ItemCode = $"{item.ItemCode}_DELETED_{DateTime.UtcNow:yyyyMMddHHmmss}";
            item.IsSynced = false;
            
            _logger.LogWarning($"[DELETE DEBUG] Deleting item: ID={id}, OriginalCode={originalItemCode}, NewCode={item.ItemCode}, IsActive={item.IsActive}");
            
            await _context.SaveChangesAsync();

            _logger.LogWarning($"[DELETE DEBUG] Successfully saved deletion for {originalItemCode}");

            return Ok(new { message = "Item deleted successfully (soft delete)", id, originalItemCode, newItemCode = item.ItemCode, item.Name, affectedReceipts = receiptItems.Count });
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "DB error deleting item {Id}", id);
            return StatusCode(500, new { error = "Database error" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting item {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Adjust stock quantity for a material item
    /// </summary>
    [HttpPost("items/adjust-stock")]
    public async Task<IActionResult> AdjustStock([FromBody] StockAdjustmentDto dto)
    {
        try
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            var item = await _context.MaterialItems.FirstOrDefaultAsync(x => x.Id == dto.ItemId);
            if (item is null) return NotFound(new { error = "Item not found", id = dto.ItemId });

            var oldQuantity = item.OnHandQuantity;
            var newQuantity = dto.AdjustmentType.ToUpper() switch
            {
                "ADD" => oldQuantity + dto.Quantity,
                "SUBTRACT" => oldQuantity - dto.Quantity,
                "SET" => dto.Quantity,
                _ => oldQuantity
            };

            if (newQuantity < 0)
                return BadRequest(new { error = "Resulting quantity cannot be negative" });

            item.OnHandQuantity = newQuantity;
            item.IsSynced = false;

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = "Stock adjusted successfully",
                itemId = item.Id,
                itemCode = item.ItemCode,
                oldQuantity,
                newQuantity,
                adjustmentType = dto.AdjustmentType,
                quantity = dto.Quantity,
                reason = dto.Reason
            });
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "DB error adjusting stock for item {ItemId}", dto.ItemId);
            return StatusCode(500, new { error = "Database error" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adjusting stock for item {ItemId}", dto.ItemId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ======== HELPER METHODS ========

    /// <summary>
    /// Upload image for a material item
    /// </summary>
    [HttpPut("items/{id}/image")]
    public async Task<IActionResult> UploadItemImage(Guid id, [FromForm] IFormFile file)
    {
        try
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "File is required" });

            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".webp" };
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!allowedExtensions.Contains(extension))
                return BadRequest(new { error = "Only image files (jpg, jpeg, png, gif, webp) are allowed" });

            if (file.Length > 5 * 1024 * 1024)
                return BadRequest(new { error = "File size must not exceed 5MB" });

            var item = await _context.MaterialItems.FindAsync(id);
            if (item is null) return NotFound(new { error = "Item not found" });

            var uploadsRoot = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "materials");
            Directory.CreateDirectory(uploadsRoot);

            var fileName = $"{id}{extension}";
            var filePath = Path.Combine(uploadsRoot, fileName);

            // Delete old file if exists
            if (!string.IsNullOrEmpty(item.ImageUrl))
            {
                var oldPath = Path.Combine(Directory.GetCurrentDirectory(), item.ImageUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
                if (System.IO.File.Exists(oldPath)) System.IO.File.Delete(oldPath);
            }

            await using var stream = new FileStream(filePath, FileMode.Create);
            await file.CopyToAsync(stream);

            item.ImageUrl = $"/uploads/materials/{fileName}";
            item.IsSynced = false;
            await _context.SaveChangesAsync();

            return Ok(new { imageUrl = item.ImageUrl });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading image for item {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Delete image for a material item
    /// </summary>
    [HttpDelete("items/{id}/image")]
    public async Task<IActionResult> DeleteItemImage(Guid id)
    {
        try
        {
            var item = await _context.MaterialItems.FindAsync(id);
            if (item is null) return NotFound(new { error = "Item not found" });

            if (!string.IsNullOrEmpty(item.ImageUrl))
            {
                var filePath = Path.Combine(Directory.GetCurrentDirectory(), item.ImageUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
                if (System.IO.File.Exists(filePath)) System.IO.File.Delete(filePath);
            }

            item.ImageUrl = null;
            item.IsSynced = false;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Image deleted" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting image for item {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get activity history for a material item (recent requests & receipts)
    /// </summary>
    [HttpGet("items/{id}/activity")]
    public async Task<IActionResult> GetItemActivity(Guid id, [FromQuery] int limit = 20)
    {
        try
        {
            var item = await _context.MaterialItems.FindAsync(id);
            if (item == null) return NotFound(new { error = "Item not found" });

            var requests = await _context.MaterialRequestItems
                .Where(ri => ri.MaterialItemId == id)
                .Join(_context.MaterialRequests,
                    ri => ri.RequestId,
                    r => r.Id,
                    (ri, r) => new
                    {
                        type = "request",
                        code = r.RequestCode,
                        date = r.RequestDate,
                        status = r.Status,
                        quantity = ri.QuantityRequested,
                        note = ri.Note,
                        urgency = r.Urgency,
                        requestedBy = r.RequestedBy
                    })
                .OrderByDescending(x => x.date)
                .Take(limit)
                .ToListAsync();

            var receipts = await _context.StockReceiptItems
                .Where(si => si.MaterialItemId == id)
                .Join(_context.StockReceipts,
                    si => si.ReceiptId,
                    r => r.Id,
                    (si, r) => new
                    {
                        type = "receipt",
                        code = r.ReceiptCode,
                        date = r.ReceivedDate,
                        status = r.Status,
                        quantityReceived = si.QuantityReceived,
                        quantityRequested = si.QuantityRequested,
                        unitCost = si.UnitCost,
                        currency = si.Currency,
                        supplierName = r.SupplierName,
                        note = si.Note
                    })
                .OrderByDescending(x => x.date)
                .Take(limit)
                .ToListAsync();

            var totalRequested = await _context.MaterialRequestItems
                .Where(ri => ri.MaterialItemId == id)
                .SumAsync(ri => ri.QuantityRequested);

            var totalReceived = await _context.StockReceiptItems
                .Where(si => si.MaterialItemId == id)
                .SumAsync(si => si.QuantityReceived);

            var pendingRequests = await _context.MaterialRequestItems
                .Where(ri => ri.MaterialItemId == id)
                .Join(_context.MaterialRequests, ri => ri.RequestId, r => r.Id, (ri, r) => r)
                .CountAsync(r => r.Status == "Submitted" || r.Status == "Approved");

            return Ok(new
            {
                summary = new
                {
                    totalRequested,
                    totalReceived,
                    pendingRequests,
                    lastRequestDate = requests.FirstOrDefault()?.date,
                    lastReceiptDate = receipts.FirstOrDefault()?.date
                },
                requests,
                receipts
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting activity for item {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ======== MATERIAL-EQUIPMENT ASSIGNMENT ========

    /// <summary>
    /// Get all materials linked to a specific equipment asset (reverse lookup).
    /// Also traverses ancestor equipment (via parentId) so materials assigned
    /// to any parent node in the hierarchy are included.
    /// </summary>
    [HttpGet("items/by-equipment/{equipmentAssetId}")]
    public async Task<IActionResult> GetMaterialsByEquipment(Guid equipmentAssetId)
    {
        try
        {
            var asset = await _context.EquipmentAssets.AsNoTracking()
                .FirstOrDefaultAsync(a => a.Id == equipmentAssetId && a.IsActive);
            if (asset is null) return NotFound(new { error = "Equipment not found" });

            // Collect this asset + all ancestors (traverse parentId up the tree)
            var ancestorIds = new List<Guid> { equipmentAssetId };
            var current = asset;
            var visited = new HashSet<Guid> { equipmentAssetId };
            while (current.ParentId.HasValue && !visited.Contains(current.ParentId.Value))
            {
                ancestorIds.Add(current.ParentId.Value);
                visited.Add(current.ParentId.Value);
                current = await _context.EquipmentAssets.AsNoTracking()
                    .FirstOrDefaultAsync(a => a.Id == current.ParentId.Value);
                if (current is null) break;
            }

            // Find all material links for this asset + all ancestors
            var links = await _context.MaterialItemEquipments
                .AsNoTracking()
                .Where(x => ancestorIds.Contains(x.EquipmentAssetId))
                .ToListAsync();

            if (links.Count == 0) return Ok(Array.Empty<object>());

            // Deduplicate by MaterialItemId (prefer the most specific link - closest to the asset)
            var deduped = links
                .GroupBy(l => l.MaterialItemId)
                .Select(g => g.OrderBy(l => ancestorIds.IndexOf(l.EquipmentAssetId)).First())
                .ToList();

            // MaterialItemId trỏ DANH MỤC (material_items). Định danh lấy từ catalog;
            // đơn vị/spec/tồn kho lấy từ vật tư trên tàu (material_item_ship) join theo mã.
            var matIds = deduped.Select(x => x.MaterialItemId).ToList();
            var catalogs = await _context.MaterialCatalogItems
                .AsNoTracking()
                .Where(m => matIds.Contains(m.Id) && m.IsActive)
                .ToListAsync();
            var catalogCodes = catalogs.Select(c => c.ItemCode).ToList();

            var shipItems = await _context.MaterialItems
                .AsNoTracking()
                .Where(s => s.MaterialItemCode != null && catalogCodes.Contains(s.MaterialItemCode))
                .ToListAsync();
            var shipIds = shipItems.Select(s => s.Id).ToList();

            var stockByShipId = await _context.InventoryStocks
                .AsNoTracking()
                .Where(s => shipIds.Contains(s.MaterialItemId) && s.Quantity > 0)
                .GroupBy(s => s.MaterialItemId)
                .Select(g => new
                {
                    MaterialItemId = g.Key,
                    Quantity = g.Sum(s => s.Quantity)
                })
                .ToDictionaryAsync(x => x.MaterialItemId, x => x.Quantity);

            var result = deduped
                .Select(l =>
                {
                    var cat = catalogs.FirstOrDefault(m => m.Id == l.MaterialItemId);
                    if (cat is null) return null;
                    var ship = shipItems.FirstOrDefault(s => s.MaterialItemCode == cat.ItemCode);
                    double? onHand = null;
                    if (ship != null)
                        onHand = stockByShipId.TryGetValue(ship.Id, out var q) ? (double)q : ship.OnHandQuantity;
                    return new
                    {
                        linkId = l.Id,
                        materialItemId = cat.Id,
                        itemCode = cat.ItemCode,
                        name = cat.Name,
                        unit = ship?.Unit ?? "PCS",
                        onHandQuantity = onHand,
                        quantityRequired = l.QuantityRequired,
                        minStock = ship?.MinStock,
                        specification = ship?.Specification,
                        notes = l.Notes,
                        linkedAt = l.CreatedAt,
                        inheritedFrom = l.EquipmentAssetId != equipmentAssetId ? l.EquipmentAssetId : (Guid?)null
                    };
                })
                .Where(x => x != null)
                .ToList();

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting materials for equipment {Id}", equipmentAssetId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get equipment link counts for all material items (bulk).
    /// Thiết bị gắn với DANH MỤC vật tư (material_items), nên phải nối thêm một bước
    /// qua ItemCode mới ra được vật tư của tàu (material_item_ship) — đó là khóa mà
    /// trang "Vật tư của tàu" dùng để tra.
    /// </summary>
    [HttpGet("items/equipment-counts")]
    public async Task<IActionResult> GetEquipmentCounts()
    {
        try
        {
            var catalogCounts = await _context.MaterialItemEquipments
                .AsNoTracking()
                .GroupBy(x => x.MaterialItemId)
                .Select(g => new { CatalogItemId = g.Key, Count = g.Count() })
                .ToListAsync();

            if (catalogCounts.Count == 0) return Ok(Array.Empty<object>());

            var catalogIds = catalogCounts.Select(c => c.CatalogItemId).ToList();
            var catalogCodes = await _context.MaterialCatalogItems
                .AsNoTracking()
                .Where(c => catalogIds.Contains(c.Id))
                .Select(c => new { c.Id, c.ItemCode })
                .ToListAsync();

            var codeById = catalogCodes.ToDictionary(c => c.Id, c => c.ItemCode);
            var codes = codeById.Values.ToList();

            var shipItems = await _context.MaterialItems
                .AsNoTracking()
                .Where(m => codes.Contains(m.ItemCode))
                .Select(m => new { m.Id, m.ItemCode })
                .ToListAsync();

            // Một mã có thể ứng với nhiều dòng kho tàu — cộng dồn theo từng dòng kho.
            var countByCode = new Dictionary<string, int>();
            foreach (var c in catalogCounts)
            {
                if (!codeById.TryGetValue(c.CatalogItemId, out var code)) continue;
                countByCode[code] = countByCode.GetValueOrDefault(code) + c.Count;
            }

            var counts = shipItems
                .Where(m => countByCode.ContainsKey(m.ItemCode))
                .Select(m => new { materialItemId = m.Id, count = countByCode[m.ItemCode] })
                .ToList();

            return Ok(counts);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting equipment counts");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get equipment linked to a material item
    /// </summary>
    [HttpGet("items/{id}/equipment")]
    public async Task<IActionResult> GetItemEquipment(Guid id)
    {
        try
        {
            // id có thể là vật tư của tàu (material_item_ship) → quy về DANH MỤC vì
            // liên kết thiết bị gắn trên material_items.
            var catId = await ResolveCatalogItemIdAsync(id);
            if (catId == null) return NotFound(new { error = "Item not found" });

            var links = await _context.MaterialItemEquipments
                .AsNoTracking()
                .Where(x => x.MaterialItemId == catId.Value)
                .ToListAsync();

            var eqIds = links.Select(x => x.EquipmentAssetId).ToList();
            var assets = await _context.EquipmentAssets
                .AsNoTracking()
                .Where(a => eqIds.Contains(a.Id))
                .Select(a => new { a.Id, a.AssetCode, a.AssetName, a.Category })
                .ToListAsync();

            return Ok(links.Select(l => new
            {
                l.Id,
                l.MaterialItemId,
                l.EquipmentAssetId,
                l.Notes,
                l.QuantityRequired,
                l.CreatedAt,
                equipmentCode = assets.FirstOrDefault(a => a.Id == l.EquipmentAssetId)?.AssetCode,
                equipmentName = assets.FirstOrDefault(a => a.Id == l.EquipmentAssetId)?.AssetName,
                equipmentCategory = assets.FirstOrDefault(a => a.Id == l.EquipmentAssetId)?.Category,
            }));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting equipment for item {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Assign equipment to material items (batch M:N)
    /// </summary>
    [HttpPost("items/assign-equipment")]
    public async Task<IActionResult> AssignEquipment([FromBody] AssignEquipmentDto dto)
    {
        try
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);

            var created = 0;
            var skipped = 0;

            var equipmentIds = dto.EquipmentAssetIds.Distinct().ToArray();
            if (await _context.EquipmentAssets.CountAsync(a => equipmentIds.Contains(a.Id) && a.IsActive)
                != equipmentIds.Length)
                return BadRequest(new { error = "Thiết bị không tồn tại hoặc đã ngừng sử dụng." });
            var pendingLinks = new HashSet<(Guid Material, Guid Equipment)>();

            foreach (var rawMatId in dto.MaterialItemIds.Distinct())
            {
                // FE gửi id của vật tư (có thể là material_item_ship) → quy về DANH MỤC (material_items).
                var catId = await ResolveCatalogItemIdAsync(rawMatId);
                if (catId == null) { skipped++; continue; }

                foreach (var eqId in equipmentIds)
                {
                    if (!pendingLinks.Add((catId.Value, eqId))) { skipped++; continue; }
                    var exists = await _context.MaterialItemEquipments
                        .AnyAsync(x => x.MaterialItemId == catId.Value && x.EquipmentAssetId == eqId);

                    if (exists) { skipped++; continue; }

                    _context.MaterialItemEquipments.Add(new MaterialItemEquipment
                    {
                        MaterialItemId = catId.Value,
                        EquipmentAssetId = eqId,
                        QuantityRequired = dto.QuantityRequired,
                        Notes = dto.Notes
                    });
                    created++;
                }
            }

            await _context.SaveChangesAsync();

            return Ok(new
            {
                message = $"Assigned {created} links, {skipped} already existed",
                created,
                skipped
            });
        }
        catch (DbUpdateException ex) when (ex.InnerException is Npgsql.PostgresException { SqlState: "23505" })
        {
            return Conflict(new { error = "Liên kết vật tư–thiết bị đã được tạo bởi yêu cầu khác." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error assigning equipment to materials");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Quy id vật tư về DANH MỤC (material_items): nếu đã là catalog id thì giữ nguyên;
    /// nếu là material_item_ship id thì map qua material_item_code → catalog id.
    /// </summary>
    private async Task<Guid?> ResolveCatalogItemIdAsync(Guid id)
    {
        if (await _context.MaterialCatalogItems.AsNoTracking().AnyAsync(c => c.Id == id))
            return id;
        var ship = await _context.MaterialItems.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id);
        if (ship == null || string.IsNullOrEmpty(ship.MaterialItemCode)) return null;
        var cat = await _context.MaterialCatalogItems.AsNoTracking()
            .FirstOrDefaultAsync(c => c.ItemCode == ship.MaterialItemCode);
        return cat?.Id;
    }

    /// <summary>
    /// Remove equipment assignment from a material item
    /// </summary>
    [HttpDelete("items/{materialItemId}/equipment/{equipmentAssetId}")]
    public async Task<IActionResult> RemoveEquipmentAssignment(Guid materialItemId, Guid equipmentAssetId)
    {
        try
        {
            var catId = await ResolveCatalogItemIdAsync(materialItemId) ?? materialItemId;
            var link = await _context.MaterialItemEquipments
                .FirstOrDefaultAsync(x => x.MaterialItemId == catId && x.EquipmentAssetId == equipmentAssetId);

            if (link is null) return NotFound(new { error = "Link not found" });

            _context.MaterialItemEquipments.Remove(link);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Assignment removed" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing equipment assignment");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Update required quantity/notes for a material-equipment assignment.
    /// </summary>
    [HttpPut("items/{materialItemId}/equipment/{equipmentAssetId}")]
    public async Task<IActionResult> UpdateEquipmentAssignment(Guid materialItemId, Guid equipmentAssetId, [FromBody] UpdateEquipmentMaterialDto dto)
    {
        try
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);

            var catId = await ResolveCatalogItemIdAsync(materialItemId) ?? materialItemId;
            var link = await _context.MaterialItemEquipments
                .FirstOrDefaultAsync(x => x.MaterialItemId == catId && x.EquipmentAssetId == equipmentAssetId);

            if (link is null) return NotFound(new { error = "Link not found" });

            link.QuantityRequired = dto.QuantityRequired;
            link.Notes = dto.Notes;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Assignment updated" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating equipment material assignment");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Check if setting a parent category would create a circular reference
    /// </summary>
    private async Task<bool> HasCircularReference(long categoryId, long proposedParentId)
    {
        var currentParentId = proposedParentId;
        var visited = new HashSet<long> { categoryId };

        while (currentParentId != 0)
        {
            if (visited.Contains(currentParentId))
                return true;

            visited.Add(currentParentId);

            var parent = await _context.MaterialCategories
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == currentParentId);

            if (parent is null || !parent.ParentCategoryId.HasValue)
                break;

            currentParentId = parent.ParentCategoryId.Value;
        }

        return false;
    }
}
