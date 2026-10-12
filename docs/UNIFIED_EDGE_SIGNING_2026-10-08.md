# Thống nhất luồng ký trên Edge — 08/10/2026

Đã mở rộng dịch vụ ký chung sang các điểm ký còn dùng chuỗi tên từ client. Phạm vi hiện tại gồm SMS, permit, duyệt PMS, phiếu nhập và 23 loại hồ sơ bổ sung trong `SigningRecords`.

## Các luồng đã thống nhất

| Nhóm | Luồng được bảo vệ |
|---|---|
| Nhật ký | Hành trình, boong, máy, dầu, trực ca, rác, rác phần I/II, ballast |
| Nhật ký vắn tắt | Xác nhận người phụ trách boong và máy trên bản nội dung đã lưu |
| Báo cáo | Phê duyệt báo cáo và amendment; xác nhận Máy trưởng trên bunker; ký báo cáo tuần/tháng |
| Biểu mẫu PMS | Người thực hiện, người giám sát và người duyệt đánh giá rủi ro; người vận hành và người duyệt biên bản kiểm tra |
| HSQE | Phê duyệt/ban hành tài liệu; xác nhận nhật ký diễn tập |

Mỗi thao tác dùng tài khoản đang đăng nhập, thuyền viên đang onboard, chức danh hoạt động và quyền được cấu hình; nhập lại mật khẩu và xem snapshot đã lưu trước khi xác nhận. ADMIN kỹ thuật không tự trở thành Thuyền trưởng/Máy trưởng. Tên/chức danh và thời gian được xác định ở server; không nhận tên tự nhập hoặc thời gian ký từ client làm bằng chứng.

Các endpoint ký cũ được giữ để tương thích đường dẫn, nhưng đi qua cùng `ApprovalActionFilter`. Gọi chúng trực tiếp vẫn phải có quyền, mật khẩu, version, hash và UUID chống trùng. Nội dung, action, revision và sync queue cùng transaction. Chữ ký mới được gửi lên Shore bằng kho bằng chứng đã triển khai trước; Shore không cần thêm bảng nghiệp vụ cho từng loại nhật ký.

Nội dung đã ký bị khóa sửa/xóa. Với nhật ký, nhật ký vắn tắt, biểu mẫu PMS và báo cáo tuần/tháng, chọn **Tạo sửa đổi có lý do**, lưu lại nội dung, rồi ký lại. Sửa nội dung có nhiều vị trí xác nhận sẽ xóa các xác nhận hiện hành cần làm lại và giữ nguyên lịch sử. Báo cáo thông thường tiếp tục dùng luồng amendment riêng. Bunker đã có xác nhận Máy trưởng không được sửa nội dung trực tiếp.

Không tạo tên “Captain”, chuỗi “Master Signature” hay mã SIG giả để đại diện người ký mới. Chữ ký và bản ghi cũ được giữ nguyên, lịch sử chỉ rõ chưa xác thực bằng tài khoản; không tự thay người ký lịch sử. Các dấu ký mô phỏng trong xuất hồ sơ sự cố đã được bỏ. Ghi nhận thành viên tham gia trong mẫu SMS là dữ liệu khai báo, không trình bày thành xác thực tài khoản.

## Quyền và sử dụng

Giữ quyền approve hiện có cho nhật ký (`logbooks.<loại>.approve`), báo cáo (`reporting.approve`), tài liệu (`hsqe.approve`) và diễn tập (`drills.approve`). Bổ sung `logbooks.abstract.approve`; cần giao quyền này rõ ràng trong cấu hình chức danh, không tự cấp theo quyền update. Biểu mẫu PMS dùng `pms.work.execute` cho người thực hiện/vận hành, `pms.work.approve` cho giám sát/người duyệt. Danh tính được lấy từ User → Crew → Rank; kiểm tra liên kết tài khoản nếu tên/chức danh hiển thị chưa đúng.

Lưu nội dung trước khi ký. Xác nhận áp dụng cho snapshot đã lưu ở server; hộp thoại cho xem lại nội dung sẽ xác nhận. Sau ký có lịch sử và chức năng in/lưu PDF snapshot; file gốc được đóng băng theo hash và đồng bộ như các module khác.

## Kiểm chứng và triển khai

- Edge: 190/190 kiểm thử đạt, gồm 9 loại nhật ký kiểm tra bỏ tên giả từ client, lưu đúng Actual Officer/Second Officer, lưu phương thức tái xác thực và khóa sửa sau ký.
- Frontend: 37/37 kiểm thử đạt; các đường ký nhật ký, báo cáo, amendment, tài liệu, diễn tập và xác nhận riêng trong PMS đều được nhận diện để mở hộp xác nhận chung.
- Shore: giữ bản kho bằng chứng đã đạt 50/50 kiểm thử ở lần triển khai trước; mô hình dữ liệu sync không thay đổi trong đợt mở rộng này.
- Không có migration schema mới. Không dùng hồ sơ vận hành để ký thử.
- Backup trước cập nhật: `artifacts/approval-20261008/edge-before-unified-signing.dump`, `edge-backend-before-unified.tar`, `edge-frontend-before-unified.tar`. Hai tar là filesystem container, không phải image có đầy đủ Docker config; giữ Compose/runtime config khi phục hồi. Backup uploads và image trước đợt nền tảng vẫn giữ nguyên.

Trạng thái Docker/readiness được ghi sau khi triển khai xong ở phần cuối tài liệu này. Hỗ trợ xác nhận điện tử trong ứng dụng không tự thay thế việc nghiệm thu nghiệp vụ hay điều kiện sử dụng nhật ký điện tử làm sổ pháp định.

## Kết quả chạy Docker

Đã build và recreate Edge backend/frontend từ source mới ngày 08/10/2026. Container đang dùng đúng image vừa build. Frontend http://localhost:3002 trả HTTP 200; Edge readiness healthy, database healthy và pending migrations = 0. Shore readiness tiếp tục Healthy. API context/history của nhật ký yêu cầu đăng nhập (401 khi không có phiên). Không tạo bằng chứng ký thử trong database vận hành; vẫn giữ 2 crew hiện có. PostgreSQL dùng cho kiểm thử đã được dừng.

Sau sửa cuối phần giữ dữ liệu xác nhận legacy trong snapshot, nhóm Approval/WorkApproval được chạy lại: 18/18 đạt; bộ Edge đầy đủ trước đó 190/190 và frontend cuối 37/37 đạt.
