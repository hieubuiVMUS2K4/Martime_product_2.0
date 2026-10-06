using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Models;

namespace MaritimeEdge.Controllers.Crew;

[Route("api/[controller]")]
[ApiController]
public class RanksController : ControllerBase
{
    private readonly EdgeDbContext _context;
    private readonly ILogger<RanksController> _logger;

    public RanksController(EdgeDbContext context, ILogger<RanksController> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Get all ranks
    /// GET /api/ranks
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<Rank>>> GetRanks([FromQuery] bool includeInactive = false)
    {
        try
        {
            var query = _context.Ranks.AsQueryable();
            
            if (!includeInactive)
            {
                query = query.Where(r => r.IsActive);
            }
            
            return await query
                .OrderBy(r => r.SortOrder)
                .ThenBy(r => r.RankName)
                .ToListAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting ranks");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get rank by ID
    /// GET /api/ranks/{id}
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<Rank>> GetRank(int id)
    {
        try
        {
            var rank = await _context.Ranks.FindAsync(id);

            if (rank == null)
            {
                return NotFound(new { error = "Rank not found" });
            }

            return rank;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting rank {RankId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Reject writes to the Shore-managed rank catalog
    /// POST /api/ranks
    /// </summary>
    [HttpPost]
    public Task<ActionResult<Rank>> CreateRank(Rank rank)
    {
        return Task.FromResult<ActionResult<Rank>>(StatusCode(405, new { error = "This catalog is managed on shore. Edge access is read-only.", code = "shore_managed_catalog" }));
    }

    /// <summary>
    /// Reject rank updates on Edge
    /// PUT /api/ranks/{id}
    /// </summary>
    [HttpPut("{id}")]
    public Task<IActionResult> UpdateRank(int id, Rank rank)
    {
        return Task.FromResult<IActionResult>(StatusCode(405, new { error = "This catalog is managed on shore. Edge access is read-only.", code = "shore_managed_catalog" }));
    }

    /// <summary>
    /// Reject rank deletion on Edge
    /// DELETE /api/ranks/{id}
    /// </summary>
    [HttpDelete("{id}")]
    public Task<IActionResult> DeleteRank(int id)
    {
        return Task.FromResult<IActionResult>(StatusCode(405, new { error = "This catalog is managed on shore. Edge access is read-only.", code = "shore_managed_catalog" }));
    }

    /// <summary>
    /// Reject permanent rank deletion on Edge
    /// DELETE /api/ranks/{id}/permanent
    /// </summary>
    [HttpDelete("{id}/permanent")]
    public Task<IActionResult> PermanentDeleteRank(int id)
    {
        return Task.FromResult<IActionResult>(StatusCode(405, new { error = "This catalog is managed on shore. Edge access is read-only.", code = "shore_managed_catalog" }));
    }

}
