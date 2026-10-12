# Sửa đồng bộ cây thiết bị Edge ngày 12/10/2026

Đã sửa và áp dụng backend Edge trong Docker cho tàu BIENDONG STAR, IMO 9228289.

## Nguyên nhân

Sau nhập Excel, vòng đối soát xếp 753 nút thiết bị vào hàng đợi theo UUID. Bộ gửi lấy batch FIFO trước khi xét quan hệ cha–con. Những thiết bị con có UUID nhỏ được gửi trước khi bản ghi cha tồn tại trên bờ, gây PostgreSQL `23503`, ràng buộc `FK_equipment_assets_equipment_assets_ParentId`. Khi kiểm tra ban đầu, 174 bản ghi đã có lỗi; trước khi dừng backend để sửa, số bản ghi lỗi tăng lên 219.

Chỉ sắp xếp lại một batch không giải quyết được trường hợp cha nằm ngoài batch hoặc chưa được xếp hàng: vòng đối soát chỉ bổ sung 200 bản ghi mỗi bảng mỗi chu kỳ.

## Thay đổi

`edge_product/edge-services/Services/Core/SyncService.cs` lọc phụ thuộc **trước** giới hạn batch:

- Thiết bị con chờ khi cha có sự kiện chưa được xác nhận, kể cả trong thời gian chờ thử lại.
- Nếu cha chưa được đồng bộ và chưa có xác nhận CREATE/SNAPSHOT, thiết bị con chờ dù cha chưa được xếp hàng.
- Thiết bị gốc và dữ liệu không liên quan vẫn được gửi; sự kiện DELETE không áp dụng điều kiện chờ cha này.

Không xóa thiết bị, bỏ ParentId, vô hiệu hóa khóa ngoại hoặc đánh dấu thành công giả. Script phục hồi `scripts/db/retry-equipment-parent-sync-2026-10-12.sql` chỉ cho 219 sự kiện lỗi ParentId thử lại ngay; giữ payload, event ID, phiên bản, số lần thử và lỗi cũ cho đến khi nhận xác nhận thành công.

Bản sao lưu trước sửa: `artifacts/database-backups/edge-before-hierarchy-sync-20261012T091621Z.dump`. Backend đã được build và triển khai bằng compose hiện có; đồng bộ lại qua API `/api/sync/trigger`.

## Kiểm tra

- 41 kiểm thử SyncReliabilityTests đạt, không bỏ qua, gồm PostgreSQL và kiểm tra cha–con qua nhiều batch nhỏ.
- Một kiểm thử bổ sung với 205 thiết bị con vượt giới hạn đối soát 200 đạt: chưa gửi con khi cha chưa được xếp hàng; sau xác nhận cha mới gửi con. Kiểm thử tính đến giới hạn dung lượng metadata khi đóng gói batch.
- API Edge sau phục hồi: `pendingRecords=0`, `pendingWithErrors=0`, `deferredRecords=0`, `pendingFiles=0`, `isOnline=true`, không có lỗi kết nối.
- Bờ có đủ 753 nút từ Excel, 91 nhóm SYSTEM, hai nút gốc, một VesselId và không có ParentId mồ côi.
- Đối chiếu JSON của toàn bộ 753 nút giữa Edge và Shore đạt cho ID, mã, tên, category và ParentId.
- Không phát sinh lỗi FK hoặc retry đồng bộ thiết bị mới trong log sau áp dụng.

Lịch sử lỗi trước sửa được giữ lại để đối chiếu; trạng thái chờ và lỗi hiện tại đã hết. Đây là sửa thứ tự gửi cây thiết bị, không đổi quy tắc đồng bộ danh mục vật tư do bờ làm chủ.
