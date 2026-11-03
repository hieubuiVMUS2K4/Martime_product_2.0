using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;

namespace ProductApi.Controllers;

// Application availability switches, independent of rank/user permissions and Edge settings.
[ApiController, Authorize, Route("api/shore-modules")]
public class ShoreModulesController(AppDbContext db) : ControllerBase
{
    public static readonly string[] ModuleKeys = ["catalogs", "crew", "vessels", "tracking", "weather-routing", "sms", "sync", "approval-evidence", "pms", "materials", "reports"];
    public record UpdateModules(int Version, string[] DisabledModules);
    private static object Snapshot(ShoreModuleSettings? state) => new {
        version = state?.Version ?? 0,
        disabledModules = state == null ? Array.Empty<string>() : JsonSerializer.Deserialize<string[]>(state.DisabledModulesJson) ?? [],
        updatedAt = state?.UpdatedAt,
        updatedBy = state?.UpdatedBy
    };

    [HttpGet]
    public async Task<IActionResult> Get() => Ok(Snapshot(await db.ShoreModuleSettings.AsNoTracking().SingleOrDefaultAsync(s => s.Id == 1)));

    [HttpPut, Authorize(Roles = "Admin,SystemAdmin")]
    public async Task<IActionResult> Update([FromBody] UpdateModules input)
    {
        if (input.DisabledModules == null || input.DisabledModules.Any(key => !ModuleKeys.Contains(key)))
            return BadRequest(new { message = "Danh sách module không hợp lệ." });
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(2026110301)");
        var state = await db.ShoreModuleSettings.AsTracking().SingleOrDefaultAsync(s => s.Id == 1);
        if ((state?.Version ?? 0) != input.Version)
            return Conflict(new { message = "Cấu hình đã được thay đổi ở phiên khác. Hãy tải lại trước khi lưu." });
        if (state == null) { state = new ShoreModuleSettings { Id = 1 }; db.ShoreModuleSettings.Add(state); }
        state.DisabledModulesJson = JsonSerializer.Serialize(input.DisabledModules.Distinct().Order());
        state.Version++;
        state.UpdatedAt = DateTime.UtcNow;
        state.UpdatedBy = User.Identity?.Name ?? User.FindFirst("username")?.Value ?? "Admin";
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(Snapshot(state));
    }
}
