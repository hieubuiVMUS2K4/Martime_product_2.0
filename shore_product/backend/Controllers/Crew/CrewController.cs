using Maritime.Shared.Models.Documents;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Maritime.Shared.DTOs.Crew;
using ProductApi.Data;
using ProductApi.Services.Crew;
using ProductApi.Services.Sync;
using Maritime.Shared.Models.Sync;

namespace ProductApi.Controllers.Crew;

public class AssignVesselRequest
{
    public Guid VesselId { get; set; }
}

/// <summary>
/// Cho thuyền viên xuống tàu từ bờ. Bờ có thẩm quyền quyết định ngay, không cần phê duyệt.
/// </summary>
public class SignOffRequest
{
    /// <summary>Bỏ trống = lấy thời điểm hiện tại.</summary>
    public DateTime? SignOffDate { get; set; }

    public string? PortCode { get; set; }
    public string? PortName { get; set; }

    /// <summary>Lý do rời tàu: hết hợp đồng, bệnh, kỷ luật, việc gia đình...</summary>
    public string? Reason { get; set; }

    public string? SignedOffBy { get; set; }
    public string? Remarks { get; set; }

    /// <summary>Hạnh kiểm ghi cho kỳ phục vụ này.</summary>
    public string? Conduct { get; set; }
}

/// <summary>
/// Shore Crew Management Controller.
/// Multi-ship crew overview with full CRUD.
/// </summary>
[ApiController]
[Route("api/crew")]
[Authorize(Policy = "InternalAccess")]
public class CrewController : ControllerBase
{
    private readonly ICrewService _crewService;
    private readonly ILogger<CrewController> _logger;
    private readonly AppDbContext _context;
    private readonly ISyncOutboxService _syncOutbox;
    private readonly ISyncFileStorageService _syncFileStorageService;

    public CrewController(ICrewService crewService, ILogger<CrewController> logger, AppDbContext context, ISyncOutboxService syncOutbox, ISyncFileStorageService syncFileStorageService)
    {
        _crewService = crewService;
        _logger = logger;
        _context = context;
        _syncOutbox = syncOutbox;
        _syncFileStorageService = syncFileStorageService;
    }

    // ============================================================
    // CREW MEMBER ENDPOINTS
    // ============================================================

    /// <summary>
    /// GET /api/crew — Paginated crew list with search/filter.
    /// Shore-specific: supports shipId and pool filters.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAllCrew(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? search = null,
        [FromQuery] bool? isOnboard = null,
        [FromQuery] Guid? shipId = null,
        [FromQuery] bool? pool = null,
        [FromQuery] string? rankName = null,
        [FromQuery] string? department = null,
        [FromQuery] string? vesselName = null)
    {
        try
        {
            var (data, totalCount, totalPages) = await _crewService.GetAllCrewAsync(
                page, pageSize, search, isOnboard, shipId, pool, rankName, department, vesselName);

            return Ok(new
            {
                data,
                pagination = new
                {
                    currentPage = page,
                    pageSize,
                    totalCount,
                    totalPages,
                    hasNextPage = page < totalPages,
                    hasPreviousPage = page > 1
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting crew list");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>GET /api/crew/stats — Fleet-wide crew counts (total, onboard, pool).</summary>
    [HttpGet("stats")]
    public async Task<IActionResult> GetCrewStats()
    {
        try
        {
            var (total, onboard, pool, pendingReview) = await _crewService.GetCrewStatsAsync();
            return Ok(new { total, onboard, pool, pendingReview });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting crew stats");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// GET /api/crew/hold-notifications
    /// Returns crew members with OnHold status changed in the last 30 days,
    /// ordered newest first. Used by the shore notification bell.
    /// </summary>
    [HttpGet("hold-notifications")]
    public async Task<IActionResult> GetHoldNotifications()
    {
        try
        {
            var cutoff = DateTime.UtcNow.AddDays(-30);
            var results = await _context.CrewMembers
                .AsNoTracking()
                .Where(c => c.OnboardStatus == "OnHold" && c.OnboardStatusChangedAt >= cutoff)
                .Join(_context.Vessels,
                    c => c.VesselId,
                    v => v.Id,
                    (c, v) => new
                    {
                        c.Id,
                        c.CrewId,
                        c.FullName,
                        VesselId = v.Id,
                        VesselName = v.Name,
                        c.OnboardStatusChangedAt,
                        c.OnboardStatusChangedBy,
                    })
                .OrderByDescending(x => x.OnboardStatusChangedAt)
                .Take(50)
                .ToListAsync();

            return Ok(results);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting hold notifications");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>GET /api/crew/{id} — Get crew member by ID.</summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetCrew(Guid id)
    {
        try
        {
            var crew = await _crewService.GetCrewByIdAsync(id);
            if (crew == null) return NotFound(new { error = "Crew member not found" });
            return Ok(crew);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting crew {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>GET /api/crew/{id}/detail — Get detailed crew info (certs, docs).</summary>
    [HttpGet("{id:guid}/detail")]
    public async Task<IActionResult> GetCrewDetail(Guid id)
    {
        try
        {
            var crew = await _crewService.GetCrewDetailAsync(id);
            if (crew == null) return NotFound(new { error = "Crew member not found" });
            return Ok(crew);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting crew detail {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>POST /api/crew — Create a new crew member.</summary>
    [HttpPost]
    public async Task<IActionResult> CreateCrew([FromBody] CreateCrewRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.CrewId) || string.IsNullOrWhiteSpace(request.FullName))
                return BadRequest(new { error = "CrewId and FullName are required" });

            var crew = await _crewService.CreateCrewAsync(request);
            return CreatedAtAction(nameof(GetCrew), new { id = crew.Id }, crew);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Create crew failed: {Message}", ex.Message);
            return Conflict(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating crew");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>PUT /api/crew/{id} — Update an existing crew member.</summary>
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateCrew(Guid id, [FromBody] UpdateCrewRequest request)
    {
        try
        {
            var crew = await _crewService.UpdateCrewAsync(id, request);
            if (crew == null) return NotFound(new { error = "Crew member not found" });

            // CrewService.UpdateCrewAsync đã gửi bản cập nhật xuống đúng tàu của thuyền viên.

            return Ok(crew);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating crew {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>DELETE /api/crew/{id} — Delete a crew member.</summary>
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteCrew(Guid id)
    {
        try
        {
            var result = await _crewService.DeleteCrewAsync(id);
            if (!result) return NotFound(new { error = "Crew member not found" });
            return Ok(new { message = "Crew member deleted" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting crew {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ============================================================
    // VESSEL ASSIGNMENT ENDPOINTS
    // ============================================================

    /// <summary>POST /api/crew/{id}/assign — Assign crew to a vessel.</summary>
    [HttpPost("{id:guid}/assign")]
    public async Task<IActionResult> AssignToVessel(Guid id, [FromBody] AssignVesselRequest request)
    {
        try
        {
            var crew = await _crewService.AssignToVesselAsync(id, request.VesselId);
            if (crew == null) return NotFound(new { error = "Crew member not found" });
            return Ok(crew);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error assigning crew {Id} to vessel", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>POST /api/crew/{id}/unassign — Remove crew from vessel (back to pool).</summary>
    [HttpPost("{id:guid}/unassign")]
    public async Task<IActionResult> UnassignFromVessel(Guid id)
    {
        try
        {
            var crew = await _crewService.UnassignFromVesselAsync(id);
            if (crew == null) return NotFound(new { error = "Crew member not found" });
            return Ok(crew);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error unassigning crew {Id} from vessel", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// POST /api/crew/{id}/sign-off — Cho thuyền viên xuống tàu.
    /// Đóng kỳ phục vụ trong sổ thuyền viên và trả người về danh bạ chung.
    /// </summary>
    [HttpPost("{id:guid}/sign-off")]
    public async Task<IActionResult> SignOffFromVessel(Guid id, [FromBody] SignOffRequest request)
    {
        try
        {
            var crew = await _crewService.SignOffFromVesselAsync(
                id,
                request.SignOffDate,
                request.PortCode,
                request.PortName,
                request.Reason,
                request.SignedOffBy,
                request.Conduct,
                request.Remarks);

            if (crew == null) return NotFound(new { error = "Crew member not found" });
            return Ok(crew);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error signing off crew {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>GET /api/crew/vessels — Get simple list of all vessels for assignment dropdown.</summary>
    [HttpGet("vessels")]
    public async Task<IActionResult> GetVesselsForAssignment()
    {
        try
        {
            var vessels = await _context.Vessels
                .AsNoTracking()
                .Where(v => v.IsActive)
                .OrderBy(v => v.Name)
                .Select(v => new { v.Id, v.Name, v.IMO })
                .ToListAsync();
            return Ok(vessels);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting vessels for crew assignment");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ============================================================
    // CREW DOCUMENTS ENDPOINTS
    // ============================================================

    /// <summary>GET /api/crew/{id}/documents/{category} — Get documents by category.</summary>
    [HttpGet("{id:guid}/documents/{category}")]
    public async Task<IActionResult> GetCrewDocuments(Guid id, string category)
    {
        try
        {
            var docs = await _crewService.GetCrewDocumentsAsync(id, category);
            return Ok(docs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting documents for crew {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>POST /api/crew/{id}/documents — Add a document to crew member.</summary>
    [HttpPost("{id:guid}/documents")]
    public async Task<IActionResult> AddCrewDocument(Guid id, [FromBody] CreateIdentityDocumentDto request)
    {
        try
        {
            var doc = await _crewService.AddCrewDocumentAsync(id, request);
            return Created($"/api/crew/{id}/documents/{request.Category}", doc);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding document for crew {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// PUT /api/crew/{crewId}/documents/{category}/{documentId} — Cập nhật thông tin tài liệu.
    /// File đính kèm có luồng riêng ở endpoint .../file bên dưới.
    /// </summary>
    [HttpPut("{crewId:guid}/documents/{category}/{documentId:guid}")]
    public async Task<IActionResult> UpdateCrewDocument(Guid crewId, string category, Guid documentId,
        [FromBody] CreateIdentityDocumentDto request)
    {
        try
        {
            // Category lấy theo route để tránh lệch khi client quên gửi trong body.
            request.Category = category;

            var doc = await _crewService.UpdateCrewDocumentAsync(crewId, documentId, request);
            if (doc == null) return NotFound(new { error = "Document not found" });
            return Ok(doc);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating document {DocId} for crew {CrewId}", documentId, crewId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>DELETE /api/crew/{crewId}/documents/{category}/{documentId}</summary>
    [HttpDelete("{crewId:guid}/documents/{category}/{documentId:guid}")]
    public async Task<IActionResult> DeleteCrewDocument(Guid crewId, string category, Guid documentId)
    {
        try
        {
            var result = await _crewService.DeleteCrewDocumentAsync(crewId, documentId, category);
            if (!result) return NotFound(new { error = "Document not found" });
            return Ok(new { message = "Document deleted" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting document {DocId} for crew {CrewId}", documentId, crewId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>PUT /api/crew/{crewId}/documents/{category}/{documentId}/file — Upload or replace a document file.</summary>
    [HttpPut("{crewId:guid}/documents/{category}/{documentId:guid}/file")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadDocumentFile(Guid crewId, string category, Guid documentId, [FromForm] IFormFile file)
    {
        try
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "File is required" });

            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif", ".pdf" };
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!allowedExtensions.Contains(extension))
                return BadRequest(new { error = "Only image files (jpg, jpeg, png, gif) and PDF are allowed" });

            if (file.Length > 10 * 1024 * 1024)
                return BadRequest(new { error = "File size must not exceed 10MB" });

            var cat = CrewDocumentCategory.Normalize(category ?? CrewDocumentCategory.Travel);
            if (cat == null) return BadRequest(new { error = $"Unknown document category: {category}" });
            var fileName = $"doc_{crewId}_{documentId}_{DateTime.UtcNow:yyyyMMddHHmmss}{extension}";
            var relativePath = $"/uploads/crew/documents/{fileName}";

            var doc = await _context.CrewMemberDocuments.AsTracking()
                .FirstOrDefaultAsync(d => d.Id == documentId && d.CrewMemberId == crewId && d.Category == cat);
            if (doc == null) return NotFound(new { error = "Document not found" });
            if (!string.IsNullOrEmpty(doc.FileUrl))
                await _syncFileStorageService.DeleteIfExistsAsync(doc.FileUrl, HttpContext.RequestAborted);
            await using (var buf = new MemoryStream())
            {
                await file.CopyToAsync(buf, HttpContext.RequestAborted);
                await _syncFileStorageService.WriteAllBytesAsync(relativePath, buf.ToArray(), HttpContext.RequestAborted);
            }
            doc.FileUrl = relativePath;
            doc.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            await _syncOutbox.EnqueueForCrewAsync(crewId, CrewMemberDocument.SyncTable, documentId.ToString(), SyncActionType.UPDATE, doc);

            _logger.LogInformation("Uploaded document file for crew {CrewId}, category {Category}, doc {DocId}", crewId, category, documentId);
            return Ok(new { message = "Document file uploaded successfully", fileUrl = $"/uploads/crew/documents/{fileName}" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading document file for crew {CrewId}", crewId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ============================================================
    // SERVICE RECORDS ENDPOINTS
    // ============================================================

    /// <summary>GET /api/crew/{id}/service-records — Get sea service history.</summary>
    [HttpGet("{id:guid}/service-records")]
    public async Task<IActionResult> GetServiceRecords(Guid id)
    {
        try
        {
            var records = await _crewService.GetServiceRecordsAsync(id);
            return Ok(records);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting service records for crew {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>POST /api/crew/{id}/service-records — Add a service record.</summary>
    [HttpPost("{id:guid}/service-records")]
    public async Task<IActionResult> AddServiceRecord(Guid id, [FromBody] CreateServiceRecordRequest request)
    {
        try
        {
            var record = await _crewService.AddServiceRecordAsync(id, request);
            return Created($"/api/crew/{id}/service-records", record);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding service record for crew {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>PUT /api/crew/{id}/service-records/{recordId}</summary>
    [HttpPut("{id:guid}/service-records/{recordId:guid}")]
    public async Task<IActionResult> UpdateServiceRecord(Guid id, Guid recordId, [FromBody] CreateServiceRecordRequest request)
    {
        try
        {
            var record = await _crewService.UpdateServiceRecordAsync(recordId, request);
            if (record == null) return NotFound(new { error = "Service record not found" });
            return Ok(record);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating service record {RecordId}", recordId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>DELETE /api/crew/{id}/service-records/{recordId}</summary>
    [HttpDelete("{id:guid}/service-records/{recordId:guid}")]
    public async Task<IActionResult> DeleteServiceRecord(Guid id, Guid recordId)
    {
        try
        {
            var result = await _crewService.DeleteServiceRecordAsync(recordId);
            if (!result) return NotFound(new { error = "Service record not found" });
            return Ok(new { message = "Service record deleted" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting service record {RecordId}", recordId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ============================================================
    // EDGE CHANGES REVIEW ENDPOINTS
    // ============================================================

    /// <summary>POST /api/crew/{id}/mark-changes-viewed — Mark edge changes as viewed by shore.</summary>
    [HttpPost("{id:guid}/mark-changes-viewed")]
    public async Task<IActionResult> MarkChangesViewed(Guid id)
    {
        try
        {
            var crew = await _context.CrewMembers.FindAsync(id);
            if (crew == null) return NotFound(new { error = "Crew member not found" });

            crew.EdgeChangesViewed = true;
            crew.EdgeChanges = null;
            crew.UpdatedAt = DateTime.UtcNow;
            _context.CrewMembers.Update(crew);
            await _context.SaveChangesAsync();

            // Sync clear command to edge so it removes stale EdgeChanges
            await _syncOutbox.BroadcastAsync(
                "crew_member",
                id.ToString(),
                Maritime.Shared.Models.Sync.SyncActionType.CLEAR_EDGE_CHANGES,
                new { Id = id, EdgeChanges = (string?)null, EdgeChangesViewed = true });

            return Ok(new { message = "Edge changes marked as viewed" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error marking changes viewed for crew {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>POST /api/crew/{id}/avatar — Upload or replace crew avatar photo.</summary>
    [HttpPost("{id:guid}/avatar")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadAvatar(Guid id, [FromForm] IFormFile file)
    {
        try
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "File is required" });

            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif" };
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!allowedExtensions.Contains(extension))
                return BadRequest(new { error = "Only image files (JPG, PNG, GIF) are allowed" });

            if (file.Length > 5 * 1024 * 1024)
                return BadRequest(new { error = "File size must not exceed 5MB" });

            var crew = await _context.CrewMembers.FindAsync(id);
            if (crew == null) return NotFound(new { error = "Crew member not found" });

            var fileName = $"avatar_{id}_{DateTime.UtcNow:yyyyMMddHHmmss}{extension}";
            var relativePath = $"/uploads/crew/avatars/{fileName}";

            // Delete old avatar file if stored locally
            if (!string.IsNullOrEmpty(crew.PhotoUrl) && crew.PhotoUrl.StartsWith("/uploads/"))
                await _syncFileStorageService.DeleteIfExistsAsync(crew.PhotoUrl, HttpContext.RequestAborted);

            await using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer, HttpContext.RequestAborted);
            await _syncFileStorageService.WriteAllBytesAsync(relativePath, buffer.ToArray(), HttpContext.RequestAborted);

            crew.PhotoUrl = relativePath;
            crew.UpdatedAt = DateTime.UtcNow;
            _context.CrewMembers.Update(crew);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Uploaded avatar for crew: {Id}", id);

            // Broadcast crew member update to edge so avatar syncs
            await _syncOutbox.EnqueueForVesselAsync(crew.VesselId, "crew_member", id.ToString(), SyncActionType.UPDATE, crew);

            var dto = await _crewService.GetCrewByIdAsync(id);
            return Ok(new
            {
                message = "Avatar uploaded successfully",
                avatarUrl = crew.PhotoUrl,
                crewMember = dto
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading avatar for crew {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }
}
