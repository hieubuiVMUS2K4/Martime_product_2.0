# Bổ sung chứng chỉ cho thuyền viên HP PIONEER VMU

Tab “Chứng chỉ tàu” hiện đọc chứng chỉ của thuyền viên được gán cho tàu, không phải
giấy chứng nhận đăng kiểm của bản thân tàu. Công cụ này bổ sung hồ sơ cho 19 người
đang ở trên tàu IMO 9278367, không sửa hồ sơ đã có.

Sử dụng danh mục hiện có: BST, SA, MEDICAL và nhóm chuyên môn theo chức danh;
bổ sung ánh xạ rank_certificates nếu hệ thống đã cấu hình. Nhóm theo chức danh là
bộ dữ liệu thực hành, không thay thế việc đánh giá yêu cầu chứng chỉ thực tế.
Số hồ sơ bắt đầu TH-9278367; ghi chú và nơi cấp nêu rõ hồ sơ thực hành, chưa xác minh
với bản gốc. Không sinh ảnh, bản scan, chữ ký, con dấu hay tài liệu chứng nhận.

```powershell
dotnet publish scripts/tools/SeedCrewCertificates/SeedCrewCertificates.csproj -c Release -o artifacts/crew-certificates-runtime
node scripts/db/seed-crew-certificates-remote.mjs
node scripts/db/seed-crew-certificates-remote.mjs --apply
```

Runner sao lưu Shore trước khi ghi. Tính toán chạy local qua SSH tunnel; cấu hình
database chỉ nằm trong bộ nhớ. Dùng CertificateService và SyncOutboxService hiện có
để gửi hồ sơ xuống đúng tàu. Toàn bộ đợt ghi nằm trong một transaction có khóa.
Chạy lại bỏ qua cặp thuyền viên–loại chứng chỉ đã tồn tại.
