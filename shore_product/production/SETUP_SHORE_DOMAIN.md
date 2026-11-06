# Chuyển Shore sang shore.vesselmaritimevmu.site

## Cloudflare

1. Chọn zone `vesselmaritimevmu.site`, đảm bảo zone Active.
2. DNS → Records, thêm bản ghi A, Name `shore`, Content là IP công khai server Shore. Theo thông tin hiện tại là `103.82.22.151`. Bật Proxied, TTL Auto.
3. SSL/TLS → Origin Server → Create Certificate, tạo chứng chỉ có hostname `shore.vesselmaritimevmu.site`.
4. Lưu Origin Certificate thành `origin.pem`, Private Key thành `origin-key.pem`.
5. SSL/TLS → Overview, chọn Full (strict). Kiểm tra Universal SSL Active.
6. Copy hai file vào `certs/` trong thư mục gói Shore trên server. Chứng chỉ cũ chỉ dành cho `shcdvmu.site` không khớp hostname mới.

## Gói Desktop production-shore

Gói trong `production_deployment/production-shore` đã cập nhật trực tiếp các file đang được Docker sử dụng. Gói này dùng lệnh `docker compose` thông thường.

Các file cần copy cập nhật qua WinSCP vào thư mục Shore đang chạy trên server gồm `docker-compose.yml`, `nginx/default.conf`, `nginx/default.conf.template`, và `apply-shore-domain.sh`.

Script áp dụng sẽ sao lưu `.env` trên server rồi cập nhật dòng dưới đây, giữ các mật khẩu và khóa hiện có của server.

```dotenv
SHORE_PUBLIC_BASE_URL=https://shore.vesselmaritimevmu.site
```

File Compose dùng URL mới làm giá trị mặc định. Biến `.env` có giá trị cũ sẽ ghi đè mặc định, vì vậy phải cập nhật dòng trên nếu đã có.

Theo thư mục server bạn đang dùng, đặt chứng chỉ tại `/root/production/certs/origin.pem` và `/root/production/certs/origin-key.pem`. Mount `./certs` được tính từ thư mục gói, nên nếu đổi thư mục chỉ cần đặt `certs` bên trong thư mục đó.

Sau khi copy file, chạy trên server.

```bash
cd /root/production
bash apply-shore-domain.sh
```

Script kiểm tra file chứng chỉ, hostname và ngày hết hạn, sao lưu/cập nhật URL trong `.env`, rồi kiểm tra cấu hình Compose trước khi cập nhật backend/frontend. Khi thành công, kiểm tra đăng nhập tại `https://shore.vesselmaritimevmu.site`.

Cloudflare cần trỏ đến dịch vụ đã cập nhật trên server. Thay đổi file trên máy cá nhân chưa thay đổi container đang chạy trên cloud.

## Gói nguồn shore_product/production

Gói nguồn có cấu hình SSL riêng để chủ động lựa chọn khi triển khai.

```bash
docker compose -f docker-compose.yml -f docker-compose.ssl.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d --build
```

Đặt chứng chỉ trong `certs/` cùng gói trước khi chạy. Hướng dẫn lệnh một file Compose ở mục gói Desktop áp dụng cho gói Desktop đã được cập nhật trực tiếp.

## Kết nối Edge và tên miền cũ

Các Edge đã provision cần cập nhật địa chỉ Shore trong hồ sơ provisioning sang `https://shore.vesselmaritimevmu.site`, giữ thông tin node, tàu và khóa. Việc đổi URL Nginx không sửa database Edge từ xa.

Các gói provisioning tạo sau khi áp dụng PublicBaseUrl mới cần được kiểm tra có chứa URL mới trước khi sử dụng. Người dùng đăng nhập lại trên tên miền mới.

Cấu hình này chuyển hostname phục vụ sang tên miền mới. Truy cập tên miền cũ sau khi thay chứng chỉ có thể lỗi TLS. Nếu cần phục vụ hoặc chuyển hướng tên miền cũ, cần cấu hình riêng cùng chứng chỉ phù hợp với tên miền đó.

## Tài liệu Cloudflare

- https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/
- https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/
- https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/
