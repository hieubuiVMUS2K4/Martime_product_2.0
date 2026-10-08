import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.store'
import { LogOut, Shield, ChevronDown, Users } from 'lucide-react'
import { useTranslationSafe } from '@/contexts/I18nContext'

// ============================================================
// USER MENU - Header dropdown for auth actions
// Maritime professional design
// ============================================================

/** Map role codes to display colors */
function getRoleBadgeColor(roleCode?: string): string {
  switch (roleCode?.toUpperCase()) {
    case 'MASTER':
    case 'CAPTAIN':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/20'
    case 'CHIEF_OFFICER':
    case 'CHIEF_ENGINEER':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/20'
    case 'ADMIN':
      return 'bg-red-500/15 text-red-400 border-red-500/20'
    default:
      return 'bg-slate-500/15 text-slate-400 border-slate-500/20'
  }
}

export function UserMenu() {
  const { user, logout } = useAuthStore()
  const { t } = useTranslationSafe()
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true)
    await logout('User initiated logout')
    // Navigation handled by auth guard
  }, [logout])

  if (!user) return null

  const displayName = user.fullName || user.username
  const roleLabel = user.rankName || user.roleName || user.roleCode
  const isAdmin = user.roleCode?.toUpperCase() === 'ADMIN'

  return (
    <div ref={menuRef} className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg 
                   hover:bg-gray-100 dark:hover:bg-gray-700/50 
                   transition-colors duration-150 group"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
          {displayName.charAt(0).toUpperCase()}
        </div>

        {/* Name + Role (hidden on small screens) */}
        <div className="hidden sm:flex flex-col items-start">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 leading-tight">
            {displayName}
          </span>
          {roleLabel && (
            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider leading-tight">
              {roleLabel}
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute right-0 top-full mt-2 w-64 
                     bg-white dark:bg-gray-800 
                     border border-gray-200 dark:border-gray-700 
                     rounded-xl shadow-xl shadow-black/10 dark:shadow-black/30
                     z-50 overflow-hidden
                     animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* User Info Header */}
          <div className="px-4 py-3.5 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shadow-sm">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {displayName}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  @{user.username}
                </p>
              </div>
            </div>
            {/* Role badge */}
            {roleLabel && (
              <div className="mt-2.5">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider border ${getRoleBadgeColor(
                    user.roleCode
                  )}`}
                >
                  <Shield className="w-2.5 h-2.5" />
                  {roleLabel}
                </span>
              </div>
            )}
          </div>

          {/* Menu Items */}
          {isAdmin && (
            <div className="py-1.5">
              <button
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300
                           hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                onClick={() => {
                  setIsOpen(false)
                  navigate('/admin/accounts')
                }}
              >
                <Users className="w-4 h-4 text-gray-400" />
                <span>{t('header.accountManagement')}</span>
              </button>
            </div>
          )}

          {/* Logout */}
          <div className="border-t border-gray-100 dark:border-gray-700 py-1.5">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400
                         hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogOut className="w-4 h-4" />
              <span>{isLoggingOut ? t('header.signingOut') : t('header.signOut')}</span>
            </button>
          </div>

          {/* ISPS Footer */}
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center uppercase tracking-wider">
              {t('header.ispsSession')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
