import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  KeyRound,
  Loader2,
  Lock,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/stores/auth.store'
import { usePermissionsStore } from '@/stores/permissions.store'
import { useTranslationSafe } from '@/contexts/I18nContext'
import type { UserInfo } from '@/types/auth.types'

const ACCOUNT_CACHE_TTL_MS = 30_000
let accountCache: { users: UserInfo[]; fetchedAt: number } | null = null
let accountLoadPromise: Promise<{ users: UserInfo[] }> | null = null
const PAGE_SIZE = 15

function formatDateTime(value?: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

async function fetchAccounts(force = false): Promise<{ users: UserInfo[] }> {
  const now = Date.now()
  if (!force && accountCache && now - accountCache.fetchedAt < ACCOUNT_CACHE_TTL_MS) {
    return { users: accountCache.users }
  }

  if (!force && accountLoadPromise) {
    return accountLoadPromise
  }

  accountLoadPromise = authService.getUsers().then(users => {
    accountCache = { users, fetchedAt: Date.now() }
    return { users }
  }).finally(() => {
    accountLoadPromise = null
  })

  return accountLoadPromise
}

export function AccountManagementPage({ selectedRankId, onSelectUser }: { selectedRankId?: number | null; onSelectUser: (user: UserInfo) => void }) {
  const { user: currentUser } = useAuthStore()
  const { t } = useTranslationSafe()
  const [users, setUsers] = useState<UserInfo[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busyUserId, setBusyUserId] = useState<number | null>(null)

  const canManage = usePermissionsStore(s => s.isAdmin)

  const loadData = useCallback(async (force = false) => {
    if (!canManage) return
    setLoading(true)
    try {
      const { users: nextUsers } = await fetchAccounts(force)
      setUsers(nextUsers)
    } catch (err) {
      toast.error(t('accountManagement.toast.loadFailed'), {
        description: getErrorMessage(err),
      })
    } finally {
      setLoading(false)
    }
  }, [canManage, t])

  useEffect(() => {
    void loadData()
    const timer = window.setInterval(() => void loadData(true), 30000)
    const refresh = () => { void loadData(true) }
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [loadData])

  useEffect(() => {
    setPage(1)
  }, [search])

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return users
    return users.filter((item) => {
      const haystack = [
        item.username,
        item.fullName,
        item.crewId,
        item.roleName,
        item.roleCode,
        item.position,
        item.rankName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [search, users])

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginatedUsers = filteredUsers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const pageStart = filteredUsers.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(safePage * PAGE_SIZE, filteredUsers.length)

  const handleToggleActive = async (targetUser: UserInfo) => {
    setBusyUserId(targetUser.id)
    try {
      await authService.toggleUserActive(targetUser.id)
      toast.success(
        targetUser.isActive
          ? t('accountManagement.toast.accountLocked', { username: targetUser.username })
          : t('accountManagement.toast.accountUnlocked', { username: targetUser.username })
      )
      await loadData(true)
    } catch (err) {
      toast.error(t('accountManagement.toast.toggleFailed'), {
        description: getErrorMessage(err),
      })
    } finally {
      setBusyUserId(null)
    }
  }

  const handleResetPassword = async (targetUser: UserInfo) => {
    setBusyUserId(targetUser.id)
    try {
      const response = await authService.resetPassword({ username: targetUser.username })
      toast.success(
        response.defaultPassword
          ? t('accountManagement.toast.passwordResetWithDefault', {
              username: targetUser.username,
              password: response.defaultPassword,
            })
          : t('accountManagement.toast.passwordReset', { username: targetUser.username })
      )
    } catch (err) {
      toast.error(t('accountManagement.toast.passwordResetFailed'), {
        description: getErrorMessage(err),
      })
    } finally {
      setBusyUserId(null)
    }
  }

  if (!canManage) {
    return <div className="flex items-center gap-2 p-4 text-sm text-gray-500"><Lock className="h-4 w-4" />{t('accountManagement.accessDenied')}</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="shrink-0 border-b border-gray-200 px-4 py-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
          <Users className="h-4 w-4 text-blue-600" />Tài khoản
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{users.length}</span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input aria-label="Tìm tài khoản" value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm tài khoản, thuyền viên…" className="h-9 w-full rounded border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500" />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/60 p-3">
        {loading && !users.length ? <div className="py-8 text-center text-sm text-gray-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />{t('accountManagement.loading')}</div>
          : !filteredUsers.length ? <p className="p-3 text-sm text-gray-500">{t('accountManagement.noAccounts')}</p>
          : paginatedUsers.map(item => {
            const isBusy = busyUserId === item.id
            const sameRank = item.rankId != null && item.rankId === selectedRankId
            return <article key={item.id} className={`mb-3 rounded-lg border bg-white last:mb-0 ${sameRank ? 'border-blue-300' : 'border-gray-200'}`}>
              <button type="button" disabled={isBusy} onClick={() => onSelectUser(item)} className="w-full rounded-t-lg p-3 text-left hover:bg-blue-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-60">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="truncate text-sm font-semibold text-gray-900">{item.fullName || item.username}</div>{item.fullName && <div className="mt-0.5 truncate text-xs text-gray-500">{item.username}</div>}</div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${item.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{item.isActive ? 'Hoạt động' : 'Đã khóa'}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`rounded px-2 py-1 text-xs ${sameRank ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{item.rankName || (item.crewId ? 'Chưa có chức danh' : 'Không gắn thuyền viên')}</span>
                  {item.roleCode?.toUpperCase() === 'ADMIN' && <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">Quản trị hệ thống</span>}
                </div>
                <p className="mt-2 text-[11px] text-gray-400">Đăng nhập: {formatDateTime(item.lastLoginAt)}</p>
              </button>
              <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2">
                <button type="button" onClick={() => void handleResetPassword(item)} disabled={isBusy} className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"><KeyRound className="h-3.5 w-3.5" />Đặt lại mật khẩu</button>
                <button type="button" onClick={() => void handleToggleActive(item)} disabled={isBusy || item.id === currentUser?.id} className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"><ShieldCheck className="h-3.5 w-3.5" />{item.isActive ? 'Khóa' : 'Mở khóa'}</button>
              </div>
            </article>
          })}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-200 px-3 py-2 text-xs text-gray-500">
        <span>{pageStart}–{pageEnd} / {filteredUsers.length}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage(p => Math.max(1,p-1))} disabled={safePage <= 1} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-40">Trước</button>
          <span>{safePage}/{totalPages}</span>
          <button type="button" onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={safePage >= totalPages} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-40">Sau</button>
        </div>
      </div>
    </div>
  )
}
