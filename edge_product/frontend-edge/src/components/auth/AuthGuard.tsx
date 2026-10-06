import { useEffect, useRef } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { registerAuthProvider } from '@/services/api.client'
import { Loader2, Anchor } from 'lucide-react'

// ============================================================
// AUTH GUARD - Protects routes requiring authentication
// Handles: session init, redirect to login, loading state
// ============================================================

/** Register auth provider for API client (runs once at module load) */
let providerRegistered = false

function ensureAuthProvider() {
  if (providerRegistered) return
  providerRegistered = true

  registerAuthProvider(
    () => useAuthStore.getState().accessToken,
    () => useAuthStore.getState().user?.username?.trim() || useAuthStore.getState().user?.fullName?.trim() || null,
    token => useAuthStore.getState().recoverSession(token)
  )
}

// Register immediately on module load (before any component renders)
ensureAuthProvider()

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, initializeAuth } = useAuthStore()
  const location = useLocation()
  const initRef = useRef(false)

  // Initialize auth ONCE on first mount (deduplicated across multiple AuthGuards)
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true
      initializeAuth()
    }
  }, [initializeAuth])

  // Loading state - maritime themed
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-blue-600/20 flex items-center justify-center">
            <Anchor className="w-7 h-7 text-blue-400" />
          </div>
          <div className="flex items-center gap-3 text-blue-300/60">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium tracking-wide">Validating session...</span>
          </div>
        </div>
      </div>
    )
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
