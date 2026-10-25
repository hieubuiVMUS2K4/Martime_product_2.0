# Triển khai ký xác nhận Edge — 08/10/2026

Đã triển khai nền tảng và các luồng đợt đầu của [kế hoạch](plans/EDGE_SIGN_APPROVAL_PLAN_2026-10-07.md): SMS, giấy phép HSQE, duyệt PMS, phiếu nhập và kho bằng chứng đọc trên Shore. Ngày 08/10/2026 đã mở rộng xác thực sang nhật ký và các điểm ký còn lại theo [báo cáo thống nhất luồng ký](UNIFIED_EDGE_SIGNING_2026-10-08.md); chưa tự thay sổ giấy. Tái xác thực bằng mật khẩu là xác nhận trong ứng dụng, không phải PKI hoặc hai yếu tố độc lập.

## Quyết định nghiệp vụ đơn giản

Hướng dẫn [MCA về không gian kín](https://www.gov.uk/guidance/enclosed-spaces-on-sea-going-vessels) quy định người có trách nhiệm theo quy trình tàu; [MCA MGN 659 Amendment 3](https://www.gov.uk/government/publications/mgn-659-mf-amendment-3-entry-into-enclosed-spaces/mgn-659-mf-amendment-3-the-merchant-shipping-and-fishing-vessels-entry-into-enclosed-spaces-regulations-2022) và [safe working practices](https://www.gov.uk/health-and-safety-on-ships/safe-working-practices) là nguồn đối chiếu. Không suy ra mọi loại giấy phép đều bắt buộc Đại phó rồi Thuyền trưởng. Dự án dùng hai quyền riêng cho người kiểm tra và người cấp, gán theo chức danh và SMS công ty; không xây bộ thiết kế workflow nhiều cấp.

- SMS: Draft → Submitted → Approved; trả lại để sửa/gửi lại; amendment giữ phiên bản cũ. Người gửi không tự duyệt.
- Permit: Draft → PendingCheck → PendingIssue → Issued → Closed; hỗ trợ Returned/Suspended và sửa đổi để kiểm tra/cấp lại. Người cấp khác người gửi và người kiểm tra. Chỉ Issued trong khoảng StartTime/DurationHours mới có hiệu lực.
- PMS: giữ workflow/vật tư/chu kỳ; duyệt bằng tài khoản thật, liên kết action/revision vào MaintenanceHistory.ReportSnapshot từng lần thực hiện. ADMIN duyệt với danh tính quản trị của mình; duyệt lô tạm bị chặn.
- Nhập kho: Submit → Approve → Complete; approve không cộng kho, complete là thao tác có quyền riêng và chống lặp.

## Cấu hình trước khi ký nghiệp vụ

Gắn User với Crew đang onboard và Rank đang hoạt động. Trong màn hình quyền chức danh, cấp rõ `hsqe.records.sign/approve/reject` và `hsqe.permits.check/issue/close/suspend/reject`. Quyền HSQE cũ không tự biến thành quyền cấp phép; ADMIN kỹ thuật không tự đóng vai sĩ quan. PMS/receipt dùng quyền hiện có.

Hot/Enclosed bị khóa cấp khi thiếu cấu hình `Approval:PermitGasPolicy`. Công ty cung cấp đầy đủ `Enabled`, `Version`, `MaxAgeMinutes`, `MinO2`, `MaxO2`, `MaxLEL`, `MaxCO`, `MaxH2S`; không có ngưỡng demo được coi là chuẩn. Giá trị đo phải mới, có người đo và thiết bị; checklist và risk assessment phải đủ. Tiêu chí được đóng băng trong snapshot; đổi cấu hình cần sửa đổi và kiểm tra lại.

Có thể cấu hình bằng appsettings hoặc file Compose override cho backend với các biến `Approval__PermitGasPolicy__Enabled`, `Approval__PermitGasPolicy__Version`, `Approval__PermitGasPolicy__MaxAgeMinutes`, `Approval__PermitGasPolicy__MinO2`, `Approval__PermitGasPolicy__MaxO2`, `Approval__PermitGasPolicy__MaxLEL`, `Approval__PermitGasPolicy__MaxCO`, `Approval__PermitGasPolicy__MaxH2S`, rồi recreate backend. Không điền ngưỡng bằng phỏng đoán. Luồng SMS/permit được khóa theo quyền mới; chưa cấp quyền tự động cho tài khoản vận hành.

## Dữ liệu và API

Ba bảng `approval_documents`, `approval_revisions`, `approval_actions`: identity người ký lấy từ server, UTC, chức danh/quyền tại thời điểm ký, phương thức xác thực, policy version, lý do và SHA-256. Revision/action bất biến; document dùng version chống xung đột. Snapshot gồm nội dung, mẫu/quy trình, risk/checklist, định danh tàu và file gốc đóng băng theo hash.

Edge: `GET /api/approvals/{module}/{key}/context?action=...`, `GET .../history`, `POST .../{action}`; module `sms`, `permit`, `pms`, `receipt`. Các endpoint nghiệp vụ cũ còn dùng đều qua filter chung. Proof headers: `X-Approval-Password`, `X-Approval-Version`, `X-Approval-Hash`, `X-Approval-Idempotency-Key` (UUID), `X-Approval-Reason` (URI encoded). Password chỉ dùng để xác thực, không lưu bằng chứng/queue. Sai mật khẩu 5 lần trong 5 phút bị giới hạn theo tài khoản/IP. Quyết định, tác động kho/chu kỳ, bằng chứng và queue cùng transaction; retry cùng key/payload trả kết quả đã lưu, payload khác hoặc version cũ trả 409.

Shore mirror nguyên snapshot/actions, kiểm tra origin, dependency, hash và file; không dùng merge nghiệp vụ để thay bằng chứng. ACK bằng chứng chỉ được chấp nhận khi `approvalEvidenceVersion >= 1`. Shore cũ giữ queue tại Edge. Trang `/approval-evidence` chỉ đọc, hiển thị file đang chờ/đã nhận. File bằng chứng không được phục vụ public qua static uploads; API tải có xác thực và kiểm tra hash. Mất Internet vẫn ký tại Edge được; mất kết nối trình duyệt tới Edge chưa thể ký.

Lịch sử Edge cho in/lưu PDF từ snapshot bất biến kèm actions và hash. Bản in nghiệp vụ có nhãn xác nhận/legacy rõ ràng. Hồ sơ cũ giữ nguyên, không được migration xác thực hồi tố. Permit Active cũ không có hiệu lực trong cơ chế mới; SMS Submitted cũ cần sửa đổi và ký gửi lại.

## Kiểm chứng và vận hành

Kiểm thử dùng PostgreSQL riêng, không ký trên hồ sơ vận hành. Bộ hồi quy cuối: Edge 181/181, Shore 50/50, frontend auth 36/36 đạt. Bao gồm migration giữ hồ sơ legacy, giao dịch/rollback, retry, quyền và vòng đời permit; không coi đây là pilot của người vận hành. Docker build backend/frontend cả hai hệ thống thành công. Đã recreate Edge backend/frontend và Shore backend/frontend. Kiểm tra ngày 08/10/2026: Edge/Shore frontend HTTP 200; Edge readiness healthy, pending migrations = 0; Shore readiness Healthy. Cả hai migration ApprovalEvidence đã áp dụng; các bảng bằng chứng vận hành còn rỗng, không ký thử vào hồ sơ thật; Edge giữ nguyên 2 crew trước/sau triển khai. API bằng chứng không đăng nhập trả 401, prefix file bằng chứng public trả 404. Container PostgreSQL kiểm thử đã dừng, giữ dữ liệu kiểm thử. Log tại `artifacts/approval-20261008/` (không đưa Git).

Migration additive: Edge `20261008044940_ApprovalEvidence`, Shore `20261008045256_ApprovalEvidence`. Giữ database, uploads và queue. Trước triển khai đã lưu `edge-before.dump`, `shore-before.dump`, `edge-uploads-before.tar.gz`, `shore-uploads-before.tar.gz`; image cũ gắn tag `before-approval-20261008`.

Edge: http://localhost:3002. Shore: http://localhost:3000. Shore readiness: http://localhost:5000/health/ready. Edge readiness qua frontend: http://localhost:3002/api/health/ready.

Nếu có sự cố, dừng thao tác ký tại module ảnh hưởng, giữ bằng chứng và sync queue. Không drop bảng hoặc restore backup để xóa quyết định; không chạy lại bản PIN demo để tiếp tục ký. Image cũ chỉ phục vụ phục hồi có kiểm soát, cần giữ chặn luồng PIN và đối soát mọi action sau backup.

## Phần cần nghiệm thu với người vận hành

Công ty cần xác nhận ma trận chức danh và tiêu chí khí đo, thử pilot với người có trách nhiệm trên tàu và xem bản PDF. Chưa có xác nhận pilot từ người dùng thật. Còn đánh giá điều kiện dùng nhật ký điện tử thay sổ pháp định, công cụ workflow theo từng mẫu, feature flags bật/tắt độc lập từng module, cảnh báo chênh lệch đồng hồ Edge/Shore và báo cáo backfill tổng hợp legacy; lịch sử hiện phân loại legacy trực tiếp. Các phần này cần hoàn thiện ở giai đoạn vận hành tiếp theo; không được coi bản triển khai hiện tại là nghiệm thu toàn bộ yêu cầu pháp định.
