# Vật tư công ty và vật tư của tàu

## Quy tắc

- Danh mục → Vật tư quản lý mã, tên, loại và đơn giá tham chiếu của danh mục công ty.
- Danh sách tàu → Vật tư dùng **Gán vật tư** để tìm/chọn vật tư công ty đã tồn tại và đang hoạt động. Không tạo ngầm danh mục mới.
- Tàu có mã riêng, đơn vị, mã phụ tùng, hãng, quy cách, nhà cung cấp, ghi chú và đơn giá riêng. Sửa các trường này không sửa danh mục chung.
- Giữ nguyên ID và liên kết danh mục khi sửa, không nhân bản danh mục hoặc di chuyển liên kết thiết bị. Tồn kho và định mức không bị thay đổi.
- Mỗi vật tư danh mục chỉ được gán một lần cho một tàu. Bản ghi ngừng dùng vẫn được kiểm tra để tránh trùng lịch sử. Không đổi sang vật tư danh mục khác khi sửa bản ghi đã gán.
- Sau khi lưu/import, người dùng bấm Đồng bộ xuống tàu; cơ chế nhận định nghĩa hiện tại của Edge được giữ nguyên.
- Dữ liệu cũ không bị đổi mã, gộp hoặc xóa tự động.

## Import

Tải mẫu mới trong popup import vật tư của tàu. Các cột:

`CatalogCode, ItemCode, Unit, PartNumber, Manufacturer, Specification, Supplier, UnitCost, Notes`

`CatalogCode` là mã danh mục công ty; `ItemCode` là mã trên tàu. Tên lấy từ danh mục. Ba cột đầu bắt buộc. Import 1–1000 dòng, toàn bộ lô được kiểm tra trước khi lưu. Mã danh mục không tồn tại/ngừng dùng hoặc bản ghi trùng làm cả lô bị từ chối. File cũ không có CatalogCode cần chuyển sang mẫu mới.

## Xác minh

- Build frontend Shore: đạt.
- Build backend Shore: đạt, không cảnh báo/lỗi.
- 17 kiểm thử PostgreSQL phía Shore: đạt, không bỏ qua; gồm catalogue import, phạm vi tàu, ACK đồng bộ, giữ tồn kho/liên kết, lô import nguyên tử và gán đồng thời không tạo trùng.
- 5 kiểm thử PostgreSQL nhận vật tư phía Edge: đạt, không bỏ qua; không đổi mã nguồn Edge.
- Giao diện: tìm danh mục, gán với mã tàu khác mã công ty, sửa đơn giá riêng 30 → 31 trong khi giá danh mục vẫn 20, chặn gán trùng bằng thông báo rõ ràng.
- Vật tư QA đã ngừng dùng và gửi trạng thái ngừng dùng của danh mục qua API đồng bộ; dữ liệu đang sử dụng ban đầu được giữ nguyên. Container kiểm thử riêng đã được dọn.

Ảnh kiểm chứng nằm trong `outputs/material-assignment-20261102/` (không đưa vào Git).

Thay đổi chưa được đóng gói lại vào thư mục production trên Desktop.
