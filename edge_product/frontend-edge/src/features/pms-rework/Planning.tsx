import { departmentName, departmentNames } from './departments'
import { readableCode } from './presentation'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BarChart3, Calendar, ChevronDown, ChevronRight, ClipboardCheck, ClipboardList, Eye, FolderOpen, Gauge, History, Pencil, Plus, Table2, Trash2 } from 'lucide-react'
import { TableActions } from '@/components/common/DataTable'
import { useEquipment, JobForm, AdHocForm } from './Forms'
import { pms, usePmsPermissions, usePmsQuery, usePmsRefresh, label, cycle, usePmsClock } from './data'
import { ActionIcon, Badge, Grid, button, input, primary, useAction, ErrorBox, type GridColumn } from './ui'
import type { Job, WorkOrder } from './types'
import { JobHistory } from './Reports'
import { ImportJobs } from './ImportJobs'
import { ScheduleViews, CounterView } from './ScheduleViews'
import { serverFilters } from './time'
function useFilters(defaults: Record<string, string>, initialSort: string) {
  const { zone } = usePmsClock()
  const [filters, setFilters] = useState(defaults), [settled, setSettled] = useState(defaults), [page, setPage] = useState(1)
  const [sort, changeSort] = useState(initialSort), [descending, setDescending] = useState(false)
  useEffect(() => { const timer = setTimeout(() => setSettled(filters), 300); return () => clearTimeout(timer) }, [filters])
  return { filters, page, pageSize: 20, sort, descending, setPage,
    setFilter: (key: string, value: string) => { setFilters(f => ({ ...f, [key]: value })); setPage(1) },
    setSort: (key: string, direction?: boolean) => { changeSort(key); setDescending(direction ?? (sort === key ? !descending : false)); setPage(1) },
    params: { ...serverFilters(settled, zone), page, pageSize: 20, sort, descending } }
}
function EquipmentTree({ selected, select }: { selected: string; select: (id: string) => void }) {
  const tree = useEquipment(); const [search, setSearch] = useState(''); const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const nodes = useMemo(() => { const ids = new Set(tree.data?.map(a => a.id)); const result = new Map<string, NonNullable<typeof tree.data>>(); for (const a of tree.data || []) { const parent = a.parentId && ids.has(a.parentId) ? a.parentId : ''; result.set(parent, [...(result.get(parent) || []), a]) } return result }, [tree.data])
  const visited = new Set<string>()
  const render = (parent: string, depth: number): React.ReactNode => nodes.get(parent)?.map(a => {
    if (visited.has(a.id)) return null; visited.add(a.id)
    const hasChildren = !!nodes.get(a.id)?.length, open = search !== '' || expanded.has(a.id)
    const matches = a.assetName.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))
    return <div key={a.id}><button className={`flex w-full items-center gap-1 py-2 pr-2 text-left text-xs hover:bg-blue-50 ${selected === a.id ? 'bg-blue-50 text-blue-600' : 'text-gray-600'}`} style={{ paddingLeft: 8 + depth * 14 }} title={a.assetName} onClick={() => { select(a.id); if (hasChildren) setExpanded(previous => { const next = new Set(previous); next.has(a.id) ? next.delete(a.id) : next.add(a.id); return next }) }} hidden={!!search && !hasChildren && !matches}>
      {hasChildren ? (open ? <ChevronDown size={12} className="shrink-0 text-blue-500" aria-hidden="true" /> : <ChevronRight size={12} className="shrink-0 text-blue-500" aria-hidden="true" />) : <span className="w-3 shrink-0" />}<FolderOpen size={14} className="shrink-0 text-amber-500" aria-hidden="true" /><span className="min-w-0 flex-1 truncate">{a.assetName}</span></button>{open && render(a.id, depth + 1)}</div>
  })
  return <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white max-md:w-44"><button className="flex items-center gap-2 border-b border-gray-200 bg-blue-800 px-3 py-4 text-left text-sm font-semibold text-white" onClick={() => select('')}><FolderOpen size={16} className="shrink-0" aria-hidden="true" />Tất cả thiết bị</button><div className="border-b p-2"><input className={input} placeholder="Tìm thiết bị…" aria-label="Tìm thiết bị" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="min-h-0 flex-1 overflow-auto">{tree.error ? <ErrorBox error={tree.error} retry={() => void tree.refetch()} /> : tree.isLoading ? <p className="p-3 text-xs text-gray-400">Đang tải…</p> : render('', 0)}</div></aside>
}
function Jobs({ equipmentAssetId }: { equipmentAssetId: string }) {
  const {date,due}=usePmsClock(); const access = usePmsPermissions(); const filter = useFilters({}, 'name'); const params = { ...filter.params, equipmentAssetId: equipmentAssetId || undefined }
  const result = usePmsQuery(['jobs', params], () => pms.jobs(params), access.job('view'))
  const refs = usePmsQuery(['job-references'], pms.jobReferences, access.job('view'))
  const [create, setCreate] = useState(false), [history, setHistory] = useState<Job | null>(null), [importing, setImporting] = useState(false)
  const refresh = usePmsRefresh(); const action = useAction()
  const columns: GridColumn<Job>[] = [
    { key: 'name', title: 'Tên công việc', sort: 'name', filter: 'name', placeholder: 'Tên hoặc mã', width: 260, fixed: 'left', render: j => <Link className="text-blue-600 hover:underline" title={`${j.code} · ${j.name}`} to={`/pms/jobs/${j.id}`}>{j.name}</Link> },
    { key: 'equipment', title: 'Tên thiết bị', filter: 'equipment', width: 230, render: j => <span title={j.equipmentName}>{j.equipmentName || '—'}</span> },
    { key: 'category', title: 'Loại / chu kỳ', filter: 'category', width: 180, options: [['', 'Tất cả'], ...['PERIODIC', 'DRY_DOCK', 'ON_DEMAND', 'VOYAGE'].map(s => [s, label[s]] as [string, string])], render: j => <span>{label[j.category]}{j.category === 'PERIODIC' ? ` · ${cycle(j)}` : ''}</span> },
    { key: 'last', title: 'Lần cuối thực hiện', sort: 'lastCompleted', width: 180, render: j => date(j.lastSubmittedAt) },
    { key: 'due', title: 'Hạn tới', sort: 'due', width: 190, dateRange: ['dueFrom', 'dueTo'], render: j => due(j.nextDueAt, j.nextDueHours) },
    { key: 'department', title: 'Bộ phận phụ trách', filter: 'department', options: Object.entries(departmentNames), render: j => departmentName(j.department) },
    { key: 'responsible', title: 'Người chịu trách nhiệm', width: 190, filter: 'responsibleCrewId', options: [['', 'Tất cả'], ...(refs.data?.crew || []).map(c => [c.id, c.fullName] as [string, string])], render: j => j.responsibleName || refs.data?.ranks.find(r => r.id === j.responsibleRankId)?.rankName || '—' },
    { key: 'state', title: 'Trạng thái', sort: 'state', filter: 'state', width: 180, options: [['', 'Đang áp dụng'], ...['ACTIVE', 'NEEDS_INFORMATION', 'PAUSED', 'RETIRED', 'REMOVED'].map(s => [s, label[s]] as [string, string])], render: j => <Badge value={j.state} /> },
    { key: 'actions', title: 'Hành động', width: 135, fixed: 'right', render: j => <TableActions><ActionIcon label={`Xem ${j.name}`} icon={<Eye />} to={`/pms/jobs/${j.id}`} /><ActionIcon label="Lịch sử bảo trì" icon={<History />} onClick={() => setHistory(j)} />{access.job('update') && <ActionIcon label="Sửa công việc" icon={<Pencil />} to={`/pms/jobs/${j.id}?edit=1`} disabled={j.state === 'REMOVED'} />}{access.job('delete') && <ActionIcon label="Xóa công việc chưa có WO" icon={<Trash2 />} danger disabled={action.busy || !!j.openWorkOrderId || j.state === 'REMOVED'} onClick={() => { if (confirm(`Xóa công việc “${j.name}”? Công việc đã có WO/lịch sử chỉ được ngừng áp dụng.`)) void action.run(async () => { await pms.deleteJob(j); await refresh() }, 'Đã xóa công việc.') }} />}</TableActions> },
  ]
  return <><Grid columns={columns} result={result.data} loading={result.isFetching} error={result.error} {...filter} toolbar={<>{access.job('import') && <button className={button} onClick={() => setImporting(true)}>Import Excel</button>}{access.job('create') && <button className={primary} onClick={() => setCreate(true)}><Plus size={14} />Thêm công việc</button>}</>} />{create && <JobForm onClose={() => setCreate(false)} />}{history && <JobHistory job={history} onClose={() => setHistory(null)} />}{importing && <ImportJobs onClose={() => setImporting(false)} />}</>
}
function Orders({ equipmentAssetId }: { equipmentAssetId: string }) {
  const { due } = usePmsClock()
  const access = usePmsPermissions(); const filter = useFilters({}, 'due'); const params: Record<string, unknown> = { ...filter.params, equipmentAssetId: equipmentAssetId || undefined }
  if (!params.status) params.status = 'ALL'
  const result = usePmsQuery(['orders', params], () => pms.orders(params), access.work('view'))
  const crew = usePmsQuery(['wo-crew'], pms.crew, access.work('view'))
  const [create, setCreate] = useState(false)
  const columns: GridColumn<WorkOrder>[] = [
    { key: 'name', title: 'Tên công việc', fixed: 'left', width: 260, sort: 'name', filter: 'name', render: w => <Link className="text-blue-600 hover:underline" title={w.name} to={`/pms/work-orders/${w.id}`}>{w.name || 'WO nháp chưa có tên'}</Link> },
    { key: 'code', title: 'Mã WO', width: 180, filter: 'code', sort: 'code', render: w => <span>{readableCode(w.code) || '—'}</span> },
    { key: 'equipment', title: 'Thiết bị', width: 220, filter: 'equipment', render: w => <span title={w.equipmentName}>{w.equipmentName || '—'}</span> },
    { key: 'due', title: 'Hạn hoàn thành', width: 190, sort: 'due', dateRange: ['dueFrom', 'dueTo'], render: w => due(w.dueAt, w.dueHours) },
    { key: 'pic', title: 'Người thực hiện', width: 180, filter: 'assignedTo', options: [['', 'Tất cả'], ...(crew.data || []).map(c => [c.crewId, c.fullName] as [string, string])], render: w => w.assignedName || 'Chưa phân công' },
    { key: 'department', title: 'Bộ phận phụ trách', width: 120, filter: 'department', options: Object.entries(departmentNames), render: w => departmentName(w.department) },
    { key: 'priority', title: 'Ưu tiên', sort: 'priority', filter: 'priority', options: [['', 'Tất cả'], ...['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map(s => [s, label[s]] as [string, string])], render: w => <Badge value={w.priority} /> },
    { key: 'dueState', title: 'Tình trạng hạn', filter: 'dueState', width: 160, options: [['', 'Tất cả'], ...['NOT_DUE', 'UPCOMING', 'DUE', 'OVERDUE'].map(s => [s, label[s]] as [string, string])], render: w => <Badge value={w.dueState} /> },
    { key: 'status', title: 'Tiến độ', sort: 'status', filter: 'status', width: 180, options: [['', 'Tất cả'], ['OPEN', 'Đang mở'], ...['DRAFT', 'UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'RECTIFY', 'PENDING_APPROVAL', 'COMPLETED', 'CANCELLED'].map(s => [s, label[s]] as [string, string])], render: w => <Badge value={w.status} /> },
    { key: 'actions', title: 'Hành động', width: 115, fixed: 'right', render: w => <TableActions><ActionIcon label="Chi tiết WO" icon={<Eye />} to={`/pms/work-orders/${w.id}`} />{w.status === 'DRAFT' && access.work('update') && <ActionIcon label="Sửa nháp" icon={<Pencil />} to={`/pms/work-orders/${w.id}?edit=1`} />}{w.status === 'PENDING_APPROVAL' && (access.work('approve') || access.work('reject')) && <ActionIcon label="Kiểm tra và duyệt WO" icon={<ClipboardCheck />} to={`/pms/work-orders/${w.id}/review`} />}</TableActions> },
  ]
  return <><Grid columns={columns} result={result.data} loading={result.isFetching} error={result.error} {...filter} toolbar={access.work('create') && <button className={primary} onClick={() => setCreate(true)}><Plus size={14} />Tạo WO đột xuất</button>} />{create && <AdHocForm onClose={() => setCreate(false)} />}</>
}
export default function Planning() {
  const [params, setParams] = useSearchParams(); const [equipment, setEquipment] = useState(''); const access = usePmsPermissions()
  const tabs = [{ key: 'table', name: 'Bảng', icon: Table2, allowed: access.job('view') }, { key: 'orders', name: 'Work Order', icon: ClipboardList, allowed: access.work('view') }, { key: 'calendar', name: 'Lịch', icon: Calendar, allowed: access.work('view') }, { key: 'gantt', name: 'Gantt chart', icon: BarChart3, allowed: access.work('view') }, { key: 'counter', name: 'Counter', icon: Gauge, allowed: access.counter('view') }].filter(t => t.allowed)
  const active = tabs.find(t => t.key === params.get('tab'))?.key || tabs[0]?.key
  return <div className="flex h-full min-h-0 bg-white"><EquipmentTree selected={equipment} select={setEquipment} /><div className="flex min-w-0 flex-1 flex-col"><header className="border-b border-gray-200 px-4 py-4 text-sm font-semibold text-gray-800"><span aria-hidden="true" className="mr-1.5">≡</span>Danh sách công việc</header><nav className="flex shrink-0 gap-1 border-b border-gray-200 px-3" aria-label="PMS">{tabs.map(t => <button key={t.key} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm ${active === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`} onClick={() => setParams({ tab: t.key })} aria-current={active === t.key ? 'page' : undefined}><t.icon size={14} aria-hidden="true" />{t.name}</button>)}</nav>
    {active === 'table' && <Jobs key={equipment} equipmentAssetId={equipment} />}{active === 'orders' && <Orders key={equipment} equipmentAssetId={equipment} />}{(active === 'calendar' || active === 'gantt') && <ScheduleViews equipmentAssetId={equipment} mode={active} />}{active === 'counter' && <CounterView equipmentAssetId={equipment} />}
  </div></div>
}
