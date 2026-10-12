using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Maritime.Shared.DTOs.Crew;
using Maritime.Shared.Models.Sync;
using ProductApi.Data;
using ProductApi.Services.Crew;
using ProductApi.Services.Sync;

namespace ProductApi.Controllers.Crew;

/// <summary>
/// Shore Certificates Management Controller.
/// Handles certificate types (master data) and crew certificate assignments.
/// </summary>
[ApiController]
[Route("api/certificates")]
[Authorize(Policy = "InternalAccess")]
public class CertificatesController : ControllerBase
{
    private readonly ICertificateService _certService;
    private readonly AppDbContext _context;
    private readonly ILogger<CertificatesController> _logger;
    private readonly ISyncOutboxService _syncOutbox;
    private readonly ISyncFileStorageService _syncFileStorageService;

    public CertificatesController(ICertificateService certService, AppDbContext context, ILogger<CertificatesController> logger, ISyncOutboxService syncOutbox, ISyncFileStorageService syncFileStorageService)
    {
        _certService = certService;
        _context = context;
        _logger = logger;
        _syncOutbox = syncOutbox;
        _syncFileStorageService = syncFileStorageService;
    }

    // ============================================================
    // CERTIFICATE TYPES (Master Data)
    // ============================================================

    /// <summary>GET /api/certificates — Get all certificate types.</summary>
    [HttpGet]
    public async Task<IActionResult> GetCertificateTypes([FromQuery] string? category = null, [FromQuery] int? rankId = null)
    {
        try
        {
            var types = await _certService.GetAllCertificateTypesAsync(category, rankId);
            return Ok(types);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting certificate types");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>GET /api/certificates/{id} — Get a certificate type by ID.</summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetCertificateType(int id)
    {
        try
        {
            var cert = await _certService.GetCertificateTypeByIdAsync(id);
            if (cert == null) return NotFound(new { error = "Certificate type not found" });
            return Ok(cert);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting certificate type {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>POST /api/certificates — Create a new certificate type.</summary>
    [HttpPost]
    public async Task<IActionResult> CreateCertificateType([FromBody] CreateCertificateRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.CertificateCode) || string.IsNullOrWhiteSpace(request.CertificateName))
                return BadRequest(new { error = "CertificateCode and CertificateName are required" });

            var cert = await _certService.CreateCertificateTypeAsync(request);
            return CreatedAtAction(nameof(GetCertificateType), new { id = cert.Id }, cert);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating certificate type");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>PUT /api/certificates/{id} — Update a certificate type.</summary>
    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateCertificateType(int id, [FromBody] CreateCertificateRequest request)
    {
        try
        {
            var cert = await _certService.UpdateCertificateTypeAsync(id, request);
            if (cert == null) return NotFound(new { error = "Certificate type not found" });
            return Ok(cert);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating certificate type {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>DELETE /api/certificates/{id} — Deactivate a certificate type.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteCertificateType(int id)
    {
        try
        {
            var result = await _certService.DeleteCertificateTypeAsync(id);
            if (!result) return NotFound(new { error = "Certificate type not found" });
            return Ok(new { message = "Certificate type deactivated" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting certificate type {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// POST /api/certificates/sync/broadcast-all — Đồng bộ TOÀN BỘ danh mục loại chứng chỉ
    /// xuống mọi tàu (initial/full resync). Đối xứng với /api/material/sync/broadcast-all.
    /// </summary>
    [HttpPost("sync/broadcast-all")]
    public async Task<IActionResult> BroadcastAllCertificateTypes()
    {
        try
        {
            var (certs, countryMappings, rankMappings) = await _certService.BroadcastAllCertificateTypesAsync();
            return Ok(new
            {
                message = "Đã đẩy toàn bộ danh mục loại chứng chỉ xuống tàu",
                certificates = certs,
                countryMappings,
                rankMappings
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error broadcasting all certificate types");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ============================================================
    // CERTIFICATE MAPPINGS (Countries & Ranks)
    // ============================================================

    /// <summary>GET /api/certificates/{id}/countries — Get country IDs mapped to a certificate.</summary>
    [HttpGet("{id:int}/countries")]
    public async Task<IActionResult> GetCertificateCountries(int id)
    {
        try
        {
            var ids = await _context.CountryCertificates
                .Where(cc => cc.CertificateId == id)
                .Select(cc => cc.CountryId)
                .ToListAsync();
            return Ok(ids);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting countries for certificate {Id}", id);
            return Ok(new List<int>());
        }
    }

    /// <summary>GET /api/certificates/{id}/ranks — Get rank IDs mapped to a certificate.</summary>
    [HttpGet("{id:int}/ranks")]
    public async Task<IActionResult> GetCertificateRanks(int id)
    {
        try
        {
            var ids = await _context.RankCertificates
                .Where(rc => rc.CertificateId == id)
                .Select(rc => rc.RankId)
                .ToListAsync();
            return Ok(ids);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting ranks for certificate {Id}", id);
            return Ok(new List<int>());
        }
    }

    // ============================================================
    // CREW CERTIFICATES
    // ============================================================

    /// <summary>GET /api/certificates/crew/{crewId} — Get all certificates for a crew member.</summary>
    [HttpGet("crew/{crewId:guid}")]
    public async Task<IActionResult> GetCrewCertificates(Guid crewId)
    {
        try
        {
            var certs = await _certService.GetCrewCertificatesAsync(crewId);
            return Ok(certs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting certificates for crew {CrewId}", crewId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>GET /api/certificates/crew-certificates/{id} — Get a specific crew certificate.</summary>
    [HttpGet("crew-certificates/{id:int}")]
    public async Task<IActionResult> GetCrewCertificate(int id)
    {
        try
        {
            var cert = await _certService.GetCrewCertificateByIdAsync(id);
            if (cert == null) return NotFound(new { error = "Crew certificate not found" });
            return Ok(cert);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting crew certificate {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>POST /api/certificates/crew-certificates — Add certificate to crew.</summary>
    [HttpPost("crew-certificates")]
    public async Task<IActionResult> AddCrewCertificate([FromBody] CrewCertificateRequest request)
    {
        try
        {
            var cert = await _certService.AddCrewCertificateAsync(request);
            return Created($"/api/certificates/crew-certificates/{cert.Id}", cert);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding crew certificate");
            return StatusCode(500, new { error = ex.Message, inner = ex.InnerException?.Message });
        }
    }

    /// <summary>PUT /api/certificates/crew-certificates/{id} — Update crew certificate.</summary>
    [HttpPut("crew-certificates/{id:int}")]
    public async Task<IActionResult> UpdateCrewCertificate(int id, [FromBody] CrewCertificateRequest request)
    {
        try
        {
            var cert = await _certService.UpdateCrewCertificateAsync(id, request);
            if (cert == null) return NotFound(new { error = "Crew certificate not found" });
            return Ok(cert);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating crew certificate {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>DELETE /api/certificates/crew-certificates/{id} — Delete crew certificate.</summary>
    [HttpDelete("crew-certificates/{id:int}")]
    public async Task<IActionResult> DeleteCrewCertificate(int id)
    {
        try
        {
            var result = await _certService.DeleteCrewCertificateAsync(id);
            if (!result) return NotFound(new { error = "Crew certificate not found" });
            return Ok(new { message = "Crew certificate deleted" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting crew certificate {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ============================================================
    // FLEET-LEVEL QUERIES
    // ============================================================

    /// <summary>GET /api/certificates/expiring?days=90 — Fleet-wide expiring certificates.</summary>
    [HttpGet("expiring")]
    public async Task<IActionResult> GetExpiringCertificates([FromQuery] int days = 90)
    {
        try
        {
            var certs = await _certService.GetExpiringCertificatesAsync(days);
            return Ok(new { data = certs, expiryDays = days, count = certs.Count });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting expiring certificates");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>GET /api/certificates/compliance — Fleet-wide compliance report.</summary>
    [HttpGet("compliance")]
    public async Task<IActionResult> GetFleetCompliance()
    {
        try
        {
            var report = await _certService.GetFleetComplianceAsync();
            return Ok(report);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting fleet compliance");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// GET /api/certificates/compliance/matrix — Ma trận tuân thủ xoay theo LOẠI chứng chỉ:
    /// mỗi loại cho biết ai đang thiếu, kèm tổng hợp chức danh nào đang có người thiếu.
    /// </summary>
    [HttpGet("compliance/matrix")]
    public async Task<IActionResult> GetComplianceMatrix([FromQuery] bool onboardOnly = false)
    {
        try
        {
            var matrix = await _certService.GetComplianceMatrixAsync(onboardOnly);
            return Ok(matrix);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error building certificate compliance matrix");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>GET /api/certificates/compliance/{crewId} — STCW compliance for crew.</summary>
    [HttpGet("compliance/{crewId:guid}")]
    public async Task<IActionResult> GetCrewCompliance(Guid crewId)
    {
        try
        {
            var status = await _certService.GetCrewComplianceAsync(crewId);
            return Ok(status);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting compliance for crew {CrewId}", crewId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ============================================================
    // FILE UPLOAD
    // ============================================================

    /// <summary>PUT /api/certificates/crew-certificates/{id}/file — Upload certificate document image.</summary>
    [HttpPut("crew-certificates/{id:int}/file")]
    public async Task<IActionResult> UploadCertificateFile(int id, [FromForm] IFormFile file)
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

            var crewCertificate = await _context.CrewCertificates
                .Include(cc => cc.CrewMember)
                .Include(cc => cc.Certificate)
                .FirstOrDefaultAsync(cc => cc.Id == id);
            if (crewCertificate == null)
                return NotFound(new { error = "Crew certificate not found", id });

            // Name file by crewId + certificate name for clarity
            var safeCrewId = crewCertificate.CrewMember?.CrewId ?? crewCertificate.CrewMemberId.ToString();
            var safeCertName = (crewCertificate.Certificate?.CertificateName ?? $"cert_{id}")
                .Replace(" ", "_").Replace("/", "_").Replace("\\", "_");
            var fileName = $"{safeCrewId}_{safeCertName}{extension}";
            var relativePath = $"/uploads/crew/certificates/{fileName}";

            // Delete old file if exists
            if (!string.IsNullOrEmpty(crewCertificate.DocumentFilePath))
                await _syncFileStorageService.DeleteIfExistsAsync(crewCertificate.DocumentFilePath, HttpContext.RequestAborted);

            await using var buffer = new MemoryStream();
            await file.CopyToAsync(buffer, HttpContext.RequestAborted);
            await _syncFileStorageService.WriteAllBytesAsync(relativePath, buffer.ToArray(), HttpContext.RequestAborted);

            crewCertificate.DocumentFilePath = relativePath;
            crewCertificate.UpdatedAt = DateTime.UtcNow;
            _context.CrewCertificates.Update(crewCertificate);
            await _context.SaveChangesAsync();

            // Broadcast updated certificate to edge with file path
            await _syncOutbox.EnqueueForCrewAsync(crewCertificate.CrewMemberId, "crew_certificate", id.ToString(), SyncActionType.UPDATE, crewCertificate);

            _logger.LogInformation("Uploaded certificate file for crew certificate: {Id}", id);

            return Ok(new
            {
                message = "Certificate file uploaded successfully",
                documentFilePath = crewCertificate.DocumentFilePath
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading certificate file for {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }
}
