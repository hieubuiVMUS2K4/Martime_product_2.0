# Kiểm tra đồng bộ lịch sử bảo trì tàu–bờ

## Phạm vi và kết quả

Kiểm tra mã nguồn, hàng đợi thực tế trên PostgreSQL thử nghiệm, bộ gửi Edge với HTTP giả lập, bộ nhận Shore trên PostgreSQL và cơ chế nhận tệp với kho tệp giả lập. Các cơ sở dữ liệu thử nghiệm dùng tiền tố `codex_pms_tests_`, không chạy thao tác nghiệp vụ trên cơ sở dữ liệu đang sử dụng.

Các lỗi đã xác định và sửa:

- `MaintenanceHistory` được tự đưa vào hàng đợi nhưng bị xếp ưu tiên Low, có thể không gửi qua VSAT trong khi task đã gửi. Đổi sang Operational trong DbContext và chính sách mạng; nâng ưu tiên các bản tin lịch sử cũ còn chờ.
- Bước đối soát bỏ sót lịch sử khi hàng đợi bị mất. Thêm đối soát `maintenance_history` để dựng lại full snapshot cho bản ghi chưa đồng bộ.
- Shore thiếu ánh xạ lịch sử theo từng tàu và không có metadata khóa ngoại EF cho TaskId/ScheduleId của lịch sử. Bổ sung ánh xạ ID, kiểm tra cha đã tồn tại và đúng tàu, không cho chuyển lịch sử sang công việc/cấu hình khác. Task cũng ánh xạ ScheduleId của mình theo tàu.
- Mã cấu hình bảo trì trên Shore bị ràng buộc duy nhất trên toàn hệ thống, gây lỗi 23505 khi hai tàu có cùng mã. Migration mới chuyển thành duy nhất theo VesselId + ScheduleCode, giữ dữ liệu hiện có.
- Ảnh/chữ ký trong snapshot chỉ mang đường dẫn Edge, chưa chuyển tệp. Thêm file manifest cho CompletionPhotos, PhotoUrl và SignatureUrl; sử dụng cơ chế truyền tệp hiện có, xác minh checksum, ánh xạ đúng lịch sử theo tàu và thay đường dẫn bằng đường dẫn trên Shore. Snapshot gửi lại tận dụng tệp đã xác minh, không ghi đè bằng đường dẫn Edge. Ảnh inline vẫn nằm trong JSON, URL bên ngoài được giữ nguyên.

## Kịch bản đã kiểm chứng

- Phê duyệt hai chu kỳ trên PostgreSQL Edge: vẫn một task, hai lịch sử và hai bản tin CREATE mang báo cáo đầy đủ; cập nhật task về SCHEDULED được ghi vào hàng đợi.
- Nhận hai chu kỳ trên PostgreSQL Shore: vẫn một task, hai báo cáo riêng; báo cáo lần đầu không bị thay đổi khi task chuyển sang DUE.
- Lịch sử đến trước cha bị từ chối và không xác nhận nhận thành công; batch đảo thứ tự được sắp theo phụ thuộc; gửi lại sau khi cha có dữ liệu thành công.
- Gửi lại cùng bản tin không tạo bản ghi trùng; bản tin trạng thái cũ không đưa task quay về kỳ trước.
- Hai tàu cùng UUID và mã cấu hình vẫn có lịch sử riêng, liên kết đúng task/cấu hình; không nhận lịch sử trỏ sang task của tàu khác.
- Mất hàng đợi: Edge dựng lại lịch sử và gửi kèm manifest ảnh/chữ ký, chỉ đánh dấu đồng bộ sau receipt.
- Tệp đến khi task đã sang kỳ mới vẫn cập nhật báo cáo của lần cũ; gửi lại snapshot giữ đường dẫn Shore và không tạo thêm yêu cầu tải tệp.
- Migration được thực thi trên PostgreSQL thử nghiệm với dữ liệu có sẵn; dữ liệu giữ nguyên và cho phép tàu khác dùng cùng mã cấu hình.

## Áp dụng

Kết quả kiểm thử: 43 kiểm thử Edge (chu kỳ bảo trì và hồi quy bộ gửi/hàng đợi), 30 kiểm thử Shore (hồi quy bộ nhận và lịch sử mới); tất cả đạt, không bỏ qua kiểm thử PostgreSQL. Cả hai backend được build trong quá trình chạy kiểm thử.

Triển khai đồng thời backend Edge và Shore. Shore cần migration `20261006233000_ScopeMaintenanceScheduleCodeByVessel`, ngoài migration `20261006220000_AddMaintenanceReportSnapshot` đã có trước đó. Chưa tự áp dụng migration vào cơ sở dữ liệu đang sử dụng.

Giới hạn xác nhận: chưa chạy qua giao diện web/mobile với hai dịch vụ thật và đường truyền tàu thực tế. Kiểm thử chuyển tệp sử dụng dịch vụ nhận tệp thật nhưng kho tệp giả lập; không đồng nghĩa đã kiểm tra cấu hình volume/static-file của môi trường triển khai.
