import { useState } from 'react'
import { Eye } from 'lucide-react'
import { pms, snapshot, usePmsQuery, usePmsClock } from './data'
import { ActionIcon, Badge, DetailTabs, InfoField, ErrorBox, Grid, Modal, Section, type GridColumn } from './ui'
import type { Job, HistoryRow, Report, Submission } from './types'
import { serverFilters } from './time'
import { readableCode } from './presentation'
export function ReportContent({ report, section, showName = true, compact = false, bounded = false }: { report: Report; section: 'summary' | 'checklist' | 'materials'; showName?: boolean; compact?: boolean; bounded?: boolean }) {
  const {date,due}=usePmsClock(); const crew = usePmsQuery(['wo-crew'], pms.crew); const person = (id?: string) => crew.data?.find(c => c.crewId === id || c.id === id)?.fullName || readableCode(id) || 'Chưa có thông tin'; let data: Submission | null
  try { data = snapshot<Submission>(report.snapshotJson) } catch (error) { return <ErrorBox error={error} /> }
  if (!data) return <p className="text-sm text-gray-500">Chưa có bản báo cáo.</p>
  return <>{section === 'summary' && <Section title="Báo cáo đã gửi" actions={<><span className="text-xs text-slate-500">Lượt {report.revision}</span><Badge value={report.decision || 'PENDING_APPROVAL'} /></>}>
    {showName && <p className="mb-4 text-sm font-semibold text-slate-800">{data.name}</p>}
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
      <InfoField name="Người gửi">{person(data.submittedByCrewId)}</InfoField>
      <InfoField name="Thời điểm gửi">{date(data.submittedAt)}</InfoField>
      <InfoField name="Thời gian thực hiện">{(data.durationMinutes / 60).toLocaleString('vi-VN')} giờ</InfoField>
      <InfoField name="Giờ chạy ghi nhận">{data.runningHours != null ? `${data.runningHours.toLocaleString('vi-VN')} giờ` : 'Không ghi nhận'}</InfoField>
      {(data.dueAt || data.dueHours != null) && <InfoField name="Hạn của lượt thực hiện">{due(data.dueAt, data.dueHours)}</InfoField>}
      {readableCode(data.code) && <InfoField name="Mã lệnh">{data.code}</InfoField>}
    </dl>
    <div className="mt-4 border-t border-gray-200 pt-3"><h3 className="mb-1 text-xs font-medium text-slate-500">Kết quả / ghi chú</h3><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{data.notes || 'Không có ghi chú bổ sung.'}</p></div>
    {report.decidedAt && <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3"><dl className="grid gap-3 sm:grid-cols-2"><InfoField name="Người kiểm tra">{report.decidedByCrewId ? person(report.decidedByCrewId) : 'Quản trị viên'}</InfoField><InfoField name="Thời điểm kiểm tra">{date(report.decidedAt)}</InfoField></dl>{report.decisionReason && <div className="mt-3 border-t border-gray-200 pt-2"><p className="mb-1 text-xs text-slate-500">Ý kiến kiểm tra</p><p className="whitespace-pre-wrap text-sm text-slate-700">{report.decisionReason}</p></div>}</div>}
  </Section>}{section === 'checklist' && <div className={bounded ? '' : 'overflow-auto'}><table className={`w-full border-separate border-spacing-0 border-l border-t border-[#a3b1bc] text-xs ${compact ? '' : 'min-w-[600px]'}`}><thead className="bg-blue-50 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-blue-50"><tr>{['Nội dung', 'Kết quả', 'Số đo', 'Ghi chú'].map(s => <th key={s} className="border-b border-r border-[#a3b1bc] p-2 text-center font-semibold">{s}</th>)}</tr></thead><tbody>{data.checklist.map(c => <tr key={c.id}><td className="border-b border-r border-[#a3b1bc] p-2">{c.description}</td><td className="border-b border-r border-[#a3b1bc] p-2">{c.completed ? 'Hoàn thành' : 'Chưa hoàn thành'}</td><td className={`border-b border-r border-[#a3b1bc] p-2 ${c.isAbnormal ? 'text-red-600' : ''}`}>{c.reading ?? '—'} {c.unit}</td><td className="border-b border-r border-[#a3b1bc] p-2">{c.remarks || '—'}</td></tr>)}</tbody></table>{!data.checklist.length && <p className="p-3 text-gray-400">Không có hạng mục kiểm tra.</p>}</div>}
    {section === 'materials' && <div><table className="w-full border-separate border-spacing-0 border-l border-t border-[#a3b1bc] text-xs"><thead className="bg-blue-50 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-blue-50"><tr>{['Mã', 'Tên vật tư', 'Đơn vị', 'Số lượng'].map(s => <th key={s} className="border-b border-r border-[#a3b1bc] p-2 text-center font-semibold">{s}</th>)}</tr></thead><tbody>{data.materials.map(m => <tr key={m.materialItemId}><td className="border-b border-r border-[#a3b1bc] p-2">{m.code}</td><td className="border-b border-r border-[#a3b1bc] p-2">{m.name}</td><td className="border-b border-r border-[#a3b1bc] p-2">{m.unit || '—'}</td><td className="border-b border-r border-[#a3b1bc] p-2">{m.quantity}</td></tr>)}</tbody></table>{!data.materials.length && <p className="p-3 text-xs text-gray-400">Không ghi nhận vật tư sử dụng.</p>}</div>}
  </>
}
export function ReportView({ report }: { report: Report }) {
  return <div className="space-y-4"><ReportContent report={report} section="summary" /><DetailTabs key={report.id + ':' + report.revision} items={[
    { key: 'checklist', name: 'Checklist và số đo', content: <ReportContent report={report} section="checklist" /> },
    { key: 'materials', name: 'Vật tư đã sử dụng', content: <ReportContent report={report} section="materials" /> },
  ]} /></div>
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
    { key: 'code', title: 'Lệnh thực hiện', width: 200, render: e => e.isLegacy ? 'Lịch sử cũ' : readableCode(e.workOrderCode) || 'Lệnh bảo trì' },
    { key: 'time', title: 'Gửi hoàn tất / thời điểm nguồn', width: 220, sort: 'sourceTime', dateRange: ['sourceFrom', 'sourceTo'], render: e => date(e.submittedAt || e.sourceExecutedAt) },
    { key: 'by', title: 'Người thực hiện', filter: 'completedBy', sort: 'completedBy', width: 170, render: e => e.completedBy || '—' },
    { key: 'approved', title: 'Ngày duyệt', width: 190, render: e => date(e.approvedAt) },
    { key: 'hours', title: 'Giờ chạy', sort: 'hours', width: 100, render: e => e.executedRunningHours ?? '—' },
    { key: 'actions', title: 'Hành động', width: 100, fixed: 'right', render: e => <ActionIcon label="Xem báo cáo" icon={<Eye />} disabled={!e.hasReport} onClick={() => setSelected(e)} /> },
  ]
  return <Modal title={`Lịch sử bảo trì · ${job.name}`} onClose={onClose}><div className="flex h-[65vh] flex-col"><Grid columns={columns} result={query.data} error={query.error} loading={query.isFetching} page={page} pageSize={20} setPage={setPage} sort={sort} descending={descending} filters={filters} setFilter={(key, value) => { setFilters(f => ({ ...f, [key]: value || undefined } as Record<string, string>)); setPage(1) }} setSort={(key, direction) => { setSort(key); setDescending(direction ?? (sort === key ? !descending : false)); setPage(1) }} /></div>{selected && <StoredReport jobId={job.id} entry={selected} onClose={() => setSelected(null)} />}</Modal>
}
