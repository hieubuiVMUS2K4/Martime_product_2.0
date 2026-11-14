# Seed báo cáo demo Edge → Shore

Công cụ chạy riêng bằng `--seed-demo-reports`: không mở webserver, không chạy worker,
không chạy migration hoặc startup seed. Chỉ chạy khi người vận hành chủ động gọi lệnh.
Không cần thao tác từng báo cáo trên web hoặc tạo thêm tài khoản/token đăng nhập.

## Bộ dữ liệu mặc định

- 90 ngày từ 16/08 đến hết 13/11/2026: 90 Noon, 36 Position, 18 Departure,
  18 Arrival, 5 Bunker (167 báo cáo).
- Tuyến demo Hải Phòng – Đà Nẵng theo chu kỳ 10 ngày, gồm ngày chạy biển và ngày ở cảng.
- ROB dầu được cân đối với tiêu thụ và các lần nhận thêm 300 t; nước ngọt có sản xuất/bổ sung.
- Phân bố trạng thái theo tuổi báo cáo: 2 ngày gần nhất nháp, 2 ngày tiếp chờ duyệt,
  ngày thứ 5 trả lại, ngày thứ 6 đã duyệt, còn lại gửi bờ.
- Nội dung dùng mô tả nghiệp vụ; người lập là Bộ phận khai thác, chữ ký là
  “Xác nhận thực hành”, không giả danh chữ ký của thuyền trưởng.
- Tổng hợp tuần/tháng bằng dịch vụ đang có, để **nháp**. Chưa hỗ trợ truyền hai loại
  tổng hợp bằng luồng `TransmitReportAsync`; không tự gán là đã truyền.

## Chạy

1. Sao lưu database. Đối chiếu đúng IMO và danh mục ReportType trên hai node.
   Shore là nguồn danh mục. Nếu cả hai chưa có danh mục, dùng
   `scripts/db/seed_reporting_catalog_shore.sql` trên Shore và đồng bộ danh mục xuống Edge.
   Công cụ Edge có thể điền các loại còn thiếu theo bộ chuẩn 1..5, nhưng từ chối ID/code xung đột.
2. Build/publish backend. Với server nhỏ (Edge hiện chỉ có 1 GB RAM), chạy công cụ trên
   máy local qua SSH tunnel bằng runner Node.js bên dưới. Không chạy thêm một tiến trình
   backend/EF trên server vì khởi tạo model có thể gây hết RAM. Không thay container đang phục vụ.
3. Xem trước, không ghi database:

```sh
dotnet MaritimeEdgeServer.dll --seed-demo-reports --vessel-imo 9278367 \
  --batch reports-20261114 --start 2026-08-16 --days 90
```

4. Thêm `--apply` để thực hiện. IMO phải khớp cấu hình provisioning hiện tại.
   Script khóa đồng thời các lần seed, tạo và chuyển trạng thái từng báo cáo trong một
   transaction, dùng lại ReportingService. Khi lỗi, dừng và rollback riêng bản ghi đang làm.
5. Chạy lại **cùng tham số**: bảng `report_seed_registry` lưu khóa `[SEED:batch:date:type]` sẽ khiến báo cáo đã có bị bỏ qua,
   kể cả báo cáo đã xóa mềm. Không tạo thêm hàng đợi cho báo cáo đã gửi.
   Noon có ngày bị chiếm bởi dữ liệu khác cũng được bỏ qua, không sửa/xóa dữ liệu cũ.
6. Xác minh số lượng/trạng thái Edge, hàng đợi và bản ghi thực nhận ở Shore theo ID.
   `TRANSMITTED` phía Edge có nghĩa đã xếp hàng; chỉ xác nhận nhận thành công sau khi
   đối chiếu với Shore. Lịch sử thao tác là thời điểm chạy seed, ngày báo cáo là ngày demo.

### Runner cho server từ xa (khuyến nghị)

```powershell
dotnet publish edge_product/edge-services/EdgeCollector.csproj -c Release -o artifacts/demo-report-seed/runtime
node scripts/db/run-demo-reports-remote.mjs --host 103.82.26.114 `
  --key C:/Users/hieuu/.ssh/maritime_cicd_edge_20261105 `
  --container production-edge-backend-1 --runtime artifacts/demo-report-seed/runtime `
  --imo 9278367 --start 2026-08-16 --days 90 --batch reports-20261114
```

Thêm `--apply` sau khi xem trước. Runner dùng quyền SSH đã có, đọc cấu hình container
vào bộ nhớ và mở tunnel PostgreSQL chỉ trên loopback. Không lưu hoặc in mật khẩu/token/khóa,
không tạo credential mới. Tính toán chạy trên máy local; dịch vụ đồng bộ đang có trên Edge
sẽ xử lý hàng đợi. `--verbose` hiển thị log đã che thông tin xác thực khi cần chẩn đoán.

Không có lệnh xóa tự động. Registry cho phép nhận diện chính xác đợt dữ liệu khi cần dọn;
việc xóa phải xét cả parent/detail, lịch sử, hàng đợi và dữ liệu đã nhận ở Shore.

## Chuẩn hóa nội dung đợt dữ liệu cũ

`node scripts/db/normalize-seeded-reports.mjs` xem trước; thêm `--apply` để sao lưu
và sửa nội dung trên cả Edge/Shore. Giữ nguyên ID, ngày báo cáo, số liệu và trạng thái.
Registry được tạo trước khi bỏ marker cũ, bảo đảm chạy seed lại không trùng dữ liệu.
Đã sửa 830 bản ghi Edge và 312 bản ghi Shore ngày 14/11/2026.
Đã chuẩn hóa thêm 6 cảnh báo và 8 sự kiện động cơ trên mỗi node.

`scripts/db/refresh-seeded-report-insights.py` chạy trên Shore để phân tích lại các
báo cáo có kết quả API lỗi bằng cấu hình Groq hiện có. Script gửi thông số vận hành
tới Groq; chỉ chạy khi được chủ hệ thống cho phép. Cần sao lưu database trước đó.
Thêm `--all` để phân tích lại toàn bộ báo cáo trưa trong registry. Ngày 14/11/2026,
đã chạy lại đủ 84/84; kiểm tra sau chạy: 0 lỗi API cũ, 0 kết quả chứa từ demo.
Đơn vị đầu vào: nhiệt độ nước biển °C, FO MT/ngày báo cáo, vòng tua rpm, tốc độ knots;
kèm bối cảnh vận hành để phân biệt ở cảng và chạy biển.

## Kiểm thử

`DemoReportSeedTests` kiểm tra đủ 5 loại, khóa lặp ổn định, DTO/business validation,
thứ tự thời gian và cân đối nhiên liệu xuyên suốt cả đợt.

## Kết quả chạy production 14/11/2026

Tàu HP PIONEER VMU, IMO 9278367; batch `reports-20261114`.

| Dữ liệu | Số lượng |
| --- | ---: |
| Noon / Position / Departure / Arrival / Bunker | 90 / 36 / 18 / 18 / 5 |
| Báo cáo gửi Shore | 156 |
| Nháp / chờ duyệt / đã duyệt chưa gửi / trả lại | 4 / 4 / 1 / 2 |
| Tổng hợp tuần / tháng, trạng thái nháp | 14 / 4 |

- Đối chiếu **từng ID**: 156 báo cáo gửi từ Edge đều có trên Shore, không thiếu ID.
- Chạy lại cùng tham số: `created=0`, `skipped=167`, `conflicts=0`, không thêm tổng hợp.
- Kiểm thử bộ seed: 6/6 đạt; frontend production build thành công.
- Đã kiểm tra giao diện: danh sách Shore 156 báo cáo, tab tuần 14 và tab tháng 4 trên Edge.
- Sao lưu trước khi ghi: `/root/demo-report-seed-20261114/edge-before.dump` trên Edge,
  `/root/demo-report-seed-20261114/shore-before.dump` trên Shore.
- Lần thử chạy CLI trong container Edge gây thiếu RAM (server 1 GB, không swap), khiến
  backend khởi động lại một lần; chưa tạo báo cáo ở lần này. Sau đó toàn bộ seed chạy
  từ local qua SSH tunnel; không chạy thêm backend trên server.
- Phát hiện dashboard dùng mã loại để tra dictionary mà API cũ trả theo tên loại.
  Mã nguồn đã bổ sung `reportsByTypeCode`, giữ tương thích dictionary tên cũ.
  Thay đổi giao diện/API này chưa được triển khai lên production trong đợt seed.

Báo cáo tổng hợp ở các tuần/tháng đầu và cuối chỉ tổng hợp phần ngày có dữ liệu.
Không tạo chuyến đi trong module Voyage nên số chuyến/port call phụ thuộc liên kết
Voyage của dịch vụ tổng hợp; các số liệu này không được giả bằng cách ghi đè kết quả.
