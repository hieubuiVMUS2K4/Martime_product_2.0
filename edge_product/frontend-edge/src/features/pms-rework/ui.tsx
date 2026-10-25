import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { TablePagination } from '@/components/common/DataTable'
import { label, message } from './data'
import type { Page } from './types'
export const input = 'h-8 w-full min-w-0 rounded border border-gray-300 bg-white px-2 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-500'
export const button = 'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded border border-gray-300 bg-white px-3 text-xs text-gray-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40'
export const primary = button.replace('border-gray-300', 'border-blue-600').replace('bg-white', 'bg-blue-600').replace('text-gray-700', 'text-white').replace('hover:bg-blue-50', 'hover:bg-blue-700')
export function Badge({ value }: { value?: string }) {
  const color = ['OVERDUE', 'RECTIFY', 'CRITICAL'].includes(value || '') ? 'bg-red-50 text-red-700' : ['ACTIVE', 'COMPLETED', 'APPROVED'].includes(value || '') ? 'bg-green-50 text-green-700' : ['UPCOMING', 'PENDING_APPROVAL', 'NEEDS_INFORMATION'].includes(value || '') ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
  return <span className={`inline-block rounded px-2 py-0.5 text-xs ${color}`}>{label[value || ''] || value || '—'}</span>
}
export function Field({ name, children }: { name: string; children: ReactNode }) { return <label className="flex min-w-0 flex-col gap-1.5 text-xs text-gray-600"><span>{name}</span>{children}</label> }
export function Section({ title, children }: { title: string; children: ReactNode }) { return <section className="overflow-hidden rounded border border-gray-200"><h2 className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800">{title}</h2><div className="p-4">{children}</div></section> }
export function Modal({ title, children, onClose, busy = false, footer }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; footer?: ReactNode }) {
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
export function useAction() {
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const run = async (action: () => Promise<unknown>, success: string) => {
    if (lock.current) return false
    lock.current = true; setBusy(true)
    try { await action(); toast.success(success); return true }
    catch (error) { if (!(error instanceof Error && error.name === 'ApprovalCancelledError')) toast.error(message(error)); return false }
    finally { lock.current = false; setBusy(false) }
  }
  return { busy, run }
}
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) { return <div role="alert" className="m-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message(error)}{retry && <button className="ml-3 underline" onClick={retry}>Thử lại</button>}</div> }
export interface GridColumn<T> { key: string; title: string; width?: number; sort?: string; filter?: string; placeholder?: string; dateRange?: [string, string]; options?: [string, string][]; render: (row: T) => ReactNode; fixed?: 'left' | 'right' }
export function Grid<T extends { id: string }>({ columns, result, loading, error, filters, setFilter, sort, descending, setSort, page, pageSize, setPage, toolbar }: {
  columns: GridColumn<T>[]; result?: Page<T>; loading: boolean; error: unknown; filters: Record<string, string>; setFilter: (key: string, value: string) => void;
  sort: string; descending: boolean; setSort: (value: string) => void; page: number; pageSize: number; setPage: (value: number) => void; toolbar?: ReactNode;
}) {
  return <div className="flex min-h-0 flex-1 flex-col bg-white"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-3 py-2"><span className="text-xs text-gray-500">{result?.total ?? 0} kết quả{loading ? ' · Đang tải…' : ''}</span><div className="flex gap-2">{toolbar}</div></div>
    {error ? <ErrorBox error={error} /> : <div className="min-h-0 flex-1 overflow-auto" aria-busy={loading}><table className="w-full table-fixed border-collapse text-xs" style={{ minWidth: columns.reduce((sum, c) => sum + (c.width || 160), 48) }}>
      <colgroup><col style={{ width: 48 }} />{columns.map(c => <col key={c.key} style={{ width: c.width || 160 }} />)}</colgroup>
      <thead className="sticky top-0 z-20 bg-blue-50 text-gray-700"><tr><th className="sticky left-0 z-30 border-b border-r border-gray-200 bg-blue-50 p-2">STT</th>{columns.map(c => <th key={c.key} className={`border-b border-r border-gray-200 bg-blue-50 px-2 py-2 text-left font-medium ${c.fixed === 'right' ? 'sticky right-0 z-30' : c.fixed === 'left' ? 'sticky left-12 z-30' : ''}`}>
        {c.sort ? <button onClick={() => setSort(c.sort!)} className="flex w-full items-center justify-between gap-2 text-left" aria-label={`Sắp xếp ${c.title}`}>{c.title}{sort === c.sort && (descending ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}</button> : c.title}</th>)}</tr>
        <tr><th className="sticky left-0 z-30 border-b border-r border-gray-200 bg-white" />{columns.map(c => <th key={c.key} className={`border-b border-r border-gray-200 bg-white p-1 font-normal ${c.fixed === 'right' ? 'sticky right-0 z-30' : c.fixed === 'left' ? 'sticky left-12 z-30' : ''}`}>
          {c.dateRange && <details className="relative"><summary className={`${input} !h-7 flex cursor-pointer list-none items-center text-gray-500`}>{c.dateRange.some(key => filters[key]) ? 'Đang lọc ngày' : 'Lọc khoảng ngày'}</summary><div className="absolute left-0 top-full z-40 mt-1 w-72 space-y-2 rounded border border-gray-300 bg-white p-3 shadow-lg">{c.dateRange.map((key, i) => <label key={key} className="flex items-center gap-2 text-xs"><span className="w-16 shrink-0">{i === 0 ? 'Từ ngày' : 'Đến ngày'}</span><input type="date" aria-label={`${c.title} ${i === 0 ? 'từ ngày' : 'đến ngày'}`} className={input} value={filters[key] || ''} onChange={e => setFilter(key, e.target.value)} /></label>)}<button className="text-xs text-blue-600" onClick={() => c.dateRange!.forEach(key => setFilter(key, ''))}>Xóa lọc ngày</button></div></details>}
          {c.filter && (c.options ? <select className={`${input} !h-7`} aria-label={`Lọc ${c.title}`} value={filters[c.filter] || ''} onChange={e => setFilter(c.filter!, e.target.value)}>{c.options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select> : <input className={`${input} !h-7`} aria-label={`Tìm ${c.title}`} placeholder={c.placeholder || 'Tìm kiếm'} value={filters[c.filter] || ''} onChange={e => setFilter(c.filter!, e.target.value)} />)}</th>)}</tr>
      </thead><tbody>{result?.items.map((row, index) => <tr key={row.id} className="group bg-white text-gray-700 hover:bg-blue-50"><td className="sticky left-0 border-b border-r border-gray-100 bg-white p-2 text-center text-gray-500 group-hover:bg-blue-50">{(page - 1) * pageSize + index + 1}</td>{columns.map(c => <td key={c.key} className={`border-b border-r border-gray-100 px-2 py-2 ${c.fixed === 'right' ? 'sticky right-0 z-10 bg-white group-hover:bg-blue-50' : c.fixed === 'left' ? 'sticky left-12 z-10 bg-white group-hover:bg-blue-50' : ''}`}><div className="truncate">{c.render(row)}</div></td>)}</tr>)}
        {!result?.items.length && <tr><td colSpan={columns.length + 1} className="p-10 text-center text-gray-400">{loading ? 'Đang tải…' : 'Không có dữ liệu phù hợp.'}</td></tr>}</tbody></table></div>}
    <TablePagination page={page} pageSize={pageSize} totalItems={result?.total || 0} onPageChange={setPage} />
  </div>
}
