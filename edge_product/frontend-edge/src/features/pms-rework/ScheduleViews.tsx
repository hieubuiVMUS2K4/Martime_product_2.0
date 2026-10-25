import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TablePagination } from '@/components/common/DataTable'
import { pms, usePmsPermissions, usePmsQuery, usePmsRefresh, usePmsClock } from './data'
import { Badge, Grid, input, button, useAction, ErrorBox, type GridColumn } from './ui'
import { vesselDate, vesselMidnight } from './time'
import type { Counter } from './types'
export function ScheduleViews({ equipmentAssetId, mode }: { equipmentAssetId: string; mode: 'calendar' | 'gantt' }) {
  const settings = usePmsQuery(['settings'], pms.settings)
  const zone = settings.data?.vesselTimeZone
  const [month, setMonth] = useState(''), [page, setPage] = useState(1)
  useEffect(() => { if (zone && !month) setMonth(vesselDate(new Date().toISOString(), zone).slice(0, 7)) }, [zone, month])
  const days = month ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate() : 0
  const prefix = month ? (new Date(month+'-01T00:00:00Z').getUTCDay()+6)%7 : 0
  const next = month ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 10) : ''
  const params = { page, pageSize: 100, status: 'ALL', equipmentAssetId: equipmentAssetId || undefined, dueFrom: month && zone ? vesselMidnight(`${month}-01`, zone) : undefined, dueTo: next && zone ? new Date(Date.parse(vesselMidnight(next, zone)) - 1).toISOString() : undefined }
  const query = usePmsQuery(['schedule', params], () => pms.orders(params), !!month && !!zone)
  useEffect(() => setPage(1), [equipmentAssetId])
  if (settings.error) return <ErrorBox error={settings.error} retry={() => void settings.refetch()} />
  return <div className="flex min-h-0 flex-1 flex-col"><div className="flex items-center gap-3 border-b border-gray-200 px-3 py-2"><label className="text-xs">Tháng <input className={`${input} ml-2 inline-block w-40`} type="month" value={month} onChange={e => { setMonth(e.target.value); setPage(1) }} /></label><span className="text-xs text-gray-500">{zone || 'Đang tải múi giờ…'} · Hiển thị WO có hạn ngày; WO chỉ theo giờ xem tại Work Order.</span></div>
    {query.error ? <ErrorBox error={query.error} /> : <div className="min-h-0 flex-1 overflow-auto p-3" aria-busy={query.isFetching}>{mode === 'calendar' ? <div className="grid grid-cols-7 gap-px border border-gray-200 bg-gray-200">{['T2','T3','T4','T5','T6','T7','CN'].map(s=><div key={s} className="bg-blue-50 p-2 text-center text-xs font-medium">{s}</div>)}{Array.from({length:prefix},(_,i)=><div key={"blank-"+i} className="bg-gray-50"/>)}{Array.from({ length: days }, (_, i) => { const day = `${month}-${String(i + 1).padStart(2, '0')}`; return <section key={day} className="min-h-32 bg-white p-2"><h3 className="mb-2 text-xs font-medium text-gray-600">{i + 1}</h3>{query.data?.items.filter(w => w.dueAt && vesselDate(w.dueAt, zone!) === day).map(w => <Link title={w.name} key={w.id} to={`/pms/work-orders/${w.id}`} className="mb-1 block rounded border border-blue-100 bg-blue-50 p-1.5 text-xs text-blue-700"><span className="block truncate">{w.name}</span><Badge value={w.status} /></Link>)}</section> })}</div> : <div className="min-w-max"><div className="flex border-b border-gray-200 bg-blue-50 text-xs"><div className="sticky left-0 z-20 w-72 shrink-0 bg-blue-50 px-3 py-2 font-medium">Tên công việc / mốc hạn</div>{Array.from({ length: days }, (_, i) => <div key={i} className="w-10 shrink-0 border-r border-gray-200 py-2 text-center">{i + 1}</div>)}</div>{query.data?.items.map(w => { const index = w.dueAt ? Number(vesselDate(w.dueAt, zone!).slice(-2)) - 1 : 0; return <div className="flex border-b border-gray-100 text-xs" key={w.id}><Link className="sticky left-0 z-10 w-72 shrink-0 truncate bg-white px-3 py-3 text-blue-600" to={`/pms/work-orders/${w.id}`} title={w.name}>{w.name}</Link><div className="relative h-10 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px)] bg-[length:40px_100%]" style={{ width: days * 40 }}><Link to={`/pms/work-orders/${w.id}`} title={`${w.name} · ${w.dueAt ? vesselDate(w.dueAt, zone!) : ''}`} className="absolute top-3 h-4 w-8 rounded bg-blue-400" style={{ left: index * 40 + 4 }} /></div></div> })}</div>}{!query.data?.items.length && <p className="p-6 text-center text-xs text-gray-400">{query.isFetching ? 'Đang tải…' : 'Không có WO có hạn ngày trong tháng này.'}</p>}</div>}
    <TablePagination page={page} pageSize={100} totalItems={query.data?.total || 0} onPageChange={setPage} />
  </div>
}
export function CounterView({ equipmentAssetId }: { equipmentAssetId: string }) {
  const {date}=usePmsClock(); const access = usePmsPermissions(); const [filters, setFilters] = useState<Record<string, string>>({}), [settled, setSettled] = useState(filters), [page, setPage] = useState(1)
  const [values, setValues] = useState<Record<string, string>>({}); const action = useAction(); const refresh = usePmsRefresh()
  useEffect(() => { const timer = setTimeout(() => setSettled(filters), 300); return () => clearTimeout(timer) }, [filters])
  useEffect(() => { setPage(1); setValues({}) }, [equipmentAssetId])
  const params = { page, pageSize: 20, ...settled, equipmentAssetId: equipmentAssetId || undefined }
  const query = usePmsQuery(['counters', params], () => pms.counters(params), access.counter('view'))
  const columns: GridColumn<Counter>[] = [
    { key: 'name', title: 'Thiết bị', filter: 'name', width: 300, fixed: 'left', render: a => <span title={a.assetName}>{a.assetName}</span> },
    { key: 'code', title: 'Mã thiết bị', filter: 'code', width: 180, render: a => a.assetCode },
    { key: 'hours', title: 'Giờ chạy hiện tại', render: a => a.currentRunningHours ?? '—' },
    { key: 'last', title: 'Cập nhật cuối', width: 200, render: a => date(a.lastRunningHoursUpdate) },
    { key: 'new', title: 'Giờ chạy mới', width: 160, render: a => access.counter('update') ? <input className={input} type="number" min={a.currentRunningHours ?? 0} step="any" aria-label={`Giờ chạy mới ${a.assetName}`} value={values[a.id] || ''} onChange={e => setValues(v => ({ ...v, [a.id]: e.target.value }))} /> : '—' },
    { key: 'actions', title: 'Hành động', width: 100, fixed: 'right', render: a => access.counter('update') && <button className={button} disabled={action.busy || !values[a.id] || !Number.isFinite(Number(values[a.id])) || Number(values[a.id]) < (a.currentRunningHours || 0)} onClick={() => void action.run(async () => { await pms.updateCounter(a.id, Number(values[a.id])); setValues(v => ({ ...v, [a.id]: '' })); await refresh() }, 'Đã cập nhật giờ chạy.')}>Lưu</button> },
  ]
  return <Grid columns={columns} result={query.data} error={query.error} loading={query.isFetching} filters={filters} setFilter={(key, value) => { setFilters(f => ({ ...f, [key]: value })); setPage(1) }} page={page} pageSize={20} setPage={setPage} sort="name" descending={false} setSort={() => {}} />
}
