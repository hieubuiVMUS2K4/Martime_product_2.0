import { STATUS_LABEL, type BioData, type BioDocRow, type BioField } from './bioData';

/*
  Xuất hồ sơ ra PDF bằng trang in của trình duyệt (A4 dọc), người dùng chọn "Lưu thành PDF".

  Không dùng jsPDF như Edge: font có sẵn của jsPDF không có dấu tiếng Việt nên tên kiểu
  "Nguyễn Văn Ánh" bị vỡ chữ, muốn đúng phải nhúng cả file font vào bundle. Trang in HTML
  dùng font của máy, hiển thị đúng tiếng Việt và dàn trang rõ ràng hơn.
*/

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const label = (vi: string, en: string) => `<span class="vi">${esc(vi)}</span><span class="en">${esc(en)}</span>`;

const fieldGrid = (fields: BioField[], cols = 4) => `
  <div class="grid" style="grid-template-columns: repeat(${cols}, 1fr)">
    ${fields.map(x => `
      <div class="cell">
        <div class="lbl">${label(x.vi, x.en)}</div>
        <div class="val">${x.value ? esc(x.value) : '<span class="muted">—</span>'}</div>
      </div>`).join('')}
  </div>`;

const section = (no: number, vi: string, en: string, body: string) => `
  <section>
    <h2><span class="no">${no}</span>${esc(vi)} <span class="h-en">/ ${esc(en)}</span></h2>
    ${body}
  </section>`;

const docTable = (rows: BioDocRow[], nameVi: string, nameEn: string) => `
  <table>
    <colgroup><col style="width:5%"><col style="width:27%"><col style="width:15%"><col style="width:15%">
      <col style="width:11%"><col style="width:11%"><col style="width:16%"></colgroup>
    <thead><tr>
      <th>STT<br><span class="en">No.</span></th>
      <th>${esc(nameVi)}<br><span class="en">${esc(nameEn)}</span></th>
      <th>Số<br><span class="en">Number</span></th>
      <th>Nơi cấp<br><span class="en">Issued by</span></th>
      <th>Ngày cấp<br><span class="en">Issued</span></th>
      <th>Hết hạn<br><span class="en">Expiry</span></th>
      <th>Tình trạng<br><span class="en">Status</span></th>
    </tr></thead>
    <tbody>
      ${rows.length === 0
        ? '<tr><td colspan="7" class="empty">Chưa có dữ liệu / No records</td></tr>'
        : rows.map((r, i) => `<tr>
          <td class="num">${i + 1}</td>
          <td>${esc(r.name)}${r.remark ? `<div class="remark">${esc(r.remark)}</div>` : ''}</td>
          <td class="mono">${esc(r.number)}</td>
          <td>${esc(r.issuedBy)}</td>
          <td class="center">${esc(r.issueDate)}</td>
          <td class="center">${esc(r.expiryDate)}</td>
          <td class="center"><span class="pill ${r.status}">${STATUS_LABEL[r.status].vi}</span></td>
        </tr>`).join('')}
    </tbody>
  </table>`;

export function renderBioDataHtml(d: BioData): string {
  const service = d.seaService.length === 0
    ? '<tr><td colspan="7" class="empty">Chưa có kỳ phục vụ nào / No sea service records</td></tr>'
    : d.seaService.map((s, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td><strong>${esc(s.vessel)}</strong>${s.imo ? `<div class="remark">IMO ${esc(s.imo)}</div>` : ''}</td>
        <td>${esc(s.flagType)}</td>
        <td>${esc(s.rank)}</td>
        <td>${esc(s.signOn)}</td>
        <td>${esc(s.signOff)}</td>
        <td class="center">${esc(s.duration)}</td>
      </tr>`).join('');

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>${esc(d.fileName)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm 12mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Inter, Arial, sans-serif; font-size: 9.5pt; color: #14202e;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .vi { display: block; }
  .en { display: block; color: #6b7c8f; font-size: 7.5pt; font-weight: 400; }
  .muted { color: #a3b1bc; }
  header.top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5pt solid #0b2545; padding-bottom: 6pt; }
  header.top h1 { margin: 0; font-size: 18pt; letter-spacing: .5pt; color: #0b2545; }
  header.top .sub { font-size: 9pt; color: #1b4c7e; letter-spacing: 2pt; font-weight: 600; }
  .meta { border-collapse: collapse; font-size: 8.5pt; }
  .meta td { padding: 1.5pt 0 1.5pt 10pt; }
  .meta td:first-child { color: #6b7c8f; }
  .meta td:last-child { font-weight: 600; text-align: right; }
  .identity { display: flex; gap: 12pt; align-items: stretch; margin: 10pt 0 4pt; }
  .photo { width: 30mm; height: 40mm; border: 0.75pt solid #9fb0c0; background: #eef2f7; display: flex; align-items: center;
           justify-content: center; color: #9fb0c0; font-size: 8pt; overflow: hidden; flex-shrink: 0; }
  .photo img { width: 100%; height: 100%; object-fit: cover; }
  .who { flex: 1; display: flex; flex-direction: column; justify-content: center; }
  .who .name { font-size: 17pt; font-weight: 700; }
  .who .rank { font-size: 11pt; color: #1b4c7e; font-weight: 600; margin-top: 2pt; }
  .who .line { margin-top: 6pt; font-size: 9pt; color: #475569; }
  section { margin-top: 9pt; }
  h2 { margin: 0 0 4pt; font-size: 10.5pt; color: #0b2545; background: #eef2f7; border-left: 3pt solid #0b2545;
       padding: 3.5pt 6pt; break-after: avoid; }
  h2 .no { display: inline-block; min-width: 14pt; }
  h2 .h-en { font-weight: 400; color: #6b7c8f; font-size: 8.5pt; }
  .grid { display: grid; border-top: 0.75pt solid #9fb0c0; border-left: 0.75pt solid #9fb0c0; }
  .cell { border-right: 0.75pt solid #9fb0c0; border-bottom: 0.75pt solid #9fb0c0; padding: 3pt 5pt; min-height: 26pt; break-inside: avoid; }
  .cell .lbl { line-height: 1.15; }
  .cell .lbl .vi { font-size: 7.5pt; color: #475569; }
  .cell .lbl .en { font-size: 6.5pt; }
  .cell .val { font-size: 9.5pt; font-weight: 600; margin-top: 2pt; word-break: break-word; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 0.75pt solid #9fb0c0; padding: 3pt 4pt; vertical-align: middle; word-break: break-word; }
  th { background: #dce9f8; color: #0b2545; font-size: 8.5pt; text-align: center; line-height: 1.2; }
  th .en { font-size: 6.5pt; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  td.num { text-align: right; color: #475569; }
  td.center { text-align: center; }
  td.mono { font-family: Consolas, "Courier New", monospace; font-size: 8.5pt; }
  td.empty { text-align: center; color: #94a3b8; font-style: italic; padding: 6pt; }
  .remark { font-size: 7.5pt; color: #6b7c8f; margin-top: 1pt; }
  .pill { display: inline-block; padding: 1pt 5pt; border-radius: 8pt; font-size: 7.5pt; font-weight: 600; white-space: nowrap; }
  .pill.valid { background: #e7f6ee; color: #137b3b; }
  .pill.expiring { background: #fff2e0; color: #b45309; }
  .pill.expired { background: #fdeaea; color: #b42318; }
  .pill.none { background: #eef2f7; color: #475569; }
  .notes { border: 0.75pt solid #9fb0c0; padding: 5pt 6pt; min-height: 30pt; white-space: pre-line; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24pt; margin-top: 16pt; text-align: center; break-inside: avoid; }
  .sign .t { font-weight: 700; }
  .sign .s { height: 46pt; }
  .sign .n { border-top: 0.75pt dotted #6b7c8f; padding-top: 3pt; font-weight: 600; }
</style></head>
<body>
  <header class="top">
    <div>
      <h1>HỒ SƠ THUYỀN VIÊN</h1>
      <div class="sub">SEAFARER BIO-DATA</div>
    </div>
    <table class="meta">
      <tr><td>Mã thuyền viên / Crew code</td><td>${esc(d.crewCode)}</td></tr>
      <tr><td>Ngày lập / Date prepared</td><td>${esc(d.preparedAt)}</td></tr>
      <tr><td>Người lập / Prepared by</td><td>${esc(d.preparedBy)}</td></tr>
    </table>
  </header>

  <div class="identity">
    <div class="photo">${d.photoDataUrl ? `<img src="${d.photoDataUrl}" alt="">` : 'Ảnh 3×4'}</div>
    <div class="who">
      <div class="name">${esc(d.fullName)}</div>
      <div class="rank">${esc(d.rank || '—')}</div>
      <div class="line">${d.vessel ? `Tàu hiện tại / Current vessel: <strong>${esc(d.vessel)}</strong>` : 'Hiện ở bờ / Ashore'}</div>
    </div>
  </div>

  ${section(1, 'Thông tin cá nhân', 'Personal particulars', fieldGrid(d.personal.slice(0, 8)) + fieldGrid(d.personal.slice(8), 1))}
  ${section(2, 'Thông tin công việc', 'Employment', fieldGrid(d.employment))}
  ${section(3, 'Thể chất', 'Physical details', fieldGrid(d.physical))}
  ${section(4, 'Thân nhân / liên hệ khẩn cấp', 'Next of kin', fieldGrid(d.kin))}
  ${section(5, 'Học vấn', 'Education', fieldGrid(d.education))}
  ${section(6, 'Giấy tờ định danh', 'Identity & travel documents', docTable(d.identityDocs, 'Loại giấy tờ', 'Document'))}
  ${section(7, 'Chứng chỉ chuyên môn', 'Certificates of competency & training', docTable(d.certificates, 'Tên chứng chỉ', 'Certificate'))}
  ${section(8, 'Giấy tờ sức khỏe', 'Medical documents', docTable(d.healthDocs, 'Loại giấy tờ', 'Document'))}
  ${section(9, 'Kinh nghiệm đi biển', 'Sea service record', `
    <table>
      <colgroup><col style="width:5%"><col style="width:21%"><col style="width:15%"><col style="width:14%">
        <col style="width:16%"><col style="width:16%"><col style="width:13%"></colgroup>
      <thead><tr>
        <th>STT<br><span class="en">No.</span></th>
        <th>Tàu<br><span class="en">Vessel</span></th>
        <th>Cờ · Loại tàu<br><span class="en">Flag · Type</span></th>
        <th>Chức danh<br><span class="en">Rank</span></th>
        <th>Lên tàu<br><span class="en">Sign on</span></th>
        <th>Xuống tàu<br><span class="en">Sign off</span></th>
        <th>Thời gian<br><span class="en">Duration</span></th>
      </tr></thead>
      <tbody>${service}</tbody>
    </table>`)}
  ${section(10, 'Ghi chú', 'Remarks', `<div class="notes">${d.notes ? esc(d.notes) : '<span class="muted">—</span>'}</div>`)}

  <div class="sign">
    <div><div class="t">Người lập</div><div class="en">Prepared by</div><div class="s"></div><div class="n">${esc(d.preparedBy)}</div></div>
    <div><div class="t">Thuyền viên xác nhận</div><div class="en">Seafarer's signature</div><div class="s"></div><div class="n">${esc(d.fullName)}</div></div>
  </div>
</body></html>`;
}

/**
 * Mở hộp thoại in với trang hồ sơ (qua iframe ẩn, không bị chặn cửa sổ bật lên).
 * Tên file mặc định khi "Lưu thành PDF" lấy theo <title>.
 */
export function printBioData(d: BioData): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (!win || !doc) { frame.remove(); reject(new Error('Không mở được trang in')); return; }

    doc.open();
    doc.write(renderBioDataHtml(d));
    doc.close();

    const previousTitle = document.title;
    const go = () => {
      // Chrome lấy tên file PDF từ tiêu đề trang cha khi in iframe.
      document.title = d.fileName;
      win.focus();
      win.print();
      setTimeout(() => { document.title = previousTitle; frame.remove(); resolve(); }, 500);
    };
    const imgs = Array.from(doc.images);
    if (imgs.every(i => i.complete)) setTimeout(go, 50);
    else Promise.all(imgs.map(i => new Promise(r => { i.onload = r; i.onerror = r; }))).then(go);
  });
}
