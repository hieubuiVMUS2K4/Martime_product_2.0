# Nhập thiết bị và vật tư vào database tàu

Đã thực hiện ngày 12/10/2026 trên `maritime-edge-postgres`, database `maritime_edge`, tàu **BIENDONG STAR**, IMO **9228289**.

| Dữ liệu mới | Số bản ghi |
| --- | ---: |
| Thiết bị/hạng mục từ sheet Equipment | 662 |
| Tiêu đề/nhóm trong cây thiết bị, category SYSTEM | 91 |
| Danh mục vật tư | 10 |
| Vật tư theo tàu, tồn khởi tạo 0 | 10 |
| Liên kết vật tư–thiết bị từ mô tả công việc | 251 |

Thiết bị giữ mã `BD26-E...`, tên và quan hệ cha–con của file đầy đủ. Các nhóm nguồn là nút SYSTEM trong cây thiết bị, không tự tạo nhóm phân công EquipmentGroup hoặc gán PIC. Không tự bổ sung hãng, model, serial, giờ chạy, ngày lắp đặt hay lịch sử bảo trì. Các bản ghi cũ được giữ nguyên.

File nguồn là kế hoạch bảo trì, không phải bảng tồn kho hoặc BOM đã xác minh. 10 mục vật tư tổng quát gồm: mỡ bôi trơn, sơn, hóa chất vệ sinh, silicagel, phớt làm kín, vòng bi, ắc quy, dầu bôi trơn, lọc thay thế và xi măng lớp bảo vệ. Chỉ lấy vật tư được nhắc rõ trong mô tả hoặc tên hạng mục có yêu cầu thay thế; không suy ra loại dầu từ một công việc chỉ ghi “lubrication”.

Mã vật tư dùng `BD26-MAT-...`. Quy cách, part number, hãng, giá, số lượng tồn và định mức chưa có trong nguồn. Tồn và `quantity_required` khởi tạo **0**, với ghi chú định mức chưa xác định. Đơn vị KG/LTR/PCS là gợi ý cần xác nhận. Các liên kết ghi nhận nội dung nguồn, chưa xác nhận tính tương thích của phụ tùng hoặc yêu cầu mua hàng. Cần bổ sung quy cách trước khi đặt mua/sử dụng và ghi nhận tồn thực tế bằng quy trình kho.

Các tài liệu:

- [applied-result.json](applied-result.json): kết quả thực hiện, số bản ghi, đường dẫn bản sao lưu và bằng chứng cho từng liên kết.
- [import-manifest.json](import-manifest.json): nguồn, SHA-256 của file Excel, quy tắc và kết quả chuẩn bị gần nhất.
- [import-edge.sql](import-edge.sql): SQL nhập trong một transaction, có kiểm tra tàu, dữ liệu và liên kết trước COMMIT.

Script tại `scripts/pms/import-biendong-equipment-materials.cjs`:

```powershell
# Chỉ chuẩn bị SQL/manifest và kiểm tra dữ liệu, không ghi database:
node scripts/pms/import-biendong-equipment-materials.cjs

# Sao lưu toàn bộ database trước khi nhập, rồi kiểm tra bản ghi cũ không đổi:
node scripts/pms/import-biendong-equipment-materials.cjs --apply
```

Script không được gọi khi khởi động ứng dụng. Chạy lại giữ bản ghi theo mã, không ghi đè dữ liệu hoặc đặt lại tồn kho; nếu thiết bị trùng mã khác tên, category hoặc cây cha–con thì dừng để rà soát. Chưa nhập 680 cấu hình công việc, 54 dòng cần rà soát, các mốc lịch sử hay dấu hoàn thành tháng.

Đã kiểm tra trực tiếp sau COMMIT: đủ 753 nút nguồn, hai nút gốc, không có cha bị thiếu, đủ 10 vật tư trên tàu với tồn 0 và đủ 251 liên kết với định mức chưa xác định. Chạy chuẩn bị lại nhận diện toàn bộ 753 mã đã có, không có thiết bị mới cần nhập.
