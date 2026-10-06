import type { Content, ContentTable, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import { STATUS_LABEL, type BioData, type BioDocRow, type BioField, type DocStatus } from './bioDataTypes';

/*
  Xuất hồ sơ thuyền viên ra file PDF (tải thẳng về, không qua hộp thoại in).

  Dựng bằng pdfmake với font Be Vietnam Pro (giấy phép SIL OFL, file trong public/fonts).
  Font có sẵn của các thư viện PDF không có dấu tiếng Việt — đó là lý do bản của Edge
  (jsPDF + Helvetica) vỡ chữ. Font và thư viện chỉ tải khi bấm xuất, không nặng trang.
*/

const C = {
  navy: '#0b2545',
  accent: '#1b4c7e',
  soft: '#eef2f7',
  head: '#dce9f8',
  label: '#f4f7fa',
  zebra: '#fafbfd',
  line: '#c5d0db',
  text: '#14202e',
  muted: '#64748b',
  faint: '#a3b1bc',
};

const STATUS_STYLE: Record<DocStatus, { color: string; fill: string }> = {
  valid: { color: '#137b3b', fill: '#e7f6ee' },
  expiring: { color: '#b45309', fill: '#fff2e0' },
  expired: { color: '#b42318', fill: '#fdeaea' },
  none: { color: '#475569', fill: '#eef2f7' },
};

/** Đường kẻ bảng mảnh, cùng màu cho mọi bảng. */
const gridLayout = {
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  hLineColor: () => C.line,
  vLineColor: () => C.line,
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 3,
  paddingBottom: () => 3,
};

const FONT_FILES = {
  'BeVietnamPro-Regular.ttf': 'BeVietnamPro-Regular.ttf',
  'BeVietnamPro-Medium.ttf': 'BeVietnamPro-Medium.ttf',
  'BeVietnamPro-SemiBold.ttf': 'BeVietnamPro-SemiBold.ttf',
  'BeVietnamPro-Bold.ttf': 'BeVietnamPro-Bold.ttf',
  'BeVietnamPro-Italic.ttf': 'BeVietnamPro-Italic.ttf',
};

export const BIO_PDF_FONTS = {
  BeVietnam: {
    normal: 'BeVietnamPro-Regular.ttf',
    bold: 'BeVietnamPro-Bold.ttf',
    italics: 'BeVietnamPro-Italic.ttf',
    bolditalics: 'BeVietnamPro-Bold.ttf',
  },
  BeVietnamMedium: {
    normal: 'BeVietnamPro-Medium.ttf',
    bold: 'BeVietnamPro-SemiBold.ttf',
    italics: 'BeVietnamPro-Italic.ttf',
    bolditalics: 'BeVietnamPro-SemiBold.ttf',
  },
};

let vfsCache: Record<string, string> | null = null;

/** Tải font từ public/fonts một lần, đổi sang base64 cho pdfmake. */
async function loadVfs(): Promise<Record<string, string>> {
  if (vfsCache) return vfsCache;
  const base = `${import.meta.env.BASE_URL}fonts/`;
  const entries = await Promise.all(Object.keys(FONT_FILES).map(async name => {
    const res = await fetch(base + name);
    if (!res.ok) throw new Error(`Không tải được font ${name}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return [name, btoa(bin)] as const;
  }));
  vfsCache = Object.fromEntries(entries);
  return vfsCache;
}

/* ── Khối dựng ── */

const bilingual = (vi: string, en: string, size = 7.5): { stack: Content[] } => ({
  stack: [
    { text: vi, fontSize: size, color: C.muted, font: 'BeVietnamMedium' },
    { text: en, fontSize: size - 1, color: C.faint },
  ],
});

const sectionTitle = (no: number, vi: string, en: string): Content => ({
  // headlineLevel để pageBreakBefore nhận ra tiêu đề nhóm (không để tiêu đề trơ cuối trang).
  headlineLevel: 1,
  margin: [0, 8, 0, 3],
  table: {
    widths: ['*'],
    body: [[{
      fillColor: C.navy,
      border: [false, false, false, false],
      margin: [4, 2, 4, 2],
      text: [
        { text: `${no}   `, color: '#e0b53a', bold: true },
        { text: vi.toUpperCase(), color: '#ffffff', bold: true },
        { text: `   ${en}`, color: '#a8bcd4', fontSize: 8.5 },
      ],
      fontSize: 10,
    }]],
  },
  layout: 'noBorders',
});

const valueCell = (v: string): { text: string; fontSize: number; color: string; font?: string; bold?: boolean } =>
  v ? { text: v, font: 'BeVietnamMedium', bold: true, fontSize: 9.5, color: C.text }
    : { text: '—', color: C.faint, fontSize: 9.5 };

/** Lưới nhãn — giá trị, 2 cặp mỗi hàng: | nhãn | giá trị | nhãn | giá trị |. Trường `wide` trải cả hàng. */
const fieldTable = (fields: BioField[], wide: BioField[] = []): ContentTable => {
  const body: TableCell[][] = [];
  for (let i = 0; i < fields.length; i += 2) {
    const a = fields[i];
    const b = fields[i + 1];
    body.push([
      { ...bilingual(a.vi, a.en), fillColor: C.label },
      valueCell(a.value),
      b ? { ...bilingual(b.vi, b.en), fillColor: C.label } : { text: '', fillColor: C.label },
      b ? valueCell(b.value) : { text: '' },
    ]);
  }
  wide.forEach(w => body.push([{ ...bilingual(w.vi, w.en), fillColor: C.label }, { ...valueCell(w.value), colSpan: 3 }, {}, {}]));
  return { table: { widths: [88, '*', 88, '*'], body }, layout: gridLayout };
};

const headCell = (vi: string, en: string, align: 'left' | 'center' = 'center'): TableCell => ({
  fillColor: C.head,
  alignment: align,
  stack: [
    { text: vi, bold: true, fontSize: 8.5, color: C.navy },
    { text: en, fontSize: 6.5, color: C.muted },
  ],
});

const emptyRow = (cols: number, text: string): TableCell[] => [
  { text, colSpan: cols, alignment: 'center', italics: true, color: C.faint, fontSize: 8.5, margin: [0, 3, 0, 3] },
  ...Array.from({ length: cols - 1 }, () => ({})),
];

const statusCell = (s: DocStatus): TableCell => ({
  text: STATUS_LABEL[s].vi,
  alignment: 'center',
  bold: true,
  fontSize: 8,
  color: STATUS_STYLE[s].color,
  fillColor: STATUS_STYLE[s].fill,
});

const docTable = (rows: BioDocRow[], nameVi: string, nameEn: string): ContentTable => ({
  table: {
    headerRows: 1,
    dontBreakRows: true,
    widths: [20, '*', 76, 74, 56, 56, 62],
    body: [
      [headCell('STT', 'No.'), headCell(nameVi, nameEn, 'left'), headCell('Số', 'Number'), headCell('Nơi cấp', 'Issued by'),
        headCell('Ngày cấp', 'Issued'), headCell('Hết hạn', 'Expiry'), headCell('Tình trạng', 'Status')],
      ...(rows.length === 0
        ? [emptyRow(7, 'Chưa có dữ liệu / No records')]
        : rows.map((r, i): TableCell[] => {
          const fill = i % 2 ? C.zebra : undefined;
          return [
            { text: String(i + 1), alignment: 'right', color: C.muted, fillColor: fill },
            { stack: [{ text: r.name, font: 'BeVietnamMedium' }, ...(r.remark ? [{ text: r.remark, fontSize: 7, color: C.muted }] : [])], fillColor: fill },
            { text: r.number, fontSize: 8, fillColor: fill },
            { text: r.issuedBy, fontSize: 8, fillColor: fill },
            { text: r.issueDate, alignment: 'center', fontSize: 8, noWrap: true, fillColor: fill },
            { text: r.expiryDate, alignment: 'center', fontSize: 8, noWrap: true, fillColor: fill },
            statusCell(r.status),
          ];
        })),
    ],
  },
  layout: gridLayout,
  fontSize: 8.5,
});

/** Định nghĩa tài liệu pdfmake (xuất ra để kiểm tra bố cục ngoài trình duyệt). */
export function buildBioDataDefinition(d: BioData): TDocumentDefinitions {
  const service: ContentTable = {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: [20, '*', 70, 68, 72, 72, 56],
      body: [
        [headCell('STT', 'No.'), headCell('Tàu', 'Vessel', 'left'), headCell('Cờ · Loại tàu', 'Flag · Type'),
          headCell('Chức danh', 'Rank'), headCell('Lên tàu', 'Sign on'), headCell('Xuống tàu', 'Sign off'), headCell('Thời gian', 'Duration')],
        ...(d.seaService.length === 0
          ? [emptyRow(7, 'Chưa có kỳ phục vụ nào / No sea service records')]
          : d.seaService.map((s, i): TableCell[] => {
            const fill = i % 2 ? C.zebra : undefined;
            return [
              { text: String(i + 1), alignment: 'right', color: C.muted, fillColor: fill },
              { stack: [{ text: s.vessel, bold: true }, ...(s.imo ? [{ text: `IMO ${s.imo}`, fontSize: 7, color: C.muted }] : [])], fillColor: fill },
              { text: s.flagType, fontSize: 8, fillColor: fill },
              { text: s.rank, fillColor: fill },
              { text: s.signOn, fontSize: 8, fillColor: fill },
              { text: s.signOff, fontSize: 8, fillColor: fill },
              { text: s.duration, alignment: 'center', fontSize: 8, fillColor: fill },
            ];
          })),
      ],
    },
    layout: gridLayout,
    fontSize: 8.5,
  };

  const facts: [string, string][] = [
    ['Ngày sinh', d.personal.find(f => f.en === 'Date of birth')?.value ?? ''],
    ['Quốc tịch', d.personal.find(f => f.en === 'Nationality')?.value ?? ''],
    ['Hết hạn hợp đồng', d.employment.find(f => f.en === 'Contract end')?.value ?? ''],
  ];

  return {
    pageSize: 'A4',
    pageMargins: [34, 34, 34, 44],
    info: { title: `Hồ sơ thuyền viên — ${d.fullName}`, author: d.preparedBy, subject: 'Seafarer bio-data' },
    defaultStyle: { font: 'BeVietnam', fontSize: 9, color: C.text, lineHeight: 1.15 },
    // Tiêu đề nhóm nằm ở 15% cuối trang thì sang trang mới, để tiêu đề luôn đi cùng nội dung của nó.
    pageBreakBefore: node => node.headlineLevel === 1 && (node.startPosition?.verticalRatio ?? 0) > 0.85,
    footer: (page, pages) => ({
      margin: [34, 14, 34, 0],
      columns: [
        { text: `${d.fullName}  ·  ${d.crewCode}`, fontSize: 7.5, color: C.muted },
        { text: `Trang ${page} / ${pages}`, fontSize: 7.5, color: C.muted, alignment: 'right' },
      ],
    }),
    content: [
      /* Đầu trang */
      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'SEAFARER BIO-DATA', fontSize: 8.5, bold: true, color: C.accent, characterSpacing: 1.5 },
              { text: 'HỒ SƠ THUYỀN VIÊN', fontSize: 20, bold: true, color: C.navy, margin: [0, 1, 0, 0] },
            ],
          },
          {
            width: 'auto',
            table: {
              body: [
                ['Mã thuyền viên', d.crewCode],
                ['Ngày lập', d.preparedAt],
                ['Người lập', d.preparedBy || '—'],
              ].map(([k, v]) => [
                { text: k, color: C.muted, fontSize: 8, alignment: 'right' },
                { text: v, bold: true, fontSize: 8.5, alignment: 'right' },
              ]),
            },
            layout: { ...gridLayout, hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 1, paddingBottom: () => 1 },
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 527, y2: 6, lineWidth: 2, lineColor: C.navy }], margin: [0, 0, 0, 10] },

      /* Thẻ nhận diện */
      {
        table: {
          widths: [84, '*'],
          body: [[
            d.photoDataUrl
              ? { image: d.photoDataUrl, fit: [76, 100], alignment: 'center', margin: [0, 2, 0, 2] }
              : { text: 'Ảnh 3×4', color: C.faint, alignment: 'center', margin: [0, 44, 0, 44], fillColor: '#ffffff' },
            {
              margin: [8, 6, 4, 4],
              stack: [
                { text: d.fullName, fontSize: 17, bold: true },
                { text: d.rank || '—', fontSize: 11, color: C.accent, font: 'BeVietnamMedium', bold: true, margin: [0, 1, 0, 0] },
                { text: d.vessel ? `Tàu hiện tại: ${d.vessel}` : 'Hiện ở bờ', fontSize: 9, color: C.muted, margin: [0, 3, 0, 8] },
                {
                  columns: facts.map(([k, v]) => ({
                    width: '*',
                    stack: [
                      { text: k, fontSize: 7.5, color: C.muted },
                      { text: v || '—', fontSize: 9.5, font: 'BeVietnamMedium', bold: true },
                    ],
                  })),
                },
              ],
            },
          ]],
        },
        layout: {
          fillColor: () => C.soft,
          hLineWidth: () => 0, vLineWidth: () => 0,
          paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 4, paddingBottom: () => 4,
        },
      },

      sectionTitle(1, 'Thông tin cá nhân', 'Personal particulars'),
      fieldTable(d.personal.filter(f => f.en !== 'Address'), d.personal.filter(f => f.en === 'Address')),
      sectionTitle(2, 'Thông tin công việc', 'Employment'),
      fieldTable(d.employment),
      sectionTitle(3, 'Thể chất', 'Physical details'),
      fieldTable(d.physical),
      sectionTitle(4, 'Thân nhân / liên hệ khẩn cấp', 'Next of kin'),
      fieldTable(d.kin),
      sectionTitle(5, 'Học vấn', 'Education'),
      fieldTable(d.education),
      sectionTitle(6, 'Giấy tờ định danh', 'Identity & travel documents'),
      docTable(d.identityDocs, 'Loại giấy tờ', 'Document'),
      sectionTitle(7, 'Chứng chỉ chuyên môn', 'Certificates'),
      docTable(d.certificates, 'Tên chứng chỉ', 'Certificate'),
      sectionTitle(8, 'Giấy tờ sức khỏe', 'Medical documents'),
      docTable(d.healthDocs, 'Loại giấy tờ', 'Document'),
      sectionTitle(9, 'Kinh nghiệm đi biển', 'Sea service record'),
      service,
      sectionTitle(10, 'Ghi chú', 'Remarks'),
      {
        table: { widths: ['*'], body: [[d.notes ? { text: d.notes } : { text: '—', color: C.faint }]] },
        layout: { ...gridLayout, paddingTop: () => 6, paddingBottom: () => 6 },
      },

      /* Ký xác nhận */
      {
        unbreakable: true,
        margin: [0, 12, 0, 0],
        columns: [
          { width: '*', alignment: 'center', stack: [
            { text: 'Người lập', bold: true }, { text: 'Prepared by', fontSize: 7.5, color: C.muted },
            { text: ' ', margin: [0, 0, 0, 24] },
            { canvas: [{ type: 'line', x1: 40, y1: 0, x2: 200, y2: 0, lineWidth: 0.6, lineColor: C.muted, dash: { length: 2 } }] },
            { text: d.preparedBy || ' ', margin: [0, 3, 0, 0], font: 'BeVietnamMedium', bold: true },
          ] },
          { width: '*', alignment: 'center', stack: [
            { text: 'Thuyền viên xác nhận', bold: true }, { text: "Seafarer's signature", fontSize: 7.5, color: C.muted },
            { text: ' ', margin: [0, 0, 0, 24] },
            { canvas: [{ type: 'line', x1: 40, y1: 0, x2: 200, y2: 0, lineWidth: 0.6, lineColor: C.muted, dash: { length: 2 } }] },
            { text: d.fullName, margin: [0, 3, 0, 0], font: 'BeVietnamMedium', bold: true },
          ] },
        ],
      },
    ],
  };
}

/** Tạo và tải file PDF hồ sơ thuyền viên. */
export async function downloadBioDataPdf(d: BioData): Promise<void> {
  const [{ default: pdfMake }, vfs] = await Promise.all([import('pdfmake/build/pdfmake'), loadVfs()]);
  await new Promise<void>((resolve, reject) => {
    try {
      pdfMake.createPdf(buildBioDataDefinition(d), undefined, BIO_PDF_FONTS, vfs).download(`${d.fileName}.pdf`, () => resolve());
    } catch (e) {
      reject(e);
    }
  });
}
