# Kiểm tra merge dev vào master — 25/10/2026

## Nguồn và phạm vi

- Master trước merge: `5c8c6d9d`.
- Dev được hợp nhất: `0554e049`.
- Không có xung đột Git. Giữ phần danh mục vật tư công ty trên master và các thay đổi dev về ký duyệt, đồng bộ, đổi tàu, giao diện.
- Sau kiểm thử, cập nhật master trên remote rồi fast-forward `feature/hiu67` tới bản master đã hợp nhất. Không force-push và không thay đổi nhánh dev.

## Vấn đề phát hiện và xử lý

- Test sidebar thiếu mock `useEffect` sau refactor. Bổ sung mock; vẫn xác nhận nhóm nhật ký rỗng bị ẩn.
- Test quyền thiết bị còn đọc file bộ lọc đã xóa. Chuyển sang render DataTable hiện tại cùng trang thiết bị, giữ các kiểm tra nút thêm/xóa/import/cập nhật theo quyền.
- Test khởi động mobile thiếu locale provider, DI và Hive. Dựng lại fixture với storage tạm, xác nhận hiển thị màn hình đăng nhập và giữ test lưu hàng đợi đồng bộ.
- Test hai chu kỳ PMS dùng mốc 01/10 cố định, trở thành sắp đến hạn khi chạy cuối tháng. Dùng ngày chạy test làm mốc, giữ kiểm tra một task qua hai chu kỳ và snapshot bất biến.
- Test phục hồi thuyền viên gọi API đã bị thay thế. Chuyển sang `ShoreSyncPushService.PushAsync` và sửa luồng gửi nhóm Crew để lịch sử công tác chỉ gửi về tàu có origin tương ứng; hỗ trợ cả node cũ và IMO lịch sử.
- Khôi phục tích hợp `VoyageSyncRouting` với luồng outbox tự động: giữ sự kiện chuyến chưa gán tàu ở địa chỉ chờ `voyage:*`, xác định tàu trước khi xóa bản ghi cha và sắp thứ tự bản ghi theo phụ thuộc. Khi gán tàu, các sự kiện chờ được định tuyến về đúng node, không phát cho tàu khác.
- Test migration tài liệu cần database cấu hình riêng nên bị bỏ qua. Bổ sung fixture PostgreSQL tự tạo từ schema Edge với tên `codex_pms_tests_*`, dựng lại schema trước migration rồi kiểm tra Up/Down; truy vấn chỉ xét các bảng tài liệu thuyền viên, không lẫn bảng bằng chứng phê duyệt.
- Test migration tài liệu Shore cũng được giới hạn truy vấn đúng năm bảng liên quan thay vì lấy mọi bảng kết thúc bằng `documents`.

## Kiểm chứng

| Kiểm tra | Kết quả cuối |
| --- | --- |
| Backend Edge, gồm PostgreSQL và migration tài liệu | 229 đạt, 0 bỏ qua trong lượt đầy đủ cuối |
| Backend Shore, gồm PostgreSQL | 94 ca được kiểm chứng: 93 đạt trong lượt đầy đủ; ca còn lại cập nhật fixture rồi chạy lại đạt |
| Phiên đăng nhập, phân quyền và ký duyệt frontend Edge | 42 đạt |
| Mobile: khởi động ứng dụng và lưu hàng đợi đồng bộ | 2 đạt |
| Định tuyến thời tiết | 17 đạt |
| Thư viện dùng chung | 4 đạt |
| Build production frontend Edge | Đạt |
| Build production frontend Shore | Đạt |
| Whitespace của bản merge | `git diff --cached --check` đạt |

Tổng cộng **388 ca kiểm thử được kiểm chứng đạt**, không cộng trùng các lần chạy lại. Test Shore chạy lại là `AutoOutbox_VoyageWithoutShip_IsNotSentAnywhere`: fixture cũ đòi không tạo outbox; fixture mới kiểm tra sự kiện giữ chờ ở `voyage:*` và cả hai tàu đều không nhận. Không còn ca lỗi chưa xử lý. Không thay đổi code backend sau lượt Shore đầy đủ, chỉ cập nhật test này.

Báo cáo TRX và log phân tích mobile nằm tại `artifacts/test-results/merge-dev-2026-10-25/` (không đưa vào Git). Các lượt đầu có lỗi/được dừng giữ nguyên báo cáo để đối chiếu; báo cáo cuối Edge là `edge/merge-dev-edge-verified.trx`, Shore là `shore/merge-dev-shore-final.trx` kết hợp `shore-routing/merge-dev-shore-routing.trx`.

PostgreSQL chạy trong container tạm riêng `codex-merge-dev-tests-20261025`, cổng localhost 54390. Không áp dụng migration lên database vận hành, không chỉnh file môi trường production và không triển khai dịch vụ.

Mobile có 14 warning và 375 thông báo lint, không có lỗi phân tích tĩnh mức error. Hai frontend có cảnh báo kích thước bundle; Shore còn cảnh báo dữ liệu Browserslist cũ. Chưa kiểm tra trực quan toàn bộ web, chưa build APK hoặc thử trên thiết bị mobile thật.
