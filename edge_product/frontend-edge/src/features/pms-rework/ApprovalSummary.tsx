import type { ApprovalContext } from '@/services/approval'
import { snapshot } from './data'
import { ReportView } from './Reports'
import type { Submission } from './types'

export function isPmsWorkOrderContext(context: ApprovalContext) {
  if (context.module !== 'pms') return false
  const value = context.snapshot as Record<string, unknown> | null
  return !!value && typeof value === 'object' && ('SubmittedReport' in value || 'submittedReport' in value || value.SchemaVersion === 2 || value.schemaVersion === 2)
}

export function pmsApprovalReport(context: ApprovalContext) {
  if (context.module !== 'pms') return null
  try {
    const envelope = snapshot<{ submittedReport?: string; revision?: number }>(JSON.stringify(context.snapshot))
    const data = snapshot<Submission>(envelope?.submittedReport)
    if (!data || !Array.isArray(data.checklist) || !Array.isArray(data.materials)) return null
    return { data, json: envelope!.submittedReport!, revision: envelope?.revision || context.revision || 1 }
  } catch { return null }
}

export function PmsApprovalSummary({ context }: { context: ApprovalContext }) {
  const report = pmsApprovalReport(context)
  if (!report) return <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Không đọc được bản báo cáo để đối chiếu. Hãy đóng và tải lại báo cáo trước khi xác nhận.</p>
  return <ReportView report={{ id: '', revision: report.revision, contentHash: context.contentHash, submittedAt: report.data.submittedAt, submittedByCrewId: report.data.submittedByCrewId, snapshotJson: report.json }} />
}
