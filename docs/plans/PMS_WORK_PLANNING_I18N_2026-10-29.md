# English / Vietnamese cho Danh sách công việc — 29/10/2026

- Checkpoint trước khi làm i18n đã push lên origin/hiu67-rework: a7752d02ff2c70024119bf54cce4863a2621e292.
- Dùng catalog en.json/vi.json hiện có và múi giờ tàu hiện có. Khóa mới nằm dưới pmsRework; helper ngoài React đọc ngôn ngữ tại thời điểm gọi, các component đăng ký thay đổi qua I18nContext.
- Phạm vi: Job List, Work Order, Lịch, Gantt, Counter, form Job/WO, hướng dẫn từng nhóm trường, checklist, nhập Excel, chi tiết Job/WO, thực hiện, kiểm tra, báo cáo và lịch sử. Các thành phần modal, bộ lọc, phân trang và xác nhận duyệt dùng chung cũng nối catalog.
- Trạng thái, chu kỳ, bộ phận chuẩn, nhãn ngày/số và các thông báo hệ thống đã biết thay đổi theo ngôn ngữ. Từ khóa nghiệp vụ/payload API, mã enum, mã thiết bị, tên người/thiết bị/công việc, ghi chú, nội dung báo cáo và bản snapshot ký giữ nguyên. Lỗi hệ thống chưa có ánh xạ được giữ nguyên thay vì dịch đoán hoặc thay nội dung.
- File Excel vẫn giữ tên sheet và tiêu đề theo mẫu BQBD đã thống nhất. Tham chiếu Máy/Boong, Danh_muc_thiet_bi, Huong_dan trong hướng dẫn English là tên thật của sheet.
- Không đổi style, quyền, cơ chế sinh WO, dữ liệu vận hành hoặc dịch vụ backend.

## Kiểm tra

- 19 kiểm tra PMS đạt: khóa và tham số hai catalog khớp, không còn chữ Việt viết trực tiếp trong JSX thuộc phạm vi, các khóa dùng trong UI đều tồn tại; đổi locale cập nhật cả formatter/nhãn tiện ích; giữ nguyên nội dung người dùng và snapshot. Các kiểm tra import/mốc/timezone/quyền hiện có tiếp tục đạt.
- Build frontend đạt.
- Thử trực tiếp English: Job List, Work Order, form Job, trợ giúp chu kỳ, form WO đột xuất, import, lịch với thứ Mon–Sun, Gantt và Counter. Chuyển lại Vietnamese không cần đăng nhập lại; trả lại ngôn ngữ và tab Work Order như trước khi thử. Không tạo/sửa/xóa Job hoặc WO trong đợt kiểm tra ngôn ngữ.
- Ảnh và log kiểm tra nằm trong outputs/pms-job-bqbd-20261028/pms-i18n-* và artifacts/pms-i18n-*.log (không đưa vào Git).

