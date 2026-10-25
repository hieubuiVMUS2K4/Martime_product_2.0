import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { pms, snapshot, usePmsQuery, usePmsRefresh, usePmsPermissions, usePmsClock, message, label } from './data'
import { vesselInput, vesselLocalToUtc } from './time'
import { toast } from 'sonner'
import { apiClient } from '@/services/api.client'
import { button, primary, input, Field, Section, Modal, ErrorBox, useAction } from './ui'
import { ChecklistEditor } from './ChecklistEditor'
import type { AdHocDefinition, JobDefinition, JobDetail, WorkOrderDetail, ChecklistTemplate, CrewOption, EquipmentNode } from './types'
export const useEquipment = () => usePmsQuery(['equipment-tree'], () => apiClient.get<EquipmentNode[]>('/pms/work-orders/equipment-tree'))
export function EquipmentSelect({ value, onChange }: { value?: string | null; onChange: (id: string | null) => void }) {
  const tree = useEquipment()
  return <><select aria-label="Thiết bị" className={input} value={value || ''} onChange={e => onChange(e.target.value || null)}><option value="">Chọn thiết bị cụ thể</option>{tree.data?.filter(a => a.category !== 'SYSTEM' && a.isActive && a.status !== 'DECOMMISSIONED').map(a => <option key={a.id} value={a.id}>{a.assetName} · {a.assetCode}</option>)}</select>{tree.error && <ErrorBox error={tree.error} retry={() => void tree.refetch()} />}</>
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
    priority: detail?.priority || 'NORMAL', department: j?.department || null, responsibleRankId: j?.responsibleRankId ?? null, responsibleCrewId: j?.responsibleCrewId || null,
    assignmentPolicy: detail?.assignmentPolicy || 'ON_RELEASE', defaultCrewId: detail?.defaultCrewId || null, instructions: detail?.instructions || null, checklist: detail?.checklist || [] }))
  const update = (patch: Partial<JobDefinition>) => setForm(previous => ({ ...previous, ...patch }))
  const refs = usePmsQuery(['job-references'], pms.jobReferences)
  const { busy, run } = useAction(); const refresh = usePmsRefresh()
  const save = async (e: FormEvent) => { e.preventDefault(); if (await run(async () => { await pms.saveJob(j?.id, form); await refresh() }, 'Đã lưu công việc.')) onClose() }
  const calendar = form.category === 'PERIODIC' && form.intervalType !== 'RUNNING_HOURS'
  const hours = form.category === 'PERIODIC' && form.intervalType !== 'CALENDAR'
  return <Modal title={j ? 'Sửa công việc' : 'Thêm công việc'} onClose={onClose} busy={busy} footer={<button className={primary} disabled={busy || !!refs.error} form="pms-job-form" type="submit">Lưu công việc</button>}>
    <form id="pms-job-form" onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
      <Section title="Thông tin công việc"><div className="grid gap-4 md:grid-cols-3">
        <Field name="Mã công việc *"><input className={input} value={form.code} required maxLength={50} onChange={e => update({ code: e.target.value })} /></Field>
        <Field name="Tên công việc *"><input className={input} value={form.name} required maxLength={200} onChange={e => update({ name: e.target.value })} /></Field>
        <Field name="Thiết bị"><EquipmentSelect value={form.equipmentAssetId} onChange={equipmentAssetId => update({ equipmentAssetId })} /></Field>
        <Field name="Loại bảo trì"><select className={input} value={form.category} onChange={e => update({ category: e.target.value, intervalDays: null, intervalMonths: null, intervalYears: null, intervalHours: null })}>{['PERIODIC', 'DRY_DOCK', 'ON_DEMAND', 'VOYAGE'].map(s => <option key={s} value={s}>{label[s]}</option>)}</select></Field>
        <Field name="Ưu tiên"><select className={input} value={form.priority} onChange={e => update({ priority: e.target.value })}>{['LOW', 'NORMAL', 'HIGH', 'CRITICAL'].map(s => <option key={s} value={s}>{label[s]}</option>)}</select></Field>
        <Field name="Mã công việc nguồn"><input className={input} maxLength={50} value={form.workCode || ''} onChange={e => update({ workCode: e.target.value || null })} /></Field>
        <div className="md:col-span-3"><Field name="Hướng dẫn"><textarea className={`${input} !h-24 py-2`} maxLength={20000} value={form.instructions || ''} onChange={e => update({ instructions: e.target.value || null })} /></Field></div>
      </div></Section>
      {form.category === 'PERIODIC' && <Section title="Chu kỳ và mốc bắt đầu tính hạn"><div className="grid gap-4 md:grid-cols-3">
        <Field name="Tính chu kỳ theo"><select className={input} value={form.intervalType} onChange={e => update({ intervalType: e.target.value, intervalDays: null, intervalMonths: null, intervalYears: null, intervalHours: null })}><option value="CALENDAR">Lịch</option><option value="RUNNING_HOURS">Giờ chạy</option><option value="HYBRID">Lịch hoặc giờ chạy (đến trước)</option></select></Field>
        {calendar && <><Field name="Chu kỳ lịch"><div className="flex gap-2"><input aria-label="Số kỳ" className={input} type="number" min={1} value={form.intervalDays || form.intervalMonths || form.intervalYears || ''} onChange={e => { const unit = form.intervalYears ? 'intervalYears' : form.intervalDays ? 'intervalDays' : 'intervalMonths'; update({ [unit]: num(e.target.value) }) }} /><select aria-label="Đơn vị chu kỳ" className={input} value={form.intervalYears ? 'year' : form.intervalDays ? 'day' : 'month'} onChange={e => { const count = form.intervalDays || form.intervalMonths || form.intervalYears || 1; update({ intervalDays: e.target.value === 'day' ? count : null, intervalMonths: e.target.value === 'month' ? count : null, intervalYears: e.target.value === 'year' ? count : null }) }}><option value="day">ngày</option><option value="month">tháng</option><option value="year">năm</option></select></div></Field>
        <Field name="Mốc bắt đầu (giờ tàu)"><input className={input} type="datetime-local" disabled={!clock.zone} value={vesselInput(form.baselineAt, clock.zone)} onChange={e => { try { update({ baselineAt: e.target.value ? vesselLocalToUtc(e.target.value, clock.zone!) : null }) } catch (error) { toast.error(message(error)) } }} /></Field></>}
        {hours && <><Field name="Chu kỳ giờ chạy"><input className={input} type="number" min={1} max={10000000} value={form.intervalHours ?? ''} onChange={e => update({ intervalHours: num(e.target.value) })} /></Field><Field name="Counter mốc ban đầu"><input className={input} type="number" min={0} step="any" value={form.baselineRunningHours ?? ''} onChange={e => update({ baselineRunningHours: num(e.target.value) })} /></Field></>}
        <Field name="Nguồn đối chiếu mốc"><input className={input} maxLength={1000} value={form.baselineSource || ''} onChange={e => update({ baselineSource: e.target.value || null })} /></Field>
        <Field name="Lý do thay đổi mốc"><input className={input} maxLength={1000} value={form.changeReason || ''} onChange={e => update({ changeReason: e.target.value || null })} /></Field>
        <Field name="Cảnh báo trước (ngày)"><input className={input} type="number" min={0} max={3650} value={form.warningDays} onChange={e => update({ warningDays: Number(e.target.value) })} /></Field>
        <Field name="Cảnh báo trước (giờ chạy)"><input className={input} type="number" min={0} value={form.warningHours} onChange={e => update({ warningHours: Number(e.target.value) })} /></Field>
        <p className="text-xs text-gray-500 md:col-span-3">Chưa đủ mốc vẫn có thể lưu để bổ sung sau. Lưu công việc không ghi nhận một lần bảo trì đã hoàn tất. Tự động phát hành WO chưa được bật cho tàu này.</p>
      </div></Section>}
      <Section title="Trách nhiệm"><div className="grid gap-4 md:grid-cols-3">
        <Field name="Bộ phận"><input className={input} maxLength={20} value={form.department || ''} onChange={e => update({ department: e.target.value || null })} /></Field>
        <Field name="Chức danh chịu trách nhiệm"><select className={input} value={form.responsibleRankId ?? ''} onChange={e => update({ responsibleRankId: num(e.target.value) })}><option value="">Chưa chọn</option>{refs.data?.ranks.map(r => <option key={r.id} value={r.id}>{r.rankName}</option>)}</select></Field>
        <Field name="Người chịu trách nhiệm"><select className={input} value={form.responsibleCrewId || ''} onChange={e => update({ responsibleCrewId: e.target.value || null })}><option value="">Chưa chọn</option>{refs.data?.crew.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}</select></Field>
        <Field name="Phân công cho từng WO"><select className={input} value={form.assignmentPolicy} onChange={e => update({ assignmentPolicy: e.target.value, defaultCrewId: null })}><option value="ON_RELEASE">Chọn người khi WO phát hành</option><option value="PREASSIGNED">Người thực hiện mặc định</option></select></Field>
        {form.assignmentPolicy === 'PREASSIGNED' && <Field name="Người thực hiện mặc định"><CrewSelect crew={refs.data?.crew || []} value={form.defaultCrewId} onChange={defaultCrewId => update({ defaultCrewId })} /></Field>}
      </div>{refs.error && <ErrorBox error={refs.error} retry={() => void refs.refetch()} />}</Section>
      <ChecklistEditor value={form.checklist} onChange={checklist => update({ checklist })} />
    </fieldset></form>
  </Modal>
}
export function AdHocForm({ detail, onClose }: { detail?: WorkOrderDetail; onClose: () => void }) {
  const access = usePmsPermissions()
  const w = detail?.workOrder
  const [form, setForm] = useState<AdHocDefinition>(() => ({ name: w?.name || '', equipmentAssetId: w?.equipmentAssetId || null, instructions: detail?.workOrderInstructions || null,
    priority: w?.priority || 'NORMAL', department: w?.department || null, dueDate: detail?.dueDate || null, dueHours: w?.dueHours ?? null,
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
      <Field name="Bộ phận"><input className={input} maxLength={20} value={form.department || ''} onChange={e => update({ department: e.target.value || null })} /></Field>
      <div className="md:col-span-3"><Field name="Hướng dẫn"><textarea className={`${input} !h-24 py-2`} maxLength={20000} value={form.instructions || ''} onChange={e => update({ instructions: e.target.value || null })} /></Field></div>
    </div></Section>{access.work('assign') && <Section title="Phân công"><div className="grid gap-3 md:grid-cols-2"><Field name="Người phụ trách"><CrewSelect crew={refs.data || []} value={form.crewId} onChange={crewId => update({ crewId, supportingCrewIds: form.supportingCrewIds.filter(id => id !== crewId && crewId != null) })} /></Field><Field name="Người hỗ trợ"><SupportSelect crew={refs.data || []} pic={form.crewId} selected={form.supportingCrewIds} onChange={supportingCrewIds => update({ supportingCrewIds })} /></Field></div>{refs.error && <ErrorBox error={refs.error} />}</Section>}
      <ChecklistEditor value={form.checklist} onChange={checklist => update({ checklist })} />
    </fieldset>
  </Modal>
}
