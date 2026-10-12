import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { Anchor, EyeOff, AlertTriangle, Loader2, Shield, Ship, User, Lock, Info, Compass, Globe, Mail, Phone, MapPin } from 'lucide-react'
import { VESSEL_CONFIG } from '@/config/app.config'

// ============================================================
// LOGIN PAGE - Maritime Split-Panel Design with Background Image
// ============================================================

type PageTab = 'login' | 'about' | 'services' | 'contact'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isLoggingIn, error, clearError, isAuthenticated } = useAuthStore()

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<PageTab>('login')
  const usernameRef = useRef<HTMLInputElement>(null)

  // Entrance animation trigger
  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true })
    }
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
      if (success) {
        navigate(from, { replace: true })
      }
    },
    [username, password, isLoggingIn, login, navigate, from]
  )

  const [currentTime, setCurrentTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="login-page min-h-screen relative overflow-hidden">
      {/* ===== FULL-SCREEN BACKGROUND IMAGE ===== */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'url(/vesselbackground.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {/* Dark overlay for readability */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, rgba(2,6,23,0.65) 0%, rgba(10,20,50,0.55) 40%, rgba(5,15,40,0.50) 60%, rgba(2,6,23,0.70) 100%)',
        }}
      />

      {/* Subtle animated particles / wave overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 320'%3E%3Cpath fill='%233b82f6' d='M0,192L48,186.7C96,181,192,171,288,186.7C384,203,480,245,576,245.3C672,245,768,203,864,181.3C960,160,1056,160,1152,170.7C1248,181,1344,203,1392,213.3L1440,224L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z'%3E%3C/path%3E%3C/svg%3E")`,
          backgroundSize: '100% 250px',
          backgroundRepeat: 'repeat-y',
          animation: 'wave-drift 30s linear infinite',
        }}
      />

      {/* ===== TOP BAR ===== */}
      <div className="relative z-20 flex items-center justify-between px-8 py-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #0891b2 100%)',
              boxShadow: '0 4px 16px -2px rgba(37, 99, 235, 0.4)',
            }}
          >
            <Anchor className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">
            {VESSEL_CONFIG.VESSEL_NAME || 'Maritime Edge'}
          </span>
        </div>

        {/* Tab Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {([
            { key: 'login' as PageTab, label: 'Login' },
            { key: 'about' as PageTab, label: 'About' },
            { key: 'services' as PageTab, label: 'Services' },
            { key: 'contact' as PageTab, label: 'Contact' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                activeTab === tab.key
                  ? 'text-white bg-white/15 border border-white/20'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <span className="font-mono text-sm text-white/50 tabular-nums hidden sm:block">
            {formatDate(currentTime)} — {formatTime(currentTime)} UTC
          </span>
          <span className="font-mono tracking-wider uppercase text-blue-300/70 bg-white/[0.08] px-3 py-1.5 rounded-full border border-white/[0.1] text-xs">
            {VESSEL_CONFIG.IMO_NUMBER ? `IMO ${VESSEL_CONFIG.IMO_NUMBER}` : 'MARITIME EDGE'}
          </span>
        </div>
      </div>

      {/* Mobile Tab Navigation */}
      <div className="relative z-20 flex md:hidden items-center justify-center gap-1 px-4 pb-2">
        {([
          { key: 'login' as PageTab, label: 'Login' },
          { key: 'about' as PageTab, label: 'About' },
          { key: 'services' as PageTab, label: 'Services' },
          { key: 'contact' as PageTab, label: 'Contact' },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
              activeTab === tab.key
                ? 'text-white bg-white/15 border border-white/20'
                : 'text-white/50 hover:text-white hover:bg-white/[0.08]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div
        className={`relative z-10 flex items-center min-h-[calc(100vh-72px)] px-6 sm:px-12 lg:px-20 transition-all duration-700 ease-out ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* ===== LOGIN TAB ===== */}
        {activeTab === 'login' && (
          <>
        {/* LEFT SIDE - Welcome / Branding */}
        <div className="hidden lg:flex flex-col justify-center flex-1 max-w-xl pr-16">
          <div
            className={`transition-all duration-700 delay-200 ease-out ${
              mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-10'
            }`}
          >
            <h1 className="text-5xl xl:text-6xl font-extrabold text-white leading-tight mb-4">
              Welcome!
            </h1>
            <h2 className="text-3xl xl:text-4xl font-bold text-white/90 leading-tight mb-6">
              Electronic Logbook<br />
              <span className="text-transparent bg-clip-text" style={{ backgroundImage: 'linear-gradient(135deg, #60a5fa 0%, #06b6d4 100%)' }}>
                System.
              </span>
            </h2>
            <p className="text-base text-blue-100/60 leading-relaxed max-w-md mb-8">
              Maritime vessel management platform compliant with ISPS Code, ISM Code and IMO MSC.428(98). 
              All access is logged and monitored.
            </p>

            {/* ISPS badges */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-blue-200/80 bg-white/[0.08] border border-white/[0.1]">
                <Shield className="w-3.5 h-3.5 text-amber-400/80" />
                ISPS Code
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-blue-200/80 bg-white/[0.08] border border-white/[0.1]">
                <Ship className="w-3.5 h-3.5 text-cyan-400/80" />
                ISM Code
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold text-blue-200/80 bg-white/[0.08] border border-white/[0.1]">
                <Anchor className="w-3.5 h-3.5 text-blue-400/80" />
                IMO MSC.428(98)
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE - Login Form Card */}
        <div
          className={`w-full max-w-[440px] mx-auto lg:mx-0 lg:ml-auto transition-all duration-700 delay-300 ease-out ${
            mounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10'
          }`}
        >
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(160deg, rgba(15,23,60,0.85) 0%, rgba(10,18,50,0.90) 50%, rgba(8,15,40,0.92) 100%)',
              backdropFilter: 'blur(40px) saturate(1.5)',
              WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
              boxShadow: '0 32px 64px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 0 rgba(255,255,255,0.06)',
            }}
          >
            {/* Top accent line */}
            <div
              className="h-[2px] w-full"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, #3b82f6 25%, #06b6d4 50%, #3b82f6 75%, transparent 100%)',
                opacity: 0.7,
              }}
            />

            {/* Card Header */}
            <div className="px-8 pt-10 pb-2 text-center">
              {/* Mobile: show vessel name */}
              <div className="lg:hidden mb-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, #2563eb 0%, #0891b2 100%)',
                      boxShadow: '0 4px 16px -2px rgba(37, 99, 235, 0.4)',
                    }}
                  >
                    <Anchor className="w-5 h-5 text-white" />
                  </div>
                </div>
                <h2 className="text-lg font-bold text-white/90">
                  {VESSEL_CONFIG.VESSEL_NAME || 'Maritime Edge'}
                </h2>
              </div>

              <h2 className="text-2xl font-bold text-white tracking-tight">
                Sign In
              </h2>
              <p className="text-sm text-blue-200/50 mt-2">
                Access your vessel management dashboard
              </p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="px-8 pt-6 pb-8">
              {/* Error Alert */}
              {error && (
                <div
                  className="mb-5 px-4 py-3 rounded-xl flex items-start gap-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(239, 68, 68, 0.08) 100%)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    animation: 'shake 0.4s ease-out, fadeSlideIn 0.3s ease-out',
                  }}
                >
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-300/90">{error}</p>
                </div>
              )}

              {/* Username Field */}
              <div className="mb-5">
                <label
                  htmlFor="username"
                  className="block text-xs font-bold text-blue-200/50 uppercase tracking-[0.12em] mb-2"
                >
                  Username / Officer ID
                </label>
                <div className="relative group">
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
                    className="login-input w-full h-[48px] pl-4 pr-11 text-white text-sm placeholder-white/25
                             bg-transparent border-b-2 border-white/15
                             focus:outline-none focus:border-blue-400/70
                             hover:border-white/25
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-300"
                    style={{
                      backgroundColor: 'transparent',
                      WebkitTextFillColor: '#ffffff',
                    }}
                  />
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-white/25 group-focus-within:text-blue-400/60 transition-colors duration-200 pointer-events-none" />
                </div>
              </div>

              {/* Password Field */}
              <div className="mb-8">
                <label
                  htmlFor="password"
                  className="block text-xs font-bold text-blue-200/50 uppercase tracking-[0.12em] mb-2"
                >
                  Password
                </label>
                <div className="relative group">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    disabled={isLoggingIn}
                    autoComplete="off"
                    className="login-input w-full h-[48px] pl-4 pr-11 text-white text-sm placeholder-white/25
                             bg-transparent border-b-2 border-white/15
                             focus:outline-none focus:border-blue-400/70
                             hover:border-white/25
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-300"
                    style={{
                      backgroundColor: 'transparent',
                      WebkitTextFillColor: '#ffffff',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1
                             text-white/25 hover:text-white/70
                             transition-all duration-200"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-[18px] h-[18px]" />
                    ) : (
                      <Lock className="w-[18px] h-[18px]" />
                    )}
                  </button>
                </div>
              </div>

              {/* ISPS Security Notice - compact */}
              <div
                className="mb-6 px-3 py-2.5 rounded-lg flex items-center gap-2.5"
                style={{
                  background: 'rgba(245, 158, 11, 0.06)',
                  border: '1px solid rgba(245, 158, 11, 0.12)',
                }}
              >
                <Shield className="w-3.5 h-3.5 text-amber-400/80 flex-shrink-0" />
                <p className="text-xs leading-[1.5] text-amber-100/60">
                  ISPS compliant. All sessions are logged per IMO MSC.428(98).
                </p>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoggingIn || !username.trim() || !password.trim()}
                className="group relative w-full h-[50px] text-white font-semibold text-[0.9375rem] rounded-xl
                         disabled:opacity-35 disabled:cursor-not-allowed
                         focus:outline-none focus:ring-2 focus:ring-rose-400/50 focus:ring-offset-2 focus:ring-offset-transparent
                         transition-all duration-300 
                         active:scale-[0.98]
                         overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #e11d48 0%, #be123c 50%, #9f1239 100%)',
                  boxShadow: '0 8px 24px -4px rgba(225, 29, 72, 0.4), 0 0 0 1px rgba(255,255,255,0.05)',
                }}
                onMouseEnter={(e) => {
                  if (!isLoggingIn) {
                    e.currentTarget.style.boxShadow =
                      '0 12px 32px -4px rgba(225, 29, 72, 0.55), 0 0 0 1px rgba(255,255,255,0.1)'
                    e.currentTarget.style.background =
                      'linear-gradient(135deg, #f43f5e 0%, #e11d48 50%, #be123c 100%)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow =
                    '0 8px 24px -4px rgba(225, 29, 72, 0.4), 0 0 0 1px rgba(255,255,255,0.05)'
                  e.currentTarget.style.background =
                    'linear-gradient(135deg, #e11d48 0%, #be123c 50%, #9f1239 100%)'
                }}
              >
                {/* Hover shine effect */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.1) 45%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.1) 55%, transparent 60%)',
                  }}
                />
                <span className="relative z-10">
                  {isLoggingIn ? (
                    <span className="inline-flex items-center gap-2.5">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Authenticating...
                    </span>
                  ) : (
                    'Sign In'
                  )}
                </span>
              </button>
            </form>
          </div>
        </div>
          </>
        )}

        {/* ===== ABOUT TAB ===== */}
        {activeTab === 'about' && (
          <div className="w-full max-w-4xl mx-auto px-4">
            <div
              className="rounded-2xl overflow-hidden p-8 md:p-12"
              style={{
                background: 'linear-gradient(160deg, rgba(15,23,60,0.85) 0%, rgba(10,18,50,0.90) 50%, rgba(8,15,40,0.92) 100%)',
                backdropFilter: 'blur(40px) saturate(1.5)',
                boxShadow: '0 32px 64px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.08)',
              }}
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #0891b2 100%)' }}>
                  <Info className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-white">About Us</h2>
                  <p className="text-blue-200/50 text-sm">Maritime Edge Electronic Logbook System</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white/90 flex items-center gap-2">
                    <Compass className="w-5 h-5 text-cyan-400" />
                    Our Mission
                  </h3>
                  <p className="text-blue-100/60 leading-relaxed text-sm">
                    Maritime Edge E-Logbook is a comprehensive vessel management platform designed to digitize
                    and streamline maritime operations. Our system ensures full compliance with international
                    maritime regulations while providing an intuitive, modern interface for ship officers and crew.
                  </p>
                  <p className="text-blue-100/60 leading-relaxed text-sm">
                    Built as part of an academic research project (NCKH), this platform demonstrates how
                    modern technology can enhance safety, efficiency, and regulatory compliance in the maritime industry.
                  </p>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white/90 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-amber-400" />
                    Compliance Standards
                  </h3>
                  <div className="space-y-3">
                    {[
                      { code: 'ISPS Code', desc: 'International Ship and Port Facility Security Code', icon: Shield, color: 'text-amber-400' },
                      { code: 'ISM Code', desc: 'International Safety Management Code', icon: Ship, color: 'text-cyan-400' },
                      { code: 'IMO MSC.428(98)', desc: 'Maritime Cyber Risk Management in SMS', icon: Globe, color: 'text-blue-400' },
                    ].map(item => (
                      <div key={item.code} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                        <item.icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${item.color}`} />
                        <div>
                          <p className="text-white/80 text-sm font-medium">{item.code}</p>
                          <p className="text-blue-200/40 text-xs">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== SERVICES TAB ===== */}
        {activeTab === 'services' && (
          <div className="w-full max-w-5xl mx-auto px-4">
            <div
              className="rounded-2xl overflow-hidden p-8 md:p-12"
              style={{
                background: 'linear-gradient(160deg, rgba(15,23,60,0.85) 0%, rgba(10,18,50,0.90) 50%, rgba(8,15,40,0.92) 100%)',
                backdropFilter: 'blur(40px) saturate(1.5)',
                boxShadow: '0 32px 64px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.08)',
              }}
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #0891b2 0%, #2563eb 100%)' }}>
                  <Compass className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-white">Our Services</h2>
                  <p className="text-blue-200/50 text-sm">Comprehensive maritime vessel management features</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { title: 'Electronic Logbook', desc: 'Digital deck, engine, and radio logs with tamper-proof audit trails compliant with IMO regulations.', icon: '📋' },
                  { title: 'Crew Management', desc: 'Complete crew database with rank tracking, watch assignments, and personnel records management.', icon: '👥' },
                  { title: 'Certificate Monitor', desc: 'Track crew certifications, expiry dates, and compliance requirements with automated alerts.', icon: '📜' },
                  { title: 'Voyage Tracking', desc: 'Record voyage details including ports, routes, cargo, and navigation events in real-time.', icon: '🧭' },
                  { title: 'Safety Management', desc: 'ISM Code compliant safety management system with drill records and incident reporting.', icon: '🛡️' },
                  { title: 'Audit & Compliance', desc: 'Comprehensive audit trail logging all system activities per ISPS Code and IMO MSC.428(98).', icon: '📊' },
                  { title: 'Shore-Edge Sync', desc: 'Seamless data synchronization between vessel (edge) and shore-side management systems.', icon: '🔄' },
                  { title: 'Role-Based Access', desc: 'Granular access control with Captain, Officer, Engineer, and Admin role hierarchies.', icon: '🔐' },
                  { title: 'Offline Operation', desc: 'Full functionality even without internet connectivity, with automatic sync when connection is restored.', icon: '📡' },
                ].map((service, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] hover:border-white/[0.12] transition-all duration-300"
                  >
                    <div className="text-2xl mb-3">{service.icon}</div>
                    <h3 className="text-white/90 font-semibold text-sm mb-1.5">{service.title}</h3>
                    <p className="text-blue-200/40 text-xs leading-relaxed">{service.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===== CONTACT TAB ===== */}
        {activeTab === 'contact' && (
          <div className="w-full max-w-3xl mx-auto px-4">
            <div
              className="rounded-2xl overflow-hidden p-8 md:p-12"
              style={{
                background: 'linear-gradient(160deg, rgba(15,23,60,0.85) 0%, rgba(10,18,50,0.90) 50%, rgba(8,15,40,0.92) 100%)',
                backdropFilter: 'blur(40px) saturate(1.5)',
                boxShadow: '0 32px 64px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.08)',
              }}
            >
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 rounded-xl" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)' }}>
                  <Mail className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-white">Contact Us</h2>
                  <p className="text-blue-200/50 text-sm">Get in touch with our development team</p>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-5">
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    <Mail className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-white/80 font-medium text-sm">Email</p>
                      <p className="text-blue-200/50 text-sm">tinhvdth@gmail.com</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    <Phone className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-white/80 font-medium text-sm">Phone</p>
                      <p className="text-blue-200/50 text-sm">+84 0225 3735 138</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    <MapPin className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-white/80 font-medium text-sm">Address</p>
                      <p className="text-blue-200/50 text-sm">Vietnam Maritime University</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white/90">Research Team</h3>
                  <p className="text-blue-100/50 text-sm leading-relaxed">
                    Maritime Edge E-Logbook is developed as part of a scientific research project (NCKH)
                    focused on modernizing maritime vessel management through digital transformation.
                  </p>
                  <div className="p-4 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                    <p className="text-white/70 text-sm font-medium mb-2">Project Details</p>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-blue-200/40">Platform</span>
                        <span className="text-white/60">Maritime Edge E-Logbook v1.1</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-200/40">Tech Stack</span>
                        <span className="text-white/60">React + .NET 8 + PostgreSQL</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-200/40">Architecture</span>
                        <span className="text-white/60">Shore-Edge Sync</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== BOTTOM FOOTER ===== */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-white/30">
          <Ship className="w-3.5 h-3.5" />
          <span className="tracking-wide">ISPS Code &middot; ISM Code &middot; IMO MSC.428(98)</span>
        </div>
        <p className="text-xs text-white/25 tracking-wide">
          Maritime Edge E-Logbook &copy; {new Date().getFullYear()}. All sessions are recorded.
        </p>
      </div>

      {/* ===== DECORATIVE: Compass rose bottom-right ===== */}
      <div className="absolute -bottom-16 -right-16 w-[300px] h-[300px] opacity-[0.04] z-[1]">
        <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="100" cy="100" r="95" stroke="#60a5fa" strokeWidth="0.8" />
          <circle cx="100" cy="100" r="75" stroke="#60a5fa" strokeWidth="0.4" />
          <circle cx="100" cy="100" r="55" stroke="#60a5fa" strokeWidth="0.2" />
          <line x1="100" y1="5" x2="100" y2="195" stroke="#60a5fa" strokeWidth="0.4" />
          <line x1="5" y1="100" x2="195" y2="100" stroke="#60a5fa" strokeWidth="0.4" />
          <polygon points="100,10 106,50 100,38 94,50" fill="#60a5fa" />
          <polygon points="100,190 106,150 100,162 94,150" fill="#60a5fa" />
          <polygon points="10,100 50,94 38,100 50,106" fill="#60a5fa" />
          <polygon points="190,100 150,94 162,100 150,106" fill="#60a5fa" />
          <text x="100" y="7" textAnchor="middle" fill="#60a5fa" fontSize="6" fontWeight="bold">N</text>
          <text x="100" y="199" textAnchor="middle" fill="#60a5fa" fontSize="6" fontWeight="bold">S</text>
          <text x="197" y="102" textAnchor="end" fill="#60a5fa" fontSize="6" fontWeight="bold">E</text>
          <text x="5" y="102" textAnchor="start" fill="#60a5fa" fontSize="6" fontWeight="bold">W</text>
        </svg>
      </div>

      {/* ===== INLINE STYLES FOR ANIMATIONS ===== */}
      <style>{`
        .login-page * {
          /* Prevent dark mode overrides on login page */
        }
        
        .login-input::selection {
          background: rgba(59, 130, 246, 0.3);
        }

        @keyframes wave-drift {
          0% { background-position-y: 0; }
          100% { background-position-y: 250px; }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(2px); }
        }

        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
