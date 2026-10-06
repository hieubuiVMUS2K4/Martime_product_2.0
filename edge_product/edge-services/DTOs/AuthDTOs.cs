namespace MaritimeEdge.DTOs;

// ============================================================
// AUTHENTICATION DTOs - Chuẩn hàng hải ISPS/ISM
// ============================================================

/// <summary>
/// DTO đăng nhập
/// </summary>
public class LoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    
    /// <summary>
    /// Loại thiết bị: BRIDGE_PC, ENGINE_PC, MOBILE, TABLET
    /// </summary>
    public string? DeviceType { get; set; }
}

/// <summary>
/// DTO kết quả đăng nhập - Maritime compliant
/// </summary>
public class LoginResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? AccessToken { get; set; }
    public string? RefreshToken { get; set; }
    public int ExpiresIn { get; set; } // seconds
    public bool MustChangePassword { get; set; }
    public UserInfo? User { get; set; }
}

/// <summary>
/// DTO thông tin user
/// </summary>
public class UserInfo
{
    public long Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public int RoleId { get; set; }
    public string RoleName { get; set; } = string.Empty;
    public string RoleCode { get; set; } = string.Empty;
    public string? CrewId { get; set; }
    public string? FullName { get; set; }
    public string? Position { get; set; }
    public string? RankName { get; set; }
    public bool IsActive { get; set; }
    public DateTime? LastLoginAt { get; set; }
}

/// <summary>
/// DTO đăng xuất
/// </summary>
public class LogoutRequest
{
    public string? AccessToken { get; set; }
    public string? Reason { get; set; }
}

/// <summary>
/// DTO kết quả đăng xuất
/// </summary>
public class LogoutResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime? LogoutAt { get; set; }
    public int? SessionDurationMinutes { get; set; }
}

/// <summary>
/// DTO làm mới token
/// </summary>
public class TokenRefreshRequest
{
    public string RefreshToken { get; set; } = string.Empty;
}

/// <summary>
/// DTO kết quả refresh token
/// </summary>
public class TokenRefreshResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? AccessToken { get; set; }
    public string? RefreshToken { get; set; }
    public int ExpiresIn { get; set; }
    public UserInfo? User { get; set; }
}

/// <summary>
/// DTO đổi mật khẩu
/// </summary>
public class ChangePasswordRequest
{
    public long UserId { get; set; }
    public string OldPassword { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
    public string ConfirmPassword { get; set; } = string.Empty;
}

/// <summary>
/// DTO reset mật khẩu
/// </summary>
public class ResetPasswordRequest
{
    public string Username { get; set; } = string.Empty;
}

/// <summary>
/// DTO kết quả reset password
/// </summary>
public class ResetPasswordResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? DefaultPassword { get; set; }
}

/// <summary>
/// DTO tạo user
/// </summary>
public class CreateUserRequest
{
    public string CrewId { get; set; } = string.Empty;
    public int RoleId { get; set; }
}

/// <summary>
/// DTO kết quả tạo user
/// </summary>
public class CreateUserResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? DefaultPassword { get; set; }
    public UserInfo? User { get; set; }
}

/// <summary>
/// DTO cập nhật role
/// </summary>
public class UpdateUserRoleRequest
{
    public long UserId { get; set; }
    public int RoleId { get; set; }
}

/// <summary>
/// DTO thông tin session
/// </summary>
public class SessionInfo
{
    public Guid SessionId { get; set; }
    public long UserId { get; set; }
    public string Username { get; set; } = string.Empty;
    public string? DeviceType { get; set; }
    public string? IpAddress { get; set; }
    public DateTime LoginAt { get; set; }
    public DateTime? LogoutAt { get; set; }
    public DateTime LastActivityAt { get; set; }
    public bool IsActive { get; set; }
    public string? TerminationReason { get; set; }
}

/// <summary>
/// DTO validate session
/// </summary>
public class ValidateSessionResponse
{
    public bool IsValid { get; set; }
    public string Message { get; set; } = string.Empty;
    public UserInfo? User { get; set; }
    public Guid? SessionId { get; set; }
}
