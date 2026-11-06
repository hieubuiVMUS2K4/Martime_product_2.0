# HTTPS cho Edge trên server riêng

Tên miền sử dụng là `edge.vesselmaritimevmu.site`. Shore tiếp tục sử dụng `shcdvmu.site` trên server Shore. Hướng dẫn này dành cho server Edge riêng có IP công khai.

## 1. Kích hoạt tên miền trên Cloudflare

1. Thêm zone `vesselmaritimevmu.site` vào Cloudflare nếu chưa có.
2. Tại nhà cung cấp tên miền, đặt nameserver theo đúng hai nameserver Cloudflare cấp cho zone này.
3. Chờ trạng thái zone trên Cloudflare chuyển sang Active.
4. Vào DNS → Records → Add record, chọn Type A, Name `edge`, IPv4 address là IP công khai của server Edge, Proxy status Proxied và TTL Auto.
5. Lưu bản ghi. Nếu đã có bản ghi `edge`, sửa bản ghi hiện có để trỏ tới server Edge.

## 2. Tạo chứng chỉ

1. Mở zone `vesselmaritimevmu.site` → SSL/TLS → Origin Server → Create Certificate.
2. Chọn tạo private key và CSR trên Cloudflare, loại RSA.
3. Đảm bảo danh sách hostname có `edge.vesselmaritimevmu.site`, rồi tạo chứng chỉ.
4. Lưu nội dung Origin Certificate thành file `origin.pem`.
5. Lưu nội dung Private Key thành file `origin-key.pem`. Giữ private key riêng, không đưa vào Git hoặc gửi trong chat.
6. Vào SSL/TLS → Overview, chọn Full (strict).
7. Kiểm tra SSL/TLS → Edge Certificates có Universal SSL ở trạng thái Active.

Origin Certificate được Cloudflare xác thực khi kết nối tới Nginx. Trình duyệt truy cập trực tiếp IP hoặc bỏ qua Cloudflare có thể báo chứng chỉ không được tin cậy.

## 3. Đưa gói lên server Edge

Hướng dẫn dùng thư mục `/root/production-edge`. Nếu bạn dùng thư mục khác, đổi lệnh `cd` tương ứng. Các đường dẫn chứng chỉ trong Compose được tính tương đối từ thư mục gói.

Copy gói production-edge bằng WinSCP. Đảm bảo có các file bổ sung sau.

- `docker-compose.ssl.yml`
- `nginx/default.ssl.conf.template`
- `SETUP_EDGE_CLOUDFLARE.md`

Tạo thư mục chứng chỉ trên server.

```bash
cd /root/production-edge
mkdir -p certs
```

Dùng WinSCP đưa hai file chứng chỉ vào đúng vị trí.

```text
/root/production-edge/certs/origin.pem
/root/production-edge/certs/origin-key.pem
```

Thiết lập quyền file.

```bash
chmod 700 certs
chmod 600 certs/origin-key.pem
chmod 644 certs/origin.pem
```

Đảm bảo file `.env` đã chứa cấu hình database, khóa xác thực và khóa truy cập nội bộ hợp lệ. Nếu tạo `.env` từ `.env.production`, phải điền các giá trị của server trước khi chạy. Cổng HTTP và HTTPS có thể để mặc định 80 và 443. `EDGE_SECURITY_ENFORCE_HTTPS` cần đặt `true`.

Trong firewall của nhà cung cấp cloud, cho phép TCP 80 và 443 đi vào server Edge. Nếu UFW đang bật, thêm hai rule dưới đây. Giữ rule SSH hiện có.

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

## 4. Kiểm tra và chạy

Các lệnh HTTPS luôn dùng cả hai file Compose. File SSL bổ sung cổng 443 và mount chứng chỉ cùng template HTTPS vào service frontend.

```bash
cd /root/production-edge
sudo docker compose -f docker-compose.yml -f docker-compose.ssl.yml config --quiet
test -s certs/origin.pem && test -s certs/origin-key.pem
sudo docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d --build
sudo docker compose -f docker-compose.yml -f docker-compose.ssl.yml exec frontend nginx -t
sudo docker compose -f docker-compose.yml -f docker-compose.ssl.yml ps
sudo docker compose -f docker-compose.yml -f docker-compose.ssl.yml logs --tail=50 frontend
```

Chỉ chạy bước `up -d --build` sau khi lệnh kiểm tra hai file chứng chỉ thành công.

Kiểm tra HTTPS trên server bằng hostname đúng. `-k` trong lệnh kiểm tra này cho phép curl dùng Cloudflare Origin CA mà chưa cài CA vào máy. Nó không thay đổi kiểm tra chứng chỉ của Cloudflare Full (strict).

```bash
curl -kI --resolve edge.vesselmaritimevmu.site:443:127.0.0.1 https://edge.vesselmaritimevmu.site/
curl -I https://edge.vesselmaritimevmu.site/
```

Sau đó mở `https://edge.vesselmaritimevmu.site` để kiểm tra đăng nhập và gọi API.

## 5. Các lần cập nhật tiếp theo

```bash
cd /root/production-edge
sudo docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d --build
```

Sau khi thay chứng chỉ, khởi động lại frontend bằng cùng hai file Compose.

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.ssl.yml restart frontend
```

## 6. Đồng bộ với Shore

HTTPS của giao diện Edge và cấu hình đồng bộ tàu–bờ được thiết lập riêng. Cấp/import gói provisioning của tàu với địa chỉ Shore thực tế `https://shcdvmu.site` và thông tin node của tàu. Giữ thông tin định danh, khóa đồng bộ của tàu khi cập nhật gói production.

## 7. Đọc lỗi

- 521 thường cần kiểm tra frontend có chạy và server có nghe cổng 443 hay không.
- 525 cần kiểm tra bắt tay TLS với Nginx.
- 526 cần kiểm tra chứng chỉ có đúng hostname, còn hạn và được Cloudflare chấp nhận hay không.
- `cannot load certificate` cần kiểm tra file chứng chỉ đã nằm trong `certs` cùng gói và đúng tên hay chưa.
- 502 từ Nginx cần xem log backend. Template Edge chuyển tiếp API đến `backend:5001`.

## Tài liệu đối chiếu

- https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/
- https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/
- https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/
