import { useState } from 'react'
import { apiClient } from '@/services/api.client'
import { usePmsRefresh } from './data'
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
  const action = useAction(), refresh = usePmsRefresh()
  const select = async (selected?: File) => {
    if (!selected) return; setRows([]); setResult(null); setFile(selected.name)
    await action.run(async () => {
      if (selected.size > 10 * 1024 * 1024) throw new Error('File vượt quá 10 MB.')
      const XLSX = await import('xlsx'); const parsed = await parseJobWorkbook(XLSX.read(await selected.arrayBuffer(), { type: 'array' }))
      setRows(parsed); setResult(await apiClient.post<ImportResult>('/pms/jobs/import', { validateOnly: true, rows: parsed }))
    }, 'Đã kiểm tra file.')
  }
  const template = async () => {
    const XLSX = await import('xlsx'); const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ ScheduleCode: 'PUMP-CHECK-001', WorkCode: '', AssetCode: 'MA-THIET-BI-DANG-CO', ScheduleName: 'Kiểm tra bơm', MaintenanceCategory: 'PERIODIC', IntervalType: 'CALENDAR', IntervalDays: '', IntervalMonths: 3, IntervalYears: '', IntervalHours: '', Priority: 'NORMAL', Department: 'DECK', Instructions: '' }]), 'Maintenance')
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ Note: 'Chỉ nhập định nghĩa Job. Không nhập lịch sử, mốc tính hạn hoặc hạn tiếp theo; tự động tạo WO không được bật khi import.' }, { Note: 'PERIODIC: chọn CALENDAR + một chu kỳ ngày/tháng/năm; RUNNING_HOURS + giờ; HYBRID + cả hai. DRY_DOCK/ON_DEMAND/VOYAGE không nhập chu kỳ.' }, { Note: 'Mã duy nhất, AssetCode phải là thiết bị cụ thể đang có. Sau import mở Sửa công việc để bổ sung trách nhiệm, checklist và mốc ban đầu.' }]), 'Huong_dan')
    XLSX.writeFile(book, 'Mau_import_Job_List.xlsx')
  }
  return <Modal title="Import Excel công việc" onClose={onClose} busy={action.busy} footer={<button className={primary} disabled={action.busy || !result?.valid} onClick={() => void action.run(async () => { const imported = await apiClient.post<ImportResult>('/pms/jobs/import', { validateOnly: false, rows }); if (!imported.valid) { setResult(imported); throw new Error('Dữ liệu có lỗi, chưa nhập dòng nào.') } await refresh(); onClose() }, 'Đã import công việc.')}>Nhập {rows.length} công việc</button>}>
    <div className="flex items-center gap-3"><input disabled={action.busy} aria-label="Chọn file Excel công việc" type="file" accept=".xlsx,.xls" onChange={e => void select(e.target.files?.[0])} /><button className={button} onClick={() => void template()}>Tải mẫu</button></div>
    <p className="mt-4 text-xs text-gray-500">{file || 'Chưa chọn file.'} · Import không ghi nhận lần thực hiện và không phát hành WO.</p>
    {result && <div className="mt-4"><p className="text-sm">{result.valid ? `${result.count} dòng hợp lệ, có thể nhập.` : 'File có lỗi. Chưa nhập dòng nào.'}</p><div className="mt-2 max-h-80 overflow-auto">{result.errors.map((row, i) => <div key={i} className="border-b border-red-100 py-2 text-xs text-red-700">Dòng {row.rowNumber} · {row.code}: {row.errors.join('; ')}</div>)}</div></div>}
  </Modal>
}
