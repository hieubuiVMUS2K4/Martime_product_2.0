# Công việc định kỳ dùng một task

## Hành vi

- Khi phê duyệt hoàn thành, giữ nguyên ID và mã công việc. Lưu báo cáo `COMPLETED` vào lịch sử rồi đặt lại chính task đó thành `SCHEDULED` cho kỳ tiếp theo nếu cấu hình có chu kỳ, còn hoạt động và tự động lên lịch.
- Lưu riêng mỗi lần thực hiện trong `maintenance_histories`, gồm báo cáo, checklist, chi tiết kiểm tra, ảnh, vật tư, đánh giá rủi ro và biên bản kiểm tra. Dữ liệu này không bị ghi đè khi mở kỳ mới.
- `MaintenanceCycleWorker` kiểm tra mỗi phút và khi khởi động dịch vụ. Worker và Counter dùng chung `MaintenanceCycleUpdater`: còn xa hạn là `SCHEDULED`, vào vùng cảnh báo là `UPCOMING`, đạt/vượt hạn là `DUE`/`OVERDUE`.
- Với chu kỳ giờ chạy, chỉ mở kỳ mới khi giờ chạy thực tế đạt ngưỡng; ngày dự kiến không làm task quá hạn. Cập nhật counter kiểm tra ngưỡng ngay, scheduler cũng kiểm tra bổ sung.
- Khi lên lịch kỳ mới, xóa dữ liệu thực hiện/phê duyệt của kỳ trước khỏi task và đặt lại checklist; giữ cấu hình công việc và phân công.
- Các công việc không định kỳ không được mở lại theo cơ chế này.

## Giao diện và dữ liệu cũ

- Cột Hành động của công việc định kỳ có icon lịch sử, mở popup phân trang và xem báo cáo từng lần.
- Trang lịch sử bảo trì đọc các lần thực hiện đã lưu, kể cả khi task hiện tại đã chuyển về `DUE`.
- Worker chỉ cập nhật trạng thái task hiện có; không tự tạo task hoặc xóa mềm các dòng lịch sử cũ. Hàm lưu trữ dữ liệu trùng cũ được giữ riêng, không chạy tự động trong worker.
- Báo cáo cũ chỉ khôi phục được các dữ liệu hệ thống còn giữ; không tạo dữ liệu báo cáo giả cho những phần đã mất.

## Triển khai

- Edge và Shore đều có migration `20261006220000_AddMaintenanceReportSnapshot`, thêm trường nullable `report_snapshot` vào `maintenance_histories`.
- Áp dụng migration của cả hai backend trước khi dùng phiên bản mới. Luồng đồng bộ lịch sử hiện có mang thêm trường báo cáo này xuống dữ liệu mirror trên Shore.
- Chưa sửa ứng dụng mobile trong thay đổi này; API phê duyệt và cập nhật giờ chạy dùng lại task hiện có.
- Đã xóa `MaintenanceSchedulerService` cũ cùng logic tự sinh task, đẩy hạn và ghi đè thời gian cảnh báo. Worker mới chỉ xử lý chu kỳ định kỳ còn hoạt động, bật tự động lên lịch và có khoảng bảo trì hợp lệ; giữ nguyên task đang thực hiện/chờ duyệt/trả hoàn.

## Kiểm tra

- Kiểm thử hai lần thực hiện liên tiếp: chỉ một task, hai báo cáo riêng và báo cáo đầu không bị ghi đè.
- Kiểm tra ngưỡng giờ chạy, hạn tháng/năm, lịch không định kỳ hoặc bị tắt, lưu báo cáo cũ, quyền truy cập API lịch sử và dữ liệu lịch sử sau khi task mở lại.
- Kiểm tra SQL migration PostgreSQL mà không kết nối cơ sở dữ liệu; build frontend Edge và backend Shore.
- Chưa xác nhận luồng chạy trên dữ liệu thật và đồng bộ giữa hai dịch vụ đang hoạt động.
