import { useState } from 'react'
import { getSigningErrorMessage, isSigningCancelled, reportSigningError } from '@/lib/signingFeedback'
import { apiClient } from '@/services/api.client'
import { PermissionGate } from './auth/PermissionGate'
import { ApprovalHistory } from './ApprovalHistory'

export function SigningControls({ module, recordKey, permission, signed, signEndpoint }: { module: string; recordKey: string; permission: string; signed: boolean; signEndpoint?: string }) {
  const [error, setError] = useState('')
  const act = async (action: string) => {
    setError('')
    try { await apiClient.post(action === 'sign' && signEndpoint ? signEndpoint : `/approvals/${module}/${recordKey}/${action}`, {}); window.location.reload() }
    catch (error) {
      if (isSigningCancelled(error)) reportSigningError(error)
      else setError(getSigningErrorMessage(error, 'Không thể lưu xác nhận.'))
    }
  }
  return <div className="my-2 text-sm" onClick={event => event.stopPropagation()}>
    <PermissionGate permission={permission}><button type="button" className="border rounded px-3 py-1" onClick={() => act(signed ? 'amend' : 'sign')}>{signed ? 'Tạo sửa đổi có lý do' : 'Ký xác nhận bằng tài khoản'}</button></PermissionGate>
    {error && <p className="text-red-600">{error}</p>}
    <ApprovalHistory module={module} recordKey={recordKey} />
  </div>
}
