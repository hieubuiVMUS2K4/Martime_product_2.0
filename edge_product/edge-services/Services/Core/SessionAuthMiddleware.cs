using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using MaritimeEdge.Data;

namespace MaritimeEdge.Services.Core;

/// <summary>
/// Session-based Authentication Middleware
/// 
/// Extracts Bearer token from Authorization header, validates session via DB/cache,
/// and populates HttpContext.Items with user identity for downstream use by:
/// - AuditInterceptor (automatic audit trail with real user identity)
/// - AuditLogController (role-based access control)
/// - Any controller needing current user info
/// 
/// Compliance:
/// - ISM Code Chapter 12: Ensures all logged actions are attributed to real users
/// - IMO MSC.428(98): Identity-based audit trail for cyber risk management
/// - ISPS Code: User identification for all security-relevant operations
/// 
/// HttpContext.Items keys set by this middleware:
/// - "UserId"   (long)   - Database user ID
/// - "Username" (string) - Username
/// - "RoleCode" (string) - Role code (ADMIN, CAPTAIN, OFFICER, etc.)
/// - "RoleName" (string) - Role display name
/// - "SessionId"(long)   - Active session ID
/// </summary>
public class SessionAuthMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<SessionAuthMiddleware> _logger;

    // Skip auth entirely for these path prefixes (no token required, no user resolution)
    private static readonly string[] SkipPaths = new[]
    {
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/health",
        "/api/health",
        "/swagger",
        "/uploads",
        "/api/telemetry/navigation", // Sensor data from ESP/MPU6050 (no auth)
    };

    // For these paths, resolve Bearer token if present (to allow authenticated users),
    // but do NOT enforce 401 when no token is found — the InternalAccess policy handles authz.
    private static readonly string[] OptionalAuthPaths = new[]
    {
        "/api/sync",   // Protected by InternalAccess policy; also accessible by authenticated users
        "/api/edge/provisioning", // Protected by InternalAccess policy; also accessible by authenticated users
    };

    public SessionAuthMiddleware(RequestDelegate next, ILogger<SessionAuthMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context, EdgeDbContext dbContext, IMemoryCache cache)
    {
        var path = context.Request.Path.Value ?? "";

        // Skip entirely for public endpoints (no auth needed)
        if (SkipPaths.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase)))
        {
            await _next(context);
            return;
        }

        // Skip for OPTIONS preflight requests (CORS)
        if (context.Request.Method == "OPTIONS")
        {
            await _next(context);
            return;
        }

        // Refresh authenticates with its own refresh token in the controller.
        // Requiring a live access token here prevents recovery after expiry.
        if (HttpMethods.IsPost(context.Request.Method) &&
            path.Equals("/api/auth/refresh", StringComparison.OrdinalIgnoreCase))
        {
            await _next(context);
            return;
        }

        // For optional-auth paths: resolve token if present, but let InternalAccess policy decide authz
        bool isOptionalAuthPath = OptionalAuthPaths.Any(p => path.StartsWith(p, StringComparison.OrdinalIgnoreCase));

        // Extract Bearer token
        var authHeader = context.Request.Headers["Authorization"].FirstOrDefault();
        if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var token = authHeader["Bearer ".Length..].Trim();
            if (!string.IsNullOrEmpty(token))
            {
                bool resolved;
                try
                {
                    resolved = await ResolveUserFromToken(context, dbContext, cache, token);
                }
                catch (AuthSessionUnavailableException)
                {
                    context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
                    await context.Response.WriteAsJsonAsync(new { success = false, message = "Session service temporarily unavailable. Please retry." });
                    return;
                }
                if (resolved)
                {
                    await _next(context);
                    return;
                }
            }
        }

        // No valid token — allow optional-auth paths to proceed (InternalAccess policy handles authz)
        if (isOptionalAuthPath)
        {
            await _next(context);
            return;
        }

        // All other endpoints require a valid Bearer token
        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync("{\"success\":false,\"message\":\"Authentication required. Please provide a valid Bearer token.\"}");
    }

    private async Task<bool> ResolveUserFromToken(HttpContext context, EdgeDbContext dbContext, IMemoryCache cache, string token)
    {
        try
        {
            var cacheKey = $"auth_mw:{token}";

            // Check cache first (5 min TTL to match AuthService)
            if (cache.TryGetValue<SessionUserInfo>(cacheKey, out var cached) && cached != null)
            {
                SetContextItems(context, cached);
                return true;
            }

            // DB lookup - validate session
            var session = await dbContext.UserSessions.AsNoTracking()
                .Where(s => s.AccessToken == token && s.IsActive && s.AccessTokenExpiresAt > DateTime.UtcNow)
                .Select(s => new { s.Id, s.UserId, s.LastActivityAt })
                .FirstOrDefaultAsync();

            if (session == null) return false;

            // Check idle timeout (8 hours = 480 min, same as AuthService)
            if ((DateTime.UtcNow - session.LastActivityAt).TotalMinutes > 480) return false;

            // Get user + role in single query
            var userInfo = await dbContext.Users.AsNoTracking()
                .Where(u => u.Id == session.UserId && u.IsActive)
                .Select(u => new SessionUserInfo
                {
                    UserId = u.Id,
                    Username = u.Username,
                    RoleCode = u.Role != null ? u.Role.RoleCode : "",
                    RoleName = u.Role != null ? u.Role.RoleName : "",
                    SessionId = session.Id
                })
                .FirstOrDefaultAsync();

            if (userInfo == null) return false;

            // Cache for 5 min
            cache.Set(cacheKey, userInfo, TimeSpan.FromMinutes(5));

            SetContextItems(context, userInfo);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to resolve user from session token");
            throw new AuthSessionUnavailableException(ex);
        }
    }

    private static void SetContextItems(HttpContext context, SessionUserInfo info)
    {
        context.Items["UserId"] = info.UserId;
        context.Items["Username"] = info.Username;
        context.Items["RoleCode"] = info.RoleCode;
        context.Items["RoleName"] = info.RoleName;
        context.Items["SessionId"] = info.SessionId;
    }

    /// <summary>
    /// Cached session user info to avoid repeated DB lookups
    /// </summary>
    internal class SessionUserInfo
    {
        public long UserId { get; set; }
        public string Username { get; set; } = "";
        public string RoleCode { get; set; } = "";
        public string RoleName { get; set; } = "";
        public Guid SessionId { get; set; }
    }
}

/// <summary>
/// Extension methods to read user identity from HttpContext.Items
/// (populated by SessionAuthMiddleware)
/// </summary>
public static class HttpContextUserExtensions
{
    public static long? GetUserId(this HttpContext context)
        => context.Items.TryGetValue("UserId", out var val) && val is long id ? id : null;

    public static string? GetUsername(this HttpContext context)
        => context.Items.TryGetValue("Username", out var val) ? val as string : null;

    public static string? GetRoleCode(this HttpContext context)
        => context.Items.TryGetValue("RoleCode", out var val) ? val as string : null;
    
    public static Guid? GetSessionId(this HttpContext context)
        => context.Items.TryGetValue("SessionId", out var val) && val is Guid id ? id : null;

    /// <summary>
    /// Check if the current request is from an authenticated user
    /// </summary>
    public static bool IsAuthenticated(this HttpContext context)
        => context.GetUserId().HasValue;

    /// <summary>
    /// Check if the current user has one of the specified roles
    /// </summary>
    public static bool HasRole(this HttpContext context, params string[] roleCodes)
    {
        var roleCode = context.GetRoleCode();
        return !string.IsNullOrEmpty(roleCode) && roleCodes.Contains(roleCode);
    }
}
