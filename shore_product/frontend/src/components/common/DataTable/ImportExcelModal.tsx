import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { CheckCircle2, Download, FileSpreadsheet, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '../Modal';
import { Button } from '../Button';
import { FormAlert } from '../Form';
import { fieldClass } from '../Input';

/*
  Hộp import Excel dùng chung cho các danh mục.

  Trang chỉ khai các cột của tệp và cách lưu MỘT dòng (thường là gọi API "thêm mới"):
    <ImportExcelModal
      fields={[{ key: 'countryCode', header: 'Mã quốc gia', required: true, example: 'VN' }, ...]}
      importRow={row => countryApi.create({ countryCode: row.countryCode, ... })}
    />
  Hộp lo phần còn lại: tải tệp mẫu, đọc tệp, kiểm tra cột bắt buộc, xem trước, lưu lần lượt
  từng dòng và báo dòng nào lỗi vì sao. Dòng lỗi không chặn các dòng khác.
*/

export interface ImportField {
  key: string;
  /** Tên cột trong tệp Excel (cũng là tên cột của tệp mẫu). */
  header: string;
  required?: boolean;
  example?: string;
}

type Row = Record<string, string>;
type Result = { row: number; ok: boolean; message?: string };

interface ImportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  fields: ImportField[];
  /** Tên tệp mẫu, không đuôi. */
  templateName: string;
  importRow: (row: Row) => Promise<unknown>;
  /** Gọi sau khi import xong (để tải lại bảng). */
  onDone: () => void;
  /** Ghi chú thêm dưới tiêu đề, ví dụ "Mã đã tồn tại sẽ bị bỏ qua". */
  note?: string;
}

const errorText = (err: unknown) =>
  (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.message
  ?? (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  ?? (err instanceof Error ? err.message : 'Lỗi không xác định');

export const ImportExcelModal: React.FC<ImportExcelModalProps> = ({
  isOpen, onClose, title, fields, templateName, importRow, onDone, note,
}) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileError, setFileError] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Result[] | null>(null);

  const reset = () => { setRows([]); setFileError(''); setResults(null); setProgress(0); };
  const close = () => { if (running) return; reset(); onClose(); };

  const downloadTemplate = () => {
    const sheet = XLSX.utils.aoa_to_sheet([fields.map(f => f.header), fields.map(f => f.example ?? '')]);
    sheet['!cols'] = fields.map(f => ({ wch: Math.max(14, f.header.length + 4) }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Mẫu');
    XLSX.writeFile(book, `${templateName}.xlsx`);
  };

  const readFile = async (file?: File) => {
    reset();
    if (!file) return;
    try {
      const book = XLSX.read(await file.arrayBuffer());
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: '' });
      const missing = fields.filter(f => f.required && !(raw[0] && f.header in raw[0]));
      if (raw.length === 0) { setFileError('Tệp không có dòng dữ liệu nào.'); return; }
      if (missing.length) { setFileError(`Tệp thiếu cột: ${missing.map(f => `"${f.header}"`).join(', ')}. Hãy dùng tệp mẫu.`); return; }
      setRows(raw
        .map(r => Object.fromEntries(fields.map(f => [f.key, String(r[f.header] ?? '').trim()])))
        .filter(r => Object.values(r).some(v => v !== '')));
    } catch {
      setFileError('Không đọc được tệp. Hãy chọn tệp Excel (.xlsx, .xls).');
    }
  };

  const invalidOf = (r: Row) => fields.filter(f => f.required && !r[f.key]).map(f => f.header);
  const validRows = rows.filter(r => invalidOf(r).length === 0);

  const run = async () => {
    setRunning(true);
    const out: Result[] = [];
    for (let i = 0; i < rows.length; i++) {
      const missing = invalidOf(rows[i]);
      if (missing.length) {
        out.push({ row: i + 2, ok: false, message: `Thiếu ${missing.join(', ')}` });
      } else {
        try { await importRow(rows[i]); out.push({ row: i + 2, ok: true }); }
        catch (err) { out.push({ row: i + 2, ok: false, message: errorText(err) }); }
      }
      setProgress(i + 1);
    }
    setRunning(false);
    setResults(out);
    const ok = out.filter(r => r.ok).length;
    if (ok > 0) { toast.success(`Đã import ${ok} dòng`, { description: out.length > ok ? `${out.length - ok} dòng lỗi` : undefined }); onDone(); }
    else toast.error('Không import được dòng nào');
  };

  const failed = results?.filter(r => !r.ok) ?? [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      busy={running}
      closeOnBackdrop={false}
      size="lg"
      icon={<FileSpreadsheet />}
      title={title}
      subtitle={note}
      footer={results ? (
        <Button variant="primary" onClick={close}>Đóng</Button>
      ) : (
        <>
          <Button onClick={close} disabled={running}>Hủy</Button>
          <Button variant="primary" loading={running} disabled={validRows.length === 0} onClick={run}>
            {running ? `Đang import ${progress}/${rows.length}...` : `Import ${validRows.length} dòng`}
          </Button>
        </>
      )}
    >
      {results ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 text-sm">
            <span className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Thành công: <strong>{results.length - failed.length}</strong></span>
            <span className="flex items-center gap-1.5 text-red-700"><XCircle className="h-4 w-4" /> Lỗi: <strong>{failed.length}</strong></span>
          </div>
          {failed.length > 0 && (
            <div className="max-h-72 overflow-auto rounded-md border border-grid">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 bg-canvas">
                  <tr>
                    <th className="w-20 border-b border-r border-grid px-2 py-2 font-semibold">Dòng</th>
                    <th className="border-b border-grid px-2 py-2 text-left font-semibold">Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {failed.map(r => (
                    <tr key={r.row}>
                      <td className="border-b border-r border-grid px-2 py-1.5 text-right tabular-nums">{r.row}</td>
                      <td className="border-b border-grid px-2 py-1.5 text-red-700">{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={<Download className="h-4 w-4" />} onClick={downloadTemplate}>Tải tệp mẫu</Button>
            <input type="file" accept=".xlsx,.xls" disabled={running} className={`${fieldClass} max-w-md py-1.5`}
              onChange={e => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          <p className="text-[13px] text-ink-muted">
            Cột bắt buộc: {fields.filter(f => f.required).map(f => f.header).join(', ')}. Dòng đầu tiên của tệp là tên cột.
          </p>
          <FormAlert>{fileError}</FormAlert>
          {rows.length > 0 && (
            <>
              <p className="text-[13px] text-ink">
                Đọc được <strong>{rows.length}</strong> dòng, <strong>{validRows.length}</strong> dòng hợp lệ
                {rows.length > validRows.length && <span className="text-red-700"> ({rows.length - validRows.length} dòng thiếu dữ liệu bắt buộc, sẽ bỏ qua)</span>}.
              </p>
              <div className="max-h-80 overflow-auto rounded-md border border-grid">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 bg-canvas">
                    <tr>
                      <th className="w-12 border-b border-r border-grid px-2 py-2 font-semibold">Dòng</th>
                      {fields.map(f => (
                        <th key={f.key} className="border-b border-r border-grid px-2 py-2 font-semibold last:border-r-0">
                          {f.header}{f.required && <span className="text-danger"> *</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const bad = invalidOf(r).length > 0;
                      return (
                        <tr key={i} className={bad ? 'bg-danger-soft' : ''}>
                          <td className="border-b border-r border-grid px-2 py-1.5 text-right tabular-nums text-ink-muted">{i + 2}</td>
                          {fields.map(f => (
                            <td key={f.key} className="border-b border-r border-grid px-2 py-1.5 last:border-r-0">
                              {r[f.key] || (f.required ? <span className="text-red-700">(thiếu)</span> : '')}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
};
