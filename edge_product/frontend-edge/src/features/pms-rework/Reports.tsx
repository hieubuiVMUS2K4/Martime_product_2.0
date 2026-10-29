import { translateMessage as tx, messageLocale, useMessageLocale } from '@/i18n/messages'
import { useState } from 'react'
import { Eye } from 'lucide-react'
import { pms, snapshot, usePmsQuery, usePmsClock } from './data'
import { ActionIcon, Badge, DetailTabs, InfoField, ErrorBox, Grid, Modal, Section, type GridColumn } from './ui'
import type { Job, HistoryRow, Report, Submission } from './types'
import { serverFilters } from './time'
import { readableCode } from './presentation'
export function ReportContent({ report, section, showName = true, compact = false, bounded = false }: { report: Report; section: 'summary' | 'checklist' | 'materials'; showName?: boolean; compact?: boolean; bounded?: boolean }) {
  useMessageLocale()

  const {date,due}=usePmsClock(); const crew = usePmsQuery(['wo-crew'], pms.crew); const person = (id?: string) => crew.data?.find(c => c.crewId === id || c.id === id)?.fullName || readableCode(id) || tx("pmsRework.noInformationYet"); let data: Submission | null
  try { data = snapshot<Submission>(report.snapshotJson) } catch (error) { return <ErrorBox error={error} /> }
  if (!data) return <p className="text-sm text-gray-500">{tx("pmsRework.noSubmittedReportYet")}</p>
  return <>{section === 'summary' && <Section title={tx("pmsRework.submittedReport")} actions={<><span className="text-xs text-slate-500">{tx("pmsRework.revision") + " "}{report.revision}</span><Badge value={report.decision || 'PENDING_APPROVAL'} /></>}>
    {showName && <p className="mb-4 text-sm font-semibold text-slate-800">{data.name}</p>}
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-4">
      <InfoField name={tx("pmsRework.submittedBy")}>{person(data.submittedByCrewId)}</InfoField>
      <InfoField name={tx("pmsRework.submittedAt")}>{date(data.submittedAt)}</InfoField>
      <InfoField name={tx("pmsRework.workDuration")}>{(data.durationMinutes / 60).toLocaleString(messageLocale())}{" " + tx("pmsRework.hours349")}</InfoField>
      <InfoField name={tx("pmsRework.recordedRunningHours")}>{data.runningHours != null ? tx(data.runningHours === 1 ? "pmsRework.hoursSingular" : "pmsRework.hours", { p0: data.runningHours.toLocaleString(messageLocale()) }) : tx("pmsRework.notRecorded")}</InfoField>
      {(data.dueAt || data.dueHours != null) && <InfoField name={tx("pmsRework.executionDeadline")}>{due(data.dueAt, data.dueHours)}</InfoField>}
      {readableCode(data.code) && <InfoField name={tx("pmsRework.orderCode")}>{data.code}</InfoField>}
    </dl>
    <div className="mt-4 border-t border-gray-200 pt-3"><h3 className="mb-1 text-xs font-medium text-slate-500">{tx("pmsRework.resultsNotes")}</h3><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{data.notes || tx("pmsRework.noAdditionalNotes")}</p></div>
    {report.decidedAt && <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3"><dl className="grid gap-3 sm:grid-cols-2"><InfoField name={tx("pmsRework.reviewedBy")}>{report.decidedByCrewId ? person(report.decidedByCrewId) : tx("pmsRework.administrator")}</InfoField><InfoField name={tx("pmsRework.reviewedAt")}>{date(report.decidedAt)}</InfoField></dl>{report.decisionReason && <div className="mt-3 border-t border-gray-200 pt-2"><p className="mb-1 text-xs text-slate-500">{tx("pmsRework.reviewComments")}</p><p className="whitespace-pre-wrap text-sm text-slate-700">{report.decisionReason}</p></div>}</div>}
  </Section>}{section === 'checklist' && <div className={bounded ? '' : 'overflow-auto'}><table className={`w-full border-separate border-spacing-0 border-l border-t border-[#a3b1bc] text-xs ${compact ? '' : 'min-w-[600px]'}`}><thead className="bg-blue-50 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-blue-50"><tr>{[tx("pmsRework.description"), tx("pmsRework.result"), tx("pmsRework.reading"), tx("pmsRework.notes")].map(s => <th key={s} className="border-b border-r border-[#a3b1bc] p-2 text-center font-semibold">{s}</th>)}</tr></thead><tbody>{data.checklist.map(c => <tr key={c.id}><td className="border-b border-r border-[#a3b1bc] p-2">{c.description}</td><td className="border-b border-r border-[#a3b1bc] p-2">{c.completed ? tx("pmsRework.completed") : tx("pmsRework.incomplete")}</td><td className={`border-b border-r border-[#a3b1bc] p-2 ${c.isAbnormal ? 'text-red-600' : ''}`}>{c.reading ?? '—'} {c.unit}</td><td className="border-b border-r border-[#a3b1bc] p-2">{c.remarks || '—'}</td></tr>)}</tbody></table>{!data.checklist.length && <p className="p-3 text-gray-400">{tx("pmsRework.noChecklistItems")}</p>}</div>}
    {section === 'materials' && <div><table className="w-full border-separate border-spacing-0 border-l border-t border-[#a3b1bc] text-xs"><thead className="bg-blue-50 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-blue-50"><tr>{[tx("pmsRework.code"), tx("pmsRework.materialName"), tx("pmsRework.unit"), tx("pmsRework.quantity")].map(s => <th key={s} className="border-b border-r border-[#a3b1bc] p-2 text-center font-semibold">{s}</th>)}</tr></thead><tbody>{data.materials.map(m => <tr key={m.materialItemId}><td className="border-b border-r border-[#a3b1bc] p-2">{m.code}</td><td className="border-b border-r border-[#a3b1bc] p-2">{m.name}</td><td className="border-b border-r border-[#a3b1bc] p-2">{m.unit || '—'}</td><td className="border-b border-r border-[#a3b1bc] p-2">{m.quantity}</td></tr>)}</tbody></table>{!data.materials.length && <p className="p-3 text-xs text-gray-400">{tx("pmsRework.noMaterialUsageRecorded")}</p>}</div>}
  </>
}
export function ReportView({ report }: { report: Report }) {
  useMessageLocale()

  return <div className="space-y-4"><ReportContent report={report} section="summary" /><DetailTabs key={report.id + ':' + report.revision} items={[
    { key: 'checklist', name: tx("pmsRework.checklistAndReadings"), content: <ReportContent report={report} section="checklist" /> },
    { key: 'materials', name: tx("pmsRework.materialsUsed"), content: <ReportContent report={report} section="materials" /> },
  ]} /></div>
}
function StoredReport({ jobId, entry, onClose }: { jobId: string; entry: HistoryRow; onClose: () => void }) {
  useMessageLocale()

  const query = usePmsQuery(['job-report', jobId, entry.id], async () => entry.isLegacy ? pms.legacyReport(jobId, entry.id) : pms.completedReport(jobId, entry.id))
  return <Modal title={entry.isLegacy ? tx("pmsRework.legacyMaintenanceReport") : tx("pmsRework.maintenanceReport")} onClose={onClose}>{query.error ? <ErrorBox error={query.error} /> : !query.data ? <p className="text-xs text-gray-500">{tx("pmsRework.loadingReport")}</p> : 'snapshotJson' in query.data ? <ReportView report={query.data as Report} /> : <LegacyReport text={query.data.reportSnapshot} />}</Modal>
}
function LegacyReport({ text }: { text?: string }) {
  useMessageLocale()

  let data: { task?: { notes?: string; approvedBy?: string; verifiedBy?: string }; checklist?: { id: string; checkpointDescription: string; isCompleted: boolean; readingValue?: number; remarks?: string }[] } | null
  try { data = snapshot(text) } catch (error) { return <ErrorBox error={error} /> }
  if (!data) return <p className="text-sm text-gray-500">{tx("pmsRework.thisLegacyReportHasNoCompleteSnapshotCurrent")}</p>
  return <div className="space-y-4"><Section title={tx("pmsRework.resultSavedByTheLegacySystem")}><p className="whitespace-pre-wrap text-sm">{data.task?.notes || tx("pmsRework.noNotes")}</p><p className="mt-2 text-xs text-gray-500">{tx("pmsRework.approvedBy") + " "}{data.task?.verifiedBy || data.task?.approvedBy || tx("pmsRework.noInformationYet")}</p></Section><Section title={tx("pmsRework.savedChecklist")}>{data.checklist?.map((c, i) => <div key={c.id || i} className="grid grid-cols-3 gap-3 border-b border-gray-100 py-2 text-xs"><span>{c.checkpointDescription}</span><span>{c.isCompleted ? tx("pmsRework.completed") : tx("pmsRework.incomplete")} · {c.readingValue ?? '—'}</span><span>{c.remarks || '—'}</span></div>)}</Section></div>
}
export function JobHistory({ job, onClose }: { job: Job; onClose: () => void }) {
  useMessageLocale()

  const {date,zone}=usePmsClock(); const [page, setPage] = useState(1); const [sort, setSort] = useState('sourceTime'); const [descending, setDescending] = useState(true)
  const [filters, setFilters] = useState<Record<string, string>>({}); const [selected, setSelected] = useState<HistoryRow | null>(null)
  const query = usePmsQuery(['job-history', job.id, page, sort, descending, filters, zone], () => pms.history(job.id, { page, pageSize: 20, sort, descending, ...serverFilters(filters, zone) }))
  const columns: GridColumn<HistoryRow>[] = [
    { key: 'code', title: tx("pmsRework.workOrder378"), width: 200, render: e => e.isLegacy ? tx("pmsRework.legacyHistory") : readableCode(e.workOrderCode) || tx("pmsRework.maintenanceOrder") },
    { key: 'time', title: tx("pmsRework.submittedCompletionSourceTime"), width: 220, sort: 'sourceTime', dateRange: ['sourceFrom', 'sourceTo'], render: e => date(e.submittedAt || e.sourceExecutedAt) },
    { key: 'by', title: tx("pmsRework.assignee"), filter: 'completedBy', sort: 'completedBy', width: 170, render: e => e.completedBy || '—' },
    { key: 'approved', title: tx("pmsRework.approvalDate"), width: 190, render: e => date(e.approvedAt) },
    { key: 'hours', title: tx("pmsRework.runningHours"), sort: 'hours', width: 100, render: e => e.executedRunningHours ?? '—' },
    { key: 'actions', title: tx("pmsRework.actions"), width: 100, fixed: 'right', render: e => <ActionIcon label={tx("pmsRework.viewReport")} icon={<Eye />} disabled={!e.hasReport} onClick={() => setSelected(e)} /> },
  ]
  return <Modal title={tx("pmsRework.maintenanceHistory384", { p0: job.name })} onClose={onClose}><div className="flex h-[65vh] flex-col"><Grid columns={columns} result={query.data} error={query.error} loading={query.isFetching} page={page} pageSize={20} setPage={setPage} sort={sort} descending={descending} filters={filters} setFilter={(key, value) => { setFilters(f => ({ ...f, [key]: value || undefined } as Record<string, string>)); setPage(1) }} setSort={(key, direction) => { setSort(key); setDescending(direction ?? (sort === key ? !descending : false)); setPage(1) }} /></div>{selected && <StoredReport jobId={job.id} entry={selected} onClose={() => setSelected(null)} />}</Modal>
}
