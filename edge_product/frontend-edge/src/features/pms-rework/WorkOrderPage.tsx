import { TouchNumberCombo, isWholeUnit } from './TouchNumberCombo'
import { translateMessage as tx, localizePmsMessage, useMessageLocale } from '@/i18n/messages'
import { departmentName } from './departments'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Eye, Search, Trash2 } from 'lucide-react'
import { TablePagination } from '@/components/common/DataTable'
import { useAuthStore } from '@/stores/auth.store'
import { AdHocForm, CrewSelect, SupportSelect } from './Forms'
import { ReasonDialog } from './JobPage'
import { ReportContent } from './Reports'
import { readableCode } from './presentation'
import { pms, snapshot, usePmsPermissions, usePmsQuery, usePmsRefresh, usePmsClock, label } from './data'
import { ActionIcon, Badge, DetailTabs, InfoField, button, primary, input, Modal, Field, Section, useAction, ErrorBox } from './ui'
import type { WorkOrderDetail, ExecutionResult, Submission, MaterialOption } from './types'
function Assignment({ detail, onClose }: { detail: WorkOrderDetail; onClose: () => void }) {
  useMessageLocale()

  const w = detail.workOrder; const query = usePmsQuery(['wo-crew'], pms.crew)
  const [pic, setPic] = useState(w.assignedTo || ''), [support, setSupport] = useState(snapshot<string[]>(detail.supportingCrewIds) || []), [reason, setReason] = useState('')
  const refresh = usePmsRefresh(), action = useAction()
  return <Modal title={tx("pmsRework.assignWorkOrder")} onClose={onClose} busy={action.busy} footer={<button className={primary} form="pms-assign" type="submit" disabled={action.busy || !pic || !!query.error || (!!w.assignedTo && !reason.trim())}>{tx("pmsRework.saveAssignment")}</button>}><form id="pms-assign" className="space-y-4" onSubmit={async e => { e.preventDefault(); if (await action.run(async () => { await pms.assign(w, pic, support, reason); await refresh() }, tx("pmsRework.assignmentUpdated"))) onClose() }}>
    <Field name={tx("pmsRework.personInChargeRequired")}><CrewSelect crew={query.data || []} value={pic} onChange={value => { setPic(value || ''); setSupport(support.filter(s => s !== value && value != null)) }} /></Field>
    <Field name={tx("pmsRework.supportingCrew")}><SupportSelect crew={query.data || []} pic={pic} selected={support} onChange={setSupport} /></Field>
    <Field name={w.assignedTo ? tx("pmsRework.handoverReasonRequired") : tx("pmsRework.notes")}><textarea className={`${input} !h-20 py-2`} maxLength={2000} required={!!w.assignedTo} value={reason} onChange={e => setReason(e.target.value)} /></Field>{query.error && <ErrorBox error={query.error} />}
  </form></Modal>
}
function useOrderBase() {
  return useLocation().pathname.startsWith('/pms/execute-work-orders') ? '/pms/execute-work-orders' : '/pms/work-orders'
}
function Execution({ detail, information, lastUpdated }: { detail: WorkOrderDetail; information?: ReactNode; lastUpdated?: string }) {
  const orderBase = useOrderBase()
  const touchExecution = orderBase === '/pms/execute-work-orders'
  useMessageLocale()

  const w = detail.workOrder, navigate = useNavigate(), refresh = usePmsRefresh(), action = useAction()
  const [form, setForm] = useState<ExecutionResult>(() => ({ expectedVersion: w.workflowVersion, notes: detail.notes || '', actualDurationMinutes: detail.actualDurationMinutes ?? null, runningHours: detail.actualRunningHours ?? null,
    checklist: detail.checklist.map(c => ({ id: c.id, completed: c.isCompleted, reading: c.readingValue ?? null, remarks: c.remarks || '' })), materials: snapshot<ExecutionResult['materials']>(detail.sparePartsUsed) || [] }))
  const [hours, setHours] = useState(detail.actualDurationMinutes != null ? String(detail.actualDurationMinutes / 60) : '')
  const [dirty, setDirty] = useState(false), [search, setSearch] = useState(''), [settled, setSettled] = useState('')
  useEffect(() => { const timer = setTimeout(() => setSettled(search), 300); return () => clearTimeout(timer) }, [search])
  useEffect(() => { const guard = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault() }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard) }, [dirty])
  const [materialScope, setMaterialScope] = useState<'equipment' | 'all'>(w.equipmentAssetId ? 'equipment' : 'all')
  const [materialPage, setMaterialPage] = useState(1)
  const [materialsOpen, setMaterialsOpen] = useState(false), [activeMaterial, setActiveMaterial] = useState(0)
  const materialListId = useId()
  const materialSearch = useRef<HTMLInputElement>(null)
  const materialEquipmentId = materialScope === 'equipment' ? w.equipmentAssetId : undefined
  useEffect(() => { setMaterialPage(1) }, [settled, materialScope])
  const materials = usePmsQuery(['material-options', settled, materialEquipmentId, materialPage], () => pms.materials(settled, undefined, materialEquipmentId, materialPage))
  const selectedIds = form.materials.map(m => m.materialItemId).sort().join(',')
  const selected = usePmsQuery(['selected-materials', selectedIds], () => pms.materials('', selectedIds), !!selectedIds)
  const names = new Map<string, MaterialOption>([...(materials.data?.items || []), ...(selected.data?.items || [])].map(m => [m.id, m]))
  const availableMaterials = materials.data?.items.filter(material => !form.materials.some(row => row.materialItemId === material.id)) || []
  useEffect(() => { setActiveMaterial(0) }, [settled, materialScope, materialPage])
  useEffect(() => { if (materialsOpen) document.getElementById(`${materialListId}-${activeMaterial}`)?.scrollIntoView({ block: 'nearest' }) }, [activeMaterial, materialsOpen, materialListId])
  const command = useRef<{ body: string; id: string } | null>(null)
  const update = (patch: Partial<ExecutionResult>) => { setForm(f => ({ ...f, ...patch })); setDirty(true) }
  const save = async (submit: boolean) => {
    const minutes = hours === '' ? null : Math.round(Number(hours) * 60)
    if (minutes != null && (!Number.isFinite(minutes) || minutes < 0)) return
    const data = { ...form, actualDurationMinutes: minutes }
    const body = JSON.stringify(data)
    if (!command.current || command.current.body !== body) command.current = { body, id: crypto.randomUUID() }
    if (await action.run(async () => { const result = submit ? await pms.submit(w.id, data, command.current!.id) : await pms.save(w.id, data); setForm(f => ({ ...f, expectedVersion: result.version })); setDirty(false); await refresh(); if (submit) navigate(`${orderBase}/${w.id}`) }, submit ? tx("pmsRework.reportSubmittedForReview") : tx("pmsRework.progressSaved"))) command.current = null
  }
  const reportFields = <Section title={tx("pmsRework.executionReport")}><div className="grid gap-4 md:grid-cols-2"><Field name={tx("pmsRework.workDurationHoursRequired")}>{touchExecution ? <TouchNumberCombo label={tx("pmsRework.workDurationHoursRequired")} value={hours} suggestions={[0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 24]} onChange={value => { setHours(value); setDirty(true) }} /> : <input className={input} type="number" min={0} step="0.01" value={hours} onChange={e => { setHours(e.target.value); setDirty(true) }} />}</Field><Field name={tx("pmsRework.recordedRunningHours431", { p0: w.dueHours != null ? ' *' : '' })}>{touchExecution ? <TouchNumberCombo label={tx("pmsRework.recordedRunningHours431", { p0: "" })} value={form.runningHours} suggestions={[form.runningHours ?? w.dueHours ?? 0, (form.runningHours ?? w.dueHours ?? 0) + 1, (form.runningHours ?? w.dueHours ?? 0) + 10]} onChange={value => update({ runningHours: value === "" ? null : Number(value) })} /> : <input className={input} type="number" min={0} step="any" value={form.runningHours ?? ''} onChange={e => update({ runningHours: e.target.value === '' ? null : Number(e.target.value) })} />}</Field><div className="md:col-span-2"><Field name={tx("pmsRework.resultsNotes")}><textarea maxLength={20000} className={`${input} !h-28 py-2`} value={form.notes} onChange={e => update({ notes: e.target.value })} /></Field></div></div></Section>
  const executionTabs = [
      { key: 'checklist', name: tx("pmsRework.executionChecklist"), count: form.checklist.length, content: <div className="overflow-auto"><table className="w-full min-w-[700px] text-xs"><thead className="bg-blue-50"><tr>{[tx("pmsRework.description"), tx("pmsRework.reading433"), tx("pmsRework.notes"), tx("pmsRework.complete")].map(s => <th key={s} className="border border-[#a3b1bc] p-2 text-center font-semibold">{s}</th>)}</tr></thead><tbody>{detail.checklist.map((c, i) => <tr key={c.id}><td className="border border-[#a3b1bc] p-2">{c.checkpointDescription}{c.requiresReading && <span className="ml-1 text-red-500">*</span>}<span className="block text-gray-400">{c.normalRangeMin ?? '—'} – {c.normalRangeMax ?? '—'} {c.unit}</span></td><td className="w-40 border border-[#a3b1bc] p-2">{touchExecution ? <TouchNumberCombo label={tx("pmsRework.readingFor", { p0: c.checkpointDescription })} min={-Infinity} whole={isWholeUnit(c.unit)} value={form.checklist[i].reading} suggestions={[0, 1, 5, 10, ...(c.normalRangeMin != null ? [c.normalRangeMin] : []), ...(c.normalRangeMax != null ? [c.normalRangeMax] : [])]} onChange={value => update({ checklist: form.checklist.map(v => v.id === c.id ? { ...v, reading: value === "" ? null : Number(value) } : v) })} /> : <input aria-label={tx("pmsRework.readingFor", { p0: c.checkpointDescription })} type="number" step="any" className={input} value={form.checklist[i].reading ?? ''} onChange={e => update({ checklist: form.checklist.map(v => v.id === c.id ? { ...v, reading: e.target.value === '' ? null : Number(e.target.value) } : v) })} />}</td><td className="border border-[#a3b1bc] p-2"><input aria-label={tx("pmsRework.notesFor", { p0: c.checkpointDescription })} maxLength={1000} className={input} value={form.checklist[i].remarks} onChange={e => update({ checklist: form.checklist.map(v => v.id === c.id ? { ...v, remarks: e.target.value } : v) })} /></td><td className="w-20 border border-[#a3b1bc] p-2 text-center align-middle"><input aria-label={tx("pmsRework.complete437", { p0: c.checkpointDescription })} className="block mx-auto" type="checkbox" checked={form.checklist[i].completed} onChange={e => update({ checklist: form.checklist.map(v => v.id === c.id ? { ...v, completed: e.target.checked } : v) })} /></td></tr>)}</tbody></table>{!detail.checklist.length && <p className="p-3 text-xs text-gray-400">{tx("pmsRework.thisWOHasNoChecklistItems")}</p>}</div> },
      { key: 'materials', name: tx("pmsRework.materialsUsed"), count: form.materials.length, content: <div className={touchExecution ? "execute-material-workspace" : undefined}><div className="mb-3"><div className="mb-3 flex flex-wrap gap-2">{(['equipment', 'all'] as const).map(scope => <button type="button" key={scope} disabled={scope === 'equipment' && !w.equipmentAssetId} aria-pressed={materialScope === scope} className={`${button} ${materialScope === scope ? '!border-blue-500 !bg-blue-50 !text-blue-600' : ''}`} onClick={() => { setMaterialScope(scope); setMaterialPage(1) }}>{tx(scope === 'equipment' ? 'pmsRework.equipmentMaterials' : 'pmsRework.allMaterials')}</button>)}</div><div className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setMaterialsOpen(false) }}>
        <Search size={touchExecution ? 22 : 14} className="pointer-events-none absolute left-2 top-2 text-slate-400" aria-hidden="true" />
        <input ref={materialSearch} role="combobox" aria-expanded={materialsOpen} aria-controls={materialListId} aria-autocomplete="list" aria-activedescendant={materialsOpen && availableMaterials[activeMaterial] ? `${materialListId}-${activeMaterial}` : undefined}
          className={`${input} ${touchExecution ? '!pl-12 !pr-16' : '!pl-7 !pr-8'}`} aria-label={tx('pmsRework.findUsedMaterials')} placeholder={tx('pmsRework.searchUsedMaterialCodeOrName')} autoComplete="off" value={search}
          onClick={() => setMaterialsOpen(true)} onChange={event => { setSearch(event.target.value); setMaterialPage(1); setMaterialsOpen(true) }}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.stopPropagation(); setMaterialsOpen(false) }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setMaterialsOpen(true); setActiveMaterial(index => materialsOpen ? Math.max(0, Math.min(availableMaterials.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))) : 0) }
            if (event.key === 'Enter' && materialsOpen) { event.preventDefault(); const material = availableMaterials[activeMaterial]; if (material && form.materials.length < 200) { update({ materials: [...form.materials, { materialItemId: material.id, quantity: 1 }] }); setMaterialsOpen(false); setSearch('') } }
          }} />
        <button type="button" aria-label={tx('pmsRework.findUsedMaterials')} className="absolute right-2 top-2 text-slate-400" onClick={() => { materialSearch.current?.focus(); setMaterialsOpen(open => !open) }}><ChevronDown size={touchExecution ? 24 : 14} /></button>
        {materialsOpen && <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded border border-gray-300 bg-white shadow-lg" onMouseDown={event => event.preventDefault()}>
          <div role="listbox" id={materialListId} aria-label={tx('pmsRework.findUsedMaterials')} className={`max-h-56 overflow-auto ${touchExecution ? "execute-material-listbox" : "py-1"}`}>
            {materials.isFetching ? <p className="px-3 py-3 text-xs text-gray-500">{tx('pmsRework.loadingMaterialNames')}</p> : touchExecution ? <table className="execute-material-options"><thead><tr><th>{tx('pmsRework.materialCode')}</th><th>{tx('pmsRework.material')}</th><th>{tx('pmsRework.unit')}</th><th>{tx('pmsRework.availableStock')}</th></tr></thead><tbody>{availableMaterials.map((material, index) => <tr role="option" tabIndex={-1} aria-selected={activeMaterial === index} id={`${materialListId}-${index}`} key={material.id} onMouseEnter={() => setActiveMaterial(index)} onClick={() => { if (form.materials.length >= 200) return; update({ materials: [...form.materials, { materialItemId: material.id, quantity: 1 }] }); setMaterialsOpen(false); setSearch('') }}><td>{material.itemCode}</td><td>{material.name}</td><td>{material.unit || '—'}</td><td>{material.onHand == null ? '—' : material.onHand.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td></tr>)}</tbody></table> : availableMaterials.map((material, index) => <button type="button" role="option" aria-selected={activeMaterial === index} id={`${materialListId}-${index}`} key={material.id} disabled={form.materials.length >= 200}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm disabled:opacity-40 ${activeMaterial === index ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-blue-50'}`}
              onMouseEnter={() => setActiveMaterial(index)} onClick={() => { update({ materials: [...form.materials, { materialItemId: material.id, quantity: 1 }] }); setMaterialsOpen(false); setSearch('') }}>
              <span className="min-w-0"><span className="block truncate font-medium">{material.name}</span><span className="block text-xs text-slate-500">{material.itemCode}</span></span><span className="shrink-0 text-xs text-slate-500">{material.unit || '—'}</span>
            </button>)}
            {!materials.isFetching && !materials.error && !availableMaterials.length && <p className="px-3 py-3 text-xs text-gray-500">{tx(materialScope === 'equipment' && !settled && !materials.data?.items.length ? 'pmsRework.noMaterialsAssignedToThisEquipment' : 'pmsRework.noMatchingMaterials')}</p>}
            {materials.error && <ErrorBox error={materials.error} />}
          </div>
          {(materials.data?.total || 0) > 30 && <TablePagination page={materialPage} pageSize={30} totalItems={materials.data?.total || 0} onPageChange={setMaterialPage} />}
        </div>}
      </div></div>
      <table className={touchExecution ? 'execute-used-materials' : 'w-full text-xs'}>
        {touchExecution && <colgroup><col className="used-material-code" /><col /><col className="used-material-unit" /><col className="used-material-stock" /><col className="used-material-quantity" /><col className="used-material-action" /></colgroup>}
        <thead className="bg-blue-50"><tr>{[...(touchExecution ? [tx("pmsRework.materialCode")] : []), tx("pmsRework.material"), tx("pmsRework.unit"), ...(touchExecution ? [tx("pmsRework.availableStock")] : []), tx("pmsRework.quantityUsed"), ''].map((title, index) => <th key={index} className="border border-[#a3b1bc] p-2 text-center font-semibold">{title}</th>)}</tr></thead>
        <tbody>{form.materials.map(m => {
          const material = names.get(m.materialItemId)
          return <tr key={m.materialItemId}>
            {touchExecution && <td className="border border-[#a3b1bc] p-2">{material?.itemCode || '—'}</td>}
            <td className="border border-[#a3b1bc] p-2">{material?.name || tx("pmsRework.loadingMaterialNames")}</td>
            <td className="border border-[#a3b1bc] p-2 text-center">{material?.unit || '—'}</td>
            {touchExecution && <td className="border border-[#a3b1bc] p-2 text-center"><span className={`used-material-stock-value ${material?.onHand != null && material.onHand < m.quantity ? 'used-material-stock-short' : ''}`}>{material?.onHand == null ? '—' : material.onHand.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span></td>}
            <td className="w-40 border border-[#a3b1bc] p-2">{touchExecution ? <TouchNumberCombo label={tx("pmsRework.quantityUsed444")} min={0.000001} whole={isWholeUnit(material?.unit)} value={m.quantity} suggestions={isWholeUnit(material?.unit) ? [1, 2, 3, 5, 10, 20, 50] : [0.25, 0.5, 1, 2, 5, 10, 20]} onChange={value => update({ materials: form.materials.map(p => p === m ? { ...p, quantity: value === "" ? 0 : Number(value) } : p) })} /> : <input aria-label={tx("pmsRework.quantityUsed444")} className={input} type="number" step="0.000001" min="0.000001" value={m.quantity} onChange={e => update({ materials: form.materials.map(p => p === m ? { ...p, quantity: Number(e.target.value) } : p) })} />}</td>
            <td className="w-12 border border-[#a3b1bc] p-2 text-center"><ActionIcon label={tx("pmsRework.removeMaterialRow")} icon={<Trash2 />} danger onClick={() => update({ materials: form.materials.filter(p => p !== m) })} /></td>
          </tr>
        })}{touchExecution && !form.materials.length && <tr><td colSpan={6} className="used-material-empty">{tx("pmsRework.noMaterialUsageRecordedYet")}</td></tr>}</tbody>
      </table>
      {touchExecution && selected.error && <ErrorBox error={selected.error} retry={() => void selected.refetch()} />}
      <p className="mt-3 text-xs text-gray-500">{tx("pmsRework.stockIsCheckedAndPostedWhenTheReport")}</p></div> },
  ]
  const leave = () => {
    if (!dirty || confirm(tx("pmsRework.leaveThisPageAndDiscardUnsavedChanges"))) navigate(orderBase)
  }
  if (information) return <div className="execute-work-order-workspace">
    <header className="execute-work-order-toolbar">
      <div className="execute-work-order-heading">
        <button type="button" className={button} disabled={action.busy} onClick={leave}><ArrowLeft size={26} />{tx("pmsRework.back")}</button>
        <h1>{tx("pmsRework.execute")} · {w.name}</h1>
      </div>
      <div className="execute-work-order-toolbar-actions">
        <button type="button" className={button} disabled={action.busy} onClick={() => void save(false)}>{tx("pmsRework.saveProgress")}</button>
        <button type="button" className={primary} disabled={action.busy || hours === ''} onClick={() => void save(true)}>{tx("pmsRework.submitForReview")}</button>
        {lastUpdated && <div className="execute-work-order-updated"><span>{tx("pmsRework.lastUpdated470")}</span><time>{lastUpdated}</time></div>}
      </div>
    </header>
    <fieldset disabled={action.busy} className="execute-work-order-panels">
      {detail.rejectionReason && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{tx("pmsRework.reworkRequested") + " "}{detail.rejectionReason}</p>}
      <DetailTabs items={[
        { key: 'information', name: tx("pmsRework.workOrderInformation"), content: information },
        { key: 'report', name: tx("pmsRework.executionReport"), content: reportFields },
        ...executionTabs.map(tab => tab.key === 'materials' ? { ...tab, name: tx('pmsRework.executionMaterials') } : tab),
      ]} />
    </fieldset>
  </div>
  return <div className="space-y-4"><fieldset disabled={action.busy} className="space-y-4">{detail.rejectionReason && <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{tx("pmsRework.reworkRequested") + " "}{detail.rejectionReason}</p>}
    {reportFields}
    <DetailTabs items={executionTabs} />
  </fieldset><div className="sticky bottom-0 flex justify-end gap-2 border-t border-gray-200 bg-white p-3"><button className={button} disabled={action.busy} onClick={() => { if (!dirty || confirm(tx("pmsRework.leaveThisPageAndDiscardUnsavedChanges"))) navigate(`${orderBase}/${w.id}`) }}>{tx("pmsRework.back")}</button><button className={button} disabled={action.busy} onClick={() => void save(false)}>{tx("pmsRework.saveProgress")}</button><button className={primary} disabled={action.busy || hours === ''} onClick={() => void save(true)}>{tx("pmsRework.submitForReview")}</button></div>
  </div>
}
function ReportRevisionPicker({ reports, value, onChange }: {
  reports: WorkOrderDetail['reports']; value: number; onChange: (revision: number) => void;
}) {
  const [open, setOpen] = useState(false)
  const { date } = usePmsClock()
  return <>
    <button type="button" className="execute-revision-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <span>{tx("pmsRework.revision")} {value}</span><ChevronDown size={24} aria-hidden="true" />
    </button>
    {open && <Modal title={tx("pmsRework.submittedReport")} onClose={() => setOpen(false)}>
      <div className="execute-revision-options" aria-label={tx("pmsRework.submittedReport")}>
        {reports.map(report => <button type="button" key={report.id} className="execute-revision-option" aria-pressed={report.revision === value} onClick={() => { onChange(report.revision); setOpen(false) }}>
          <span className="execute-revision-option-copy"><strong>{tx("pmsRework.revision")} {report.revision}</strong><time>{date(report.submittedAt)}</time></span>
          <span className="inline-flex items-center gap-3"><Badge value={report.decision || 'PENDING_APPROVAL'} />{report.revision === value && <CheckCircle2 size={26} aria-hidden="true" />}</span>
        </button>)}
      </div>
    </Modal>}
  </>
}
export default function WorkOrderPage({ mode = 'view' }: { mode?: 'view' | 'execute' | 'review' }) {
  const orderBase = useOrderBase()
  const listPath = orderBase === '/pms/execute-work-orders' ? orderBase : '/pms/work-planning?tab=orders'
  useMessageLocale()

  const {date,due}=usePmsClock(); const { id = '' } = useParams(); const [params] = useSearchParams(); const access = usePmsPermissions(); const user = useAuthStore(s => s.user)
  const refresh = usePmsRefresh(), navigate = useNavigate(), action = useAction()
  const crew = usePmsQuery(['wo-crew'], pms.crew, access.enabled && access.work('view'))
  const person = (value?: string) => crew.data?.find(c => c.crewId === value || c.id === value)?.fullName || readableCode(value) || tx("pmsRework.noInformationYet")
  const query = usePmsQuery(['order', id], () => pms.order(id), access.enabled && access.work('view'))
  const [editing, setEditing] = useState(params.get('edit') === '1'), [assigning, setAssigning] = useState(false), [cancelling, setCancelling] = useState(false), [selectedRevision, setRevision] = useState<number | null>(null)
  const w = query.data?.workOrder; const revision = selectedRevision ?? (mode !== 'execute' ? w?.reportRevision : undefined)
  const report = usePmsQuery(['report', id, revision], () => pms.report(id, revision!), !!revision && access.work('view'))
  let submitted: Submission | null = null
  try { submitted = snapshot<Submission>(report.data?.snapshotJson) } catch { /* The report component displays malformed snapshot errors. */ }
  const selfReview = submitted?.contributors.some(c => c.userId === user?.id || c.crewId === user?.crewId)
  if (!access.enabled || !access.work('view')) return <p className="p-6 text-sm text-gray-500">{tx("pmsRework.workOrdersAreDisabledOrYouDoNot")}</p>
  if (query.error) return <ErrorBox error={query.error} retry={() => void query.refetch()} />
  if (!query.data || !w) return <p className="p-6 text-sm text-gray-500">{tx("pmsRework.loadingWorkOrder")}</p>
  const detail = query.data, support = snapshot<string[]>(detail.supportingCrewIds) || []
  const executor = !!user?.crewId && (w.assignedTo === user.crewId || support.includes(user.crewId)) && access.work('execute')
  const canAssign = access.work('assign') && ['UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'RECTIFY'].includes(w.status)
  const canReview = w.status === 'PENDING_APPROVAL' && (access.work('approve') || access.work('reject'))
  const approve = async (yes: boolean) => { if (report.data && await action.run(async () => { await pms.decide(w, report.data!, yes, ''); await refresh(); navigate(`${orderBase}/${id}`) }, yes ? tx("pmsRework.reportApproved") : tx("pmsRework.jobReturnedForRework"))) setRevision(null) }
  const definition = snapshot<{ instructions?: string; workOrderInstructions?: string }>(detail.jobSnapshot)
  const information = <Section title={tx("pmsRework.workOrderInformation")} actions={<><Badge value={w.status} /><Badge value={w.dueState} /></>}>
      <div className="grid gap-4 sm:grid-cols-3 sm:divide-x sm:divide-gray-200">
        <div className="min-w-0 space-y-4 sm:pr-3"><dl className="space-y-4"><InfoField name={tx("pmsRework.equipment")}>{w.equipmentName || tx("pmsRework.notSelected")}</InfoField><InfoField name={tx("pmsRework.responsibleDepartment")}>{departmentName(w.department)}</InfoField></dl><div><h3 className="mb-1 text-xs text-slate-500">{tx("pmsRework.workInstructions")}</h3><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{definition?.instructions || definition?.workOrderInstructions || detail.workOrderInstructions || tx("pmsRework.noInstructionsYet")}</p></div></div>
        <dl className="min-w-0 space-y-4 sm:px-3"><InfoField name={tx("pmsRework.personInCharge")}>{w.assignedName || tx("pmsRework.unassigned")}</InfoField><InfoField name={tx("pmsRework.priority474")}><Badge value={w.priority} /></InfoField>{readableCode(w.code) && <InfoField name={tx("pmsRework.orderCode")}>{w.code}</InfoField>}</dl>
        <div className="min-w-0 space-y-4 sm:pl-3"><dl><InfoField name={tx("pmsRework.completionDeadline")}>{due(w.dueAt, w.dueHours)}{!w.dueAt && w.dueHours != null && <span className="mt-1 block text-xs font-normal text-slate-500">{tx("pmsRework.runningHoursNoCalendarDeadline")}</span>}</InfoField></dl>{w.status === 'COMPLETED' && report.data?.decision === 'APPROVED' && <div className="rounded border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700"><p className="flex items-center gap-1.5 font-medium"><CheckCircle2 size={15} />{tx("pmsRework.workOrderApproved")}</p><p className="mt-1 text-slate-500">{report.data.decidedByCrewId ? person(report.data.decidedByCrewId) : tx("pmsRework.administrator")} · {date(report.data.decidedAt)}</p></div>}</div>
      </div>
      {w.jobId && access.job('view') && <div className="mt-3 border-t border-gray-200 pt-2">{w.status === 'CANCELLED' && <p className="mb-2 text-xs text-amber-700">{tx("pmsRework.thisWOWasCancelledAndIsRetainedFor")}</p>}<Link className="text-xs text-blue-600 hover:underline" to={`/pms/jobs/${w.jobId}`}>{w.status === 'CANCELLED' ? tx("pmsRework.openJobAndResolveCancelledCycle") : tx("pmsRework.viewSourceJob")}</Link></div>}    </Section>
  const touchDetail = orderBase === '/pms/execute-work-orders'
  const completedTouchDetail = touchDetail && mode === 'view' && w.status === 'COMPLETED'
  const submittedReport = !!revision && (report.error ? <ErrorBox error={report.error} retry={() => void report.refetch()} /> : report.data ? <ReportContent report={report.data} section="summary" showName={false} revisionControl={touchDetail ? <ReportRevisionPicker reports={detail.reports} value={revision} onChange={setRevision} /> : undefined} /> : <p className="text-xs text-gray-500">{tx("pmsRework.loadingSubmittedReport")}</p>)
  const workflowHistory = mode !== 'execute' && <Section title={tx("pmsRework.historyNotes")} scrollable actions={<span className="text-xs text-slate-500">{detail.timeline.length}{" " + tx("pmsRework.events")}</span>}>
      {!touchDetail && mode === 'view' && detail.reports.length > 0 && <details className="mb-4 rounded border border-gray-200"><summary className="cursor-pointer bg-gray-50 px-3 py-2 text-xs font-medium text-slate-600">{tx("pmsRework.reportRevisions")}{detail.reports.length})</summary><div className="p-3"><div><table className="w-full text-xs"><thead className="bg-blue-50 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-blue-50"><tr>{[tx("pmsRework.revision"), tx("pmsRework.submittedOn"), tx("pmsRework.submittedBy"), tx("pmsRework.decision"), tx("pmsRework.actions")].map(s => <th key={s} className="border border-[#a3b1bc] p-2 text-center font-semibold">{s}</th>)}</tr></thead><tbody>{detail.reports.map(r => <tr key={r.id}><td className="border border-[#a3b1bc] p-2">{r.revision}</td><td className="border border-[#a3b1bc] p-2">{date(r.submittedAt)}</td><td className="border border-[#a3b1bc] p-2">{person(r.submittedByCrewId)}</td><td className="border border-[#a3b1bc] p-2">{label[r.decision || 'PENDING_APPROVAL']}</td><td className="border border-[#a3b1bc] p-2"><ActionIcon label={tx("pmsRework.viewSubmission")} icon={<Eye />} onClick={() => setRevision(r.revision)} /></td></tr>)}</tbody></table>{!detail.reports.length && <p className="p-3 text-xs text-gray-400">{tx("pmsRework.noReportSubmittedForReviewYet")}</p>}</div></div></details>}
      {!detail.timeline.length && <p className="text-xs text-gray-500">{tx("pmsRework.noWorkflowHistoryYet")}</p>}
      <ol className="ml-1 border-l border-blue-100">{detail.timeline.map(e => <li key={e.id} className="relative grid gap-1 pb-4 pl-5 text-xs sm:grid-cols-[140px_minmax(0,1fr)_110px] sm:gap-3"><span className="absolute -left-[4px] top-1 h-2 w-2 rounded-full border-2 border-white bg-blue-500" /><time className="text-slate-500">{date(e.changedAt)}</time><p className="break-words text-slate-700">{e.reason || tx("pmsRework.workOrderUpdated")}</p><span className="break-words font-medium text-slate-600">{person(e.changedBy)}</span></li>)}</ol>
    </Section>
  const checklistResult = <Section title={tx("pmsRework.checklistAndReadings")} scrollable="table" actions={<span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-slate-500">{submitted ? `${submitted.checklist.filter(c => c.completed).length} / ${submitted.checklist.length}` : '0'}</span>}>
        {report.data ? <ReportContent report={report.data} section="checklist" compact bounded /> : <p className="py-4 text-center text-xs text-slate-500">{revision ? tx("pmsRework.loadingReport") : tx("pmsRework.noExecutionReportYet")}</p>}
      </Section>
  const materialResult = <div className="execute-material-result"><Section title={tx("pmsRework.materialsUsed")} scrollable="table" actions={<span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-slate-500">{submitted?.materials.length || 0}</span>}>
        {report.data ? <ReportContent report={report.data} section="materials" bounded /> : <p className="py-6 text-center text-xs text-slate-500">{tx("pmsRework.noMaterialUsageRecordedYet")}</p>}
      </Section></div>
  if (orderBase === '/pms/execute-work-orders' && mode === 'execute' && executor && w.status === 'IN_PROGRESS')
    return <Execution key={w.id} detail={detail} information={information} lastUpdated={w.updatedAt ? date(w.updatedAt) : undefined} />
  return <div className="min-h-full bg-white"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-3">{touchDetail ? <div><Link className={`${button} !h-14 gap-3`} to={listPath}><ArrowLeft size={26} aria-hidden="true" />{tx("pmsRework.back")}</Link><h1 className="sr-only">{tx("pmsRework.woDetails")} · {w.name || tx("pmsRework.draftWO")}</h1></div> : <div><nav aria-label={tx("pmsRework.workOrderNavigation")} className="mb-1 flex flex-wrap items-center gap-2 text-xs"><Link className="text-blue-600" to={listPath}>{tx("pmsRework.workPlanning")}</Link><ChevronRight size={14} className="text-gray-400" /><Link className="text-blue-600" to={listPath}>{tx("pmsRework.workOrder")}</Link><ChevronRight size={14} className="text-gray-400" /><span className="font-medium">{w.name || tx("pmsRework.maintenanceOrder")}</span></nav><h1 className="text-base font-semibold">{mode === 'execute' ? tx("pmsRework.execute") : mode === 'review' ? tx("pmsRework.reviewApprove") : tx("pmsRework.woDetails")} · {w.name || tx("pmsRework.draftWO")}</h1></div>}<div className="flex flex-wrap items-center gap-2">
    {mode === 'view' && w.status === 'DRAFT' && <>{access.work('update') && <button className={button} onClick={() => setEditing(true)}>{tx("pmsRework.editDraft")}</button>}{access.work('create') && (!w.assignedTo || access.work('assign')) && <button className={primary} disabled={action.busy} onClick={() => void action.run(async () => { await pms.issue(w); await refresh() }, tx("pmsRework.workOrderIssued"))}>{tx("pmsRework.issue")}</button>}{access.work('delete') && <button className={button} disabled={action.busy} onClick={() => { if (confirm(tx("pmsRework.deleteThisDraftWO"))) void action.run(async () => { await pms.deleteDraft(w); await refresh(); navigate(listPath) }, tx("pmsRework.draftDeleted")) }}>{tx("pmsRework.deleteDraft")}</button>}</>}
    {mode === 'view' && canAssign && <button className={button} onClick={() => setAssigning(true)}>{tx("pmsRework.assignment")}</button>}
    {mode === 'view' && executor && ['ASSIGNED', 'RECTIFY', 'IN_PROGRESS'].includes(w.status) && <button className={primary} disabled={action.busy} onClick={() => { if (w.status === 'IN_PROGRESS') { navigate(`${orderBase}/${id}/execute`); return } void action.run(async () => { await pms.start(w); await refresh(); navigate(`${orderBase}/${id}/execute`) }, tx("pmsRework.workAcceptedAndStarted")) }}>{w.status === 'IN_PROGRESS' ? tx("pmsRework.continueExecution") : tx("pmsRework.acceptStart")}</button>}
    {mode === 'view' && canReview && <Link className={primary} to={`${orderBase}/${id}/review`}>{tx("pmsRework.reviewApprove")}</Link>}
    {mode === 'view' && access.work('update') && ['UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'RECTIFY'].includes(w.status) && <button className={button} onClick={() => setCancelling(true)}>{tx("pmsRework.cancelWO")}</button>}
    {mode !== 'view' && <Link className={button} to={`${orderBase}/${id}`}>{tx("pmsRework.woDetails")}</Link>}{mode === 'review' && canReview && <div aria-label={tx("pmsRework.woReviewDecision")} className="flex items-center gap-2">{access.work('reject') && <button className={button} disabled={action.busy || !!selfReview || !report.data || report.data.revision !== w.reportRevision} onClick={() => void approve(false)}>{tx("pmsRework.return")}</button>}{access.work('approve') && <button className={primary} disabled={action.busy || !!selfReview || !report.data || report.data.revision !== w.reportRevision} onClick={() => void approve(true)}>{tx("pmsRework.approve")}</button>}</div>}{w.updatedAt && <div className="ml-2 border-l border-gray-200 pl-3 text-xs"><p className="mb-1 text-slate-400">{tx("pmsRework.lastUpdated470")}</p><p className="text-slate-600">{date(w.updatedAt)}</p></div>}
  </div></header><div aria-label={tx("pmsRework.woDetailLayout")} className={`execute-work-order-detail-layout grid items-start gap-4 p-4 ${mode === 'execute' ? 'grid-cols-1' : 'xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]'}`}><main className="min-w-0 space-y-4">{!completedTouchDetail && information}
    {!!detail.missingInformation.length && <p className="rounded bg-amber-50 p-3 text-xs text-amber-800">{tx("pmsRework.requiredBeforeIssuing") + " "}{detail.missingInformation.map(localizePmsMessage).join(', ')}.</p>}
    {mode === 'execute' && (executor && w.status === 'IN_PROGRESS' ? <Execution key={w.id} detail={detail} /> : executor && ['ASSIGNED', 'RECTIFY'].includes(w.status) ? <button className={primary} disabled={action.busy} onClick={() => void action.run(async () => { await pms.start(w); await refresh() }, tx("pmsRework.workAcceptedAndStarted"))}>{tx("pmsRework.acceptAndStart")}{w.status === 'RECTIFY' ? tx("pmsRework.rework") : ''}</button> : <p className="text-sm text-gray-500">{tx("pmsRework.onlyAssignedOrSupportingCrewWithExecutionPermission")}</p>)}
    {mode === 'review' && <>{!canReview && <p className="text-sm text-gray-500">{tx("pmsRework.theWOIsNoLongerPendingApprovalOr")}</p>}{selfReview && <p className="rounded bg-amber-50 p-3 text-xs text-amber-800">{tx("pmsRework.contributorsCannotReviewOrApproveTheirOwnReports")}</p>}</>}
    {completedTouchDetail ? <DetailTabs items={[
      { key: 'information', name: tx("pmsRework.workOrderInformation"), content: information },
      { key: 'report', name: tx("pmsRework.submittedReport"), content: submittedReport },
      { key: 'history', name: tx("pmsRework.historyNotes"), content: workflowHistory },
    ]} /> : <>{submittedReport}{workflowHistory}</>}
    </main>
    {mode !== 'execute' && <aside aria-label={tx("pmsRework.woExecutionResult")} className={`min-w-0 ${orderBase === "/pms/execute-work-orders" ? "execute-work-order-results flex flex-col gap-6" : "space-y-4"}`}>
      {completedTouchDetail ? <DetailTabs items={[
        { key: 'checklist', name: tx("pmsRework.checklistAndReadings"), count: submitted?.checklist.length || 0, content: checklistResult },
        { key: 'materials', name: tx("pmsRework.materialsUsed"), count: submitted?.materials.length || 0, content: materialResult },
      ]} /> : <>{checklistResult}{materialResult}</>}
    </aside>} </div>{editing && w.status === 'DRAFT' && access.work('update') && <AdHocForm detail={detail} onClose={() => setEditing(false)} />}{assigning && canAssign && <Assignment detail={detail} onClose={() => setAssigning(false)} />}{cancelling && <ReasonDialog title={tx("pmsRework.cancelWorkOrder")} onClose={() => setCancelling(false)} action={async reason => { await pms.cancel(w, reason); await refresh() }} />}</div>
}
