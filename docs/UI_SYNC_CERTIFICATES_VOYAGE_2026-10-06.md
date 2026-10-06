# Giao diện đồng bộ, chứng chỉ và tạo hải trình — 06/10/2026

## Thay đổi

- `/sync` ở bờ: lọc nhật ký theo nguồn/tàu, trạng thái, hướng, bảng, thời gian và nội dung; phân trang trên database; xem đầy đủ ID và chi tiết xung đột/lỗi; xuất CSV của trang đang xem.
- Tách xung đột khỏi lỗi; hiển thị kết nối, mạng, heartbeat, lần gửi/nhận, tổng nhận/giao và lỗi gần nhất của tàu.
- Xem hàng chờ bờ → tàu, nhóm theo bảng/đích nhận, tuổi hàng chờ và trạng thái broadcast theo receipt riêng của từng tàu. Danh sách toàn đội đếm mỗi event một lần; không cộng trùng event broadcast cho nhiều tàu.
- Có thao tác kiểm tra dữ liệu bờ, đưa thuyền viên/chứng chỉ chưa đồng bộ vào hàng chờ và tạo lại snapshot cho tàu nhận. Thông báo thành công chỉ xác nhận tạo hàng chờ, không tuyên bố tàu đã nhận.
- Bảng loại chứng chỉ có độ rộng cột tổng 100%, cột “Cấp bởi” đủ rộng, tiêu đề xuống dòng và cuộn ngang trên màn hình nhỏ.
- Bờ: **Danh mục → Loại chứng chỉ → Chứng chỉ theo chức danh**. Thêm bằng chọn chứng chỉ, sửa danh sách yêu cầu, hoặc gỡ từng yêu cầu. Gỡ yêu cầu không xóa loại chứng chỉ hay chứng chỉ thuyền viên. Tàu chỉ xem dữ liệu đã đồng bộ và có hướng dẫn vị trí quản lý ở bờ.
- Form tạo hải trình dùng bố cục PMS: nhóm trường, hai cột trên desktop, một cột trên mobile, phần thân cuộn riêng, tiêu đề và nút lưu giữ cố định. Bổ sung nhãn khối lượng hàng Việt/Anh và trường thời gian đến.

## API mới

- `GET /api/sync/dashboard/logs`: bộ lọc và phân trang, tối đa 200 dòng/trang; mỗi log có `conflictDetail`.
- `GET /api/sync/dashboard/outbox`: hàng chờ, nhóm theo bảng/đích, lọc theo `nodeId` và phân trang. Không trả payload nghiệp vụ.
- `GET /api/rank-certificates`: danh sách yêu cầu.
- `PUT /api/rank-certificates/rank/{rankId}`: body `{ "certificateIds": [1, 2] }`. Danh sách rỗng gỡ toàn bộ yêu cầu của chức danh đó. Chỉ phát CREATE/DELETE cho phần thay đổi, giữ ID phần không đổi, ghi yêu cầu và sự kiện đồng bộ trong cùng transaction.

Các API dùng policy `InternalAccess`. Không thêm schema/migration mới trong phạm vi giao diện này; API hàng chờ sử dụng bảng receipt của migration `20261005130000_HardenSyncDelivery` đã có trong source.

Nhật ký hiện không có trường tàu nhận riêng: bộ lọc tàu chỉ lấy log có nguồn tương ứng, không gán mọi log nguồn SHORE cho từng tàu. Kiểm tra dữ liệu bờ không phải đối soát toàn bộ database hai phía. CSV chỉ xuất trang đang xem, có BOM UTF-8 và chống công thức từ nội dung bản ghi.

## Xác minh

- Build frontend bờ và tàu: đạt.
- Build backend bờ: đạt; còn warning có sẵn ngoài các phần sửa.
- 4/4 test PostgreSQL mới đạt trên database cô lập có prefix `codex_pms_tests_`: phân trang/lọc nhật ký; receipt broadcast theo từng tàu; giữ ID yêu cầu không đổi và chỉ phát phần thay đổi; rollback khi broadcast thất bại.
- Kiểm tra Chrome bằng Playwright: phân trang, lọc xung đột, chi tiết, CSV, hàng chờ, lưu yêu cầu chức danh, độ rộng cột chứng chỉ, nhãn dịch, nút lưu cố định và bố cục mobile đều đạt. API trong lượt kiểm tra trình duyệt được mock; không sửa dữ liệu vận hành.
- Ảnh kiểm tra và script: `artifacts/ui-review-20261006/`. Script dùng Playwright cài trong `%TEMP%/maritime-ui-verification` và dev server bờ/tàu tại cổng 3100/3102.

## Rebuild Docker lúc 01:39 ngày 06/10/2026

- Đã build toàn bộ image có source trong hai stack và tạo lại cả 10 container bờ/tàu. Backend, frontend, PostgreSQL, pgAdmin và Gotenberg đều đang chạy. Hai backend không có lần restart do lỗi; hai PostgreSQL healthy. Các dự án Docker khác được giữ nguyên.
- Bờ: `http://localhost:3000`; tàu: `http://localhost:3002`. API thật `/api/sync/status`, nhật ký, hàng chờ, danh sách node, kiểm tra dữ liệu và yêu cầu chứng chỉ trả HTTP 200. Bờ `/health/ready` healthy; tàu `/api/health` healthy. pgAdmin và Gotenberg hai phía cũng hoạt động.
- Database đã có các migration đến `20261006100000_AddSensorAndDeferralSyncMirrors` ở bờ và `20261006100000_EnableSensorAndDeferralSync` ở tàu. Đã xác minh bảng receipt và các cột event đồng bộ.
- Giữ nguyên các volume dữ liệu/upload. Đã sao lưu hai database trước khi thay container, kiểm tra danh mục archive và ghi SHA-256 tại `C:\Users\ADMIN\AppData\Local\Maritime\Backups\rebuild-20261006-013331`.
- Bổ sung `TestData/` vào image backend tàu vì cấu hình đang bật NMEA playback nhưng file tuyến mẫu chưa được đóng gói. Sau rebuild, playback khởi động thành công và dùng node tàu đã provision. Đồng bộ online, không có bản ghi chờ lỗi tại lúc kiểm tra.
- Kiểm tra Playwright lại trên asset Docker tại cổng 3000/3002 đạt toàn bộ các luồng giao diện đã liệt kê. Lượt này vẫn mock API để tránh ghi dữ liệu vận hành; API thật được kiểm tra riêng bằng request đọc. Script và ảnh có tiền tố `docker-` trong `artifacts/ui-review-20261006/`.

Log build ở `artifacts/rebuild-shore-20261006.log`, `artifacts/rebuild-edge-20261006.log` và `artifacts/rebuild-edge-backend-20261006.log`. Rebuild bao gồm các thay đổi sync/backend đã có trong workspace từ trước.
