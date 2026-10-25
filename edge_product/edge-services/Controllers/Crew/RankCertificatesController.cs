using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Models;

namespace MaritimeEdge.Controllers.Crew;

[Route("api/rank-certificates")]
[ApiController]
public class RankCertificatesController : ControllerBase
{
    private readonly EdgeDbContext _context;
    private readonly ILogger<RankCertificatesController> _logger;

    public RankCertificatesController(EdgeDbContext context, ILogger<RankCertificatesController> logger)
    {
        _context = context;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<RankCertificate>>> GetAll()
    {
        var requirements = await _context.RankCertificates.AsNoTracking()
            .Include(rc => rc.Certificate).OrderBy(rc => rc.RankId).ThenBy(rc => rc.CertificateId).ToListAsync();
        return Ok(requirements);
    }

    /// <summary>
    /// Get all rank-certificate associations for a specific certificate
    /// GET /api/rank-certificates/certificate/{certificateId}
    /// </summary>
    [HttpGet("certificate/{certificateId}")]
    public async Task<ActionResult<IEnumerable<RankCertificate>>> GetByCertificate(int certificateId)
    {
        try
        {
            var rankCertificates = await _context.RankCertificates
                .Where(rc => rc.CertificateId == certificateId)
                .Include(rc => rc.Rank)
                .Include(rc => rc.Certificate)
                .ToListAsync();

            return Ok(rankCertificates);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting rank certificates for certificate {CertificateId}", certificateId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get all rank-certificate associations for a specific rank
    /// GET /api/rank-certificates/rank/{rankId}
    /// </summary>
    [HttpGet("rank/{rankId}")]
    public async Task<ActionResult<IEnumerable<RankCertificate>>> GetByRank(int rankId)
    {
        try
        {
            var rankCertificates = await _context.RankCertificates
                .Where(rc => rc.RankId == rankId)
                .Include(rc => rc.Rank)
                .Include(rc => rc.Certificate)
                .ToListAsync();

            return Ok(rankCertificates);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting rank certificates for rank {RankId}", rankId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ────────────────────────────────────────────────────────────────────
    // Chỉ đọc. Bảng nối chứng chỉ–chức danh (STCW) do BỜ làm chủ, phát xuống
    // mọi tàu kèm loại chứng chỉ tương ứng. Xem ghi chú ở CertificatesController.
    // ────────────────────────────────────────────────────────────────────
}
