import { useState } from 'react'
import { toast } from 'sonner'
import { reportSigningError } from '@/lib/signingFeedback'
import { apiClient } from '@/services/api.client'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { ApprovalHistory } from './ApprovalHistory'
import { PermitDraftEditor } from './PermitDraftEditor'

const actions: Record<string, [string, string, string][]> = {
  Draft: [['submit', 'Gửi kiểm tra', 'check']],
  PendingCheck: [['check', 'Xác nhận kiểm tra an toàn', 'check'], ['reject', 'Trả lại', 'reject']],
  PendingIssue: [['issue', 'Cấp phép', 'issue'], ['reject', 'Trả lại', 'reject']],
  Issued: [['close', 'Đóng phép', 'close'], ['suspend', 'Đình chỉ', 'suspend']],
  Suspended: [['close', 'Đóng phép', 'close'], ['amend', 'Sửa đổi / cấp lại', 'check']],
  Returned: [['amend', 'Tạo sửa đổi', 'check']],
  Closed: [['amend', 'Cấp lại qua kiểm tra mới', 'check']],
  Active: [['amend', 'Kiểm tra lại phép cũ', 'check']]
}
export function PermitApprovalActions({ id, status, startTime, durationHours, onChanged }: { id: string; status: string; startTime?: string; durationHours?: number; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const expiry = startTime ? new Date(startTime).getTime() + (durationHours || 0) * 3600000 : 0
  const effective = status === 'Issued' && Date.now() >= new Date(startTime || '').getTime() && Date.now() < expiry
  const act = async (action: string) => {
    setBusy(true)
    try { await apiClient.post(`/approvals/permit/${id}/${action}`, {}); toast.success('Đã lưu xác nhận'); onChanged() }
    catch (error: unknown) { reportSigningError(error) }
    finally { setBusy(false) }
  }
  return <div className="space-y-2 text-sm">
    <p className={effective ? 'text-green-600' : 'text-amber-700'}>{effective ? 'Đã cấp phép, trong thời hạn hiệu lực' : status === 'Issued' && Date.now() >= expiry ? 'Hết hiệu lực — cần cấp lại' : `Trạng thái: ${status}`}</p>
    {status === 'Active' && <p>Giấy phép cũ chưa có bằng chứng xác nhận tài khoản. Cần kiểm tra và cấp lại.</p>}
    {['Draft', 'Returned'].includes(status) && <PermitDraftEditor id={id} onChanged={onChanged} />}
    <div className="flex gap-2 flex-wrap">{(actions[status] || []).map(([action, label, permission]) => <PermissionGate key={action} permission={`hsqe.permits.${permission}`}><button disabled={busy} onClick={() => act(action)} className="bg-blue-600 rounded px-3 py-2 text-white disabled:opacity-50">{label}</button></PermissionGate>)}</div>
    <ApprovalHistory module="permit" recordKey={id} />
  </div>
}
