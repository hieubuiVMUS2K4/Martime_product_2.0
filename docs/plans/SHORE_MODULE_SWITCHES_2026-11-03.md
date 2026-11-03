# Bật/tắt module giao diện Shore

Admin hoặc SystemAdmin mở menu tài khoản → Quản lý module (`/admin/modules`), thay đổi các công tắc rồi bấm Lưu thay đổi. Mặc định 11 module đều bật. Cấu hình dùng chung toàn Shore, không theo từng tài khoản hay từng tàu.

Module gồm Danh mục, Thuyền viên, Danh sách tàu, Theo dõi tàu, Tối ưu tuyến, SMS, Đồng bộ, Hồ sơ ký, PMS, Vật tư và kho vận, Báo cáo tàu. Các nhóm PMS/vật tư/báo cáo trong chi tiết tàu cần bật Danh sách tàu để mở được trang cha. Danh mục vật tư công ty thuộc Danh mục; vật tư riêng và kho vận của tàu thuộc Vật tư và kho vận.

Module tắt ẩn menu/tab tương ứng và chặn route giao diện, bao gồm đường dẫn cũ, query tab, khác hoa/thường và dấu `/` cuối. Trang Quản lý module vẫn mở được cho admin dù tắt các module khác. Khi không còn module nào bật, tài khoản vẫn giữ phiên đăng nhập và có trang thông báo phù hợp. Phiên khác nhận cấu hình mới khi tải lại trang.

Đây là cấu hình khả dụng của giao diện, không thay thế phân quyền API/nghiệp vụ. Không vô hiệu API nghiệp vụ hoặc dừng worker, đồng bộ tàu–bờ, cập nhật từ tàu. Không xóa dữ liệu hay thay đổi quyền trên Edge.

## Lưu trữ và triển khai

- API đọc `GET /api/shore-modules` yêu cầu đăng nhập; API ghi `PUT /api/shore-modules` chỉ nhận Admin/SystemAdmin.
- Bảng `shore_module_settings` lưu danh sách module tắt, phiên bản, thời điểm và người cập nhật. Khi chưa có bản ghi, mặc định bật hết.
- Lưu cấu hình dùng transaction/advisory lock và kiểm tra phiên bản để từ chối ghi đè thay đổi của phiên khác. Không đồng bộ bảng cấu hình này xuống tàu.
- Cần áp dụng migration `20261103120000_AddShoreModuleSettings` khi đưa backend mới lên môi trường khác. Localhost đã áp dụng migration.
- Migration được viết theo mẫu migration thủ công hiện có vì scaffold EF bị chặn bởi lỗi snapshot MaintenanceTask.VesselId đã tồn tại. Không sửa cấu trúc PMS trong thay đổi này.

## Kiểm tra

- Backend Release build: đạt, 0 cảnh báo/lỗi.
- Frontend production build và kiểm tra TypeScript: đạt.
- 4 kiểm thử: lưu/đọc lại cấu hình và audit/version, xung đột phiên bản, mã module không hợp lệ, giới hạn role lưu, và thực thi migration trên database đã có dữ liệu. Không bỏ qua test.
- Trình duyệt: menu tài khoản, lưu tắt/bật Hồ sơ ký/PMS, ẩn menu/tab, chặn URL trực tiếp và query tab PMS, URL viết hoa có dấu `/` cuối, tải lại vẫn giữ cấu hình. Khôi phục 11/11 module bật sau kiểm thử.
- Gói triển khai cần đi kèm backend có migration mới và frontend có trang Quản lý module. Không thay đổi cấu hình module của production trong bước đóng gói.
