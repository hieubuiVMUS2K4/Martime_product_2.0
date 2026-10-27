import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload, CircleCheck, CircleAlert } from 'lucide-react'
import { apiClient } from '@/services/api.client'
import { usePmsRefresh, cycle, label, message } from './data'
import { departmentName } from './departments'
import { button, primary, Modal, useAction } from './ui'
import type { WorkBook } from 'xlsx'
interface ImportRow { rowNumber: number; code: string; name: string; assetCode: string; workCode: string; category: string; intervalType: string; intervalDays?: number; intervalMonths?: number; intervalYears?: number; intervalHours?: number; instructions: string; priority: string; department: string }
interface ImportResult { valid: boolean; imported: number; count: number; errors: { rowNumber: number; code: string; errors: string[] }[] }
export async function parseJobWorkbook(book: WorkBook): Promise<ImportRow[]> {
  const XLSX = await import('xlsx')
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets.Maintenance || book.Sheets[book.SheetNames[0]], { header: 1, defval: '', blankrows: true })
  const headers = (matrix[0] || []).map(v => String(v).trim())
  for (const key of ['ScheduleCode', 'AssetCode', 'ScheduleName', 'MaintenanceCategory', 'IntervalType']) if (!headers.includes(key)) throw new Error(`Thiếu cột ${key}. Hãy dùng mẫu import công việc.`)
  if (headers.some(h => ['LastExecutedAt', 'NextDueDate', 'LastExecutedRunningHours', 'BaselineAt', 'BaselineRunningHours', 'Lần thực hiện cuối', 'Hạn tiếp theo'].includes(h))) throw new Error('File import chỉ chứa định nghĩa công việc. Hãy bỏ các cột lịch sử, mốc và hạn tiếp theo.')
  const rows = matrix.slice(1).flatMap((cells, index) => {
    if (cells.every(c => c == null || String(c).trim() === '')) return []
    const obj = Object.fromEntries(headers.map((key, i) => [key, cells[i]])), rowNumber = index + 2
    const text = (key: string) => String(obj[key] ?? '').trim()
    const number = (key: string) => { const raw = text(key); if (!raw) return undefined; const value = Number(raw); if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) throw new Error(`Dòng ${rowNumber}: ${key} phải là số nguyên dương.`); return value }
    return [{ rowNumber, code: text('ScheduleCode'), workCode: text('WorkCode'), assetCode: text('AssetCode'), name: text('ScheduleName'), category: text('MaintenanceCategory'), intervalType: text('IntervalType'),
      intervalDays: number('IntervalDays'), intervalMonths: number('IntervalMonths'), intervalYears: number('IntervalYears'), intervalHours: number('IntervalHours'), instructions: text('Instructions'), priority: text('Priority') || 'NORMAL', department: text('Department') }]
  })
  if (rows.length < 1 || rows.length > 1000) throw new Error('Mỗi file cần từ 1 đến 1.000 công việc.')
  return rows
}
export function ImportJobs({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<ImportRow[]>([]), [result, setResult] = useState<ImportResult | null>(null), [file, setFile] = useState('')
  const picker = useRef<HTMLInputElement>(null), [fileError, setFileError] = useState('')
  const action = useAction(), refresh = usePmsRefresh()
  const select = async (selected?: File) => {
    if (!selected) return; setRows([]); setResult(null); setFile(selected.name); setFileError('')
    await action.run(async () => {
      try {
      if (selected.size > 10 * 1024 * 1024) throw new Error('File vượt quá 10 MB.')
      const XLSX = await import('xlsx'); const parsed = await parseJobWorkbook(XLSX.read(await selected.arrayBuffer(), { type: 'array' }))
      setRows(parsed); setResult(await apiClient.post<ImportResult>('/pms/jobs/import', { validateOnly: true, rows: parsed }))
      } catch (error) { setFileError(message(error)); throw error }
    }, 'Đã kiểm tra file.')
  }
  const template = async () => {
    const XLSX = await import('xlsx'); const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ ScheduleCode: 'PUMP-CHECK-001', WorkCode: '', AssetCode: 'MA-THIET-BI-DANG-CO', ScheduleName: 'Kiểm tra bơm', MaintenanceCategory: 'PERIODIC', IntervalType: 'CALENDAR', IntervalDays: '', IntervalMonths: 3, IntervalYears: '', IntervalHours: '', Priority: 'NORMAL', Department: 'DECK', Instructions: '' }]), 'Maintenance')
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ Note: 'Chỉ nhập định nghĩa Job. Không nhập lịch sử, mốc tính hạn hoặc hạn tiếp theo; tự động tạo WO không được bật khi import.' }, { Note: 'PERIODIC: chọn CALENDAR + một chu kỳ ngày/tháng/năm; RUNNING_HOURS + giờ; HYBRID + cả hai. DRY_DOCK/ON_DEMAND/VOYAGE không nhập chu kỳ.' }, { Note: 'Mã duy nhất, AssetCode phải là thiết bị cụ thể đang có. Sau import mở Sửa công việc để bổ sung trách nhiệm, checklist và mốc ban đầu.' }]), 'Huong_dan')
    XLSX.writeFile(book, 'Mau_import_Job_List.xlsx')
  }
  const th = 'sticky top-0 border-b border-r border-[#a3b1bc] bg-blue-50 px-3 py-2.5 text-center text-xs font-semibold text-slate-600'
  const td = 'border-b border-r border-[#a3b1bc] px-3 py-2.5 text-xs text-slate-700'
  return <Modal title="Import Excel công việc" onClose={onClose} busy={action.busy} footer={<button className={primary} disabled={action.busy || !result?.valid || !rows.length || !!fileError} onClick={() => void action.run(async () => { const imported = await apiClient.post<ImportResult>('/pms/jobs/import', { validateOnly: false, rows }); if (!imported.valid) { setResult(imported); throw new Error('Dữ liệu có lỗi, chưa nhập dòng nào.') } await refresh(); onClose() }, 'Đã import công việc.')}><Upload size={14} />{action.busy ? 'Đang xử lý…' : `Nhập ${rows.length} công việc`}</button>}>
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="flex flex-wrap items-center gap-4 rounded-lg border border-dashed border-blue-200 bg-blue-50/40 p-5">
          <FileSpreadsheet size={32} className="shrink-0 text-blue-600" aria-hidden="true" />
          <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold text-slate-800">Chọn file công việc bảo trì</h3><p className="mt-1 text-xs text-slate-500">Excel .xlsx, .xls · Tối đa 10 MB · 1–1.000 công việc</p><p className="mt-2 truncate text-xs font-medium text-blue-700" title={file}>{file || 'Chưa chọn file'}</p></div>
          <input ref={picker} className="sr-only" disabled={action.busy} aria-label="Chọn file Excel công việc" type="file" accept=".xlsx,.xls" onChange={e => { const selected = e.target.files?.[0]; e.target.value = ''; void select(selected) }} />
          <button className={primary} disabled={action.busy} onClick={() => picker.current?.click()}><Upload size={14} />{file ? 'Đổi file' : 'Chọn file'}</button>
        </section>
        <section className="rounded-lg border border-gray-200 p-4"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800">Chuẩn bị dữ liệu</h3><button disabled={action.busy} className={button} onClick={() => void action.run(template, 'Đã tải mẫu import.')}><Download size={14} />Tải mẫu</button></div><ol className="space-y-1.5 text-xs leading-5 text-slate-500"><li>1. Dùng đúng mẫu; mã thiết bị phải có trong danh mục.</li><li>2. Chọn file và kiểm tra các dòng bên dưới.</li><li>3. Sửa hết lỗi trước khi xác nhận nhập.</li></ol></section>
      </div>
      <div className="flex gap-2 rounded border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs leading-5 text-blue-800"><CircleAlert size={16} className="mt-0.5 shrink-0" /><p>Chỉ nhập định nghĩa công việc (Job), không ghi nhận lần thực hiện và không phát hành WO. Sau khi nhập, bổ sung mốc tính hạn, trách nhiệm và checklist trong công việc.</p></div>
      {fileError && <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{fileError}</div>}
      <section className="overflow-hidden rounded border border-gray-200">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3"><h3 className="text-sm font-medium text-slate-800">Kiểm tra trước khi nhập</h3><span role="status" className={`inline-flex items-center gap-1.5 text-xs ${result?.valid ? 'text-green-700' : result ? 'text-red-600' : 'text-gray-500'}`}>{action.busy ? 'Đang xử lý file…' : result?.valid ? <><CircleCheck size={14} />{result.count} công việc hợp lệ</> : result ? <><CircleAlert size={14} />{result.errors.length} dòng cần kiểm tra · Chưa nhập dữ liệu</> : 'Chưa có dữ liệu'}</span></header>
        {rows.length ? <div className="max-h-[38vh] overflow-auto"><table className="w-full min-w-[950px] border-separate border-spacing-0"><thead><tr>{['Dòng Excel','Mã công việc','Tên công việc','Mã thiết bị','Loại / chu kỳ','Bộ phận','Kết quả kiểm tra'].map(title => <th key={title} className={th}>{title}</th>)}</tr></thead><tbody>{rows.map(row => { const errors = result?.errors.find(e => e.rowNumber === row.rowNumber)?.errors || []; return <tr key={row.rowNumber} className={errors.length ? 'bg-red-50/50' : row.rowNumber % 2 ? 'bg-gray-50/50' : 'bg-white'}><td className={`${td} text-center`}>{row.rowNumber}</td><td className={td}>{row.code || '—'}</td><td className={td}>{row.name || '—'}</td><td className={td}>{row.assetCode || '—'}</td><td className={td}>{row.category === 'PERIODIC' ? cycle(row) : label[row.category] || row.category}</td><td className={td}>{departmentName(row.department)}</td><td className={`${td} min-w-[220px] ${errors.length ? 'text-red-700' : ''}`}>{errors.length ? errors.join('; ') : result?.valid ? <span className="text-green-700">Hợp lệ</span> : 'Chờ kiểm tra lại'}</td></tr> })}</tbody></table></div> : <div className="flex flex-col items-center gap-2 px-4 py-8 text-sm text-slate-400"><FileSpreadsheet size={28} aria-hidden="true" /><p>Chọn file Excel để xem trước công việc và lỗi dữ liệu.</p></div>}
        {!!result?.errors.some(e => !rows.some(row => row.rowNumber === e.rowNumber)) && <div role="alert" className="border-t border-red-100 bg-red-50 p-3 text-xs text-red-700">{result.errors.filter(e => !rows.some(row => row.rowNumber === e.rowNumber)).map((e,i) => <p key={i}>Dòng {e.rowNumber}: {e.errors.join('; ')}</p>)}</div>}
      </section>
    </div>
  </Modal>
}