# CI/CD cho Shore và Edge

## Cách chạy

Nhánh `production` chứa phiên bản được chọn để phát hành lên hai server. Làm việc và kiểm tra trên các nhánh phát triển, sau đó merge phiên bản đã chọn vào `production` và push nhánh này để phát hành. Nhánh `codex/setup-cicd` dùng để phát triển cấu hình pipeline.

Hai workflow `Shore CI/CD` và `Edge CI/CD` hoạt động độc lập. Mỗi workflow kiểm tra phần thay đổi rồi chạy backend hoặc frontend tương ứng. Job kiểm tra thay đổi luôn chạy, các job build không liên quan được bỏ qua.

| Thay đổi | Phần được build và test |
| --- | --- |
| `shore_product/backend`, `shore_product/backend.Tests` | Backend Shore |
| `shore_product/frontend` | Frontend Shore |
| `edge_product/edge-services`, `edge_product/edge-services.Tests` | Backend Edge |
| `edge_product/frontend-edge` | Frontend Edge |
| Một trong hai thư mục `shared` | Cả hai backend để kiểm tra tương thích |
| Dockerfile backend | Backend của ứng dụng đó |
| Nginx, entrypoint hoặc Dockerfile frontend | Frontend của ứng dụng đó |
| Workflow, script CI/CD, cấu hình build .NET cấp repository | Cả hai ứng dụng |
| Tài liệu, Excel, mobile | Không build ứng dụng web |

Push trên `production`, `master`, `main`, `dev`, `hiu67-rework`, `codex/**`, `feature/**` và `release/**` chạy kiểm tra. Pull request vào `production`, `master` hoặc `main` cũng chạy kiểm tra. Chỉ push lên `production` mới xuất bản Docker image lên GHCR. Triển khai tự động chỉ chạy khi Repository Variable `CI_DEPLOY_ENABLED` bằng `true`.

Image mang tag theo commit SHA để xác định chính xác phiên bản. Server pull đủ các image cần cập nhật trước khi thay container. Backend test sử dụng PostgreSQL tạm trên GitHub, độc lập với database production.

Backend image không chứa `appsettings*.json`. Khi triển khai, script mount `backend/appsettings.json` đang có trên server và `backend/appsettings.Production.json` nếu có. `.env`, khóa, chứng chỉ và dữ liệu trong gói server tiếp tục được sử dụng.

## 1. Chuẩn bị trên mỗi server

Cài Docker Engine, Docker Compose plugin và Python 3. Gói production phải đang chạy thành công trước lần deploy CI/CD đầu tiên, với một backend và một frontend trong đúng Compose project.

Shore theo thông tin hiện tại dùng `/root/production`. Edge có thể dùng `/root/production-edge`, cần kiểm tra đường dẫn thực tế.

```bash
docker compose version
python3 --version
cd /root/production
docker compose ps
test -s backend/appsettings.json
```

Trên Edge dùng cả file SSL nếu đang triển khai theo cấu hình đó.

```bash
cd /root/production-edge
docker compose -f docker-compose.yml -f docker-compose.ssl.yml ps
test -s backend/appsettings.json
```

Kiểm tra tên project đang chạy bằng lệnh sau trên mỗi server. Ghi lại tên ở cột đầu để điền `DEPLOY_PROJECT_NAME`.

```bash
docker compose ls
```

## 2. Quyền đọc image GHCR

Workflow dùng `GITHUB_TOKEN` với quyền `packages:write` khi xuất bản image và `packages:read` khi deploy. Token đọc được truyền qua phiên SSH đã xác minh host key, gửi vào Docker login qua stdin và lưu trong thư mục Docker config tạm riêng của lần triển khai. Thư mục tạm được dọn khi script kết thúc.

Server không cần lưu personal access token để chạy pipeline này. GHCR package cần cho phép repository hiện tại truy cập bằng Actions. Nếu package đã tồn tại từ trước, kiểm tra Manage Actions access trong phần cài đặt package.

## 3. Tạo SSH key riêng cho triển khai

Trên máy quản trị, tạo key và đặt tên riêng. Dùng đường dẫn chưa tồn tại.

```bash
ssh-keygen -t ed25519 -f ./maritime_cicd -C maritime-cicd
```

Để passphrase trống vì workflow chạy tự động. Thêm nội dung `maritime_cicd.pub` vào `~/.ssh/authorized_keys` của user deploy trên server tương ứng. Có thể tạo một key riêng cho mỗi server.

User deploy cần đọc/ghi thư mục gói production và quyền chạy Docker không cần hỏi mật khẩu tương tác. Với cấu hình hiện tại dùng `/root/production`, user deploy là `root`. Nếu chuyển sang user chuyên dụng, chuyển quyền thư mục và quyền Docker tương ứng trước khi bật deploy.

Lấy host key qua kết nối SSH đã xác minh, hoặc dùng `ssh-keyscan` và đối chiếu fingerprint với server qua console của nhà cung cấp trước khi lưu vào GitHub.

```bash
ssh-keyscan -p 22 IP_SERVER
```

## 4. Thiết lập GitHub

Trong repository → Settings → Environments, tạo hai environment.

- `shore-production`
- `edge-production`

Đặt Deployment branches của mỗi environment chỉ cho phép `production`. Có thể cấu hình người duyệt triển khai nếu muốn kiểm soát từng lần phát hành.

Trong từng environment, thêm các Secrets cùng tên nhưng giá trị riêng cho mỗi server.

| Secret | Nội dung |
| --- | --- |
| `SSH_HOST` | IP công khai hoặc hostname SSH của server đó |
| `SSH_USER` | User SSH, hiện tại có thể dùng `root` |
| `SSH_PORT` | Cổng SSH, mặc định `22` |
| `SSH_PRIVATE_KEY` | Toàn bộ private key CI/CD vừa tạo |
| `SSH_KNOWN_HOSTS` | Host key đúng của server, đủ dòng định dạng known_hosts |

Trong từng environment, thêm Variables.

| Variable | Shore | Edge |
| --- | --- | --- |
| `DEPLOY_PATH` | `/root/production` | Thư mục Edge thực tế, ví dụ `/root/production-edge` |
| `DEPLOY_COMPOSE_FILES` | `docker-compose.yml` | `docker-compose.yml,docker-compose.ssl.yml` nếu dùng file SSL riêng |
| `DEPLOY_PROJECT_NAME` | Tên project đang chạy lấy từ `docker compose ls` | Tên project Edge đang chạy |

`DEPLOY_COMPOSE_FILES` phân cách bằng dấu phẩy, đúng thứ tự các file Compose hiện có. Nếu Edge đã tích hợp SSL trực tiếp vào file chính, chỉ điền `docker-compose.yml`.

Trong Settings → Secrets and variables → Actions → Variables ở cấp repository, tạo `CI_DEPLOY_ENABLED` với giá trị `false` khi chuẩn bị. Đổi sang `true` sau khi hai environment, SSH và GHCR đã hoàn tất. Biến này phải đặt ở cấp repository vì điều kiện chọn job được đánh giá trước khi vào environment.

Đảm bảo repository cho phép Actions và cấp quyền ghi GHCR cho `GITHUB_TOKEN` theo chính sách tổ chức. Trong GHCR package, kiểm tra repository có Actions access nếu package đã tồn tại từ trước.

## 5. Đưa cấu hình vào sử dụng

1. Push nhánh `codex/setup-cicd`, kiểm tra cả hai workflow trên GitHub Actions.
2. Xem kết quả backend tests và frontend build. Backend integration tests cần PostgreSQL của job, đã được khai báo trong workflow.
3. Hoàn tất thiết lập ở server và GitHub.
4. Merge cấu hình và phiên bản cần phát hành vào `production`. Lần thay đổi workflow này sẽ build cả bốn image.
5. Khi bật `CI_DEPLOY_ENABLED=true`, push tiếp theo lên `production` sẽ deploy các phần bị thay đổi sau khi kiểm tra đạt.
6. Nếu muốn triển khai chính lần push cấu hình ban đầu sau khi bật biến, dùng Re-run all jobs của workflow push `production` đó. Tag image vẫn theo commit của run.

Khi deploy, `.cicd/images.json` trong thư mục server ghi image đang sử dụng. Script giữ đúng Compose project hiện có, chạy `up --no-deps --no-build` cho backend/frontend được chọn, kiểm tra readiness và Nginx. Khi chỉ đổi backend, Nginx được reload để phân giải địa chỉ container backend mới.

Build/test diễn ra trên GitHub trong khi phiên bản đang chạy vẫn phục vụ. Thay một container ứng dụng có thể gián đoạn ngắn. Không có cấu hình blue-green trong bước này.

## 6. Vận hành sau lần deploy đầu

Các lệnh quản lý thủ công trên server cần thêm `.cicd/images.json` sau các file Compose đang dùng để giữ đúng image CI/CD.

Shore.

```bash
cd /root/production
docker compose -f docker-compose.yml -f .cicd/images.json ps
docker compose -f docker-compose.yml -f .cicd/images.json logs --tail=100 backend frontend
```

Edge có SSL riêng.

```bash
cd /root/production-edge
docker compose -f docker-compose.yml -f docker-compose.ssl.yml -f .cicd/images.json ps
```

Thêm `-p TEN_PROJECT` nếu đang dùng project name riêng. Dùng đúng project đã khai báo trong GitHub. Giữ các image cũ trong Docker để phục vụ rollback.

## 7. Khi triển khai lỗi

Nếu pull image lỗi, script dừng trước khi thay container. Nếu thay container hoặc kiểm tra readiness lỗi, script phục hồi image trước của các service vừa cập nhật và báo workflow thất bại. `.cicd/rollback.json` lưu các image có thể dùng để phục hồi. `.cicd/release.json` ghi commit deploy thành công gần nhất.

Rollback này phục hồi image ứng dụng. Các migration đã chạy hoặc dữ liệu đã ghi vào database cần được đánh giá riêng. Với migration đổi/xóa cấu trúc dữ liệu hoặc thay giao thức đồng bộ, cần sao lưu và kế hoạch tương thích trước khi merge. Nếu appsettings cần thêm giá trị cho phiên bản mới, cập nhật cấu hình server trước khi phát hành.

Chạy lại workflow thất bại sau khi xử lý nguyên nhân, hoặc tạo commit sửa đúng thành phần. Một push chỉ đổi frontend không tự chạy lại backend của một release trước bị lỗi. Server bỏ qua run cũ hơn số run đã deploy thành công để tránh ghi đè phiên bản mới.

## Phạm vi triển khai

Các thay đổi Compose, chứng chỉ, `.env`, database và cấu hình provisioning cần được quản lý riêng trên server. Pipeline này triển khai image backend/frontend vào gói đang hoạt động. File Compose trên GitHub không tự thay thế gói production hiện có.

Kiểm thử tại máy phát triển.

```bash
python3 scripts/cicd/test_cicd.py
bash -n scripts/cicd/ssh-deploy.sh
```

Tài liệu tham khảo.

- https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- https://docs.docker.com/reference/cli/docker/compose/up/
