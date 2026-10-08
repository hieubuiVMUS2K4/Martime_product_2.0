import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { useTranslationSafe } from '@/contexts/I18nContext'
import { auditLogService, type AuditLogEntry, type AuditLogStats, type AuditLogFilterOptions } from '@/services/maritime.service'
import { DataTable, TableActions, type Column } from '@/components/common/DataTable'
import {
  Shield,
  BarChart3,
  User,
  Database,
  AlertTriangle,
  Info,
  Ban,
  Eye,
  X,
  ChevronDown,
} from 'lucide-react'
import { format, parseISO, subDays } from 'date-fns'

// ─── Constants ───────────────────────────────────────────

const LEVEL_CONFIG: Record<string, { label: string; color: string; bg: string; icon: typeof Info }> = {
  DEBUG:    { label: 'Gỡ lỗi',      color: 'text-gray-500',   bg: 'bg-gray-100 dark:bg-gray-800',     icon: Info },
  INFO:     { label: 'Thông tin',   color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/30',   icon: Info },
  WARNING:  { label: 'Cảnh báo',    color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-900/30', icon: AlertTriangle },
  ERROR:    { label: 'Lỗi',         color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/30',     icon: AlertTriangle },
  CRITICAL: { label: 'Nghiêm trọng', color: 'text-red-700',   bg: 'bg-red-100 dark:bg-red-900/50',    icon: Ban },
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  AUTH:       { label: 'Đăng nhập', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  SECURITY:   { label: 'Bảo mật',   color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  DATA:       { label: 'Dữ liệu',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  SYSTEM:     { label: 'Hệ thống',  color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
  NAVIGATION: { label: 'Hành hải',  color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300' },
  SAFETY:     { label: 'An toàn',   color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Đăng nhập',
  LOGIN_FAILED: 'Đăng nhập thất bại',
  LOGOUT: 'Đăng xuất',
  TOKEN_REFRESH: 'Làm mới phiên',
  PASSWORD_CHANGED: 'Đổi mật khẩu',
  ACCOUNT_LOCKED: 'Khóa tài khoản',
  SESSION_REVOKED: 'Thu hồi phiên',
  RECORD_CREATED: 'Tạo mới',
  RECORD_UPDATED: 'Cập nhật',
  RECORD_DELETED: 'Xóa',
  SERVICE_START: 'Khởi động dịch vụ',
  SERVICE_STOP: 'Dừng dịch vụ',
  SYNC_STARTED: 'Bắt đầu đồng bộ',
  SYNC_COMPLETED: 'Đồng bộ xong',
  CREW_CREATED_FROM_SHORE: 'Nhận thuyền viên từ bờ',
}

const levelLabel = (v: string) => LEVEL_CONFIG[v]?.label ?? v
const categoryLabel = (v: string) => CATEGORY_CONFIG[v]?.label ?? v
const actionLabel = (v: string) => ACTION_LABELS[v] ?? v

// Bộ lọc cột Thời gian: khoảng thời gian tính lùi từ hiện tại
const TIME_RANGES = [
  { value: '1', label: '24 giờ qua' },
  { value: '7', label: '7 ngày qua' },
  { value: '30', label: '30 ngày qua' },
  { value: '90', label: '90 ngày qua' },
  { value: '365', label: '12 tháng qua' },
]

type ColumnFilterKey = 'time' | 'level' | 'category' | 'action' | 'username' | 'entityType' | 'message'
type FilterOptions = Omit<AuditLogFilterOptions, 'success'>

// ─── Page Component ───────────────────────────────────────

export function AuditLogPage() {
  const { t } = useTranslationSafe()
  const user = useAuthStore(s => s.user)
  const roleCode = user?.roleCode?.toUpperCase()
  const isAuthorized = roleCode === 'ADMIN' || roleCode === 'CAPTAIN'

  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [stats, setStats] = useState<AuditLogStats | null>(null)
  const [options, setOptions] = useState<FilterOptions>({ categories: [], actions: [], levels: [], entityTypes: [], usernames: [], messages: [] })
  const [loading, setLoading] = useState(true)
  const [showStats, setShowStats] = useState(false)
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)

  // Phân trang, tìm và lọc đều làm ở máy chủ (nhật ký rất nhiều dòng)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Partial<Record<ColumnFilterKey, string[]>>>({})

  const fromDate = (() => {
    const days = filters.time?.map(Number).filter(n => n > 0)
    return days?.length ? subDays(new Date(), Math.max(...days)).toISOString() : undefined
  })()

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await auditLogService.getLogs({
        page,
        pageSize,
        category: filters.category,
        action: filters.action,
        level: filters.level,
        entityType: filters.entityType,
        username: filters.username,
        message: filters.message,
        search: search || undefined,
        from: fromDate,
      })
      setLogs(res.data || [])
      setTotalCount(res.totalCount || 0)
    } catch (err) {
      console.error('Failed to fetch audit logs:', err)
    } finally {
      setLoading(false)
    }
    // fromDate suy ra từ filters.time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, filters, search])

  const fetchStats = async () => {
    try {
      const res = await auditLogService.getStats(fromDate || subDays(new Date(), 7).toISOString(), new Date().toISOString())
      setStats(res)
    } catch (err) {
      console.error('Failed to fetch audit stats:', err)
    }
  }

  useEffect(() => {
    if (isAuthorized) void fetchLogs()
  }, [isAuthorized, fetchLogs])

  useEffect(() => {
    if (!isAuthorized) return
    auditLogService.getFilterOptions().then(({ success: _s, ...rest }) => setOptions(rest)).catch(() => { /* bỏ qua */ })
  }, [isAuthorized])

  const toggleStats = () => {
    if (!showStats) fetchStats()
    setShowStats(!showStats)
  }

  const serverFilter = (key: ColumnFilterKey, values: string[], label: (v: string) => string = v => v) => ({
    options: values.map(v => ({ value: v, label: label(v) })),
    selected: filters[key] ?? null,
    onChange: (next: string[] | null) => {
      setFilters(prev => {
        const copy = { ...prev }
        if (next) copy[key] = next; else delete copy[key]
        return copy
      })
      setPage(1)
    },
  })

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'time', header: 'Thời gian', width: 160, align: 'center', value: l => formatTimestamp(l.timestamp),
      serverFilter: { ...serverFilter('time', []), options: TIME_RANGES },
      render: l => <span className="font-mono text-gray-600 dark:text-gray-400">{formatTimestamp(l.timestamp)}</span>,
    },
    {
      key: 'level', header: 'Mức độ', width: 120, align: 'center', value: l => levelLabel(l.level),
      serverFilter: serverFilter('level', options.levels, levelLabel),
      render: l => {
        const cfg = LEVEL_CONFIG[l.level] || LEVEL_CONFIG.INFO
        const LevelIcon = cfg.icon
        return (
          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${cfg.bg} ${cfg.color}`}>
            <LevelIcon className="h-3 w-3" />{levelLabel(l.level)}
          </span>
        )
      },
    },
    {
      key: 'category', header: 'Nhóm', width: 120, align: 'center', value: l => categoryLabel(l.category),
      serverFilter: serverFilter('category', options.categories, categoryLabel),
      render: l => <span className={`inline-block rounded px-2 py-0.5 font-medium ${(CATEGORY_CONFIG[l.category] || CATEGORY_CONFIG.SYSTEM).color}`}>{categoryLabel(l.category)}</span>,
    },
    { key: 'action', header: 'Thao tác', width: 160, value: l => actionLabel(l.action), serverFilter: serverFilter('action', options.actions, actionLabel) },
    {
      key: 'username', header: 'Người dùng', width: 140, value: l => l.username ?? '', serverFilter: serverFilter('username', options.usernames),
      render: l => l.username || <span className="text-gray-400">—</span>,
    },
    {
      key: 'entityType', header: 'Đối tượng', width: 200, value: l => l.entityType ?? '', serverFilter: serverFilter('entityType', options.entityTypes),
      exportValue: l => [l.entityType, l.entityId].filter(Boolean).join(' #'),
      render: l => l.entityType ? (
        <span>
          <span className="text-gray-700 dark:text-gray-300">{l.entityType}</span>
          {l.entityId && <span className="ml-1 font-mono text-xs text-gray-400">#{truncateId(l.entityId)}</span>}
        </span>
      ) : <span className="text-gray-400">—</span>,
    },
    {
      key: 'message', header: 'Nội dung', value: l => l.message ?? '', truncate: true, serverFilter: serverFilter('message', options.messages),
      className: 'text-gray-500 dark:text-gray-400', render: l => l.message || <span className="text-gray-400">—</span>,
    },
    {
      key: 'detail', header: 'Chi tiết', width: 80, align: 'center', exportable: false,
      render: l => (l.oldValues || l.newValues) ? (
        <TableActions>
          <button type="button" onClick={() => setSelectedLog(l)} title="Xem thay đổi" aria-label="Xem thay đổi"
            className="rounded p-1 text-blue-500 hover:bg-blue-50 dark:hover:bg-gray-700">
            <Eye className="h-3.5 w-3.5" />
          </button>
        </TableActions>
      ) : null,
    },
  ]

  // ─── Guard ─────────────────────────────────────────────

  if (!isAuthorized) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
        <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg max-w-md">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('auditLog.accessDenied')}</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Audit logs are restricted to <strong>Admin</strong> and <strong>Captain</strong> roles only.
          </p>
          <p className="text-xs text-gray-400 mt-3">{t('auditLog.accessDeniedNote')}</p>
        </div>
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-2">
          <Shield className="h-4 w-4 text-blue-600" aria-hidden="true" />
          <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('auditLog.title')}</h1>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{totalCount.toLocaleString('vi-VN')}</span>
          <span className="text-xs italic text-gray-500 dark:text-gray-400">{t('auditLog.subtitle')}</span>
        </div>
        <button
          type="button"
          onClick={toggleStats}
          className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
            showStats
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          {t('auditLog.statistics')}
        </button>
      </div>

      {/* Statistics Panel */}
      {showStats && stats && (
        <div className="shrink-0 border-b border-gray-200 p-4 dark:border-gray-700">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatCard label={t('auditLog.stats.totalEvents')} value={stats.totalCount} icon={Database} color="blue" />
            <StatCard label="Thay đổi dữ liệu" value={stats.byCategory.find(c => c.category === 'DATA')?.count || 0} icon={Database} color="indigo" />
            <StatCard label="Đăng nhập" value={stats.byCategory.find(c => c.category === 'AUTH')?.count || 0} icon={User} color="purple" />
            <StatCard label="Bảo mật" value={stats.byCategory.find(c => c.category === 'SECURITY')?.count || 0} icon={Shield} color="red" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.topUsers.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">{t('auditLog.stats.topActions')}</h4>
                <div className="space-y-1">
                  {stats.topUsers.slice(0, 5).map(u => (
                    <div key={u.username} className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{u.username}</span>
                      <span className="font-mono text-gray-500">{u.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {stats.topEntities.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">{t('auditLog.entityType')}</h4>
                <div className="space-y-1">
                  {stats.topEntities.slice(0, 5).map(e => (
                    <div key={e.entityType} className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{e.entityType}</span>
                      <span className="font-mono text-gray-500">{e.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <DataTable
        flush
        showCount={false}
        loading={loading}
        columns={columns}
        data={logs}
        rowKey={l => l.id}
        itemLabel="sự kiện"
        emptyMessage={t('auditLog.noLogs')}
        searchPlaceholder="Tìm nội dung, đối tượng, người dùng..."
        exportOptions={{ fileName: 'nhat-ky-kiem-toan', title: 'NHẬT KÝ KIỂM TOÁN' }}
        minWidth={1200}
        serverPagination={{
          page,
          pageSize,
          total: totalCount,
          onPageChange: setPage,
          onPageSizeChange: size => { setPageSize(size); setPage(1) },
        }}
        onServerSearch={keyword => { setSearch(keyword); setPage(1) }}
      />

      {/* Detail Modal */}
      {selectedLog && (
        <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  )
}

// ─── Sub-Components ───────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: typeof Database; color: string
}) {
  const colorMap: Record<string, string> = {
    blue:   'text-blue-600 bg-blue-50 dark:bg-blue-900/30',
    indigo: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30',
    purple: 'text-purple-600 bg-purple-50 dark:bg-purple-900/30',
    red:    'text-red-600 bg-red-50 dark:bg-red-900/30',
  }
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
      <div className={`p-2 rounded-lg ${colorMap[color] || colorMap.blue}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value.toLocaleString()}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  )
}

function LogDetailModal({ log, onClose }: { log: AuditLogEntry; onClose: () => void }) {
  const { t } = useTranslationSafe()
  const [showOld, setShowOld] = useState(true)
  const [showNew, setShowNew] = useState(true)

  const oldParsed = tryParseJson(log.oldValues) as Record<string, unknown> | null
  const newParsed = tryParseJson(log.newValues) as Record<string, unknown> | null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-4xl max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('auditLog.details')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {log.entityType} #{truncateId(log.entityId || '')} · {formatTimestamp(log.timestamp)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Meta */}
        <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700/50 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div><span className="text-gray-400">Action:</span> <span className="font-medium text-gray-700 dark:text-gray-300">{ACTION_LABELS[log.action] || log.action}</span></div>
          <div><span className="text-gray-400">User:</span> <span className="font-medium text-gray-700 dark:text-gray-300">{log.username || 'SYSTEM'}</span></div>
          <div><span className="text-gray-400">IP:</span> <span className="font-mono text-gray-600 dark:text-gray-400">{log.ipAddress || '—'}</span></div>
          <div><span className="text-gray-400">Result:</span> <span className="font-medium text-gray-700 dark:text-gray-300">{log.result || '—'}</span></div>
        </div>

        {/* Diff View */}
        <div className="px-6 py-4 overflow-y-auto max-h-[60vh] space-y-4">
          {oldParsed && (
            <div>
              <button
                onClick={() => setShowOld(!showOld)}
                className="flex items-center gap-1 text-sm font-medium text-red-600 dark:text-red-400 mb-2"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showOld ? '' : '-rotate-90'}`} />
                Old Values
              </button>
              {showOld && (
                <pre className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-xs text-red-800 dark:text-red-300 overflow-x-auto font-mono whitespace-pre-wrap">
                  {JSON.stringify(oldParsed, null, 2)}
                </pre>
              )}
            </div>
          )}
          {newParsed && (
            <div>
              <button
                onClick={() => setShowNew(!showNew)}
                className="flex items-center gap-1 text-sm font-medium text-green-600 dark:text-green-400 mb-2"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showNew ? '' : '-rotate-90'}`} />
                New Values
              </button>
              {showNew && (
                <pre className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-xs text-green-800 dark:text-green-300 overflow-x-auto font-mono whitespace-pre-wrap">
                  {JSON.stringify(newParsed, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Diff table (for updates) */}
          {oldParsed && newParsed && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('auditLog.changes')}</h4>
              <table className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="text-left px-3 py-1.5 text-gray-500 dark:text-gray-400 font-medium">Field</th>
                    <th className="text-left px-3 py-1.5 text-red-500 font-medium">Old</th>
                    <th className="text-left px-3 py-1.5 text-green-500 font-medium">New</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {Object.keys(newParsed).map(key => {
                    const oldVal = oldParsed?.[key]
                    const newVal = newParsed?.[key]
                    return (
                      <tr key={key}>
                        <td className="px-3 py-1.5 font-mono text-gray-600 dark:text-gray-400">{key}</td>
                        <td className="px-3 py-1.5 font-mono text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-900/10">
                          {formatValue(oldVal)}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-green-600 dark:text-green-400 bg-green-50/50 dark:bg-green-900/10">
                          {formatValue(newVal)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  try {
    return format(parseISO(ts), 'yyyy-MM-dd HH:mm:ss')
  } catch {
    return ts
  }
}

function truncateId(id: string): string {
  if (id.length <= 12) return id
  return id.substring(0, 8) + '...'
}

function tryParseJson(str?: string): unknown {
  if (!str) return null
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'string') return val
  return JSON.stringify(val)
}
