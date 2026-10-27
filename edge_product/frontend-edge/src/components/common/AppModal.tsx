import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
const button = 'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded border border-gray-300 bg-white px-3 text-xs text-gray-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40'
export function AppModal({ title, children, onClose, busy = false, footer }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose); close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const key = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]')
      if (dialogs[dialogs.length - 1] !== ref.current) return
      if (event.key === 'Escape' && !busy) close.current()
      if (event.key !== 'Tab') return
      const elements = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]') || [])
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); previous?.focus() }
  }, [busy])
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[90vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl outline-none">
    <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4"><h2 className="text-base font-semibold text-gray-900">{title}</h2><button type="button" className="p-1 text-gray-400 hover:text-gray-700" aria-label="Đóng" onClick={onClose} disabled={busy}><X size={20} /></button></header>
    <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div><footer className="flex justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">{footer}<button type="button" className={button} disabled={busy} onClick={onClose}>Đóng</button></footer>
  </div></div>, document.body)
}
