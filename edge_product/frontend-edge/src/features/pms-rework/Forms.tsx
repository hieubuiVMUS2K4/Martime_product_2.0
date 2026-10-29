import { translateMessage as tx, useMessageLocale } from '@/i18n/messages'
import { isManualJob } from './manualJobs'
import { departmentCode, departmentNames } from './departments'
import { JobFormHelp } from './JobFormHelp'
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { pms, snapshot, usePmsQuery, usePmsRefresh, usePmsPermissions, usePmsClock, message, label } from './data'
import { vesselInput, vesselLocalToUtc } from './time'
import { toast } from 'sonner'
import { apiClient } from '@/services/api.client'
import { foldVietnamese } from '@/utils/text'
import { button, primary, input, Field, Section, Modal, ErrorBox, useAction } from './ui'
import { ChecklistEditor } from './ChecklistEditor'
import type { AdHocDefinition, JobDefinition, JobDetail, JobImpact, WorkOrderDetail, ChecklistTemplate, CrewOption, EquipmentNode } from './types'
export const useEquipment = () => usePmsQuery(['equipment-tree'], () => apiClient.get<EquipmentNode[]>('/pms/work-orders/equipment-tree'))
export function EquipmentSelect({ value, onChange }: { value?: string | null; onChange: (id: string | null) => void }) {
  useMessageLocale()

  const tree = useEquipment()
  const [open, setOpen] = useState(false), [term, setTerm] = useState(''), [active, setActive] = useState(0)
  const [position, setPosition] = useState<CSSProperties>({})
  const box = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null), search = useRef<HTMLInputElement>(null)
  const listId = useId()
  const options = (tree.data || []).filter(a => a.category !== 'SYSTEM' && a.isActive && a.status !== 'DECOMMISSIONED')
  const selected = options.find(a => a.id === value)
  const matches = options.filter(a => foldVietnamese(`${a.assetName} ${a.assetCode}`).includes(foldVietnamese(term)))
  const visible = matches.slice(0, 100)
  const close = () => { setOpen(false); setTerm(''); setActive(0) }
  const pick = (id: string | null) => { if (search.current?.matches(':disabled')) return; onChange(id); close(); search.current?.focus() }
  useLayoutEffect(() => {
    if (!open || !box.current) return
    const rect = box.current.getBoundingClientRect(), below = window.innerHeight - rect.bottom - 12, above = rect.top - 12
    const upward = below < 180 && above > below
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)), width: Math.min(rect.width, window.innerWidth - 16), top: upward ? rect.top - 4 : rect.bottom + 4, maxHeight: Math.min(280, upward ? above : below), transform: upward ? 'translateY(-100%)' : undefined })
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node)) close() }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); search.current?.focus() } }
    const scroll = (e: Event) => { if (!panel.current?.contains(e.target as Node)) close() }
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape, true)
    window.addEventListener('scroll', scroll, true); window.addEventListener('resize', scroll)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape, true); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', scroll) }
  }, [open])
  useEffect(() => { if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' }) }, [active, open, listId])
  return <><div className="relative" ref={box}><Search size={14} className="pointer-events-none absolute left-2 top-2 text-slate-400" aria-hidden="true" />
    <input ref={search} role="combobox" aria-label={tx("pmsRework.equipment")} aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open && visible[active] ? `${listId}-${active}` : undefined} autoComplete="off" className={`${input} !pl-7 !pr-12`} placeholder={tree.isLoading ? tx("pmsRework.loadingEquipment") : tx("pmsRework.searchEquipmentNameOrCode")}
      value={open ? term : selected ? `${selected.assetName} · ${selected.assetCode}` : value ? tx("pmsRework.equipmentIsNoLongerAvailable") : ''}
      onFocus={() => { setTerm(''); setActive(0); setOpen(true) }} onChange={e => { setTerm(e.target.value); setActive(0); setOpen(true) }}
      onBlur={() => close()} onKeyDown={e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive(i => open ? Math.max(0, Math.min(visible.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))) : 0) }
        if (e.key === 'Enter' && open) { e.preventDefault(); if (visible[active]) pick(visible[active].id) }
      }} />
    {value && <button type="button" className="absolute right-6 top-1.5 rounded text-slate-400 hover:text-red-500" aria-label={tx("pmsRework.clearEquipmentSelection")} onClick={() => pick(null)}><X size={16} /></button>}
    <button type="button" aria-label={tx("pmsRework.openEquipmentList")} className="absolute right-1.5 top-1.5 text-slate-400" onClick={() => { search.current?.focus(); setOpen(true) }}><ChevronDown size={16} /></button>
  </div>{open && createPortal(<div ref={panel} id={listId} role="listbox" aria-label={tx("pmsRework.equipmentList")} style={position} className="fixed z-[1400] overflow-y-auto rounded border border-slate-300 bg-white py-1 shadow-xl" onMouseDown={e => e.preventDefault()}>
    {tree.isLoading ? <p className="px-3 py-3 text-xs text-slate-500">{tx("pmsRework.loadingEquipment")}</p> : visible.length ? visible.map((a, i) => <div key={a.id} id={`${listId}-${i}`} role="option" aria-selected={a.id === value} className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-xs ${active === i ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-blue-50'}`} onMouseEnter={() => setActive(i)} onClick={() => pick(a.id)}><span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.assetName}</span><span className="block truncate text-slate-500">{a.assetCode}</span></span>{a.id === value && <Check size={14} aria-hidden="true" />}</div>) : <p className="px-3 py-3 text-xs text-slate-500">{tx("pmsRework.noMatchingEquipmentFound")}</p>}
    {matches.length > 100 && <p className="border-t px-3 py-2 text-xs text-slate-500">{tx("pmsRework.enterMoreOfTheNameOrCodeTo")}</p>}
  </div>, document.body)}{tree.error && <ErrorBox error={tree.error} retry={() => void tree.refetch()} />}</>
}
export function CrewSelect({ value, onChange, crew }: { value?: string | null; onChange: (id: string | null) => void; crew: CrewOption[] }) {
  useMessageLocale()
 return <select className={input} value={value || ''} onChange={e => onChange(e.target.value || null)}><option value="">{tx("pmsRework.unassigned")}</option>{crew.map(c => <option key={c.crewId} value={c.crewId}>{c.fullName}</option>)}</select> }
export function SupportSelect({ crew, pic, selected, onChange }: { crew: CrewOption[]; pic?: string | null; selected: string[]; onChange: (ids: string[]) => void }) {
  useMessageLocale()

  return <div className="flex max-h-28 flex-wrap gap-x-4 gap-y-2 overflow-auto rounded border border-gray-200 p-2 text-xs">{crew.filter(c => c.crewId !== pic).map(c => <label key={c.crewId} className="flex items-center gap-1"><input type="checkbox" disabled={!pic} checked={selected.includes(c.crewId)} onChange={e => onChange(e.target.checked ? [...selected, c.crewId] : selected.filter(id => id !== c.crewId))} />{c.fullName}</label>)}{!pic && <span className="text-gray-400">{tx("pmsRework.selectThePersonInChargeBeforeAddingSupporting")}</span>}</div>
}
const num = (value: string) => value === '' ? null : Number(value)
export function JobForm({ detail, onClose }: { detail?: JobDetail; onClose: () => void }) {
  useMessageLocale()

  const clock = usePmsClock()
  const j = detail?.job
  const [form, setForm] = useState<JobDefinition>(() => ({ expectedVersion: j?.version, code: j?.code || '', workCode: j?.workCode || null, name: j?.name || '', equipmentAssetId: j?.equipmentAssetId || null,
    category: j?.category || 'PERIODIC', intervalType: j?.intervalType || 'CALENDAR', intervalDays: j?.intervalDays || null, intervalMonths: j?.intervalMonths || null, intervalYears: j?.intervalYears || null, intervalHours: j?.intervalHours || null,
    baselineAt: detail?.baselineAt || null, baselineRunningHours: detail?.baselineRunningHours ?? null, baselineSource: detail?.baselineSource || null,
    warningDays: detail?.daysBeforeDue ?? 7, warningHours: detail?.warningHours ?? 50, releasePolicy: detail?.releasePolicy || 'ON_UPCOMING', autoGenerate: j?.autoGenerate || false,
    priority: detail?.priority || 'NORMAL', department: departmentCode(j?.department), responsibleRankId: j?.responsibleRankId ?? null, responsibleCrewId: j?.responsibleCrewId || null,
    assignmentPolicy: detail?.assignmentPolicy || 'ON_RELEASE', defaultCrewId: detail?.defaultCrewId || null, instructions: detail?.instructions || null, checklist: detail?.checklist || [] }))
  const [impact, setImpact] = useState<JobImpact | null>(null)
  const update = (patch: Partial<JobDefinition>) => { setImpact(null); setForm(previous => ({ ...previous, ...patch })) }
  const refs = usePmsQuery(['job-references'], pms.jobReferences)
  const rankDepartment = departmentCode(refs.data?.ranks.find(r => r.id === form.responsibleRankId)?.department)
  useEffect(() => { if (rankDepartment && form.department !== rankDepartment) { setForm(previous => ({ ...previous, department: rankDepartment })); setImpact(null) } }, [rankDepartment, form.department])
  const departments = Array.from(new Set([...Object.keys(departmentNames), ...(refs.data?.ranks.map(r => departmentCode(r.department)).filter((d): d is string => !!d) || []), ...(form.department ? [form.department] : [])]))
  const { busy, run } = useAction(); const refresh = usePmsRefresh()
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!impact) { await run(async () => setImpact(await pms.previewJob(j?.id, form)), tx("pmsRework.impactCalculatedReviewBeforeConfirmingTheSave")); return }
    if (impact.reasonRequired && !form.changeReason?.trim()) return void toast.error(tx("pmsRework.aReasonIsRequiredToChangeTheBaseline"))
    if (await run(async () => { await pms.saveJob(j?.id, form); await refresh() }, tx("pmsRework.jobSaved"))) onClose()
  }
  const calendar = form.category === 'PERIODIC' && form.intervalType !== 'RUNNING_HOURS'
  const hours = form.category === 'PERIODIC' && form.intervalType !== 'CALENDAR'
  return <Modal title={j ? tx("pmsRework.editJob") : tx("pmsRework.addJob")} onClose={onClose} busy={busy} footer={<button className={primary} disabled={busy || !!refs.error} form="pms-job-form" type="submit">{impact ? tx("pmsRework.confirmSave") : tx("pmsRework.previewAndSave")}</button>}>
    <form id="pms-job-form" onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
      {impact && <Section title={tx("pmsRework.impactOfSaving")}><div role="status" className="space-y-2 text-sm text-gray-700">
        <div className="overflow-auto"><table className="w-full border-collapse text-left text-xs"><thead className="bg-blue-50"><tr><th className="border border-gray-200 p-2">{tx("pmsRework.currentDeadline")}</th><th className="border border-gray-200 p-2">{tx("pmsRework.deadlineAfterSaving")}</th><th className="border border-gray-200 p-2">{tx("pmsRework.jobStatus")}</th></tr></thead><tbody><tr><td className="border border-gray-200 p-2">{clock.due(impact.previousDueAt, impact.previousDueHours)}</td><td className="border border-gray-200 p-2">{clock.due(impact.nextDueAt, impact.nextDueHours)}</td><td className="border border-gray-200 p-2">{label[impact.state] || impact.state}</td></tr></tbody></table></div>
        {impact.openWorkOrders > 0 && <p>{impact.openWorkOrders}{" " + tx("pmsRework.openWorkOrdersRetainTheirDeadlinesChecklistsAnd")}</p>}
        {impact.usesApprovedExecution && <p>{tx("pmsRework.theNextDeadlineIsBasedOnTheApproved")}</p>}
        {impact.reasonRequired && <p className="text-amber-700">{tx("pmsRework.changingTheBaselineOfAnOperationalJobRequires")}</p>}
        {impact.automaticReleaseRequested && <p>{tx("pmsRework.theJobWillBeCheckedForAutomaticRelease")}</p>}
        {impact.missingInformation.length > 0 && <p className="text-amber-700">{tx("pmsRework.remaining") + " "}{impact.missingInformation.length}{" " + tx("pmsRework.requiredDetailsAutomaticWorkOrderReleaseIsUnavailable")}</p>}
      </div></Section>}
      <Section title={tx("pmsRework.jobInformation")} help={<JobFormHelp group="information" />}><div className="grid gap-4 md:grid-cols-3">
        <Field name={tx("pmsRework.jobCodeRequired")}><input className={input} value={form.code} required maxLength={50} onChange={e => update({ code: e.target.value })} /></Field>
        <Field name={tx("pmsRework.jobNameRequired")}><input className={input} value={form.name} required maxLength={200} onChange={e => update({ name: e.target.value })} /></Field>
        <Field name={tx("pmsRework.equipment")}><EquipmentSelect value={form.equipmentAssetId} onChange={equipmentAssetId => update({ equipmentAssetId })} /></Field>
        <Field name={tx("pmsRework.maintenanceType")}><select className={input} value={form.category} onChange={e => update({ category: e.target.value, intervalDays: null, intervalMonths: null, intervalYears: null, intervalHours: null })}>{['PERIODIC', 'DRY_DOCK', 'ON_DEMAND', 'VOYAGE'].map(s => <option key={s} value={s}>{label[s]}</option>)}</select></Field>
        <Field name={tx("pmsRework.priority")}><select className={input} value={form.priority} onChange={e => update({ priority: e.target.value })}>{['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map(s => <option key={s} value={s}>{label[s]}</option>)}</select></Field>
        <Field name={tx("pmsRework.sourceWorkCode")}><input className={input} maxLength={50} value={form.workCode || ''} onChange={e => update({ workCode: e.target.value || null })} /></Field>
        <div className="md:col-span-3"><Field name={tx("pmsRework.instructions")}><textarea className={`${input} !h-24 py-2`} maxLength={20000} value={form.instructions || ''} onChange={e => update({ instructions: e.target.value || null })} /></Field></div>
      </div></Section>
      {isManualJob(form.category) && <p className="rounded border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-slate-600">{tx("pmsRework.dryDockPerVoyageAndOnDemandJobs")}</p>}
      {form.category === 'PERIODIC' && <Section title={tx("pmsRework.intervalAndInitialBaseline")} help={<JobFormHelp group="cycle" />}><div className="grid gap-4 md:grid-cols-3">
        <Field name={tx("pmsRework.calculateIntervalBy")}><select aria-label={tx("pmsRework.calculateIntervalBy")} className={input} value={form.intervalType} onChange={e => update({ intervalType: e.target.value, intervalDays: null, intervalMonths: null, intervalYears: null, intervalHours: null })}><option value="CALENDAR">{tx("pmsRework.calendar")}</option><option value="RUNNING_HOURS">{tx("pmsRework.runningHours")}</option><option value="HYBRID">{tx("pmsRework.calendarOrRunningHoursWhicheverComesFirst")}</option></select></Field>
        {calendar && <><Field name={tx("pmsRework.calendarInterval")}><div className="flex gap-2"><input aria-label={tx("pmsRework.intervalValue")} className={input} type="number" min={1} value={form.intervalDays || form.intervalMonths || form.intervalYears || ''} onChange={e => { const unit = form.intervalYears ? 'intervalYears' : form.intervalDays ? 'intervalDays' : 'intervalMonths'; update({ [unit]: num(e.target.value) }) }} /><select aria-label={tx("pmsRework.intervalUnit")} className={input} value={form.intervalYears ? 'year' : form.intervalDays ? 'day' : 'month'} onChange={e => { const count = form.intervalDays || form.intervalMonths || form.intervalYears || 1; update({ intervalDays: e.target.value === 'day' ? count : null, intervalMonths: e.target.value === 'month' ? count : null, intervalYears: e.target.value === 'year' ? count : null }) }}><option value="day">{tx("pmsRework.days95")}</option><option value="month">{tx("pmsRework.months96")}</option><option value="year">{tx("pmsRework.years97")}</option></select></div></Field>
        <Field name={tx("pmsRework.initialBaselineVesselTime")}><input className={input} type="datetime-local" disabled={!clock.zone} value={vesselInput(form.baselineAt, clock.zone)} onChange={e => { try { update({ baselineAt: e.target.value ? vesselLocalToUtc(e.target.value, clock.zone!) : null }) } catch (error) { toast.error(message(error)) } }} /></Field></>}
        {hours && <><Field name={tx("pmsRework.runningHoursInterval")}><input className={input} type="number" min={1} max={10000000} value={form.intervalHours ?? ''} onChange={e => update({ intervalHours: num(e.target.value) })} /></Field><Field name={tx("pmsRework.initialCounterBaseline")}><input className={input} type="number" min={0} step="any" value={form.baselineRunningHours ?? ''} onChange={e => update({ baselineRunningHours: num(e.target.value) })} /></Field></>}
        <Field name={tx("pmsRework.baselineReferenceSource")}><input className={input} maxLength={1000} value={form.baselineSource || ''} onChange={e => update({ baselineSource: e.target.value || null })} /></Field>
        <Field name={tx("pmsRework.reasonForBaselineChange")}><input className={input} maxLength={1000} value={form.changeReason || ''} onChange={e => update({ changeReason: e.target.value || null })} /></Field>
        {calendar && <Field name={tx("pmsRework.advanceWarningDays")}><input className={input} type="number" min={0} max={3650} value={form.warningDays} onChange={e => update({ warningDays: Number(e.target.value) })} /></Field>}
        {hours && <Field name={tx("pmsRework.advanceWarningRunningHours")}><input className={input} type="number" min={0} value={form.warningHours} onChange={e => update({ warningHours: Number(e.target.value) })} /></Field>}
        <Field name={tx("pmsRework.issueWOWhen")}><select className={input} value={form.releasePolicy} onChange={e => update({ releasePolicy: e.target.value })}><option value="ON_UPCOMING">{tx("pmsRework.upcoming")}</option><option value="ON_DUE">{tx("pmsRework.due")}</option></select></Field>
        <Field name={tx("pmsRework.automaticRelease")}><label className="flex h-8 items-center gap-2"><input type="checkbox" checked={form.autoGenerate} disabled={!clock.automaticReleaseEnabled} onChange={e => update({ autoGenerate: e.target.checked })} />{tx("pmsRework.generateWOByInterval")}</label></Field>
        <p className="text-xs text-gray-500 md:col-span-3">{tx("pmsRework.youMaySaveAnIncompleteBaselineAndAdd") + " "}{clock.automaticReleaseEnabled ? tx("pmsRework.whenEnabledTheVesselCreatesPeriodicWorkOrders") : tx("pmsRework.automaticReleaseIsNotEnabledOnThisVessel")}</p>
      </div></Section>}
      <Section title={tx("pmsRework.responsibility")} help={<JobFormHelp group="responsibility" />}><div className="grid gap-4 md:grid-cols-3">
        <Field name={tx("pmsRework.responsibleDepartment")}><select aria-label={tx("pmsRework.responsibleDepartment")} className={input} value={rankDepartment || form.department || ''} disabled={!!rankDepartment} onChange={e => update({ department: e.target.value || null })}><option value="">{tx("pmsRework.notSelected")}</option>{departments.map(code => <option key={code} value={code}>{departmentNames[code] || code}</option>)}</select>{rankDepartment && <span className="text-xs text-gray-400">{tx("pmsRework.basedOnTheSelectedRankClearTheRank")}</span>}</Field>
        <Field name={tx("pmsRework.responsibleRank")}><select aria-label={tx("pmsRework.responsibleRank")} className={input} value={form.responsibleRankId ?? ''} onChange={e => { const responsibleRankId = num(e.target.value); const department = departmentCode(refs.data?.ranks.find(r => r.id === responsibleRankId)?.department); update({ responsibleRankId, ...(department ? { department } : {}) }) }}><option value="">{tx("pmsRework.notSelected")}</option>{refs.data?.ranks.map(r => <option key={r.id} value={r.id}>{r.rankName}</option>)}</select></Field>
        <Field name={tx("pmsRework.responsiblePerson")}><select className={input} value={form.responsibleCrewId || ''} onChange={e => update({ responsibleCrewId: e.target.value || null })}><option value="">{tx("pmsRework.notSelected")}</option>{refs.data?.crew.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>
        <Field name={tx("pmsRework.assignmentForEachWO")}><select className={input} value={form.assignmentPolicy} onChange={e => update({ assignmentPolicy: e.target.value, defaultCrewId: null })}><option value="ON_RELEASE">{tx("pmsRework.assignWhenWOIsIssued")}</option><option value="PREASSIGNED">{tx("pmsRework.defaultAssignee")}</option></select></Field>
        {form.assignmentPolicy === 'PREASSIGNED' && <Field name={tx("pmsRework.defaultAssignee")}><CrewSelect crew={refs.data?.crew || []} value={form.defaultCrewId} onChange={defaultCrewId => update({ defaultCrewId })} /></Field>}
      </div>{refs.error && <ErrorBox error={refs.error} retry={() => void refs.refetch()} />}</Section>
      <ChecklistEditor help={<JobFormHelp group="checklist" />} value={form.checklist} onChange={checklist => update({ checklist })} />
    </fieldset></form>
  </Modal>
}
export function AdHocForm({ detail, onClose }: { detail?: WorkOrderDetail; onClose: () => void }) {
  useMessageLocale()

  const access = usePmsPermissions()
  const w = detail?.workOrder
  const [form, setForm] = useState<AdHocDefinition>(() => ({ name: w?.name || '', equipmentAssetId: w?.equipmentAssetId || null, instructions: detail?.workOrderInstructions || null,
    priority: w?.priority || 'NORMAL', department: departmentCode(w?.department), dueDate: detail?.dueDate || null, dueHours: w?.dueHours ?? null,
    warningDays: detail?.warningDays ?? 7, warningHours: detail?.warningHours ?? 50, crewId: w?.assignedTo || null,
    supportingCrewIds: snapshot<string[]>(detail?.supportingCrewIds) || [], checklist: snapshot<ChecklistTemplate[]>(detail?.draftChecklistJson) || [] }))
  const refs = usePmsQuery(['wo-crew'], pms.crew)
  const update = (patch: Partial<AdHocDefinition>) => setForm(f => ({ ...f, ...patch }))
  const command = useRef<{ body: string; id: string } | null>(null)
  const { busy, run } = useAction(); const refresh = usePmsRefresh(); const navigate = useNavigate()
  const save = async (issue: boolean) => {
    if (issue && (!form.name.trim() || !form.equipmentAssetId || !(form.dueDate || form.dueHours != null))) return void toast.error(tx("pmsRework.enterANameEquipmentAndADateOr"))
    const body = JSON.stringify({ form, issue })
    if (!command.current || command.current.body !== body) command.current = { body, id: crypto.randomUUID() }
    if (await run(async () => { const result = w ? await pms.saveDraft(w, form) : await pms.createOrder(form, command.current!.id, issue); await refresh(); if (!w) navigate(`/pms/work-orders/${result.id}`) }, issue ? tx("pmsRework.workOrderIssued") : tx("pmsRework.draftSaved"))) onClose()
  }
  return <Modal title={w ? tx("pmsRework.editDraftWO") : tx("pmsRework.createAdHocWO")} onClose={onClose} busy={busy} footer={<><button className={button} disabled={busy} onClick={() => void save(false)}>{tx("pmsRework.saveDraft")}</button>{!w && <button className={primary} disabled={busy} onClick={() => void save(true)}>{tx("pmsRework.saveAndIssue")}</button>}</>}>
    <fieldset disabled={busy} className="space-y-4"><Section title={tx("pmsRework.workOrderContent")}><div className="grid gap-4 md:grid-cols-3">
      <Field name={tx("pmsRework.jobName")}><input className={input} maxLength={200} value={form.name} onChange={e => update({ name: e.target.value })} /></Field><Field name={tx("pmsRework.equipment")}><EquipmentSelect value={form.equipmentAssetId} onChange={equipmentAssetId => update({ equipmentAssetId })} /></Field>
      <Field name={tx("pmsRework.priority")}><select className={input} value={form.priority} onChange={e => update({ priority: e.target.value })}>{['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map(s => <option key={s} value={s}>{label[s]}</option>)}</select></Field>
      <Field name={tx("pmsRework.completionDeadlineVesselDate")}><input className={input} type="date" value={form.dueDate || ''} onChange={e => update({ dueDate: e.target.value || null })} /></Field><Field name={tx("pmsRework.runningHoursDeadline")}><input className={input} type="number" min={0} step="any" value={form.dueHours ?? ''} onChange={e => update({ dueHours: num(e.target.value) })} /></Field>
      <Field name={tx("pmsRework.responsibleDepartment")}><select className={input} value={form.department || ''} onChange={e => update({ department: e.target.value || null })}><option value="">{tx("pmsRework.notSelected")}</option>{Array.from(new Set([...Object.keys(departmentNames), ...(form.department ? [form.department] : [])])).map(code => <option key={code} value={code}>{departmentNames[code] || code}</option>)}</select></Field>
      <div className="md:col-span-3"><Field name={tx("pmsRework.instructions")}><textarea className={`${input} !h-24 py-2`} maxLength={20000} value={form.instructions || ''} onChange={e => update({ instructions: e.target.value || null })} /></Field></div>
    </div></Section>{access.work('assign') && <Section title={tx("pmsRework.assignment")}><div className="grid gap-3 md:grid-cols-2"><Field name={tx("pmsRework.personInCharge")}><CrewSelect crew={refs.data || []} value={form.crewId} onChange={crewId => update({ crewId, supportingCrewIds: form.supportingCrewIds.filter(id => id !== crewId && crewId != null) })} /></Field><Field name={tx("pmsRework.supportingCrew")}><SupportSelect crew={refs.data || []} pic={form.crewId} selected={form.supportingCrewIds} onChange={supportingCrewIds => update({ supportingCrewIds })} /></Field></div>{refs.error && <ErrorBox error={refs.error} />}</Section>}
      <ChecklistEditor value={form.checklist} onChange={checklist => update({ checklist })} />
    </fieldset>
  </Modal>
}
