using MaritimeEdge.Models;
using MaritimeEdge.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Controllers.Inventory;

// ========== DTOs ==========
public class CreateMaterialRequestDto
{
    public string? VesselName { get; set; }
    public Guid? VoyageId { get; set; }
    public string? VoyageName { get; set; }
    public string Urgency { get; set; } = "Normal";
    public DateTime NeededDate { get; set; }
    public DateTime RequestDate { get; set; }
    public string? RequestedBy { get; set; }
    public string? Notes { get; set; }
    public string? Attachments { get; set; }
    public List<CreateMaterialRequestItemDto> Items { get; set; } = new();
}

public class CreateMaterialRequestItemDto
{
    public Guid? EquipmentAssetId { get; set; }
    public Guid? MaterialItemId { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Unit { get; set; } = "PCS";
    public decimal QuantityOnHand { get; set; }
    public decimal QuantityRequested { get; set; }
    public string? Note { get; set; }
}

public class UpdateMaterialRequestDto
{
    public string? VesselName { get; set; }
    public Guid? VoyageId { get; set; }
    public string? VoyageName { get; set; }
    public string? Urgency { get; set; }
    public DateTime? NeededDate { get; set; }
    public DateTime? RequestDate { get; set; }
    public string? RequestedBy { get; set; }
    public string? Notes { get; set; }
    public string? Attachments { get; set; }
    public string? Status { get; set; }
    public List<CreateMaterialRequestItemDto>? Items { get; set; }
}

[ApiController]
[Route("api/material-requests")]
public class MaterialRequestController : ControllerBase
{
    private readonly EdgeDbContext _context;

    public MaterialRequestController(EdgeDbContext context)
    {
        _context = context;
    }

    /// <summary>GET all requests (paged)</summary>
    [HttpGet]
    public async Task<ActionResult> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? status = null,
        [FromQuery] string? q = null)
    {
        var query = _context.MaterialRequests
            .Where(r => r.IsActive)
            .AsQueryable();

        if (!string.IsNullOrEmpty(status))
            query = query.Where(r => r.Status == status);

        if (!string.IsNullOrEmpty(q))
            query = query.Where(r =>
                r.RequestCode.Contains(q) ||
                (r.RequestedBy != null && r.RequestedBy.Contains(q)) ||
                (r.Notes != null && r.Notes.Contains(q)));

        var total = await query.CountAsync();

        var items = await query
            .OrderByDescending(r => r.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(r => new
            {
                r.Id,
                r.RequestCode,
                r.VesselName,
                r.VoyageId,
                r.VoyageName,
                r.Urgency,
                r.NeededDate,
                r.RequestDate,
                r.RequestedBy,
                r.Notes,
                r.Attachments,
                r.Status,
                r.CreatedAt,
                r.UpdatedAt,
                ItemCount = r.Items.Count
            })
            .ToListAsync();

        return Ok(new { items, total, page, pageSize });
    }

    /// <summary>GET single request with items</summary>
    [HttpGet("{id}")]
    public async Task<ActionResult> GetById(int id)
    {
        var request = await _context.MaterialRequests
            .Where(r => r.Id == id && r.IsActive)
            .Select(r => new
            {
                r.Id,
                r.RequestCode,
                r.VesselName,
                r.VoyageId,
                r.VoyageName,
                r.Urgency,
                r.NeededDate,
                r.RequestDate,
                r.RequestedBy,
                r.Notes,
                r.Attachments,
                r.Status,
                r.CreatedAt,
                r.UpdatedAt,
                Items = r.Items.Select(i => new
                {
                    i.Id,
                    i.EquipmentAssetId,
                    i.MaterialItemId,
                    i.ItemName,
                    i.Description,
                    i.Unit,
                    i.QuantityOnHand,
                    i.QuantityRequested,
                    i.Note
                }).ToList()
            })
            .FirstOrDefaultAsync();

        if (request == null) return NotFound();
        return Ok(request);
    }

    /// <summary>POST create new request</summary>
    [HttpPost]
    public async Task<ActionResult> Create([FromBody] CreateMaterialRequestDto dto)
    {
        var itemValidation = await ValidateItems(dto.Items);
        if (itemValidation != null) return itemValidation;

        // Generate code: YC-YYYYMMDD-XXX
        var today = DateTime.UtcNow.ToString("yyyyMMdd");
        var countToday = await _context.MaterialRequests
            .CountAsync(r => r.RequestCode.StartsWith($"YC-{today}"));
        var code = $"YC-{today}-{(countToday + 1):D3}";

        var request = new MaterialRequest
        {
            RequestCode = code,
            VesselName = dto.VesselName,
            VoyageId = dto.VoyageId,
            VoyageName = dto.VoyageName,
            Urgency = dto.Urgency,
            NeededDate = DateTime.SpecifyKind(dto.NeededDate, DateTimeKind.Utc),
            RequestDate = DateTime.SpecifyKind(dto.RequestDate, DateTimeKind.Utc),
            RequestedBy = dto.RequestedBy,
            Notes = dto.Notes,
            Attachments = dto.Attachments,
            Status = "Draft"
        };

        foreach (var item in dto.Items)
        {
            request.Items.Add(new MaterialRequestItem
            {
                EquipmentAssetId = item.EquipmentAssetId,
                MaterialItemId = item.MaterialItemId,
                ItemName = item.ItemName,
                Description = item.Description,
                Unit = item.Unit,
                QuantityOnHand = item.QuantityOnHand,
                QuantityRequested = item.QuantityRequested,
                Note = item.Note
            });
        }

        _context.MaterialRequests.Add(request);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = request.Id }, new { request.Id, request.RequestCode });
    }

    /// <summary>PUT update existing request</summary>
    [HttpPut("{id}")]
    public async Task<ActionResult> Update(int id, [FromBody] UpdateMaterialRequestDto dto)
    {
        var request = await _context.MaterialRequests
            .Include(r => r.Items)
            .FirstOrDefaultAsync(r => r.Id == id && r.IsActive);

        if (request == null) return NotFound();

        if (request.Status != "Draft")
            return BadRequest("Chỉ được chỉnh sửa yêu cầu ở trạng thái nháp.");
        if (dto.Status != null && dto.Status != request.Status)
            return BadRequest("Hãy dùng thao tác gửi, duyệt hoặc từ chối để chuyển trạng thái yêu cầu.");

        if (dto.VesselName != null) request.VesselName = dto.VesselName;
        if (dto.VoyageId.HasValue) request.VoyageId = dto.VoyageId;
        if (dto.VoyageName != null) request.VoyageName = dto.VoyageName;
        if (dto.Urgency != null) request.Urgency = dto.Urgency;
        if (dto.NeededDate.HasValue) request.NeededDate = DateTime.SpecifyKind(dto.NeededDate.Value, DateTimeKind.Utc);
        if (dto.RequestDate.HasValue) request.RequestDate = DateTime.SpecifyKind(dto.RequestDate.Value, DateTimeKind.Utc);
        if (dto.RequestedBy != null) request.RequestedBy = dto.RequestedBy;
        if (dto.Notes != null) request.Notes = dto.Notes;
        if (dto.Attachments != null) request.Attachments = dto.Attachments;
        if (dto.Status != null) request.Status = dto.Status;
        request.UpdatedAt = DateTime.UtcNow;

        // Replace items if provided
        if (dto.Items != null)
        {
            var itemValidation = await ValidateItems(dto.Items);
            if (itemValidation != null) return itemValidation;

            _context.MaterialRequestItems.RemoveRange(request.Items);
            foreach (var item in dto.Items)
            {
                request.Items.Add(new MaterialRequestItem
                {
                    EquipmentAssetId = item.EquipmentAssetId,
                    MaterialItemId = item.MaterialItemId,
                    ItemName = item.ItemName,
                    Description = item.Description,
                    Unit = item.Unit,
                    QuantityOnHand = item.QuantityOnHand,
                    QuantityRequested = item.QuantityRequested,
                    Note = item.Note
                });
            }
        }

        await _context.SaveChangesAsync();
        return Ok(new { request.Id, request.RequestCode, request.Status });
    }

    private async Task<BadRequestObjectResult?> ValidateItems(IEnumerable<CreateMaterialRequestItemDto> items)
    {
        var requestItems = items.ToList();
        if (requestItems.Count == 0)
            return BadRequest("A material request must include at least one item.");

        if (requestItems.Any(item => !item.MaterialItemId.HasValue))
            return BadRequest("Each material request item must select a catalog material.");

        // material_request_items.material_item_id trỏ tới danh mục vật tư công ty (material_items),
        // không phải tồn kho của tàu (material_item_ship) — yêu cầu vật tư chính là để xin thứ tàu chưa có.
        var materialIds = requestItems.Select(item => item.MaterialItemId!.Value).Distinct().ToList();
        var validMaterialCount = await _context.MaterialCatalogItems
            .CountAsync(item => materialIds.Contains(item.Id) && item.IsActive);

        if (validMaterialCount != materialIds.Count)
            return BadRequest("One or more selected material items do not exist or are inactive.");

        return null;
    }

    /// <summary>PUT submit request (Draft → Submitted)</summary>
    [HttpPut("{id}/submit")]
    public async Task<ActionResult> Submit(int id)
    {
        var request = await _context.MaterialRequests
            .Include(item => item.Items)
            .FirstOrDefaultAsync(item => item.Id == id);
        if (request == null || !request.IsActive) return NotFound();
        if (request.Status != "Draft") return BadRequest("Only draft requests can be submitted.");
        if (request.Items.Any(item => !item.MaterialItemId.HasValue))
            return BadRequest("Each material request item must select a catalog material before submission.");

        request.Status = "Submitted";
        request.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return Ok(new { request.Id, request.Status });
    }

    /// <summary>PUT approve request (Submitted -> Approved)</summary>
    [HttpPut("{id}/approve")]
    public async Task<ActionResult> Approve(int id)
    {
        var request = await _context.MaterialRequests
            .Include(item => item.Items)
            .FirstOrDefaultAsync(item => item.Id == id);
        if (request == null || !request.IsActive) return NotFound();
        if (request.Status != "Submitted") return BadRequest("Only submitted requests can be approved.");
        if (request.Items.Any(item => !item.MaterialItemId.HasValue))
            return BadRequest("Each material request item must select a catalog material before approval.");

        request.Status = "Approved";
        request.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return Ok(new { request.Id, request.Status });
    }

    /// <summary>PUT reject request (Submitted -> Rejected)</summary>
    [HttpPut("{id}/reject")]
    public async Task<ActionResult> Reject(int id)
    {
        var request = await _context.MaterialRequests.FindAsync(id);
        if (request == null || !request.IsActive) return NotFound();
        if (request.Status != "Submitted") return BadRequest("Only submitted requests can be rejected.");

        request.Status = "Rejected";
        request.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return Ok(new { request.Id, request.Status });
    }

    /// <summary>DELETE soft-delete</summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(int id)
    {
        var request = await _context.MaterialRequests.FindAsync(id);
        if (request == null || !request.IsActive) return NotFound();

        request.IsActive = false;
        request.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>GET approved requests (for StockReceipt linking)</summary>
    [HttpGet("approved")]
    public async Task<ActionResult> GetApproved()
    {
        var items = await _context.MaterialRequests
            .Where(r => r.IsActive && r.Status == "Approved")
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new
            {
                r.Id,
                r.RequestCode,
                r.Urgency,
                r.RequestDate,
                r.RequestedBy,
                r.Status,
                ItemCount = r.Items.Count
            })
            .ToListAsync();

        return Ok(items);
    }
}
