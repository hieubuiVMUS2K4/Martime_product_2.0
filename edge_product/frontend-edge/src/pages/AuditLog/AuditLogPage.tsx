import { useEffect, useState, useCallback } from 'react'
import '@/styles/OperationalTheme.css'
import { useAuthStore } from '@/stores/auth.store'
import { useTranslationSafe } from '@/contexts/I18nContext'
import { auditLogService, type AuditLogEntry, type AuditLogStats } from '@/services/maritime.service'
import {
  Shield,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  BarChart3,
  Clock,
  User,
  Database,
  AlertTriangle,
  Info,
  Ban,
  RefreshCw,
  Eye,
  X,
  ChevronDown,
} from 'lucide-react'
import { format, parseISO, subDays } from 'date-fns'

// ─── Constants ───────────────────────────────────────────

const LEVEL_CONFIG: Record<string, { color: string; bg: string; icon: typeof Info }> = {
  DEBUG:    { color: 'text-gray-500',   bg: 'bg-gray-100 dark:bg-gray-800',     icon: Info },
  INFO:     { color: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/30',   icon: Info },
  WARNING:  { color: 'text-amber-600 dark:text-amber-300',  bg: 'bg-amber-50 dark:bg-amber-900/30', icon: AlertTriangle },
  ERROR:    { color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/30',     icon: AlertTriangle },
  CRITICAL: { color: 'text-red-700',    bg: 'bg-red-100 dark:bg-red-900/50',    icon: Ban },
}

const CATEGORY_COLORS: Record<string, string> = {
  AUTH:       'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  SECURITY:   'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  DATA:       'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  SYSTEM:     'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  NAVIGATION: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  SAFETY:     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Login',
  LOGIN_FAILED: 'Login Failed',
  LOGOUT: 'Logout',
  TOKEN_REFRESH: 'Token Refresh',
  PASSWORD_CHANGED: 'Password Changed',
  ACCOUNT_LOCKED: 'Account Locked',
  SESSION_REVOKED: 'Session Revoked',
  RECORD_CREATED: 'Created',
  RECORD_UPDATED: 'Updated',
  RECORD_DELETED: 'Deleted',
  SERVICE_START: 'Service Start',
  SERVICE_STOP: 'Service Stop',
  SYNC_STARTED: 'Sync Started',
  SYNC_COMPLETED: 'Sync Completed',
}

// ─── Page Component ───────────────────────────────────────

export function AuditLogPage() {
  const { t } = useTranslationSafe()
  const user = useAuthStore(s => s.user)
  const roleCode = user?.roleCode?.toUpperCase()
  const isAuthorized = roleCode === 'ADMIN' || roleCode === 'CAPTAIN'

  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [stats, setStats] = useState<AuditLogStats | null>(null)
  const [entityTypes, setEntityTypes] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showStats, setShowStats] = useState(false)
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [pageSize] = useState(50)

  // Filters
  const [showFilters, setShowFilters] = useState(false)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [filterEntityType, setFilterEntityType] = useState('')
  const [filterUsername, setFilterUsername] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // ─── Fetch Functions ───────────────────────────────────

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const res = await auditLogService.getLogs({
        page,
        pageSize,
        category: filterCategory || undefined,
        action: filterAction || undefined,
        level: filterLevel || undefined,
        entityType: filterEntityType || undefined,
        username: filterUsername || undefined,
        search: searchQuery || undefined,
        from: filterFrom || undefined,
        to: filterTo || undefined,
      })
      setLogs(res.data || [])
      setTotalPages(res.totalPages || 1)
      setTotalCount(res.totalCount || 0)
      setCurrentPage(res.currentPage || 1)
    } catch (err) {
      console.error('Failed to fetch audit logs:', err)
    } finally {
      setLoading(false)
    }
  }, [pageSize, filterCategory, filterAction, filterLevel, filterEntityType, filterUsername, searchQuery, filterFrom, filterTo])

  const fetchStats = async () => {
    try {
      const from = filterFrom || subDays(new Date(), 7).toISOString()
      const to = filterTo || new Date().toISOString()
      const res = await auditLogService.getStats(from, to)
      setStats(res)
    } catch (err) {
      console.error('Failed to fetch audit stats:', err)
    }
  }

  const fetchEntityTypes = async () => {
    try {
      const res = await auditLogService.getEntityTypes()
      setEntityTypes(res.entityTypes || [])
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (isAuthorized) {
      fetchLogs(1)
      fetchEntityTypes()
    }
  }, [isAuthorized]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handlers ──────────────────────────────────────────

  const handleSearch = () => fetchLogs(1)
  const handlePageChange = (page: number) => fetchLogs(page)
  const handleRefresh = () => fetchLogs(currentPage)

  const handleClearFilters = () => {
    setFilterCategory('')
    setFilterAction('')
    setFilterLevel('')
    setFilterEntityType('')
    setFilterUsername('')
    setSearchQuery('')
    setFilterFrom('')
    setFilterTo('')
    setTimeout(() => fetchLogs(1), 0)
  }

  const toggleStats = () => {
    if (!showStats) fetchStats()
    setShowStats(!showStats)
  }

  // ─── Guard ─────────────────────────────────────────────

  if (!isAuthorized) {
    return (
      <div className="operations-page operations-surface h-full w-full flex items-center justify-center bg-white dark:bg-gray-800">
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
    <div className="operations-page operations-surface h-full w-full overflow-y-auto bg-white dark:bg-gray-800">
      <div className="w-full p-4 space-y-4">

        {/* Header */}
        <div className="operations-toolbar -mx-4 -mt-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-600" />
            <div>
              <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('auditLog.title')}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('auditLog.subtitle')}
              </p>
            </div>
          </div>
          <div className="operations-actions">
            <button
              onClick={toggleStats}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors flex items-center gap-1.5 ${
                showStats
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              {t('auditLog.statistics')}
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors flex items-center gap-1.5 ${
                showFilters
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <Filter className="w-4 h-4" />
              {t('auditLog.filters')}
            </button>
            <button
              onClick={handleRefresh}
              className="px-3 py-2 text-sm rounded-lg border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Statistics Panel */}
        {showStats && stats && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <StatCard label={t('auditLog.stats.totalEvents')} value={stats.totalCount} icon={Database} color="blue" />
              <StatCard
                label="Data Changes"
                value={stats.byCategory.find(c => c.category === 'DATA')?.count || 0}
                icon={Database}
                color="indigo"
              />
              <StatCard
                label="Auth Events"
                value={stats.byCategory.find(c => c.category === 'AUTH')?.count || 0}
                icon={User}
                color="purple"
              />
              <StatCard
                label="Security Events"
                value={stats.byCategory.find(c => c.category === 'SECURITY')?.count || 0}
                icon={Shield}
                color="red"
              />
            </div>

            {/* Top Users & Top Entities side by side */}
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

        {/* Filters Panel */}
        {showFilters && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('auditLog.category')}</label>
                <select
                  value={filterCategory}
                  onChange={e => setFilterCategory(e.target.value)}
                  className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1.5"
                >
                  <option value="">{t('auditLog.all')}</option>
                  <option value="AUTH">Auth</option>
                  <option value="SECURITY">Security</option>
                  <option value="DATA">Data</option>
                  <option value="SYSTEM">System</option>
                  <option value="NAVIGATION">Navigation</option>
                  <option value="SAFETY">Safety</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('auditLog.level')}</label>
                <select
                  value={filterLevel}
                  onChange={e => setFilterLevel(e.target.value)}
                  className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1.5"
                >
                  <option value="">{t('auditLog.all')}</option>
                  <option value="DEBUG">Debug</option>
                  <option value="INFO">Info</option>
                  <option value="WARNING">Warning</option>
                  <option value="ERROR">Error</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('auditLog.entityType')}</label>
                <select
                  value={filterEntityType}
                  onChange={e => setFilterEntityType(e.target.value)}
                  className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1.5"
                >
                  <option value="">{t('auditLog.all')}</option>
                  {entityTypes.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('auditLog.username')}</label>
                <input
                  type="text"
                  value={filterUsername}
                  onChange={e => setFilterUsername(e.target.value)}
                  placeholder="Filter by user..."
                  className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('auditLog.from')}</label>
                <input
                  type="date"
                  value={filterFrom}
                  onChange={e => setFilterFrom(e.target.value)}
                  className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1.5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('auditLog.to')}</label>
                <input
                  type="date"
                  value={filterTo}
                  onChange={e => setFilterTo(e.target.value)}
                  className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-1.5"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder={t('auditLog.search')}
                  className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 pl-8 pr-3 py-1.5"
                />
              </div>
              <button
                onClick={handleSearch}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Apply
              </button>
              <button
                onClick={handleClearFilters}
                className="px-4 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Log Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Table Header */}
          <div className="operations-section-title flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {totalCount.toLocaleString()} events
              {totalPages > 1 && ` · Page ${currentPage}/${totalPages}`}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-500">{t('auditLog.title')}...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('auditLog.noLogs')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="operations-table w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Time</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Level</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Category</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Action</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">User</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Entity</th>
                    <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Message</th>
                    <th className="text-center px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-16">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {logs.map(log => {
                    const levelCfg = LEVEL_CONFIG[log.level] || LEVEL_CONFIG.INFO
                    const LevelIcon = levelCfg.icon
                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                      >
                        <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 opacity-50" />
                            {formatTimestamp(log.timestamp)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${levelCfg.bg} ${levelCfg.color}`}>
                            <LevelIcon className="w-3 h-3" />
                            {log.level}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[log.category] || CATEGORY_COLORS.SYSTEM}`}>
                            {log.category}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300 text-xs">
                          {ACTION_LABELS[log.action] || log.action}
                        </td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs">
                          {log.username || '—'}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {log.entityType && (
                            <div>
                              <span className="text-gray-700 dark:text-gray-300">{log.entityType}</span>
                              {log.entityId && (
                                <span className="text-gray-400 ml-1 font-mono text-[10px]">#{truncateId(log.entityId)}</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">
                          {log.message || '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {(log.oldValues || log.newValues) && (
                            <button
                              onClick={() => setSelectedLog(log)}
                              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                              title="View changes"
                            >
                              <Eye className="w-3.5 h-3.5 text-blue-500" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                {t('common.previous')}
              </button>
              <div className="flex items-center gap-1">
                {generatePageNumbers(currentPage, totalPages).map((page, i) =>
                  page === '...' ? (
                    <span key={`dots-${i}`} className="px-2 text-gray-400">...</span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page as number)}
                      className={`min-w-[32px] h-8 text-sm rounded-lg border transition-colors ${
                        page === currentPage
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                    >
                      {page}
                    </button>
                  )
                )}
              </div>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {t('common.next')}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

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
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-3xl max-h-[85vh] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="operations-section-title flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('auditLog.details')}</h3>
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

function generatePageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | string)[] = [1]
  if (current > 3) pages.push('...')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i)
  }
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}
