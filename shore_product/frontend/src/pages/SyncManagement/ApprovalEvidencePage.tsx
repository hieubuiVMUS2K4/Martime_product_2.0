import { useEffect, useRef, useState } from 'react'
import { Download, Eye, FileCheck2, FileJson } from 'lucide-react'
import { ENV } from '../../config/env'
import { buildAuthHeaders } from '../../services/api.client'
import { Button, DataTable, FormAlert, Modal, PageHeader, TableActions, TableIconButton, type Column } from '../../components/common'

interface EvidenceDocument {
  id: string; originNode: string; module: string; recordKey: string; currentRevision: number; currentState: string
}
interface EvidenceAction {
  id: string; actorName: string; actorRank: string; action: string; createdAt: string; reason?: string; contentHash: string
}
interface EvidenceFile { id: string; fileName: string; ready: boolean }
interface EvidenceRevision { id: string; revision: number; snapshotJson: string }
interface EvidenceDetail { document: EvidenceDocument; actions: EvidenceAction[]; files: EvidenceFile[]; revisions: EvidenceRevision[] }
const labels: Record<string, string> = {
  COMPLETED: 'Hoàn thành', RECTIFY: 'Yêu cầu làm lại', SCHEDULED: 'Đã lên lịch', PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', RETURNED: 'Đã trả lại', CANCELLED: 'Đã hủy',
  IN_PROGRESS: 'Đang thực hiện', SUBMITTED: 'Đã gửi', APPROVE: 'Phê duyệt', REJECT: 'Từ chối', RETURN: 'Trả lại',
}
const label = (value: string) => labels[value.toUpperCase()] || value || '—'
const moduleName = (value: string) => value.toLowerCase() === 'pms' ? 'Bảo trì (PMS)' : value
const time = (value: string) => new Date(value).toLocaleString('vi-VN')
function StateBadge({ value }: { value: string }) {
  const tone = ['COMPLETED', 'APPROVED'].includes(value.toUpperCase()) ? 'bg-emerald-50 text-emerald-700'
    : ['RECTIFY', 'REJECTED', 'RETURNED', 'CANCELLED'].includes(value.toUpperCase()) ? 'bg-red-50 text-red-700'
    : value.toUpperCase() === 'PENDING_APPROVAL' ? 'bg-amber-50 text-amber-700' : 'bg-primary-soft text-primary'
  return <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${tone}`}>{label(value)}</span>
}
function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a')
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function snapshotText(value: string) {
  try { return JSON.stringify(JSON.parse(value), null, 2) } catch { return value }
}
async function load<T>(path = ''): Promise<T> {
  const response = await fetch(`${ENV.API_BASE_URL}/approval-evidence${path}`, { headers: buildAuthHeaders() })
  if (!response.ok) throw new Error('Không thể tải hồ sơ xác nhận từ tàu.')
  return response.json()
}

export default function ApprovalEvidencePage() {
  const [documents, setDocuments] = useState<EvidenceDocument[]>([])
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const [selected, setSelected] = useState<EvidenceDocument | null>(null)
  const [detail, setDetail] = useState<EvidenceDetail | null>(null), [detailError, setDetailError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false), [downloading, setDownloading] = useState<string | null>(null)
  const [tab, setTab] = useState<'actions' | 'files' | 'revisions'>('actions')
  const requestId = useRef(0)
  useEffect(() => {
    let cancelled = false
    load<EvidenceDocument[]>().then(rows => { if (!cancelled) setDocuments(rows) })
      .catch(e => { if (!cancelled) setError(e.message) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])
  const openDetail = async (doc: EvidenceDocument) => {
    const request = ++requestId.current
    setSelected(doc); setDetail(null); setDetailError(''); setDetailLoading(true); setTab('actions')
    try { const result = await load<EvidenceDetail>(`/${doc.id}`); if (request === requestId.current) setDetail(result) }
    catch (e) { if (request === requestId.current) setDetailError(e instanceof Error ? e.message : 'Không thể tải chi tiết.') }
    finally { if (request === requestId.current) setDetailLoading(false) }
  }
  const closeDetail = () => { requestId.current++; setSelected(null) }
  const download = async (file: EvidenceFile) => {
    if (!detail) return
    setDownloading(file.id); setDetailError('')
    try {
      const response = await fetch(`${ENV.API_BASE_URL}/approval-evidence/${detail.document.id}/files/${file.id}`, { headers: buildAuthHeaders() })
      if (!response.ok) throw new Error('Tệp chưa sẵn sàng hoặc không khớp bằng chứng đã nhận.')
      saveFile(await response.blob(), file.fileName)
    } catch (e) { setDetailError(e instanceof Error ? e.message : 'Không thể tải tệp.') }
    finally { setDownloading(null) }
  }
  const columns: Column<EvidenceDocument>[] = [
    { key: 'node', header: 'Tàu / node', value: d => d.originNode, width: 220 },
    { key: 'module', header: 'Phân hệ', value: d => moduleName(d.module), width: 150 },
    { key: 'record', header: 'Mã hồ sơ nguồn', value: d => d.recordKey, width: 310,
      render: d => <button className="text-primary hover:underline" onClick={() => void openDetail(d)}>{d.recordKey}</button> },
    { key: 'revision', header: 'Phiên bản', value: d => d.currentRevision, width: 100, numeric: true, align: 'center' },
    { key: 'state', header: 'Trạng thái', value: d => label(d.currentState), width: 170, render: d => <StateBadge value={d.currentState} /> },
    { key: 'actions', header: 'Thao tác', width: 90, align: 'center', render: d => <TableActions>
      <TableIconButton label={`Xem hồ sơ ${d.recordKey}`} icon={<Eye />} onClick={() => void openDetail(d)} />
    </TableActions> },
  ]
  const actionColumns: Column<EvidenceAction>[] = [
    { key: 'time', header: 'Thời điểm ký', value: a => a.createdAt, render: a => time(a.createdAt), width: 190 },
    { key: 'actor', header: 'Người ký', value: a => a.actorName, width: 160 },
    { key: 'rank', header: 'Chức danh', value: a => a.actorRank, width: 140 },
    { key: 'action', header: 'Thao tác', value: a => label(a.action), width: 150 },
    { key: 'reason', header: 'Ý kiến / lý do', value: a => a.reason || '—', width: 240, truncate: false },
  ]
  const fileColumns: Column<EvidenceFile>[] = [
    { key: 'name', header: 'Tên tệp', value: f => f.fileName },
    { key: 'state', header: 'Trạng thái tệp', value: f => f.ready ? 'Đã nhận' : 'Chờ đồng bộ', width: 180 },
    { key: 'actions', header: 'Thao tác', width: 100, align: 'center', render: f => <TableActions>
      <TableIconButton label={`Tải ${f.fileName}`} icon={<Download />} disabled={!f.ready || downloading !== null} onClick={() => void download(f)} />
    </TableActions> },
  ]
  return <div className="flex h-full min-h-0 flex-col overflow-hidden p-4 sm:p-5">
    <div className="shrink-0"><PageHeader icon={<FileCheck2 />} title="Hồ sơ ký xác nhận từ tàu"
      description="Tra cứu hồ sơ, lịch sử ký và tệp được đồng bộ từ tàu. Hồ sơ chỉ đọc trên bờ." /></div>
    <DataTable columns={columns} data={documents} rowKey={d => d.id} loading={loading} error={error}
      itemLabel="hồ sơ" emptyMessage="Chưa có hồ sơ ký được đồng bộ từ tàu." searchPlaceholder="Tìm tàu, phân hệ, mã hồ sơ, trạng thái..."
      onRowClick={doc => void openDetail(doc)} exportOptions={false} minWidth={1000}
      className="min-h-0 flex-1 [&>footer]:shrink-0" />
    <Modal isOpen={selected !== null} onClose={closeDetail} size="xl" icon={<FileCheck2 />}
      title="Chi tiết hồ sơ ký" subtitle={selected ? `Tàu / node: ${selected.originNode}` : ''}
      footer={<><Button disabled={!detail} icon={<FileJson />} onClick={() => detail && saveFile(new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' }), `approval-${detail.document.id}.json`)}>Xuất hồ sơ JSON</Button>
        <Button onClick={closeDetail}>Đóng</Button></>}>
      <FormAlert>{detailError}</FormAlert>
      {detailLoading && <p role="status" className="py-8 text-center text-sm text-ink-muted">Đang tải hồ sơ...</p>}
      {detail && <>
        <dl className="mb-4 grid gap-4 rounded border border-line bg-canvas/60 p-4 sm:grid-cols-3">
          <div><dt className="text-xs text-ink-muted">Mã hồ sơ nguồn</dt><dd className="mt-1 break-all text-sm text-ink">{detail.document.recordKey}</dd></div>
          <div><dt className="text-xs text-ink-muted">Phân hệ / phiên bản</dt><dd className="mt-1 text-sm text-ink">{moduleName(detail.document.module)} · {detail.document.currentRevision}</dd></div>
          <div><dt className="mb-1 text-xs text-ink-muted">Trạng thái</dt><dd><StateBadge value={detail.document.currentState} /></dd></div>
        </dl>
        <div role="tablist" aria-label="Chi tiết hồ sơ ký" className="mb-3 flex flex-wrap border-b border-line">
          {([['actions', 'Lịch sử ký', detail.actions.length], ['files', 'Tệp đính kèm', detail.files.length], ['revisions', 'Phiên bản', detail.revisions.length]] as const).map(([key, title, count]) =>
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`border-b-2 px-4 py-3 text-sm font-medium ${tab === key ? 'border-primary text-primary' : 'border-transparent text-ink-muted hover:text-primary'}`}>{title} <span className="ml-1 text-xs">({count})</span></button>)}
        </div>
        <div role="tabpanel">
          {tab === 'actions' && <DataTable columns={actionColumns} data={detail.actions} rowKey={a => a.id} itemLabel="lượt ký" emptyMessage="Chưa có lịch sử ký." exportOptions={false} minWidth={800} />}
          {tab === 'files' && <DataTable columns={fileColumns} data={detail.files} rowKey={f => f.id} itemLabel="tệp" emptyMessage="Hồ sơ không có tệp đính kèm." exportOptions={false} minWidth={650} />}
          {tab === 'revisions' && <div className="space-y-2">{detail.revisions.length ? detail.revisions.map(revision => <details key={revision.id} className="rounded border border-line">
            <summary className="cursor-pointer bg-canvas px-4 py-3 text-sm font-medium text-ink">Phiên bản {revision.revision} — dữ liệu đối chiếu</summary>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all p-4 text-xs text-ink-muted">{snapshotText(revision.snapshotJson)}</pre>
          </details>) : <p className="p-4 text-sm text-ink-muted">Chưa có phiên bản được đồng bộ.</p>}</div>}
        </div>
      </>}
    </Modal>
  </div>
}
