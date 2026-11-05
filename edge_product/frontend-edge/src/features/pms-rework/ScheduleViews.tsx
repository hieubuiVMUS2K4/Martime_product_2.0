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
  const [page, setPage] = useState(1)
  const [calendarMonth, setCalendarMonth] = useState('')
  useEffect(() => { if (zone && !calendarMonth) setCalendarMonth(vesselDate(new Date().toISOString(), zone).slice(0, 7)) }, [zone, calendarMonth])
  const nextMonth = calendarMonth ? new Date(Date.UTC(Number(calendarMonth.slice(0, 4)), Number(calendarMonth.slice(5)), 1)).toISOString().slice(0, 10) : ''
  const changeMonth = (value: string) => {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) { setCalendarMonth(value); setPage(1) }
  }
  const moveMonth = (offset: number) => {
    if (calendarMonth) changeMonth(new Date(Date.UTC(Number(calendarMonth.slice(0, 4)), Number(calendarMonth.slice(5)) - 1 + offset, 1)).toISOString().slice(0, 7))
  }
  useEffect(() => { setPage(1) }, [equipmentAssetId, mode])
  const params = { page, pageSize: 100, status: 'ALL', excludeCancelled: true, hasCalendarDeadline: true, equipmentAssetId: equipmentAssetId || undefined,
    dueFrom: mode === 'calendar' && zone && calendarMonth ? vesselMidnight(`${calendarMonth}-01`, zone) : undefined,
    dueTo: mode === 'calendar' && zone && nextMonth ? new Date(Date.parse(vesselMidnight(nextMonth, zone)) - 1).toISOString() : undefined }
  const query = usePmsQuery(['schedule', params], () => pms.orders(params), !!zone && (mode === 'gantt' || !!calendarMonth))
  const currentMonth = zone ? vesselDate(new Date().toISOString(), zone).slice(0, 7) : ''
  const datedMonths = (query.data?.items || []).filter(order => order.dueAt).map(order => vesselDate(order.dueAt!, zone!).slice(0, 7))
  const rangeMonths = [currentMonth, ...datedMonths].filter(Boolean).sort()
  const month = mode === 'calendar' ? calendarMonth : rangeMonths[0] || ''
  const lastMonth = rangeMonths[rangeMonths.length - 1] || month
  const monthCount = mode === 'calendar' ? (month ? 1 : 0) : month ? Math.max(3, (Number(lastMonth.slice(0, 4)) - Number(month.slice(0, 4))) * 12 + Number(lastMonth.slice(5)) - Number(month.slice(5)) + 1) : 0
  const months = Array.from({ length: monthCount }, (_, index) => {
    const start = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + index, 1))
    return { value: start.toISOString().slice(0, 7), days: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate(), prefix: (start.getUTCDay() + 6) % 7 }
  })
  const days = months.reduce((sum, value) => sum + value.days, 0)
  if (settings.error) return <ErrorBox error={settings.error} retry={() => void settings.refetch()} />
  const monthButton = 'inline-flex h-9 w-9 items-center justify-center rounded border border-gray-300 bg-white text-slate-500 hover:bg-blue-50 disabled:opacity-40'
  return <div className="flex min-h-0 flex-1 flex-col bg-white">
    {mode === 'calendar' && <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2.5">
      <CalendarDays size={16} className="text-slate-500" aria-hidden="true" />
      <span className="mr-1 text-sm text-slate-700">{tx('pmsRework.month')}</span>
      <button type="button" className={monthButton} aria-label={tx('pmsRework.previousMonth')} disabled={!calendarMonth} onClick={() => moveMonth(-1)}><ChevronLeft size={16} /></button>
      <input type="month" aria-label={tx('pmsRework.selectMonth')} className="h-9 w-44 rounded border border-gray-300 bg-white px-3 text-sm" value={calendarMonth} disabled={!zone} onChange={event => changeMonth(event.target.value)} />
      <button type="button" className={monthButton} aria-label={tx('pmsRework.nextMonth')} disabled={!calendarMonth} onClick={() => moveMonth(1)}><ChevronRight size={16} /></button>
    </div>}
    {query.error ? <ErrorBox error={query.error} /> : mode === 'gantt' && zone
      ? <GanttView orders={query.data?.items || []} days={days} month={month} zone={zone} />
      : <div className="min-h-0 flex-1 space-y-5 overflow-auto p-3" aria-busy={query.isFetching}>
        {months.map(value => <section key={value.value}>
          <div className="grid min-w-[630px] grid-cols-7 gap-px border border-[#a3b1bc] bg-[#a3b1bc]">
            {Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(messageLocale(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + index)))).map(day => <div key={day} className="bg-blue-50 p-2 text-center text-xs font-semibold text-gray-600">{day}</div>)}
            {Array.from({ length: value.prefix }, (_, index) => <div key={`blank-${index}`} className="bg-gray-50" />)}
            {Array.from({ length: value.days }, (_, index) => {
              const day = `${value.value}-${String(index + 1).padStart(2, '0')}`
              return <section key={day} className="min-h-28 bg-white p-2"><h4 className="mb-2 text-xs font-medium text-gray-600">{index + 1}</h4>
                {query.data?.items.filter(order => order.dueAt && vesselDate(order.dueAt, zone!) === day).map(order => <Link title={order.name} key={order.id} to={`/pms/work-orders/${order.id}`} className="mb-1 block rounded border border-blue-100 bg-blue-50 p-1.5 text-xs text-blue-700"><span className="block truncate">{order.name}</span><span className="mb-1 block truncate text-gray-600">{order.assignedName || tx('pmsRework.unassigned')}</span><Badge value={order.status} /></Link>)}
              </section>
            })}
          </div>
        </section>)}
      </div>}
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
