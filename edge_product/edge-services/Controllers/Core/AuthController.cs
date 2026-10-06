using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Services.Core;

namespace MaritimeEdge.Controllers.Core;

/// <summary>
/// Authentication & Authorization Controller
/// Chuẩn hàng hải ISPS/ISM/IMO MSC.428
/// 
/// Features:
/// - Login/Logout với session tracking  
/// - Token refresh
/// - Password management (change, reset)
/// - User/Role CRUD
/// - Session management (active sessions, revoke)
/// - System log query
/// - Legacy mobile support
/// </summary>
[ApiController]
[Route("api/auth")]
[Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("auth")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly ISystemLogService _systemLog;
    private readonly EdgeDbContext _context;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IAuthService authService,
        ISystemLogService systemLog,
        EdgeDbContext context,
        ILogger<AuthController> logger)
    {
        _authService = authService;
        _systemLog = systemLog;
        _context = context;
        _logger = logger;
    }

    // ========================================
    // AUTHENTICATION APIs
    // ========================================

    /// <summary>
    /// Đăng nhập
    /// POST /api/auth/login
    /// </summary>
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var ipAddress = GetClientIpAddress();
        var userAgent = Request.Headers["User-Agent"].FirstOrDefault();

        var result = await _authService.LoginAsync(request, ipAddress, userAgent);

        if (!result.Success)
        {
            return Unauthorized(result);
        }

        return Ok(result);
    }

    /// <summary>
    /// Đăng xuất - Kết thúc session, ghi audit trail
    /// POST /api/auth/logout
    /// </summary>
    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] LogoutRequest? request = null)
    {
        var accessToken = request?.AccessToken ?? GetBearerToken();

        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return Ok(new LogoutResponse { Success = true, Message = "Không có session hoạt động" });
        }

        var result = await _authService.LogoutAsync(accessToken, request?.Reason);
        return Ok(result);
    }

    /// <summary>
    /// Refresh access token
    /// POST /api/auth/refresh
    /// </summary>
    [HttpPost("refresh")]
    public async Task<IActionResult> RefreshToken([FromBody] TokenRefreshRequest request)
    {
        var ipAddress = GetClientIpAddress();
        TokenRefreshResponse result;
        try { result = await _authService.RefreshTokenAsync(request.RefreshToken, ipAddress); }
        catch (AuthSessionUnavailableException)
        {
            return StatusCode(503, new { success = false, message = "Dịch vụ phiên đăng nhập tạm thời không khả dụng. Vui lòng thử lại." });
        }

        if (!result.Success)
        {
            return Unauthorized(new { success = false, message = result.Message });
        }

        return Ok(result);
    }

    /// <summary>
    /// Validate current session (middleware helper)
    /// GET /api/auth/validate
    /// </summary>
    [HttpGet("validate")]
    public async Task<IActionResult> ValidateSession()
    {
        var accessToken = GetBearerToken();
        if (string.IsNullOrWhiteSpace(accessToken))
        {
            return Unauthorized(new { isValid = false, message = "Không có access token" });
        }

        ValidateSessionResponse result;
        try { result = await _authService.ValidateSessionAsync(accessToken); }
        catch (AuthSessionUnavailableException)
        {
            return StatusCode(503, new { isValid = false, message = "Dịch vụ phiên đăng nhập tạm thời không khả dụng. Vui lòng thử lại." });
        }

        if (!result.IsValid)
        {
            return Unauthorized(new { isValid = false, message = result.Message });
        }

        // Update activity timestamp
        await _authService.UpdateSessionActivityAsync(accessToken);

        return Ok(result);
    }

    // ========================================
    // PASSWORD MANAGEMENT APIs
    // ========================================

    /// <summary>
    /// Đổi mật khẩu
    /// POST /api/auth/change-password
    /// </summary>
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.NewPassword) || request.NewPassword.Length < 6)
        {
            return Ok(new { success = false, message = "Mật khẩu mới phải có ít nhất 6 ký tự" });
        }

        if (request.NewPassword != request.ConfirmPassword)
        {
            return Ok(new { success = false, message = "Mật khẩu xác nhận không khớp" });
        }

        var (success, message) = await _authService.ChangePasswordAsync(request.UserId, request.OldPassword, request.NewPassword);
        return Ok(new { success, message });
    }

    /// <summary>
    /// Reset mật khẩu về mặc định (từ ngày sinh) - Admin only
    /// POST /api/auth/reset-password
    /// </summary>
    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
    {
        if (!HttpContext.HasRole("ADMIN", "CAPTAIN"))
            return StatusCode(403, new { success = false, message = "Chỉ Admin/Captain mới có quyền reset mật khẩu" });

        var result = await _authService.ResetPasswordAsync(request.Username);
        return Ok(result);
    }

    // ========================================
    // USER MANAGEMENT APIs
    // ========================================

    /// <summary>
    /// Tạo user cho crew member - Admin only
    /// POST /api/auth/create-user
    /// </summary>
    [HttpPost("create-user")]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
    {
        if (!HttpContext.HasRole("ADMIN", "CAPTAIN"))
            return StatusCode(403, new { success = false, message = "Chỉ Admin/Captain mới có quyền tạo user" });

        var result = await _authService.CreateUserForCrewAsync(request.CrewId, request.RoleId);
        return Ok(result);
    }

    /// <summary>
    /// Lấy danh sách tất cả users
    /// GET /api/auth/users
    /// </summary>
    [HttpGet("users")]
    public async Task<IActionResult> GetAllUsers()
    {
        var users = await _authService.GetAllUsersAsync();
        return Ok(new { success = true, users });
    }

    /// <summary>
    /// Lấy thông tin user theo ID
    /// GET /api/auth/users/{id}
    /// </summary>
    [HttpGet("users/{id}")]
    public async Task<IActionResult> GetUser(long id)
    {
        var user = await _authService.GetUserByIdAsync(id);
        if (user == null)
            return NotFound(new { success = false, message = "Không tìm thấy user" });

        return Ok(new { success = true, user });
    }

    /// <summary>
    /// Kích hoạt / vô hiệu hóa user - Admin only
    /// PUT /api/auth/users/{id}/toggle-active
    /// </summary>
    [HttpPut("users/{id}/toggle-active")]
    public async Task<IActionResult> ToggleUserActive(long id)
    {
        if (!HttpContext.HasRole("ADMIN"))
            return StatusCode(403, new { success = false, message = "Chỉ Admin mới có quyền thay đổi trạng thái user" });

        var (success, message) = await _authService.ToggleUserActiveAsync(id);
        return Ok(new { success, message });
    }

    /// <summary>
    /// Cập nhật role - Admin only
    /// PUT /api/auth/users/{id}/role
    /// </summary>
    [HttpPut("users/{id}/role")]
    public async Task<IActionResult> UpdateUserRole(long id, [FromBody] UpdateUserRoleDto request)
    {
        if (!HttpContext.HasRole("ADMIN"))
            return StatusCode(403, new { success = false, message = "Chỉ Admin mới có quyền thay đổi role" });

        var (success, message) = await _authService.UpdateUserRoleAsync(id, request.RoleId);
        return Ok(new { success, message });
    }

    // ========================================
    // ROLE APIs
    // ========================================

    /// <summary>
    /// Lấy danh sách roles
    /// GET /api/auth/roles
    /// </summary>
    [HttpGet("roles")]
    public async Task<IActionResult> GetAllRoles()
    {
        var roles = await _authService.GetAllRolesAsync();
        return Ok(new { success = true, roles });
    }

    // ========================================
    // SESSION MANAGEMENT APIs
    // ========================================

    /// <summary>
    /// Lấy danh sách sessions đang hoạt động
    /// GET /api/auth/sessions/active
    /// </summary>
    [HttpGet("sessions/active")]
    public async Task<IActionResult> GetActiveSessions()
    {
        var sessions = await _authService.GetActiveSessionsAsync();
        return Ok(new { success = true, sessions, count = sessions.Count });
    }

    /// <summary>
    /// Lấy session history của user
    /// GET /api/auth/users/{userId}/sessions
    /// </summary>
    [HttpGet("users/{userId}/sessions")]
    public async Task<IActionResult> GetUserSessions(long userId)
    {
        var sessions = await _authService.GetUserSessionsAsync(userId);
        return Ok(new { success = true, sessions });
    }

    /// <summary>
    /// Admin: Buộc đăng xuất 1 session
    /// DELETE /api/auth/sessions/{sessionId}
    /// </summary>
    [HttpDelete("sessions/{sessionId}")]
    public async Task<IActionResult> RevokeSession(Guid sessionId, [FromQuery] string? reason = null)
    {
        if (!HttpContext.HasRole("ADMIN", "CAPTAIN"))
            return StatusCode(403, new { success = false, message = "Chỉ Admin/Captain mới có quyền revoke session" });

        var (success, message) = await _authService.RevokeSessionAsync(sessionId, reason ?? "ADMIN_REVOKE");
        return Ok(new { success, message });
    }

    /// <summary>
    /// Admin: Buộc đăng xuất tất cả sessions của user
    /// DELETE /api/auth/users/{userId}/sessions
    /// </summary>
    [HttpDelete("users/{userId}/sessions")]
    public async Task<IActionResult> RevokeAllUserSessions(long userId, [FromQuery] string? reason = null)
    {
        if (!HttpContext.HasRole("ADMIN", "CAPTAIN"))
            return StatusCode(403, new { success = false, message = "Chỉ Admin/Captain mới có quyền revoke sessions" });

        var (success, message) = await _authService.RevokeAllUserSessionsAsync(userId, reason ?? "ADMIN_REVOKE");
        return Ok(new { success, message });
    }

    // ========================================
    // SYSTEM LOG APIs (Foundation)
    // ========================================

    /// <summary>
    /// Lấy system logs
    /// GET /api/auth/logs
    /// </summary>
    [HttpGet("logs")]
    public async Task<IActionResult> GetLogs(
        [FromQuery] string? category = null,
        [FromQuery] string? action = null,
        [FromQuery] string? level = null,
        [FromQuery] long? userId = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] int limit = 100)
    {
        var logs = await _systemLog.GetLogsAsync(category, action, level, userId, from, to, limit);
        return Ok(new { success = true, logs, count = logs.Count });
    }

    /// <summary>
    /// Lấy login history của user
    /// GET /api/auth/users/{userId}/login-history
    /// </summary>
    [HttpGet("users/{userId}/login-history")]
    public async Task<IActionResult> GetLoginHistory(long userId, [FromQuery] int limit = 20)
    {
        var history = await _systemLog.GetLoginHistoryAsync(userId, limit);
        return Ok(new { success = true, history });
    }

    /// <summary>
    /// Lấy security events
    /// GET /api/auth/security-events
    /// </summary>
    [HttpGet("security-events")]
    public async Task<IActionResult> GetSecurityEvents(
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] int limit = 50)
    {
        var events = await _systemLog.GetSecurityEventsAsync(from, to, limit);
        return Ok(new { success = true, events, count = events.Count });
    }

    /// <summary>
    /// Lấy thống kê log theo category
    /// GET /api/auth/logs/stats
    /// </summary>
    [HttpGet("logs/stats")]
    public async Task<IActionResult> GetLogStats(
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null)
    {
        var stats = await _systemLog.GetLogCountByCategoryAsync(from, to);
        return Ok(new { success = true, stats });
    }

    // ========================================
    // HEALTH CHECK
    // ========================================

    /// <summary>
    /// Health check
    /// GET /api/auth/health
    /// </summary>
    [HttpGet("health")]
    public async Task<IActionResult> Health()
    {
        try
        {
            var roleCount = await _context.Roles.CountAsync();
            var userCount = await _context.Users.CountAsync();
            var activeUserCount = await _context.Users.CountAsync(u => u.IsActive);
            var activeSessionCount = await _context.UserSessions.CountAsync(s => s.IsActive);

            return Ok(new
            {
                success = true,
                message = "Auth system is healthy",
                stats = new
                {
                    totalRoles = roleCount,
                    totalUsers = userCount,
                    activeUsers = activeUserCount,
                    activeSessions = activeSessionCount
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking auth health");
            return StatusCode(500, new { success = false, message = "Auth system error" });
        }
    }

    // ========================================
    // LEGACY SUPPORT (mobile app backward compatibility)
    // ========================================

    /// <summary>
    /// Legacy login endpoint - delegates to the new auth system
    /// POST /api/auth/login-legacy
    /// </summary>
    [HttpPost("login-legacy")]
    public async Task<IActionResult> LoginLegacy([FromBody] LegacyLoginRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.CrewId) || string.IsNullOrWhiteSpace(request.Password))
            {
                return BadRequest(new { error = "Crew ID and password are required" });
            }

            // Delegate to new login system - no fallback to hardcoded password
            var loginRequest = new LoginRequest
            {
                Username = request.CrewId,
                Password = request.Password,
                DeviceType = "MOBILE"
            };

            var ipAddress = GetClientIpAddress();
            var userAgent = Request.Headers["User-Agent"].FirstOrDefault();
            var loginResult = await _authService.LoginAsync(loginRequest, ipAddress, userAgent);

            if (loginResult.Success && loginResult.User != null)
            {
                return Ok(new LegacyLoginResponse
                {
                    AccessToken = loginResult.AccessToken ?? "",
                    RefreshToken = loginResult.RefreshToken ?? "",
                    UserId = loginResult.User.Id,
                    CrewId = loginResult.User.CrewId ?? "",
                    FullName = loginResult.User.FullName ?? "",
                    RankName = loginResult.User.RankName,
                    ExpiresIn = loginResult.ExpiresIn
                });
            }

            return Unauthorized(new { error = "Invalid credentials" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during legacy login");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ========================================
    // HELPERS
    // ========================================

    private string? GetClientIpAddress()
    {
        // Check X-Forwarded-For header first (proxy/load balancer)
        var forwardedFor = Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrEmpty(forwardedFor))
        {
            return forwardedFor.Split(',').FirstOrDefault()?.Trim();
        }

        return HttpContext.Connection.RemoteIpAddress?.ToString();
    }

    private string? GetBearerToken()
    {
        var authHeader = Request.Headers["Authorization"].FirstOrDefault();
        if (!string.IsNullOrEmpty(authHeader) && authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return authHeader.Substring("Bearer ".Length).Trim();
        }

        // Also check query parameter (for WebSocket/SSE connections)
        return Request.Query["token"].FirstOrDefault();
    }
}

// ========================================
// Controller-level DTOs (backward compatibility)
// ========================================

public class UpdateUserRoleDto
{
    public int RoleId { get; set; }
}

public class LegacyLoginRequest
{
    public string CrewId { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class LegacyLoginResponse
{
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public long UserId { get; set; }
    public string CrewId { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string? RankName { get; set; }
    public string? Department { get; set; }
    public int ExpiresIn { get; set; }
}
