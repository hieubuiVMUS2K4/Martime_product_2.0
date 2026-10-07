import React from 'react';
import { X, Check, Printer } from 'lucide-react';
import { cleaningCategories } from '../../../constants/cleaningCategories';

interface RecordDetailModalProps {
  record: any;
  onClose: () => void;
  onPrint: () => void;
  getRecordStatusBadge: (status: string) => React.ReactNode;
}

export function RecordDetailModal({ record, onClose, onPrint, getRecordStatusBadge }: RecordDetailModalProps) {
  const viewRecordDetail = record;
  const setViewRecordDetail = (_: any) => onClose();
  const handlePrintRecord = onPrint;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-modal p-4 animate-in fade-in duration-200">
      <div className={`bg-white dark:bg-slate-800 rounded-2xl ${(viewRecordDetail.formCode === 'TL-02-01' || viewRecordDetail.formCode === 'TL-26-03' || viewRecordDetail.formCode === 'TL-15-01') ? 'max-w-4xl' : 'max-w-xl'} w-full border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col max-h-[90vh]`}>
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded">
                {viewRecordDetail.formCode}
              </span>
              {getRecordStatusBadge(viewRecordDetail.status)}
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">{viewRecordDetail.formTitle}</h3>
          </div>
          <button
            onClick={() => setViewRecordDetail(null)}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 scrollbar-thin">
          
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div>
              <span className="text-slate-400 block mb-0.5">Tên tàu</span>
              <span className="font-semibold text-slate-800 dark:text-white">{viewRecordDetail.vesselName}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Quy trình liên kết</span>
              <span className="font-semibold text-slate-800 dark:text-white font-mono">{viewRecordDetail.procedureCode}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Người lập hồ sơ</span>
              <span className="font-semibold text-slate-800 dark:text-white">{viewRecordDetail.filledBy}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Ngày khởi tạo</span>
              <span className="font-semibold text-slate-800 dark:text-white font-mono">{viewRecordDetail.filledDate.replace('T', ' ').substring(0, 16)} UTC</span>
            </div>
          </div>

          {/* Filled Fields */}
          {viewRecordDetail.formCode === 'TL-26-03' ? (
            <div className="space-y-4 font-sans text-slate-800 dark:text-slate-200 text-xs">
              {/* Header Table */}
              <div className="border border-slate-300 dark:border-slate-700 grid grid-cols-12 items-stretch text-center font-sans">
                <div className="col-span-3 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-2">
                  <div className="w-8 h-8 rounded-full border border-accent flex items-center justify-center mb-1 text-accent text-xs font-bold">⚓</div>
                  <span className="text-[8px] font-extrabold tracking-tight leading-tight text-primary dark:text-blue-300 uppercase">HP SHIPPING</span>
                </div>
                <div className="col-span-6 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-2 bg-slate-50/30 dark:bg-slate-900/30">
                  <h3 className="font-extrabold text-[10px] leading-snug uppercase tracking-tight text-slate-800 dark:text-white">
                    LỊCH LÀM VỆ SINH BẾP, CÁC KHO THỰC PHẨM, KHU VỰC SINH HOẠT CHUNG, PHÒNG Ở
                  </h3>
                  <span className="italic text-[8px] text-slate-500 font-semibold uppercase">ACCOMMODATIONS, STORE, GALLEY CLEANING SCHEDULE</span>
                </div>
                <div className="col-span-3 flex flex-col justify-center p-2 text-left text-[8px] space-y-0.5 bg-slate-50/10">
                  <div><strong>Mã biểu mẫu:</strong> <span className="font-mono text-accent dark:text-blue-400 font-bold">TL-26-03</span></div>
                  <div><strong>Ngày ban hành:</strong> <span className="font-mono">20/10/2016</span></div>
                  <div><strong>Lần sửa đổi:</strong> <span className="font-mono">0</span></div>
                </div>
              </div>

              {/* Metadata Row */}
              {(() => {
                const filled = JSON.parse(viewRecordDetail.filledData || '{}');
                return (
                  <>
                    <div className="grid grid-cols-2 gap-4 border border-slate-300 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-900/40 font-sans text-[11px]">
                      <div><strong>Tên tàu / Ship's Name:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.shipName || viewRecordDetail.vesselName}</span></div>
                      <div><strong>Tháng / Month-Year:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.monthYear || ''}</span></div>
                    </div>

                    {/* Cleaning Schedule Grid Table */}
                    <div className="mt-4 border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
                      <table className="w-full text-left border-collapse text-[10px]">
                        <thead>
                          <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 uppercase font-bold text-[9px] border-b border-slate-300 dark:border-slate-700">
                            <th className="p-1.5 border-r border-slate-300 dark:border-slate-700 w-[40px] text-center">STT</th>
                            <th className="p-1.5 border-r border-slate-300 dark:border-slate-700 w-[180px]">Hạng mục</th>
                            <th className="p-1.5 border-r border-slate-300 dark:border-slate-700 w-[100px]">Chu kỳ</th>
                            <th className="p-1.5 border-r border-slate-300 dark:border-slate-700 w-[240px]">Phương thức vệ sinh</th>
                            <th className="p-1.5 border-r border-slate-300 dark:border-slate-700 w-[120px]">Người thực hiện</th>
                            <th className="p-1.5">Lưu ý</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cleaningCategories.map((category) => (
                            <React.Fragment key={category.prefix}>
                              <tr className="bg-blue-50/30 dark:bg-blue-900/20 text-primary dark:text-blue-300 font-bold border-b border-slate-300 dark:border-slate-700">
                                <td colSpan={6} className="p-1.5 text-[10px] uppercase font-bold">{category.title}</td>
                              </tr>
                              {category.items.map((item) => {
                                const key = `${category.prefix}_perf_${item.num}`;
                                return (
                                  <tr key={item.num} className="border-b border-slate-200 dark:border-slate-800">
                                    <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 text-center text-slate-500">{item.num}</td>
                                    <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 font-semibold text-slate-900 dark:text-slate-100">{item.name}</td>
                                    <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 italic">{item.cycle}</td>
                                    <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 leading-tight">{item.method}</td>
                                    <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 font-medium text-accent dark:text-blue-400">
                                      {filled[key] || <span className="text-slate-400 italic">Chưa nhập</span>}
                                    </td>
                                    <td className="p-1.5 text-slate-500 italic text-[9px]">{item.note}</td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : viewRecordDetail.formCode === 'TL-02-01' ? (
            <div className="space-y-4 font-serif text-slate-800 dark:text-slate-200 text-xs">
              {/* Header Table */}
              <div className="border border-slate-300 dark:border-slate-700 grid grid-cols-12 items-stretch text-center font-sans">
                <div className="col-span-3 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-2">
                  <div className="w-8 h-8 rounded-full border border-accent flex items-center justify-center mb-1 text-accent text-xs font-bold">⚓</div>
                  <span className="text-[8px] font-extrabold tracking-tight leading-tight text-primary dark:text-blue-300 uppercase">HP SHIPPING</span>
                </div>
                <div className="col-span-6 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-2 bg-slate-50/30 dark:bg-slate-900/30">
                  <h3 className="font-extrabold text-[10px] leading-snug uppercase tracking-tight text-slate-800 dark:text-white">
                    BIÊN BẢN SOÁT XÉT CÔNG TÁC QUẢN LÝ AN TOÀN,<br/>SỨC KHỎE, BẢO VỆ MÔI TRƯỜNG
                  </h3>
                  <span className="italic text-[9px] text-slate-500 font-semibold">Master's Review of the SLMS</span>
                </div>
                <div className="col-span-3 flex flex-col justify-center p-2 text-left text-[8px] space-y-0.5">
                  <div><strong>Mã:</strong> <span className="font-mono text-accent dark:text-blue-400 font-bold">TL-02-01</span></div>
                  <div><strong>Ngày BH:</strong> <span className="font-mono">20/10/2016</span></div>
                  <div><strong>Lần sửa đổi:</strong> <span className="font-mono">00</span></div>
                </div>
              </div>

              {/* Metadata Row */}
              {(() => {
                const filled = JSON.parse(viewRecordDetail.filledData || '{}');
                return (
                  <>
                    <div className="grid grid-cols-2 gap-4 border border-slate-300 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-900/40 font-sans text-[11px]">
                      <div><strong>Tên tàu / Ship's Name:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.shipName || viewRecordDetail.vesselName}</span></div>
                      <div><strong>Loại tàu / Ship Type:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.shipType || 'Bulk Carrier'}</span></div>
                      <div><strong>Thuyền trưởng / Master:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.masterName || viewRecordDetail.filledBy}</span></div>
                      <div><strong>Ngày lập / Date:</strong> <span className="ml-1 text-slate-900 dark:text-white font-mono">{filled.reviewDate || viewRecordDetail.filledDate.split('T')[0]}</span></div>
                    </div>

                    <div className="mt-4 space-y-4">
                      {[
                        {
                          id: 'reviewItem1',
                          num: '1',
                          en: 'Are personnel aware of and understand the Company policies? Are there any areas of policy where staff consider that improvement could be made?',
                          vi: 'Nhận thức của thuyền viên về các chính sách của Công ty? Những phần nào của chính sách cần được chú trọng nâng cao cho thuyền viên?'
                        },
                        {
                          id: 'reviewItem2',
                          num: '2',
                          en: 'Is the SLMS easily and readily accessible to all relevant staff? Do the officers and crew have a relevant understanding of the procedures contained in SLMS in relation to safety and their responsibilities onboard?',
                          vi: 'Thuyền viên có thể dễ dàng tiếp cận với tài liệu QLAT&LĐHH? Thuyền viên và sỹ quan có hiểu được các quy trình và nhiệm vụ liên quan đến mình?'
                        },
                        {
                          id: 'reviewItem3',
                          num: '3',
                          en: 'Are records, filing and checklists being completed as required? What improvements would you recommend in relation to these areas of the SLMS?',
                          vi: 'Các báo cáo, danh mục kiểm tra và cặp hồ sơ lưu được thực hiện theo yêu cầu? Những khuyến nghị để công tác này được thực hiện tốt hơn?'
                        },
                        {
                          id: 'reviewItem4',
                          num: '4',
                          en: 'Summarise any significant internal and external audit findings since last review and comment on any issues that may have come about as a result and corrective actions.',
                          vi: 'Tóm tắt những phát hiện quan trọng trong đánh giá nội bộ và của bên ngoài kể từ lần soát xét trước, những nhận xét về các vấn đề liên quan đến việc thực hiện các hành động khắc phục.'
                        },
                        {
                          id: 'reviewItem5',
                          num: '5',
                          en: 'Briefly summarise any significant findings or defects raised by any third party since last review such as Port State and comment on steps taken to avoid recurrence.',
                          vi: 'Tóm tắt những phát hiện, lỗi quan trọng trong các cuộc kiểm tra của PSC kể từ lần soát xét trước và những khuyến nghị về các hành động cần thiết để tránh lặp lại lỗi đó.'
                        },
                        {
                          id: 'reviewItem6',
                          num: '6',
                          en: 'Summarise accidents/ incidents since last review and comment on steps taken to avoid recurrence.',
                          vi: 'Tóm tắt những tai nạn/ sự cố kể từ lần soát xét và những khuyến nghị về các hành động cần thiết để tránh lặp lại sự cố đó.'
                        },
                        {
                          id: 'reviewItem7',
                          num: '7',
                          en: 'Any customer (i.e. Owner and/or Charterers) feedback regarding satisfaction or complaints.',
                          vi: 'Những nhận xét, khiếu nại của khách hàng/ người thuê tàu.'
                        },
                        {
                          id: 'reviewItem8',
                          num: '8',
                          en: 'What general improvements do you consider could be made to the SLMS?',
                          vi: 'Những cải tiến cần thiết đối với HTQLAT&LĐHH?'
                        },
                        {
                          id: 'reviewItem9',
                          num: '9',
                          en: 'Discuss any training carried out during command and comment on its effectiveness. What areas of training would you consider that could be improved or made more beneficial?',
                          vi: 'Những cuộc huấn luyện và đào tạo đã thực hiện trong thời gian điều hành tàu của Thuyền trưởng và nhận xét về hiệu quả của các buổi đào tạo, những việc làm cần thiết để nâng cao hiệu quả đào tạo?'
                        },
                        {
                          id: 'reviewItem10',
                          num: '10',
                          en: 'Document Review / Soát xét hệ thống tài liệu. Please recommend any significant changes which you consider should be made in order to improve the effectiveness of the SLMS and/or the safe and efficient running of your vessel and include the reasons for same. Please ensure that you list the revision number and chapter/section reference.',
                          vi: 'Nêu những sửa đổi lớn cần thiết để nâng cao hiệu lực của Sổ tay QLAT&LĐHH. Nêu rõ tên quy trình, số kiểm soát, lần sửa đổi và phần cần sửa đổi.'
                        }
                      ].map((item) => (
                        <div key={item.id} className="space-y-1.5 border-b border-slate-200 dark:border-slate-800 pb-3">
                          <div className="font-sans font-bold text-slate-800 dark:text-white flex items-start gap-2">
                            <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">{item.num}</span>
                            <div className="space-y-0.5">
                              <p className="text-[11px] text-slate-700 dark:text-slate-200">{item.en}</p>
                              <p className="text-[11px] text-slate-500 italic font-medium">{item.vi}</p>
                            </div>
                          </div>
                          <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-[11px] leading-relaxed text-slate-800 dark:text-white font-sans whitespace-pre-wrap">
                            {filled[item.id] || '--- Không có thông tin / No comment ---'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          ) : viewRecordDetail.formCode === 'TL-15-01' ? (
            <div className="space-y-6 font-sans text-slate-800 dark:text-slate-200 text-xs">
              {/* Header Table */}
              <div className="border border-slate-300 dark:border-slate-700 grid grid-cols-12 items-stretch text-center font-sans">
                <div className="col-span-3 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-2">
                  <div className="w-8 h-8 rounded-full border border-accent flex items-center justify-center mb-1 text-accent text-xs font-bold">⚓</div>
                  <span className="text-[8px] font-extrabold tracking-tight leading-tight text-primary dark:text-blue-300 uppercase">HP SHIPPING</span>
                </div>
                <div className="col-span-6 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-2 bg-slate-50/30 dark:bg-slate-900/30">
                  <h3 className="font-extrabold text-[10px] leading-snug uppercase tracking-tight text-slate-800 dark:text-white">
                    KẾ HOẠCH NHẬN NHIÊN LIỆU / BUNKERING PLAN
                  </h3>
                  <span className="italic text-[8px] text-slate-500 font-semibold uppercase">SAFETY MANAGEMENT SYSTEM - CHECKLIST</span>
                </div>
                <div className="col-span-3 flex flex-col justify-center p-2 text-left text-[8px] space-y-0.5">
                  <div><strong>Mã biểu mẫu:</strong> <span className="font-mono text-accent dark:text-blue-400 font-bold">TL-15-01</span></div>
                  <div><strong>Ngày ban hành:</strong> <span className="font-mono">20/10/2016</span></div>
                  <div><strong>Lần sửa đổi:</strong> <span className="font-mono">0</span></div>
                </div>
              </div>

              {/* Metadata Row */}
              {(() => {
                let filled: any = {};
                try {
                  filled = JSON.parse(viewRecordDetail.filledData || '{}');
                } catch (e) {
                  filled = {};
                }
                const products = filled.products || [];
                const personnel = filled.personnel || [];
                const distribution = filled.distribution || [];
                const gauging = filled.gauging || [];

                const getCheckboxStatus = (val: any) => {
                  return val === true || val === 'true' ? (
                    <span className="text-emerald-600 font-bold">✓ Đạt / Yes</span>
                  ) : (
                    <span className="text-rose-500 font-medium">✗ Không / No</span>
                  );
                };

                return (
                  <>
                    <div className="grid grid-cols-3 gap-4 border border-slate-300 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-900/40 font-sans text-[11px] rounded-lg">
                      <div><strong>Tên tàu / Vessel:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.vessel || viewRecordDetail.vesselName}</span></div>
                      <div><strong>Vị trí / Location:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.location || ''}</span></div>
                      <div><strong>Xà lan/Cảng / Supply:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.supplyBarge || ''}</span></div>
                      <div><strong>Ngày nhận / Date:</strong> <span className="ml-1 text-slate-900 dark:text-white font-mono">{filled.bunkerDate || ''}</span></div>
                      <div><strong>Mớn nước mũi / Fore:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.foreDraft || ''}</span></div>
                      <div><strong>Mớn nước lái / Aft:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.aftDraft || ''}</span></div>
                    </div>

                    {/* Section 1 */}
                    <div>
                      <h4 className="font-extrabold text-[10px] uppercase text-primary dark:text-blue-400 mb-1 border-b border-accent/30 dark:border-blue-800 pb-0.5">
                        1. Loại nhiên liệu nhận / Product to be Handled
                      </h4>
                      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-200 uppercase font-bold text-[9px] border-b border-slate-200 dark:border-slate-700">
                              <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center w-[40px]">STT</th>
                              <th className="p-1.5 border-r border-slate-200 dark:border-slate-700">Chủng loại / Grade</th>
                              <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center">Tỷ trọng / Density</th>
                              <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center">Lượng nhận / Stemmed</th>
                              <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center">Lượng có sẵn / Onboard</th>
                              <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center">Thời gian / Duration</th>
                              <th className="p-1.5 text-center">ROB Completion</th>
                            </tr>
                          </thead>
                          <tbody>
                            {products.map((row: any, idx: number) => (
                              <tr key={idx} className="border-b border-slate-200 dark:border-slate-800">
                                <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 text-center">{idx + 1}</td>
                                <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 font-bold">{row.grade}</td>
                                <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 text-center">{row.density}</td>
                                <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 text-center">{row.stemmedQty}</td>
                                <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 text-center">{row.qtyOnboard}</td>
                                <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 text-center">{row.duration}</td>
                                <td className="p-1.5 text-center">{row.robCompletion}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Section 2 */}
                    <div>
                      <h4 className="font-extrabold text-[10px] uppercase text-primary dark:text-blue-400 mb-1 border-b border-accent/30 dark:border-blue-800 pb-0.5">
                        2. Trách nhiệm của thành viên tham gia / Responsibilities of Personnel
                      </h4>
                      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-200 uppercase font-bold text-[9px] border-b border-slate-200 dark:border-slate-700">
                              <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center w-[40px]">STT</th>
                              <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 w-[150px]">Chức danh / Rank</th>
                              <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 w-[180px]">Họ tên / Name</th>
                              <th className="p-1.5">Nhiệm vụ cụ thể / Specific Duty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {personnel.map((row: any, idx: number) => (
                              <tr key={idx} className="border-b border-slate-200 dark:border-slate-800">
                                <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 text-center">{idx + 1}</td>
                                <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 font-bold">{row.rank}</td>
                                <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 font-medium">{row.name}</td>
                                <td className="p-1.5 text-slate-600 dark:text-slate-350">{row.duty}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Section 3-6 Checklists */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-1 text-slate-700 dark:text-slate-300">3. Thiết bị đo & Độ chính xác / Calibration</div>
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-slate-500">Áp kế nhận hàng đã hiệu chuẩn / Pressure gauge calibrated</span>
                          {getCheckboxStatus(filled.chk_pressure_gauge)}
                        </div>
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-slate-500">Thước đo dầu có tem hiệu chuẩn / Sounding tape calibrated</span>
                          {getCheckboxStatus(filled.chk_sounding_tape)}
                        </div>
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-slate-500">Bảng hiệu chuẩn két sẵn sàng / Tank calibration table ready</span>
                          {getCheckboxStatus(filled.chk_calibration_table)}
                        </div>
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-slate-500">Máy tính tính toán đã kiểm tra / Calculation computer checked</span>
                          {getCheckboxStatus(filled.chk_computer)}
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-1 text-slate-700 dark:text-slate-300">4. Báo động mức cao & 5. Đo nhiệt độ</div>
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-slate-500">Thử hoạt động còi/đèn báo động mức cao / High-level alarms tested</span>
                          {getCheckboxStatus(filled.chk_reset_alarm)}
                        </div>
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-slate-500">Cảm biến nhiệt độ tự động / Remote temp sensor</span>
                          {getCheckboxStatus(filled.chk_temp_sensor)}
                        </div>
                        <div className="flex justify-between items-start gap-2">
                          <span className="text-slate-500">Đo bằng nhiệt kế cầm tay / Portable thermometer</span>
                          {getCheckboxStatus(filled.chk_thermometer)}
                        </div>
                      </div>
                    </div>

                    {/* Section 6 */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-1 text-slate-700 dark:text-slate-300">6. Kiểm soát hơi thoát và đo khí độc / Vapor control and gas check</div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-slate-500">Thông gió khu vực lỗ đo / Ventilate sounding pipes</span>
                            {getCheckboxStatus(filled.chk_ventilate_sounding)}
                          </div>
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-slate-500">Kiểm tra hàm lượng khí H2S & Benzene / H2S & Benzene checked</span>
                            {getCheckboxStatus(filled.chk_h2s_benzene)}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-slate-500">Máy đo khí cháy HC hoạt động tốt / HC gas detector checked</span>
                            {getCheckboxStatus(filled.chk_hc_detector)}
                          </div>
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-slate-500">SCBA sẵn sàng khẩn cấp / SCBA ready for emergency</span>
                            {getCheckboxStatus(filled.chk_respiratory_ready)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 7 */}
                    <div>
                      <h4 className="font-extrabold text-[10px] uppercase text-primary dark:text-blue-400 mb-1 border-b border-accent/30 dark:border-blue-800 pb-0.5">
                        7. Phân phối nhiên liệu và sơ đồ đường ống / Distribution of Bunker Oil and Pipe Line-up
                      </h4>
                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs mb-2 font-mono leading-relaxed">
                        <span className="text-slate-400 block font-sans text-[10px] font-bold mb-1">MÔ TẢ THIẾT LẬP VAN / PIPING LINE-UP DESCRIPTION:</span>
                        {filled.line_up_piping || 'Chưa thiết lập sơ đồ van'}
                      </div>
                      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-200 uppercase font-bold text-[9px] border-b border-slate-200 dark:border-slate-700">
                              <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center w-[40px]">STT</th>
                              <th className="p-1.5 border-r border-slate-200 dark:border-slate-700">Két nhận / Receiving Tank</th>
                              <th className="p-1.5 border-r border-slate-200 dark:border-slate-700">Các van mở / Valves opened</th>
                              <th className="p-1.5 border-r border-slate-200 dark:border-slate-700">Van đóng cách ly / Isolated</th>
                              <th className="p-1.5 border-r border-slate-200 dark:border-slate-700">Két chứa tràn / Overflow</th>
                              <th className="p-1.5 text-center">Van tràn mở</th>
                            </tr>
                          </thead>
                          <tbody>
                            {distribution.map((row: any, idx: number) => (
                              <tr key={idx} className="border-b border-slate-200 dark:border-slate-800">
                                <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 text-center">{idx + 1}</td>
                                <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 font-bold">{row.recvTank}</td>
                                <td className="p-1.5 border-r border-slate-200 dark:border-slate-800">{row.valveOpened}</td>
                                <td className="p-1.5 border-r border-slate-200 dark:border-slate-800">{row.valveClosed}</td>
                                <td className="p-1.5 border-r border-slate-200 dark:border-slate-800">{row.overflowTank}</td>
                                <td className="p-1.5 text-center font-bold text-emerald-600">{row.overflowValveOpened}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Section 8 */}
                    <div>
                      <h4 className="font-extrabold text-[10px] uppercase text-primary dark:text-blue-400 mb-1 border-b border-accent/30 dark:border-blue-800 pb-0.5">
                        8. Lưu lượng nhận nhiên liệu dự kiến / Expected Loading Rates
                      </h4>
                      <div className="grid grid-cols-3 gap-4 border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-900/40 rounded-lg text-center">
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">Ban đầu / Initial Rate</div>
                          <div className="text-xs font-extrabold text-slate-800 dark:text-white mt-0.5">{filled.rate_initial || 'N/A'} Mts/Hr</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">Tối đa / Max Rate</div>
                          <div className="text-xs font-extrabold text-slate-800 dark:text-white mt-0.5">{filled.rate_max || 'N/A'} Mts/Hr</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">Topping-off Rate</div>
                          <div className="text-xs font-extrabold text-slate-800 dark:text-white mt-0.5">{filled.rate_topping || 'N/A'} Mts/Hr</div>
                        </div>
                      </div>
                    </div>

                    {/* Section 9 */}
                    <div>
                      <h4 className="font-extrabold text-[10px] uppercase text-primary dark:text-blue-400 mb-1 border-b border-accent/30 dark:border-blue-800 pb-0.5">
                        9. Bảng đo các két trước và sau nhận / Gauging of Tanks
                      </h4>
                      <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <table className="w-full text-left border-collapse text-[9px]">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-200 uppercase font-bold text-[8px] border-b border-slate-200 dark:border-slate-700">
                              <th rowSpan={2} className="p-1 border-r border-slate-200 dark:border-slate-700 text-center w-[30px]">STT</th>
                              <th rowSpan={2} className="p-1 border-r border-slate-200 dark:border-slate-700">Két / Tank</th>
                              <th colSpan={2} className="p-1 border-r border-slate-200 dark:border-slate-700 text-center">Dung tích 85%</th>
                              <th colSpan={3} className="p-1 border-r border-slate-200 dark:border-slate-700 text-center">Đo trước nhận</th>
                              <th colSpan={2} className="p-1 border-r border-slate-200 dark:border-slate-700 text-center">Dự kiến sau nhận</th>
                              <th colSpan={2} className="p-1 border-r border-slate-200 dark:border-slate-700 text-center">Mức giảm tốc</th>
                              <th rowSpan={2} className="p-1 text-center w-[50px]">Seq</th>
                            </tr>
                            <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 border-b border-slate-200 dark:border-slate-700 text-[8px]">
                              <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Sound</th>
                              <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Vol</th>
                              <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Sound</th>
                              <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Vol</th>
                              <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Temp</th>
                              <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Sound</th>
                              <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Vol</th>
                              <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Sound</th>
                              <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Vol</th>
                            </tr>
                          </thead>
                          <tbody>
                            {gauging.map((row: any, idx: number) => (
                              <tr key={idx} className="border-b border-slate-200 dark:border-slate-800">
                                <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-center">{idx + 1}</td>
                                <td className="p-1 border-r border-slate-200 dark:border-slate-800 font-bold">{row.tank}</td>
                                <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-center">{row.capSound}</td>
                                <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-center font-semibold">{row.capVol}</td>
                                <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-center">{row.preSound}</td>
                                <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-center font-semibold">{row.preVol}</td>
                                <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-center">{row.preTemp}</td>
                                <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-center">{row.postSound}</td>
                                <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-center font-semibold">{row.postVol}</td>
                                <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-center">{row.reduceSound}</td>
                                <td className="p-1 border-r border-slate-200 dark:border-slate-800 text-center font-semibold">{row.reduceVol}</td>
                                <td className="p-1 text-center font-bold text-accent">{row.seq}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Sum Calculations */}
                      <div className="grid grid-cols-3 gap-2 mt-2 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] text-center font-bold">
                        <div>Tổng 85% / Total 85% Cap: <span className="text-slate-800 dark:text-white font-mono ml-1">{gauging.reduce((sum: number, r: any) => sum + (parseFloat(r.capVol) || 0), 0).toFixed(2)} m³</span></div>
                        <div>Tổng trước nhận / Total Pre: <span className="text-slate-800 dark:text-white font-mono ml-1">{gauging.reduce((sum: number, r: any) => sum + (parseFloat(r.preVol) || 0), 0).toFixed(2)} m³</span></div>
                        <div>Dự kiến sau nhận / Total Post: <span className="text-slate-800 dark:text-white font-mono ml-1">{gauging.reduce((sum: number, r: any) => sum + (parseFloat(r.postVol) || 0), 0).toFixed(2)} m³</span></div>
                      </div>
                    </div>

                    {/* Section 10 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-1 text-slate-700 dark:text-slate-300">10. Thông tin liên lạc & Ngắt khẩn cấp / Comm</div>
                        <div className="space-y-1.5 text-xs">
                          <div><strong>Phương thức liên lạc / Comm method:</strong> <span className="text-slate-900 dark:text-white font-medium block mt-0.5">{filled.comm_ship_barge || 'N/A'}</span></div>
                          <div><strong>Tín hiệu dừng khẩn cấp / Emergency stop:</strong> <span className="text-slate-900 dark:text-white font-medium block mt-0.5">{filled.comm_stop_signal || 'N/A'}</span></div>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-1 text-slate-700 dark:text-slate-300">12. Thiết bị ứng phó sự cố tràn dầu / Spill Equip</div>
                        <div className="space-y-1.5 text-xs">
                          <div><strong>Vị trí SOPEP tàu / Ship's SOPEP:</strong> <span className="text-slate-900 dark:text-white font-medium block mt-0.5">{filled.spill_loc1 || 'N/A'}</span></div>
                          <div><strong>Thiết bị xà lan / Barge SOPEP:</strong> <span className="text-slate-900 dark:text-white font-medium block mt-0.5">{filled.spill_loc2 || 'N/A'}</span></div>
                        </div>
                      </div>
                    </div>

                    {/* Section 11 */}
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-1 text-slate-700 dark:text-slate-300">11. Các địa chỉ liên lạc khẩn cấp tại địa phương / Local Emergency Contacts</div>
                      <div className="text-xs text-slate-800 dark:text-white font-mono leading-relaxed whitespace-pre-wrap">{filled.local_contacts || 'N/A'}</div>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : (
            /* Filled Fields (Standard) */
            <div className="space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Dữ liệu biểu mẫu chi tiết</span>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs border border-slate-100 dark:border-slate-800 rounded-xl p-3 bg-white dark:bg-slate-900 space-y-2">
                {Object.entries(JSON.parse(viewRecordDetail.filledData || '{}')).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center py-2">
                    <span className="text-slate-500 font-medium capitalize">{key.replace('chk_', '').replace('chk', '').replace('prep_', '').replace('gas_', '')}</span>
                    <span className="font-semibold text-slate-800 dark:text-white font-mono">
                      {typeof val === 'boolean' ? (val ? '✅ Có / Đạt' : '❌ Không / Chưa đạt') : String(val)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Digital Signature Stamps */}
          <div className="space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Chữ ký số đã kiểm tra hợp lệ</span>
            <div className="grid grid-cols-1 gap-2">
              {JSON.parse(viewRecordDetail.digitalSignatures || '[]').map((sig: any, idx: number) => {
                const name = sig.name || sig.Name || '';
                const rank = sig.rank || sig.Rank || '';
                const sigCode = sig.sigCode || sig.SigCode || '';
                const timestamp = sig.timestamp || sig.Timestamp || '';
                const timeStr = timestamp.replace('T', ' ').substring(0, 16);
                return (
                  <div key={idx} className="border border-emerald-500/35 bg-emerald-500/[0.03] p-3 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 rounded-lg">
                        <Check className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold text-slate-800 dark:text-white">{name}</div>
                        <div className="text-[10px] text-slate-500">{rank}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">{sigCode}</div>
                      <div className="text-[9px] text-slate-400 font-mono mt-0.5">{timeStr} UTC</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex justify-end gap-2 flex-shrink-0 rounded-b-2xl">
          <button
            onClick={handlePrintRecord}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            In / Xuất PDF
          </button>
          <button
            onClick={() => setViewRecordDetail(null)}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-semibold transition"
          >
            Đóng cửa sổ
          </button>
        </div>

      </div>
    </div>
  );
}
