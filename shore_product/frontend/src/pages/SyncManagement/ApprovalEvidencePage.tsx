import { useEffect, useState } from 'react'
import { ENV } from '../../config/env'
import { buildAuthHeaders } from '../../services/api.client'

export default function ApprovalEvidencePage() {
  const [documents, setDocuments] = useState<any[]>([])
  const [detail, setDetail] = useState<any>()
  const [error, setError] = useState('')
  const load = async (path = '') => {
    const response = await fetch(`${ENV.API_BASE_URL}/approval-evidence${path}`, { headers: buildAuthHeaders() })
    if (!response.ok) throw new Error('Không thể tải hồ sơ xác nhận từ tàu.')
    return response.json()
  }
  useEffect(() => { load().then(setDocuments).catch(error => setError(error.message)) }, [])
  return <div className="p-6 space-y-4">
    <h1 className="text-2xl font-semibold">Hồ sơ ký xác nhận từ tàu</h1><p>Hồ sơ chỉ đọc. Nội dung và lịch sử do Edge tạo; thời gian nhận metadata và hoàn tất file được theo dõi riêng trong Đồng bộ.</p>
    {error && <p role="alert">{error}</p>}
    <table className="w-full text-left"><thead><tr><th>Tàu / node</th><th>Module</th><th>Hồ sơ</th><th>Phiên bản</th><th>Trạng thái</th></tr></thead><tbody>{documents.map(doc => <tr key={doc.id} className="border-b cursor-pointer" onClick={() => load(`/${doc.id}`).then(setDetail).catch(error => setError(error.message))}><td>{doc.originNode}</td><td>{doc.module}</td><td>{doc.recordKey}</td><td>{doc.currentRevision}</td><td>{doc.currentState}</td></tr>)}</tbody></table>
    {!documents.length && <p>Chưa có hồ sơ xác nhận được đồng bộ.</p>}
    {detail && <div className="border rounded p-4 space-y-3"><button onClick={() => { const blob = new Blob([JSON.stringify(detail, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `approval-${detail.document.id}.json`; link.click(); URL.revokeObjectURL(url) }}>Xuất hồ sơ JSON</button>
      {detail.actions.map((action: any) => <div key={action.id} className="border-t py-2"><b>{action.actorName}</b> · {action.actorRank} · {action.action} · {new Date(action.createdAt).toLocaleString()}<p>{action.reason}</p><p className="text-xs break-all">SHA-256: {action.contentHash}</p></div>)}
      {detail.files?.map((file: any) => <div key={file.id}>{file.fileName} · {file.ready ? <button onClick={async () => { try { const response = await fetch(`${ENV.API_BASE_URL}/approval-evidence/${detail.document.id}/files/${file.id}`, { headers: buildAuthHeaders() }); if (!response.ok) throw new Error('Tệp chưa sẵn sàng hoặc không khớp bằng chứng.'); const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = file.fileName; link.click(); URL.revokeObjectURL(url) } catch (error: any) { setError(error.message) } }}>Tải tệp đã xác minh</button> : 'Đang chờ đồng bộ tệp'}</div>)}
      {detail.revisions.map((revision: any) => <details key={revision.id}><summary>Phiên bản {revision.revision}</summary><pre className="overflow-auto max-h-96 whitespace-pre-wrap text-xs">{JSON.stringify(JSON.parse(revision.snapshotJson), null, 2)}</pre></details>)}
    </div>}
  </div>
}
