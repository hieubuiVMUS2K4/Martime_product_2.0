# Lên đà, Theo chuyến, Theo yêu cầu — 28/10/2026

## Phạm vi đã chốt lại

Cả ba loại là danh mục Job mẫu, chỉ phát hành WO thủ công từ chi tiết Job. Loại bảo trì dùng để phân loại; không bắt buộc chọn đợt lên đà, chuyến đi hoặc mốc trước/sau chuyến. Không tự sinh WO theo sự kiện hoặc chu kỳ. Phương án quản lý đợt/chuyến trong đề xuất trước được thay bằng phạm vi này.

Luồng: Job mẫu → Phát hành WO → nhập lý do và hạn → phân công → thực hiện → gửi báo cáo → duyệt/trả lại. WO đột xuất vẫn là cách tạo trực tiếp không cần Job mẫu.

## Đã triển khai

- Cả ba loại dùng chung nút/form Phát hành WO thủ công. Job phải ACTIVE, đủ thiết bị/thông tin và không có WO mở. Dùng quyền pms.work.create; các quyền phân công/thực hiện/duyệt giữ nguyên.
- Form bắt buộc lý do và ít nhất một hạn ngày tàu hoặc counter. 0 giờ là giá trị hợp lệ. Ngày chuyển UTC theo múi giờ tàu giống WO đột xuất.
- API chính POST /api/pms/work-orders/from-manual-job; giữ alias from-demand-job cho client đã tải bản trước. Server kiểm tra phiên bản, trạng thái, thiết bị và quyền dưới write scope. Định kỳ vẫn có luồng phát hành riêng.
- Mỗi lần phát hành có CommandId/CycleKey REQUEST:<CommandId>. Retry cùng nội dung trả cùng WO; đổi nội dung/tài khoản với cùng mã bị chặn. Hai yêu cầu đồng thời không tạo hai WO mở cho cùng Job.
- Hủy WO không tự phát hành lại. Mã yêu cầu đã hủy không dùng lại; lần mới cần mã/lý do mới.
- WO giữ đúng loại bảo trì, kế thừa hướng dẫn, ưu tiên, bộ phận, checklist và người mặc định còn hợp lệ. Snapshot lưu lý do, mã yêu cầu, hạn và phiên bản nội dung; sửa Job không đổi WO đã phát hành.
- Sau duyệt, Job ghi nhận lần thực hiện cuối, không sinh hạn/kỳ mới. Dừng/ngừng áp dụng Job không chặn xử lý WO đã phát hành.
- Job List/chi tiết hiện Chờ phát hành WO hoặc Đã phát hành WO thay hạn giả; form Job không có trường chu kỳ/tự động cho ba loại. Khi lưu Job không định kỳ, AutoGenerate=false và không có NextDueDate/NextDueRunningHours.
- Không thêm migration, không reset dữ liệu, không sửa cấu hình production. Dùng outbox/dataset/stream protocol 2 hiện có; metadata lần phát hành nằm trong CycleKey và snapshot bất biến.

## Kiểm chứng

Các test dùng PostgreSQL riêng, không tạo WO thử trong dữ liệu vận hành:

- Edge: 42 bài đạt, gồm cả ba loại từ phát hành đến ký duyệt; cập nhật lần thực hiện cuối/không có kỳ mới; quyền, phiên bản, chống trùng/retry và hồi quy Định kỳ. Log: artifacts/pms-manual-edge-tests.log.
- Shore: 7 bài đạt, nhận ba loại Job/WO, giữ đúng loại, khóa yêu cầu, snapshot, hạn và tàu; gửi lặp/đảo phụ thuộc trong NoTracking. Log: artifacts/pms-manual-shore-tests.log.
- Frontend: build TypeScript/production đạt. Trình duyệt đã kiểm tra form của cả ba loại đều ẩn chu kỳ/tự động; không lưu Job thử. Log: artifacts/pms-manual-ui-build.log.
- Các test trên chưa thay thế diễn tập HTTP mất mạng dài ngày. Mobile, quản lý đợt/chuyến và thông báo bền vững nằm ngoài phạm vi bước này. Chưa push thay đổi.
- Sau khi đổi tên nội bộ thành Manual, 6 tình huống phát hành/duyệt cho đủ ba loại đã được chạy lại và đạt: artifacts/pms-manual-release-final.log. Backend local dùng bin/PmsManualReview/net8.0/MaritimeEdgeServer.exe ở cổng 5001; log artifacts/pms-manual-runtime*.log.
