import type { Borders, Cell, Font, Worksheet, Workbook } from 'exceljs';
import { STATUS_LABEL, type BioData, type BioDocRow, type BioField, type DocStatus } from './bioDataTypes';

/*
  Xuất hồ sơ thuyền viên ra Excel, cùng nội dung và thứ tự với bản PDF.

  Lưới 8 cột (A–H). Phần thông tin: mỗi hàng 2 cặp "nhãn | giá trị" (A:B | C:D | E:F | G:H).
  Phần bảng: 8 cột thường. Hàng tự cao theo độ dài chữ (Excel không tự giãn hàng có ô gộp),
  ngày ghi bằng giá trị ngày thật định dạng dd/mm/yyyy. In sẵn: A4 dọc, vừa 1 trang ngang.
*/

const NAVY = 'FF0B2545';
const ACCENT = 'FF1B4C7E';
const GOLD = 'FFE0B53A';
const SOFT = 'FFEEF2F7';
const HEAD = 'FFDCE9F8';
const LABEL = 'FFF4F7FA';
const ZEBRA = 'FFFAFBFD';
const GRID = 'FFC5D0DB';
const TEXT = 'FF14202E';
const MUTED = 'FF64748B';
const FAINT = 'FFA3B1BC';

const STATUS_STYLE: Record<DocStatus, { bg: string; fg: string }> = {
  valid: { bg: 'FFE7F6EE', fg: 'FF137B3B' },
  expiring: { bg: 'FFFFF2E0', fg: 'FFB45309' },
  expired: { bg: 'FFFDEAEA', fg: 'FFB42318' },
  none: { bg: 'FFEEF2F7', fg: 'FF475569' },
};

/** Độ rộng cột (đơn vị ký tự): A STT · B tên · C số · D nơi cấp · E ngày cấp · F hết hạn · G tình trạng · H ghi chú. */
const WIDTHS = [5, 30, 20, 20, 13, 13, 14, 24];
const FONT_NAME = 'Arial';

const thin = { style: 'thin' as const, color: { argb: GRID } };
const box: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const font = (extra: Partial<Font> = {}): Partial<Font> => ({ name: FONT_NAME, size: 10, color: { argb: TEXT }, ...extra });

/** Ước số dòng khi chữ xuống dòng trong một dải cột, để đặt chiều cao hàng đủ chỗ. */
const linesFor = (text: string, c1: number, c2: number, sizeFactor = 1) => {
  const width = WIDTHS.slice(c1 - 1, c2).reduce((a, b) => a + b, 0) - 1;
  return String(text ?? '').split('\n').reduce((n, part) => n + Math.max(1, Math.ceil((part.length * 1.08 * sizeFactor) / width)), 0);
};

/** "dd/mm/yyyy" → ngày Excel (theo UTC để không lệch một ngày); chữ khác giữ nguyên. */
const asDate = (s: string): Date | string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? '');
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : s;
};

class Sheet {
  r = 1;
  ws: Worksheet;
  constructor(ws: Worksheet) { this.ws = ws; }

  cell(row: number, col: number) { return this.ws.getCell(row, col); }

  /** Gộp dải ô trên một hàng, ghi giá trị, kẻ khung cả dải (ô gộp chỉ giữ khung ô đầu). */
  put(row: number, c1: number, c2: number, value: Cell['value'], opts: {
    font?: Partial<Font>; fill?: string; align?: 'left' | 'center' | 'right'; border?: boolean; numFmt?: string; indent?: number;
  } = {}) {
    if (c2 > c1) this.ws.mergeCells(row, c1, row, c2);
    const cell = this.cell(row, c1);
    cell.value = value;
    if (!(value && typeof value === 'object' && 'richText' in value)) cell.font = font(opts.font);
    cell.alignment = { vertical: 'middle', horizontal: opts.align ?? 'left', wrapText: true, indent: opts.indent ?? (opts.align ? 0 : 1) };
    if (opts.numFmt) cell.numFmt = opts.numFmt;
    for (let c = c1; c <= c2; c++) {
      const each = this.cell(row, c);
      if (opts.fill) each.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
      if (opts.border) each.border = box;
    }
    return cell;
  }

  height(row: number, pt: number) { this.ws.getRow(row).height = pt; }
  gap(pt = 8) { this.height(this.r, pt); this.r++; }

  /*
    Ngắt trang chủ động: Excel tự ngắt theo chiều cao giấy nên hay để tiêu đề một nhóm trơ
    ở cuối trang còn bảng sang trang sau. Cộng chiều cao các hàng đã viết từ lần ngắt trước;
    nếu chỗ còn lại không đủ `need` điểm thì ngắt trước nhóm.
    PAGE_H ≈ chiều cao in được của A4 sau khi co cho vừa bề ngang (≈ 0,75) — ước lượng, để dư.
  */
  static PAGE_H = 980;
  lastBreak = 1;
  keepTogether(need: number) {
    let used = 0;
    for (let i = this.lastBreak; i < this.r; i++) used += this.ws.getRow(i).height ?? 18;
    if (used + need > Sheet.PAGE_H && this.r - 1 > this.lastBreak) {
      this.ws.getRow(this.r - 1).addPageBreak();
      this.lastBreak = this.r;
    }
  }
}

const rich = (parts: [string, Partial<Font>][]) => ({ richText: parts.map(([text, f]) => ({ text, font: font(f) })) });

/** Dựng workbook hồ sơ (tách khỏi phần tải về để kiểm tra được ngoài trình duyệt). */
export async function buildBioDataWorkbook(d: BioData): Promise<Workbook> {
  // exceljs là gói CommonJS: tùy môi trường, lớp Workbook nằm ở gốc hoặc trong `default`.
  const mod = await import('exceljs') as unknown as { Workbook?: new () => Workbook; default?: { Workbook: new () => Workbook } };
  const WorkbookCtor = mod.Workbook ?? mod.default!.Workbook;
  const wb: Workbook = new WorkbookCtor();
  wb.creator = d.preparedBy;
  wb.created = new Date();
  const ws = wb.addWorksheet('Hồ sơ thuyền viên', {
    pageSetup: {
      paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.55, header: 0.2, footer: 0.25 },
    },
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  });
  ws.columns = WIDTHS.map(width => ({ width }));
  ws.headerFooter.oddFooter = `&L&8${d.fullName} · ${d.crewCode}&R&8Trang &P / &N`;
  const s = new Sheet(ws);

  /* ── Băng tiêu đề ── */
  s.put(1, 1, 5, 'HỒ SƠ THUYỀN VIÊN', { font: { size: 18, bold: true, color: { argb: 'FFFFFFFF' } }, fill: NAVY });
  s.put(1, 6, 8, 'SEAFARER BIO-DATA', { font: { size: 10, bold: true, color: { argb: 'FFA8BCD4' } }, fill: NAVY, align: 'right' });
  ws.getCell(1, 8).alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
  s.height(1, 36);
  s.put(2, 1, 8, '', { fill: GOLD });
  s.height(2, 3);

  /* ── Khối nhận diện: ảnh bên trái (A:B), thông tin bên phải (C:H) ── */
  const top = 4;
  for (let row = top; row <= top + 5; row++) for (let c = 1; c <= 8; c++) {
    ws.getCell(row, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SOFT } };
  }
  ws.mergeCells(top, 1, top + 5, 2);
  [24, 20, 18, 8, 15, 20].forEach((h, i) => s.height(top + i, h));
  if (d.photoDataUrl) {
    const ext = d.photoDataUrl.startsWith('data:image/png') ? 'png' : 'jpeg';
    const id = wb.addImage({ base64: d.photoDataUrl, extension: ext });
    // Ảnh 3×4 khoảng 105×140 px, canh giữa khối A:B (≈ 35 ký tự ≈ 250 px), cao vừa 6 hàng (≈ 105 pt).
    ws.addImage(id, { tl: { col: 0.62, row: top - 1 + 0.08 }, ext: { width: 105, height: 136 } });
  } else {
    s.put(top, 1, 2, 'Ảnh 3×4', { font: { color: { argb: FAINT } }, align: 'center' });
  }
  s.put(top, 3, 8, d.fullName, { font: { size: 16, bold: true } });
  s.put(top + 1, 3, 8, d.rank || '—', { font: { size: 12, bold: true, color: { argb: ACCENT } } });
  s.put(top + 2, 3, 8, d.vessel ? `Tàu hiện tại: ${d.vessel}` : 'Hiện ở bờ', { font: { size: 10, color: { argb: MUTED } } });
  const facts: [string, string, number, number][] = [
    ['Mã thuyền viên', d.crewCode, 3, 3],
    ['Ngày sinh', d.personal.find(f => f.en === 'Date of birth')?.value ?? '', 4, 5],
    ['Quốc tịch', d.personal.find(f => f.en === 'Nationality')?.value ?? '', 6, 6],
    ['Hết hạn hợp đồng', d.employment.find(f => f.en === 'Contract end')?.value ?? '', 7, 8],
  ];
  facts.forEach(([k, v, c1, c2]) => {
    s.put(top + 4, c1, c2, k, { font: { size: 8.5, color: { argb: MUTED } } });
    s.put(top + 5, c1, c2, v || '—', { font: { size: 10.5, bold: true } });
  });
  s.put(top + 6, 1, 8, `Ngày lập: ${d.preparedAt}     ·     Người lập: ${d.preparedBy || '—'}`,
    { font: { size: 8.5, italic: true, color: { argb: MUTED } }, align: 'right' });
  s.r = top + 8;

  /* ── Khối dựng ── */
  /** Tiêu đề nhóm; `need` = chiều cao tối thiểu phải đi cùng tiêu đề (tiêu đề bảng + vài dòng đầu). */
  const section = (no: number, vi: string, en: string, need = 110) => {
    s.keepTogether(need);
    s.put(s.r, 1, 8, rich([[`${no}   `, { bold: true, size: 11, color: { argb: GOLD } }], [vi.toUpperCase(), { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }], [`    ${en}`, { size: 9, color: { argb: 'FFA8BCD4' } }]]), { fill: NAVY });
    s.height(s.r, 22);
    s.r++;
  };

  const labelText = (f: BioField) => rich([[f.vi, { size: 9, bold: true, color: { argb: MUTED } }], [`\n${f.en}`, { size: 7.5, color: { argb: FAINT } }]]);

  /** 2 cặp nhãn | giá trị mỗi hàng. */
  const fields = (list: BioField[]) => {
    for (let i = 0; i < list.length; i += 2) {
      const pair = [list[i], list[i + 1]];
      let lines = 2;
      pair.forEach((f, j) => {
        const [lc1, lc2, vc1, vc2] = j === 0 ? [1, 2, 3, 4] : [5, 6, 7, 8];
        if (!f) { s.put(s.r, lc1, lc2, '', { fill: LABEL, border: true }); s.put(s.r, vc1, vc2, '', { border: true }); return; }
        s.put(s.r, lc1, lc2, labelText(f), { fill: LABEL, border: true });
        s.put(s.r, vc1, vc2, f.value || '—', { font: { size: 10.5, bold: !!f.value, color: { argb: f.value ? TEXT : FAINT } }, border: true });
        lines = Math.max(lines, linesFor(f.value, vc1, vc2, 1.1));
      });
      s.height(s.r, Math.max(28, lines * 14 + 4));
      s.r++;
    }
  };

  /** Một trường trải cả hàng (địa chỉ). */
  const wideField = (f: BioField) => {
    s.put(s.r, 1, 2, labelText(f), { fill: LABEL, border: true });
    s.put(s.r, 3, 8, f.value || '—', { font: { size: 10.5, bold: !!f.value, color: { argb: f.value ? TEXT : FAINT } }, border: true });
    s.height(s.r, Math.max(28, linesFor(f.value, 3, 8, 1.1) * 14 + 4));
    s.r++;
  };

  const head = (cols: [string, string][]) => {
    cols.forEach(([vi, en], i) => {
      s.put(s.r, i + 1, i + 1, rich([[vi, { size: 9, bold: true, color: { argb: NAVY } }], [`\n${en}`, { size: 7.5, color: { argb: MUTED } }]]),
        { fill: HEAD, border: true, align: i === 1 ? 'left' : 'center', indent: i === 1 ? 1 : 0 });
    });
    s.height(s.r, 30);
    s.r++;
  };

  const empty = (text: string) => {
    s.put(s.r, 1, 8, text, { font: { italic: true, size: 9, color: { argb: FAINT } }, align: 'center', border: true });
    s.height(s.r, 22);
    s.r++;
  };

  /** Một dòng bảng: giá trị theo cột, căn lề, ngày thật, tô xen kẽ; hàng cao theo ô dài nhất. */
  const dataRow = (values: (string | number)[], i: number, opts: { centers?: number[]; dates?: number[]; bold?: number[]; status?: DocStatus } = {}) => {
    const fill = i % 2 ? ZEBRA : undefined;
    let lines = 1;
    values.forEach((v, c) => {
      const col = c + 1;
      const isDate = opts.dates?.includes(col);
      const val = isDate && typeof v === 'string' ? asDate(v) : v;
      s.put(s.r, col, col, val, {
        border: true, fill,
        align: col === 1 ? 'right' : opts.centers?.includes(col) || isDate ? 'center' : 'left',
        indent: col === 1 ? 1 : undefined,
        font: { size: 9.5, bold: opts.bold?.includes(col), color: { argb: col === 1 ? MUTED : TEXT } },
        numFmt: isDate && val instanceof Date ? 'dd/mm/yyyy' : undefined,
      });
      if (typeof v === 'string') lines = Math.max(lines, linesFor(v, col, col));
    });
    if (opts.status) {
      const st = STATUS_STYLE[opts.status];
      const cell = s.cell(s.r, 7);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: st.bg } };
      cell.font = font({ size: 9, bold: true, color: { argb: st.fg } });
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }
    s.height(s.r, Math.max(20, lines * 13 + 6));
    s.r++;
  };

  const docs = (rows: BioDocRow[], nameVi: string, nameEn: string) => {
    head([['STT', 'No.'], [nameVi, nameEn], ['Số', 'Number'], ['Nơi cấp', 'Issued by'], ['Ngày cấp', 'Issued'],
      ['Hết hạn', 'Expiry'], ['Tình trạng', 'Status'], ['Ghi chú', 'Remark']]);
    if (rows.length === 0) { empty('Chưa có dữ liệu  ·  No records'); return; }
    rows.forEach((row, i) => dataRow(
      [i + 1, row.name, row.number, row.issuedBy, row.issueDate, row.expiryDate, STATUS_LABEL[row.status].vi, row.remark],
      i, { dates: [5, 6], bold: [2], status: row.status },
    ));
  };

  /* ── Nội dung (cùng thứ tự với bản PDF) ── */
  section(1, 'Thông tin cá nhân', 'Personal particulars');
  fields(d.personal.filter(f => f.en !== 'Address'));
  d.personal.filter(f => f.en === 'Address').forEach(wideField);
  s.gap(10);
  section(2, 'Thông tin công việc', 'Employment');
  fields(d.employment);
  s.gap(10);
  section(3, 'Thể chất', 'Physical details');
  fields(d.physical);
  s.gap(10);
  section(4, 'Thân nhân / liên hệ khẩn cấp', 'Next of kin');
  fields(d.kin);
  s.gap(10);
  section(5, 'Học vấn', 'Education');
  fields(d.education);
  s.gap(10);
  section(6, 'Giấy tờ định danh', 'Identity & travel documents');
  docs(d.identityDocs, 'Loại giấy tờ', 'Document');
  s.gap(10);
  section(7, 'Chứng chỉ chuyên môn', 'Certificates');
  docs(d.certificates, 'Tên chứng chỉ', 'Certificate');
  s.gap(10);
  section(8, 'Giấy tờ sức khỏe', 'Medical documents');
  docs(d.healthDocs, 'Loại giấy tờ', 'Document');
  s.gap(10);
  section(9, 'Kinh nghiệm đi biển', 'Sea service record');
  head([['STT', 'No.'], ['Tàu', 'Vessel'], ['Cờ · Loại tàu', 'Flag · Type'], ['Chức danh', 'Rank'],
    ['Lên tàu', 'Sign on'], ['Xuống tàu', 'Sign off'], ['Thời gian', 'Duration'], ['Ghi chú', 'Remark']]);
  if (d.seaService.length === 0) empty('Chưa có kỳ phục vụ nào  ·  No sea service records');
  d.seaService.forEach((sv, i) => dataRow(
    [i + 1, sv.imo ? `${sv.vessel}\nIMO ${sv.imo}` : sv.vessel, sv.flagType, sv.rank, sv.signOn, sv.signOff, sv.duration, sv.remark],
    i, { centers: [7], bold: [2] },
  ));
  s.gap(10);
  section(10, 'Ghi chú', 'Remarks');
  s.put(s.r, 1, 8, d.notes || '—', { border: true, font: { color: { argb: d.notes ? TEXT : FAINT } } });
  s.height(s.r, Math.max(30, linesFor(d.notes, 1, 8) * 14 + 8));
  s.r += 2;

  /* ── Ký xác nhận ── */
  const signTop = s.r;
  s.put(signTop, 1, 3, rich([['Người lập', { bold: true }], ['\nPrepared by', { size: 8, color: { argb: MUTED } }]]), { align: 'center' });
  s.put(signTop, 5, 8, rich([['Thuyền viên xác nhận', { bold: true }], ["\nSeafarer's signature", { size: 8, color: { argb: MUTED } }]]), { align: 'center' });
  s.height(signTop, 30);
  s.height(signTop + 1, 48);
  const dotted = { top: { style: 'dotted' as const, color: { argb: MUTED } } };
  s.put(signTop + 2, 1, 3, d.preparedBy || '', { font: { bold: true }, align: 'center' });
  s.put(signTop + 2, 5, 8, d.fullName, { font: { bold: true }, align: 'center' });
  for (let c = 1; c <= 3; c++) s.cell(signTop + 2, c).border = dotted;
  for (let c = 5; c <= 8; c++) s.cell(signTop + 2, c).border = dotted;
  ws.pageSetup.printArea = `A1:H${signTop + 2}`;
  return wb;
}

/** Dựng và tải file Excel hồ sơ thuyền viên. */
export async function exportBioDataExcel(d: BioData) {
  const wb = await buildBioDataWorkbook(d);
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${d.fileName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
