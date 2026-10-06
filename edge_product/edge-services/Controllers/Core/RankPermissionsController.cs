using System.Text.Json;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Controllers.Core;

[ApiController]
[Route("api/permissions")]
public sealed class RankPermissionsController(EdgeDbContext db, RankPermissionService permissions) : ControllerBase
{
    [HttpGet("me")]
    public async Task<IActionResult> Me() => Ok(await Current());

    private Task<EffectivePermissions> Current() => HttpContext.Items["EffectivePermissions"] is EffectivePermissions current
        ? Task.FromResult(current) : permissions.GetAsync(HttpContext.GetUserId()!.Value);
    private async Task<bool> IsAdmin() => (await Current()).IsAdmin;

    [HttpGet("catalog")]
    public IActionResult Catalog() => Ok(PermissionRegistry.Data.Modules);

    [HttpGet("ranks")]
    public async Task<IActionResult> Ranks()
    {
        if (!await IsAdmin()) return StatusCode(403);
        var configs = await db.RankPermissionConfigs.AsNoTracking().ToDictionaryAsync(c => c.RankId);
        var ranks = await db.Ranks.AsNoTracking().Where(r => r.IsActive).OrderBy(r => r.SortOrder).ThenBy(r => r.RankName)
            .Select(r => new { r.Id, r.RankCode, r.RankName, r.Department }).ToListAsync();
        return Ok(ranks.Select(r =>
        {
            configs.TryGetValue(r.Id, out var config);
            return new
            {
                r.Id, r.RankCode, r.RankName, r.Department, IsConfigured = config != null,
                Version = config?.Version ?? 0,
                Grants = config == null ? Array.Empty<string>() : JsonSerializer.Deserialize<string[]>(config.GrantsJson) ?? []
            };
        }).ToArray());
    }

    [HttpGet("ranks/{rankId:int}")]
    public async Task<IActionResult> Get(int rankId)
    {
        if (!await IsAdmin()) return StatusCode(403);
        if (!await db.Ranks.AnyAsync(r => r.Id == rankId && r.IsActive)) return NotFound();
        var config = await db.RankPermissionConfigs.AsNoTracking().SingleOrDefaultAsync(c => c.RankId == rankId);
        return Ok(new { Version = config?.Version ?? 0, Grants = config == null ? Array.Empty<string>() : JsonSerializer.Deserialize<string[]>(config.GrantsJson) });
    }

    public record SavePermissions(long Version, string[] Grants);
    [HttpPut("ranks/{rankId:int}")]
    public async Task<IActionResult> Save(int rankId, SavePermissions request)
    {
        if (!await IsAdmin()) return StatusCode(403);
        if (request.Grants == null || request.Grants.Any(g => !PermissionRegistry.Codes.Contains(g)))
            return BadRequest(new { error = "Có mã quyền không hợp lệ." });
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Serialize first saves too; optimistic version detects stale browser edits.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({2026100602}, {rankId})");
        if (!await db.Ranks.AnyAsync(r => r.Id == rankId && r.IsActive)) return NotFound();
        var config = await db.RankPermissionConfigs.SingleOrDefaultAsync(c => c.RankId == rankId);
        if ((config?.Version ?? 0) != request.Version) return Conflict(new { error = "Cấu hình đã được thay đổi. Hãy tải lại trước khi lưu." });
        var before = config?.GrantsJson ?? "[]";
        var grants = request.Grants.Distinct().Order().ToArray();
        if (config == null) { config = new() { RankId = rankId, Version = 0 }; db.RankPermissionConfigs.Add(config); }
        config.GrantsJson = JsonSerializer.Serialize(grants);
        config.Version++;
        config.UpdatedAt = DateTime.UtcNow;
        config.UpdatedBy = HttpContext.GetUserId()!.Value;
        db.SystemLogs.Add(new SystemLog
        {
            Category = "SECURITY", Action = "RANK_PERMISSIONS_CHANGED", Level = "INFO",
            UserId = config.UpdatedBy, Username = HttpContext.GetUsername(), EntityType = "RankPermissionConfig",
            EntityId = rankId.ToString(), OldValues = before, NewValues = config.GrantsJson
        });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(new { config.Version, Grants = grants });
    }
}
