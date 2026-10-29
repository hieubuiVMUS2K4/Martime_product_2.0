import { translateMessage as tx, useMessageLocale } from '@/i18n/messages'
import { isManualJob } from './manualJobs'
import { departmentName, departmentNames } from './departments'
import { readableCode } from './presentation'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BarChart3, Calendar, ChevronDown, ChevronRight, ClipboardCheck, ClipboardList, Eye, FolderOpen, Gauge, History, Pencil, Plus, Table2, Trash2 } from 'lucide-react'
import { TableActions } from '@/components/common/DataTable'
import { useEquipment, JobForm, AdHocForm } from './Forms'
import { pms, usePmsPermissions, usePmsQuery, usePmsRefresh, label, cycle, usePmsClock, message } from './data'
import { ActionIcon, Badge, Grid, button, input, primary, useAction, ErrorBox, Modal, type GridColumn } from './ui'
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
  useMessageLocale()

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
  return <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white max-md:w-44"><button className="flex items-center gap-2 border-b border-gray-200 bg-blue-800 px-3 py-4 text-left text-sm font-semibold text-white" onClick={() => select('')}><FolderOpen size={16} className="shrink-0" aria-hidden="true" />{tx("pmsRework.allEquipment")}</button><div className="border-b p-2"><input className={input} placeholder={tx("pmsRework.searchEquipment")} aria-label={tx("pmsRework.searchEquipment285")} value={search} onChange={e => setSearch(e.target.value)} /></div><div className="min-h-0 flex-1 overflow-auto">{tree.error ? <ErrorBox error={tree.error} retry={() => void tree.refetch()} /> : tree.isLoading ? <p className="p-3 text-xs text-gray-400">{tx("pmsRework.loading")}</p> : render('', 0)}</div></aside>
}
function Jobs({ equipmentAssetId }: { equipmentAssetId: string }) {
  useMessageLocale()

  const {date,due}=usePmsClock(); const access = usePmsPermissions(); const filter = useFilters({}, 'name'); const params = { ...filter.params, equipmentAssetId: equipmentAssetId || undefined }
  const result = usePmsQuery(['jobs', params], () => pms.jobs(params), access.job('view'))
  const refs = usePmsQuery(['job-references'], pms.jobReferences, access.job('view'))
  const [create, setCreate] = useState(false), [history, setHistory] = useState<Job | null>(null), [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set()), [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => { setSelected(new Set()) }, [result.data, equipmentAssetId])
  const refresh = usePmsRefresh(); const action = useAction()
  const chosen = (result.data?.items || []).filter(j => selected.has(j.id) && j.canDelete)
  const selection = access.job('delete') ? { ids: selected, selectable: (j: Job) => j.canDelete === true, disabled: action.busy,
    toggle: (j: Job) => setSelected(previous => { const next = new Set(previous); next.has(j.id) ? next.delete(j.id) : next.add(j.id); return next }),
    togglePage: (rows: Job[]) => setSelected(previous => rows.every(j => previous.has(j.id)) ? new Set() : new Set(rows.map(j => j.id))) } : undefined
  const deleteSelected = async () => {
    await action.run(async () => {
      const failed: string[] = []; let removed = 0
      for (const job of chosen) { try { await pms.deleteJob(job); removed++ } catch (error) { failed.push(`${job.name}: ${message(error)}`) } }
      await refresh(); setSelected(new Set())
      if (failed.length) throw new Error(tx("pmsRework.deletedJobsCouldNotDelete", { p0: removed, p1: chosen.length, p2: failed.join('; ') }))
    }, tx("pmsRework.deletedJobs", { p0: chosen.length }))
    setConfirmDelete(false)
  }
  const columns: GridColumn<Job>[] = [
    { key: 'name', title: tx("pmsRework.jobName"), sort: 'name', filter: 'name', placeholder: tx("pmsRework.nameOrCode"), width: 260, fixed: 'left', render: j => <Link className="text-blue-600 hover:underline" title={`${j.code} · ${j.name}`} to={`/pms/jobs/${j.id}`}>{j.name}</Link> },
    { key: 'equipment', title: tx("pmsRework.equipmentName"), filter: 'equipment', width: 230, render: j => <span title={j.equipmentName}>{j.equipmentName || '—'}</span> },
    { key: 'category', title: tx("pmsRework.typeInterval"), filter: 'category', width: 180, options: [['', tx("pmsRework.all")], ...['PERIODIC', 'DRY_DOCK', 'ON_DEMAND', 'VOYAGE'].map(s => [s, label[s]] as [string, string])], render: j => <span>{label[j.category]}{j.category === 'PERIODIC' ? ` · ${cycle(j)}` : ''}</span> },
    { key: 'last', title: tx("pmsRework.lastExecution"), sort: 'lastCompleted', width: 180, render: j => date(j.lastSubmittedAt) },
    { key: 'due', title: tx("pmsRework.nextDue"), sort: 'due', width: 190, dateRange: ['dueFrom', 'dueTo'], render: j => isManualJob(j.category) ? (j.openWorkOrderId ? tx("pmsRework.woIssued") : tx("pmsRework.awaitingWORelease")) : due(j.nextDueAt, j.nextDueHours) },
    { key: 'department', title: tx("pmsRework.responsibleDepartment"), filter: 'department', options: Object.entries(departmentNames), render: j => departmentName(j.department) },
    { key: 'responsible', title: tx("pmsRework.responsiblePerson"), width: 190, filter: 'responsibleCrewId', options: [['', tx("pmsRework.all")], ...(refs.data?.crew || []).map(c => [c.id, c.fullName] as [string, string])], render: j => j.responsibleName || refs.data?.ranks.find(r => r.id === j.responsibleRankId)?.rankName || '—' },
    { key: 'state', title: tx("pmsRework.status"), sort: 'state', filter: 'state', width: 180, options: [['', tx("pmsRework.inUse")], ...['ACTIVE', 'NEEDS_INFORMATION', 'PAUSED', 'RETIRED', 'REMOVED'].map(s => [s, label[s]] as [string, string])], render: j => <Badge value={j.state} /> },
    { key: 'actions', title: tx("pmsRework.actions"), width: 135, fixed: 'right', render: j => <TableActions><ActionIcon label={tx("pmsRework.view", { p0: j.name })} icon={<Eye />} to={`/pms/jobs/${j.id}`} /><ActionIcon label={tx("pmsRework.maintenanceHistory")} icon={<History />} onClick={() => setHistory(j)} />{access.job('update') && <ActionIcon label={tx("pmsRework.editJob")} icon={<Pencil />} to={`/pms/jobs/${j.id}?edit=1`} disabled={j.state === 'REMOVED'} />}{access.job('delete') && <ActionIcon label={tx("pmsRework.deleteJobWithoutWorkOrders")} icon={<Trash2 />} danger disabled={action.busy || !j.canDelete} onClick={() => { if (confirm(tx("pmsRework.deleteJobJobsWithWOHistoryCanOnly", { p0: j.name }))) void action.run(async () => { await pms.deleteJob(j); await refresh() }, tx("pmsRework.jobDeleted")) }} />}</TableActions> },
  ]
  return <><Grid columns={columns} selection={selection} result={result.data} loading={result.isFetching} error={result.error} {...filter} toolbar={<>{access.job('delete') && <button className={button} disabled={action.busy || !chosen.length} onClick={() => setConfirmDelete(true)}><Trash2 size={14} />{tx("pmsRework.bulkDelete")}{chosen.length ? ` (${chosen.length})` : ''}</button>}{access.job('import') && <button className={button} onClick={() => setImporting(true)}>{tx("pmsRework.importExcel")}</button>}{access.job('create') && <button className={primary} onClick={() => setCreate(true)}><Plus size={14} />{tx("pmsRework.addJob")}</button>}</>} />{create && <JobForm onClose={() => setCreate(false)} />}{history && <JobHistory job={history} onClose={() => setHistory(null)} />}{importing && <ImportJobs onClose={() => setImporting(false)} />}{confirmDelete && <Modal title={tx("pmsRework.deleteSelectedJobs")} onClose={() => setConfirmDelete(false)} busy={action.busy} footer={<button className={`${primary} !bg-red-600 hover:!bg-red-700`} disabled={action.busy || !chosen.length} onClick={() => void deleteSelected()}>{tx("pmsRework.delete") + " "}{chosen.length}{" " + tx("pmsRework.jobs")}</button>}><p className="mb-3 text-sm text-slate-600">{tx("pmsRework.onlyJobsWithoutWOsOrMaintenanceHistoryCan")}</p><ul className="max-h-60 space-y-2 overflow-auto text-sm">{chosen.map(j => <li key={j.id} className="border-b border-gray-100 py-2">{j.code} · {j.name}</li>)}</ul></Modal>}</>
}
function Orders({ equipmentAssetId }: { equipmentAssetId: string }) {
  useMessageLocale()

  const { due } = usePmsClock()
  const access = usePmsPermissions(); const filter = useFilters({ status: 'OPEN' }, 'due'); const params: Record<string, unknown> = { ...filter.params, equipmentAssetId: equipmentAssetId || undefined }
  if (!params.status) params.status = 'ALL'
  const result = usePmsQuery(['orders', params], () => pms.orders(params), access.work('view'))
  const crew = usePmsQuery(['wo-crew'], pms.crew, access.work('view'))
  const [create, setCreate] = useState(false)
  const columns: GridColumn<WorkOrder>[] = [
    { key: 'name', title: tx("pmsRework.jobName"), fixed: 'left', width: 260, sort: 'name', filter: 'name', render: w => <Link className="text-blue-600 hover:underline" title={w.name} to={`/pms/work-orders/${w.id}`}>{w.name || tx("pmsRework.untitledDraftWO")}</Link> },
    { key: 'code', title: tx("pmsRework.woCode"), width: 180, filter: 'code', sort: 'code', render: w => <span>{readableCode(w.code) || '—'}</span> },
    { key: 'equipment', title: tx("pmsRework.equipment"), width: 220, filter: 'equipment', render: w => <span title={w.equipmentName}>{w.equipmentName || '—'}</span> },
    { key: 'due', title: tx("pmsRework.completionDeadline"), width: 190, sort: 'due', dateRange: ['dueFrom', 'dueTo'], render: w => due(w.dueAt, w.dueHours) },
    { key: 'pic', title: tx("pmsRework.assignee"), width: 180, filter: 'assignedTo', options: [['', tx("pmsRework.all")], ...(crew.data || []).map(c => [c.crewId, c.fullName] as [string, string])], render: w => w.assignedName || tx("pmsRework.unassigned") },
    { key: 'department', title: tx("pmsRework.responsibleDepartment"), width: 120, filter: 'department', options: Object.entries(departmentNames), render: w => departmentName(w.department) },
    { key: 'priority', title: tx("pmsRework.priority"), sort: 'priority', filter: 'priority', options: [['', tx("pmsRework.all")], ...['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map(s => [s, label[s]] as [string, string])], render: w => <Badge value={w.priority} /> },
    { key: 'dueState', title: tx("pmsRework.dueStatus"), filter: 'dueState', width: 160, options: [['', tx("pmsRework.all")], ...['NOT_DUE', 'UPCOMING', 'DUE', 'OVERDUE'].map(s => [s, label[s]] as [string, string])], render: w => <Badge value={w.dueState} /> },
    { key: 'status', title: tx("pmsRework.progress"), sort: 'status', filter: 'status', width: 180, options: [['', tx("pmsRework.all")], ['OPEN', tx("pmsRework.open")], ...['DRAFT', 'UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'RECTIFY', 'PENDING_APPROVAL', 'COMPLETED', 'CANCELLED'].map(s => [s, label[s]] as [string, string])], render: w => <Badge value={w.status} /> },
    { key: 'actions', title: tx("pmsRework.actions"), width: 115, fixed: 'right', render: w => <TableActions><ActionIcon label={tx("pmsRework.woDetails")} icon={<Eye />} to={`/pms/work-orders/${w.id}`} />{w.status === 'DRAFT' && access.work('update') && <ActionIcon label={tx("pmsRework.editDraft")} icon={<Pencil />} to={`/pms/work-orders/${w.id}?edit=1`} />}{w.status === 'PENDING_APPROVAL' && (access.work('approve') || access.work('reject')) && <ActionIcon label={tx("pmsRework.reviewAndApproveWO")} icon={<ClipboardCheck />} to={`/pms/work-orders/${w.id}/review`} />}</TableActions> },
  ]
  return <><Grid columns={columns} result={result.data} loading={result.isFetching} error={result.error} {...filter} toolbar={access.work('create') && <button className={primary} onClick={() => setCreate(true)}><Plus size={14} />{tx("pmsRework.createAdHocWO")}</button>} />{create && <AdHocForm onClose={() => setCreate(false)} />}</>
}
export default function Planning() {
  useMessageLocale()

  const [params, setParams] = useSearchParams(); const [equipment, setEquipment] = useState(''); const access = usePmsPermissions()
  const tabs = [{ key: 'table', name: tx("pmsRework.jobList"), icon: Table2, allowed: access.job('view') }, { key: 'orders', name: tx("pmsRework.workOrder"), icon: ClipboardList, allowed: access.work('view') }, { key: 'calendar', name: tx("pmsRework.calendar"), icon: Calendar, allowed: access.work('view') }, { key: 'gantt', name: tx("pmsRework.ganttChart315"), icon: BarChart3, allowed: access.work('view') }, { key: 'counter', name: tx("pmsRework.counter"), icon: Gauge, allowed: access.counter('view') }].filter(t => t.allowed)
  const active = tabs.find(t => t.key === params.get('tab'))?.key || tabs[0]?.key
  return <div className="flex h-full min-h-0 bg-white"><EquipmentTree selected={equipment} select={setEquipment} /><div className="flex min-w-0 flex-1 flex-col"><header className="border-b border-gray-200 px-4 py-4 text-sm font-semibold text-gray-800"><span aria-hidden="true" className="mr-1.5">≡</span>{tx("pmsRework.workPlanning")}</header><nav className="flex shrink-0 gap-1 border-b border-gray-200 px-3" aria-label={tx("pmsRework.pms")}>{tabs.map(t => <button key={t.key} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm ${active === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`} onClick={() => setParams({ tab: t.key })} aria-current={active === t.key ? 'page' : undefined}><t.icon size={14} aria-hidden="true" />{t.name}</button>)}</nav>
    {active === 'table' && <Jobs key={equipment} equipmentAssetId={equipment} />}{active === 'orders' && <Orders key={equipment} equipmentAssetId={equipment} />}{(active === 'calendar' || active === 'gantt') && <ScheduleViews equipmentAssetId={equipment} mode={active} />}{active === 'counter' && <CounterView equipmentAssetId={equipment} />}
  </div></div>
}
