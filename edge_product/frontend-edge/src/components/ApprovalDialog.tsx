import { useEffect, useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { PmsApprovalSummary, pmsApprovalReport, isPmsWorkOrderContext } from '@/features/pms-rework/ApprovalSummary'
import { ApprovalContext, ApprovalCancelledError, registerApprovalConfirmation } from '@/services/approval'

const labels: Record<string, string> = { sign: 'Ký xác nhận', submit: 'Ký gửi duyệt', approve: 'Phê duyệt', reject: 'Trả lại', check: 'Kiểm tra an toàn', issue: 'Cấp phép', close: 'Đóng phép', suspend: 'Đình chỉ', amend: 'Tạo sửa đổi', complete: 'Hoàn tất nhập kho' }
export function ApprovalDialog() {
  const [pending, setPending] = useState<{ context: ApprovalContext; resolve: (value: { password: string; reason: string }) => void; reject: (error: Error) => void }>()
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('')
  const [reviewed, setReviewed] = useState(false)
  useEffect(() => {
    registerApprovalConfirmation(context => new Promise((resolve, reject) => { setPassword(''); setReason(''); setReviewed(false); setPending(previous => { previous?.reject(new ApprovalCancelledError('Yêu cầu ký trước đã được thay thế.')); return { context, resolve, reject } }) }))
    return () => registerApprovalConfirmation(undefined)
  }, [])
  if (!pending) return null
  const { context } = pending
  const report = pmsApprovalReport(context)
  const isWorkOrder = isPmsWorkOrderContext(context)
  const reasonRequired = ['reject', 'amend', 'suspend'].includes(context.action)
  const cancel = () => { pending.reject(new ApprovalCancelledError()); setPassword(''); setPending(undefined) }
  return <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Ký xác nhận">
    <form className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-auto space-y-4 text-sm text-gray-800" onSubmit={event => { event.preventDefault(); if (!password || !reviewed || (reasonRequired && !reason.trim()) || (isWorkOrder && !report)) return; pending.resolve({ password, reason }); setPassword(''); setPending(undefined) }}>
      <div className="flex items-center justify-between border-b border-gray-200 pb-3"><h2 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck size={18} className="text-blue-600" />{labels[context.action] || context.action}</h2><button type="button" aria-label="Đóng xác nhận" onClick={cancel} className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button></div>
      <div className="rounded border border-gray-200 bg-gray-50 p-3"><p className="mb-1 text-xs text-gray-500">Người xác nhận</p><p className="font-medium">{context.actor.name} · {context.actor.rank === 'ADMIN' ? 'Quản trị viên' : context.actor.rank}</p></div>
      <p>{isWorkOrder ? <><strong>{report?.data.name || 'Báo cáo bảo trì'}</strong><span className="ml-2 text-gray-500">· Lượt báo cáo {report?.revision || context.revision || 1} · Chờ duyệt</span></> : <>Hồ sơ: {context.recordKey} · Phiên bản {context.revision || 1} · {context.state}</>}</p>
      <details className="rounded border border-gray-200"><summary className="cursor-pointer bg-gray-50 px-3 py-2 font-medium">{isWorkOrder ? 'Xem lại báo cáo bảo trì' : 'Kiểm tra nội dung sẽ xác nhận'}</summary><div className="p-3">{isWorkOrder ? <PmsApprovalSummary context={context} /> : <pre className="max-h-60 overflow-auto text-xs whitespace-pre-wrap p-3 bg-slate-100 dark:bg-slate-800">{JSON.stringify(context.snapshot, null, 2)}</pre>}</div></details>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />Tôi đã kiểm tra nội dung và xác nhận trong phạm vi thẩm quyền được giao.</label>
      <label className="block">{isWorkOrder ? reasonRequired ? 'Lý do trả lại *' : 'Ý kiến phê duyệt (không bắt buộc)' : 'Lý do / ghi chú'}<textarea className="mt-1 block w-full border border-gray-300 rounded p-2 dark:bg-slate-800" value={reason} required={reasonRequired} onChange={event => setReason(event.target.value)} /></label>
      <label className="block">Nhập lại mật khẩu tài khoản<input autoFocus required type="password" autoComplete="current-password" className="block w-full border rounded p-2 dark:bg-slate-800" value={password} onChange={event => setPassword(event.target.value)} /></label>
      <div className="sticky -bottom-6 -mx-6 flex justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4"><button type="button" onClick={cancel} className="rounded border border-gray-300 px-3 py-2">Hủy</button><button disabled={!password || !reviewed || (reasonRequired && !reason.trim()) || (isWorkOrder && !report)} className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">Xác nhận</button></div>
    </form>
  </div>
}
