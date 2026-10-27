import { departmentName } from './departments'
import { readableCode } from './presentation'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Archive, ChevronRight, ClipboardList, History, Pause, Pencil, Play, Plus } from 'lucide-react'
import { JobForm } from './Forms'
import { JobHistory } from './Reports'
import { pms, usePmsPermissions, usePmsQuery, usePmsRefresh, usePmsClock, cycle, label } from './data'
import { Badge, button, primary, input, ErrorBox, Field, Modal, Section, useAction } from './ui'
export function ReasonDialog({ title, onClose, action, optional = false, children }: { title: string; onClose: () => void; action: (reason: string) => Promise<unknown>; optional?: boolean; children?: React.ReactNode }) {
  const [reason, setReason] = useState(''); const { busy, run } = useAction()
  return <Modal title={title} onClose={onClose} busy={busy} footer={<button type="submit" form="pms-reason" className={primary} disabled={busy || (!optional && !reason.trim())}>Xác nhận</button>}><form id="pms-reason" onSubmit={async e => { e.preventDefault(); if (await run(() => action(reason), 'Đã cập nhật.')) onClose() }} className="space-y-4">{children}<Field name={optional ? 'Lý do nếu phát hành sớm ngoài khoảng cảnh báo' : 'Lý do *'}><textarea autoFocus className={`${input} !h-24 py-2`} required={!optional} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></Field></form></Modal>
}
function JobField({ name, children }: { name: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-slate-500">{name}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800">{children}</dd></div>
}
export default function JobPage() {
  const {date,due}=usePmsClock(); const { id = '' } = useParams(); const access = usePmsPermissions(); const refresh = usePmsRefresh(); const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const query = usePmsQuery(['job', id], () => pms.job(id), access.enabled && access.job('view'))
  const references = usePmsQuery(['job-references'], pms.jobReferences, access.enabled && access.job('view'))
  const [edit, setEdit] = useState(false), [history, setHistory] = useState(false), [change, setChange] = useState<string | null>(null), [release, setRelease] = useState(false)
  const [tab, setTab] = useState<'checklist' | 'materials'>('checklist')
  const [resolve, setResolve] = useState<'REPLACE' | 'SKIP' | null>(null)
  if (!access.enabled || !access.job('view')) return <p className="p-6 text-sm text-gray-500">Job List chưa được bật hoặc bạn chưa có quyền xem.</p>
  if (query.error) return <ErrorBox error={query.error} retry={() => void query.refetch()} />
  if (!query.data) return <p className="p-6 text-sm text-gray-500">Đang tải công việc…</p>
  const detail = query.data, j = detail.job
  const rank = references.data?.ranks.find(r => r.id === j.responsibleRankId)?.rankName
  const editOpen = (edit || params.get('edit') === '1') && access.job('update') && j.state !== 'REMOVED'
  const closeEdit = () => { setEdit(false); if (params.has('edit')) { const next = new URLSearchParams(params); next.delete('edit'); setParams(next, { replace: true }) } }
  const th = 'border-b border-r border-[#a3b1bc] bg-blue-50 px-3 py-2.5 text-center text-xs font-semibold text-slate-600'
  const td = 'border-b border-r border-[#a3b1bc] px-3 py-2.5 text-xs text-slate-700'
  return <div className="min-h-full bg-white">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
      <nav aria-label="Đường dẫn công việc" className="min-w-0 flex-1"><ol className="flex min-w-0 items-center gap-2 text-sm"><li className="shrink-0"><Link className="text-blue-600 hover:underline" to="/pms/work-planning?tab=table">Danh sách công việc</Link></li><li aria-hidden="true"><ChevronRight size={15} className="text-slate-400" /></li><li className="min-w-0" aria-current="page"><h1 className="truncate font-semibold text-slate-900" title={j.name}>{j.name}</h1></li></ol></nav>
      <div className="flex flex-wrap gap-2"><button className={button} onClick={() => setHistory(true)}><History size={14} />Lịch sử bảo trì</button>{access.job('update') && <><button className={button} onClick={() => setEdit(true)} disabled={j.state === 'REMOVED'}><Pencil size={14} />Sửa công việc</button>{(j.state === 'PAUSED' || j.state === 'RETIRED' || j.state === 'REMOVED') ? <button className={button} onClick={() => setChange('ACTIVE')}><Play size={14} />{j.state === 'REMOVED' ? 'Khôi phục' : 'Tiếp tục áp dụng'}</button> : <><button className={button} onClick={() => setChange('PAUSED')}><Pause size={14} />Tạm dừng</button><button className={button} onClick={() => setChange('RETIRED')}><Archive size={14} />Ngừng áp dụng</button></>}</>}{access.work('create') && j.state === 'ACTIVE' && j.category === 'PERIODIC' && !j.openWorkOrderId && !detail.requiresCycleResolution && <button className={primary} onClick={() => setRelease(true)}><Plus size={14} />Phát hành WO</button>}</div>
    </header>
    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <main className="min-w-0 space-y-4">
        {!!detail.missingInformation.length && <div role="status" className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Cần bổ sung: {detail.missingInformation.join(', ')}.</div>}
        {detail.requiresCycleResolution && <div className="space-y-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><p>Kỳ hiện tại đã hủy. WO cũ được giữ lại; kỳ này chưa được ghi nhận bảo trì.</p>{detail.cancelledWorkOrderId && <div className="flex flex-wrap gap-2">{access.work('view') && <Link className={button} to={`/pms/work-orders/${detail.cancelledWorkOrderId}`}>Xem WO đã hủy</Link>}{j.state === 'ACTIVE' && access.job('update') && <>{access.work('create') && <button className={button} onClick={() => setResolve('REPLACE')}>Phát hành WO thay thế</button>}{access.work('update') && <button className={button} onClick={() => setResolve('SKIP')}>Bỏ qua kỳ này</button>}</>}</div>}</div>}
        <Section title="Thông tin công việc"><dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <JobField name="Mã công việc">{j.code}</JobField><JobField name="Thiết bị">{j.equipmentName || 'Chưa chọn'}</JobField><JobField name="Trạng thái"><Badge value={j.state} /></JobField>
          <JobField name="Loại bảo trì">{label[j.category] || j.category}</JobField><JobField name="Chu kỳ">{cycle(j)}</JobField><JobField name="Ưu tiên"><Badge value={detail.priority} /></JobField>
        </dl></Section>
        <Section title="Hướng dẫn thực hiện"><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{detail.instructions || 'Chưa có hướng dẫn thực hiện.'}</p></Section>
        <section className="overflow-hidden rounded border border-gray-200">
          <nav aria-label="Nội dung công việc" className="flex gap-1 border-b border-gray-200 bg-gray-50 px-3">{([{key:'checklist',name:'Checklist mẫu',count:detail.checklist.length},{key:'materials',name:'Vật tư của thiết bị',count:detail.equipmentMaterials.length}] as const).map(item => <button key={item.key} className={`inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm ${tab === item.key ? 'border-blue-600 font-medium text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`} aria-current={tab === item.key ? 'page' : undefined} onClick={() => setTab(item.key)}>{item.name}<span className="rounded bg-white px-1.5 text-xs text-slate-500">{item.count}</span></button>)}</nav>
          <div className="overflow-auto p-3">{tab === 'checklist' ? <table className="w-full min-w-[600px] border-separate border-spacing-0 border-l border-t border-[#a3b1bc]"><thead><tr>{['STT', 'Nội dung', 'Số đo bắt buộc', 'Đơn vị', 'Min', 'Max'].map(name => <th key={name} className={th}>{name}</th>)}</tr></thead><tbody>{detail.checklist.map((c, i) => <tr key={c.sequenceOrder} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>{[i + 1, c.checkpointDescription, c.requiresReading ? 'Có' : 'Không', c.unit || '—', c.normalRangeMin ?? '—', c.normalRangeMax ?? '—'].map((value, n) => <td key={n} className={`${td} ${n === 0 ? 'w-12 text-center' : ''}`}>{value}</td>)}</tr>)}{!detail.checklist.length && <tr><td className={`${td} py-8 text-center text-slate-500`} colSpan={6}>Chưa có checklist mẫu.</td></tr>}</tbody></table>
            : <><p className="mb-3 text-xs text-slate-500">Vật tư được quản lý và gán tại giao diện Thiết bị.</p><table className="w-full border-separate border-spacing-0 border-l border-t border-[#a3b1bc]"><thead><tr>{['Mã vật tư', 'Tên vật tư', 'Đơn vị'].map(name => <th key={name} className={th}>{name}</th>)}</tr></thead><tbody>{detail.equipmentMaterials.map((m,i) => <tr key={m.id} className={i % 2 ? 'bg-gray-50' : 'bg-white'}><td className={td}>{m.itemCode}</td><td className={td}>{m.name}</td><td className={td}>{m.unit || '—'}</td></tr>)}{!detail.equipmentMaterials.length && <tr><td colSpan={3} className={`${td} py-8 text-center text-slate-500`}>Thiết bị chưa được gán vật tư.</td></tr>}</tbody></table></>}
          </div>
        </section>
      </main>
      <aside className="min-w-0 space-y-4">
        <Section title="Kế hoạch bảo trì"><dl className="space-y-4"><JobField name="Hạn tiếp theo">{due(j.nextDueAt, j.nextDueHours)}</JobField><JobField name="Gửi hoàn tất lần cuối">{date(j.lastSubmittedAt)}</JobField><JobField name="Giờ chạy lần cuối">{j.lastRunningHours != null ? `${j.lastRunningHours.toLocaleString('vi-VN')} giờ` : '—'}</JobField><JobField name="Phát hành WO">{j.autoGenerate ? 'Tự động theo chu kỳ' : 'Thủ công'}</JobField>{j.category === 'PERIODIC' && <JobField name="Thời điểm phát hành">{detail.releasePolicy === 'ON_DUE' ? 'Khi đến hạn' : 'Khi sắp đến hạn'}</JobField>}</dl></Section>
        <Section title="Trách nhiệm"><dl className="space-y-4"><JobField name="Bộ phận phụ trách">{departmentName(j.department)}</JobField><JobField name="Chức danh">{rank || 'Chưa xác định'}</JobField><JobField name="Người chịu trách nhiệm">{j.responsibleName || 'Chưa chọn'}</JobField></dl></Section>
        {j.openWorkOrderId && <Section title="Work Order đang mở"><p className="mb-3 break-all text-xs text-slate-600">{readableCode(j.openWorkOrderCode) || j.name}</p>{access.work('view') ? <Link className={`${button} w-full text-blue-600`} to={`/pms/work-orders/${j.openWorkOrderId}`}><ClipboardList size={14} />Xem Work Order</Link> : <p className="text-xs text-gray-500">Bạn chưa có quyền xem Work Order.</p>}</Section>}
      </aside>
    </div>
    {editOpen && <JobForm detail={detail} onClose={closeEdit} />}{history && <JobHistory job={j} onClose={() => setHistory(false)} />}
    {change && <ReasonDialog title={`${label[change]} · ${j.name}`} onClose={() => setChange(null)} action={async reason => { await pms.jobState(j, change, reason); await refresh() }} />}
    {resolve && <ReasonDialog title={resolve === 'REPLACE' ? 'Phát hành WO thay thế' : 'Bỏ qua kỳ bảo trì'} onClose={() => setResolve(null)} action={async reason => { const result = await pms.resolveCycle(detail, resolve, reason); await refresh(); if (result.workOrderId) navigate(`/pms/work-orders/${result.workOrderId}`) }}><p className="text-sm">{j.name} · Hạn kỳ hiện tại: {due(j.nextDueAt, j.nextDueHours)}.</p><p className="text-sm text-slate-600">{resolve === 'REPLACE' ? 'Tạo WO mới cho cùng kỳ và giữ nguyên hạn. WO đã hủy cùng dữ liệu cũ vẫn được lưu để tra cứu.' : 'Chuyển sang đúng một kỳ tiếp theo tính từ hạn hiện tại, không tính từ hôm nay. Không ghi nhận đã bảo trì, không cập nhật counter hoặc lần thực hiện cuối. Nếu kỳ sau đã tới khoảng phát hành, hệ thống có thể tự tạo WO.'}</p></ReasonDialog>}
    {release && <ReasonDialog title="Phát hành WO từ công việc" optional onClose={() => setRelease(false)} action={async reason => { const order = await pms.release(detail, reason); await refresh(); navigate(`/pms/work-orders/${order.id}`) }}><p className="text-sm">{j.name} · {j.equipmentName}</p><p className="text-xs text-gray-500">Hạn: {due(j.nextDueAt, j.nextDueHours)}. Lệnh phát hành giữ một bản nội dung và checklist riêng.</p></ReasonDialog>}
  </div>
}
