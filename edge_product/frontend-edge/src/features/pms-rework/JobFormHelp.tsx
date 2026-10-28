import { useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { Modal } from './ui'

const guides = {
  information: {
    title: 'Thông tin công việc',
    intro: 'Form này tạo Job — định nghĩa công việc bảo trì. WO là lệnh thực hiện từng lần, được phát hành từ Job. Không nhập kết quả thực hiện hoặc duyệt tại đây.',
    fields: [
      ['Mã công việc *', 'Mã riêng, bắt buộc và không trùng mã đã có, kể cả công việc đã xóa mềm. Ví dụ: CV-001.'],
      ['Tên công việc *', 'Tên dễ hiểu, ví dụ: Kiểm tra và vệ sinh Air Cooler.'],
      ['Thiết bị', 'Tìm theo tên hoặc mã rồi chọn một thiết bị cụ thể; không chọn thư mục nhóm. Có thể lưu khi thiếu, nhưng chưa đủ điều kiện phát hành WO.'],
      ['Loại bảo trì', 'Định kỳ, Lên đà, Theo yêu cầu hoặc Theo chuyến. Hiện tự sinh WO đã triển khai cho Định kỳ; luồng phát hành theo sự kiện của các loại còn lại chưa hoàn thiện.'],
      ['Ưu tiên', 'Thấp, Trung bình, Cao hoặc Khẩn cấp. Thể hiện mức quan trọng, không thay đổi chu kỳ hoặc cấp quyền duyệt.'],
      ['Mã công việc nguồn', 'Mã đối chiếu Excel, tài liệu hãng hoặc danh mục gốc, ví dụ A001. Đây không phải mã thiết bị.'],
      ['Hướng dẫn', 'Nội dung cần làm, phương pháp, yêu cầu kỹ thuật và lưu ý. Kết quả được ghi ở WO khi thực hiện.'],
    ],
  },
  cycle: {
    title: 'Chu kỳ và mốc bắt đầu tính hạn',
    intro: 'Mốc ban đầu chỉ là căn cứ tính hạn đầu tiên. Lưu Job không ghi nhận một lần bảo trì đã hoàn tất. Chưa đủ mốc vẫn có thể lưu để bổ sung sau.',
    fields: [
      ['Tính chu kỳ theo', 'Lịch: theo ngày/tháng/năm. Giờ chạy: theo counter thiết bị. Lịch hoặc giờ chạy: điều kiện nào đến trước thì áp dụng, không sinh hai WO cho cùng kỳ.'],
      ['Chu kỳ lịch', 'Khoảng cách giữa các lần bảo trì, ví dụ 3 tháng, 1 năm hoặc 30 ngày. Tháng/năm tính theo lịch, không quy đổi cố định thành 30/365 ngày.'],
      ['Mốc bắt đầu (giờ tàu)', 'Ngày giờ tham chiếu, nhập theo múi giờ tàu. Ví dụ 01/10/2026 + 3 tháng → hạn đầu 01/01/2027. Nhập mốc không có nghĩa đã hoàn thành bảo trì.'],
      ['Chu kỳ giờ chạy', 'Khoảng cách giờ giữa các lần bảo trì. Ví dụ mỗi 100 giờ phải bảo trì.'],
      ['Counter mốc ban đầu', 'Giờ chạy tham chiếu, không phải chu kỳ. Mốc 200 giờ + chu kỳ 100 giờ → hạn đầu 300 giờ. Giá trị 0 khác với để trống.'],
      ['Nguồn đối chiếu mốc', 'Căn cứ xác định mốc: nhật ký máy, biên bản bảo dưỡng, hồ sơ bàn giao… Hệ thống không tự đọc số liệu từ tài liệu này.'],
      ['Lý do thay đổi mốc', 'Giải thích khi sửa mốc đã có. Có thể để trống khi tạo mới; thay mốc khi Job đã có WO/lịch sử cần lý do và được ghi nhật ký.'],
      ['Cảnh báo trước (ngày)', 'Số ngày còn lại để coi là Sắp đến hạn. Mặc định 7 ngày, áp dụng cho phần chu kỳ lịch.'],
      ['Cảnh báo trước (giờ chạy)', 'Số giờ còn lại để coi là Sắp đến hạn. Mặc định 50 giờ, áp dụng cho chu kỳ giờ chạy.'],
      ['Phát hành WO khi', 'Sắp đến hạn: được phát hành từ khoảng cảnh báo. Đến hạn: chờ đúng hạn hoặc quá hạn.'],
      ['Tự động phát hành / Tạo WO theo chu kỳ', 'Bật: tàu tự phát hành khi Job đủ điều kiện và tới khoảng phát hành, kể cả mất kết nối bờ. Tắt: dùng nút Phát hành WO thủ công. Dữ liệu được đồng bộ khi có kết nối lại.'],
    ],
    note: 'Ví dụ: mốc 0 giờ, chu kỳ 100 giờ, cảnh báo 50 giờ. Bật tự động và chọn Sắp đến hạn → có thể sinh WO từ 50 giờ; chọn Đến hạn → từ 100 giờ. Tắt tự động → tăng counter không tự sinh WO. Sau khi WO được duyệt, kỳ sau tính từ thời điểm gửi hoàn tất và giờ chạy trong báo cáo được duyệt, không lấy ngày duyệt muộn hơn làm mốc.',
  },
  responsibility: {
    title: 'Trách nhiệm',
    intro: 'Trách nhiệm quản lý Job, phân công thực hiện WO và quyền duyệt là những thông tin riêng biệt.',
    fields: [
      ['Bộ phận phụ trách', 'Chọn Boong, Máy, Phục vụ hoặc Khác từ danh mục thống nhất với chức danh. Nếu chức danh đồng bộ có bộ phận mới, danh sách cũng bổ sung. Khi chọn chức danh, bộ phận tự điền và không sửa riêng; bỏ chọn chức danh để tự chọn bộ phận.'],
      ['Chức danh chịu trách nhiệm', 'Chức danh phụ trách Job, ví dụ Đại phó hoặc Máy trưởng. Chọn ở đây không đổi chức danh hoặc quyền của tài khoản.'],
      ['Người chịu trách nhiệm', 'Người theo dõi, quản lý Job; không mặc nhiên là người thực hiện WO hoặc người duyệt.'],
      ['Phân công cho từng WO', 'Chọn người khi WO phát hành: lệnh sinh ra chờ phân công. Người thực hiện mặc định: chọn trước người để các WO kế thừa.'],
      ['Người thực hiện mặc định', 'Xuất hiện khi phân công trước. Khi phát hành, hệ thống kiểm tra người này còn trên tàu và hợp lệ; không tự chọn người khác thay thế.'],
    ],
  },
  checklist: {
    title: 'Checklist mẫu',
    intro: 'Checklist được sao chép vào WO khi phát hành. Sửa mẫu Job không sửa ngược checklist của WO đã phát hành.',
    fields: [
      ['Nội dung kiểm tra', 'Bước cần thực hiện hoặc hạng mục cần kiểm tra.'],
      ['Cần số đo', 'Bắt buộc ghi giá trị đo khi hoàn tất bước này.'],
      ['Đơn vị', 'Chọn đơn vị số đo trong danh sách có sẵn, ví dụ °C, bar, mm. Không nhập tự do. Đơn vị cũ đã lưu vẫn được giữ nguyên khi sửa.'],
      ['Min / Max', 'Khoảng tham chiếu. Giá trị đo ngoài khoảng được đánh dấu bất thường.'],
      ['Thêm mục / Xóa mục', 'Chỉnh danh sách các bước mẫu cho những WO phát hành sau này.'],
    ],
  },
}

export function JobFormHelp({ group }: { group: keyof typeof guides }) {
  const [open, setOpen] = useState(false), guide = guides[group]
  return <><button type="button" aria-label={`Giải thích: ${guide.title}`} title={`Giải thích các trường: ${guide.title}`} onClick={() => setOpen(true)} className="inline-flex shrink-0 rounded p-0.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"><CircleAlert size={16} aria-hidden="true" /></button>
    {open && <Modal title={`Hướng dẫn · ${guide.title}`} onClose={() => setOpen(false)}><div className="mx-auto max-w-4xl"><p className="mb-4 rounded border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-slate-700">{guide.intro}</p><dl className="divide-y divide-gray-200 rounded border border-gray-200">{guide.fields.map(([name, text]) => <div key={name} className="grid gap-1 px-4 py-3 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-5"><dt className="text-sm font-medium text-slate-800">{name}</dt><dd className="text-sm leading-6 text-slate-600">{text}</dd></div>)}</dl>{'note' in guide && <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-slate-700"><h3 className="mb-1 font-medium">Ví dụ tính hạn và phát hành WO</h3>{guide.note}</div>}</div></Modal>}
  </>
}
