import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { LogOut, ShieldCheck, ChevronDown } from 'lucide-react'

/** Nút tài khoản ở góc phải thanh điều hướng: tên, vai trò, đăng xuất. */
export function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const handleLogout = useCallback(() => {
    setLoggingOut(true)
    logout()
    navigate('/login')
  }, [logout, navigate])

  if (!user) return null
  const initial = user.username.charAt(0).toUpperCase()

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-10 items-center gap-2.5 rounded-md pl-1.5 pr-2 transition-colors hover:bg-white/10 ${open ? 'bg-white/15' : ''}`}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-white ring-2 ring-white/20">
          {initial}
        </span>
        <span className="hidden flex-col items-start leading-tight xl:flex">
          <span className="text-[13px] font-semibold text-white">{user.username}</span>
          {user.role && <span className="text-[11px] uppercase tracking-wide text-white/60">{user.role}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 text-white/60 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-[1200] mt-2 w-64 overflow-hidden rounded-lg border border-line bg-surface shadow-2xl">
          <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-base font-bold text-white">{initial}</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink">{user.username}</div>
              {user.role && (
                <span className="mt-0.5 inline-flex items-center gap-1 rounded bg-primary-soft px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" /> {user.role}
                </span>
              )}
            </div>
          </div>
          <div className="p-1">
            <button
              type="button"
              role="menuitem"
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-sm text-red-600 hover:bg-danger-soft disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {loggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
