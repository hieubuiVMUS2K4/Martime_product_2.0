# Chuyển dữ liệu PMS local — 26/10/2026

Đã push checkpoint `1a5a4a30` lên `origin/hiu67-rework` trước khi thực hiện theo yêu cầu. Mobile được bỏ khỏi phạm vi đợt này; không phải điều kiện chặn nghiệm thu web–Edge–Shore.

## Phạm vi và kết quả

- Chỉ áp dụng cặp database **local**: Edge `maritime_edge` tại cổng 5433 và Shore `productdb` tại cổng 5434. Node/profile hai đầu đã đối chiếu đúng tàu; không tác động database của máy chủ triển khai khác.
- Đã sao lưu đầy đủ hai database, phục hồi vào PostgreSQL thử nghiệm riêng rồi diễn tập migration/reset trước khi áp dụng database gốc.
- Đã cài các migration PMS còn thiếu và reset dữ liệu PMS demo được cho phép. Mỗi đầu đã xóa 33 cấu hình, 2 task, 4 lịch sử và 5 liên kết vật tư cấp cấu hình cũ. Edge còn xóa 8 dòng lịch sử trạng thái task. **Liên kết vật tư–thiết bị vẫn giữ**, khác với `schedule_spare_parts` của cấu hình PMS cũ.
- Bộ dữ liệu mới `2c507c43-7a77-48ba-835b-6b7c95b004ce` có trạng thái ACTIVE ở cả hai đầu. Job/WO cũ không còn; chưa nhập lại Job từ Excel, chưa tạo dữ liệu công việc giả để kiểm tra trên database gốc.
- Fingerprint trước/sau reset khớp 15 bảng Edge và 14 bảng Shore: thiết bị/counter, nhóm, liên kết vật tư–thiết bị, vật tư, tồn kho, kho, crew, tài khoản/chức danh/quyền và bằng chứng ký dùng chung. Phép đo thiết bị bỏ riêng trường trạng thái/metadata đồng bộ được phép khôi phục khi reset; giữ so sánh các trường còn lại, bao gồm giờ chạy.
- Hàng đợi/cursor/stream chung được giữ; chỉ loại các sự kiện PMS cũ. Legacy bị chặn sau dataset mới; không tự gán dataset mới lên gói cũ.

## Các lỗi phát hiện trên schema thực tế

1. Bảng task Shore là `"MaintenanceTasks"`, không phải `maintenance_tasks`. Sửa bốn migration rework Shore theo đúng model/schema, gồm cột, index, FK và guard rollback. Bổ sung bốn kiểm tra đối chiếu migration với tên bảng trong model.
2. Deferral Shore dùng `task_deferral_request`; công cụ reset bổ sung hai tên vật lý legacy đã xác minh, không mở rộng sang bảng nghiệp vụ khác.
3. `maintenance_histories` Shore có `ScheduleId`/`TaskId` nhưng thiếu FK vật lý. Công cụ ban đầu từ chối reset. Đã bổ sung đúng hai liên kết nghiệp vụ đã đối chiếu để xác định phạm vi và thứ tự xóa, đồng thời từ chối trường hợp Job/task của cùng lịch sử thuộc hai tàu khác nhau. Không suy diễn liên kết cho các cột tùy ý.

Kiểm tra mới: **12 test foundation/mirror Shore đạt**, **3 test reset đạt**; migration/reset diễn tập trên bản phục hồi database thật thành công. Artifact: `artifacts/test-results/pms-cutover-2026-10-26/`.

## Sao lưu và phục hồi

Backup chỉ lưu local trong thư mục được Git bỏ qua `artifacts/backups/pms-cutover-2026-10-26/`:

| File | SHA-256 |
|---|---|
| `edge.dump` | `6CA66350FFD55E783F346652A2311B06ACB8C7F64BBD535A9209E4B3E4ABBC9C` |
| `shore.dump` | `54B27A05E71A676712C0C2252EFFA28B2E7CF836EFD4A4DBB97CFC00C232DC8C` |

Cùng thư mục có script migration đã dùng, fingerprint trước/sau và kết quả reset. Backup đã được `pg_restore` thành công trong diễn tập. Nếu phải phục hồi, dừng cả hai backend và phục hồi **cả cặp backup**; không phục hồi riêng một đầu trong khi đầu còn lại tiếp tục đồng bộ. Phục hồi sẽ đưa toàn database về thời điểm backup, nên phải đánh giá dữ liệu mới phát sinh trước khi làm. Chưa thực hiện rollback.

## Cấu hình và kiểm tra chạy

- Đã bật `Pms:ReworkApiEnabled`, múi giờ `Asia/Ho_Chi_Minh` trên Edge và `Pms:ReworkSyncEnabled` trên Shore trong hai file `appsettings.Development.json` local được Git bỏ qua. Không sửa `.env.production`, không thay mặc định cho môi trường Production.
- Đã khởi động tạm hai backend để kiểm tra HTTP: Shore health đạt, đăng nhập admin Edge thành công, settings trả đúng dataset/múi giờ, catalog có Job List/ẩn Cấu hình cũ và API Job/WO trả tổng 0. Đã logout phiên kiểm thử và dừng hai backend do tác vụ này mở; người dùng có thể chạy lại bình thường, không bị chiếm cổng bởi tiến trình kiểm thử.
- Worker tự động vẫn yêu cầu xác nhận peer đúng node/dataset/stream. Chưa gọi đồng bộ bằng dữ liệu Job/WO thật mới hoặc xác minh trọn chu kỳ thực hiện–duyệt–mirror trên database gốc; không coi việc reset thành công là đã nghiệm thu phần này.
- Bước sử dụng tiếp: chạy lại backend Edge/Shore và frontend, tải lại trang, nhập Job theo Excel mới, kiểm tra cấu hình/mốc rồi đồng bộ. Các Job import mặc định không bật tự sinh WO; bật sau khi kiểm tra điều kiện và xác nhận đồng bộ. Mobile cũ trả 410 theo thiết kế, không mở lại để vượt hàng rào chuyển đổi.
