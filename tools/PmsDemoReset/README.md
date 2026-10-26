# Reset dữ liệu PMS demo tàu–bờ

Công cụ mặc định **chỉ xem trước**. Chỉ dùng cho dữ liệu PMS demo được phép bỏ; chạy từ máy có kết nối tới cả PostgreSQL Edge và Shore, sau khi đã dừng thao tác PMS của người dùng. Cài migration `20261026110000_AddPmsSyncDatasetFence` trên Shore trước khi chạy. Không sửa `.env.production` để chạy công cụ.

Đặt các biến môi trường trong phiên terminal riêng; không đưa mật khẩu vào Git hoặc log:

- `PMS_RESET_EDGE_CONNECTION`: connection string PostgreSQL Edge.
- `PMS_RESET_SHORE_CONNECTION`: connection string PostgreSQL Shore.
- `PMS_RESET_NODE`: NodeId khớp provisioning profile đang active tại Edge và node đã đăng ký trên Shore.
- `PMS_RESET_VESSEL_ID`: GUID tàu tương ứng trên Shore.
- `PMS_RESET_DATASET_ID`: GUID mới, giữ nguyên khi chạy tiếp cùng một đợt reset.

```powershell
dotnet run --project tools/PmsDemoReset -- --preview
```

Xem số bản ghi theo từng bảng/tàu trước khi áp dụng. Để áp dụng, đặt `PMS_RESET_CONFIRM` đúng chuỗi `NodeId/TênDatabaseEdge/TênDatabaseShore` lấy từ hai kết nối đã kiểm tra, rồi chạy:

```powershell
dotnet run --project tools/PmsDemoReset -- --apply
```

Công cụ kiểm tra binding node/tàu, đăng ký bộ dữ liệu ở trạng thái chưa nhận, khóa writer PMS trên Edge và node trên Shore, xóa các bảng PMS theo thứ tự khóa ngoại, dọn riêng outbox PMS của Edge rồi hoàn tất bộ dữ liệu ở hai đầu. Khi lỗi giữa chừng, chạy tiếp với **cùng DatasetId**. Nếu dữ liệu ngoài PMS hoặc tàu khác tham chiếu vào bản ghi sắp xóa, công cụ từ chối và giữ giao dịch chưa hoàn tất; không dùng CASCADE để ép xóa.

Thiết bị, liên kết vật tư–thiết bị, danh mục vật tư, tồn kho, counter, crew/tài khoản/quyền và bằng chứng ký dùng chung được giữ. Thiết bị có trạng thái trước bảo trì đã được lưu sẽ được trả về trạng thái đó và xếp hàng cập nhật thiết bị; công cụ không đoán trạng thái khi thiếu mốc cũ, không hoàn tác tồn kho/counter đã ghi. Không xóa hàng đợi/cursor/stream chung. Gói PMS legacy gửi muộn bị từ chối sau mốc reset; gói không liên quan tiếp tục đồng bộ.

Sau reset, backend Edge cần `Pms:ReworkApiEnabled=true`, múi giờ `Pms:VesselTimeZone` hợp lệ; Shore cần `Pms:ReworkSyncEnabled=true`. Worker chỉ phát hành tự động sau khi Edge đã thương lượng thành công với Shore về đúng DatasetId/StreamId. Việc đăng ký bộ dữ liệu không tự bật các cấu hình vận hành. Nếu đang đặt `Sync:StreamId` cố định khác với stream lưu trong DB, phải đối chiếu cấu hình trước reset; công cụ không đổi stream toàn hệ thống để ép khớp.

Web gửi `X-Pms-Dataset-Id` từ `/api/pms/work-orders/settings` trong các lệnh ghi mới. Client mobile cũ dùng API legacy sẽ nhận 410; client mới phải đọc settings, giữ dataset của bản nháp/offline command và gửi lại đúng header. Không tự thay dataset cho lệnh offline cũ để gửi lại sau reset.

Kiểm thử công cụ dùng `PMS_TEST_CONNECTION_STRING` trỏ tới database bắt đầu bằng `codex_pms_tests_`; công cụ kiểm thử tạo/xóa các database con riêng, không dùng connection vận hành.
