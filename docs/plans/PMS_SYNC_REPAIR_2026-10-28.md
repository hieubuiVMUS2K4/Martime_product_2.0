# Khắc phục đồng bộ PMS tàu–bờ — 28/10/2026

## Kết quả và phạm vi

Code trước đợt sửa đã được push lên `origin/hiu67-rework` tại `c5a403a5`. Những thay đổi mô tả dưới đây là phần tiếp tục khắc phục sau commit đó. Không reset dữ liệu vận hành hoặc chỉnh sửa báo cáo đã ký; mobile không thuộc phạm vi.

Đã kiểm tra trên Edge/Shore local đang chạy: 3 Job, 4 Work Order, 3 bản báo cáo và 1 bản ghi tiêu hao được đối chiếu. Hàng đợi PMS còn 0. Phiên bản, trạng thái WO, mốc chu kỳ Job, hash và nội dung snapshot báo cáo khớp giữa hai phía. Các bản ghi vị trí tàu phát sinh liên tục thuộc nhóm đồng bộ khác, không phải PMS bị treo.

## Hai nguyên nhân chính

1. `GET /api/sync/pms-capabilities` thiếu trong nhánh xác thực node và kiểm tra chữ ký. Bờ không nhận diện được node dù tàu gửi yêu cầu hợp lệ, khiến tàu giữ các sự kiện PMS với lỗi capability. Bổ sung route vào cùng nhánh bảo vệ như batch; không bỏ kiểm tra token hoặc HMAC.
2. Shore cấu hình mặc định `NoTracking`, nhưng bộ nhận PMS cập nhật entity/receipt/checklist theo cơ chế cần tracking. Hệ quả là có sự kiện được ACK trong khi thay đổi trạng thái không được lưu. Bổ sung tracking cho receipt/checklist và attach entity trước khi cập nhật; giữ cập nhật dữ liệu và receipt trong giao dịch của bộ nhận.

## Khôi phục và công cụ vận hành

- Bổ sung snapshot riêng **PMS – Công việc và Work Order**: Job/checklist, WO, báo cáo và posting tiêu hao. Không phải gửi lại toàn bộ thiết bị/vật tư.
- Dùng payload PMS chuyên biệt có dataset/stream và thông tin cần thiết; giữ nguyên snapshot/hash báo cáo đã ký. Không sửa payload/EventId đã xếp hàng, không gỡ ACK cũ. Bỏ qua bản ghi đã có sự kiện chờ để tránh tạo trùng.
- Snapshot chạy trong write scope để phối hợp với reset/cutover; nhóm `pms_work` từ chối khi rework/dataset chưa sẵn sàng.
- Đã sao lưu hai database local trước phục hồi, tạo 7 snapshot mới cho 3 Job/4 WO; các báo cáo/posting chờ sẵn được gửi lại sau khi phụ thuộc đã khớp.
- Bảng hàng đợi đọc `recordKey` đúng hợp đồng API, tránh hiện mã bản ghi rỗng.
- Đã áp dụng migration mã WO còn thiếu trên database Shore local qua khởi động backend.

## Hiển thị dữ liệu trên bờ

- Bảng và xuất dữ liệu dùng mã WO nghiệp vụ `WO-2026-000001` thay mã UUID của bản ghi nguồn.
- WO protocol 2 đọc hạn ngày/giờ từ `workOrderDueAt`/`workOrderDueHours`; không dùng ngày tương thích `31/12/9999` cho WO chỉ theo giờ chạy. Giá trị 0 giờ vẫn được hiển thị.
- Lịch/Gantt dùng hạn ngày thật, loại WO đã hủy; WO chỉ theo giờ chạy tiếp tục xem trong bảng. Không sửa hạn hay trạng thái vận hành để phục vụ hiển thị.
- Đây là hiệu chỉnh bộ đọc dữ liệu hiện có trên bờ, chưa phải redesign toàn bộ trang Job/WO trên bờ.

## Kiểm chứng

- Tái hiện trước sửa: 2 test mirror thất bại khi bật cấu hình NoTracking giống production.
- Sau sửa: **8 test Shore đạt** (mirror và xác thực capability, gồm trường hợp thiếu HMAC bị từ chối).
- **9 test Edge đạt** cho capability/snapshot, gồm snapshot lặp không tạo trùng, giữ nguyên bằng chứng báo cáo và chặn snapshot khi dataset chưa ACTIVE.
- Frontend Edge và Shore build production/TypeScript đạt; vẫn có cảnh báo kích thước bundle hiện hữu.
- Trình duyệt local: bờ hiển thị đủ 4 WO, đúng mã ngắn, testing1/2 hoàn thành với hạn 100/200 giờ; lịch chỉ còn WO testing3 đang mở, không hiển thị WO đã hủy.
- Chi tiết đối chiếu: `artifacts/pms-sync-repair-2026-10-27/verification.json`; log kiểm thử nằm trong `artifacts/pms-sync-*.log`. Backup và log vận hành được loại khỏi Git.

## Giới hạn kiểm chứng

Lượt kiểm tra này xác nhận đồng bộ HTTP thật giữa hai dịch vụ local và bảo toàn dữ liệu hiện tại. Chưa thay thế diễn tập mất mạng dài ngày, triển khai production nhiều tàu hoặc kiểm thử mobile. Không đánh dấu toàn bộ kế hoạch PMS đã hoàn tất chỉ từ lượt sửa này.
