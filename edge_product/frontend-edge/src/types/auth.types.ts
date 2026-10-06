// ============================================================
// AUTHENTICATION TYPES - Maritime ISPS/ISM Compliant
// ============================================================

/** Thông tin user */
export interface UserInfo {
  id: number
  username: string
  roleId: number
  roleName: string
  roleCode: string
  crewId?: string | null
  fullName?: string | null
  position?: string | null
  rankName?: string | null
  isActive: boolean
  lastLoginAt?: string | null
}

/** Thong tin role */
export interface RoleInfo {
  id: number
  roleCode: string
  roleName: string
  description?: string | null
  permissions?: string | null
  isActive: boolean
  createdAt?: string | null
}

/** Device types cho maritime environment */
export type DeviceType = 'BRIDGE_PC' | 'ENGINE_PC' | 'MOBILE' | 'TABLET'

// ─── Request DTOs ────────────────────────────────────────────

export interface LoginRequest {
  username: string
  password: string
  deviceType?: DeviceType
}

export interface LogoutRequest {
  accessToken?: string
  reason?: string
}

export interface TokenRefreshRequest {
  refreshToken: string
}

export interface ChangePasswordRequest {
  userId: number
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

export interface ResetPasswordRequest {
  username: string
}

export interface CreateUserRequest {
  crewId: string
  roleId: number
}

export interface UpdateUserRoleRequest {
  userId: number
  roleId: number
}

// ─── Response DTOs ───────────────────────────────────────────

export interface LoginResponse {
  success: boolean
  message: string
  accessToken?: string | null
  refreshToken?: string | null
  expiresIn: number
  mustChangePassword: boolean
  user?: UserInfo | null
}

export interface LogoutResponse {
  success: boolean
  message: string
  logoutAt?: string | null
  sessionDurationMinutes?: number | null
}

export interface TokenRefreshResponse {
  success: boolean
  message: string
  accessToken?: string | null
  refreshToken?: string | null
  expiresIn: number
  user?: UserInfo | null
}

export interface ResetPasswordResponse {
  success: boolean
  message: string
  defaultPassword?: string | null
}

export interface CreateUserResponse {
  success: boolean
  message: string
  defaultPassword?: string | null
  user?: UserInfo | null
}

export interface UsersResponse {
  success: boolean
  users: UserInfo[]
}

export interface UserResponse {
  success: boolean
  user: UserInfo
}

export interface RolesResponse {
  success: boolean
  roles: RoleInfo[]
}

export interface ValidateSessionResponse {
  isValid: boolean
  message: string
  user?: UserInfo | null
  sessionId?: string | null
}

export interface SessionInfo {
  sessionId: string
  userId: number
  username: string
  deviceType?: string | null
  ipAddress?: string | null
  loginAt: string
  logoutAt?: string | null
  lastActivityAt: string
  isActive: boolean
  terminationReason?: string | null
}

// ─── Auth Store State ────────────────────────────────────────

export interface AuthState {
  /** Current user info */
  user: UserInfo | null
  /** Access token (JWT-like) */
  accessToken: string | null
  /** Refresh token */
  refreshToken: string | null
  /** Token expiry timestamp (ms) */
  expiresAt: number | null
  /** Whether user is authenticated */
  isAuthenticated: boolean
  /** Whether auth is loading (initial check) */
  isLoading: boolean
  /** Whether login is in progress */
  isLoggingIn: boolean
  /** Login error message */
  error: string | null
  /** Whether user must change password */
  mustChangePassword: boolean
}
