using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Services.Core;

namespace MaritimeEdge.Controllers.Core;

/// <summary>
/// Audit Log Controller - Truy vấn nhật ký hoạt động hệ thống
/// 
/// Compliance:
/// - ISM Code Chapter 12: Records - "all ISM related activities shall be documented"
/// - IMO MSC.428(98): Maritime Cyber Risk Management - audit trail
/// - SOLAS Chapter IX: ISM Code implementation
/// 
/// Access: Admin + Captain (Master) only
/// </summary>
[ApiController]
[Route("api/audit-logs")]
public class AuditLogController : ControllerBase
{
    private readonly EdgeDbContext _context;
    private readonly ILogger<AuditLogController> _logger;

    // Allowed role codes (ISM: Master + DPA/Admin have audit access)
    private static readonly HashSet<string> AllowedRoles = new(StringComparer.OrdinalIgnoreCase)
    {
        "ADMIN", "CAPTAIN"
    };

    public AuditLogController(EdgeDbContext context, ILogger<AuditLogController> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// GET /api/audit-logs
    /// Paginated audit log query with filters
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAuditLogs(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? category = null,
        [FromQuery] string? action = null,
        [FromQuery] string? level = null,
        [FromQuery] string? entityType = null,
        [FromQuery] string? username = null,
        [FromQuery] string? search = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null)
    {
        // Authorization check
        var authResult = await AuthorizeAdminOrCaptain();
        if (authResult != null) return authResult;

        try
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 20;
            if (pageSize > 200) pageSize = 200;

            var query = _context.SystemLogs.AsNoTracking().AsQueryable();

            // Apply filters
            if (!string.IsNullOrWhiteSpace(category))
                query = query.Where(l => l.Category == category);
            if (!string.IsNullOrWhiteSpace(action))
                query = query.Where(l => l.Action == action);
            if (!string.IsNullOrWhiteSpace(level))
                query = query.Where(l => l.Level == level);
            if (!string.IsNullOrWhiteSpace(entityType))
                query = query.Where(l => l.EntityType == entityType);
            if (!string.IsNullOrWhiteSpace(username))
                query = query.Where(l => l.Username != null && l.Username.Contains(username));
            if (!string.IsNullOrWhiteSpace(search))
                query = query.Where(l =>
                    (l.Message != null && l.Message.Contains(search)) ||
                    (l.EntityType != null && l.EntityType.Contains(search)) ||
                    (l.EntityId != null && l.EntityId.Contains(search)) ||
                    (l.Username != null && l.Username.Contains(search)));
            if (from.HasValue)
                query = query.Where(l => l.Timestamp >= from.Value);
            if (to.HasValue)
                query = query.Where(l => l.Timestamp <= to.Value);

            var totalCount = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

            var logs = await query
                .OrderByDescending(l => l.Timestamp)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(l => new
                {
                    l.Id,
                    l.Timestamp,
                    l.Category,
                    l.Action,
                    l.Level,
                    l.Message,
                    l.UserId,
                    l.Username,
                    l.IpAddress,
                    l.EntityType,
                    l.EntityId,
                    l.OldValues,
                    l.NewValues,
                    l.Result,
                    l.DurationMs
                })
                .ToListAsync();

            return Ok(new
            {
                success = true,
                data = logs,
                totalCount,
                totalPages,
                currentPage = page,
                pageSize
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching audit logs");
            return StatusCode(500, new { success = false, message = "Error fetching audit logs" });
        }
    }

    /// <summary>
    /// GET /api/audit-logs/stats
    /// Dashboard statistics for audit logs
    /// </summary>
    [HttpGet("stats")]
    public async Task<IActionResult> GetAuditStats(
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null)
    {
        var authResult = await AuthorizeAdminOrCaptain();
        if (authResult != null) return authResult;

        try
        {
            var startDate = from ?? DateTime.UtcNow.AddDays(-7);
            var endDate = to ?? DateTime.UtcNow;

            // Single query: fetch all logs in range with minimal projection
            var logs = await _context.SystemLogs.AsNoTracking()
                .Where(l => l.Timestamp >= startDate && l.Timestamp <= endDate)
                .Select(l => new { l.Category, l.Action, l.Level, l.Username, l.EntityType })
                .ToListAsync();

            var totalCount = logs.Count;

            var byCategory = logs
                .GroupBy(l => l.Category)
                .Select(g => new { Category = g.Key, Count = g.Count() })
                .ToList();

            var byAction = logs
                .Where(l => l.Category == "DATA")
                .GroupBy(l => l.Action)
                .Select(g => new { Action = g.Key, Count = g.Count() })
                .ToList();

            var byLevel = logs
                .GroupBy(l => l.Level)
                .Select(g => new { Level = g.Key, Count = g.Count() })
                .ToList();

            var topUsers = logs
                .Where(l => l.Username != null)
                .GroupBy(l => l.Username)
                .Select(g => new { Username = g.Key, Count = g.Count() })
                .OrderByDescending(g => g.Count)
                .Take(10)
                .ToList();

            var topEntities = logs
                .Where(l => l.EntityType != null && l.Category == "DATA")
                .GroupBy(l => l.EntityType)
                .Select(g => new { EntityType = g.Key, Count = g.Count() })
                .OrderByDescending(g => g.Count)
                .Take(10)
                .ToList();

            return Ok(new
            {
                success = true,
                totalCount,
                period = new { from = startDate, to = endDate },
                byCategory,
                byAction,
                byLevel,
                topUsers,
                topEntities
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching audit stats");
            return StatusCode(500, new { success = false, message = "Error fetching audit stats" });
        }
    }

    /// <summary>
    /// GET /api/audit-logs/entity-types
    /// Get distinct entity types for filter dropdown
    /// </summary>
    [HttpGet("entity-types")]
    public async Task<IActionResult> GetEntityTypes()
    {
        var authResult = await AuthorizeAdminOrCaptain();
        if (authResult != null) return authResult;

        try
        {
            var types = await _context.SystemLogs.AsNoTracking()
                .Where(l => l.EntityType != null)
                .Select(l => l.EntityType!)
                .Distinct()
                .OrderBy(t => t)
                .ToListAsync();

            return Ok(new { success = true, entityTypes = types });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching entity types");
            return StatusCode(500, new { success = false, message = "Error fetching entity types" });
        }
    }

    /// <summary>
    /// GET /api/audit-logs/{id}
    /// Get single log entry with full detail (including OldValues/NewValues)
    /// </summary>
    [HttpGet("{id}")]
    public async Task<IActionResult> GetAuditLogById(long id)
    {
        var authResult = await AuthorizeAdminOrCaptain();
        if (authResult != null) return authResult;

        try
        {
            var log = await _context.SystemLogs.AsNoTracking()
                .Where(l => l.Id == id)
                .FirstOrDefaultAsync();

            if (log == null)
                return NotFound(new { success = false, message = "Log entry not found" });

            return Ok(new { success = true, data = log });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching audit log {Id}", id);
            return StatusCode(500, new { success = false, message = "Error fetching audit log" });
        }
    }

    /// <summary>
    /// POST /api/audit-logs/cleanup
    /// Manual log cleanup (Admin only)
    /// </summary>
    [HttpPost("cleanup")]
    public async Task<IActionResult> CleanupLogs([FromQuery] int retentionDays = 90)
    {
        var authResult = await AuthorizeAdminOnly();
        if (authResult != null) return authResult;

        try
        {
            if (retentionDays < 30) retentionDays = 30; // Minimum 30 days per ISM Code

            var cutoffDate = DateTime.UtcNow.AddDays(-retentionDays);

            // Keep SECURITY & CRITICAL logs double the retention
            var normalDeleted = await _context.SystemLogs
                .Where(l => l.Timestamp < cutoffDate &&
                    l.Category != "SECURITY" && l.Level != "CRITICAL")
                .ExecuteDeleteAsync();

            var securityCutoff = DateTime.UtcNow.AddDays(-retentionDays * 2);
            var securityDeleted = await _context.SystemLogs
                .Where(l => l.Timestamp < securityCutoff)
                .ExecuteDeleteAsync();

            var total = normalDeleted + securityDeleted;

            _logger.LogInformation("Audit log cleanup: {Total} records deleted (retention: {Days}d)", total, retentionDays);

            return Ok(new
            {
                success = true,
                message = $"Cleaned up {total} old log entries",
                deletedCount = total,
                retentionDays,
                securityRetentionDays = retentionDays * 2
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during audit log cleanup");
            return StatusCode(500, new { success = false, message = "Error during cleanup" });
        }
    }

    // ========================================
    // Authorization Helpers
    // ========================================

    /// <summary>
    /// Validates that the current user has ADMIN or CAPTAIN role.
    /// Returns null if authorized, or an IActionResult to return if not.
    /// </summary>
    private async Task<IActionResult?> AuthorizeAdminOrCaptain()
    {
        // The global rank filter has already checked the endpoint's current permission.
        if (HttpContext.Items["EffectivePermissions"] is EffectivePermissions) return null;
        var roleCode = await ResolveUserRoleCode();
        if (roleCode == null)
            return Unauthorized(new { success = false, message = "Authentication required" });

        if (!AllowedRoles.Contains(roleCode))
            return StatusCode(403, new { success = false, message = "Access denied. Admin or Captain role required." });

        return null;
    }

    private async Task<IActionResult?> AuthorizeAdminOnly()
    {
        var roleCode = await ResolveUserRoleCode();
        if (roleCode == null)
            return Unauthorized(new { success = false, message = "Authentication required" });

        if (!string.Equals(roleCode, "ADMIN", StringComparison.OrdinalIgnoreCase))
            return StatusCode(403, new { success = false, message = "Access denied. Admin role required." });

        return null;
    }

    /// <summary>
    /// Resolve user role from HttpContext.Items (populated by SessionAuthMiddleware)
    /// Falls back to direct DB lookup if middleware didn't run
    /// </summary>
    private async Task<string?> ResolveUserRoleCode()
    {
        // 1. Primary: From SessionAuthMiddleware (zero DB cost)
        var roleCode = HttpContext.GetRoleCode();
        if (!string.IsNullOrEmpty(roleCode)) return roleCode;

        // 2. Fallback: Direct token lookup (if middleware was skipped)
        var authHeader = Request.Headers["Authorization"].FirstOrDefault();
        if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var token = authHeader["Bearer ".Length..].Trim();
            var session = await _context.UserSessions.AsNoTracking()
                .Where(s => s.AccessToken == token && s.IsActive)
                .FirstOrDefaultAsync();

            if (session != null)
            {
                var user = await _context.Users.AsNoTracking()
                    .Include(u => u.Role)
                    .FirstOrDefaultAsync(u => u.Id == session.UserId && u.IsActive);
                return user?.Role?.RoleCode;
            }
        }

        return null;
    }
}
