# Kiểm tra merge hoang58-hiu67 ngày 07/10/2026

## Nguồn hợp nhất

- Nhánh đích: `feature/hiu67`, trước merge là `509107de`.
- Nhánh nguồn: `origin/feature/hoang58-hiu67`, commit `2ba580e3`.
- Giải quyết hai xung đột trong `SyncLinkPolicy.cs` của Edge và Shore bằng cách giữ cả `maintenance_history` và `ship_data` ở ưu tiên Operational.
- Giữ các sửa lỗi PMS, lịch sử bảo trì, phân quyền và phiên đăng nhập đã có trên hiu67.

## Kiểm tra và sửa sau merge

- Hai kiểm thử cũ dùng cảng làm dữ liệu gửi lên bờ không còn phù hợp khi cảng chuyển sang do bờ quản lý. Đổi kiểm thử đối soát hơn 200 dòng sang StoreLocation; đổi kiểm thử rollback khóa tự tăng sang NmeaRawData, vẫn giữ mục đích kiểm tra ban đầu.
- Thêm kiểm thử cảng không phát sinh bản tin gửi ngược lên bờ khi SaveChanges hoặc đối soát.
- Sửa kiểm tra IMO của patch thông số tàu để nhận diện `ImoNumber`, `imoNumber` và `imo_number`, ngăn payload có tên trường khác kiểu chữ cập nhật nhầm tàu. Kiểm thử cũng xác nhận patch chỉ sửa các trường đã gửi và giữ ID của tàu.
- Thêm kiểm thử PostgreSQL cho thông số tàu hai chiều: chỉnh sửa trên bờ tạo patch đúng các trường đã đổi; snapshot cũ từ tàu không ghi đè phần bờ đang gửi; sau khi tàu xác nhận, sửa đổi mới từ tàu được nhận bình thường.

## Kết quả

| Kiểm tra | Kết quả |
| --- | --- |
| Backend Edge, toàn bộ test gồm PostgreSQL | 161 đạt, 0 bỏ qua |
| Backend Shore, toàn bộ test gồm PostgreSQL | 43 đạt, 0 bỏ qua |
| Test bổ sung thông số tàu trên Shore | 1 đạt |
| Weather routing | 17 đạt |
| Thư viện dùng chung | 4 đạt |
| Phiên đăng nhập và phân quyền frontend Edge | 34 đạt |
| Build production frontend Edge | Đạt |
| Build production frontend Shore | Đạt |

Tổng cộng 260 test đạt. PostgreSQL dùng container tạm riêng và database `codex_pms_tests_*`, không chạy migration hay thao tác nghiệp vụ vào database ứng dụng. Báo cáo TRX được giữ cục bộ trong `artifacts/test-results/merge-2026-10-07/`.

Giới hạn: đã build và chạy kiểm thử tự động; chưa kiểm tra trực quan từng màn hình web hay thao tác mobile trên môi trường triển khai thực tế.
