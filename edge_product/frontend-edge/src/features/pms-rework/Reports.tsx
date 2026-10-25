import { useState } from 'react'
import { Eye } from 'lucide-react'
import { pms, snapshot, usePmsQuery, usePmsClock } from './data'
import { Badge, ErrorBox, Grid, Modal, Section, type GridColumn } from './ui'
import type { Job, HistoryRow, Report, Submission } from './types'
import { serverFilters } from './time'
export function ReportView({ report }: { report: Report }) {
  const {date,due}=usePmsClock(); let data: Submission | null
  try { data = snapshot<Submission>(report.snapshotJson) } catch (error) { return <ErrorBox error={error} /> }
  if (!data) return <p className="text-sm text-gray-500">Chưa có bản báo cáo.</p>
  return <div className="space-y-4"><Section title="Báo cáo đã gửi"><dl className="grid gap-3 text-xs md:grid-cols-2">
    <div><dt className="text-gray-500">Công việc</dt><dd className="mt-1 font-medium">{data.name}</dd></div><div><dt className="text-gray-500">Mã WO</dt><dd className="mt-1">{data.code}</dd></div>
    <div>Gửi hoàn tất: {date(data.submittedAt)}</div><div>Người gửi: {data.submittedByCrewId}</div><div>Thời gian thực hiện: {(data.durationMinutes / 60).toLocaleString('vi-VN')} giờ</div><div>Giờ chạy ghi nhận: {data.runningHours ?? '—'}</div>
    <div>Hạn: {due(data.dueAt, data.dueHours)}</div><div><Badge value={report.decision || 'PENDING_APPROVAL'} /></div>
    {report.decidedAt && <><div>Kiểm tra lúc: {date(report.decidedAt)}</div><div>Người kiểm tra: {report.decidedByCrewId || 'Quản trị viên'}</div></>}
    <div className="whitespace-pre-wrap md:col-span-2">Kết quả / ghi chú: {data.notes || '—'}</div>{report.decisionReason && <div className="whitespace-pre-wrap md:col-span-2">Ý kiến kiểm tra: {report.decisionReason}</div>}
  </dl></Section><Section title="Checklist và số đo"><div className="overflow-auto"><table className="w-full min-w-[600px] text-xs"><thead className="bg-blue-50"><tr>{['Nội dung', 'Kết quả', 'Số đo', 'Ghi chú'].map(s => <th key={s} className="border border-gray-200 p-2 text-left font-medium">{s}</th>)}</tr></thead><tbody>{data.checklist.map(c => <tr key={c.id}><td className="border border-gray-100 p-2">{c.description}</td><td className="border border-gray-100 p-2">{c.completed ? 'Hoàn thành' : 'Chưa hoàn thành'}</td><td className={`border border-gray-100 p-2 ${c.isAbnormal ? 'text-red-600' : ''}`}>{c.reading ?? '—'} {c.unit}</td><td className="border border-gray-100 p-2">{c.remarks || '—'}</td></tr>)}</tbody></table>{!data.checklist.length && <p className="p-3 text-gray-400">Không có hạng mục kiểm tra.</p>}</div></Section>
    <Section title="Vật tư đã sử dụng"><table className="w-full text-xs"><thead className="bg-blue-50"><tr>{['Mã', 'Tên vật tư', 'Đơn vị', 'Số lượng'].map(s => <th key={s} className="border border-gray-200 p-2 text-left font-medium">{s}</th>)}</tr></thead><tbody>{data.materials.map(m => <tr key={m.materialItemId}><td className="border border-gray-100 p-2">{m.code}</td><td className="border border-gray-100 p-2">{m.name}</td><td className="border border-gray-100 p-2">{m.unit || '—'}</td><td className="border border-gray-100 p-2">{m.quantity}</td></tr>)}</tbody></table>{!data.materials.length && <p className="p-3 text-xs text-gray-400">Không ghi nhận vật tư sử dụng.</p>}</Section>
  </div>
}
function StoredReport({ jobId, entry, onClose }: { jobId: string; entry: HistoryRow; onClose: () => void }) {
  const query = usePmsQuery(['job-report', jobId, entry.id], async () => entry.isLegacy ? pms.legacyReport(jobId, entry.id) : pms.completedReport(jobId, entry.id))
  return <Modal title={entry.isLegacy ? 'Báo cáo bảo trì cũ' : 'Báo cáo bảo trì'} onClose={onClose}>{query.error ? <ErrorBox error={query.error} /> : !query.data ? <p className="text-xs text-gray-500">Đang tải báo cáo…</p> : 'snapshotJson' in query.data ? <ReportView report={query.data as Report} /> : <LegacyReport text={query.data.reportSnapshot} />}</Modal>
}
function LegacyReport({ text }: { text?: string }) {
  let data: { task?: { notes?: string; approvedBy?: string; verifiedBy?: string }; checklist?: { id: string; checkpointDescription: string; isCompleted: boolean; readingValue?: number; remarks?: string }[] } | null
  try { data = snapshot(text) } catch (error) { return <ErrorBox error={error} /> }
  if (!data) return <p className="text-sm text-gray-500">Báo cáo cũ chưa có bản lưu đầy đủ. Không dùng kết quả hiện tại để thay thế.</p>
  return <div className="space-y-4"><Section title="Kết quả lưu từ hệ thống cũ"><p className="whitespace-pre-wrap text-sm">{data.task?.notes || 'Không có ghi chú.'}</p><p className="mt-2 text-xs text-gray-500">Người duyệt: {data.task?.verifiedBy || data.task?.approvedBy || 'Chưa có thông tin'}</p></Section><Section title="Checklist đã lưu">{data.checklist?.map((c, i) => <div key={c.id || i} className="grid grid-cols-3 gap-3 border-b border-gray-100 py-2 text-xs"><span>{c.checkpointDescription}</span><span>{c.isCompleted ? 'Hoàn thành' : 'Chưa hoàn thành'} · {c.readingValue ?? '—'}</span><span>{c.remarks || '—'}</span></div>)}</Section></div>
}
export function JobHistory({ job, onClose }: { job: Job; onClose: () => void }) {
  const {date,zone}=usePmsClock(); const [page, setPage] = useState(1); const [sort, setSort] = useState('sourceTime'); const [descending, setDescending] = useState(true)
  const [filters, setFilters] = useState<Record<string, string>>({}); const [selected, setSelected] = useState<HistoryRow | null>(null)
  const query = usePmsQuery(['job-history', job.id, page, sort, descending, filters, zone], () => pms.history(job.id, { page, pageSize: 20, sort, descending, ...serverFilters(filters, zone) }))
  const columns: GridColumn<HistoryRow>[] = [
    { key: 'code', title: 'Lệnh thực hiện', width: 200, render: e => e.isLegacy ? 'Lịch sử cũ' : e.workOrderCode || '—' },
    { key: 'time', title: 'Gửi hoàn tất / thời điểm nguồn', width: 220, sort: 'sourceTime', dateRange: ['sourceFrom', 'sourceTo'], render: e => date(e.submittedAt || e.sourceExecutedAt) },
    { key: 'by', title: 'Người thực hiện', filter: 'completedBy', sort: 'completedBy', width: 170, render: e => e.completedBy || '—' },
    { key: 'approved', title: 'Ngày duyệt', width: 190, render: e => date(e.approvedAt) },
    { key: 'hours', title: 'Giờ chạy', sort: 'hours', width: 100, render: e => e.executedRunningHours ?? '—' },
    { key: 'actions', title: 'Hành động', width: 100, fixed: 'right', render: e => <button title="Xem báo cáo" aria-label="Xem báo cáo" disabled={!e.hasReport} className="p-2 text-gray-400 hover:text-blue-600 disabled:opacity-40" onClick={() => setSelected(e)}><Eye size={15} /></button> },
  ]
  return <Modal title={`Lịch sử bảo trì · ${job.name}`} onClose={onClose}><div className="flex h-[65vh] flex-col"><Grid columns={columns} result={query.data} error={query.error} loading={query.isFetching} page={page} pageSize={20} setPage={setPage} sort={sort} descending={descending} filters={filters} setFilter={(key, value) => { setFilters(f => ({ ...f, [key]: value || undefined } as Record<string, string>)); setPage(1) }} setSort={key => { setSort(key); setDescending(sort === key ? !descending : false); setPage(1) }} /></div>{selected && <StoredReport jobId={job.id} entry={selected} onClose={() => setSelected(null)} />}</Modal>
}
