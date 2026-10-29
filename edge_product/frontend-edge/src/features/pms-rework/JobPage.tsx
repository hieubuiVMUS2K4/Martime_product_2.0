import { translateMessage as tx, localizePmsMessage, messageLocale, useMessageLocale } from '@/i18n/messages'
import { isManualJob } from './manualJobs'
import { departmentName } from './departments'
import { readableCode } from './presentation'
import { useRef, useState } from 'react'
import type { JobDetail } from './types'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Archive, ChevronRight, ClipboardList, History, Pause, Pencil, Play, Plus } from 'lucide-react'
import { JobForm } from './Forms'
import { JobHistory } from './Reports'
import { pms, usePmsPermissions, usePmsQuery, usePmsRefresh, usePmsClock, cycle, label } from './data'
import { Badge, button, primary, input, ErrorBox, Field, Modal, Section, useAction } from './ui'
export function ReasonDialog({ title, onClose, action, optional = false, children }: { title: string; onClose: () => void; action: (reason: string) => Promise<unknown>; optional?: boolean; children?: React.ReactNode }) {
  useMessageLocale()

  const [reason, setReason] = useState(''); const { busy, run } = useAction()
  return <Modal title={title} onClose={onClose} busy={busy} footer={<button type="submit" form="pms-reason" className={primary} disabled={busy || (!optional && !reason.trim())}>{tx("pmsRework.confirm")}</button>}><form id="pms-reason" onSubmit={async e => { e.preventDefault(); if (await run(() => action(reason), tx("pmsRework.updated"))) onClose() }} className="space-y-4">{children}<Field name={optional ? tx("pmsRework.reasonForIssuingBeforeTheWarningWindow") : tx("pmsRework.reasonRequired")}><textarea autoFocus className={`${input} !h-24 py-2`} required={!optional} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></Field></form></Modal>
}
function JobField({ name, children }: { name: string; children: React.ReactNode }) {
  useMessageLocale()

  return <div className="min-w-0"><dt className="text-xs text-slate-500">{name}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800">{children}</dd></div>
}
function ManualReleaseDialog({ detail, onClose, onReleased }: { detail: JobDetail; onClose: () => void; onReleased: (id: string) => Promise<void> }) {
  useMessageLocale()

  const [reason, setReason] = useState(''), [dueDate, setDueDate] = useState(''), [hours, setHours] = useState('')
  const command = useRef<{ body: string; id: string } | null>(null)
  const { busy, run } = useAction()
  const valid = reason.trim() && (dueDate || hours !== '') && (hours === '' || Number.isFinite(Number(hours)) && Number(hours) >= 0 && Number(hours) <= 1000000000)
  return <Modal title={tx("pmsRework.issueWOManually")} busy={busy} onClose={onClose} footer={<button type="submit" form="pms-demand-release" className={primary} disabled={busy || !valid}>{tx("pmsRework.issueWO")}</button>}>
    <form id="pms-demand-release" className="space-y-4" onSubmit={async e => {
      e.preventDefault(); if (!valid) return
      const fields = { reason: reason.trim(), dueDate: dueDate || null, dueHours: hours === '' ? null : Number(hours) }
      const body = JSON.stringify({ ...fields, jobVersion: detail.job.version })
      if (!command.current || command.current.body !== body) command.current = { body, id: crypto.randomUUID() }
      if (await run(async () => { const order = await pms.releaseManual(detail, { ...fields, commandId: command.current!.id }); await onReleased(order.id) }, tx("pmsRework.requestedWorkOrderIssued"))) onClose()
    }}>
      <p className="text-sm font-medium">{label[detail.job.category]} · {detail.job.name} · {detail.job.equipmentName}</p>
      <Field name={tx("pmsRework.maintenanceReasonRequestRequired")}><textarea autoFocus required maxLength={2000} className={`${input} !h-24 py-2`} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} /></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field name={tx("pmsRework.completionDeadlineVesselDate")}><input type="date" className={input} value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={busy} /></Field><Field name={tx("pmsRework.runningHoursDeadline")}><input type="number" min={0} max={1000000000} step="any" className={input} value={hours} onChange={e => setHours(e.target.value)} disabled={busy} /></Field></div>
      <p className="text-xs leading-5 text-slate-500">{tx("pmsRework.enterAtLeastOneDeadlineIfBothAre")}</p>
    </form>
  </Modal>
}
export default function JobPage() {
  useMessageLocale()

  const {date,due}=usePmsClock(); const { id = '' } = useParams(); const access = usePmsPermissions(); const refresh = usePmsRefresh(); const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const query = usePmsQuery(['job', id], () => pms.job(id), access.enabled && access.job('view'))
  const references = usePmsQuery(['job-references'], pms.jobReferences, access.enabled && access.job('view'))
  const [edit, setEdit] = useState(false), [history, setHistory] = useState(false), [change, setChange] = useState<string | null>(null), [release, setRelease] = useState(false)
  const [tab, setTab] = useState<'checklist' | 'materials'>('checklist')
  const [resolve, setResolve] = useState<'REPLACE' | 'SKIP' | null>(null)
  if (!access.enabled || !access.job('view')) return <p className="p-6 text-sm text-gray-500">{tx("pmsRework.jobListIsDisabledOrYouDoNot")}</p>
  if (query.error) return <ErrorBox error={query.error} retry={() => void query.refetch()} />
  if (!query.data) return <p className="p-6 text-sm text-gray-500">{tx("pmsRework.loadingJob")}</p>
  const detail = query.data, j = detail.job
  const rank = references.data?.ranks.find(r => r.id === j.responsibleRankId)?.rankName
  const editOpen = (edit || params.get('edit') === '1') && access.job('update') && j.state !== 'REMOVED'
  const closeEdit = () => { setEdit(false); if (params.has('edit')) { const next = new URLSearchParams(params); next.delete('edit'); setParams(next, { replace: true }) } }
  const th = 'border-b border-r border-[#a3b1bc] bg-blue-50 px-3 py-2.5 text-center text-xs font-semibold text-slate-600'
  const td = 'border-b border-r border-[#a3b1bc] px-3 py-2.5 text-xs text-slate-700'
  return <div className="min-h-full bg-white">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
      <nav aria-label={tx("pmsRework.jobBreadcrumb")} className="min-w-0 flex-1"><ol className="flex min-w-0 items-center gap-2 text-sm"><li className="shrink-0"><Link className="text-blue-600 hover:underline" to="/pms/work-planning?tab=table">{tx("pmsRework.workPlanning")}</Link></li><li aria-hidden="true"><ChevronRight size={15} className="text-slate-400" /></li><li className="min-w-0" aria-current="page"><h1 className="truncate font-semibold text-slate-900" title={j.name}>{j.name}</h1></li></ol></nav>
      <div className="flex flex-wrap gap-2"><button className={button} onClick={() => setHistory(true)}><History size={14} />{tx("pmsRework.maintenanceHistory")}</button>{access.job('update') && <><button className={button} onClick={() => setEdit(true)} disabled={j.state === 'REMOVED'}><Pencil size={14} />{tx("pmsRework.editJob")}</button>{(j.state === 'PAUSED' || j.state === 'RETIRED' || j.state === 'REMOVED') ? <button className={button} onClick={() => setChange('ACTIVE')}><Play size={14} />{j.state === 'REMOVED' ? tx("pmsRework.restore") : tx("pmsRework.resume")}</button> : <><button className={button} onClick={() => setChange('PAUSED')}><Pause size={14} />{tx("pmsRework.paused")}</button><button className={button} onClick={() => setChange('RETIRED')}><Archive size={14} />{tx("pmsRework.retired")}</button></>}</>}{access.work('create') && j.state === 'ACTIVE' && (j.category === 'PERIODIC' || isManualJob(j.category)) && !j.openWorkOrderId && !detail.requiresCycleResolution && <button className={primary} onClick={() => setRelease(true)}><Plus size={14} />{tx("pmsRework.issueWO")}</button>}</div>
    </header>
    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <main className="min-w-0 space-y-4">
        {!!detail.missingInformation.length && <div role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{tx("pmsRework.informationRequired233") + " "}{detail.missingInformation.map(localizePmsMessage).join(', ')}.</div>}
        {detail.requiresCycleResolution && <div className="space-y-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><p>{tx("pmsRework.theCurrentCycleWasCancelledTheOldWO")}</p>{detail.cancelledWorkOrderId && <div className="flex flex-wrap gap-2">{access.work('view') && <Link className={button} to={`/pms/work-orders/${detail.cancelledWorkOrderId}`}>{tx("pmsRework.viewCancelledWO")}</Link>}{j.state === 'ACTIVE' && access.job('update') && <>{access.work('create') && <button className={button} onClick={() => setResolve('REPLACE')}>{tx("pmsRework.issueReplacementWO")}</button>}{access.work('update') && <button className={button} onClick={() => setResolve('SKIP')}>{tx("pmsRework.skipThisCycle")}</button>}</>}</div>}</div>}
        <Section title={tx("pmsRework.jobInformation")}><dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <JobField name={tx("pmsRework.jobCode")}>{j.code}</JobField><JobField name={tx("pmsRework.equipment")}>{j.equipmentName || tx("pmsRework.notSelected")}</JobField><JobField name={tx("pmsRework.status")}><Badge value={j.state} /></JobField>
          <JobField name={tx("pmsRework.maintenanceType")}>{label[j.category] || j.category}</JobField><JobField name={tx("pmsRework.interval")}>{cycle(j)}</JobField><JobField name={tx("pmsRework.priority")}><Badge value={detail.priority} /></JobField>
        </dl></Section>
        <Section title={tx("pmsRework.workInstructions")}><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{detail.instructions || tx("pmsRework.noWorkInstructionsYet")}</p></Section>
        <section className="overflow-hidden rounded border border-gray-200">
          <nav aria-label={tx("pmsRework.jobContent")} className="flex gap-1 border-b border-gray-200 bg-gray-50 px-3">{([{key:'checklist',name:tx("pmsRework.checklistTemplate"),count:detail.checklist.length},{key:'materials',name:tx("pmsRework.equipmentMaterials"),count:detail.equipmentMaterials.length}] as const).map(item => <button key={item.key} className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm ${tab === item.key ? 'border-blue-600 font-medium text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`} aria-current={tab === item.key ? 'page' : undefined} onClick={() => setTab(item.key)}>{item.name}<span className="rounded bg-white px-1.5 text-xs text-slate-500">{item.count}</span></button>)}</nav>
          <div className="overflow-auto p-3">{tab === 'checklist' ? <table className="w-full min-w-[600px] border-separate border-spacing-0 border-l border-t border-[#a3b1bc]"><thead><tr>{[tx("pmsRework.no"), tx("pmsRework.description"), tx("pmsRework.readingRequired245"), tx("pmsRework.unit"), tx("pmsRework.min"), tx("pmsRework.max")].map(name => <th key={name} className={th}>{name}</th>)}</tr></thead><tbody>{detail.checklist.map((c, i) => <tr key={c.sequenceOrder} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>{[i + 1, c.checkpointDescription, c.requiresReading ? tx("pmsRework.yes") : tx("pmsRework.no247"), c.unit || '—', c.normalRangeMin ?? '—', c.normalRangeMax ?? '—'].map((value, n) => <td key={n} className={`${td} ${n === 0 ? 'w-12 text-center' : ''}`}>{value}</td>)}</tr>)}{!detail.checklist.length && <tr><td className={`${td} py-8 text-center text-slate-500`} colSpan={6}>{tx("pmsRework.noChecklistTemplateYet")}</td></tr>}</tbody></table>
            : <><p className="mb-3 text-xs text-slate-500">{tx("pmsRework.materialsAreManagedAndAssignedOnTheEquipment")}</p><table className="w-full border-separate border-spacing-0 border-l border-t border-[#a3b1bc]"><thead><tr>{[tx("pmsRework.materialCode"), tx("pmsRework.materialName"), tx("pmsRework.unit")].map(name => <th key={name} className={th}>{name}</th>)}</tr></thead><tbody>{detail.equipmentMaterials.map((m,i) => <tr key={m.id} className={i % 2 ? 'bg-gray-50' : 'bg-white'}><td className={td}>{m.itemCode}</td><td className={td}>{m.name}</td><td className={td}>{m.unit || '—'}</td></tr>)}{!detail.equipmentMaterials.length && <tr><td colSpan={3} className={`${td} py-8 text-center text-slate-500`}>{tx("pmsRework.noMaterialsAssignedToThisEquipment")}</td></tr>}</tbody></table></>}
          </div>
        </section>
      </main>
      <aside className="min-w-0 space-y-4">
        <Section title={tx("pmsRework.maintenancePlan")}><dl className="space-y-4"><JobField name={tx("pmsRework.nextDeadline")}>{isManualJob(j.category) ? (j.openWorkOrderId ? tx("pmsRework.woIssued") : tx("pmsRework.awaitingWORelease")) : due(j.nextDueAt, j.nextDueHours)}</JobField><JobField name={tx("pmsRework.lastSubmittedCompletion")}>{date(j.lastSubmittedAt)}</JobField><JobField name={tx("pmsRework.lastRecordedRunningHours")}>{j.lastRunningHours != null ? tx(j.lastRunningHours === 1 ? "pmsRework.hoursSingular" : "pmsRework.hours", { p0: j.lastRunningHours.toLocaleString(messageLocale()) }) : '—'}</JobField><JobField name={tx("pmsRework.issueWO")}>{isManualJob(j.category) ? tx("pmsRework.manuallyFromJob") : j.autoGenerate ? tx("pmsRework.automaticallyByInterval") : tx("pmsRework.manual")}</JobField>{j.category === 'PERIODIC' && <JobField name={tx("pmsRework.releaseTiming")}>{detail.releasePolicy === 'ON_DUE' ? tx("pmsRework.whenDue") : tx("pmsRework.whenUpcoming")}</JobField>}</dl></Section>
        <Section title={tx("pmsRework.responsibility")}><dl className="space-y-4"><JobField name={tx("pmsRework.responsibleDepartment")}>{departmentName(j.department)}</JobField><JobField name={tx("pmsRework.rank")}>{rank || tx("pmsRework.notSpecified")}</JobField><JobField name={tx("pmsRework.responsiblePerson")}>{j.responsibleName || tx("pmsRework.notSelected")}</JobField></dl></Section>
        {j.openWorkOrderId && <Section title={tx("pmsRework.openWorkOrder")}><p className="mb-3 break-all text-xs text-slate-600">{readableCode(j.openWorkOrderCode) || j.name}</p>{access.work('view') ? <Link className={`${button} w-full text-blue-600`} to={`/pms/work-orders/${j.openWorkOrderId}`}><ClipboardList size={14} />{tx("pmsRework.viewWorkOrder")}</Link> : <p className="text-xs text-gray-500">{tx("pmsRework.youDoNotHavePermissionToViewWork")}</p>}</Section>}
      </aside>
    </div>
    {editOpen && <JobForm detail={detail} onClose={closeEdit} />}{history && <JobHistory job={j} onClose={() => setHistory(false)} />}
    {change && <ReasonDialog title={`${label[change]} · ${j.name}`} onClose={() => setChange(null)} action={async reason => { await pms.jobState(j, change, reason); await refresh() }} />}
    {resolve && <ReasonDialog title={resolve === 'REPLACE' ? tx("pmsRework.issueReplacementWO") : tx("pmsRework.skipMaintenanceCycle")} onClose={() => setResolve(null)} action={async reason => { const result = await pms.resolveCycle(detail, resolve, reason); await refresh(); if (result.workOrderId) navigate(`/pms/work-orders/${result.workOrderId}`) }}><p className="text-sm">{j.name}{" " + tx("pmsRework.currentCycleDeadline") + " "}{due(j.nextDueAt, j.nextDueHours)}.</p><p className="text-sm text-slate-600">{resolve === 'REPLACE' ? tx("pmsRework.createANewWOForTheSameCycle") : tx("pmsRework.advanceExactlyOneIntervalFromTheCurrentDeadline")}</p></ReasonDialog>}
    {release && isManualJob(j.category) && <ManualReleaseDialog detail={detail} onClose={() => setRelease(false)} onReleased={async orderId => { await refresh(); navigate('/pms/work-orders/' + orderId) }} />}
    {release && j.category === 'PERIODIC' && <ReasonDialog title={tx("pmsRework.issueWOFromJob")} optional onClose={() => setRelease(false)} action={async reason => { const order = await pms.release(detail, reason); await refresh(); navigate(`/pms/work-orders/${order.id}`) }}><p className="text-sm">{j.name} · {j.equipmentName}</p><p className="text-xs text-gray-500">{tx("pmsRework.due273") + " "}{due(j.nextDueAt, j.nextDueHours)}{tx("pmsRework.theIssuedOrderKeepsItsOwnContentAnd")}</p></ReasonDialog>}
  </div>
}
