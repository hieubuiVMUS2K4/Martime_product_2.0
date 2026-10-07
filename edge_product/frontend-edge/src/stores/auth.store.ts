import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { authService } from '@/services/auth.service'
import type {
  UserInfo,
  LoginRequest,
  DeviceType,
} from '@/types/auth.types'

// ============================================================
// AUTH STORE - Zustand with session-scoped persistence
// Maritime ISPS/ISM Compliant Session Management
// ============================================================

const STORAGE_KEY = 'maritime-auth'

// ─── Token refresh timer ───────────────────────────────────

let refreshTimer: ReturnType<typeof setTimeout> | null = null

function clearRefreshTimer() {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

// ─── Detect device type ────────────────────────────────────

function detectDeviceType(): DeviceType {
  const ua = navigator.userAgent.toLowerCase()
  if (/tablet|ipad/.test(ua)) return 'TABLET'
  if (/mobile|android|iphone/.test(ua)) return 'MOBILE'
  return 'BRIDGE_PC'
}

// ─── Store Interface ───────────────────────────────────────
// NOTE: Use "storedRefreshToken" for the token string to avoid
//       naming collision with the "doRefreshToken" action method

interface AuthStoreState {
  user: UserInfo | null
  accessToken: string | null
  storedRefreshToken: string | null
  expiresAt: number | null
  isAuthenticated: boolean
  isLoading: boolean
  isLoggingIn: boolean
  error: string | null
  mustChangePassword: boolean
}

interface AuthActions {
  login: (username: string, password: string) => Promise<boolean>
  logout: (reason?: string) => Promise<void>
  initializeAuth: () => Promise<void>
  doRefreshToken: () => Promise<boolean>
  recoverSession: (failedToken: string) => Promise<boolean>
  clearAuth: () => void
  clearError: () => void
  setMustChangePassword: (value: boolean) => void
  getAccessToken: () => string | null
}

type AuthStore = AuthStoreState & AuthActions
let authGeneration = 0
let initializedToken: string | null = null
let initialization: { token: string | null; promise: Promise<void> } | null = null
let refresh: { token: string; promise: Promise<boolean> } | null = null
let recovery: { token: string; promise: Promise<boolean> } | null = null

// ─── Initial State ─────────────────────────────────────────

const initialState: AuthStoreState = {
  user: null,
  accessToken: null,
  storedRefreshToken: null,
  expiresAt: null,
  isAuthenticated: false,
  isLoading: true,
  isLoggingIn: false,
  error: null,
  mustChangePassword: false,
}

// ─── Helper: Schedule Token Refresh ─────────────────────────

function scheduleRefresh(get: () => AuthStore, expiresInSecs: number) {
  clearRefreshTimer()
  // Refresh at 80% of expiry (e.g., 10min token → refresh at 8min)
  const refreshAfter = Math.max(expiresInSecs * 0.8 * 1000, 30000)
  refreshTimer = setTimeout(() => {
    get().doRefreshToken()
  }, refreshAfter)
}

// ─── Store ─────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      login: async (username: string, password: string): Promise<boolean> => {
        const generation = ++authGeneration
        initializedToken = null
        clearRefreshTimer()
        set({ isLoggingIn: true, error: null })

        try {
          const response = await authService.login({
            username,
            password,
            deviceType: detectDeviceType(),
          } as LoginRequest)
          if (generation !== authGeneration) return false

          if (response.success && response.accessToken) {
            const expiresAt = Date.now() + response.expiresIn * 1000
            initializedToken = response.accessToken

            set({
              user: response.user ?? null,
              accessToken: response.accessToken,
              storedRefreshToken: response.refreshToken ?? null,
              expiresAt,
              isAuthenticated: true,
              isLoading: false,
              isLoggingIn: false,
              error: null,
              mustChangePassword: response.mustChangePassword,
            })

            scheduleRefresh(get, response.expiresIn)
            return true
          }

          set({
            isLoggingIn: false,
            error: response.message || 'Login failed',
          })
          return false
        } catch (err: any) {
          if (generation !== authGeneration) return false
          const message =
            err?.response?.data?.error ||
            err?.message ||
            'Unable to connect to the server'

          set({ isLoggingIn: false, error: message })
          return false
        }
      },

      logout: async (reason?: string) => {
        const { accessToken } = get()
        authGeneration++
        initializedToken = null
        clearRefreshTimer()

        // Optimistic: clear state immediately
        set({ ...initialState, isLoading: false })

        // Best-effort server-side logout
        try {
          if (accessToken) {
            await authService.logout({ accessToken, reason })
          }
        } catch {
          // Silent - user is already logged out locally
        }
      },

      initializeAuth: () => {
        const { accessToken, storedRefreshToken: rt, expiresAt } = get()
        if (initializedToken === accessToken && accessToken && get().isAuthenticated &&
            (expiresAt == null || Date.now() < expiresAt))
          return Promise.resolve()
        if (initialization?.token === accessToken) return initialization.promise
        const generation = authGeneration
        const current = () => generation === authGeneration && get().accessToken === accessToken
        const task = (async () => {
          if (!accessToken && !rt) { set({ isLoading: false, isAuthenticated: false }); return }
          if (!accessToken || (expiresAt != null && Date.now() >= expiresAt)) {
            await get().doRefreshToken()
            return
          }
          try {
            const result = await authService.validateSession()
            if (!current()) return
            if (result.isValid && result.user) {
              initializedToken = accessToken
              set({ user: result.user, isAuthenticated: true, isLoading: false })
              const remaining = expiresAt ? Math.floor((expiresAt - Date.now()) / 1000) : 0
              if (remaining > 60) scheduleRefresh(get, remaining)
              else if (rt) void get().doRefreshToken()
            } else if (rt) await get().doRefreshToken()
            else get().clearAuth()
          } catch (error: any) {
            if (!current()) return
            if (error?.response?.status === 401) {
              if (rt) await get().doRefreshToken()
              else get().clearAuth()
            } else {
              // A network/server failure is not evidence that a persisted session was revoked.
              set({ isLoading: false, isAuthenticated: !!get().user })
            }
          }
        })()
        initialization = { token: accessToken, promise: task }
        void task.finally(() => { if (initialization?.promise === task) initialization = null })
        return task
      },

      doRefreshToken: () => {
        const rt = get().storedRefreshToken
        if (!rt) { get().clearAuth(); return Promise.resolve(false) }
        if (refresh?.token === rt) return refresh.promise
        const generation = authGeneration
        const current = () => generation === authGeneration && get().storedRefreshToken === rt
        const task = (async () => {
          try {
            const result = await authService.refreshToken({ refreshToken: rt })
            if (!current()) return get().isAuthenticated
            if (result.success && result.accessToken) {
              initializedToken = result.accessToken
              set({ accessToken: result.accessToken, storedRefreshToken: result.refreshToken ?? rt,
                expiresAt: Date.now() + result.expiresIn * 1000, user: result.user ?? get().user,
                isAuthenticated: true, isLoading: false })
              scheduleRefresh(get, result.expiresIn)
              return true
            }
            get().clearAuth()
            return false
          } catch (error: any) {
            if (!current()) return get().isAuthenticated
            if (error?.response?.status === 401) get().clearAuth()
            else set({ isLoading: false, isAuthenticated: !!get().user && !!get().accessToken })
            return false
          }
        })()
        refresh = { token: rt, promise: task }
        void task.finally(() => { if (refresh?.promise === task) refresh = null })
        return task
      },

      recoverSession: (failedToken: string) => {
        if (get().accessToken !== failedToken) return Promise.resolve(!!get().accessToken)
        if (recovery?.token === failedToken) return recovery.promise
        const generation = authGeneration
        const current = () => generation === authGeneration && get().accessToken === failedToken
        const task = (async () => {
          if (get().expiresAt != null && Date.now() >= get().expiresAt!) return get().doRefreshToken()
          try {
            const result = await authService.validateSession()
            if (!current()) return !!get().accessToken
            if (result.isValid) return false // The failing business request does not invalidate auth.
          } catch (error: any) {
            if (!current()) return !!get().accessToken
            if (error?.response?.status !== 401) return false
          }
          if (get().storedRefreshToken) return get().doRefreshToken()
          get().clearAuth()
          return false
        })()
        recovery = { token: failedToken, promise: task }
        void task.finally(() => { if (recovery?.promise === task) recovery = null })
        return task
      },
      clearAuth: () => {
        authGeneration++
        initializedToken = null
        clearRefreshTimer()
        set({ ...initialState, isLoading: false })
      },

      clearError: () => set({ error: null }),

      setMustChangePassword: (value: boolean) => set({ mustChangePassword: value }),

      getAccessToken: () => get().accessToken,
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        storedRefreshToken: state.storedRefreshToken,
        expiresAt: state.expiresAt,
        user: state.user,
        mustChangePassword: state.mustChangePassword,
      }),
    }
  )
)

// ─── Selector Hooks (for performance) ───────────────────────

export const selectUser = (state: AuthStore): UserInfo | null => state.user
export const selectIsAuthenticated = (state: AuthStore): boolean => state.isAuthenticated
export const selectIsLoading = (state: AuthStore): boolean => state.isLoading
export const selectAuthError = (state: AuthStore): string | null => state.error
