import { useEffect, useState } from 'react'
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
  const cancel = () => { pending.reject(new ApprovalCancelledError()); setPassword(''); setPending(undefined) }
  return <div className="fixed inset-0 z-[10000] bg-black/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Ký xác nhận">
    <form className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-2xl space-y-4" onSubmit={event => { event.preventDefault(); pending.resolve({ password, reason }); setPassword(''); setPending(undefined) }}>
      <h2 className="text-xl font-semibold">{labels[context.action] || context.action}</h2>
      <p>{context.actor.name} — {context.actor.rank} ({context.actor.username})</p>
      <p className="text-sm">Hồ sơ: {context.recordKey} · Phiên bản {context.revision || 1} · {context.state}</p>
      <details><summary className="cursor-pointer font-medium">Kiểm tra nội dung sẽ xác nhận</summary><pre className="max-h-60 overflow-auto text-xs whitespace-pre-wrap p-3 bg-slate-100 dark:bg-slate-800">{JSON.stringify(context.snapshot, null, 2)}</pre></details>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />Tôi đã kiểm tra nội dung và xác nhận trong phạm vi thẩm quyền được giao.</label>
      <label className="block">Lý do / ghi chú<textarea className="block w-full border rounded p-2 dark:bg-slate-800" value={reason} required={['reject', 'amend', 'suspend'].includes(context.action)} onChange={event => setReason(event.target.value)} /></label>
      <label className="block">Nhập lại mật khẩu tài khoản<input autoFocus required type="password" autoComplete="current-password" className="block w-full border rounded p-2 dark:bg-slate-800" value={password} onChange={event => setPassword(event.target.value)} /></label>
      <div className="flex justify-end gap-3"><button type="button" onClick={cancel}>Hủy</button><button disabled={!password || !reviewed} className="bg-blue-600 text-white rounded px-4 py-2 disabled:opacity-50">Xác nhận</button></div>
    </form>
  </div>
}
