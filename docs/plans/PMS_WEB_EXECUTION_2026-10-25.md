# Thực hiện bảo trì trên web — 25/10/2026

Trước khi triển khai đã push các sửa popup yêu cầu vật tư và Gantt lên `feature/hiu67`, commit `f744d9d2`.

## Luồng sử dụng

- Từ Danh sách công việc, mở Chi tiết công việc. Tài khoản có `pms.work.execute` có thể bắt đầu công việc đến hạn hoặc thực hiện lại công việc được trả hoàn.
- Khi Đang thực hiện: cập nhật checklist, giá trị đo, vật tư sử dụng, giờ chạy, thời gian thực hiện (phút) và báo cáo. Các biểu mẫu ĐGRR/BBKT và ký xác nhận tiếp tục dùng cơ chế hiện có.
- Lưu lại chỉ lưu kết quả đang làm. Hoàn thành và gửi duyệt chuyển sang Chờ duyệt; không tự duyệt và không trừ kho.
- Quyền duyệt/trả lại giữ riêng. Khi duyệt mới ghi nhận tác động kho, giờ chạy và chu kỳ; công việc định kỳ tiếp tục giữ một task và snapshot lịch sử từng lần.
- Web và mobile dùng cùng task, checklist và API workflow; không tạo luồng trạng thái riêng cho web.

## Quyền và API

- Mở lại các nút đang bị ẩn trên web. Quyền Thực hiện đã có trong danh mục quyền theo chức danh, không thêm vai trò tài khoản mới.
- Thêm `PUT /api/tasks/{id}/progress`, dùng `SubmitTaskDto` và quyền `pms.work.execute`. Chỉ sửa trường kết quả thực hiện trong trạng thái IN_PROGRESS; không sửa cấu hình, người được giao hay trạng thái duyệt.
- Tài khoản thực hiện vẫn phải liên kết với thuyền viên đang trên tàu, có chức danh hoạt động như quy tắc hiện có. Admin không liên kết thuyền viên vẫn duyệt được nhưng không tự đóng vai người thực hiện.
- Ghi nguồn WEB trong lịch sử bắt đầu/gửi duyệt. Các API mobile và mặc định MOBILE giữ nguyên.
- Lưu nháp/gửi duyệt dùng chung khóa giao dịch với ký duyệt, tránh lệnh lưu đến muộn thay đổi hồ sơ đã gửi duyệt.
- Không có migration database; sử dụng các trường kết quả và hàng đợi đồng bộ sẵn có.

## Tính bền vững của biểu mẫu

- Tạm dừng polling khi người thực hiện đang nhập, đồng thời bỏ qua phản hồi polling cũ đến muộn. Tải lại tồn kho không thay thế số lượng vật tư đang nhập.
- Chặn gửi hoàn thành trong lúc đang ghi checklist; kiểm tra đầy đủ checklist và biểu mẫu bắt buộc, giữ validation backend.
- Theo yêu cầu cập nhật, bỏ phần ảnh khỏi web: không chọn/tải/xem ảnh, không gửi ảnh trong payload lưu/gửi duyệt và không bắt buộc ảnh, kể cả công việc cũ có RequiredPhotos. Dữ liệu ảnh lịch sử vẫn được giữ nguyên; API ảnh tùy chọn cũ vẫn tương thích với client cũ.
- Backend kiểm tra giờ chạy và thời gian không âm, không lùi giờ chạy thiết bị.

## Kiểm chứng

- Toàn bộ backend Edge: **234 đạt, 0 bỏ qua**, PostgreSQL riêng; gồm bắt đầu/lưu/gửi/trả lại/thực hiện lại/duyệt, kho chỉ trừ lúc duyệt, một task định kỳ và snapshot, quyền execute tách update/approve, tranh chấp lưu với gửi duyệt.
- Frontend: **47 đạt**, gồm luồng execute không cần quyền cập nhật, người chỉ xem/người duyệt không có nút thực hiện, phản hồi polling cũ không ghi đè bản nhập.
- Frontend build production đạt; còn cảnh báo kích thước bundle đã có.
- TRX: `artifacts/test-results/web-pms-2026-10-25/full/web-pms-full.trx` (không đưa Git).
- Sau khi bỏ phần ảnh: chạy lại 64 test backend về thực hiện web, chu kỳ, quyền và phê duyệt, cùng 47 test frontend; tất cả đạt, frontend build đạt. Test mới xác nhận task cũ có RequiredPhotos vẫn gửi không ảnh được và không mất ảnh lịch sử. TRX tại `artifacts/test-results/pms-without-photos-2026-10-25/pms-without-photos.trx`.

Chưa triển khai container vận hành hoặc chạy nghiệp vụ trên database thật. Phần PMS mới được giữ ở working tree để xem diff; commit đã push trước khi làm là `f744d9d2`.
