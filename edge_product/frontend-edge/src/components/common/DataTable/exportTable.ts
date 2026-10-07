import * as XLSX from 'xlsx';

export interface ExportColumn<T> {
  header: string;
  value: (item: T) => string | number | boolean | null | undefined;
  numeric?: boolean;
}

export interface ExportOptions<T> {
  /** Tên tệp không đuôi, ví dụ "danh-muc-cang". */
  fileName: string;
  /** Tiêu đề in ở dòng đầu tệp Excel, ví dụ "DANH MỤC CẢNG". */
  title?: string;
  columns: ExportColumn<T>[];
  rows: T[];
}

const stamp = () => new Date().toISOString().slice(0, 10);

const toMatrix = <T,>(columns: ExportColumn<T>[], rows: T[]) => [
  ['STT', ...columns.map(c => c.header)],
  ...rows.map((row, i) => [i + 1, ...columns.map(c => c.value(row) ?? '')]),
];

/** Xuất Excel: dòng tiêu đề, ngày xuất, rồi bảng; cột rộng theo nội dung. */
export function exportToExcel<T>({ fileName, title, columns, rows }: ExportOptions<T>) {
  const head = title ? [[title], [`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`], []] : [];
  const matrix = toMatrix(columns, rows);
  const sheet = XLSX.utils.aoa_to_sheet([...head, ...matrix]);
  sheet['!cols'] = matrix[0].map((_, col) => ({
    wch: Math.min(60, Math.max(6, ...matrix.map(r => String(r[col] ?? '').length + 2))),
  }));
  if (title) sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: matrix[0].length - 1 } }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Dữ liệu');
  XLSX.writeFile(book, `${fileName}-${stamp()}.xlsx`);
}

/** Xuất CSV có BOM để Excel mở đúng tiếng Việt. */
export function exportToCsv<T>({ fileName, columns, rows }: ExportOptions<T>) {
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = toMatrix(columns, rows).map(r => r.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}-${stamp()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
