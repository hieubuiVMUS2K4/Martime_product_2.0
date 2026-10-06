# PMS: nhóm thiết bị và quyền quản lý danh mục — 2026-10-03

## Thiết bị

- Nút dấu cộng trên đầu cây mở **Thêm nhóm thiết bị**. Nhóm vẫn là node `equipment_assets.Category = SYSTEM`, không đổi mã của các node đã có.
- Tạo nhóm từ cây tạo một bản ghi `equipment_groups` trong cùng lần SaveChanges và liên kết qua `equipment_assets.EquipmentGroupId`. Người phụ trách lưu vào trường có sẵn `equipment_groups.PicCrewId`, dùng mã `crew_members.CrewId` (không dùng UUID `crew_members.Id`). API kiểm tra thuyền viên đang trên tàu.
- Nhóm cũ chưa có liên kết/người phụ trách được bổ sung bằng **Sửa nhóm thiết bị**. Không tự chọn người thay người dùng. Thiết bị con chưa có nhóm nhận liên kết nhóm khi cập nhật nhóm cũ; các nhánh đã có nhóm riêng được giữ lại.
- Bảng chỉ hiển thị thiết bị thật, loại toàn bộ node SYSTEM, kể cả khi chọn nhóm có nhóm con. Chọn thiết bị trong cây tiếp tục hiển thị bảng, không mở màn chi tiết.
- Đã đối chiếu PostgreSQL: bảng `equipment_assets` có 24 cột scalar; DTO/API trả đủ các trường. Theo điều chỉnh giao diện mới, bảng chỉ hiển thị tiêu đề, mã, phân loại, trạng thái, hãng, model, serial, ngày lắp đặt, giờ chạy, thời điểm cập nhật giờ chạy, thông số và người phụ trách. Các trường vị trí, mức độ quan trọng, vai trò, ghi chú, quan hệ/ID, trạng thái sử dụng/đồng bộ và audit được ẩn khỏi bảng. Header, cột tiêu đề và cột hành động cố định, phần còn lại cuộn ngang; ô dài có tooltip.
- Cột **Người phụ trách** hiển thị tên từ `crew_members.FullName` qua `equipment_groups.PicCrewId = crew_members.CrewId`, dùng lookup theo batch, bao gồm thuyền viên đã rời tàu. Có tìm kiếm không dấu cho các cột chữ và dropdown cho phân loại/trạng thái. Ngày lắp đặt, giờ chạy hiện tại và cập nhật giờ chạy không có bộ lọc theo điều chỉnh mới. Cột cố định dùng đường viền đơn, bỏ shadow ở ranh giới để tránh đường đậm. Các bộ lọc kết hợp với nhánh cây và áp dụng trước phân trang; đổi bộ lọc đặt lại trang và lựa chọn dòng.
- Icon vật tư liên kết trong cột hành động mở popup, có gán/gỡ và sửa số lượng/ghi chú. Popup hiển thị thêm đơn vị, tồn tối thiểu, quy cách, ngày liên kết ; ẩn ID liên kết/vật tư/thiết bị, mã vật tư lấy từ material_item_ship.ItemCode; không bỏ thông tin kế thừa từ thiết bị cha.
- Chọn nhóm chỉ hiển thị nút **Chỉnh sửa nhóm thiết bị** bên cạnh **Thêm thiết bị**, bỏ khối thông tin nhóm/người phụ trách phía trên bảng.
- Cấu hình mới/cập nhật phải chọn `EquipmentAssetId` của thiết bị đang hoạt động, không dùng SYSTEM hoặc `EquipmentGroupId`. Không xóa lịch bảo trì theo nhóm đã có trong database.

## Vật tư bờ–tàu

- Điểm quản lý trên bờ: **Danh sách tàu → chọn tàu → Danh sách vật tư**. Bỏ mục Vật tư khỏi menu Danh mục và phần render của trang Danh mục. Thêm/sửa mở popup tại chỗ; không điều hướng sang màn khác.
- Nút thêm, xóa nhiều và đồng bộ có icon kèm tên. Chỉ tải mẫu/import dùng icon, đặt cạnh nhau. Shore bỏ nút gán và cột Thiết bị trên danh sách vật tư. Trạng thái đồng bộ có lọc; kiểm tra lại mỗi 15 giây.
- API /api/vessels/{vesselId}/materials giới hạn CRUD đúng tàu. Import tối đa 1000 vật tư mới, từ chối cả file nếu sai/trùng. Mẫu gồm ItemCode, Name, Unit, PartNumber, Manufacturer, Specification, Supplier, UnitCost, Notes; không có loại vật tư hay số lượng tồn kho.
- Giữ material_items và material_item_ship cho liên kết thiết bị/phiếu kho. Mã hiển thị là mã nội bộ trên tàu; catalog bên dưới là danh tính kỹ thuật riêng của vật tư. Cùng mã trên hai tàu có thể có tên/thông tin riêng.
- Luồng mới không đọc/ghi material_categories. CategoryId giữ dữ liệu lịch sử, mặc định 0 cho bản ghi mới. Migration Edge 20261003090000_RemoveMaterialDefinitionCategoryRequirement gỡ đúng hai FK loại vật tư, không xóa bảng/dữ liệu cũ. Đã đối chiếu PostgreSQL: bờ không có FK tới bảng loại. API/mã loại cũ giữ tương thích, không xuất hiện trong luồng mới.
- POST .../materials/sync tìm node đã đăng ký, chưa thu hồi của đúng tàu; không broadcast. Tàu chưa cấp node trả lỗi rõ. Payload vessel_material_definition chỉ gồm định nghĩa, không ghi đè liên kết thiết bị trên tàu, không có số lượng tồn. Gửi cả IsActive=false để xóa mềm xuống tàu.
- Trạng thái dựa trên payload mới nhất và DeliveredAt của đúng node: Chưa đồng bộ / Chờ tàu nhận / Đã đồng bộ. So sánh nội dung, không dùng ngày thay đổi tồn kho để đánh giá danh mục.
- Edge lưu catalog + vật tư trong cùng SaveChanges, giữ số lượng, ngưỡng tồn, lịch sử và cờ upload vận hành chưa gửi. Retry snapshot cũ không ghi đè bản mới. Chỉ ACK outbox ID đã áp dụng/lưu thành công. ACK do dịch vụ tự gửi khi có kết nối, không cần người trên tàu bấm duyệt.
- Danh mục vật tư chỉ đồng bộ bờ → tàu. Edge không xếp hàng qua SaveChanges, đối soát hay đồng bộ toàn bộ; hàng đợi định nghĩa cũ chưa gửi được loại bỏ khi chạy đồng bộ. Shore bỏ qua CREATE/UPDATE/DELETE/SNAPSHOT định nghĩa từ Edge, gồm cả batch cũ. Tồn kho, phiếu kho và liên kết thiết bị là dữ liệu vận hành riêng, giữ luồng đồng bộ hiện có.
- Shore và Edge đều hiển thị Mã phụ tùng; Edge thêm Thuộc thiết bị (mã và tên), nối material_item_ship.MaterialItemCode → material_items.ItemCode → material_item_equipment → equipment_assets, không nối nhầm bằng mã hiển thị. Có lọc mã phụ tùng và thiết bị.
- Trang tàu chỉ đọc **Danh mục vật tư từ công ty**, lấy dữ liệu vật tư theo tàu đã nhận để hiển thị đúng mã nội bộ, không có loại vật tư. API Edge sửa danh mục vẫn trả 403 SHORE_MANAGED_CATALOG.
- Cần triển khai cả backend/frontend bờ và Edge; Edge chạy migration. Chưa thay đổi database thật trong bước kiểm thử.

## Kho

- Khôi phục cây phân cấp dùng `store_locations.ParentId`, có thu/mở nhánh và chọn kho để lọc bảng theo kho và các vị trí con.
- Thêm kho khi đang chọn một nhánh mặc định dùng nhánh đó làm cha. Đổi nhánh đặt lại phân trang và lựa chọn dòng.

## Kiểm tra

- Build frontend Edge và Shore thành công (còn cảnh báo kích thước bundle cũ).
- Edge: 40/40 test pass trên PostgreSQL riêng, gồm PIC, nhóm cũ, thiết bị con, cấu hình không nhận thư mục và API danh mục edge trả 403.
- Shore: 9/9 test PostgreSQL pass, gồm thêm/cập nhật + outbox, từ chối toàn bộ batch có dòng sai, rollback khi outbox lỗi.
- Các database thử nghiệm đã dọn; không áp dụng migration hoặc thay dữ liệu sản xuất. Giao diện chưa được kiểm tra trực tiếp trong trình duyệt.

Chạy test Shore PostgreSQL bằng `dotnet vstest shore_product/backend.Tests/bin/PmsSchemaReview/net8.0/product-api.Tests.dll` sau khi build, với `SHORE_PMS_TEST_CONNECTION_STRING` trỏ tới database riêng có tên bắt đầu bằng `codex_pms_tests_`.

## Điều chỉnh hiển thị và kiểm tra đồng bộ

- Shore: thứ tự mã, tên, mã phụ tùng, đơn vị, mô tả, trạng thái đồng bộ, ngày cập nhật, hành động; bảng fixed layout có cuộn ngang và tooltip cho dữ liệu dài.
- Đối chiếu dữ liệu chạy thật: outbox 107/108 đã xác nhận, vật tư adas (ID 8209b37c-3819-4507-b604-76b1ab12e7c3) có trên Edge. Backend Edge đang chạy chưa có GetAssignedEquipment, nên Promise.all trước đây làm rỗng danh mục khi API liên kết lỗi.
- Màn hình Edge tải vật tư độc lập với lỗi API liên kết, giữ dữ liệu khi tải lỗi và hiện cảnh báo; làm mới mỗi 15 giây và khi quay lại tab. Cần khởi động lại backend Edge để nhận endpoint mới.
- ACK Shore chỉ chấp nhận đúng ID dương và đúng node, bỏ cách đánh dấu theo số lượng khi ACK sai/lặp. Edge từ chối bảng không hỗ trợ hoặc thiếu handler thay vì ACK dù chưa lưu.

## Chặn đồng bộ vật tư trùng

- Bỏ dòng hướng dẫn trên danh sách vật tư Shore; thành công/thất bại đồng bộ hiển thị toast.
- API so sánh định nghĩa với outbox mới nhất của đúng node và ID vật tư, chỉ xếp hàng bản ghi mới hoặc thay đổi (gồm xóa mềm). So sánh không phụ thuộc ngày cập nhật tồn kho hoặc liên kết thiết bị.
- HTTP 409 NO_MATERIAL_CHANGES nếu đã đồng bộ, không có thay đổi; MATERIAL_SYNC_PENDING nếu đang chờ tàu nhận và không có thay đổi. Danh sách rỗng cũng trả lỗi, không tạo outbox.
- Khóa transaction PostgreSQL theo tàu chống hai yêu cầu đồng thời tạo bản ghi trùng. Kiểm thử thực tế trên PostgreSQL riêng: 9/9 đạt; build frontend/backend Shore đạt. Cần khởi động lại backend Shore để áp dụng.
