import { useState } from 'react';
import { Download, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { maintenanceScheduleService, type ImportMaintenanceRow } from '@/services/maintenance-schedule.service';
import { maintenanceCategoryLabel } from './maintenance-categories';

function number(value: unknown, column: string, row: number): number | undefined {
  if (value === '' || value == null) return undefined;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`Dòng ${row}: ${column} phải là số.`);
  return result;
}

export function parseMaintenanceWorkbook(book: XLSX.WorkBook): ImportMaintenanceRow[] {
  const sheet = book.Sheets.Maintenance || book.Sheets[book.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true });
  const headers = (matrix[0] || []).map(String);
  for (const column of ['ScheduleCode', 'AssetCode', 'ScheduleName', 'MaintenanceCategory', 'IntervalType'])
    if (!headers.includes(column)) throw new Error(`Thiếu cột ${column}. Hãy dùng mẫu import công việc.`);
  return matrix.slice(1).flatMap((cells, i) => {
    if (cells.every(v => v === '' || v == null)) return [];
    const rowNumber = i + 2;
    const row = Object.fromEntries(headers.map((header, col) => [header, cells[col]]));
    const text = (key: string) => String(row[key] ?? '').trim();
    const numeric = (key: string) => number(row[key], key, rowNumber);
    return [{
      rowNumber, taskTypeId: 1, scheduleCode: text('ScheduleCode'), workCode: text('WorkCode'), assetCode: text('AssetCode'),
      scheduleName: text('ScheduleName'), maintenanceCategory: text('MaintenanceCategory') as ImportMaintenanceRow['maintenanceCategory'],
      intervalType: (text('IntervalType') || 'CALENDAR') as ImportMaintenanceRow['intervalType'],
      intervalDays: numeric('IntervalDays'), intervalMonths: numeric('IntervalMonths'), intervalYears: numeric('IntervalYears'),
      intervalHours: numeric('IntervalHours'), hoursMinimum: numeric('HoursMinimum'), hoursMaximum: numeric('HoursMaximum'),
      instructions: text('Instructions'), review: text('Review'), priority: text('Priority') || 'NORMAL', autoGenerate: false,
    }];
  });
}

function downloadTemplate() {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{
    ScheduleCode: 'ME-OIL-001', WorkCode: 'A001', AssetCode: 'MA-THIET-BI-DANG-CO', ScheduleName: 'Thay dầu máy',
    MaintenanceCategory: 'PERIODIC', IntervalType: 'CALENDAR', IntervalDays: '', IntervalMonths: 3, IntervalYears: '',
    IntervalHours: '', Instructions: '',
  }]), 'Maintenance');
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([
    { Note: 'AssetCode phải có trên tàu, không phải nhóm. ScheduleCode duy nhất; WorkCode là mã công việc nguồn.' },
    { Note: 'PERIODIC: chọn CALENDAR và đúng một IntervalDays/Months/Years; hoặc RUNNING_HOURS và IntervalHours.' },
    { Note: 'DRY_DOCK, ON_DEMAND, VOYAGE: không cần chu kỳ. Không nhập lịch sử thực hiện hoặc hạn tiếp theo; hệ thống tự tính lịch.' },
    { Note: 'Import cấu hình, AutoGenerate=false. Kiểm tra/gán người phụ trách, checklist trước khi bật sinh việc.' },
  ]), 'Huong_dan');
  XLSX.writeFile(book, 'Mau_import_cong_viec_bao_tri.xlsx');
}

export function ImportMaintenanceModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => Promise<void> }) {
  const [rows, setRows] = useState<ImportMaintenanceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [validated, setValidated] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [filename, setFilename] = useState('');
  const showError = (error: any) => {
    const response = error.response?.data;
    setErrors(Array.isArray(response?.errors) ? response.errors.flatMap((row: { row: number; errors: string[] }) =>
      row.errors.map(message => `Dòng ${row.row}: ${message}`)) : response?.errors ? Object.values(response.errors).flat().map(String) : [response?.error || error.message || 'Không thể import công việc.']);
  };
  const selectFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setValidated(false); setErrors([]); setRows([]); setFilename(file.name);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('File vượt quá 10 MB.');
      const parsed = parseMaintenanceWorkbook(XLSX.read(await file.arrayBuffer(), { type: 'array' }));
      setRows(parsed);
      await maintenanceScheduleService.importExcel(parsed, true);
      setValidated(true);
    } catch (error) { showError(error); } finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true); setErrors([]);
    try {
      const result = await maintenanceScheduleService.importExcel(rows, false);
      toast.success(`Đã nhập ${result.imported} cấu hình công việc bảo trì.`);
      await onSuccess(); onClose();
    } catch (error) { setValidated(false); showError(error); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
    <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900">Import công việc bảo trì</h2>
        <button disabled={busy} onClick={onClose} aria-label="Đóng" className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
      </div>
      <div className="space-y-4 overflow-y-auto p-5 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label className={`inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-2 ${busy ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}>
            <Upload size={16} /> Chọn file Excel
            <input disabled={busy} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { void selectFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <button disabled={busy} onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-2 hover:bg-slate-50"><Download size={16} /> Tải mẫu</button>
          <span className="text-slate-500">{filename}</span>
        </div>
        <p className="text-slate-500">Nhập cấu hình gắn với thiết bị đã có. Sau khi nhập, rà soát người phụ trách và checklist trước khi bật tự sinh công việc.</p>
        {busy && <p className="text-blue-600">Đang xử lý…</p>}
        {errors.length > 0 && <div role="alert" className="max-h-48 overflow-auto rounded border border-red-200 bg-red-50 p-3 text-red-600"><p className="font-medium">Chưa nhập dòng nào. Cần sửa các lỗi sau:</p>{errors.map((error, i) => <p key={i}>{error}</p>)}</div>}
        {validated && <p className="text-green-700">Đã kiểm tra {rows.length} công việc, thuộc {new Set(rows.map(row => row.assetCode)).size} thiết bị.</p>}
        {rows.length > 0 && <div className="overflow-auto rounded border border-slate-200">
          <table className="w-full text-xs"><thead className="bg-blue-50 text-slate-600"><tr>{['Dòng', 'Mã công việc', 'Mã thiết bị', 'Tên công việc', 'Loại bảo trì', 'Chu kỳ'].map(h => <th key={h} className="whitespace-nowrap px-3 py-2 text-left">{h}</th>)}</tr></thead>
            <tbody>{rows.map((row, i) => <tr key={i} className="border-t border-slate-100"><td className="px-3 py-2">{row.rowNumber}</td><td className="px-3 py-2">{row.workCode || row.scheduleCode}</td><td className="px-3 py-2">{row.assetCode}</td><td className="min-w-64 px-3 py-2">{row.scheduleName}</td><td className="whitespace-nowrap px-3 py-2">{maintenanceCategoryLabel(row.maintenanceCategory, (_key: string) => 'Định kỳ')}</td><td className="whitespace-nowrap px-3 py-2">{row.intervalMonths ? `${row.intervalMonths} tháng` : row.intervalYears ? `${row.intervalYears} năm` : row.intervalHours ? `${row.intervalHours} giờ` : row.intervalDays ? `${row.intervalDays} ngày` : '—'}</td></tr>)}</tbody>
          </table>
        </div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
        <button disabled={busy} onClick={onClose} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm">Hủy</button>
        <button disabled={busy || !validated} onClick={submit} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Import {rows.length > 0 ? `(${rows.length})` : ''}</button>
      </div>
    </div>
  </div>;
}
