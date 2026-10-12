import { useState } from 'react'
import { apiClient } from '@/services/api.client'

export function ApprovalHistory({ module, recordKey }: { module: string; recordKey: string }) {
  const [data, setData] = useState<any>()
  const [error, setError] = useState('')
  const printRevision = (revision: any) => {
    const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))
    const popup = window.open('', '_blank')
    if (!popup) { setError('Cho phép cửa sổ in để xuất PDF.'); return }
    const actions = data.actions.filter((action: any) => action.revisionId === revision.id)
    popup.document.write(`<html><head><title>Hồ sơ xác nhận ${escape(recordKey)}</title><style>body{font:12px Arial;margin:30px}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:20px}@page{size:A4;margin:15mm}</style></head><body><h1>Hồ sơ ký xác nhận</h1><p>${escape(module)} · ${escape(recordKey)} · Phiên bản ${revision.revision}</p><p>SHA-256: ${escape(revision.contentHash)}</p><h2>Nội dung tại thời điểm ký</h2><pre>${escape(JSON.stringify(JSON.parse(revision.snapshotJson), null, 2))}</pre><h2>Lịch sử xác nhận</h2><pre>${escape(JSON.stringify(actions, null, 2))}</pre></body></html>`)
    popup.document.close(); popup.focus(); popup.print()
  }
  return <details className="mt-3 border rounded p-3" onToggle={event => { if (event.currentTarget.open) apiClient.get(`/approvals/${module}/${recordKey}/history`).then(setData).catch(error => setError(error.message)) }}>
    <summary className="cursor-pointer font-medium">Lịch sử ký xác nhận</summary>
    {error && <p>{error}</p>}{data?.legacy && <p>{data.message}</p>}
    {data?.actions?.map((action: any) => <div key={action.id} className="border-t py-2 text-sm"><b>{action.actorName}</b> · {action.actorRank} · {action.action} · {new Date(action.createdAt).toLocaleString()}<p>{action.reason}</p><span className="text-xs break-all">SHA-256: {action.contentHash}</span></div>)}
    {data?.revisions?.map((revision: any) => <details key={revision.id}><summary>Phiên bản {revision.revision} · {revision.reason}</summary><button className="border rounded px-3 py-1 my-2" onClick={() => printRevision(revision)}>In / lưu PDF hồ sơ xác nhận</button><pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(JSON.parse(revision.snapshotJson), null, 2)}</pre></details>)}
  </details>
}
