using System.Text.Json;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Controllers.Core;

[ApiController]
[Route("api/permissions")]
public sealed class RankPermissionsController(EdgeDbContext db, RankPermissionService permissions, IConfiguration? configuration = null) : ControllerBase
{
    [HttpGet("me")]
    public async Task<IActionResult> Me() => Ok(await Current());

    private Task<EffectivePermissions> Current() => HttpContext.Items["EffectivePermissions"] is EffectivePermissions current
        ? Task.FromResult(current) : permissions.GetAsync(HttpContext.GetUserId()!.Value);
    private async Task<bool> IsAdmin() => (await Current()).IsAdmin;
    private bool Rework => configuration?.GetValue<bool>("Pms:ReworkApiEnabled") == true;
    private string[] Grants(string? json) => PermissionRegistry.ForPmsModel(JsonSerializer.Deserialize<string[]>(json ?? "[]") ?? [], Rework);

    [HttpGet("catalog")]
    public IActionResult Catalog() => Ok(PermissionRegistry.Data.Modules.Where(m => Rework ? m.Code != "pms.config" : m.Code != "pms.jobs")
        .Select(m => Rework && m.Code == "pms.work" ? m with { Name = "Work Order" } : m).ToArray());

    [HttpGet("ranks")]
    public async Task<IActionResult> Ranks()
    {
        if (!await IsAdmin()) return StatusCode(403);
        var configs = await db.RankPermissionConfigs.AsNoTracking().ToDictionaryAsync(c => c.RankId);
        var ranks = await db.Ranks.AsNoTracking().Where(r => r.IsActive).OrderBy(r => r.SortOrder).ThenBy(r => r.RankName)
            .Select(r => new { r.Id, r.RankCode, r.RankName, r.Department }).ToListAsync();
        var rows = ranks.Select(r =>
        {
            configs.TryGetValue(r.Id, out var config);
            return new
            {
                r.Id, r.RankCode, r.RankName, r.Department, IsConfigured = config != null,
                Version = config?.Version ?? 0,
                Grants = Grants(config?.GrantsJson)
            };
        }).Cast<object>().ToList();
        var adminRole = await db.Roles.AsNoTracking().SingleOrDefaultAsync(r => r.IsActive && r.RoleCode.ToUpper() == "ADMIN");
        if (adminRole != null)
        {
            var adminConfig = await db.RolePermissionConfigs.AsNoTracking().SingleOrDefaultAsync(c => c.RoleId == adminRole.Id);
            rows.Insert(0, new { Id = 0, RankCode = "ADMIN", RankName = "Admin", Department = "SYSTEM", IsConfigured = adminConfig != null,
                Version = adminConfig?.Version ?? 0, Grants = PermissionRegistry.AdminGrants(adminConfig?.GrantsJson) });
        }
        return Ok(rows);
    }

    [HttpGet("ranks/{rankId:int}")]
    public async Task<IActionResult> Get(int rankId)
    {
        if (!await IsAdmin()) return StatusCode(403);
        if (rankId == 0)
        {
            var role = await db.Roles.AsNoTracking().SingleOrDefaultAsync(r => r.IsActive && r.RoleCode.ToUpper() == "ADMIN");
            if (role == null) return NotFound();
            var admin = await db.RolePermissionConfigs.AsNoTracking().SingleOrDefaultAsync(c => c.RoleId == role.Id);
            return Ok(new { Version = admin?.Version ?? 0, Grants = PermissionRegistry.AdminGrants(admin?.GrantsJson) });
        }
        if (!await db.Ranks.AnyAsync(r => r.Id == rankId && r.IsActive)) return NotFound();
        var config = await db.RankPermissionConfigs.AsNoTracking().SingleOrDefaultAsync(c => c.RankId == rankId);
        return Ok(new { Version = config?.Version ?? 0, Grants = Grants(config?.GrantsJson) });
    }

    public record SavePermissions(long Version, string[] Grants);
    [HttpPut("ranks/{rankId:int}")]
    public async Task<IActionResult> Save(int rankId, SavePermissions request)
    {
        if (!await IsAdmin()) return StatusCode(403);
        if (request.Grants == null || request.Grants.Any(g => !PermissionRegistry.Codes.Contains(g)))
            return BadRequest(new { error = "Có mã quyền không hợp lệ." });
        if (!PermissionRegistry.HasDashboardAccess(request.Grants))
            return BadRequest(new { error = "Phải bật ít nhất một mục Tổng quan tàu hoặc Bảng điều khiển." });
        if (rankId == 0) return await SaveAdmin(request);
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Serialize first saves too; optimistic version detects stale browser edits.
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({2026100602}, {rankId})");
        if (!await db.Ranks.AnyAsync(r => r.Id == rankId && r.IsActive)) return NotFound();
        var config = await db.RankPermissionConfigs.SingleOrDefaultAsync(c => c.RankId == rankId);
        if ((config?.Version ?? 0) != request.Version) return Conflict(new { error = "Cấu hình đã được thay đổi. Hãy tải lại trước khi lưu." });
        var before = config?.GrantsJson ?? "[]";
        var grants = PermissionRegistry.ForPmsModel(request.Grants, Rework).Order().ToArray();
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
    private async Task<IActionResult> SaveAdmin(SavePermissions request)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({2026100602}, {0})");
        var role = await db.Roles.AsNoTracking().SingleOrDefaultAsync(r => r.IsActive && r.RoleCode.ToUpper() == "ADMIN");
        if (role == null) return NotFound();
        var config = await db.RolePermissionConfigs.SingleOrDefaultAsync(c => c.RoleId == role.Id);
        if ((config?.Version ?? 0) != request.Version)
            return Conflict(new { error = "Cấu hình đã được thay đổi. Hãy tải lại trước khi lưu." });
        var before = config?.GrantsJson ?? "[]";
        if (config == null) { config = new() { RoleId = role.Id, Version = 0 }; db.RolePermissionConfigs.Add(config); }
        config.GrantsJson = JsonSerializer.Serialize(PermissionRegistry.ConfigurableGrants(request.Grants).Where(PermissionRegistry.IsDashboardPermission).Order());
        config.Version++;
        config.UpdatedAt = DateTime.UtcNow;
        config.UpdatedBy = HttpContext.GetUserId()!.Value;
        db.SystemLogs.Add(new SystemLog { Category = "SECURITY", Action = "ADMIN_DASHBOARDS_CHANGED", Level = "INFO",
            UserId = config.UpdatedBy, Username = HttpContext.GetUsername(), EntityType = "RolePermissionConfig",
            EntityId = role.Id.ToString(), OldValues = before, NewValues = config.GrantsJson });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(new { config.Version, Grants = PermissionRegistry.AdminGrants(config.GrantsJson) });
    }

}
