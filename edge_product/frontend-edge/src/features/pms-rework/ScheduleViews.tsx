import { translateMessage as tx, messageLocale, useMessageLocale } from '@/i18n/messages'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Save } from 'lucide-react'
import { TablePagination } from '@/components/common/DataTable'
import { pms, usePmsPermissions, usePmsQuery, usePmsRefresh, usePmsClock } from './data'
import { ActionIcon, Badge, Grid, input, useAction, ErrorBox, type GridColumn } from './ui'
import { GanttView } from './GanttView'
import { vesselDate, vesselMidnight } from './time'
import type { Counter } from './types'
export function ScheduleViews({ equipmentAssetId, mode }: { equipmentAssetId: string; mode: 'calendar' | 'gantt' }) {
  useMessageLocale()

  const settings = usePmsQuery(['settings'], pms.settings)
  const zone = settings.data?.vesselTimeZone
  const [month, setMonth] = useState(''), [page, setPage] = useState(1)
  useEffect(() => { if (zone && !month) setMonth(vesselDate(new Date().toISOString(), zone).slice(0, 7)) }, [zone, month])
  const days = month ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate() : 0
  const prefix = month ? (new Date(month+'-01T00:00:00Z').getUTCDay()+6)%7 : 0
  const next = month ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 10) : ''
  const params = { page, pageSize: 100, status: 'ALL', excludeCancelled: true, equipmentAssetId: equipmentAssetId || undefined, dueFrom: month && zone ? vesselMidnight(`${month}-01`, zone) : undefined, dueTo: next && zone ? new Date(Date.parse(vesselMidnight(next, zone)) - 1).toISOString() : undefined }
  const query = usePmsQuery(['schedule', params], () => pms.orders(params), !!month && !!zone)
  useEffect(() => setPage(1), [equipmentAssetId])
  const changeMonth = (value: string) => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) { setMonth(value); setPage(1) } }
  const moveMonth = (offset: number) => { if (month) changeMonth(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + offset, 1)).toISOString().slice(0, 7)) }
  const monthButton = 'inline-flex h-9 w-9 items-center justify-center rounded border border-gray-300 bg-white text-slate-500 hover:bg-blue-50 disabled:opacity-40'
  if (settings.error) return <ErrorBox error={settings.error} retry={() => void settings.refetch()} />
  return <div className="flex min-h-0 flex-1 flex-col bg-white">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2"><span className="mr-1 inline-flex items-center gap-1.5 text-sm font-medium text-gray-700"><CalendarDays size={16} aria-hidden="true" />{tx("pmsRework.month")}</span><button className={monthButton} aria-label={tx("pmsRework.previousMonth")} disabled={!month} onClick={() => moveMonth(-1)}><ChevronLeft size={16} /></button><input type="month" aria-label={tx("pmsRework.selectMonth")} className="h-9 w-44 min-w-0 rounded border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100" value={month} disabled={!zone} onChange={e => changeMonth(e.target.value)} /><button className={monthButton} aria-label={tx("pmsRework.nextMonth")} disabled={!month} onClick={() => moveMonth(1)}><ChevronRight size={16} /></button></div>
      <div className="flex flex-wrap items-center gap-3 text-xs"><span className="text-gray-500">{query.data?.total ?? 0}{" " + tx("pmsRework.wosWithCalendarDeadlinesThisMonth")}</span><Link className="text-blue-600 hover:underline" to="/pms/work-planning?tab=orders" title={tx("pmsRework.calendarAndGanttShowWOsByCalendarDeadline")}>{tx("pmsRework.viewRunningHoursWOs")}</Link></div>
    </div>
    {query.error ? <ErrorBox error={query.error} /> : mode === 'gantt' && zone ? <GanttView orders={query.data?.items || []} days={days} month={month} zone={zone} /> : <div className="min-h-0 flex-1 overflow-auto p-3" aria-busy={query.isFetching}>
      <div className="grid min-w-[630px] grid-cols-7 gap-px border border-[#a3b1bc] bg-[#a3b1bc]">{Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(messageLocale(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i)))).map(day => <div key={day} className="bg-blue-50 p-2 text-center text-xs font-semibold text-gray-600">{day}</div>)}{Array.from({length:prefix},(_,i)=><div key={'blank-'+i} className="bg-gray-50"/>)}{Array.from({ length: days }, (_, i) => {
        const day = `${month}-${String(i + 1).padStart(2, '0')}`
        return <section key={day} className="min-h-32 bg-white p-2"><h3 className="mb-2 text-xs font-medium text-gray-600">{i + 1}</h3>{query.data?.items.filter(w => w.dueAt && vesselDate(w.dueAt, zone!) === day).map(w => <Link title={w.name} key={w.id} to={`/pms/work-orders/${w.id}`} className="mb-1 block rounded border border-blue-100 bg-blue-50 p-1.5 text-xs text-blue-700"><span className="block truncate">{w.name}</span><span className="mb-1 block truncate text-gray-600">{w.assignedName || tx("pmsRework.unassigned")}</span><Badge value={w.status} /></Link>)}</section>
      })}</div>
    </div>}
    {!query.isFetching && !query.error && !query.data?.items.length && <p className="border-t border-gray-200 px-3 py-3 text-center text-xs text-gray-500">{tx("pmsRework.noWOsHaveCalendarDeadlinesThisMonthRunning")}</p>}
    <TablePagination page={page} pageSize={100} totalItems={query.data?.total || 0} onPageChange={setPage} />
  </div>
}
export function CounterView({ equipmentAssetId }: { equipmentAssetId: string }) {
  useMessageLocale()

  const {date}=usePmsClock(); const access = usePmsPermissions(); const [filters, setFilters] = useState<Record<string, string>>({}), [settled, setSettled] = useState(filters), [page, setPage] = useState(1)
  const [values, setValues] = useState<Record<string, string>>({}); const action = useAction(); const refresh = usePmsRefresh()
  useEffect(() => { const timer = setTimeout(() => setSettled(filters), 300); return () => clearTimeout(timer) }, [filters])
  useEffect(() => { setPage(1); setValues({}) }, [equipmentAssetId])
  const params = { page, pageSize: 20, ...settled, equipmentAssetId: equipmentAssetId || undefined }
  const query = usePmsQuery(['counters', params], () => pms.counters(params), access.counter('view'))
  const columns: GridColumn<Counter>[] = [
    { key: 'name', title: tx("pmsRework.equipment"), filter: 'name', width: 300, fixed: 'left', render: a => <span title={a.assetName}>{a.assetName}</span> },
    { key: 'code', title: tx("pmsRework.equipmentCode"), filter: 'code', width: 180, render: a => a.assetCode },
    { key: 'hours', title: tx("pmsRework.currentRunningHours"), render: a => a.currentRunningHours ?? '—' },
    { key: 'last', title: tx("pmsRework.lastUpdated"), width: 200, render: a => date(a.lastRunningHoursUpdate) },
    { key: 'new', title: tx("pmsRework.newRunningHours"), width: 160, render: a => access.counter('update') ? <input className={input} type="number" min={a.currentRunningHours ?? 0} step="any" aria-label={tx("pmsRework.newRunningHoursFor", { p0: a.assetName })} value={values[a.id] || ''} onChange={e => setValues(v => ({ ...v, [a.id]: e.target.value }))} /> : '—' },
    { key: 'actions', title: tx("pmsRework.actions"), width: 100, fixed: 'right', render: a => access.counter('update') && <ActionIcon label={tx("pmsRework.saveRunningHoursFor", { p0: a.assetName })} icon={<Save />} disabled={action.busy || !values[a.id] || !Number.isFinite(Number(values[a.id])) || Number(values[a.id]) < (a.currentRunningHours || 0)} onClick={() => void action.run(async () => { await pms.updateCounter(a.id, Number(values[a.id])); setValues(v => ({ ...v, [a.id]: '' })); await refresh() }, tx("pmsRework.runningHoursUpdated"))} /> },
  ]
  return <Grid columns={columns} result={query.data} error={query.error} loading={query.isFetching} filters={filters} setFilter={(key, value) => { setFilters(f => ({ ...f, [key]: value })); setPage(1) }} page={page} pageSize={20} setPage={setPage} sort="name" descending={false} setSort={() => {}} />
}
