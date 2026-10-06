using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;

namespace ProductApi.Controllers.Crew;

/// <summary>
/// Shore Ranks reference data controller.
/// </summary>
[ApiController]
[Route("api/ranks")]
[Authorize(Policy = "InternalAccess")]
public class RanksController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly ILogger<RanksController> _logger;

    public RanksController(AppDbContext context, ILogger<RanksController> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>GET /api/ranks — Get all ranks.</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try
        {
            var ranks = await _context.Ranks
                .Where(r => r.IsActive)
                .OrderBy(r => r.SortOrder)
                .Select(r => new
                {
                    r.Id,
                    r.RankCode,
                    r.RankName,
                    r.Department,
                    r.Level,
                    r.SortOrder,
                    r.IsActive
                })
                .ToListAsync();

            return Ok(ranks);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting ranks");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>GET /api/ranks/{id} — Get rank by ID.</summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        try
        {
            var rank = await _context.Ranks.FindAsync(id);
            if (rank == null) return NotFound(new { error = "Rank not found" });
            return Ok(new
            {
                rank.Id,
                rank.RankCode,
                rank.RankName,
                rank.Department,
                rank.Level,
                rank.SortOrder,
                rank.IsActive
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting rank {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>POST /api/ranks — Create a new rank.</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] RankRequest request)
    {
        try
        {
            var rank = new Maritime.Shared.Models.Crew.Rank
            {
                RankCode = request.RankCode,
                RankName = request.RankName,
                Department = request.Department ?? "DECK",
                Level = request.Level,
                SortOrder = request.SortOrder ?? 0,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.Ranks.Add(rank);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetById), new { id = rank.Id }, new
            {
                rank.Id,
                rank.RankCode,
                rank.RankName,
                rank.Department,
                rank.Level,
                rank.SortOrder,
                rank.IsActive
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating rank");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>PUT /api/ranks/{id} — Update a rank.</summary>
    [HttpPut("{id:int}")]
    public async Task<IActionResult> Update(int id, [FromBody] RankRequest request)
    {
        try
        {
            var rank = await _context.Ranks.FindAsync(id);
            if (rank == null) return NotFound(new { error = "Rank not found" });

            rank.RankCode = request.RankCode;
            rank.RankName = request.RankName;
            rank.Department = request.Department ?? rank.Department;
            rank.Level = request.Level;
            rank.SortOrder = request.SortOrder ?? rank.SortOrder;
            rank.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            return Ok(new
            {
                rank.Id,
                rank.RankCode,
                rank.RankName,
                rank.Department,
                rank.Level,
                rank.SortOrder,
                rank.IsActive
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating rank {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>DELETE /api/ranks/{id} — Deactivate a rank.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            var rank = await _context.Ranks.FindAsync(id);
            if (rank == null) return NotFound(new { error = "Rank not found" });

            rank.IsActive = false;
            rank.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Rank deactivated" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting rank {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }
}

public class RankRequest
{
    public string RankCode { get; set; } = "";
    public string RankName { get; set; } = "";
    public string? Department { get; set; }
    public string? Level { get; set; }
    public int? SortOrder { get; set; }
}
