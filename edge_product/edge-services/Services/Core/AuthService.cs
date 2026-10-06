using System.Security.Cryptography;
using System.Text;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging;

namespace MaritimeEdge.Services.Core;

/// <summary>
/// Authentication Service - Chuẩn hàng hải ISPS/ISM/IMO MSC.428
/// 
/// Bảo mật:
/// - PBKDF2 password hashing với salt (NIST SP 800-132)
/// - HMAC-SHA256 token generation
/// - Session-based auth với device tracking
/// - Brute force protection (account lockout)
/// - Complete audit trail qua SystemLog
/// 
/// Hiệu năng:
/// - MemoryCache cho session validation (giảm DB queries)
/// - Async/await throughout
/// - Optimized queries với AsNoTracking
/// </summary>
public class AuthService : IAuthService
{
    private readonly EdgeDbContext _context;
    private readonly IMemoryCache _cache;
    private readonly ILogger<AuthService> _logger;
    private readonly ISystemLogService _systemLog;
    private readonly IConfiguration _configuration;

    // ========== CONFIGURATION ==========
    private const int PBKDF2_ITERATIONS = 100_000; // NIST SP 800-132 recommended
    private const int SALT_SIZE = 32; // 256 bits
    private const int HASH_SIZE = 32; // 256 bits
    private const int ACCESS_TOKEN_HOURS = 24; // Access token lifetime
    private const int REFRESH_TOKEN_DAYS = 7; // Refresh token lifetime
    private const int MAX_FAILED_ATTEMPTS = 5; // Lockout after N failures
    private const int LOCKOUT_MINUTES = 15; // Lockout duration
    private const int SESSION_IDLE_MINUTES = 480; // 8 hours idle timeout (watch rotation)
    private const int MIN_PASSWORD_LENGTH = 8;
    private static readonly TimeSpan CACHE_SESSION_DURATION = TimeSpan.FromMinutes(5);

    // HMAC key for token signing - loaded from configuration
    private readonly byte[] _tokenSigningKey;

    public AuthService(
        EdgeDbContext context,
        IMemoryCache cache,
        ILogger<AuthService> logger,
        ISystemLogService systemLog,
        IConfiguration configuration)
    {
        _context = context;
        _cache = cache;
        _logger = logger;
        _systemLog = systemLog;
        _configuration = configuration;

        // Load HMAC signing key from config - REQUIRED for security
        var configKey = _configuration.GetValue<string>("Auth:TokenSigningKey");
        if (string.IsNullOrWhiteSpace(configKey) || configKey.Length < 32)
        {
            _logger.LogCritical("Auth:TokenSigningKey must be configured with at least 32 characters in appsettings.json!");
            throw new InvalidOperationException("Auth:TokenSigningKey is not configured or too short. Set a secure key (>=32 chars) in appsettings.json.");
        }
        _tokenSigningKey = Encoding.UTF8.GetBytes(configKey);
    }

    // ================================================================
    // AUTHENTICATION
    // ================================================================

    public async Task<LoginResponse> LoginAsync(LoginRequest request, string? ipAddress, string? userAgent)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();

        try
        {
            if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
            {
                return new LoginResponse { Success = false, Message = "Username và password không được để trống" };
            }

            var username = request.Username.Trim();

            // 1. Tìm user
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Username == username);

            if (user == null)
            {
                await RecordLoginAttemptAsync(username, ipAddress, false, "INVALID_USERNAME");
                await _systemLog.LogAsync("AUTH", "LOGIN_FAILED", "WARNING",
                    $"Login thất bại: username không tồn tại [{username}]",
                    ipAddress: ipAddress, userAgent: userAgent);
                return new LoginResponse { Success = false, Message = "Tên đăng nhập hoặc mật khẩu không đúng" };
            }

            // 2. Kiểm tra tài khoản active
            if (!user.IsActive)
            {
                await RecordLoginAttemptAsync(username, ipAddress, false, "ACCOUNT_DISABLED");
                await _systemLog.LogAsync("AUTH", "LOGIN_FAILED", "WARNING",
                    $"Login thất bại: tài khoản bị vô hiệu hóa [{username}]",
                    userId: user.Id, username: username, ipAddress: ipAddress, userAgent: userAgent);
                return new LoginResponse { Success = false, Message = "Tài khoản đã bị vô hiệu hóa" };
            }

            // 3. Kiểm tra lockout
            if (user.LockoutUntil.HasValue && user.LockoutUntil > DateTime.UtcNow)
            {
                var remainingMinutes = (int)(user.LockoutUntil.Value - DateTime.UtcNow).TotalMinutes + 1;
                await RecordLoginAttemptAsync(username, ipAddress, false, "ACCOUNT_LOCKED");
                await _systemLog.LogAsync("AUTH", "LOGIN_FAILED", "WARNING",
                    $"Login thất bại: tài khoản đang bị khóa [{username}], còn {remainingMinutes} phút",
                    userId: user.Id, username: username, ipAddress: ipAddress, userAgent: userAgent);
                return new LoginResponse
                {
                    Success = false,
                    Message = $"Tài khoản đang bị khóa. Vui lòng thử lại sau {remainingMinutes} phút"
                };
            }

            // 4. Xác thực password
            bool passwordValid;
            if (!string.IsNullOrEmpty(user.PasswordSalt))
            {
                // New PBKDF2 hashing
                passwordValid = VerifyPassword(request.Password, user.PasswordHash, user.PasswordSalt);
            }
            else
            {
                // Legacy SHA256 fallback - support old passwords
                passwordValid = VerifyLegacyPassword(request.Password, user.PasswordHash);

                // Auto-migrate to PBKDF2 on successful legacy login
                if (passwordValid)
                {
                    var (hash, salt) = HashPassword(request.Password);
                    user.PasswordHash = hash;
                    user.PasswordSalt = salt;
                    _logger.LogInformation("Migrated password to PBKDF2 for user: {Username}", username);
                }
            }

            if (!passwordValid)
            {
                // Tăng failed attempts
                user.FailedLoginAttempts++;

                if (user.FailedLoginAttempts >= MAX_FAILED_ATTEMPTS)
                {
                    user.LockoutUntil = DateTime.UtcNow.AddMinutes(LOCKOUT_MINUTES);
                    await _context.SaveChangesAsync();

                    await RecordLoginAttemptAsync(username, ipAddress, false, "INVALID_PASSWORD");
                    await _systemLog.LogAsync("SECURITY", "ACCOUNT_LOCKED", "WARNING",
                        $"Tài khoản bị khóa sau {MAX_FAILED_ATTEMPTS} lần thất bại [{username}]",
                        userId: user.Id, username: username, ipAddress: ipAddress, userAgent: userAgent);

                    return new LoginResponse
                    {
                        Success = false,
                        Message = $"Tài khoản đã bị khóa {LOCKOUT_MINUTES} phút do đăng nhập sai quá nhiều lần"
                    };
                }

                await _context.SaveChangesAsync();
                await RecordLoginAttemptAsync(username, ipAddress, false, "INVALID_PASSWORD");
                await _systemLog.LogAsync("AUTH", "LOGIN_FAILED", "WARNING",
                    $"Login thất bại: sai mật khẩu [{username}], lần {user.FailedLoginAttempts}/{MAX_FAILED_ATTEMPTS}",
                    userId: user.Id, username: username, ipAddress: ipAddress, userAgent: userAgent);

                var attemptsLeft = MAX_FAILED_ATTEMPTS - user.FailedLoginAttempts;
                return new LoginResponse
                {
                    Success = false,
                    Message = $"Mật khẩu không đúng. Còn {attemptsLeft} lần thử trước khi tài khoản bị khóa"
                };
            }

            // 5. Login thành công - reset failed attempts
            user.FailedLoginAttempts = 0;
            user.LockoutUntil = null;
            user.LastLoginAt = DateTime.UtcNow;
            user.UpdatedAt = DateTime.UtcNow;

            // 6. Tạo session
            var accessToken = GenerateSecureToken(user.Id, user.Username, "access");
            var refreshToken = GenerateSecureToken(user.Id, user.Username, "refresh");

            var session = new UserSession
            {
                AccessToken = accessToken,
                RefreshToken = refreshToken,
                UserId = user.Id,
                IpAddress = ipAddress,
                UserAgent = userAgent,
                DeviceType = request.DeviceType ?? "UNKNOWN",
                LoginAt = DateTime.UtcNow,
                AccessTokenExpiresAt = DateTime.UtcNow.AddHours(ACCESS_TOKEN_HOURS),
                RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(REFRESH_TOKEN_DAYS),
                LastActivityAt = DateTime.UtcNow,
                IsActive = true
            };

            _context.UserSessions.Add(session);
            await _context.SaveChangesAsync();

            // 7. Lấy thông tin role và crew
            var role = await _context.Roles.AsNoTracking().FirstOrDefaultAsync(r => r.Id == user.RoleId);
            var crew = string.IsNullOrEmpty(user.CrewId)
                ? null
                : await _context.CrewMembers.AsNoTracking().Include(c => c.Rank)
                    .FirstOrDefaultAsync(c => c.CrewId == user.CrewId);

            // 8. Build complete UserInfo DTO (used for both cache and response)
            var userInfo = new UserInfo
            {
                Id = user.Id,
                Username = user.Username,
                RoleId = user.RoleId,
                RoleName = role?.RoleName ?? "",
                RoleCode = role?.RoleCode ?? "",
                CrewId = user.CrewId,
                FullName = crew?.FullName,
                RankName = crew?.Rank?.RankName,
                IsActive = user.IsActive,
                LastLoginAt = user.LastLoginAt
            };

            // Cache session with complete user info
            CacheSession(accessToken, userInfo, session.Id);

            await RecordLoginAttemptAsync(username, ipAddress, true, null);
            
            sw.Stop();
            await _systemLog.LogAsync("AUTH", "LOGIN_SUCCESS", "INFO",
                $"Đăng nhập thành công [{username}] từ {ipAddress ?? "unknown"} ({request.DeviceType ?? "UNKNOWN"})",
                userId: user.Id, username: username, ipAddress: ipAddress, userAgent: userAgent,
                sessionId: session.Id, durationMs: (int)sw.ElapsedMilliseconds);

            _logger.LogInformation("Login successful: {Username} - Role: {RoleName} - IP: {IP} - {Ms}ms",
                username, role?.RoleName, ipAddress, sw.ElapsedMilliseconds);

            return new LoginResponse
            {
                Success = true,
                Message = "Đăng nhập thành công",
                AccessToken = accessToken,
                RefreshToken = refreshToken,
                ExpiresIn = ACCESS_TOKEN_HOURS * 3600,
                MustChangePassword = user.MustChangePassword,
                User = userInfo
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during login for user: {Username}", request.Username);
            await _systemLog.LogAsync("AUTH", "LOGIN_FAILED", "ERROR",
                $"Lỗi server khi đăng nhập [{request.Username}]: {ex.Message}",
                ipAddress: ipAddress, result: "FAILURE");
            return new LoginResponse { Success = false, Message = "Lỗi server khi xử lý đăng nhập" };
        }
    }

    public async Task<LogoutResponse> LogoutAsync(string accessToken, string? reason)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(accessToken))
            {
                return new LogoutResponse { Success = false, Message = "Access token không hợp lệ" };
            }

            var session = await _context.UserSessions
                .FirstOrDefaultAsync(s => s.AccessToken == accessToken && s.IsActive);

            if (session == null)
            {
                return new LogoutResponse { Success = true, Message = "Session đã kết thúc trước đó" };
            }

            // Kết thúc session
            session.IsActive = false;
            session.LogoutAt = DateTime.UtcNow;
            session.TerminationReason = reason ?? "USER_LOGOUT";
            await _context.SaveChangesAsync();

            // Xóa cache
            InvalidateSessionCache(accessToken);

            var durationMinutes = (int)(DateTime.UtcNow - session.LoginAt).TotalMinutes;

            // Lấy username cho log
            var user = await _context.Users.AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == session.UserId);

            await _systemLog.LogAsync("AUTH", "LOGOUT", "INFO",
                $"Đăng xuất [{user?.Username}] sau {durationMinutes} phút. Lý do: {session.TerminationReason}",
                userId: session.UserId, username: user?.Username,
                ipAddress: session.IpAddress, sessionId: session.Id);

            _logger.LogInformation("Logout: {Username} - Duration: {Minutes}min - Reason: {Reason}",
                user?.Username, durationMinutes, session.TerminationReason);

            return new LogoutResponse
            {
                Success = true,
                Message = "Đăng xuất thành công",
                LogoutAt = session.LogoutAt,
                SessionDurationMinutes = durationMinutes
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during logout");
            return new LogoutResponse { Success = false, Message = "Lỗi khi đăng xuất" };
        }
    }

    public async Task<TokenRefreshResponse> RefreshTokenAsync(string refreshToken, string? ipAddress)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(refreshToken))
            {
                return new TokenRefreshResponse { Success = false, Message = "Refresh token không hợp lệ" };
            }

            var session = await _context.UserSessions
                .FirstOrDefaultAsync(s => s.RefreshToken == refreshToken && s.IsActive);

            if (session == null)
            {
                return new TokenRefreshResponse { Success = false, Message = "Session không tồn tại hoặc đã kết thúc" };
            }

            // Kiểm tra refresh token expiry
            if (session.RefreshTokenExpiresAt < DateTime.UtcNow)
            {
                session.IsActive = false;
                session.TerminationReason = "TOKEN_EXPIRED";
                session.LogoutAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();
                InvalidateSessionCache(session.AccessToken);

                return new TokenRefreshResponse { Success = false, Message = "Refresh token đã hết hạn. Vui lòng đăng nhập lại" };
            }

            var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == session.UserId && u.IsActive);
            if (user == null)
            {
                session.IsActive = false;
                session.TerminationReason = "ACCOUNT_DISABLED";
                session.LogoutAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();
                return new TokenRefreshResponse { Success = false, Message = "Tài khoản không còn hoạt động" };
            }

            // Xóa cache token cũ
            InvalidateSessionCache(session.AccessToken);

            // Tạo token mới
            var newAccessToken = GenerateSecureToken(user.Id, user.Username, "access");
            var newRefreshToken = GenerateSecureToken(user.Id, user.Username, "refresh");

            session.AccessToken = newAccessToken;
            session.RefreshToken = newRefreshToken;
            session.AccessTokenExpiresAt = DateTime.UtcNow.AddHours(ACCESS_TOKEN_HOURS);
            session.RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(REFRESH_TOKEN_DAYS);
            session.LastActivityAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            // Fetch role and crew info BEFORE caching
            var role = await _context.Roles.AsNoTracking().FirstOrDefaultAsync(r => r.Id == user.RoleId);
            var crew = string.IsNullOrEmpty(user.CrewId)
                ? null
                : await _context.CrewMembers.AsNoTracking().Include(c => c.Rank)
                    .FirstOrDefaultAsync(c => c.CrewId == user.CrewId);

            // Build complete UserInfo DTO
            var userInfo = new UserInfo
            {
                Id = user.Id,
                Username = user.Username,
                RoleId = user.RoleId,
                RoleName = role?.RoleName ?? "",
                RoleCode = role?.RoleCode ?? "",
                CrewId = user.CrewId,
                FullName = crew?.FullName,
                RankName = crew?.Rank?.RankName,
                IsActive = user.IsActive,
                LastLoginAt = user.LastLoginAt
            };

            // Cache session with complete user info
            CacheSession(newAccessToken, userInfo, session.Id);

            await _systemLog.LogAsync("AUTH", "TOKEN_REFRESH", "INFO",
                $"Token refreshed [{user.Username}] từ {ipAddress ?? "unknown"}",
                userId: user.Id, username: user.Username, ipAddress: ipAddress, sessionId: session.Id);

            return new TokenRefreshResponse
            {
                Success = true,
                Message = "Token refreshed thành công",
                AccessToken = newAccessToken,
                RefreshToken = newRefreshToken,
                ExpiresIn = ACCESS_TOKEN_HOURS * 3600,
                User = userInfo
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during token refresh");
            return new TokenRefreshResponse { Success = false, Message = "Lỗi khi refresh token" };
        }
    }

    public async Task<ValidateSessionResponse> ValidateSessionAsync(string accessToken)
    {
        try
        {
            // 1. Check cache first (performance)
            var cacheKey = $"session:{accessToken}";
            if (_cache.TryGetValue(cacheKey, out ValidateSessionResponse? cachedResponse) && cachedResponse != null)
            {
                return cachedResponse;
            }

            // 2. DB lookup
            var session = await _context.UserSessions.AsNoTracking()
                .FirstOrDefaultAsync(s => s.AccessToken == accessToken && s.IsActive);

            if (session == null)
            {
                return new ValidateSessionResponse { IsValid = false, Message = "Session không tồn tại" };
            }

            // 3. Check token expiry
            if (session.AccessTokenExpiresAt < DateTime.UtcNow)
            {
                return new ValidateSessionResponse { IsValid = false, Message = "Access token đã hết hạn" };
            }

            // 4. Check idle timeout
            if ((DateTime.UtcNow - session.LastActivityAt).TotalMinutes > SESSION_IDLE_MINUTES)
            {
                // Expire the session
                var sessionToUpdate = await _context.UserSessions.FindAsync(session.Id);
                if (sessionToUpdate != null)
                {
                    sessionToUpdate.IsActive = false;
                    sessionToUpdate.TerminationReason = "IDLE_TIMEOUT";
                    sessionToUpdate.LogoutAt = DateTime.UtcNow;
                    await _context.SaveChangesAsync();
                }
                return new ValidateSessionResponse { IsValid = false, Message = "Session hết hạn do không hoạt động" };
            }

            // 5. Get user info
            var user = await _context.Users.AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == session.UserId && u.IsActive);

            if (user == null)
            {
                return new ValidateSessionResponse { IsValid = false, Message = "Tài khoản không còn hoạt động" };
            }

            var role = await _context.Roles.AsNoTracking().FirstOrDefaultAsync(r => r.Id == user.RoleId);
            var crew = string.IsNullOrEmpty(user.CrewId)
                ? null
                : await _context.CrewMembers.AsNoTracking().Include(c => c.Rank)
                    .FirstOrDefaultAsync(c => c.CrewId == user.CrewId);

            var response = new ValidateSessionResponse
            {
                IsValid = true,
                Message = "Session hợp lệ",
                SessionId = session.Id,
                User = new UserInfo
                {
                    Id = user.Id,
                    Username = user.Username,
                    RoleId = user.RoleId,
                    RoleName = role?.RoleName ?? "",
                    RoleCode = role?.RoleCode ?? "",
                    CrewId = user.CrewId,
                    FullName = crew?.FullName,
                    RankName = crew?.Rank?.RankName,
                    IsActive = user.IsActive,
                    LastLoginAt = user.LastLoginAt
                }
            };

            // Cache for performance
            _cache.Set(cacheKey, response, CACHE_SESSION_DURATION);

            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validating session");
            return new ValidateSessionResponse { IsValid = false, Message = "Lỗi khi validate session" };
        }
    }

    public async Task UpdateSessionActivityAsync(string accessToken)
    {
        try
        {
            var session = await _context.UserSessions
                .FirstOrDefaultAsync(s => s.AccessToken == accessToken && s.IsActive);

            if (session != null)
            {
                session.LastActivityAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error updating session activity");
        }
    }

    // ================================================================
    // PASSWORD MANAGEMENT
    // ================================================================

    public async Task<(bool Success, string Message)> ChangePasswordAsync(long userId, string oldPassword, string newPassword)
    {
        try
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return (false, "Người dùng không tồn tại");

            if (newPassword.Length < MIN_PASSWORD_LENGTH)
                return (false, $"Mật khẩu mới phải có ít nhất {MIN_PASSWORD_LENGTH} ký tự");

            // Verify old password
            bool oldPasswordValid;
            if (!string.IsNullOrEmpty(user.PasswordSalt))
            {
                oldPasswordValid = VerifyPassword(oldPassword, user.PasswordHash, user.PasswordSalt);
            }
            else
            {
                oldPasswordValid = VerifyLegacyPassword(oldPassword, user.PasswordHash);
            }

            if (!oldPasswordValid)
                return (false, "Mật khẩu cũ không đúng");

            // Hash new password with PBKDF2
            var (hash, salt) = HashPassword(newPassword);
            user.PasswordHash = hash;
            user.PasswordSalt = salt;
            user.MustChangePassword = false;
            user.PasswordChangedAt = DateTime.UtcNow;
            user.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            await _systemLog.LogAsync("AUTH", "PASSWORD_CHANGED", "INFO",
                $"Đổi mật khẩu thành công [{user.Username}]",
                userId: user.Id, username: user.Username);

            _logger.LogInformation("Password changed for user: {Username}", user.Username);
            return (true, "Đổi mật khẩu thành công");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error changing password for userId: {UserId}", userId);
            return (false, "Lỗi khi đổi mật khẩu");
        }
    }

    public async Task<ResetPasswordResponse> ResetPasswordAsync(string username)
    {
        try
        {
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Username == username);
            if (user == null)
                return new ResetPasswordResponse { Success = false, Message = "Người dùng không tồn tại" };

            if (string.IsNullOrEmpty(user.CrewId))
                return new ResetPasswordResponse { Success = false, Message = "Không thể reset password (không có crew_id)" };

            var crewMember = await _context.CrewMembers
                .FirstOrDefaultAsync(c => c.CrewId == user.CrewId);

            if (crewMember == null || !crewMember.DateOfBirth.HasValue)
                return new ResetPasswordResponse { Success = false, Message = "Không tìm thấy ngày sinh của thuyền viên" };

            var defaultPassword = crewMember.DateOfBirth.Value.ToString("ddMMyyyy");
            var (hash, salt) = HashPassword(defaultPassword);
            user.PasswordHash = hash;
            user.PasswordSalt = salt;
            user.MustChangePassword = true; // Bắt buộc đổi mật khẩu sau khi reset
            user.FailedLoginAttempts = 0;
            user.LockoutUntil = null;
            user.PasswordChangedAt = DateTime.UtcNow;
            user.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            await _systemLog.LogAsync("SECURITY", "PASSWORD_RESET", "INFO",
                $"Reset mật khẩu [{user.Username}] về mặc định",
                userId: user.Id, username: user.Username);

            _logger.LogInformation("Password reset for user: {Username}", username);
            return new ResetPasswordResponse
            {
                Success = true,
                Message = "Reset mật khẩu thành công",
                DefaultPassword = defaultPassword
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resetting password for: {Username}", username);
            return new ResetPasswordResponse { Success = false, Message = "Lỗi khi reset mật khẩu" };
        }
    }

    // ================================================================
    // USER MANAGEMENT
    // ================================================================

    public async Task<CreateUserResponse> CreateUserForCrewAsync(string crewId, int roleId)
    {
        try
        {
            var crewMember = await _context.CrewMembers.Include(c => c.Rank)
                .FirstOrDefaultAsync(c => c.CrewId == crewId);
            if (crewMember == null)
                return new CreateUserResponse { Success = false, Message = "Không tìm thấy thuyền viên với mã này" };

            var existingUser = await _context.Users.FirstOrDefaultAsync(u => u.Username == crewId);
            if (existingUser != null)
                return new CreateUserResponse { Success = false, Message = "User đã tồn tại cho crew member này" };

            var role = await _context.Roles.FindAsync(roleId);
            if (role == null)
                return new CreateUserResponse { Success = false, Message = "Role không tồn tại" };
            if (!role.IsActive || role.RoleCode.ToUpperInvariant() is not ("ADMIN" or "CREW"))
                return new CreateUserResponse { Success = false, Message = "Vai trò tài khoản chỉ dùng ADMIN hoặc CREW. Chức danh được gán trong hồ sơ thuyền viên trên bờ." };

            string defaultPassword = crewMember.DateOfBirth.HasValue
                ? crewMember.DateOfBirth.Value.ToString("ddMMyyyy")
                : Convert.ToBase64String(RandomNumberGenerator.GetBytes(6)).Substring(0, 8);

            var (hash, salt) = HashPassword(defaultPassword);
            var newUser = new User
            {
                Username = crewId,
                PasswordHash = hash,
                PasswordSalt = salt,
                RoleId = roleId,
                CrewId = crewId,
                IsActive = true,
                MustChangePassword = true,
                CreatedAt = DateTime.UtcNow
            };

            _context.Users.Add(newUser);
            await _context.SaveChangesAsync();

            await _systemLog.LogAsync("AUTH", "USER_CREATED", "INFO",
                $"Tạo user mới [{crewId}] với role [{role.RoleName}]",
                entityType: "User", entityId: newUser.Id.ToString());

            _logger.LogInformation("User created: {Username} - Role: {RoleName}", crewId, role.RoleName);

            return new CreateUserResponse
            {
                Success = true,
                Message = $"Tạo user thành công. Password mặc định: {defaultPassword}",
                DefaultPassword = defaultPassword,
                User = new UserInfo
                {
                    Id = newUser.Id,
                    Username = newUser.Username,
                    RoleId = newUser.RoleId,
                    RoleName = role.RoleName,
                    RoleCode = role.RoleCode,
                    CrewId = newUser.CrewId,
                    FullName = crewMember.FullName,
                    RankName = crewMember.Rank?.RankName,
                    IsActive = newUser.IsActive
                }
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating user for crew: {CrewId}", crewId);
            return new CreateUserResponse { Success = false, Message = "Lỗi khi tạo user" };
        }
    }

    public async Task<List<UserInfo>> GetAllUsersAsync()
    {
        return await _context.Users
            .AsNoTracking()
            .Join(_context.Roles,
                u => u.RoleId, r => r.Id,
                (u, r) => new { User = u, Role = r })
            .GroupJoin(_context.CrewMembers.Include(c => c.Rank),
                ur => ur.User.CrewId, c => c.CrewId,
                (ur, crew) => new { ur.User, ur.Role, Crew = crew.FirstOrDefault() })
            .Select(x => new UserInfo
            {
                Id = x.User.Id,
                Username = x.User.Username,
                RoleId = x.User.RoleId,
                RoleName = x.Role.RoleName,
                RoleCode = x.Role.RoleCode,
                CrewId = x.User.CrewId,
                FullName = x.Crew != null ? x.Crew.FullName : null,
                RankName = x.Crew != null && x.Crew.Rank != null ? x.Crew.Rank.RankName : null,
                IsActive = x.User.IsActive,
                LastLoginAt = x.User.LastLoginAt
            })
            .OrderBy(x => x.Username)
            .ToListAsync();
    }

    public async Task<UserInfo?> GetUserByIdAsync(long userId)
    {
        var user = await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null) return null;

        var role = await _context.Roles.AsNoTracking().FirstOrDefaultAsync(r => r.Id == user.RoleId);
        var crew = string.IsNullOrEmpty(user.CrewId) ? null
            : await _context.CrewMembers.AsNoTracking().Include(c => c.Rank)
                .FirstOrDefaultAsync(c => c.CrewId == user.CrewId);

        return new UserInfo
        {
            Id = user.Id,
            Username = user.Username,
            RoleId = user.RoleId,
            RoleName = role?.RoleName ?? "",
            RoleCode = role?.RoleCode ?? "",
            CrewId = user.CrewId,
            FullName = crew?.FullName,
            RankName = crew?.Rank?.RankName,
            IsActive = user.IsActive,
            LastLoginAt = user.LastLoginAt
        };
    }

    public async Task<(bool Success, string Message)> ToggleUserActiveAsync(long userId)
    {
        try
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return (false, "Người dùng không tồn tại");

            user.IsActive = !user.IsActive;
            user.UpdatedAt = DateTime.UtcNow;

            // Nếu vô hiệu hóa, kết thúc tất cả sessions
            if (!user.IsActive)
            {
                var activeSessions = await _context.UserSessions
                    .Where(s => s.UserId == userId && s.IsActive)
                    .ToListAsync();

                foreach (var session in activeSessions)
                {
                    session.IsActive = false;
                    session.LogoutAt = DateTime.UtcNow;
                    session.TerminationReason = "ACCOUNT_DISABLED";
                    InvalidateSessionCache(session.AccessToken);
                }
            }

            await _context.SaveChangesAsync();

            var status = user.IsActive ? "kích hoạt" : "vô hiệu hóa";
            await _systemLog.LogAsync("SECURITY", user.IsActive ? "ACCOUNT_UNLOCKED" : "ACCOUNT_LOCKED", "INFO",
                $"Tài khoản [{user.Username}] đã được {status}",
                entityType: "User", entityId: userId.ToString());

            return (true, $"Đã {status} tài khoản thành công");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error toggling user active: {UserId}", userId);
            return (false, "Lỗi khi thay đổi trạng thái tài khoản");
        }
    }

    public async Task<(bool Success, string Message)> UpdateUserRoleAsync(long userId, int roleId)
    {
        try
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null) return (false, "Không tìm thấy user");

            var role = await _context.Roles.FindAsync(roleId);
            if (role == null) return (false, "Role không tồn tại");
            if (!role.IsActive || role.RoleCode.ToUpperInvariant() is not ("ADMIN" or "CREW"))
                return (false, "Vai trò tài khoản chỉ dùng ADMIN hoặc CREW. Quyền nghiệp vụ lấy theo chức danh thuyền viên.");

            var oldRoleId = user.RoleId;
            user.RoleId = roleId;
            user.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            // Invalidate cached sessions for this user
            var activeSessions = await _context.UserSessions.AsNoTracking()
                .Where(s => s.UserId == userId && s.IsActive)
                .ToListAsync();
            foreach (var s in activeSessions)
                InvalidateSessionCache(s.AccessToken);

            await _systemLog.LogAsync("SECURITY", "ROLE_CHANGED", "INFO",
                $"Role thay đổi [{user.Username}]: {oldRoleId} -> {roleId} ({role.RoleName})",
                userId: userId, username: user.Username,
                entityType: "User", entityId: userId.ToString());

            return (true, "Cập nhật role thành công");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating user role: {UserId}", userId);
            return (false, "Lỗi khi cập nhật role");
        }
    }

    public async Task<List<Role>> GetAllRolesAsync()
    {
        return await _context.Roles.AsNoTracking()
            .Where(r => r.IsActive)
            .OrderBy(r => r.Id)
            .ToListAsync();
    }

    // ================================================================
    // SESSION MANAGEMENT
    // ================================================================

    public async Task<List<SessionInfo>> GetActiveSessionsAsync()
    {
        return await _context.UserSessions.AsNoTracking()
            .Where(s => s.IsActive)
            .Join(_context.Users.AsNoTracking(),
                s => s.UserId, u => u.Id,
                (s, u) => new SessionInfo
                {
                    SessionId = s.Id,
                    UserId = u.Id,
                    Username = u.Username,
                    DeviceType = s.DeviceType,
                    IpAddress = s.IpAddress,
                    LoginAt = s.LoginAt,
                    LastActivityAt = s.LastActivityAt,
                    IsActive = s.IsActive
                })
            .OrderByDescending(s => s.LoginAt)
            .ToListAsync();
    }

    public async Task<List<SessionInfo>> GetUserSessionsAsync(long userId)
    {
        return await _context.UserSessions.AsNoTracking()
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.LoginAt)
            .Take(50) // Giới hạn 50 sessions gần nhất
            .Select(s => new SessionInfo
            {
                SessionId = s.Id,
                UserId = s.UserId,
                DeviceType = s.DeviceType,
                IpAddress = s.IpAddress,
                LoginAt = s.LoginAt,
                LogoutAt = s.LogoutAt,
                LastActivityAt = s.LastActivityAt,
                IsActive = s.IsActive,
                TerminationReason = s.TerminationReason
            })
            .ToListAsync();
    }

    public async Task<(bool Success, string Message)> RevokeSessionAsync(Guid sessionId, string reason)
    {
        var session = await _context.UserSessions.FindAsync(sessionId);
        if (session == null || !session.IsActive)
            return (false, "Session không tồn tại hoặc đã kết thúc");

        session.IsActive = false;
        session.LogoutAt = DateTime.UtcNow;
        session.TerminationReason = reason ?? "ADMIN_REVOKE";
        await _context.SaveChangesAsync();
        InvalidateSessionCache(session.AccessToken);

        await _systemLog.LogAsync("SECURITY", "SESSION_REVOKED", "WARNING",
            $"Admin đã thu hồi session [{sessionId}] cho userId [{session.UserId}]. Lý do: {reason}",
            entityType: "UserSession", entityId: sessionId.ToString());

        return (true, "Đã thu hồi session thành công");
    }

    public async Task<(bool Success, string Message)> RevokeAllUserSessionsAsync(long userId, string reason)
    {
        var sessions = await _context.UserSessions
            .Where(s => s.UserId == userId && s.IsActive)
            .ToListAsync();

        foreach (var session in sessions)
        {
            session.IsActive = false;
            session.LogoutAt = DateTime.UtcNow;
            session.TerminationReason = reason ?? "FORCE_LOGOUT";
            InvalidateSessionCache(session.AccessToken);
        }

        await _context.SaveChangesAsync();

        await _systemLog.LogAsync("SECURITY", "ALL_SESSIONS_REVOKED", "WARNING",
            $"Tất cả sessions ({sessions.Count}) của userId [{userId}] đã bị thu hồi. Lý do: {reason}",
            userId: userId, entityType: "User", entityId: userId.ToString());

        return (true, $"Đã thu hồi {sessions.Count} session(s)");
    }

    public async Task<int> CleanupExpiredSessionsAsync()
    {
        var expiredSessions = await _context.UserSessions
            .Where(s => s.IsActive &&
                (s.AccessTokenExpiresAt < DateTime.UtcNow ||
                 s.RefreshTokenExpiresAt < DateTime.UtcNow))
            .ToListAsync();

        foreach (var session in expiredSessions)
        {
            session.IsActive = false;
            session.LogoutAt = DateTime.UtcNow;
            session.TerminationReason = "TOKEN_EXPIRED";
            InvalidateSessionCache(session.AccessToken);
        }

        if (expiredSessions.Count > 0)
        {
            await _context.SaveChangesAsync();
            _logger.LogInformation("Cleaned up {Count} expired sessions", expiredSessions.Count);
        }

        return expiredSessions.Count;
    }

    // ================================================================
    // CRYPTO HELPERS - PBKDF2 (NIST SP 800-132)
    // ================================================================

    /// <summary>
    /// Hash password bằng PBKDF2-SHA256 với random salt
    /// </summary>
    public static (string Hash, string Salt) HashPassword(string password)
    {
        var salt = new byte[SALT_SIZE];
        using (var rng = RandomNumberGenerator.Create())
        {
            rng.GetBytes(salt);
        }

        var hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            PBKDF2_ITERATIONS,
            HashAlgorithmName.SHA256,
            HASH_SIZE);

        return (Convert.ToBase64String(hash), Convert.ToBase64String(salt));
    }

    /// <summary>
    /// Xác thực password với PBKDF2
    /// </summary>
    public static bool VerifyPassword(string password, string storedHash, string storedSalt)
    {
        var salt = Convert.FromBase64String(storedSalt);
        var hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            PBKDF2_ITERATIONS,
            HashAlgorithmName.SHA256,
            HASH_SIZE);

        return CryptographicOperations.FixedTimeEquals(hash, Convert.FromBase64String(storedHash));
    }

    /// <summary>
    /// Fallback: xác thực password cũ (SHA256 không salt)
    /// Dùng để backward compatible khi migrate
    /// </summary>
    public static bool VerifyLegacyPassword(string password, string storedHash)
    {
        using var sha256 = SHA256.Create();
        var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
        var hash = Convert.ToBase64String(hashedBytes);
        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(hash),
            Encoding.UTF8.GetBytes(storedHash));
    }

    /// <summary>
    /// Tạo token bảo mật bằng HMAC-SHA256
    /// </summary>
    private string GenerateSecureToken(long userId, string username, string tokenType)
    {
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var randomBytes = new byte[16];
        using (var rng = RandomNumberGenerator.Create())
        {
            rng.GetBytes(randomBytes);
        }
        var random = Convert.ToHexString(randomBytes).ToLowerInvariant();

        var payload = $"{tokenType}:{userId}:{username}:{timestamp}:{random}";

        using var hmac = new HMACSHA256(_tokenSigningKey);
        var signature = Convert.ToHexString(
            hmac.ComputeHash(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();

        return $"{payload}:{signature}";
    }

    // ================================================================
    // PRIVATE HELPERS
    // ================================================================

    private async Task RecordLoginAttemptAsync(string username, string? ipAddress, bool isSuccessful, string? failureReason)
    {
        try
        {
            _context.LoginAttempts.Add(new LoginAttempt
            {
                Username = username,
                IpAddress = ipAddress,
                AttemptedAt = DateTime.UtcNow,
                IsSuccessful = isSuccessful,
                FailureReason = failureReason
            });
            await _context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to record login attempt");
        }
    }

    private void CacheSession(string accessToken, UserInfo userInfo, Guid sessionId)
    {
        var cacheKey = $"session:{accessToken}";
        var response = new ValidateSessionResponse
        {
            IsValid = true,
            Message = "Session hợp lệ",
            SessionId = sessionId,
            User = userInfo
        };
        _cache.Set(cacheKey, response, CACHE_SESSION_DURATION);
    }

    private void InvalidateSessionCache(string accessToken)
    {
        _cache.Remove($"session:{accessToken}");
    }
}
