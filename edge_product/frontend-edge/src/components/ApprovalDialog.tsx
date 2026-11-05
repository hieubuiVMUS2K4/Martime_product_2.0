import { translateMessage as tx, useMessageLocale } from '@/i18n/messages'
import { useEffect, useId, useRef, useState } from 'react'
import { ShieldCheck, UserRound, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { PmsApprovalSummary, pmsApprovalReport, isPmsWorkOrderContext } from '@/features/pms-rework/ApprovalSummary'
import { ApprovalContext, ApprovalConfirmation, ApprovalCancelledError, registerApprovalConfirmation } from '@/services/approval'

const getLabels = (): Record<string, string> => ({ sign: tx("pmsRework.approvalSign"), submit: tx("pmsRework.approvalSubmit"), approve: tx("pmsRework.approve"), reject: tx("pmsRework.return"), check: tx("pmsRework.approvalCheck"), issue: tx("pmsRework.approvalIssue"), close: tx("pmsRework.approvalClose"), suspend: tx("pmsRework.approvalSuspend"), amend: tx("pmsRework.approvalAmend"), complete: tx("pmsRework.approvalComplete") })

export function ApprovalDialog() {
  useMessageLocale()
  const labels = getLabels()
  const titleId = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, setPending] = useState<{ context: ApprovalContext; resolve: (value: ApprovalConfirmation) => void; reject: (error: Error) => void }>()
  const [reason, setReason] = useState('')
  const [reviewed, setReviewed] = useState(false)

  useEffect(() => {
    registerApprovalConfirmation(context => new Promise((resolve, reject) => {
      setReason('')
      setReviewed(false)
      setPending(previous => {
        previous?.reject(new ApprovalCancelledError(tx("pmsRework.approvalReplaced")))
        return { context, resolve, reject }
      })
    }))
    return () => registerApprovalConfirmation(undefined)
  }, [])

  useEffect(() => {
    if (!pending) return
    const previous = document.activeElement as HTMLElement | null
    formRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        pending.reject(new ApprovalCancelledError())
        setPending(undefined)
      }
      if (event.key !== 'Tab') return
      const elements = Array.from(formRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,summary,[tabindex="0"]') || [])
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === formRef.current)) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [pending])

  if (!pending) return null
  const { context } = pending
  const report = pmsApprovalReport(context)
  const isWorkOrder = isPmsWorkOrderContext(context)
  const reasonRequired = ['reject', 'amend', 'suspend'].includes(context.action)
  const canConfirm = reviewed && (!reasonRequired || !!reason.trim()) && (!isWorkOrder || !!report)
  const title = labels[context.action] || tx("pmsRework.approvalSign")
  const cancel = () => {
    pending.reject(new ApprovalCancelledError())
    setPending(undefined)
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4">
      <form ref={formRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white text-sm text-gray-800 shadow-2xl outline-none dark:bg-slate-900 dark:text-slate-100"
        onSubmit={event => {
          event.preventDefault()
          if (!canConfirm) return
          pending.resolve({ acknowledged: true, reason: reason.trim() })
          setPending(undefined)
        }}>
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-slate-700">
          <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold"><ShieldCheck size={18} className="text-blue-600" />{title}</h2>
          <button type="button" aria-label={tx("pmsRework.approvalCloseDialog")} onClick={cancel} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={20} /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded border border-gray-200 bg-gray-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-1 flex items-center gap-2 text-xs text-gray-500"><UserRound size={14} />{tx("pmsRework.approvalActor")}</p>
            <p className="font-medium">{context.actor.name}<span className="mx-2 text-gray-300">·</span>{context.actor.rank === 'ADMIN' ? tx("pmsRework.administrator") : context.actor.rank}</p>
          </div>
          <div className="space-y-1">
            <p className="font-semibold">{isWorkOrder ? report?.data.name || tx("pmsRework.maintenanceReport") : tx("pmsRework.approvalRecord")}</p>
            <p className="text-xs text-gray-500">{isWorkOrder ? tx("pmsRework.approvalReportRevision", { revision: report?.revision || context.revision || 1 }) : `${tx("pmsRework.approvalRevision")} ${context.revision || 1} · ${context.state}`}</p>
          </div>
          <details className="overflow-hidden rounded border border-gray-200 dark:border-slate-700">
            <summary className="cursor-pointer bg-gray-50 px-4 py-2.5 font-medium dark:bg-slate-800">{isWorkOrder ? tx("pmsRework.approvalReviewReport") : tx("pmsRework.approvalReviewContent")}</summary>
            <div className="max-h-72 overflow-auto border-t border-gray-200 p-3 dark:border-slate-700">
              {isWorkOrder ? <PmsApprovalSummary context={context} /> : <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(context.snapshot, null, 2)}</pre>}
            </div>
          </details>
          <label className="block space-y-2">
            <span className="font-medium">{isWorkOrder ? reasonRequired ? tx("pmsRework.approvalReturnReason") : tx("pmsRework.approvalOptionalComments") : tx("pmsRework.approvalReason")}</span>
            <textarea rows={3} className="block w-full resize-y rounded border border-gray-300 px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800" value={reason} required={reasonRequired} onChange={event => setReason(event.target.value)} />
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded border border-blue-100 bg-blue-50/60 p-3 text-sm leading-5 dark:border-slate-600 dark:bg-slate-800">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />
            <span>{tx("pmsRework.approvalAcknowledgement")}</span>
          </label>
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800">
          <button type="button" onClick={cancel} className="inline-flex h-9 items-center justify-center rounded border border-gray-300 bg-white px-4 text-sm text-gray-700 hover:bg-gray-100">{tx("pmsRework.cancel")}</button>
          <button type="submit" disabled={!canConfirm} className="inline-flex h-9 items-center justify-center gap-2 rounded bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"><ShieldCheck size={16} />{title}</button>
        </footer>
      </form>
    </div>, document.body,
  )
}
