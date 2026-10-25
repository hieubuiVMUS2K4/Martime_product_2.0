# PMS rework — tiến độ triển khai

Nhánh: `hiu67-rework`. Thiết kế nguồn: [kế hoạch Job List / Work Order](PMS_JOB_LIST_WORK_ORDER_SEPARATION_PLAN_2026-10-25.md).

## Đã triển khai nền tảng

- Bổ sung metadata protocol 2 cho Job và WO ở cả Edge/Shore, migration và model snapshot tương ứng. Các trường mới nullable; dữ liệu legacy không tự chuyển protocol, không tự bật sinh WO.
- Job có phiên bản, trạng thái, mốc ban đầu, người/chức danh/bộ phận chịu trách nhiệm và cảnh báo giờ riêng. WO có khóa kỳ độc lập phiên bản Job, snapshot cấu hình, hạn ngày/giờ nullable riêng, tình trạng hạn và số lượt báo cáo.
- Khóa unique kỳ ở PostgreSQL ngăn tạo hai WO cho cùng Job/kỳ. Shore giữ phạm vi tàu. WO đã hủy hoặc xóa mềm vẫn giữ khóa kỳ, không được sinh lại để né trùng.
- `PmsJobRules` xử lý thiếu mốc, Lưu không tạo lịch sử giả, không tự tiếp tục Job tạm dừng; lịch tháng/năm, HYBRID, múi giờ tàu và cảnh báo đúng đơn vị. Duyệt tính kỳ sau từ lượt gửi hoàn tất/giờ chạy được duyệt, không sửa WO cũ.
- `PmsWorkOrderReleaseService` phát hành định kỳ trong giao dịch và khóa writer chung: đọc lại dữ liệu sau khóa, chống lặp, tối đa một WO mở, snapshot và checklist riêng, kiểm tra người thực hiện mặc định còn onboard. Không tự chọn ngẫu nhiên người cùng chức danh. Snapshot không lấy vật tư gán riêng từ form Job.
- Chặn các đường reset/consolidate/recovery legacy tác động lên protocol mới.
- Migration Down chặn nếu đã có bản ghi protocol mới; không xóa khóa kỳ/snapshot của dữ liệu đã vận hành để rollback phần mềm.

## Ranh giới hiện tại

Đã bổ sung API quản lý Job, đọc WO và workflow phát hành định kỳ thủ công/phân công/thực hiện/gửi/duyệt/trả lại/hủy, có DI và kiểm tra quyền, nhưng **tắt mặc định** qua `Pms:ReworkApiEnabled`. Service phát hành mới chưa nối vào worker. Luồng cũ tiếp tục chạy cho dữ liệu legacy trong khi hoàn thiện phần còn lại. Không có cutover, không chạy migration trên database thật và chưa thay giao diện.

`NextDueAt` legacy vẫn là cột không-null; service mới dùng `WorkOrderDueAt`/`WorkOrderDueHours` làm nguồn đúng. Với WO chỉ theo giờ, giá trị tương thích ở cột cũ không được dùng cho tính hạn, Lịch/Gantt hoặc xuất cho client legacy. Trước cutover phải hoàn thiện capability/API/client mới và chặn đường đọc cũ diễn giải ngày tương thích thành hạn thật.

## Đã triển khai tiếp — API Job và đọc WO

- CRUD Job, mốc trong form, kiểm soát phiên bản, trạng thái, xóa mềm/khôi phục và audit; không thêm bước Kích hoạt hoặc gán vật tư ở Job.
- Import JSON từ Excel: preview chỉ đọc, nhập lô nguyên tử, không ghi đè mã trùng/xóa mềm, không nhận baseline/ngày lần làm cuối/hạn tới/AutoGenerate và không tạo WO hay lịch sử giả.
- Danh sách Job/WO phân trang và lọc/sắp xếp trước phân trang ở DB; Job list không tải toàn bộ snapshot/checklist.
- Chi tiết Job/WO dùng snapshot repeatable-read, tránh ghép metadata và kết quả từ các phiên bản cập nhật đồng thời.
- Lịch sử/báo cáo legacy thuộc đúng Job, giữ nhãn thời điểm nguồn, không lấy trạng thái/kết quả task hiện tại dựng lại báo cáo cũ. Danh sách đã hợp nhất report mới đã duyệt bằng SQL; UI hợp nhất chưa làm.
- Module/quyền `pms.jobs`, binding từng endpoint và alias tương đương `pms.config` ở backend; quyền xem Job không mở WO đang làm hoặc cấp quyền ghi. Selector chỉ trả các trường cần thiết, không mở API hồ sơ thuyền viên đầy đủ. Chưa chuyển quyền lưu sẵn hoặc thay màn phân quyền hiện tại.
- Đường ghi cấu hình legacy chặn Job protocol mới; thao tác sửa ngày legacy bỏ qua protocol mới. Writer legacy và API mới chia sẻ khóa khi có thể đụng mã Job; import legacy tương thích với transaction bên ngoài.
- WO mở tính tình trạng hạn từ counter/ngày thực theo múi giờ tàu, dùng cửa sổ cảnh báo riêng đã chụp khi phát hành. Bổ sung migration độc lập `20261025170000_FreezeWorkOrderWarningWindows` cho Edge/Shore, không sửa migration nền tảng đã giao.
- Hợp đồng endpoint, query, lỗi và điều kiện bật kiểm thử: [PMS_REWORK_API_2026-10-25.md](PMS_REWORK_API_2026-10-25.md).

## Đã triển khai tiếp — workflow WO và báo cáo từng lượt

- Phát hành thủ công Job định kỳ, phân công PIC/hỗ trợ, bàn giao có lý do, bắt đầu/làm lại, lưu kết quả, gửi duyệt, duyệt/trả lại và hủy. Phát hành kiểm tra cả phiên bản Job và khóa kỳ, tránh retry kỳ cũ lại sinh WO kỳ mới sau duyệt. Mỗi ghi kiểm tra phiên bản WO và quyền hiện tại; người thực hiện phải được giao/hỗ trợ, còn onboard và có chức danh hoạt động.
- Bổ sung migration riêng `20261025180000_AddPmsWorkOrderWorkflow` cho Edge/Shore: workflow version, người hỗ trợ/đóng góp, bảng report và posting kho. Báo cáo có Job nullable để WO đột xuất không cần kế hoạch giả. Chưa có API tạo nháp/phát hành WO đột xuất.
- Mỗi lượt gửi có snapshot/hash riêng: checklist/số đo, counter, thời gian, vật tư gồm mã/tên/đơn vị/số lượng và người đã đóng góp. Tên vật tư đổi sau khi gửi không đổi báo cáo cũ. Context chặn sửa/xóa snapshot đã gửi và posting đã ghi.
- Duyệt/trả lại dùng luồng xác thực tài khoản và bằng chứng ký hiện có. Người có quyền duyệt không cần được giao WO; admin kỹ thuật không bị buộc liên kết crew để duyệt. Người đã thực hiện bất kỳ lượt nào không tự duyệt/trả lại, kể cả sau bàn giao.
- Lưu/gửi không trừ kho. Duyệt hạch toán tồn theo vị trí đúng một lần/WO/vật tư, hoàn thành WO, cập nhật Job/counter và ghi report/quyết định/bằng chứng/outbox trong một giao dịch. Thiếu kho rollback toàn bộ; không dùng cache vật tư làm tồn kho thay thế.
- Kỳ sau tính từ lượt gửi cuối được duyệt/counter được báo cáo, không theo ngày duyệt hoặc counter tăng sau đó. WO cũ vẫn Hoàn thành. Thiết bị trở lại trạng thái trước bảo trì chỉ khi không còn WO khác đang làm/chờ duyệt/cần làm lại.
- Lịch sử Job hợp nhất legacy và report mới đã duyệt, lọc/phân trang ở DB. Lượt bị trả lại giữ trong revision/timeline WO, không tính thành lần bảo trì hoàn tất. API đọc báo cáo hoàn tất theo quyền Job không mở bản đang chờ duyệt.
- Chặn API workflow/checklist/realtime/gia hạn legacy sửa WO mới, kể cả admin. Workflow mới không gọi ảnh, ĐGRR hoặc BBKT.

## Các phần tiếp theo chưa hoàn tất

1. Chuyển quyền cũ có đối chiếu, quyền/tác vụ quản lý WO nháp và phát hành; chưa bật API mới vận hành.
2. API tạo/sửa/xóa nháp/phát hành WO đột xuất; workflow và schema báo cáo Job nullable đã có nhưng chưa đủ quy trình tạo lệnh đột xuất.
3. Sự kiện lên đà/theo yêu cầu/theo chuyến, worker phát hành protocol mới và thông báo bền vững. Phân công hỗ trợ/hủy/trạng thái Job đã có API.
4. Bảng Job List, tab WO, form mốc trong Job, màn Chi tiết/Thực hiện/Duyệt/Lịch sử và Lịch/Gantt/Counter theo wireframe; bỏ cửa vào và request ĐGRR/BBKT mới.
5. Protocol/capability và fencing gói cũ trong đồng bộ tàu–bờ/mobile; mirror snapshot/revision, remap chức danh/người chịu trách nhiệm theo danh tính nguồn và test mất ACK/thứ tự lệch/tàu khác.
6. Dry-run chuyển dữ liệu/Job nhóm/queue trên bản sao; pilot sau khi toàn bộ điều kiện nghiệm thu đạt. Chưa bật worker phát hành mới trước các bước này.

## Kiểm chứng

Đã có test quy tắc nghiệp vụ, khóa chống tạo lặp trên PostgreSQL thật, khóa kỳ đã hủy, snapshot không đổi sau sửa Job, WO khác ID ở kỳ sau, worker legacy không reset báo cáo mới, migration Up/Down giữ dữ liệu legacy và mirror/schema Shore.

- Toàn bộ backend Edge: **253 đạt, 0 lỗi, 0 bỏ qua**, PostgreSQL riêng; có kiểm tra chặn Down sau khi đã phát sinh dữ liệu protocol mới.
- Hai test nền tảng Shore: **2 đạt, 0 lỗi, 0 bỏ qua**, kiểm tra mirror giữ metadata và migration dùng đúng cột/phạm vi tàu.
- Build Edge/Shore đạt. Cảnh báo EF1002 tại EdgeVesselSwitchService và xUnit2031 của test lịch sử đã tồn tại từ trước.
- Artifact cục bộ: `artifacts/test-results/pms-rework-foundation-2026-10-25/`; không đưa Git. Chưa chạy kiểm thử UI vì bước này chưa đổi frontend; chưa coi hai test mirror là kiểm chứng đồng bộ end-to-end của rework.

Sau bước API:

- Toàn bộ backend Edge: **274 đạt, 0 lỗi, 0 bỏ qua** trên database PostgreSQL kiểm thử mới.
- Shore: **2 đạt, 0 lỗi, 0 bỏ qua** cho mirror/schema, đã bao gồm metadata cửa sổ cảnh báo WO.
- Bao gồm kiểm tra API/phân quyền, import preview không ghi DB/outbox, nhập nguyên tử, mã trùng/xóa mềm/khôi phục, snapshot/checklist WO không bị sửa theo Job, đọc chi tiết nhất quán khi ghi đồng thời, SQL lọc hạn theo UTC và qua chuyển đổi DST, migration nền tảng + migration bổ sung Up/Down.
- Đã sửa lỗi kiểu tham số ngày UTC khi truy vấn PostgreSQL `AT TIME ZONE`; bản xác minh cuối là `artifacts/test-results/pms-rework-api-2026-10-25/pms-rework-api-verified.trx`. Các artifact lượt chạy trước được giữ để đối chiếu, không đưa Git.
- Chưa chạy kiểm thử frontend vì chưa đổi mã frontend; chưa coi API đọc/CRUD này là workflow hoặc đồng bộ rework end-to-end đã hoàn tất.

Sau bước workflow:

- Toàn bộ backend Edge: **280 đạt, 0 lỗi, 0 bỏ qua**, gồm workflow mới và hồi quy legacy, xác minh bằng `artifacts/test-results/pms-workflow/edge-workflow-verified.trx`.
- Shore: **3 đạt, 0 lỗi, 0 bỏ qua** cho mirror/model/migration, artifact `artifacts/test-results/pms-workflow/shore-workflow.trx`.
- Kiểm thử vòng thực hiện → gửi → trả lại → gửi revision mới → duyệt bằng xác thực tài khoản thật trong test; snapshot cũ không đổi, chưa duyệt không trừ kho, duyệt lặp/concurrent chỉ ghi một quyết định/posting, thiếu kho rollback cả bằng chứng ký và kỳ Job.
- Kiểm thử người ngoài phân công không thực hiện, người thực hiện không tự duyệt, chặn ghi đè báo cáo đang chờ và API legacy/gia hạn; schema hỗ trợ WO không Job, checklist trống và giữ trạng thái thiết bị khi còn WO khác.
- Kiểm thử report giữ tên vật tư khi danh mục đổi, counter tăng sau gửi không làm sai kỳ sau, retry phát hành kỳ cũ không sinh WO kỳ mới, migration không cho Down xóa report đã có dữ liệu.
- Đã thống nhất độ chính xác thời gian JSON/metadata với microsecond PostgreSQL để báo cáo và mốc tính kỳ sau dùng cùng thời điểm.
- Chưa kiểm thử UI, mobile hoặc đồng bộ rework end-to-end. Đây là kết quả backend, không phải xác nhận đã chuyển xong hệ thống sang thiết kế mới.

PostgreSQL kiểm thử dùng container tạm tại `127.0.0.1:55439`; database có tiền tố `codex_pms_tests_`, tách hoàn toàn dữ liệu vận hành. Container được dừng/xóa sau kiểm thử. Không đưa thông tin đăng nhập vận hành hoặc artifact TRX vào Git.
