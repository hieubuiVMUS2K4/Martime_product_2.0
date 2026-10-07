import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

// ============================================================
// LOGIN PAGE - Shore Office Maritime Design
// ============================================================

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isLoggingIn, error, clearError, isAuthenticated } = useAuth()

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/vessels'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mounted, setMounted] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (isAuthenticated) navigate(from, { replace: true })
  }, [isAuthenticated, navigate, from])

  useEffect(() => {
    usernameRef.current?.focus()
  }, [])

  useEffect(() => {
    if (error) clearError()
  }, [username, password]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!username.trim() || !password.trim() || isLoggingIn) return
      const success = await login(username.trim(), password)
      if (success) navigate(from, { replace: true })
    },
    [username, password, isLoggingIn, login, navigate, from],
  )

  const [currentTime, setCurrentTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const fmtDate = (d: Date) =>
    d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="login-page" style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      {/* Background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0c4a6e 70%, #0f172a 100%)',
        }}
      />
      {/* Subtle grid pattern */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.03,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Top bar */}
      <div style={{ position: 'relative', zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              boxShadow: '0 4px 16px -2px rgba(37,99,235,0.4)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <span style={{ color: 'white', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em' }}>
            Shore Office
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtDate(currentTime)} — {fmt(currentTime)} UTC
          </span>
          <span
            style={{
              fontFamily: 'monospace',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(147,130,255,0.8)',
              background: 'rgba(255,255,255,0.06)',
              padding: '6px 12px',
              borderRadius: 99,
              border: '1px solid rgba(255,255,255,0.08)',
              fontSize: 11,
            }}
          >
            SHORE MANAGEMENT
          </span>
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          minHeight: 'calc(100vh - 72px)',
          padding: '0 80px',
          transition: 'all 0.7s ease-out',
          opacity: mounted ? 1 : 0,
          transform: mounted ? 'translateY(0)' : 'translateY(32px)',
        }}
      >
        {/* Left - Branding */}
        <div style={{ flex: 1, maxWidth: 560, paddingRight: 64, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div
            style={{
              transition: 'all 0.7s ease-out 0.2s',
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateX(0)' : 'translateX(-40px)',
            }}
          >
            <h1 style={{ fontSize: 52, fontWeight: 800, color: 'white', lineHeight: 1.1, marginBottom: 16 }}>
              Shore Office
            </h1>
            <h2 style={{ fontSize: 32, fontWeight: 700, color: 'rgba(255,255,255,0.9)', lineHeight: 1.2, marginBottom: 24 }}>
              Fleet Management<br />
              <span
                style={{
                  backgroundImage: 'linear-gradient(135deg, #818cf8 0%, #38bdf8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Platform.
              </span>
            </h2>
            <p style={{ fontSize: 15, color: 'rgba(147,197,253,0.5)', lineHeight: 1.7, maxWidth: 440, marginBottom: 32 }}>
              Centralized maritime fleet management platform. Monitor vessels, manage crew,
              track compliance and synchronize data with onboard systems.
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { label: 'Fleet Monitor', icon: '🚢' },
                { label: 'Crew Management', icon: '👥' },
                { label: 'Shore-Edge Sync', icon: '🔄' },
              ].map((badge) => (
                <span
                  key={badge.label}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 99,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'rgba(191,179,255,0.8)',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <span>{badge.icon}</span>
                  {badge.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right - Login Card */}
        <div
          style={{
            width: '100%',
            maxWidth: 440,
            marginLeft: 'auto',
            transition: 'all 0.7s ease-out 0.3s',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateX(0)' : 'translateX(40px)',
          }}
        >
          <div
            style={{
              borderRadius: 16,
              overflow: 'hidden',
              background: 'linear-gradient(160deg, rgba(15,23,60,0.9) 0%, rgba(10,18,50,0.95) 50%, rgba(8,15,40,0.97) 100%)',
              backdropFilter: 'blur(40px) saturate(1.5)',
              boxShadow: '0 32px 64px -12px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 0 rgba(255,255,255,0.06)',
            }}
          >
            {/* Accent line */}
            <div
              style={{
                height: 2,
                background: 'linear-gradient(90deg, transparent 0%, #6366f1 25%, #38bdf8 50%, #6366f1 75%, transparent 100%)',
                opacity: 0.7,
              }}
            />

            {/* Header */}
            <div style={{ padding: '40px 32px 8px', textAlign: 'center' }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: 'white', letterSpacing: '-0.02em' }}>
                Sign In
              </h2>
              <p style={{ fontSize: 14, color: 'rgba(147,197,253,0.4)', marginTop: 8 }}>
                Access shore fleet management dashboard
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} style={{ padding: '24px 32px 32px' }}>
              {/* Error */}
              {error && (
                <div
                  style={{
                    marginBottom: 20,
                    padding: '12px 16px',
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    background: 'linear-gradient(135deg, rgba(239,68,68,0.15) 0%, rgba(239,68,68,0.08) 100%)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    animation: 'login-shake 0.4s ease-out',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" style={{ marginTop: 2, flexShrink: 0 }}>
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <p style={{ fontSize: 14, color: 'rgba(252,165,165,0.9)' }}>{error}</p>
                </div>
              )}

              {/* Username */}
              <div style={{ marginBottom: 20 }}>
                <label
                  htmlFor="username"
                  style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(147,197,253,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}
                >
                  Username
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    ref={usernameRef}
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    disabled={isLoggingIn}
                    autoComplete="off"
                    spellCheck={false}
                    style={{
                      width: '100%',
                      height: 48,
                      paddingLeft: 16,
                      paddingRight: 44,
                      color: 'white',
                      fontSize: 14,
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '2px solid rgba(255,255,255,0.12)',
                      outline: 'none',
                      transition: 'border-color 0.3s',
                    }}
                    onFocus={(e) => (e.target.style.borderBottomColor = 'rgba(99,102,241,0.7)')}
                    onBlur={(e) => (e.target.style.borderBottomColor = 'rgba(255,255,255,0.12)')}
                  />
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(255,255,255,0.2)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              </div>

              {/* Password */}
              <div style={{ marginBottom: 32 }}>
                <label
                  htmlFor="password"
                  style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(147,197,253,0.45)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 8 }}
                >
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    disabled={isLoggingIn}
                    autoComplete="off"
                    style={{
                      width: '100%',
                      height: 48,
                      paddingLeft: 16,
                      paddingRight: 44,
                      color: 'white',
                      fontSize: 14,
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '2px solid rgba(255,255,255,0.12)',
                      outline: 'none',
                      transition: 'border-color 0.3s',
                    }}
                    onFocus={(e) => (e.target.style.borderBottomColor = 'rgba(99,102,241,0.7)')}
                    onBlur={(e) => (e.target.style.borderBottomColor = 'rgba(255,255,255,0.12)')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    style={{
                      position: 'absolute',
                      right: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      padding: 4,
                      color: 'rgba(255,255,255,0.2)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isLoggingIn || !username.trim() || !password.trim()}
                style={{
                  position: 'relative',
                  width: '100%',
                  height: 50,
                  color: 'white',
                  fontWeight: 600,
                  fontSize: 15,
                  borderRadius: 12,
                  border: 'none',
                  cursor: isLoggingIn || !username.trim() || !password.trim() ? 'not-allowed' : 'pointer',
                  opacity: isLoggingIn || !username.trim() || !password.trim() ? 0.35 : 1,
                  background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #4338ca 100%)',
                  boxShadow: '0 8px 24px -4px rgba(79,70,229,0.4), 0 0 0 1px rgba(255,255,255,0.05)',
                  transition: 'all 0.3s',
                  overflow: 'hidden',
                }}
                onMouseEnter={(e) => {
                  if (!isLoggingIn) {
                    e.currentTarget.style.boxShadow = '0 12px 32px -4px rgba(79,70,229,0.55), 0 0 0 1px rgba(255,255,255,0.1)'
                    e.currentTarget.style.background = 'linear-gradient(135deg, #6366f1 0%, #818cf8 50%, #4f46e5 100%)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 8px 24px -4px rgba(79,70,229,0.4), 0 0 0 1px rgba(255,255,255,0.05)'
                  e.currentTarget.style.background = 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #4338ca 100%)'
                }}
              >
                {isLoggingIn ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'login-spin 1s linear infinite' }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                    Authenticating...
                  </span>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          padding: '16px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span style={{ letterSpacing: '0.04em' }}>Shore Fleet Management System</span>
        </div>
        <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.04em' }}>
          Maritime Shore Office &copy; {new Date().getFullYear()}
        </p>
      </div>

      <style>{`
        @keyframes login-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(2px); }
        }
        @keyframes login-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .login-page input::placeholder {
          color: rgba(255,255,255,0.2);
        }
        .login-page input::selection {
          background: rgba(99,102,241,0.3);
        }
      `}</style>
    </div>
  )
}
