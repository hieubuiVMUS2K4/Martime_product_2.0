# Hoàn thiện hướng đồng bộ và danh mục chức danh — 06/10/2026

Tài liệu này ghi nhận việc xử lý F01–F07 trong [bản rà soát](SYNC_LOGIC_REVIEW_2026-10-06.md). Phạm vi là các sai lệch đã phát hiện trong luồng chuyến đi, phục hồi hồ sơ và danh mục dùng chung; không thay thế toàn bộ đặc tả của từng phân hệ.

## Thay đổi đã thực hiện

| Phát hiện | Hành vi sau sửa |
|---|---|
| F01: Voyage phát cho mọi tàu | Outbox tự động và enqueue thủ công cùng xác định tàu qua `VoyageRecord.VesselIMO`, rồi chọn node đang đăng ký. Các dòng con dùng `VoyageId`. Bản nháp chưa gán tàu được giữ ở địa chỉ chờ, không broadcast. |
| F02: Snapshot ghi đè dữ liệu vận hành | Edge giữ trạng thái thực hiện, thời gian thực tế, cảng, hàng hóa và các số liệu vận hành hiện có. Dữ liệu kế hoạch/tài chính từ Shore vẫn được cập nhật. Shore được chuyển APPROVED/READY/CANCELLED khi chuyến đi còn ở giai đoạn chuẩn bị; không kéo lùi chuyến đi đã triển khai. |
| F03: Thiếu receiver | Edge nhận được `voyage_crew_assignment`, `voyage_log_entry`, `cargo_operation`, bao gồm các sự kiện xóa. |
| F04: ACK snapshot mà không phục hồi lịch sử | `service_record` CREATE/SNAPSHOT tạo bản ghi nếu thiếu và giữ nguyên lịch sử hiện có. UPDATE/DELETE từ Shore bị từ chối, không ACK thành công. Full crew snapshot chỉ kèm service records có OriginNode thuộc tàu nhận. |
| F05: Rank/Country sửa được ở Edge | Giữ API đọc; POST/PUT/DELETE trả HTTP 405 với mã `shore_managed_catalog`. Các danh mục dùng chung không sinh queue chiều lên. |
| F06: Port bị gửi ngược lên Shore | Danh sách cảng ở Edge chỉ đọc. Bỏ tự động capture/reconcile port. Shore ACK các sự kiện port cũ mà không thay đổi danh mục, giúp queue cũ thoát khỏi retry. |
| F07: Tab chứng chỉ dùng ranks cũ | Làm mới trang chứng chỉ lấy lại cả danh mục chức danh. Danh mục chức danh được gộp vào tab Chứng chỉ theo chức danh, gồm cả thông tin danh mục và tuân thủ. |

## Danh mục chức danh trên Edge

Menu **Quản lý thuyền viên → Quản lý chứng chỉ → Chứng chỉ theo chức danh**, đường dẫn `/crew/certificates?tab=ranks`. Link cũ `/crew/ranks` chuyển hướng tới tab này; menu/trang riêng đã được bỏ.

Tab hiển thị mã, tên, bộ phận, cấp, thứ tự, trạng thái, yêu cầu chứng chỉ, số thuyền viên và mức tuân thủ của từng chức danh. Có tìm kiếm, lọc bộ phận, xem chức danh ngừng sử dụng, nút làm mới và trạng thái tải/lỗi/rỗng. API `/api/rank-certificates` lấy các yêu cầu trong một lần gọi để tránh truy vấn theo từng chức danh. Có bản dịch tiếng Việt/Anh. Bảng giữ kiểu PMS: thanh công cụ gọn, chữ 12 px, tiêu đề xanh nhạt và đường kẻ từng ô. Bảng cuộn ngang trên màn hình nhỏ; ảnh kiểm tra mobile dùng menu đã thu gọn. Tab hiện tại được lưu trong URL để giữ đúng màn hình khi tải lại hoặc quay lui.

## Quy tắc định tuyến và lưu sự kiện

- Tàu có một node đang đăng ký: gửi đến đúng NodeId. Chưa có node: giữ `vessel:<id>`. Chưa gán tàu: giữ `voyage:<id>`. Tombstone cũ không còn xác định được chuyến đi: giữ `unrouted:<hash>`.
- Capture cả payload và địa chỉ trước khi commit dữ liệu nghiệp vụ, đặc biệt khi xóa parent và các dòng con. Business data và outbox nằm trong cùng transaction.
- Tạo parent trước child; xóa child trước parent. Bỏ các lệnh broadcast dư thừa ở `VoyageService`.
- Khi pull/ACK, chuyển các địa chỉ broadcast voyage cũ sang địa chỉ đúng. Giữ receipt đã có của tàu nhận, không sửa payload/EventId.
- Các dòng kế hoạch thay thế có GUID mới được đánh dấu Added rõ ràng, tránh EF coi là cập nhật bản ghi không tồn tại.

Danh mục dùng chung vẫn có thể broadcast vì áp dụng cho mọi tàu. Dữ liệu chuyến đi và tài chính đi theo tàu được gán.

## Kiểm chứng

- Edge backend: **91/91** test đạt; Shore backend: **42/42**; Shared: **4/4**. Tổng **137 test** trong lượt chạy toàn bộ, không skip. Thêm **1 test** tương thích port cũ chạy riêng đạt: UPDATE/DELETE/CREATE từ Edge đều được ACK mà không sửa/xóa/thêm danh mục Shore (TRX `sync-direction-port-compatibility.trx`). Tổng 138 test đã kiểm chứng. File TRX: `artifacts/sync-direction-tests/`.
- Các integration test dùng PostgreSQL riêng ở port 15439, không dùng database nghiệp vụ để tạo/xóa dữ liệu thử. Role thử có quyền tạo/dọn database. Một mock file storage VSAT cũ được bổ sung đường dẫn local để đọc timestamp.
- Frontend TypeScript/Vite build đạt. Docker build backend Shore, backend/frontend Edge đạt.
- Playwright kiểm tra bundle phục vụ bởi Docker Edge tại `http://127.0.0.1:3002`: tìm kiếm, lọc, chứng chỉ, refresh, lỗi API và phục hồi, mobile 390 px, refresh tab chứng chỉ, cảng chỉ đọc, tiếng Việt và dark theme. API trong bài kiểm tra giao diện là giả lập, không chứng minh nội dung đồng bộ của database đang vận hành. Kết quả và ảnh: `artifacts/sync-direction-ui-20261006/`.
- Đã rebuild/recreate ba container ứng dụng local: `shore_product-backend-1`, `maritime-edge-backend`, `maritime-edge-frontend`. PostgreSQL/volumes được giữ nguyên. Backend khởi động thành công; Shore `/health/ready` và Edge `/api/health` trả HTTP 200.

## Giới hạn cần lưu ý

Sửa định tuyến không tự động xóa những bản sao chuyến đi đã từng giao nhầm sang tàu khác. Tombstone cũ không còn parent hoặc thông tin tàu được giữ chờ để tránh giao nhầm. Các bản ghi service history cũ không có OriginNode xác định được không nằm trong snapshot phục hồi theo tàu; cần đối chiếu nguồn trước khi phục hồi thủ công.

Các hướng lai của `voyage_plan_leg` và những bảng con còn theo resolver hiện có; bản sửa này không đổi chúng thành danh mục chỉ đọc. [SYNC_OWNERSHIP_MATRIX.md](SYNC_OWNERSHIP_MATRIX.md) là tài liệu thiết kế cũ và không nên dùng riêng để suy ra quyền/thuật toán hiện tại.

## Gộp màn hình danh mục và chứng chỉ theo chức danh

Theo yêu cầu tiếp theo, đã bỏ `RankCatalogPage` và menu độc lập. Thông tin/bộ lọc danh mục chuyển vào `CertificateMonitorView`; mở rộng chức danh vẫn xem được yêu cầu chứng chỉ và thuyền viên như trước. Các yêu cầu được tải theo lô, không còn preload bằng một request cho từng chức danh. Refresh tải lại cả chức danh, yêu cầu và chứng chỉ; lỗi danh mục có thông báo riêng.

Frontend TypeScript/Vite và Docker build đạt. Playwright kiểm tra redirect, menu, chín cột, lọc/ngừng sử dụng, mở rộng, tuân thủ, API theo lô, refresh, lỗi/phục hồi, URL/back/reload, mobile và tiếng Việt/dark theme. Dữ liệu UI là giả lập (hai thuyền viên: một có chứng chỉ hợp lệ, một thiếu). Kết quả/ảnh tại `artifacts/rank-catalog-merge-20261006/`. Chỉ frontend được cập nhật trong đợt gộp.
