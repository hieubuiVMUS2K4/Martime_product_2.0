import type { Borders, Cell, Fill, Font, Worksheet } from 'exceljs';
import { STATUS_LABEL, type BioData, type BioDocRow, type BioField, type DocStatus } from './bioData';

/*
  Xuất hồ sơ ra Excel, cùng nội dung và thứ tự với bản PDF (bioDataPdf.ts).

  Lưới 8 cột. Phần thông tin: 4 trường mỗi hàng, mỗi trường chiếm 2 cột, nhãn song ngữ ở
  hàng trên, giá trị ở hàng dưới. Phần bảng (giấy tờ, chứng chỉ, kỳ phục vụ): 8 cột như
  bảng thường. Thiết lập in sẵn: A4 dọc, vừa 1 trang ngang.
*/

const NAVY = 'FF0B2545';
const ACCENT = 'FF1B4C7E';
const SOFT = 'FFEEF2F7';
const HEAD = 'FFDCE9F8';
const GRID = 'FF9FB0C0';
const MUTED = 'FF6B7C8F';

const STATUS_FILL: Record<DocStatus, { bg: string; fg: string }> = {
  valid: { bg: 'FFE7F6EE', fg: 'FF137B3B' },
  expiring: { bg: 'FFFFF2E0', fg: 'FFB45309' },
  expired: { bg: 'FFFDEAEA', fg: 'FFB42318' },
  none: { bg: 'FFEEF2F7', fg: 'FF475569' },
};

const fill = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin' as const, color: { argb: GRID } };
const box: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const font = (extra: Partial<Font> = {}): Partial<Font> => ({ name: 'Arial', size: 10, color: { argb: 'FF14202E' }, ...extra });

/** Cột: A STT · B tên · C số · D nơi cấp · E ngày cấp · F hết hạn · G tình trạng · H ghi chú. */
const WIDTHS = [6, 30, 17, 18, 12, 12, 14, 20];
/** Cặp cột cho lưới 4 trường/hàng. */
const PAIRS: [number, number][] = [[1, 2], [3, 4], [5, 6], [7, 8]];

function style(cell: Cell, opts: { font?: Partial<Font>; fill?: string; align?: 'left' | 'center' | 'right'; border?: boolean; wrap?: boolean } = {}) {
  cell.font = font(opts.font);
  if (opts.fill) cell.fill = fill(opts.fill);
  cell.alignment = { vertical: 'middle', horizontal: opts.align ?? 'left', wrapText: opts.wrap ?? true };
  if (opts.border) cell.border = box;
}

function merge(ws: Worksheet, row: number, c1: number, c2: number, value: string, opts: Parameters<typeof style>[1] = {}) {
  if (c2 > c1) ws.mergeCells(row, c1, row, c2);
  const cell = ws.getCell(row, c1);
  cell.value = value;
  style(cell, opts);
  // Ô gộp chỉ giữ khung của ô đầu; kẻ khung cho cả dải để viền liền.
  if (opts.border) for (let c = c1; c <= c2; c++) ws.getCell(row, c).border = box;
  return cell;
}

export async function exportBioDataExcel(d: BioData) {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = d.preparedBy;
  wb.created = new Date();
  const ws = wb.addWorksheet('Hồ sơ thuyền viên', {
    pageSetup: {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
    views: [{ showGridLines: false }],
  });
  ws.columns = WIDTHS.map(width => ({ width }));
  ws.headerFooter.oddFooter = `&L${d.fullName} — ${d.crewCode}&RTrang &P / &N`;

  let r = 1;

  /* ── Đầu trang: tiêu đề bên trái, ảnh bên phải ── */
  merge(ws, r, 1, 6, 'HỒ SƠ THUYỀN VIÊN', { font: { size: 18, bold: true, color: { argb: NAVY } } });
  ws.getRow(r).height = 28;
  merge(ws, ++r, 1, 6, 'SEAFARER BIO-DATA', { font: { size: 10, bold: true, color: { argb: ACCENT } } });
  merge(ws, ++r, 1, 6, d.fullName, { font: { size: 15, bold: true } });
  ws.getRow(r).height = 24;
  merge(ws, ++r, 1, 6, [d.rank, d.vessel ? `Tàu: ${d.vessel}` : 'Hiện ở bờ'].filter(Boolean).join('   ·   '),
    { font: { size: 11, bold: true, color: { argb: ACCENT } } });
  merge(ws, ++r, 1, 6, `Mã thuyền viên: ${d.crewCode}     Ngày lập: ${d.preparedAt}     Người lập: ${d.preparedBy}`,
    { font: { size: 9, color: { argb: MUTED } } });
  for (let i = 1; i <= r; i++) for (let c = 1; c <= 6; c++) ws.getCell(i, c).border = i === r ? { bottom: { style: 'medium', color: { argb: NAVY } } } : {};

  ws.mergeCells(1, 7, r, 8);
  const photoCell = ws.getCell(1, 7);
  photoCell.border = box;
  if (d.photoDataUrl) {
    const ext = d.photoDataUrl.startsWith('data:image/png') ? 'png' : 'jpeg';
    const id = wb.addImage({ base64: d.photoDataUrl, extension: ext });
    ws.addImage(id, { tl: { col: 6.25, row: 0.15 }, ext: { width: 105, height: 135 } });
  } else {
    photoCell.value = 'Ảnh 3×4';
    style(photoCell, { font: { color: { argb: MUTED }, size: 9 }, align: 'center' });
  }
  r += 2;

  const sectionTitle = (no: number, vi: string, en: string) => {
    merge(ws, r, 1, 8, `${no}.  ${vi.toUpperCase()}   /   ${en}`, {
      font: { bold: true, size: 11, color: { argb: NAVY } }, fill: SOFT,
    });
    ws.getCell(r, 1).border = { left: { style: 'thick', color: { argb: NAVY } } };
    ws.getRow(r).height = 20;
    r++;
  };

  /** Lưới trường: hàng nhãn (nền nhạt) + hàng giá trị (chữ đậm), 4 trường mỗi hàng. */
  const fieldGrid = (fields: BioField[]) => {
    for (let i = 0; i < fields.length; i += 4) {
      const chunk = fields.slice(i, i + 4);
      chunk.forEach((fld, j) => {
        const [c1, c2] = PAIRS[j];
        merge(ws, r, c1, c2, `${fld.vi} / ${fld.en}`, { font: { size: 8, color: { argb: MUTED } }, fill: 'FFF7F9FA', border: true });
        merge(ws, r + 1, c1, c2, fld.value || '—', { font: { size: 10, bold: !!fld.value, color: { argb: fld.value ? 'FF14202E' : 'FFA3B1BC' } }, border: true });
      });
      ws.getRow(r).height = 15;
      ws.getRow(r + 1).height = 20;
      r += 2;
    }
  };

  /** Một trường trải cả hàng (địa chỉ, ghi chú). */
  const wideField = (fld: BioField) => {
    merge(ws, r, 1, 8, `${fld.vi} / ${fld.en}`, { font: { size: 8, color: { argb: MUTED } }, fill: 'FFF7F9FA', border: true });
    merge(ws, r + 1, 1, 8, fld.value || '—', { font: { size: 10, bold: !!fld.value }, border: true });
    ws.getRow(r + 1).height = 20;
    r += 2;
  };

  const tableHead = (heads: [string, string][]) => {
    heads.forEach(([vi, en], i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = { richText: [
        { text: vi, font: font({ bold: true, size: 9, color: { argb: NAVY } }) },
        { text: `\n${en}`, font: font({ size: 7.5, color: { argb: MUTED } }) },
      ] };
      style(cell, { fill: HEAD, align: 'center', border: true });
      cell.font = undefined as unknown as Font; // richText giữ font riêng từng đoạn
    });
    ws.getRow(r).height = 28;
    r++;
  };

  const emptyRow = (text: string) => {
    merge(ws, r, 1, 8, text, { font: { italic: true, color: { argb: 'FF94A3B8' } }, align: 'center', border: true });
    ws.getRow(r).height = 20;
    r++;
  };

  const docTable = (rows: BioDocRow[], nameVi: string, nameEn: string) => {
    tableHead([['STT', 'No.'], [nameVi, nameEn], ['Số', 'Number'], ['Nơi cấp', 'Issued by'],
      ['Ngày cấp', 'Issued'], ['Hết hạn', 'Expiry'], ['Tình trạng', 'Status'], ['Ghi chú', 'Remark']]);
    if (rows.length === 0) { emptyRow('Chưa có dữ liệu / No records'); return; }
    rows.forEach((row, i) => {
      const values = [i + 1, row.name, row.number, row.issuedBy, row.issueDate, row.expiryDate, STATUS_LABEL[row.status].vi, row.remark];
      values.forEach((v, c) => {
        const cell = ws.getCell(r, c + 1);
        cell.value = v;
        style(cell, { border: true, align: c === 0 ? 'right' : c >= 4 && c <= 6 ? 'center' : 'left' });
      });
      const st = STATUS_FILL[row.status];
      const stCell = ws.getCell(r, 7);
      stCell.fill = fill(st.bg);
      stCell.font = font({ bold: true, size: 9, color: { argb: st.fg } });
      ws.getRow(r).height = 20;
      r++;
    });
  };

  const gap = () => { r++; };

  /* ── Nội dung, cùng thứ tự với bản PDF ── */
  sectionTitle(1, 'Thông tin cá nhân', 'Personal particulars');
  fieldGrid(d.personal.slice(0, 8));
  wideField(d.personal[8]);
  gap();
  sectionTitle(2, 'Thông tin công việc', 'Employment');
  fieldGrid(d.employment);
  gap();
  sectionTitle(3, 'Thể chất', 'Physical details');
  fieldGrid(d.physical);
  gap();
  sectionTitle(4, 'Thân nhân / liên hệ khẩn cấp', 'Next of kin');
  fieldGrid(d.kin);
  gap();
  sectionTitle(5, 'Học vấn', 'Education');
  fieldGrid(d.education);
  gap();
  sectionTitle(6, 'Giấy tờ định danh', 'Identity & travel documents');
  docTable(d.identityDocs, 'Loại giấy tờ', 'Document');
  gap();
  sectionTitle(7, 'Chứng chỉ chuyên môn', 'Certificates');
  docTable(d.certificates, 'Tên chứng chỉ', 'Certificate');
  gap();
  sectionTitle(8, 'Giấy tờ sức khỏe', 'Medical documents');
  docTable(d.healthDocs, 'Loại giấy tờ', 'Document');
  gap();
  sectionTitle(9, 'Kinh nghiệm đi biển', 'Sea service record');
  tableHead([['STT', 'No.'], ['Tàu', 'Vessel'], ['Cờ · Loại tàu', 'Flag · Type'], ['Chức danh', 'Rank'],
    ['Lên tàu', 'Sign on'], ['Xuống tàu', 'Sign off'], ['Thời gian', 'Duration'], ['Ghi chú', 'Remark']]);
  if (d.seaService.length === 0) emptyRow('Chưa có kỳ phục vụ nào / No sea service records');
  d.seaService.forEach((s, i) => {
    [i + 1, s.imo ? `${s.vessel}\nIMO ${s.imo}` : s.vessel, s.flagType, s.rank, s.signOn, s.signOff, s.duration, s.remark]
      .forEach((v, c) => {
        const cell = ws.getCell(r, c + 1);
        cell.value = v;
        style(cell, { border: true, align: c === 0 ? 'right' : c === 6 ? 'center' : 'left', font: c === 1 ? { bold: true } : {} });
      });
    ws.getRow(r).height = s.imo ? 28 : 20;
    r++;
  });
  gap();
  sectionTitle(10, 'Ghi chú', 'Remarks');
  merge(ws, r, 1, 8, d.notes || '—', { border: true, align: 'left' });
  ws.getRow(r).height = Math.max(30, 15 * (d.notes.split('\n').length + 1));
  r += 2;

  /* ── Ký xác nhận ── */
  merge(ws, r, 1, 3, 'Người lập / Prepared by', { font: { bold: true }, align: 'center' });
  merge(ws, r, 5, 8, 'Thuyền viên xác nhận / Seafarer\'s signature', { font: { bold: true }, align: 'center' });
  r += 4;
  const signLine = { top: { style: 'dotted' as const, color: { argb: MUTED } } };
  merge(ws, r, 1, 3, d.preparedBy, { font: { bold: true }, align: 'center' });
  merge(ws, r, 5, 8, d.fullName, { font: { bold: true }, align: 'center' });
  for (let c = 1; c <= 3; c++) ws.getCell(r, c).border = signLine;
  for (let c = 5; c <= 8; c++) ws.getCell(r, c).border = signLine;

  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${d.fileName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
