import { toast } from 'sonner';

export interface PrintSmsDocumentOptions {
  title: string;
  subtitle?: string;
  code?: string;
  version?: string;
  date?: string;
  contentHtml?: string;
  watermark?: string;
  isForm?: boolean;
  metadata?: Record<string, string>;
  signatures?: Array<{
    name?: string;
    rank?: string;
    sigCode?: string;
    timestamp?: string;
  }>;
}

/**
 * Opens an isolated print window and prints a standardized, high-fidelity A4 document.
 */
export function printSmsDocument(options: PrintSmsDocumentOptions) {
  const {
    title,
    subtitle = 'HỆ THỐNG QUẢN LÝ AN TOÀN HÀNG HẢI - SMS',
    code = '',
    version = '',
    date = '',
    contentHtml = '',
    watermark = '',
    isForm = false,
    metadata = {},
    signatures = []
  } = options;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error('Không thể mở cửa sổ in. Vui lòng tắt trình chặn pop-up của trình duyệt.');
    return;
  }

  // Format date cleanly
  const formattedDate = date ? date.split('T')[0] : new Date().toISOString().split('T')[0];

  // 1. Build metadata table (only for procedures, or non-form headers)
  let metaHtml = '';
  if (!isForm && (code || version || formattedDate)) {
    metaHtml = `
      <div class="metadata-grid">
        <div class="metadata-item">
          <span class="metadata-label">Mã tài liệu:</span>
          <span class="metadata-value">${code || 'N/A'}</span>
        </div>
        <div class="metadata-item">
          <span class="metadata-label">Phiên bản:</span>
          <span class="metadata-value">Rev ${version || '1.0'}</span>
        </div>
        <div class="metadata-item">
          <span class="metadata-label">Ngày ban hành:</span>
          <span class="metadata-value">${formattedDate}</span>
        </div>
        <div class="metadata-item">
          <span class="metadata-label">Phạm vi áp dụng:</span>
          <span class="metadata-value">Đội tàu & Shore Office</span>
        </div>
      </div>
    `;
  }

  // 2. Build structured form layout if it is a form record
  let bodyContent = contentHtml;
  if (isForm) {
    if (code === 'TL-02-01') {
      const shipName = metadata['shipName'] || metadata['Tàu thực thi'] || 'N/A';
      const shipType = metadata['shipType'] || 'Bulk Carrier';
      const masterName = metadata['masterName'] || metadata['Người lập'] || 'N/A';
      const reviewDate = metadata['reviewDate'] || formattedDate;

      const items = [
        {
          num: '1',
          en: 'Are personnel aware of and understand the Company policies? Are there any areas of policy where staff consider that improvement could be made?',
          vi: 'Nhận thức của thuyền viên về các chính sách của Công ty? Những phần nào của chính sách cần được chú trọng nâng cao cho thuyền viên?',
          val: metadata['reviewItem1'] || '--- Không có thông tin / No comment ---'
        },
        {
          num: '2',
          en: 'Is the SLMS easily and readily accessible to all relevant staff? Do the officers and crew have a relevant understanding of the procedures contained in SLMS in relation to safety and their responsibilities onboard?',
          vi: 'Thuyền viên có thể dễ dàng tiếp cận với tài liệu QLAT&LĐHH? Thuyền viên và sỹ quan có hiểu được các quy trình và nhiệm vụ liên quan đến mình?',
          val: metadata['reviewItem2'] || '--- Không có thông tin / No comment ---'
        },
        {
          num: '3',
          en: 'Are records, filing and checklists being completed as required? What improvements would you recommend in relation to these areas of the SLMS?',
          vi: 'Các báo cáo, danh mục kiểm tra và cặp hồ sơ lưu được thực hiện theo yêu cầu? Những khuyến nghị để công tác này được thực hiện tốt hơn?',
          val: metadata['reviewItem3'] || '--- Không có thông tin / No comment ---'
        },
        {
          num: '4',
          en: 'Summarise any significant internal and external audit findings since last review and comment on any issues that may have come about as a result and corrective actions.',
          vi: 'Tóm tắt những phát hiện quan trọng trong đánh giá nội bộ và của bên ngoài kể từ lần soát xét trước, những nhận xét về các vấn đề liên quan đến việc thực hiện các hành động khắc phục.',
          val: metadata['reviewItem4'] || '--- Không có thông tin / No comment ---'
        },
        {
          num: '5',
          en: 'Briefly summarise any significant findings or defects raised by any third party since last review such as Port State and comment on steps taken to avoid recurrence.',
          vi: 'Tóm tắt những phát hiện, lỗi quan trọng trong các cuộc kiểm tra của PSC kể từ lần soát xét trước và những khuyến nghị về các hành động cần thiết để tránh lặp lại lỗi đó.',
          val: metadata['reviewItem5'] || '--- Không có thông tin / No comment ---'
        },
        {
          num: '6',
          en: 'Summarise accidents/ incidents since last review and comment on steps taken to avoid recurrence.',
          vi: 'Tóm tắt những tai nạn/ sự cố kể từ lần soát xét và những khuyến nghị về các hành động cần thiết để tránh lặp lại sự cố đó.',
          val: metadata['reviewItem6'] || '--- Không có thông tin / No comment ---'
        },
        {
          num: '7',
          en: 'Any customer (i.e. Owner and/or Charterers) feedback regarding satisfaction or complaints.',
          vi: 'Nhận xét, khiếu nại của khách hàng hoặc người thuê tàu.',
          val: metadata['reviewItem7'] || '--- Không có thông tin / No comment ---'
        },
        {
          num: '8',
          en: 'What general improvements do you consider could be made to the SLMS?',
          vi: 'Những cải tiến cần thiết đối với hệ thống QLAT&LĐHH?',
          val: metadata['reviewItem8'] || '--- Không có thông tin / No comment ---'
        },
        {
          num: '9',
          en: 'Discuss any training carried out during command and comment on its effectiveness. What areas of training would you consider that could be improved or made more beneficial?',
          vi: 'Các cuộc huấn luyện/đào tạo đã thực hiện và hiệu quả của chúng, những điểm cần cải tiến?',
          val: metadata['reviewItem9'] || '--- Không có thông tin / No comment ---'
        },
        {
          num: '10',
          en: 'Document Review. Please recommend any significant changes which you consider should be made in order to improve the effectiveness of the SLMS.',
          vi: 'Soát xét hệ thống tài liệu. Nêu những sửa đổi cần thiết nâng cao hiệu lực của Sổ tay QLAT&LĐHH.',
          val: metadata['reviewItem10'] || '--- Không có thông tin / No comment ---'
        }
      ];

      bodyContent = `
        <div style="font-family: Arial, sans-serif; margin-bottom: 20px;">
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; text-align: center;">
            <tr>
              <td style="width: 25%; border-right: 1px solid #cbd5e1; padding: 10px;">
                <div style="font-size: 24px; margin-bottom: 3px;">⚓</div>
                <div style="font-size: 10px; font-weight: bold; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.5px;">HP SHIPPING</div>
              </td>
              <td style="width: 50%; border-right: 1px solid #cbd5e1; padding: 10px; background-color: #f8fafc;">
                <h3 style="font-size: 12px; font-weight: bold; margin: 0; text-transform: uppercase; color: #1e293b; line-height: 1.4;">
                  BIÊN BẢN SOÁT XÉT CÔNG TÁC QUẢN LÝ AN TOÀN,<br/>SỨC KHỎE, BẢO VỆ MÔI TRƯỜNG
                </h3>
                <p style="font-size: 10px; font-style: italic; color: #64748b; margin: 4px 0 0 0; font-weight: 600;">Master's Review of the SLMS</p>
              </td>
              <td style="width: 25%; padding: 10px; text-align: left; font-size: 9px; line-height: 1.4;">
                <div><strong>Mã biểu mẫu:</strong> <span style="font-family: monospace; font-weight: bold; color: #2563eb;">TL-02-01</span></div>
                <div><strong>Ngày ban hành:</strong> <span style="font-family: monospace;">20/10/2016</span></div>
                <div><strong>Lần sửa đổi:</strong> <span style="font-family: monospace;">00</span></div>
                <div><strong>Trang:</strong> 1 / 2</div>
              </td>
            </tr>
          </table>

          <table style="width: 100%; border-collapse: collapse; border-left: 1px solid #cbd5e1; border-right: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1; padding: 5px; background-color: #f8fafc; font-size: 11px;">
            <tr>
              <td style="width: 50%; padding: 6px 12px; border-right: 1px solid #e2e8f0;"><strong>Tên tàu / Ship's Name:</strong> <span style="color: #0f172a; font-weight: 500;">${shipName}</span></td>
              <td style="width: 50%; padding: 6px 12px;"><strong>Loại tàu / Ship Type:</strong> <span style="color: #0f172a; font-weight: 500;">${shipType}</span></td>
            </tr>
            <tr>
              <td style="width: 50%; padding: 6px 12px; border-right: 1px solid #e2e8f0; border-top: 1px solid #e2e8f0;"><strong>Thuyền trưởng / Master:</strong> <span style="color: #0f172a; font-weight: 500;">${masterName}</span></td>
              <td style="width: 50%; padding: 6px 12px; border-top: 1px solid #e2e8f0;"><strong>Ngày lập / Date:</strong> <span style="font-family: monospace; color: #0f172a; font-weight: 500;">${reviewDate}</span></td>
            </tr>
          </table>

          <div style="margin-top: 25px;">
            ${items.map(item => `
              <div style="margin-bottom: 15px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 12px; page-break-inside: avoid;">
                <div style="font-weight: bold; color: #1e293b; display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
                  <span style="display: inline-block; background-color: #f1f5f9; color: #475569; width: 18px; height: 18px; border-radius: 50%; text-align: center; font-size: 10px; line-height: 18px; flex-shrink: 0; font-family: sans-serif;">${item.num}</span>
                  <div style="font-size: 11px; font-family: sans-serif;">
                    <p style="margin: 0; color: #334155;">${item.en}</p>
                    <p style="margin: 2px 0 0 0; color: #64748b; font-style: italic; font-weight: 500;">${item.vi}</p>
                  </div>
                </div>
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; padding: 10px; font-size: 11px; color: #0f172a; line-height: 1.5; white-space: pre-wrap; font-family: Arial, sans-serif;">${item.val}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      const sortedEntries = Object.entries(metadata);
      bodyContent = `
        <div class="form-title-section">
          <h2 style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">${title}</h2>
          <p style="font-size: 11px; color: #64748b; margin-top: 0; margin-bottom: 20px;">Mẫu biểu kỹ thuật số đã kiểm soát - SMS System</p>
        </div>
        
        <h3 style="font-size: 13px; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 4px; margin-top: 20px;">I. THÔNG TIN CHUNG (GENERAL INFORMATION)</h3>
        <table class="form-info-table">
          <tr>
            <td><strong>Tên tàu thực thi:</strong> ${metadata['Tên tàu'] || metadata['Tàu thực thi'] || 'N/A'}</td>
            <td><strong>Quy trình liên kết:</strong> ${metadata['Quy trình liên kết'] || 'N/A'}</td>
          </tr>
          <tr>
            <td><strong>Người lập hồ sơ:</strong> ${metadata['Người lập'] || metadata['Người lập hồ sơ'] || 'N/A'}</td>
            <td><strong>Ngày ghi nhận:</strong> ${metadata['Ngày lập'] || metadata['Ngày khởi tạo'] || 'N/A'}</td>
          </tr>
        </table>

        <h3 style="font-size: 13px; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 4px; margin-top: 25px;">II. NỘI DUNG BIỂU MẪU CHI TIẾT (FORM DATA DETAILS)</h3>
        <table class="form-data-table">
          <thead>
            <tr>
              <th style="width: 5%;">TT</th>
              <th style="width: 65%;">Nội dung kiểm tra / Chỉ mục đánh giá</th>
              <th style="width: 30%; text-align: center;">Trạng thái ghi nhận</th>
            </tr>
          </thead>
          <tbody>
            ${sortedEntries
              .filter(([key]) => !['Tàu thực thi', 'Người lập', 'Ngày lập', 'Mã biểu mẫu', 'Quy trình liên kết', 'Tên tàu', 'Người lập hồ sơ', 'Ngày khởi tạo', 'vesselName', 'filledBy', 'filledDate', 'procedureCode', 'formCode', 'formTitle', 'shipName', 'shipType', 'masterName', 'reviewDate'].includes(key))
              .map(([key, val], idx) => {
                const cleanedKey = key
                  .replace('chk_', '')
                  .replace('chk', '')
                  .replace('prep_', '')
                  .replace('gas_', '')
                  .replace(/([A-Z])/g, ' $1')
                  .replace(/^./, str => str.toUpperCase());
                
                let displayVal = String(val);
                if (typeof val === 'boolean') {
                  displayVal = val 
                    ? '<span class="status-yes">✓ Có / Đạt (Yes/Pass)</span>' 
                    : '<span class="status-no">✗ Không / Chưa đạt (No/Fail)</span>';
                } else if (val === 'true') {
                  displayVal = '<span class="status-yes">✓ Có / Đạt (Yes/Pass)</span>';
                } else if (val === 'false') {
                  displayVal = '<span class="status-no">✗ Không / Chưa đạt (No/Fail)</span>';
                }

                return `
                  <tr>
                    <td style="text-align: center;">${idx + 1}</td>
                    <td><strong>${cleanedKey}</strong></td>
                    <td style="text-align: center; font-weight: 600;">${displayVal}</td>
                  </tr>
                `;
              }).join('')}
          </tbody>
        </table>
      `;
    }
  }

  // 3. Build signatures HTML
  let sigsHtml = '';
  if (signatures && signatures.length > 0) {
    sigsHtml = `
      <div class="signatures-container">
        ${signatures.map(sig => `
          <div class="signature-stamp">
            <div class="sig-rank">${sig.rank || 'Người lập biểu'}</div>
            <div class="sig-stamp">
              <span class="stamp-check">✓</span>
              <span class="stamp-text">ĐÃ KÝ SỐ</span>
            </div>
            <div class="sig-name">${sig.name || ''}</div>
            <div class="sig-code">${sig.sigCode || ''}</div>
            <div class="sig-date">${sig.timestamp ? sig.timestamp.replace('T', ' ').substring(0, 16) + ' UTC' : ''}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // 4. Construct the complete HTML
  const finalHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${code ? code + ' - ' : ''}${title}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 15mm 18mm 15mm;
    }
    
    body {
      font-family: "Times New Roman", Times, Georgia, serif;
      font-size: 13.5px;
      line-height: 1.6;
      color: #0f172a;
      background-color: #fff;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page-header-fixed {
      position: fixed;
      top: -15mm;
      left: 0;
      right: 0;
      height: 12mm;
      border-bottom: 2px solid #0f172a;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-bottom: 4px;
      z-index: 9999;
    }

    .header-left {
      font-weight: bold;
      font-size: 10px;
      text-transform: uppercase;
      font-family: Arial, sans-serif;
    }

    .header-right {
      font-size: 9px;
      text-align: right;
      font-family: monospace;
      color: #475569;
    }

    .page-footer-fixed {
      position: fixed;
      bottom: -12mm;
      left: 0;
      right: 0;
      height: 10mm;
      border-top: 1px solid #94a3b8;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8.5px;
      color: #64748b;
      font-family: Arial, sans-serif;
      z-index: 9999;
    }

    .header-spacer {
      height: 15mm;
    }

    .footer-spacer {
      height: 12mm;
    }

    .print-layout-table {
      width: 100%;
      border-collapse: collapse;
    }

    .document-body {
      text-align: justify;
    }

    .watermark-container {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      font-size: 44px;
      font-weight: 900;
      color: rgba(30, 41, 59, 0.05);
      border: 6px dashed rgba(30, 41, 59, 0.05);
      padding: 12px 24px;
      text-transform: uppercase;
      letter-spacing: 4px;
      white-space: nowrap;
      pointer-events: none;
      z-index: -1000;
      text-align: center;
      font-family: Arial, sans-serif;
    }

    h1, h2, h3, h4 {
      font-family: Arial, sans-serif;
      color: #0f172a;
      margin-top: 18px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }

    h1 {
      font-size: 19px;
      text-align: center;
      margin-top: 0;
      margin-bottom: 22px;
      text-transform: uppercase;
    }

    h2 {
      font-size: 14.5px;
      border-bottom: 1px solid #94a3b8;
      padding-bottom: 2px;
      margin-top: 24px;
    }

    h3 {
      font-size: 13px;
    }

    p {
      margin-top: 8px;
      margin-bottom: 8px;
    }

    table:not(.print-layout-table) {
      width: 100% !important;
      border-collapse: collapse !important;
      margin: 16px 0 !important;
      font-size: 12.5px !important;
    }

    table:not(.print-layout-table) th,
    table:not(.print-layout-table) td {
      border: 1px solid #475569 !important;
      padding: 6px 10px !important;
      vertical-align: top;
      word-break: break-word;
    }

    table:not(.print-layout-table) th {
      background-color: #f1f5f9 !important;
      font-weight: bold;
      color: #0f172a;
      text-transform: uppercase;
      font-size: 11.5px;
      font-family: Arial, sans-serif;
    }

    tr {
      page-break-inside: avoid;
    }

    ol, ul {
      margin-top: 8px;
      margin-bottom: 8px;
      padding-left: 20px;
    }

    li {
      margin-bottom: 4px;
    }

    .metadata-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 6px;
      background-color: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 10px 14px;
      border-radius: 6px;
      margin-bottom: 24px;
      font-size: 12px;
    }

    .metadata-item {
      display: flex;
    }

    .metadata-label {
      color: #475569;
      font-weight: bold;
      width: 110px;
      flex-shrink: 0;
    }

    .metadata-value {
      color: #0f172a;
    }

    .form-info-table {
      width: 100% !important;
      border-collapse: collapse;
      margin-top: 8px !important;
      margin-bottom: 16px !important;
    }

    .form-info-table td {
      border: none !important;
      padding: 4px 0 !important;
      width: 50%;
      font-size: 13px;
    }

    .form-data-table {
      width: 100% !important;
      border-collapse: collapse !important;
      margin-top: 8px !important;
    }

    .form-data-table th, .form-data-table td {
      border: 1px solid #475569 !important;
      padding: 6px 10px !important;
    }

    .form-data-table th {
      background-color: #f1f5f9 !important;
      font-family: Arial, sans-serif;
      font-size: 11.5px;
      font-weight: bold;
    }

    .status-yes {
      color: #047857;
      font-family: Arial, sans-serif;
    }

    .status-no {
      color: #b91c1c;
      font-family: Arial, sans-serif;
    }

    .signatures-container {
      display: flex;
      justify-content: space-around;
      margin-top: 35px;
      page-break-inside: avoid;
    }

    .signature-stamp {
      width: 190px;
      text-align: center;
      font-size: 11px;
      border: 1px dashed #94a3b8;
      padding: 8px;
      border-radius: 6px;
      background-color: rgba(16, 185, 129, 0.01);
    }

    .sig-rank {
      color: #475569;
      font-weight: bold;
      margin-bottom: 4px;
      font-family: Arial, sans-serif;
    }

    .sig-stamp {
      border: 2px solid #059669;
      color: #059669;
      font-weight: bold;
      font-size: 9.5px;
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      transform: rotate(-2deg);
      margin: 6px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-family: Arial, sans-serif;
    }

    .stamp-check {
      font-size: 11px;
      margin-right: 3px;
    }

    .sig-name {
      font-weight: bold;
      color: #0f172a;
    }

    .sig-code {
      font-family: monospace;
      color: #64748b;
      font-size: 9px;
      margin-top: 2px;
    }

    .sig-date {
      color: #94a3b8;
      font-size: 8.5px;
      margin-top: 1px;
    }
  </style>
</head>
<body>

  <div class="page-header-fixed">
    <div class="header-left">${subtitle}</div>
    <div class="header-right">${code ? code + ' | ' : ''}Rev ${version || '1.0'}</div>
  </div>

  <div class="page-footer-fixed">
    <div>HỆ THỐNG QUẢN LÝ AN TOÀN HÀNG HẢI - TÀI LIỆU ĐÃ KIỂM SOÁT</div>
    <div>MARITIME SHORE SYSTEM</div>
  </div>

  ${watermark ? `<div class="watermark-container">${watermark}</div>` : ''}

  <table class="print-layout-table">
    <thead>
      <tr>
        <td>
          <div class="header-spacer"></div>
        </td>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <div class="document-body">
            ${isForm ? '' : `<h1>${title}</h1>`}
            ${metaHtml}
            ${bodyContent}
            ${sigsHtml}
          </div>
        </td>
      </tr>
    </tbody>
    <tfoot>
      <tr>
        <td>
          <div class="footer-spacer"></div>
        </td>
      </tr>
    </tfoot>
  </table>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`;

  printWindow.document.write(finalHtml);
  printWindow.document.close();
}
