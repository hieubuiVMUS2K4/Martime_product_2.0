import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ColumnFilterMenu } from '@/components/common/DataTable/ColumnFilterMenu'
import { toast } from 'sonner'
import { TablePagination } from '@/components/common/DataTable'
import { label, message } from './data'
import type { Page } from './types'
export const input = 'h-8 w-full min-w-0 rounded border border-gray-300 bg-white px-2 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 disabled:bg-gray-50 disabled:text-gray-500'
export const button = 'inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded border border-gray-300 bg-white px-3 text-xs text-gray-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40'
export const primary = button.replace('border-gray-300', 'border-blue-600').replace('bg-white', 'bg-blue-600').replace('text-gray-700', 'text-white').replace('hover:bg-blue-50', 'hover:bg-blue-700')
export function ActionIcon({ label, icon, to, onClick, disabled = false, danger = false }: {
  label: string; icon: ReactNode; to?: string; onClick?: () => void; disabled?: boolean; danger?: boolean;
}) {
  const style = `inline-flex shrink-0 items-center justify-center rounded p-1 text-slate-500 disabled:cursor-not-allowed disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4 ${danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-blue-100 hover:text-blue-600'}`
  return to && !disabled ? <Link to={to} className={style} title={label} aria-label={label}>{icon}</Link>
    : <button type="button" className={style} title={label} aria-label={label} onClick={onClick} disabled={disabled}>{icon}</button>
}
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
function ColumnControls<T>({ column, filters, setFilter, close }: { column: GridColumn<T>; filters: Record<string, string>; setFilter: (key: string, value: string) => void; close: () => void }) {
  const keys = column.dateRange || (column.filter ? [column.filter] : [])
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(keys.map(key => [key, filters[key] || ''])))
  const apply = (clear = false) => { keys.forEach(key => setFilter(key, clear ? '' : draft[key] || '')); close() }
  if (!keys.length) return null
  return <form className="space-y-3 p-2" onSubmit={e => { e.preventDefault(); apply() }}>
    {column.options ? <fieldset className="max-h-60 space-y-1 overflow-auto"><legend className="mb-2 text-xs font-medium text-gray-700">{column.title}</legend>{column.options.map(([value, text]) => <label key={value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-xs text-gray-900 hover:bg-blue-50"><input type="radio" name={`filter-${column.key}`} checked={draft[column.filter!] === value} onChange={() => setDraft({ [column.filter!]: value })} className="accent-blue-600" />{text}</label>)}</fieldset>
      : keys.map((key, i) => <label key={key} className="block space-y-1 text-xs text-gray-700"><span>{column.dateRange ? i === 0 ? 'Từ ngày' : 'Đến ngày' : column.title}</span><input autoFocus={i === 0} type={column.dateRange ? 'date' : 'search'} aria-label={`${column.title} ${column.dateRange ? i === 0 ? 'từ ngày' : 'đến ngày' : 'tìm kiếm'}`} className={input} placeholder={column.placeholder || 'Nhập nội dung cần tìm…'} value={draft[key]} onChange={e => setDraft(previous => ({ ...previous, [key]: e.target.value }))} /></label>)}
    <div className="flex justify-between gap-2 border-t border-gray-200 pt-2"><button type="button" className={button} onClick={() => apply(true)}>Bỏ lọc</button><button type="submit" className={primary}>Áp dụng</button></div>
  </form>
}
export function Grid<T extends { id: string }>({ columns, result, loading, error, filters, setFilter, sort, descending, setSort, page, pageSize, setPage, toolbar }: {
  columns: GridColumn<T>[]; result?: Page<T>; loading: boolean; error: unknown; filters: Record<string, string>; setFilter: (key: string, value: string) => void;
  sort: string; descending: boolean; setSort: (value: string, descending?: boolean) => void; page: number; pageSize: number; setPage: (value: number) => void; toolbar?: ReactNode;
}) {
  // These fields use server queries, never just the currently loaded page.
  const searchColumn = columns.find(c => c.filter && !c.options && !c.dateRange)
  const header = 'h-10 border-b border-r border-b-[#7d8d9a] border-r-[#a3b1bc] bg-blue-50 px-2 py-2 text-center align-middle text-xs font-semibold leading-tight text-gray-600'
  const cell = 'border-b border-r border-[#a3b1bc] px-2.5 py-2 align-middle'
  const fixed = (c: GridColumn<T>) => c.fixed === 'right' ? 'sticky right-0 z-10 shadow-[-1px_0_0_0_#a3b1bc]' : c.fixed === 'left' ? 'sticky left-12 z-10 shadow-[1px_0_0_0_#a3b1bc]' : ''
  return <div className="flex min-h-0 flex-1 flex-col bg-white">
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-3 py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-3">{searchColumn && <label className="relative w-[340px] max-w-full"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" aria-hidden="true" /><input type="search" aria-label={`Tìm ${searchColumn.title.toLocaleLowerCase('vi')}`} placeholder={searchColumn.placeholder ? `Tìm ${searchColumn.placeholder.toLocaleLowerCase('vi')}…` : `Tìm ${searchColumn.title.toLocaleLowerCase('vi')}…`} className="h-9 w-full rounded-md border border-gray-300 bg-white pl-8 pr-3 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-200" value={filters[searchColumn.filter!] || ''} onChange={e => setFilter(searchColumn.filter!, e.target.value)} /></label>}<span className="text-xs text-gray-600" role="status">{result?.total ?? 0} kết quả{loading ? ' · Đang tải…' : ''}</span></div><div className="flex flex-wrap gap-2">{toolbar}</div>
    </div>
    {error ? <ErrorBox error={error} /> : <div className="min-h-0 flex-1 overflow-auto" aria-busy={loading} tabIndex={0} aria-label="Bảng dữ liệu, có thể cuộn ngang"><table className="w-full table-fixed border-separate border-spacing-0 text-xs text-gray-900" style={{ minWidth: columns.reduce((sum, c) => sum + (c.width || 160), 48) }}>
      <colgroup><col style={{ width: 48 }} />{columns.map(c => <col key={c.key} style={{ width: c.width || 160 }} />)}</colgroup>
      <thead className="sticky top-0 z-20"><tr><th scope="col" className={`${header} sticky left-0 z-30`}>STT</th>{columns.map(c => <th scope="col" key={c.key} className={`${header} ${c.fixed ? fixed(c) : 'relative'} ${c.fixed ? '!z-30' : ''} ${c.sort || c.filter || c.dateRange ? 'pr-6' : ''}`}>
        <span className="inline-flex max-w-full items-center justify-center gap-1 break-words">{c.title}</span>
        {(c.sort || c.filter || c.dateRange) && <ColumnFilterMenu label={c.title} values={[]} selected={(c.dateRange || (c.filter ? [c.filter] : [])).some(key => !!filters[key]) ? ['active'] : null} sortable={!!c.sort} sortDirection={c.sort === sort ? descending ? 'desc' : 'asc' : null} onSort={direction => { if (c.sort && direction) setSort(c.sort, direction === 'desc') }} onApply={() => {}} filterContent={close => <ColumnControls column={c} filters={filters} setFilter={setFilter} close={close} />} />}
      </th>)}</tr></thead>
      <tbody>{result?.items.map((row, index) => <tr key={row.id} className={`group text-gray-900 hover:bg-blue-50/70 ${index % 2 ? 'bg-gray-50/50' : 'bg-white'}`}><td className={`${cell} sticky left-0 z-10 bg-white text-right tabular-nums text-gray-600 group-hover:bg-blue-50`}>{(page - 1) * pageSize + index + 1}</td>{columns.map(c => <td key={c.key} className={`${cell} ${fixed(c)} ${c.fixed ? index % 2 ? 'bg-gray-50 group-hover:bg-blue-50' : 'bg-white group-hover:bg-blue-50' : ''} ${c.key === 'actions' ? 'text-center' : ''}`}><div className="truncate">{c.render(row)}</div></td>)}</tr>)}
        {!result?.items.length && <tr><td colSpan={columns.length + 1} className="p-10 text-center text-gray-500">{loading ? 'Đang tải…' : 'Không có dữ liệu phù hợp.'}</td></tr>}</tbody></table></div>}
    <TablePagination page={page} pageSize={pageSize} totalItems={result?.total || 0} onPageChange={setPage} />
  </div>
}
