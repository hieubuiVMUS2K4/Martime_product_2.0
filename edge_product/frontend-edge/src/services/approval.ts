import { API_CONFIG } from '@/config/app.config'

export interface ApprovalContext {
  actor: { name: string; rank: string; username: string; authority: string }
  module: string; recordKey: string; action: string; state: string
  version: number; revision: number; contentHash: string; snapshot: unknown
}
type Confirmation = { password: string; reason: string }
export class ApprovalCancelledError extends Error {
  constructor(message = 'Đã hủy ký xác nhận.') {
    super(message)
    this.name = 'ApprovalCancelledError'
  }
}
let confirm: ((context: ApprovalContext) => Promise<Confirmation>) | undefined
export function registerApprovalConfirmation(handler: typeof confirm) { confirm = handler }

export function approvalTarget(endpoint: string, body: any): { module: string; key: string; action: string } | undefined {
  const path = endpoint.replace(/^.*\/api(?=\/)/, '')
  let match = path.match(/^\/logbooks\/(deck|engine|oil|watchkeeping|ballast|garbage(?:\/part-i|\/part-ii)?)\/([^/]+)\/sign$/)
  if (match) return { module: 'log-' + match[1].replace('/part-ii', '-ii').replace('/part-i', '-i'), key: match[2], action: 'sign' }
  match = path.match(/^\/voyage-log\/([^/]+)\/sign$/)
  if (match) return { module: 'log-voyage', key: match[1], action: 'sign' }
  match = path.match(/^\/reports\/([^/]+)\/approve$/)
  if (match) return { module: 'report', key: match[1], action: 'approve' }
  match = path.match(/^\/reports\/[^/]+\/amendments\/([^/]+)\/approve$/)
  if (match) return { module: 'report-amendment', key: match[1], action: 'approve' }
  match = path.match(/^\/hsqe\/documents\/([^/]+)\/approve$/)
  if (match) return { module: 'hsqe-document', key: match[1], action: 'approve' }
  match = path.match(/^\/drills?\/logs\/([^/]+)\/approve$/)
  if (match) return { module: 'drill-log', key: match[1], action: 'approve' }
  match = path.match(/^\/sms\/records\/([^/]+)\/(sign|approve)$/)
  if (match) return { module: 'sms', key: match[1], action: match[2] === 'sign' ? 'submit' : 'approve' }
  match = path.match(/^\/tasks\/([^/]+)\/verify$/)
  if (match) return { module: 'pms', key: match[1], action: body?.action === 'REJECT' ? 'reject' : 'approve' }
  match = path.match(/^\/maintenance\/tasks\/([^/]+)\/(approve|complete)$/)
  if (match) return { module: 'pms', key: match[1], action: body?.isApproved === false ? 'reject' : 'approve' }
  match = path.match(/^\/stock-receipts\/([^/]+)\/(submit|approve|complete)$/)
  if (match) return { module: 'receipt', key: match[1], action: match[2] }
  match = path.match(/^\/hsqe\/permits\/([^/]+)\/close$/)
  if (match) return { module: 'permit', key: match[1], action: 'close' }
  match = path.match(/^\/approvals\/(sms|permit|receipt|hsqe-document|drill-log|log-[a-z-]+|report-weekly|report-monthly|report-engineer|pms-(?:risk|inspection)-[a-z]+)\/([^/]+)\/(submit|check|issue|close|suspend|reject|amend|sign)$/)
  if (match) return { module: match[1], key: match[2], action: match[3] }
}

export async function prepareApproval(endpoint: string, body: any, token: string | null): Promise<Record<string, string>> {
  const target = approvalTarget(endpoint, body)
  if (!target) return {}
  if (!confirm) throw new Error('Hộp xác nhận chưa sẵn sàng.')
  const response = await fetch(`${API_CONFIG.BASE_URL}/approvals/${target.module}/${target.key}/context?action=${target.action}`, { headers: { Authorization: `Bearer ${token}` } })
  const context = await response.json()
  if (!response.ok) throw new Error(context.message || 'Không có quyền ký xác nhận.')
  const confirmation = await confirm(context)
  return { 'X-Approval-Password': confirmation.password, 'X-Approval-Reason': encodeURIComponent(confirmation.reason),
    'X-Approval-Version': String(context.version), 'X-Approval-Hash': context.contentHash, 'X-Approval-Idempotency-Key': crypto.randomUUID() }
}
