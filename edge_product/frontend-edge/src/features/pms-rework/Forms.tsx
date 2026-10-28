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
    <input ref={search} role="combobox" aria-label="Thiết bị" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} aria-activedescendant={open && visible[active] ? `${listId}-${active}` : undefined} autoComplete="off" className={`${input} !pl-7 !pr-12`} placeholder={tree.isLoading ? 'Đang tải thiết bị…' : 'Tìm tên hoặc mã thiết bị…'}
      value={open ? term : selected ? `${selected.assetName} · ${selected.assetCode}` : value ? 'Thiết bị không còn khả dụng' : ''}
      onFocus={() => { setTerm(''); setActive(0); setOpen(true) }} onChange={e => { setTerm(e.target.value); setActive(0); setOpen(true) }}
      onBlur={() => close()} onKeyDown={e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive(i => open ? Math.max(0, Math.min(visible.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))) : 0) }
        if (e.key === 'Enter' && open) { e.preventDefault(); if (visible[active]) pick(visible[active].id) }
      }} />
    {value && <button type="button" className="absolute right-6 top-1.5 rounded text-slate-400 hover:text-red-500" aria-label="Bỏ chọn thiết bị" onClick={() => pick(null)}><X size={16} /></button>}
    <button type="button" aria-label="Mở danh sách thiết bị" className="absolute right-1.5 top-1.5 text-slate-400" onClick={() => { search.current?.focus(); setOpen(true) }}><ChevronDown size={16} /></button>
  </div>{open && createPortal(<div ref={panel} id={listId} role="listbox" aria-label="Danh sách thiết bị" style={position} className="fixed z-[1400] overflow-y-auto rounded border border-slate-300 bg-white py-1 shadow-xl" onMouseDown={e => e.preventDefault()}>
    {tree.isLoading ? <p className="px-3 py-3 text-xs text-slate-500">Đang tải thiết bị…</p> : visible.length ? visible.map((a, i) => <div key={a.id} id={`${listId}-${i}`} role="option" aria-selected={a.id === value} className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-xs ${active === i ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-blue-50'}`} onMouseEnter={() => setActive(i)} onClick={() => pick(a.id)}><span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.assetName}</span><span className="block truncate text-slate-500">{a.assetCode}</span></span>{a.id === value && <Check size={14} aria-hidden="true" />}</div>) : <p className="px-3 py-3 text-xs text-slate-500">Không tìm thấy thiết bị phù hợp.</p>}
    {matches.length > 100 && <p className="border-t px-3 py-2 text-xs text-slate-500">Nhập thêm tên hoặc mã để thu hẹp kết quả.</p>}
  </div>, document.body)}{tree.error && <ErrorBox error={tree.error} retry={() => void tree.refetch()} />}</>
}
export function CrewSelect({ value, onChange, crew }: { value?: string | null; onChange: (id: string | null) => void; crew: CrewOption[] }) { return <select className={input} value={value || ''} onChange={e => onChange(e.target.value || null)}><option value="">Chưa phân công</option>{crew.map(c => <option key={c.crewId} value={c.crewId}>{c.fullName}</option>)}</select> }
export function SupportSelect({ crew, pic, selected, onChange }: { crew: CrewOption[]; pic?: string | null; selected: string[]; onChange: (ids: string[]) => void }) {
  return <div className="flex max-h-28 flex-wrap gap-x-4 gap-y-2 overflow-auto rounded border border-gray-200 p-2 text-xs">{crew.filter(c => c.crewId !== pic).map(c => <label key={c.crewId} className="flex items-center gap-1"><input type="checkbox" disabled={!pic} checked={selected.includes(c.crewId)} onChange={e => onChange(e.target.checked ? [...selected, c.crewId] : selected.filter(id => id !== c.crewId))} />{c.fullName}</label>)}{!pic && <span className="text-gray-400">Chọn người phụ trách trước khi chọn hỗ trợ.</span>}</div>
}
const num = (value: string) => value === '' ? null : Number(value)
export function JobForm({ detail, onClose }: { detail?: JobDetail; onClose: () => void }) {
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
    if (!impact) { await run(async () => setImpact(await pms.previewJob(j?.id, form)), 'Đã tính ảnh hưởng. Kiểm tra trước khi xác nhận lưu.'); return }
    if (impact.reasonRequired && !form.changeReason?.trim()) return void toast.error('Cần lý do thay mốc của công việc đã vận hành.')
    if (await run(async () => { await pms.saveJob(j?.id, form); await refresh() }, 'Đã lưu công việc.')) onClose()
  }
  const calendar = form.category === 'PERIODIC' && form.intervalType !== 'RUNNING_HOURS'
  const hours = form.category === 'PERIODIC' && form.intervalType !== 'CALENDAR'
  return <Modal title={j ? 'Sửa công việc' : 'Thêm công việc'} onClose={onClose} busy={busy} footer={<button className={primary} disabled={busy || !!refs.error} form="pms-job-form" type="submit">{impact ? 'Xác nhận lưu' : 'Xem trước và lưu'}</button>}>
    <form id="pms-job-form" onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
      {impact && <Section title="Ảnh hưởng sau khi lưu"><div role="status" className="space-y-2 text-sm text-gray-700">
        <div className="overflow-auto"><table className="w-full border-collapse text-left text-xs"><thead className="bg-blue-50"><tr><th className="border border-gray-200 p-2">Hạn hiện tại</th><th className="border border-gray-200 p-2">Hạn sau khi lưu</th><th className="border border-gray-200 p-2">Trạng thái Job</th></tr></thead><tbody><tr><td className="border border-gray-200 p-2">{clock.due(impact.previousDueAt, impact.previousDueHours)}</td><td className="border border-gray-200 p-2">{clock.due(impact.nextDueAt, impact.nextDueHours)}</td><td className="border border-gray-200 p-2">{label[impact.state] || impact.state}</td></tr></tbody></table></div>
        {impact.openWorkOrders > 0 && <p>{impact.openWorkOrders} WO đang mở giữ nguyên hạn, checklist và nội dung đã phát hành.</p>}
        {impact.usesApprovedExecution && <p>Hạn kỳ sau tính từ lần thực hiện đã được duyệt; sửa mốc ban đầu không ghi đè kết quả đó.</p>}
        {impact.reasonRequired && <p className="text-amber-700">Thay mốc của công việc đã vận hành cần lý do; thay đổi được ghi nhật ký.</p>}
        {impact.automaticReleaseRequested && <p>Job được đưa vào lượt kiểm tra tự động. Nếu đủ điều kiện, hệ thống sẽ phát hành WO; lưu form chưa có nghĩa đã tạo WO.</p>}
        {impact.missingInformation.length > 0 && <p className="text-amber-700">Còn {impact.missingInformation.length} thông tin cần bổ sung; chưa phát hành WO tự động.</p>}
      </div></Section>}
      <Section title="Thông tin công việc" help={<JobFormHelp group="information" />}><div className="grid gap-4 md:grid-cols-3">
        <Field name="Mã công việc *"><input className={input} value={form.code} required maxLength={50} onChange={e => update({ code: e.target.value })} /></Field>
        <Field name="Tên công việc *"><input className={input} value={form.name} required maxLength={200} onChange={e => update({ name: e.target.value })} /></Field>
        <Field name="Thiết bị"><EquipmentSelect value={form.equipmentAssetId} onChange={equipmentAssetId => update({ equipmentAssetId })} /></Field>
        <Field name="Loại bảo trì"><select className={input} value={form.category} onChange={e => update({ category: e.target.value, intervalDays: null, intervalMonths: null, intervalYears: null, intervalHours: null })}>{['PERIODIC', 'DRY_DOCK', 'ON_DEMAND', 'VOYAGE'].map(s => <option key={s} value={s}>{label[s]}</option>)}</select></Field>
        <Field name="Ưu tiên"><select className={input} value={form.priority} onChange={e => update({ priority: e.target.value })}>{['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map(s => <option key={s} value={s}>{label[s]}</option>)}</select></Field>
        <Field name="Mã công việc nguồn"><input className={input} maxLength={50} value={form.workCode || ''} onChange={e => update({ workCode: e.target.value || null })} /></Field>
        <div className="md:col-span-3"><Field name="Hướng dẫn"><textarea className={`${input} !h-24 py-2`} maxLength={20000} value={form.instructions || ''} onChange={e => update({ instructions: e.target.value || null })} /></Field></div>
      </div></Section>
      {isManualJob(form.category) && <p className="rounded border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-slate-600">Công việc Lên đà, Theo chuyến và Theo yêu cầu chỉ phát hành WO thủ công, không tự sinh theo chu kỳ. Khi cần thực hiện, mở chi tiết Job và chọn Phát hành WO để nhập lý do và hạn cho lần đó. WO kế thừa checklist mẫu bên dưới.</p>}
      {form.category === 'PERIODIC' && <Section title="Chu kỳ và mốc bắt đầu tính hạn" help={<JobFormHelp group="cycle" />}><div className="grid gap-4 md:grid-cols-3">
        <Field name="Tính chu kỳ theo"><select aria-label="Tính chu kỳ theo" className={input} value={form.intervalType} onChange={e => update({ intervalType: e.target.value, intervalDays: null, intervalMonths: null, intervalYears: null, intervalHours: null })}><option value="CALENDAR">Lịch</option><option value="RUNNING_HOURS">Giờ chạy</option><option value="HYBRID">Lịch hoặc giờ chạy (đến trước)</option></select></Field>
        {calendar && <><Field name="Chu kỳ lịch"><div className="flex gap-2"><input aria-label="Số kỳ" className={input} type="number" min={1} value={form.intervalDays || form.intervalMonths || form.intervalYears || ''} onChange={e => { const unit = form.intervalYears ? 'intervalYears' : form.intervalDays ? 'intervalDays' : 'intervalMonths'; update({ [unit]: num(e.target.value) }) }} /><select aria-label="Đơn vị chu kỳ" className={input} value={form.intervalYears ? 'year' : form.intervalDays ? 'day' : 'month'} onChange={e => { const count = form.intervalDays || form.intervalMonths || form.intervalYears || 1; update({ intervalDays: e.target.value === 'day' ? count : null, intervalMonths: e.target.value === 'month' ? count : null, intervalYears: e.target.value === 'year' ? count : null }) }}><option value="day">ngày</option><option value="month">tháng</option><option value="year">năm</option></select></div></Field>
        <Field name="Mốc bắt đầu (giờ tàu)"><input className={input} type="datetime-local" disabled={!clock.zone} value={vesselInput(form.baselineAt, clock.zone)} onChange={e => { try { update({ baselineAt: e.target.value ? vesselLocalToUtc(e.target.value, clock.zone!) : null }) } catch (error) { toast.error(message(error)) } }} /></Field></>}
        {hours && <><Field name="Chu kỳ giờ chạy"><input className={input} type="number" min={1} max={10000000} value={form.intervalHours ?? ''} onChange={e => update({ intervalHours: num(e.target.value) })} /></Field><Field name="Counter mốc ban đầu"><input className={input} type="number" min={0} step="any" value={form.baselineRunningHours ?? ''} onChange={e => update({ baselineRunningHours: num(e.target.value) })} /></Field></>}
        <Field name="Nguồn đối chiếu mốc"><input className={input} maxLength={1000} value={form.baselineSource || ''} onChange={e => update({ baselineSource: e.target.value || null })} /></Field>
        <Field name="Lý do thay đổi mốc"><input className={input} maxLength={1000} value={form.changeReason || ''} onChange={e => update({ changeReason: e.target.value || null })} /></Field>
        {calendar && <Field name="Cảnh báo trước (ngày)"><input className={input} type="number" min={0} max={3650} value={form.warningDays} onChange={e => update({ warningDays: Number(e.target.value) })} /></Field>}
        {hours && <Field name="Cảnh báo trước (giờ chạy)"><input className={input} type="number" min={0} value={form.warningHours} onChange={e => update({ warningHours: Number(e.target.value) })} /></Field>}
        <Field name="Phát hành WO khi"><select className={input} value={form.releasePolicy} onChange={e => update({ releasePolicy: e.target.value })}><option value="ON_UPCOMING">Sắp đến hạn</option><option value="ON_DUE">Đến hạn</option></select></Field>
        <Field name="Tự động phát hành"><label className="flex h-8 items-center gap-2"><input type="checkbox" checked={form.autoGenerate} disabled={!clock.automaticReleaseEnabled} onChange={e => update({ autoGenerate: e.target.checked })} />Tạo WO theo chu kỳ</label></Field>
        <p className="text-xs text-gray-500 md:col-span-3">Chưa đủ mốc vẫn có thể lưu để bổ sung sau. Lưu công việc không ghi nhận một lần bảo trì đã hoàn tất. {clock.automaticReleaseEnabled ? 'Khi bật tự động, tàu tạo WO theo chu kỳ ngay cả khi mất kết nối với bờ; dữ liệu sẽ đồng bộ khi có kết nối lại.' : 'Tự động phát hành chưa được bật trên tàu hoặc dữ liệu PMS đang trong quá trình chuyển đổi.'}</p>
      </div></Section>}
      <Section title="Trách nhiệm" help={<JobFormHelp group="responsibility" />}><div className="grid gap-4 md:grid-cols-3">
        <Field name="Bộ phận phụ trách"><select aria-label="Bộ phận phụ trách" className={input} value={rankDepartment || form.department || ''} disabled={!!rankDepartment} onChange={e => update({ department: e.target.value || null })}><option value="">Chưa chọn</option>{departments.map(code => <option key={code} value={code}>{departmentNames[code] || code}</option>)}</select>{rankDepartment && <span className="text-xs text-gray-400">Theo chức danh đã chọn. Bỏ chọn chức danh để đổi riêng bộ phận.</span>}</Field>
        <Field name="Chức danh chịu trách nhiệm"><select aria-label="Chức danh chịu trách nhiệm" className={input} value={form.responsibleRankId ?? ''} onChange={e => { const responsibleRankId = num(e.target.value); const department = departmentCode(refs.data?.ranks.find(r => r.id === responsibleRankId)?.department); update({ responsibleRankId, ...(department ? { department } : {}) }) }}><option value="">Chưa chọn</option>{refs.data?.ranks.map(r => <option key={r.id} value={r.id}>{r.rankName}</option>)}</select></Field>
        <Field name="Người chịu trách nhiệm"><select className={input} value={form.responsibleCrewId || ''} onChange={e => update({ responsibleCrewId: e.target.value || null })}><option value="">Chưa chọn</option>{refs.data?.crew.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>
        <Field name="Phân công cho từng WO"><select className={input} value={form.assignmentPolicy} onChange={e => update({ assignmentPolicy: e.target.value, defaultCrewId: null })}><option value="ON_RELEASE">Chọn người khi WO phát hành</option><option value="PREASSIGNED">Người thực hiện mặc định</option></select></Field>
        {form.assignmentPolicy === 'PREASSIGNED' && <Field name="Người thực hiện mặc định"><CrewSelect crew={refs.data?.crew || []} value={form.defaultCrewId} onChange={defaultCrewId => update({ defaultCrewId })} /></Field>}
      </div>{refs.error && <ErrorBox error={refs.error} retry={() => void refs.refetch()} />}</Section>
      <ChecklistEditor help={<JobFormHelp group="checklist" />} value={form.checklist} onChange={checklist => update({ checklist })} />
    </fieldset></form>
  </Modal>
}
export function AdHocForm({ detail, onClose }: { detail?: WorkOrderDetail; onClose: () => void }) {
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
    if (issue && (!form.name.trim() || !form.equipmentAssetId || !(form.dueDate || form.dueHours != null))) return void toast.error('Cần tên, thiết bị và hạn ngày/giờ chạy trước khi phát hành.')
    const body = JSON.stringify({ form, issue })
    if (!command.current || command.current.body !== body) command.current = { body, id: crypto.randomUUID() }
    if (await run(async () => { const result = w ? await pms.saveDraft(w, form) : await pms.createOrder(form, command.current!.id, issue); await refresh(); if (!w) navigate(`/pms/work-orders/${result.id}`) }, issue ? 'Đã phát hành WO.' : 'Đã lưu nháp.')) onClose()
  }
  return <Modal title={w ? 'Sửa WO nháp' : 'Tạo WO đột xuất'} onClose={onClose} busy={busy} footer={<><button className={button} disabled={busy} onClick={() => void save(false)}>Lưu nháp</button>{!w && <button className={primary} disabled={busy} onClick={() => void save(true)}>Lưu và phát hành</button>}</>}>
    <fieldset disabled={busy} className="space-y-4"><Section title="Nội dung lệnh thực hiện"><div className="grid gap-4 md:grid-cols-3">
      <Field name="Tên công việc"><input className={input} maxLength={200} value={form.name} onChange={e => update({ name: e.target.value })} /></Field><Field name="Thiết bị"><EquipmentSelect value={form.equipmentAssetId} onChange={equipmentAssetId => update({ equipmentAssetId })} /></Field>
      <Field name="Ưu tiên"><select className={input} value={form.priority} onChange={e => update({ priority: e.target.value })}>{['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map(s => <option key={s} value={s}>{label[s]}</option>)}</select></Field>
      <Field name="Hạn hoàn thành (ngày tàu)"><input className={input} type="date" value={form.dueDate || ''} onChange={e => update({ dueDate: e.target.value || null })} /></Field><Field name="Hạn giờ chạy"><input className={input} type="number" min={0} step="any" value={form.dueHours ?? ''} onChange={e => update({ dueHours: num(e.target.value) })} /></Field>
      <Field name="Bộ phận phụ trách"><select className={input} value={form.department || ''} onChange={e => update({ department: e.target.value || null })}><option value="">Chưa chọn</option>{Array.from(new Set([...Object.keys(departmentNames), ...(form.department ? [form.department] : [])])).map(code => <option key={code} value={code}>{departmentNames[code] || code}</option>)}</select></Field>
      <div className="md:col-span-3"><Field name="Hướng dẫn"><textarea className={`${input} !h-24 py-2`} maxLength={20000} value={form.instructions || ''} onChange={e => update({ instructions: e.target.value || null })} /></Field></div>
    </div></Section>{access.work('assign') && <Section title="Phân công"><div className="grid gap-3 md:grid-cols-2"><Field name="Người phụ trách"><CrewSelect crew={refs.data || []} value={form.crewId} onChange={crewId => update({ crewId, supportingCrewIds: form.supportingCrewIds.filter(id => id !== crewId && crewId != null) })} /></Field><Field name="Người hỗ trợ"><SupportSelect crew={refs.data || []} pic={form.crewId} selected={form.supportingCrewIds} onChange={supportingCrewIds => update({ supportingCrewIds })} /></Field></div>{refs.error && <ErrorBox error={refs.error} />}</Section>}
      <ChecklistEditor value={form.checklist} onChange={checklist => update({ checklist })} />
    </fieldset>
  </Modal>
}
