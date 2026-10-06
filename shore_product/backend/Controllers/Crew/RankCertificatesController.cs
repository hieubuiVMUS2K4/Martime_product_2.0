using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Sync;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Services.Sync;

namespace ProductApi.Controllers.Crew;

[ApiController]
[Route("api/rank-certificates")]
[Authorize(Policy = "InternalAccess")]
public class RankCertificatesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly ISyncOutboxService _outbox;

    public RankCertificatesController(AppDbContext context, ISyncOutboxService outbox)
    {
        _context = context;
        _outbox = outbox;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var rows = await _context.RankCertificates.AsNoTracking()
            .Select(rc => new { rc.Id, rc.RankId, rc.CertificateId }).ToListAsync();
        return Ok(rows);
    }

    // Replace only this rank's requirements; preserve unchanged mapping IDs and
    // commit changes and their sync events together. An empty list removes all requirements.
    [HttpPut("rank/{rankId:int}")]
    public async Task<IActionResult> UpdateRequirements(int rankId, [FromBody] RankCertificateRequirements request)
    {
        if (!await _context.Ranks.AnyAsync(r => r.Id == rankId && r.IsActive))
            return NotFound(new { error = "Rank not found" });
        if (request.CertificateIds == null)
            return BadRequest(new { error = "certificateIds is required" });
        var wanted = request.CertificateIds.Distinct().ToHashSet();
        var existing = await _context.RankCertificates.AsTracking().Where(rc => rc.RankId == rankId).ToListAsync();
        var kept = existing.Select(rc => rc.CertificateId).ToHashSet();
        var addedIds = wanted.Except(kept).ToList();
        if (await _context.CrewCertificateTypes.CountAsync(c => addedIds.Contains(c.Id) && c.IsActive) != addedIds.Count)
            return BadRequest(new { error = "Certificates must exist and be active" });

        await using var transaction = await _context.Database.BeginTransactionAsync();
        var removed = existing.Where(rc => !wanted.Contains(rc.CertificateId)).ToList();
        _context.RankCertificates.RemoveRange(removed);
        var added = addedIds.Select(id => new RankCertificate {
            RankId = rankId, CertificateId = id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
        }).ToList();
        _context.RankCertificates.AddRange(added);
        // This endpoint writes explicit CREATE/DELETE events below; avoid the
        // DbContext also generating a second snapshot for the same change.
        var previousSuppression = _context.SuppressAutoOutbox;
        _context.SuppressAutoOutbox = true;
        try { await _context.SaveChangesAsync(); }
        finally { _context.SuppressAutoOutbox = previousSuppression; }
        foreach (var rc in removed)
            await _outbox.BroadcastAsync("rank_certificate", rc.Id.ToString(), SyncActionType.DELETE, new { rc.Id });
        foreach (var rc in added)
            await _outbox.BroadcastAsync("rank_certificate", rc.Id.ToString(), SyncActionType.CREATE, rc);
        await transaction.CommitAsync();
        return Ok(new { rankId, added = added.Count, removed = removed.Count, certificateIds = wanted.OrderBy(id => id) });
    }
}

public sealed class RankCertificateRequirements
{
    public List<int>? CertificateIds { get; set; }
}
