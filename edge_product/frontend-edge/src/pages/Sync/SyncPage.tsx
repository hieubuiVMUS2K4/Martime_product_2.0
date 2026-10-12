import { PermissionGate } from '@/components/auth/PermissionGate'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  RefreshCw, Cloud, Clock, AlertTriangle,
  CheckCircle2, XCircle, Loader2, Database, ArrowUpDown,
  Wifi, WifiOff, Send, RotateCcw, Users, ArrowRight,
  Ship, FileText, Navigation, Calendar, Package, Settings
} from 'lucide-react'
import { ShoreConfigModal } from './ShoreConfigModal'
import { useTranslationSafe } from '@/contexts/I18nContext'
import { syncService } from '@/services/maritime.service'
import type { SnapshotResponse } from '@/services/maritime.service'
import type { SyncQueue } from '@/types/maritime.types'
import { SYNC_CONFIG } from '@/config/app.config'
import { DataTable, type Column } from '@/components/common/DataTable'

type SyncStatus = {
  pendingRecords: number
  lastSyncAt?: string
  isOnline: boolean
  lastConnectionError?: string
  lastConnectionCheckedAt?: string
}

// ============================================================
// TABLE → I18N KEY MAP
// ============================================================
const TABLE_TO_KEY: Record<string, string> = {
  crew_member:          'sync.tables.crewMember',
  crew_certificate:     'sync.tables.crewCertificate',
  certificate:          'sync.tables.certificate',
  rank:                 'sync.tables.rank',
  rank_certificate:     'sync.tables.rankCertificate',
  country:              'sync.tables.country',
  country_certificate:  'sync.tables.countryCertificate',
  service_record:       'sync.tables.serviceRecord',
  crew_member_document: 'sync.tables.crewMemberDocument',
  crew_roster:          'sync.tables.crewRoster',
  travel_document:      'sync.tables.travelDocument',
  seafarer_document:    'sync.tables.seafarerDocument',
  employment_document:  'sync.tables.employmentDocument',
  health_document:      'sync.tables.healthDocument',
  voyage_record:        'sync.tables.voyageRecord',
  noon_report:          'sync.tables.noonReport',
  maritime_report:      'sync.tables.maritimeReport',
  maintenance_task:     'sync.tables.maintenanceTask',
}

type SyncGroupRow = { label: string; total: number; errors: number }

function buildGroups(queue: SyncQueue[], t: (key: string, params?: Record<string, any>) => string): SyncGroupRow[] {
  const map: Record<string, SyncGroupRow> = {}
  for (const item of queue) {
    const key = TABLE_TO_KEY[item.tableName]
    const label = key ? t(key) : item.tableName
    if (!map[label]) map[label] = { label, total: 0, errors: 0 }
    map[label].total++
    if (item.retryCount > 0) map[label].errors++
  }
  return Object.values(map).sort((a, b) => b.total - a.total)
}

// ============================================================
// SYNC CONFIRM MODAL
// ============================================================
function SyncConfirmModal({
  queue, status, syncing, onConfirm, onClose,
}: {
  queue: SyncQueue[]
  status: SyncStatus | null
  syncing: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useTranslationSafe()
  const groups = buildGroups(queue, t)
  const total  = queue.length
  const isOnline = status?.isOnline ?? false
  const failedInQueue = queue.filter(q => q.retryCount > 0).length

  const fmtRelative = (d?: string) => {
    if (!d) return '—'
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
    if (mins < 1) return t('sync.justNow')
    if (mins < 60) return t('sync.minutesAgo', { mins })
    const h = Math.floor(mins / 60)
    return h < 24 ? t('sync.hoursAgo', { hours: h }) : t('sync.daysAgo', { days: Math.floor(h / 24) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!syncing ? onClose : undefined} />

      {/* Modal */}
      <div className="relative flex max-h-[90vh] w-full max-w-4xl mx-3 flex-col overflow-y-auto rounded-lg bg-white shadow-xl">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 text-gray-900">
            <Send className="w-5 h-5" />
            <span className="text-sm font-semibold">{t('sync.confirmTitle')}</span>
            {total > 0 && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                {t('sync.confirmRecordCount', { count: total })}
              </span>
            )}
          </div>
          <button onClick={!syncing ? onClose : undefined} className="text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-40">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Offline warning banner */}
        {!isOnline && (
          <div className="flex items-center gap-3 bg-red-50 border-b border-red-200 px-6 py-3">
            <WifiOff className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span className="text-red-700 text-sm">
              {t('sync.offlineWarning')}
            </span>
          </div>
        )}

        {/* Two-panel body */}
        <div className="flex min-h-[300px]">

          {/* LEFT — Ship/Local */}
          <div className="flex-1 px-6 py-5 border-r border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                <Database className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <div className="text-xs font-bold text-gray-700 tracking-wide">{t('sync.shipLocal')}</div>
                <div className="text-xs text-gray-400">{t('sync.dataWaiting')}</div>
              </div>
            </div>

            {total === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-2" />
                <p className="text-sm text-gray-500 font-medium">{t('sync.noNewData')}</p>
                <p className="text-xs text-gray-400">{t('sync.allSynced')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {groups.map(g => {
                  const widthPct  = Math.max(4, Math.round((g.total / total) * 100))
                  return (
                    <div key={g.label}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700">{g.label}</span>
                        <div className="flex items-center gap-2">
                          {g.errors > 0 && (
                            <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                              {t('sync.errorsCount', { count: g.errors })}
                            </span>
                          )}
                          <span className="text-xs font-semibold text-gray-600 tabular-nums w-5 text-right">
                            {g.total}
                          </span>
                        </div>
                      </div>
                      {/* Slim progress bar — width = proportion of this group vs total */}
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            syncing
                              ? 'bg-blue-400 animate-pulse'
                              : g.errors > 0
                                ? 'bg-amber-400'
                                : 'bg-blue-500'
                          }`}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
                <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                  <span className="text-xs text-gray-400">{t('sync.total')}</span>
                  <span className="text-sm font-bold text-blue-700">{t('sync.confirmRecordCount', { count: total })}</span>
                </div>
              </div>
            )}
          </div>

          {/* MIDDLE — Arrow + connection indicator */}
          <div className="flex flex-col items-center justify-center px-4 py-5 bg-gray-50/50 gap-2">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shadow ${
              syncing ? 'bg-blue-500' : isOnline ? 'bg-emerald-500' : 'bg-red-400'
            }`}>
              {syncing
                ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                : isOnline
                  ? <ArrowRight className="w-4 h-4 text-white" />
                  : <WifiOff className="w-4 h-4 text-white" />
              }
            </div>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className={`w-0.5 h-3 rounded-full transition-colors ${
                  syncing ? 'bg-blue-300 animate-pulse' : isOnline ? 'bg-emerald-200' : 'bg-gray-200'
                }`}
                style={{ opacity: 1 - i * 0.3 }}
              />
            ))}
          </div>

          {/* RIGHT — Shore status */}
          <div className="flex-1 px-6 py-5">
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                isOnline ? 'bg-emerald-100' : 'bg-red-100'
              }`}>
                <Cloud className={`w-4 h-4 ${isOnline ? 'text-emerald-600' : 'text-red-500'}`} />
              </div>
              <div>
                <div className="text-xs font-bold text-gray-700 tracking-wide">{t('sync.shore')}</div>
                <div className="text-xs text-gray-400">{t('sync.receiveStatus')}</div>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                <span className="text-xs text-gray-500">{t('sync.connectionLabel')}</span>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${
                    isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
                  }`} />
                  <span className={`text-xs font-semibold ${
                    isOnline ? 'text-emerald-600' : 'text-red-600'
                  }`}>
                    {isOnline ? t('sync.online') : t('sync.offline')}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                <span className="text-xs text-gray-500">{t('sync.lastSyncLabel')}</span>
                <span className="text-xs font-medium text-gray-700">{fmtRelative(status?.lastSyncAt)}</span>
              </div>

              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                <span className="text-xs text-gray-500">{t('sync.waitingAtShore')}</span>
                <span className={`text-xs font-semibold ${
                  (status?.pendingRecords ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}>
                  {status?.pendingRecords != null ? t('sync.confirmRecordCount', { count: status.pendingRecords }) : '—'}
                </span>
              </div>

              {failedInQueue > 0 && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-amber-700">
                    {t('sync.queueErrors', { count: failedInQueue })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={syncing}
            className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            {t('sync.cancel')}
          </button>
          <PermissionGate permission="sync.update"><button
            onClick={onConfirm}
            disabled={!isOnline || syncing || total === 0}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {syncing
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
            {syncing
              ? t('sync.syncing')
              : !isOnline
                ? t('sync.noConnection')
                : total === 0
                  ? t('sync.noData')
                  : t('sync.syncNowCount', { count: total })
            }
          </button></PermissionGate>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// SNAPSHOT MODAL — select data groups to queue for Shore sync
// ============================================================
const SNAPSHOT_GROUPS = [
  { id: 'ship_data', labelKey: 'sync.groups.shipData',  descKey: 'sync.groups.shipDataDesc',  icon: Ship,       dateFilter: false, color: 'blue'    },
  { id: 'crew',      labelKey: 'sync.groups.crew',      descKey: 'sync.groups.crewDesc',      icon: Users,      dateFilter: false, color: 'emerald' },
  { id: 'pms',       labelKey: 'sync.groups.pms',       descKey: 'sync.groups.pmsDesc',       icon: Package,    dateFilter: false, color: 'orange'  },
  { id: 'voyage',    labelKey: 'sync.groups.voyage',    descKey: 'sync.groups.voyageDesc',    icon: Navigation, dateFilter: true,  color: 'violet'  },
  { id: 'report',    labelKey: 'sync.groups.report',    descKey: 'sync.groups.reportDesc',    icon: FileText,   dateFilter: true,  color: 'amber'   },
] as const

type GroupId = typeof SNAPSHOT_GROUPS[number]['id']

const BORDER_MAP: Record<string, string> = {
  blue:    'border-blue-300 bg-blue-50',
  emerald: 'border-emerald-300 bg-emerald-50',
  orange:  'border-orange-300 bg-orange-50',
  violet:  'border-violet-300 bg-violet-50',
  amber:   'border-amber-300 bg-amber-50',
}

function SnapshotModal({
  onConfirm, onClose,
}: {
  onConfirm: (groups: string[], fromDate?: string, toDate?: string) => Promise<void>
  onClose:   () => void
}) {
  const { t } = useTranslationSafe()
  const [selected,  setSelected]  = useState<Set<GroupId>>(new Set(['ship_data', 'crew']))
  const [fromDate,  setFromDate]  = useState('')
  const [toDate,    setToDate]    = useState('')
  const [loading,   setLoading]   = useState(false)

  const needsDateFilter = SNAPSHOT_GROUPS.some(g => g.dateFilter && selected.has(g.id))

  const toggle = (id: GroupId) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleConfirm = async () => {
    if (selected.size === 0 || loading) return
    setLoading(true)
    try {
      await onConfirm([...selected], fromDate || undefined, toDate || undefined)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!loading ? onClose : undefined} />

      <div className="relative flex max-h-[90vh] w-full max-w-xl mx-3 flex-col overflow-y-auto rounded-lg bg-white shadow-xl">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 text-gray-900">
            <Database className="w-5 h-5" />
            <span className="text-sm font-semibold">{t('sync.snapshotTitle')}</span>
          </div>
          <button onClick={!loading ? onClose : undefined} className="text-gray-400 transition-colors hover:text-gray-600">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Group selector */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('sync.selectGroups')}</p>
            <div className="space-y-2">
              {SNAPSHOT_GROUPS.map(g => {
                const checked = selected.has(g.id)
                const Icon    = g.icon
                return (
                  <div
                    key={g.id}
                    onClick={() => !loading && toggle(g.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all select-none ${
                      checked ? BORDER_MAP[g.color] : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      checked ? 'border-slate-600 bg-slate-700' : 'border-gray-300'
                    }`}>
                      {checked && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <Icon className={`w-4 h-4 flex-shrink-0 ${checked ? 'text-slate-700' : 'text-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-800">{t(g.labelKey)}</div>
                      <div className="text-xs text-gray-500">{t(g.descKey)}</div>
                    </div>
                    {g.dateFilter && (
                      <span className="text-xs text-gray-400 flex-shrink-0 bg-gray-100 px-2 py-0.5 rounded-full">
                        {t('sync.dateFilter')}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Date range — only shown when voyage or report is selected */}
          {needsDateFilter && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">{t('sync.dateRange')}</p>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 block mb-1">{t('sync.fromDate')}</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    disabled={loading}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-50"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 block mb-1">{t('sync.toDate')}</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    disabled={loading}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-50"
                  />
                </div>
              </div>
              <p className="text-xs text-amber-600">💡 {t('sync.dateHint')}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-100">
          <span className="text-xs text-gray-500">{t('sync.groupsSelected', { count: selected.size })}</span>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              {t('sync.cancel')}
            </button>
            <PermissionGate permission="sync.update"><button
              onClick={handleConfirm}
              disabled={loading || selected.size === 0}
              className="flex items-center gap-2 px-5 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              {loading ? t('sync.processing') : t('sync.snapshotCount', { count: selected.size })}
            </button></PermissionGate>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SyncPage() {
  const { t } = useTranslationSafe()

  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [queue, setQueue] = useState<SyncQueue[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoSync, setAutoSync] = useState(SYNC_CONFIG.AUTO_SYNC_ENABLED)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [resetting, setResetting] = useState(false)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [showSnapshotModal, setShowSnapshotModal] = useState(false)
  const [showShoreConfigModal, setShowShoreConfigModal] = useState(false)
  const [snapshotResult, setSnapshotResult] = useState<SnapshotResponse | null>(null)
  const [syncResult, setSyncResult] = useState<{ totalSynced: number; pendingRecords: number } | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const [statusRes, queueRes] = await Promise.all([
        syncService.getSyncStatus(),
        syncService.getSyncQueue(),
      ])
      setStatus(statusRes)
      setQueue(queueRes)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sync data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoSync) return
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [autoSync, fetchData])

  const handleTriggerSync = async () => {
    setSyncing(true)
    setError(null)
    setSyncResult(null)
    try {
      const result = await syncService.triggerSync()
      setSyncResult({ totalSynced: result.totalSynced, pendingRecords: result.pendingRecords })
      setStatus(prev => prev ? { ...prev, pendingRecords: result.pendingRecords } : null)
      await fetchData()
      setShowSyncModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync trigger failed')
      setShowSyncModal(false)
    } finally {
      setSyncing(false)
    }
  }

  const handleResetErrors = async () => {
    setResetting(true)
    setError(null)
    try {
      const result = await syncService.resetErrors()
      await fetchData()
      toast.success(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  const handleSnapshot = async (groups: string[], fromDate?: string, toDate?: string) => {
    setError(null)
    setSnapshotResult(null)
    try {
      const result = await syncService.snapshotGroups(groups, fromDate, toDate)
      setSnapshotResult(result)
      await fetchData()
      setShowSnapshotModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('sync.snapshotFailed'))
      setShowSnapshotModal(false)
    }
  }

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '—'
    const d = new Date(dateStr)
    return d.toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
  }

  const formatRelativeTime = (dateStr?: string) => {
    if (!dateStr) return t('sync.status.pending')
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return t('sync.justNow')
    if (mins < 60) return t('sync.minutesAgo', { mins })
    const hours = Math.floor(mins / 60)
    if (hours < 24) return t('sync.hoursAgo', { hours })
    return t('sync.daysAgo', { days: Math.floor(hours / 24) })
  }

  const getTableDisplayName = (tableName: string) => {
    const keyMap: Record<string, string> = {
      'crew_members': 'sync.tables.crewMember',
      'crew_certificates': 'sync.tables.crewCertificate',
      'voyages': 'sync.tables.voyageRecord',
      'service_records': 'sync.tables.serviceRecord',
      'ranks': 'sync.tables.rank',
      'certificates': 'sync.tables.certificate',
    }
    const key = keyMap[tableName?.toLowerCase()]
    return key ? t(key) : tableName
  }

  const getPriorityColor = (priority: number) => {
    if (priority <= 1) return 'text-red-600 bg-red-50'
    if (priority <= 3) return 'text-amber-600 bg-amber-50'
    return 'text-blue-600 bg-blue-50'
  }

  const getPriorityLabel = (priority: number) => {
    if (priority <= 1) return t('sync.priorityHigh')
    if (priority <= 3) return t('sync.priorityMedium')
    return t('sync.priorityLow')
  }

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        <span className="ml-3 text-sm text-gray-500">{t('sync.loading')}</span>
      </div>
    )
  }

  const pendingCount = status?.pendingRecords ?? 0
  const isOnline = status?.isOnline ?? false
  const failedItems = queue.filter(q => q.retryCount > 0)
  const exhausted = failedItems.filter(q => q.retryCount >= q.maxRetries).length

  const btn = 'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50'
  const btnOutline = `${btn} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`

  const queueColumns: Column<SyncQueue>[] = [
    { key: 'id', header: 'ID', width: 70, numeric: true, filter: false, value: q => q.id, render: q => <span className="font-mono">#{q.id}</span> },
    {
      key: 'table', header: t('sync.table'), width: 180, value: q => getTableDisplayName(q.tableName),
      render: q => (
        <span className="block truncate">
          <span className="font-medium text-gray-900">{getTableDisplayName(q.tableName)}</span>
          {getTableDisplayName(q.tableName) !== q.tableName && <span className="ml-1.5 font-mono text-xs text-gray-400">{q.tableName}</span>}
        </span>
      ),
    },
    { key: 'record', header: t('sync.recordId'), width: 150, value: q => String(q.recordId), className: 'font-mono' },
    {
      key: 'priority', header: t('sync.priority'), width: 100, align: 'center', value: q => getPriorityLabel(q.priority),
      render: q => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getPriorityColor(q.priority)}`}>{getPriorityLabel(q.priority)}</span>,
    },
    {
      key: 'retries', header: t('sync.retries'), width: 85, numeric: true, filter: false, value: q => q.retryCount,
      render: q => <span className={q.retryCount > 0 ? 'font-semibold text-red-600' : 'text-gray-500'}>{q.retryCount}/{q.maxRetries}</span>,
    },
    {
      key: 'created', header: t('sync.createdAt'), width: 150, align: 'center', value: q => q.createdAt,
      filter: q => formatTime(q.createdAt), exportValue: q => formatTime(q.createdAt), render: q => formatTime(q.createdAt),
    },
    {
      key: 'error', header: t('sync.lastError'), value: q => q.lastError ?? '', truncate: false,
      render: q => q.lastError
        ? <span className="block whitespace-pre-line break-words text-xs text-red-600">{q.lastError.split('; ').join('\n')}</span>
        : <span className="text-gray-400">—</span>,
    },
  ]

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white">
      {/* Tiêu đề + thao tác */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-gray-200 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <ArrowUpDown className="h-4 w-4 text-blue-600" aria-hidden="true" />
            {t('sync.title')}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${isOnline ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
            {isOnline ? t('sync.connected') : t('sync.disconnected')}
          </span>
          <span className="text-xs text-gray-500">{t('sync.updatedAt', { time: lastRefresh.toLocaleTimeString('vi-VN') })}</span>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)} className="h-3.5 w-3.5 accent-blue-600" />
            {t('sync.autoRefresh')}
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={fetchData} className={btnOutline}>
            <RefreshCw className="h-3.5 w-3.5" /> {t('sync.refresh')}
          </button>
          {failedItems.length > 0 && (
            <PermissionGate permission="sync.update">
              <button type="button" onClick={handleResetErrors} disabled={resetting} title={t('sync.resetErrorsTitle')}
                className={`${btn} border border-red-200 bg-white text-red-600 hover:bg-red-50`}>
                {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {t('sync.resetErrors', { count: exhausted })}
              </button>
            </PermissionGate>
          )}
          <PermissionGate permission="sync.update">
            <button type="button" onClick={() => setShowSnapshotModal(true)} disabled={syncing} title={t('sync.snapshotDataTitle')} className={btnOutline}>
              <Database className="h-3.5 w-3.5" /> {t('sync.snapshotData')}
            </button>
          </PermissionGate>
          <PermissionGate permission="sync.update">
            <button type="button" onClick={() => setShowShoreConfigModal(true)} className={btnOutline}>
              <Settings className="h-3.5 w-3.5" /> Cấu hình kết nối bờ
            </button>
          </PermissionGate>
          <PermissionGate permission="sync.update">
            <button type="button" onClick={() => setShowSyncModal(true)} disabled={syncing}
              className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {syncing ? t('sync.syncing') : t('sync.syncNow')}
            </button>
          </PermissionGate>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-3">
        <div className="flex min-w-0 flex-col gap-3">
          {/* Thông báo */}
          {snapshotResult && (
            <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm text-teal-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                {snapshotResult.queued > 0
                  ? t('sync.snapshotQueued', { count: snapshotResult.queued.toLocaleString() })
                  : t('sync.snapshotAllQueued')}
                {snapshotResult.groups?.length > 0 && snapshotResult.queued > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {snapshotResult.groups.filter(g => g.count > 0).map(g => (
                      <span key={g.name} className="rounded-full bg-teal-100 px-2 py-0.5 text-xs">{g.label}: {g.count}</span>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setSnapshotResult(null)} className="text-teal-600 hover:text-teal-800" aria-label="Đóng">✕</button>
            </div>
          )}
          {syncResult && !syncing && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="flex-1">{t('sync.syncComplete', { synced: syncResult.totalSynced.toLocaleString(), pending: syncResult.pendingRecords.toLocaleString() })}</span>
              <button type="button" onClick={() => setSyncResult(null)} className="text-green-600 hover:text-green-800" aria-label="Đóng">✕</button>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <XCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={fetchData} className="text-xs font-medium underline hover:text-red-900">{t('sync.retry')}</button>
            </div>
          )}

          {/* Chỉ số */}
          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <header className="border-b border-gray-200 bg-blue-50 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-blue-700">Tình trạng đồng bộ</h2>
            </header>
            <dl className="grid grid-cols-1 gap-px bg-gray-200 sm:grid-cols-2 lg:grid-cols-4">
              <div className="bg-white px-4 py-3">
                <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                  {isOnline ? <Wifi className="h-3.5 w-3.5 text-green-600" /> : <WifiOff className="h-3.5 w-3.5 text-red-600" />}
                  {t('sync.connection')}
                </dt>
                <dd className={`text-lg font-semibold ${isOnline ? 'text-green-700' : 'text-red-700'}`}>
                  {isOnline ? t('sync.connected') : t('sync.disconnected')}
                </dd>
                {!isOnline && status?.lastConnectionError && (
                  <p className="mt-1 line-clamp-2 text-xs text-red-600" title={status.lastConnectionError}>{status.lastConnectionError}</p>
                )}
              </div>
              <div className="bg-white px-4 py-3">
                <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500"><Database className="h-3.5 w-3.5 text-amber-600" />{t('sync.pendingChanges')}</dt>
                <dd className={`text-lg font-semibold tabular-nums ${pendingCount > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{pendingCount.toLocaleString('vi-VN')}</dd>
                <p className="mt-0.5 text-xs text-gray-400">{t('sync.recordsPending')}</p>
              </div>
              <div className="bg-white px-4 py-3">
                <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500"><Clock className="h-3.5 w-3.5 text-blue-600" />{t('sync.lastSync')}</dt>
                <dd className="text-lg font-semibold text-gray-900">{formatRelativeTime(status?.lastSyncAt)}</dd>
                <p className="mt-0.5 text-xs text-gray-400">{formatTime(status?.lastSyncAt)}</p>
              </div>
              <div className="bg-white px-4 py-3">
                <dt className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                  <AlertTriangle className={`h-3.5 w-3.5 ${failedItems.length > 0 ? 'text-red-600' : 'text-gray-400'}`} />{t('sync.syncErrors')}
                </dt>
                <dd className={`text-lg font-semibold tabular-nums ${failedItems.length > 0 ? 'text-red-700' : 'text-gray-900'}`}>{failedItems.length.toLocaleString('vi-VN')}</dd>
                <p className="mt-0.5 text-xs text-gray-400">{t('sync.recordsNeedRetry')}</p>
              </div>
            </dl>
          </section>

          {/* Hàng chờ đồng bộ */}
          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <header className="border-b border-gray-200 bg-blue-50 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-blue-700">{t('sync.queue')} ({queue.length.toLocaleString('vi-VN')})</h2>
            </header>
            <DataTable
              flush
              columns={queueColumns}
              data={queue}
              rowKey={q => q.id}
              itemLabel="bản ghi"
              emptyMessage={`${t('sync.queueEmpty')} ${t('sync.queueEmptyDesc')}`}
              searchPlaceholder="Tìm theo bảng, mã bản ghi, lỗi..."
              exportOptions={{ fileName: 'hang-cho-dong-bo', title: 'HÀNG CHỜ ĐỒNG BỘ LÊN BỜ' }}
            />
          </section>

          {/* Cấu hình */}
          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <header className="flex items-center gap-2 border-b border-gray-200 bg-blue-50 px-4 py-2.5">
              <Cloud className="h-4 w-4 text-blue-700" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-blue-700">{t('sync.syncConfig')}</h2>
            </header>
            <dl className="grid grid-cols-1 gap-px bg-gray-200 sm:grid-cols-3">
              <div className="bg-white px-4 py-3">
                <dt className="mb-1 text-xs font-medium text-gray-500">{t('sync.autoSync')}</dt>
                <dd className={`text-sm font-medium ${SYNC_CONFIG.AUTO_SYNC_ENABLED ? 'text-green-700' : 'text-gray-700'}`}>
                  {SYNC_CONFIG.AUTO_SYNC_ENABLED ? t('sync.enabled') : t('sync.disabled')}
                </dd>
              </div>
              <div className="bg-white px-4 py-3">
                <dt className="mb-1 text-xs font-medium text-gray-500">{t('sync.syncInterval')}</dt>
                <dd className="text-sm font-medium text-gray-900">{Math.floor(SYNC_CONFIG.SYNC_INTERVAL / 60000)} {t('sync.minutes')}</dd>
              </div>
              <div className="bg-white px-4 py-3">
                <dt className="mb-1 text-xs font-medium text-gray-500">{t('sync.maxBatch')}</dt>
                <dd className="text-sm font-medium text-gray-900">{SYNC_CONFIG.MAX_SYNC_BATCH} {t('sync.records')}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      {/* Sync Confirm Modal */}
      {showSyncModal && (
        <SyncConfirmModal
          queue={queue}
          status={status}
          syncing={syncing}
          onConfirm={handleTriggerSync}
          onClose={() => setShowSyncModal(false)}
        />
      )}

      {/* Snapshot Modal */}
      {showSnapshotModal && (
        <SnapshotModal
          onConfirm={handleSnapshot}
          onClose={() => setShowSnapshotModal(false)}
        />
      )}

      {/* Shore Config Modal */}
      {showShoreConfigModal && (
        <ShoreConfigModal onClose={() => setShowShoreConfigModal(false)} />
      )}
    </div>
  )
}
