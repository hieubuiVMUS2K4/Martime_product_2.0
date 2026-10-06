import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
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

export function AccountManagementPage() {
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
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="h-5 w-5" />
            {t('accountManagement.accessDenied')}
          </div>
          <p className="mt-2 text-sm">{t('accountManagement.accessDeniedDescription')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white">
      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">{t('accountManagement.listTitle')}</span>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
              {filteredUsers.length} / {users.length}
            </span>
          </div>
        <button
          type="button"
          onClick={() => void loadData(true)}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('accountManagement.refresh')}
        </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-blue-50">
                <th className="w-12 border-b border-r border-gray-200 px-2 py-2 text-center text-xs font-semibold uppercase text-gray-600">#</th>
                <th className="min-w-[180px] border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">{t('accountManagement.columns.account')}</th>
                <th className="min-w-[220px] border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">{t('accountManagement.columns.crew')}</th>
                <th className="w-56 border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">Chức danh</th>
                <th className="w-44 border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">{t('accountManagement.columns.lastLogin')}</th>
                <th className="w-32 border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">{t('accountManagement.columns.status')}</th>
                <th className="w-52 border-b border-gray-200 px-3 py-2 text-center text-xs font-semibold uppercase text-gray-600">{t('accountManagement.columns.actions')}</th>
              </tr>
              <tr className="border-b border-gray-200 bg-white">
                <th className="border-r border-gray-200"></th>
                <th className="border-r border-gray-200 px-2 py-1" colSpan={2}>
                  <div className="flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-1">
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={t('accountManagement.searchPlaceholder')}
                      className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                    />
                    <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  </div>
                </th>
                <th className="border-r border-gray-200"></th>
                <th className="border-r border-gray-200"></th>
                <th className="border-r border-gray-200"></th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    {t('accountManagement.loading')}
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                    {t('accountManagement.noAccounts')}
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((item, index) => {
                  const isBusy = busyUserId === item.id
                  const rowNumber = (safePage - 1) * PAGE_SIZE + index + 1
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors hover:bg-blue-50 ${index % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}
                    >
                      <td className="border-r border-gray-200 px-2 py-2 text-center text-xs text-gray-500">
                        {rowNumber}
                      </td>
                      <td className="border-r border-gray-200 px-3 py-2">
                        <div className="font-semibold text-gray-900">{item.username}</div>
                        <div className="text-xs text-gray-500">ID {item.id}</div>
                      </td>
                      <td className="border-r border-gray-200 px-3 py-2">
                        <div className="text-gray-900">{item.fullName || '-'}</div>
                        <div className="text-xs text-gray-500">{item.crewId || item.position || '-'}</div>
                      </td>
                      <td className="border-r border-gray-200 px-3 py-2">
                        <span className="text-gray-900" title={item.crewId ? 'Chức danh được quản lý trên bờ và đồng bộ xuống tàu' : undefined}>
                          {item.rankName || (item.crewId ? 'Chưa có chức danh' : '—')}
                        </span>
                      </td>
                      <td className="border-r border-gray-200 px-3 py-2 text-gray-600">{formatDateTime(item.lastLoginAt)}</td>
                      <td className="border-r border-gray-200 px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                            item.isActive
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${item.isActive ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                          {item.isActive ? t('accountManagement.status.active') : t('accountManagement.status.locked')}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleResetPassword(item)}
                            disabled={isBusy}
                            className="inline-flex h-8 items-center gap-1.5 rounded border border-gray-300 px-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            {t('accountManagement.actions.reset')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleActive(item)}
                            disabled={isBusy || item.id === currentUser?.id}
                            className="inline-flex h-8 items-center gap-1.5 rounded border border-gray-300 px-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {item.isActive ? t('accountManagement.actions.lock') : t('accountManagement.actions.unlock')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-2 text-xs text-gray-600">
          <div>
            {t('accountManagement.pagination.showing', {
              start: pageStart,
              end: pageEnd,
              total: filteredUsers.length,
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={safePage <= 1}
              className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('accountManagement.pagination.previous')}
            </button>
            <span>
              {t('accountManagement.pagination.page', { current: safePage, total: totalPages })}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={safePage >= totalPages}
              className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('accountManagement.pagination.next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
