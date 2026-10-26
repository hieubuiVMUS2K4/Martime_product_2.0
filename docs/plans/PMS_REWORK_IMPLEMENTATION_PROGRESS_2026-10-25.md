# PMS rework — tiến độ triển khai

Nhánh: `hiu67-rework`. Thiết kế nguồn: [kế hoạch Job List / Work Order](PMS_JOB_LIST_WORK_ORDER_SEPARATION_PLAN_2026-10-25.md).

Phạm vi chốt lại ngày 26/10/2026: **bỏ mobile khỏi đợt này**; nghiệm thu web–Edge–Shore. API mobile legacy trả 410 sau cutover; không mở lại API cũ hoặc tự chuyển lệnh offline cũ sang bộ dữ liệu mới.

**Điều chỉnh vận hành offline:** việc tạo WO định kỳ là nghiệp vụ local trên tàu, không được yêu cầu mở Shore hoặc xác nhận đồng bộ trước. Worker/settings chỉ xét cờ cấu hình, profile local và dataset ACTIVE; không xét `pms-peer-ready` hoặc stream đồng bộ. Job vẫn phải bật tự động, đủ mốc và tới khoảng phát hành theo chính sách. WO được lưu cùng outbox, chờ gửi khi có mạng; bộ gửi tiếp tục bắt buộc thương lượng đúng protocol/dataset/stream và biên nhận, không nới điều kiện ACK. Các mô tả ràng buộc worker với peer ở những mốc triển khai cũ bên dưới đã được thay bằng quy tắc này.

Xác minh sửa offline: **35 test worker/API/capability đạt, 0 lỗi, 0 bỏ qua**, `artifacts/test-results/pms-offline-2026-10-26/edge-offline-release.trx`; TypeScript đạt. Kiểm tra counter 0 → 100 tạo đúng một WO khi không có peer proof/stream, giữ nguyên EventId/payload/outbox chờ gửi; Job thủ công không tự sinh, cutover PREPARED vẫn khóa. Build dùng cấu hình kiểm thử riêng để không đụng DLL của backend người dùng đang chạy; cần chạy lại backend Edge bằng code mới trước khi giao diện settings phản ánh điều kiện offline mới. Không tự bật AutoGenerate của Job `testing1` thay người dùng.

**Trạng thái mới nhất:** đã sao lưu, diễn tập và reset PMS demo trên cặp database local Edge/Shore; dữ liệu ngoài PMS đã đối chiếu fingerprint. Xem [biên bản chuyển đổi local](PMS_LOCAL_CUTOVER_2026-10-26.md). Các đoạn “chưa reset” bên dưới mô tả mốc triển khai trước đó; không áp dụng cho cặp database local đã ghi trong biên bản. Chưa triển khai trên máy chủ Production khác.

**Điều chỉnh UI theo yêu cầu mới nhất:** bảng Job/WO/Counter/Lịch sử dùng nét kẻ `#a3b1bc`, tiêu đề căn giữa và tìm kiếm phía trên như bảng Tồn kho. Bỏ hàng ô lọc thường trực dưới tiêu đề; lọc chữ/lựa chọn/khoảng ngày và sắp xếp dùng menu tiêu đề chung của hệ thống. Tìm/lọc vẫn gọi server theo phân trang, không lọc riêng trang đã tải. Các wireframe cũ có hàng ô lọc dưới tiêu đề được thay bằng bố trí này. Bảng checklist/vật tư trong chi tiết và popup cũng dùng nét kẻ tương ứng.

### Rà soát giao diện — 27/10/2026

- Grid dùng border riêng từng ô để đường kẻ không biến mất khi cuộn các cột neo; giữ STT/tên/hành động, bỏ mũi tên sắp xếp cạnh tên (vẫn sắp xếp trong menu). Bỏ thanh “Đang lọc” ở mọi Grid PMS.
- Work Order không mặc định lọc OPEN: lần đầu gửi ALL; lọc tiến độ chỉ khi người dùng chọn, bỏ lọc trả lại ALL, kể cả khi dữ liệu được lấy từ cache.
- Hành động trong bảng dùng chung `ActionIcon`: Lucide 16px, nút không viền như Thiết bị, có tooltip/aria-label; các thao tác xem/sửa/xóa/lịch sử/kiểm tra/lưu counter đều theo quy chuẩn này.
- Lịch/Gantt có thanh chọn tháng nằm ngang gọn và nút trước/sau, bỏ dòng kỹ thuật múi giờ kéo dài. Gantt chia bảng thông tin/timeline bằng thanh kéo, có người phụ trách, cuộn ngang riêng và cuộn dọc đồng bộ. Header và dòng hai bên khớp chiều cao; nhãn trạng thái không làm vỡ dòng. Mốc là hạn thực tế của WO, không giả lập ngày bắt đầu/thời lượng chưa có trong hợp đồng dữ liệu.
- Chi tiết Job có breadcrumb Danh sách công việc › tên Job; nhóm thông tin/hướng dẫn bên trái, kế hoạch/trách nhiệm/WO đang mở bên phải; checklist và vật tư readonly thành hai tab. Đường dẫn sửa từ bảng mở đúng form, vẫn giữ kiểm tra quyền/trạng thái.
- Xác minh UI: production build/TypeScript và 9 test PMS đạt; 31 tình huống Chrome đạt, có ảnh kiểm tra chi tiết/Gantt/trạng thái sau kéo trong `artifacts/test-results/pms-ui-2026-10-26/` (thư mục artifact của bộ kiểm thử hiện hữu). Kiểm tra dùng HTTP fixture, không thay dữ liệu Job/WO vận hành. Chưa push các thay đổi UI này.

## Đã triển khai nền tảng

- Bổ sung metadata protocol 2 cho Job và WO ở cả Edge/Shore, migration và model snapshot tương ứng. Các trường mới nullable; dữ liệu legacy không tự chuyển protocol, không tự bật sinh WO.
- Job có phiên bản, trạng thái, mốc ban đầu, người/chức danh/bộ phận chịu trách nhiệm và cảnh báo giờ riêng. WO có khóa kỳ độc lập phiên bản Job, snapshot cấu hình, hạn ngày/giờ nullable riêng, tình trạng hạn và số lượt báo cáo.
- Khóa unique kỳ ở PostgreSQL ngăn tạo hai WO cho cùng Job/kỳ. Shore giữ phạm vi tàu. WO đã hủy hoặc xóa mềm vẫn giữ khóa kỳ, không được sinh lại để né trùng.
- `PmsJobRules` xử lý thiếu mốc, Lưu không tạo lịch sử giả, không tự tiếp tục Job tạm dừng; lịch tháng/năm, HYBRID, múi giờ tàu và cảnh báo đúng đơn vị. Duyệt tính kỳ sau từ lượt gửi hoàn tất/giờ chạy được duyệt, không sửa WO cũ.
- `PmsWorkOrderReleaseService` phát hành định kỳ trong giao dịch và khóa writer chung: đọc lại dữ liệu sau khóa, chống lặp, tối đa một WO mở, snapshot và checklist riêng, kiểm tra người thực hiện mặc định còn onboard. Không tự chọn ngẫu nhiên người cùng chức danh. Snapshot không lấy vật tư gán riêng từ form Job.
- Chặn các đường reset/consolidate/recovery legacy tác động lên protocol mới.
- Migration Down chặn nếu đã có bản ghi protocol mới; không xóa khóa kỳ/snapshot của dữ liệu đã vận hành để rollback phần mềm.

## Ranh giới hiện tại

Đã bổ sung API quản lý Job/WO, workflow và giao diện mới cho các luồng chính, nhưng **tắt mặc định** qua `Pms:ReworkApiEnabled`. Frontend chọn giao diện mới từ catalog quyền backend khi có module Job List, không có cờ bật riêng khiến UI lệch backend. Service phát hành mới chưa nối vào worker. Luồng cũ tiếp tục phục vụ khi chưa bật rework. Không có cutover, không chạy migration trên database thật và không tự chuyển dữ liệu legacy.

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
- Bổ sung migration riêng `20261025180000_AddPmsWorkOrderWorkflow` cho Edge/Shore: workflow version, người hỗ trợ/đóng góp, bảng report và posting kho. Báo cáo có Job nullable để WO đột xuất không cần kế hoạch giả; API tạo nháp/phát hành được bổ sung ở bước 26/10 bên dưới.
- Mỗi lượt gửi có snapshot/hash riêng: checklist/số đo, counter, thời gian, vật tư gồm mã/tên/đơn vị/số lượng và người đã đóng góp. Tên vật tư đổi sau khi gửi không đổi báo cáo cũ. Context chặn sửa/xóa snapshot đã gửi và posting đã ghi.
- Duyệt/trả lại dùng luồng xác thực tài khoản và bằng chứng ký hiện có. Người có quyền duyệt không cần được giao WO; admin kỹ thuật không bị buộc liên kết crew để duyệt. Người đã thực hiện bất kỳ lượt nào không tự duyệt/trả lại, kể cả sau bàn giao.
- Lưu/gửi không trừ kho. Duyệt hạch toán tồn theo vị trí đúng một lần/WO/vật tư, hoàn thành WO, cập nhật Job/counter và ghi report/quyết định/bằng chứng/outbox trong một giao dịch. Thiếu kho rollback toàn bộ; không dùng cache vật tư làm tồn kho thay thế.
- Kỳ sau tính từ lượt gửi cuối được duyệt/counter được báo cáo, không theo ngày duyệt hoặc counter tăng sau đó. WO cũ vẫn Hoàn thành. Thiết bị trở lại trạng thái trước bảo trì chỉ khi không còn WO khác đang làm/chờ duyệt/cần làm lại.
- Lịch sử Job hợp nhất legacy và report mới đã duyệt, lọc/phân trang ở DB. Lượt bị trả lại giữ trong revision/timeline WO, không tính thành lần bảo trì hoàn tất. API đọc báo cáo hoàn tất theo quyền Job không mở bản đang chờ duyệt.
- Chặn API workflow/checklist/realtime/gia hạn legacy sửa WO mới, kể cả admin. Workflow mới không gọi ảnh, ĐGRR hoặc BBKT.

## Đã triển khai tiếp — WO đột xuất/nháp (26/10/2026)

- Tạo nháp hoặc tạo/phát hành ngay WO đột xuất, sửa nháp, phát hành nháp và xóa mềm nháp; không tạo Job giả. Thiếu tên/thiết bị/hạn được giữ ở Nháp, chi tiết chỉ rõ phần thiếu; không tạo trạng thái quá hạn giả cho nháp.
- Kiểm tra lại thiết bị cụ thể còn sử dụng, PIC/hỗ trợ onboard và chức danh hoạt động khi phát hành. Gán người còn cần quyền phân công; quyền thêm WO không ngầm cấp quyền phân công. Selector WO chỉ trả các trường cần chọn người, không yêu cầu quyền Job hoặc hồ sơ thuyền viên đầy đủ.
- Checklist mẫu nháp lưu riêng vì checklist thực hiện cần AssetId thật. Khi phát hành mới chụp snapshot và tạo checklist thực hiện; sau phát hành không dùng đường sửa/xóa nháp để đổi hướng dẫn hoặc bỏ lịch sử.
- Mã lệnh khác Job, biên nhận tạo gắn người tạo/nội dung/nút nguồn và unique index. Gửi lại/đồng thời chỉ một WO; sửa nháp không làm mất biên nhận; retry mã đã xóa trả 410, không tạo lại. Bổ sung migration độc lập `20261026090000_AddPmsAdHocOrderDrafts` và mirror/snapshot Shore; Down chặn khi đã có dữ liệu nháp/biên nhận/hướng dẫn.
- Hạn WO đột xuất V1 dùng ngày tàu hoặc counter, chưa nhận timestamp có giờ. WO đã phát hành nối vào thực hiện–gửi–trả lại–duyệt/báo cáo đã có; duyệt không tăng kỳ Job định kỳ trên cùng thiết bị. Không thêm ảnh/ĐGRR/BBKT/vật tư gán vào form WO.
- Đây là bước API/schema backend; giao diện được nối ở bước tiếp bên dưới và `Pms:ReworkApiEnabled` vẫn tắt mặc định.

## Đã triển khai tiếp — giao diện chính (26/10/2026)

- Tab Bảng là Job List; thêm Work Order, giữ Lịch/Gantt/Counter. Giao diện mới không có tab Cấu hình hoặc popup Danh sách cấu hình thứ hai. Toolbar chỉ có số kết quả/nút nghiệp vụ; tìm, chọn trạng thái/người và lọc khoảng ngày tại cột, phân trang/sắp xếp Job/WO ở server.
- Dùng style bảng hệ thống: tiêu đề xanh nhạt, viền cột/dòng, badge, icon có nhãn, footer phân trang. STT/tên công việc/hành động neo khi cuộn ngang; popup/form/bảng báo cáo dùng cùng quy chuẩn. Cây chỉ hiển thị tên, thư mục mở để chọn thiết bị cụ thể; lọc toàn nhánh còn cần hoàn thiện.
- Form thêm/sửa Job gồm định nghĩa, chu kỳ lịch/giờ/HYBRID, mốc, trách nhiệm và checklist mẫu. Không nhập kết quả/vật tư gán/ảnh/ĐGRR/BBKT; chi tiết Job chỉ đọc vật tư đã gán từ thiết bị. Import Excel/tải mẫu nằm tại Bảng và gọi API Job mới, preview trước nhập, không nhập lịch sử/mốc/hạn hoặc bật tự động.
- Chi tiết Job có lịch sử, sửa, tạm dừng/ngừng/tiếp tục/khôi phục và xác nhận phát hành thủ công theo quyền/kỳ. Form tự động phát hành chưa cho bật vì worker mới chưa sẵn sàng; không báo đã tạo WO khi chỉ lưu Job.
- WO có tạo nháp/phát hành, sửa/xóa nháp, phân công PIC/hỗ trợ/bàn giao, hủy có lý do. Các nút dựa trên quyền và trạng thái; quyền thêm không tự hiện phần gán người nếu thiếu quyền phân công. Cập nhật dùng expectedVersion; không tự ghi đè khi có xung đột.
- Màn Thực hiện và Kiểm tra/duyệt là hai route riêng. Người được giao/hỗ trợ nhập checklist/số đo/ghi chú/giờ/vật tư, lưu hoặc gửi. Màn duyệt chỉ xem snapshot đã gửi, không sửa kết quả, không tự duyệt phần mình làm. Cùng hộp xác nhận tài khoản hiện có; lý do đã xác nhận là lý do gửi vào quyết định và bằng chứng ký. Thời gian nhập giờ đổi sang phút đúng một lần; retry gửi giữ commandId cho cùng nội dung.
- Lịch sử Job phân trang, mở báo cáo bất biến, phân biệt nguồn legacy. WO hiển thị các lượt gửi/trả lại và timeline; không đưa ảnh/ĐGRR/BBKT vào màn thực hiện hoặc duyệt mới.
- Lịch/Gantt chỉ tải WO thật trong khoảng tháng và từng trang, dùng múi giờ tàu; WO chỉ counter không nhận ngày ước tính. Gantt hiện mốc hạn vì chưa có dữ liệu thời lượng kế hoạch, không dựng thời gian thực hiện giả. Counter dùng API phân trang gọn, ghi giờ qua quyền/cơ chế hiện có và không mở lại WO hoàn thành.
- Bổ sung API chỉ trả metadata cần dùng: cây thiết bị không tải technical specs, Counter phân trang, selector vật tư theo tên/mã/ID và đơn vị/tồn theo vị trí, múi giờ tàu chuẩn hóa IANA. UI dùng React Query phân vùng theo phiên đăng nhập, chống gọi trùng và làm mới dữ liệu sau thao tác; không mở quyền ghi kho/hồ sơ thuyền viên để thực hiện WO.
- Chưa xóa các adapter/page legacy còn phục vụ dữ liệu cũ hoặc chưa có mapping; không lấy giao diện mới làm lý do bật rework cho dữ liệu vận hành khi chưa qua các điều kiện chuyển đổi.

## Đã triển khai tiếp — hàng rào tương thích đồng bộ (26/10/2026)

- Người dùng cho phép bỏ dữ liệu PMS demo cũ. Lần chuyển đổi này được phép reset Job/task/lịch sử/cấu hình PMS thay vì di chuyển từng bản ghi; không xóa thiết bị, liên kết vật tư, tồn kho, crew/tài khoản/chức danh/quyền hoặc dữ liệu ngoài PMS. Chưa thực hiện reset trên database vận hành; cần hoàn thiện mốc reset và chặn sự kiện cũ ở cả hai đầu trước khi xóa.
- Đã chặn Job/WO protocol mới đi qua bộ đồng bộ legacy. Edge giữ nguyên payload/EventId và trạng thái chưa gửi, có lịch thử lại; không gửi rồi tin vào ACK của bộ nhận cũ. Bảng report/posting được nhận diện kể cả tên số ít/số nhiều; protocol lạ hoặc payload PMS hỏng không được đi qua mapper cũ.
- Gói UPDATE Job/WO mới luôn chứa protocol; DELETE giữ dấu protocol. UPDATE báo cáo giữ đầy đủ snapshot/quyết định thay vì chỉ gửi delta. Dấu protocol được giữ từ lúc tạo sự kiện, không gán phiên bản mới tùy tiện vào gói cũ khi gửi. Những delta đã xếp hàng từ trước được kiểm tra thêm theo bản ghi nguồn.
- Đối soát hàng đợi bổ sung report/posting chưa đồng bộ để tránh bỏ sót khi mất hàng đợi. Chưa có bộ nhận mới nên các gói phục hồi vẫn được giữ, không ACK giả hoặc viết lại nội dung đã ký.
- Bộ nhận Shore chặn protocol mới trước kiểm tra trùng sự kiện; đường nhận trực tiếp cũng chặn trước sửa payload/ghi dữ liệu. Chặn gói legacy ghi lên Job/WO đã mang protocol mới. Pull Edge không xác nhận gói protocol mới qua mapper cũ. Push thiết bị từ Shore không kèm bản sao Job protocol mới thuộc sở hữu Edge.
- Đây là hàng rào tương thích tạm thời, **chưa phải đồng bộ Job/WO mới hoàn chỉnh**, chưa phải epoch reset. Chưa có thương lượng capability, remap nguồn cho report/bằng chứng hoặc worker phát hành tự động mới. Rework vẫn tắt mặc định; không dùng việc test hàng rào đạt để bật vận hành.

## Đã triển khai tiếp — lõi phát hành định kỳ theo lô (26/10/2026)

Phần lõi quét phát hành định kỳ đã được bổ sung bằng `PmsPeriodicReleaseSweep`: tối đa 200 Job/lô, cursor theo GUID và chỉ lấy ID từ DB; mỗi Job có scope/giao dịch riêng, dùng issuer protocol mới cùng khóa chống tạo trùng. Kết quả đếm riêng WO vừa tạo, Job bỏ qua và Job lỗi. Cursor chỉ nối các lô trong một lượt quét; lượt quét sau phải bắt đầu lại từ đầu để không bỏ Job mới có ID nhỏ hơn hoặc vừa bật tự động. Không đăng ký làm hosted worker, không bật cờ tự động trên UI trước khi capability/epoch/cutover đồng bộ hoàn tất; dịch vụ chu kỳ legacy không gọi lõi mới này.

Lõi chỉ quét Job protocol mới, ACTIVE, bật AutoGenerate và loại PERIODIC. Issuer đọc lại dữ liệu sau khóa để quyết định theo hạn ngày tàu/counter và ON_UPCOMING/ON_DUE. Lỗi thiết bị/Job được ghi riêng rồi xử lý Job tiếp theo; WO đã hủy vẫn tiêu thụ khóa kỳ, WO hoàn thành giữ nguyên và kỳ tiếp theo có ID mới. Kết quả `Created` được trả từ trong giao dịch phát hành, tránh nhiều worker cùng đếm một WO đã có là vừa tạo. Singleton chỉ giữ scope factory/logger, không giữ DbContext giữa các lô.

## Các phần tiếp theo chưa hoàn tất

### Cập nhật mới nhất — bộ nhận riêng, worker có điều kiện và công cụ reset (26/10/2026)

- Đã có bộ nhận protocol 2 riêng trên Shore cho Job/WO/report/posting, thương lượng capability trước gửi và biên nhận lưu riêng theo NodeId/DatasetId/StreamId. Phiên bản bị từ chối, thiếu cha, sai dataset hoặc thay snapshot/quyết định không được ACK. Job/WO remap ID theo tàu/nguồn; trách nhiệm remap crew theo nguồn, rank theo mã. Snapshot/hash/bằng chứng giữ nguyên nguồn.
- Checklist mẫu được chụp trong cùng gói Job (`PmsChecklistTemplates`), gồm trạng thái thêm/sửa/xóa chưa Save của cùng giao dịch. Không gửi các dòng checklist protocol mới qua mapper legacy. Shore cập nhật mẫu theo bản định nghĩa nhận được; WO/báo cáo đã có giữ snapshot riêng. ACK của Job mới nhất mới đánh dấu checklist nguồn đã gửi. Payload PMS chỉ lấy scalar, không kéo theo navigation graph.
- Job là snapshot cấu hình đầy đủ nên bản chờ mới nhất được gửi trước; các gói cũ được nhận như trạng thái cũ sau đó, không ghi đè bản mới. Khi rank master đổi mã, bản cập nhật tham chiếu mới được xếp hàng bằng EventId mới nếu payload hiện tại đã khác; không sửa payload/EventId của gói cũ và không làm gói tham chiếu cũ chặn bản đã sửa. Cơ chế này chỉ áp dụng Job protocol mới, không đổi FIFO của báo cáo/ledger hay phân hệ khác.
- Báo cáo được duyệt chỉ nhận khi bằng chứng ký đúng WO, nội dung báo cáo và người duyệt. Báo cáo pending gửi muộn không xóa quyết định đã nhận. Ledger vật tư là mirror, không hạch toán tồn kho lại trên Shore. Đã kiểm tra replay, thứ tự cha/con, hai tàu dùng cùng ID nguồn và gói thuộc bộ dữ liệu bị khóa.
- Bộ nhận không cho đổi danh tính/khóa kỳ/snapshot/hạn đã chụp của WO đã phát hành; không đưa WO hoàn thành/hủy về trạng thái đang làm, kể cả khi gói có sequence mới hơn. Phiên bản Job/WO không được giảm. Báo cáo phải khớp Job/WO và revision đã gửi; không gán lịch sử sang Job khác chỉ vì cùng tàu.
- Worker protocol mới đã đăng ký; chỉ chạy khi API bật, cutover ACTIVE, provisioning profile đang active. Tự phát hành là nghiệp vụ local, không phụ thuộc peer/bờ. Không còn là bộ phát hành chạy chỉ dựa vào một cờ cấu hình. UI đã có chọn ON_UPCOMING/ON_DUE và tự động phát hành theo trạng thái sẵn sàng từ settings. Worker legacy dừng xử lý chu kỳ khi có dấu cutover.
- API Job/WO yêu cầu `X-Pms-Dataset-Id` sau reset; Context kiểm tra lại sau khóa writer. Các controller legacy trả 410 sau cutover. Web khóa ghi khi phát hiện dataset đổi trong lúc trang đang mở; tải settings mới không tự gán dataset mới lên form cũ. Cây thiết bị lọc cả nhánh cho Job/WO/Lịch/Gantt/Counter, truy vấn đệ quy chỉ lấy ID và chống vòng lặp cây hỏng.
- Có công cụ `tools/PmsDemoReset`, mặc định xem trước, xác minh profile/node/tàu, giới hạn bảng PMS, kiểm tra FK ngoài phạm vi và phục hồi trạng thái trước bảo trì khi có mốc. Các pha chuẩn bị/hoàn tất hai đầu cho phép tiếp tục cùng DatasetId sau lỗi, không xóa lại dữ liệu đã tạo sau reset thành công. Đã kiểm tra trên PostgreSQL riêng; **chưa chạy trên database vận hành**. Xem [hướng dẫn reset](../../tools/PmsDemoReset/README.md).
- Các đoạn ghi “chưa có bộ nhận/worker/capability” phía trên mô tả trạng thái của các bước trước; được thay bằng cập nhật này. Đây vẫn chưa phải xác nhận đã chuyển đổi xong web + mobile + dữ liệu vận hành.

1. Đã có chuyển quyền cấu hình cũ sang Job List khi bật rework, không thêm quyền WO; catalog mới ẩn mục cấu hình cũ và đặt tên Work Order rõ ràng. Các alias API cũ vẫn giữ cho chế độ chưa cutover; cần kiểm kê/loại bỏ chúng cùng các route legacy ở bước dọn cuối, không coi việc đổi catalog là đã xóa mọi API cũ.
2. Đã có xem trước ảnh hưởng mốc/chu kỳ/hạn trước khi xác nhận lưu, lọc toàn nhánh và chính sách/tự động phát hành gắn worker. Còn kiểm kê thao tác nhiều dòng theo wireframe.
3. Phát hành Job theo sự kiện lên đà/theo yêu cầu/theo chuyến và thông báo bền vững. Worker định kỳ protocol mới, phân công hỗ trợ/hủy/trạng thái Job đã có; các Job không định kỳ chưa có luồng phát hành theo sự kiện.
4. Mapping link/báo cáo legacy và dọn route/component/API sau khi chuyển giao có đối chiếu; kiểm thử giao diện với API thật đầy đủ. UI chính đã có, Chrome hiện kiểm tra bằng HTTP fixture riêng, chưa phải end-to-end trên hệ thống vận hành.
5. Kiểm thử liên thông HTTP thật web–Edge–Shore. Mobile được người dùng bỏ khỏi phạm vi đợt này, không phải điều kiện chặn triển khai web. Khi triển khai mobile sau này phải dùng hợp đồng WO/phiên bản/dataset mới; không tự gán dataset mới cho lệnh offline cũ.
6. Cặp database demo local đã kiểm kê/sao lưu/diễn tập/reset và bật cấu hình Development theo biên bản mới nhất. Còn nhập lại Job mới và kiểm tra chu kỳ thực tế qua đồng bộ. Môi trường khác phải kiểm kê riêng; không dùng kết quả local để tự reset máy chủ Production hoặc bật nghiệp vụ khi chưa hoàn tất cấu hình local.

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

Sau bước WO đột xuất/nháp (26/10/2026):

- Toàn bộ backend Edge: **286 đạt, 0 lỗi, 0 bỏ qua**, PostgreSQL riêng; artifact `artifacts/test-results/pms-adhoc-2026-10-26/edge-adhoc-all.trx`.
- Shore: **4 đạt, 0 lỗi, 0 bỏ qua** cho mirror/model/migration; artifact `artifacts/test-results/pms-adhoc-2026-10-26/shore-adhoc.trx`. Không coi kiểm thử mirror/model là đồng bộ end-to-end.
- Kiểm thử nháp thiếu thông tin/checklist chưa có thiết bị → sửa → phát hành → thực hiện → gửi → duyệt bằng luồng ký hiện có; không tạo Job giả hoặc tăng kỳ Job định kỳ cùng thiết bị.
- Kiểm thử hai yêu cầu tạo đồng thời/retry chỉ sinh một WO; sửa nháp không mất biên nhận; nội dung đổi với mã cũ bị từ chối, retry sau xóa mềm trả 410. Xóa/sửa sau phát hành bị chặn.
- Kiểm thử tách quyền tạo và phân công, revalidate thuyền viên rời tàu/thiết bị ngừng sử dụng khi phát hành, ngày tàu chuyển UTC và đọc lại đúng ngày, từ chối field kết quả/ảnh/biểu mẫu trong định nghĩa WO.
- Kiểm thử migration Up/Down với schema cũ, unique biên nhận tạo và chặn Down khi đã có dữ liệu; Shore giữ phạm vi tàu/nút nguồn cho khóa này.
- Build Edge/Shore đạt; cảnh báo EF1002/xUnit2031 vẫn là các vị trí đã tồn tại. Chưa thay frontend, chưa chạy UI/mobile, chưa bật worker hoặc đồng bộ rework vận hành.

Sau bước giao diện chính (26/10/2026):

- Toàn bộ backend Edge: **289 đạt, 0 lỗi, 0 bỏ qua** trên PostgreSQL riêng; bản cuối `artifacts/test-results/pms-ui-2026-10-26/edge-ui-last.trx`. Có test phân trang Counter, selector vật tư lấy tồn theo vị trí thay cache, phạm vi quyền và kiểm tra lại thiết bị ngừng sử dụng khi phát hành định kỳ.
- Frontend: **47 test auth/quyền hiện có + 9 test PMS mới đạt** qua `npm run test:auth` và `npm run test:pms`. Bao gồm route Job-only/config alias, xác nhận duyệt/trả lại, giờ tàu/UTC/DST, khoảng ngày bao trọn ngày tàu, parser import và snapshot chỉ đọc.
- Build production frontend đạt bằng `npm run build`; TypeScript đạt. Cảnh báo kích thước bundle lớn còn tồn tại, chưa coi bước này là tối ưu toàn bộ bundle hệ thống.
- Chrome headless: **16 tình huống đạt** bằng `npm run test:pms:browser`, dùng component/CSS thật, server Vite riêng và HTTP fixture, không gọi backend vận hành. Kiểm tra Job List, form/focus/độ tương phản, lọc ngày gửi đúng UTC, lịch sử/báo cáo, đóng popup lồng, WO, Lịch/Gantt/Counter, duyệt chỉ đọc, lý do ký khớp lý do trả lại, thực hiện/gửi 1,5 giờ thành 90 phút, quyền chỉ xem và màn hẹp.
- Screenshot và `browser-summary.json` ở `artifacts/test-results/pms-ui-2026-10-26/`, không đưa Git. Đã xem lại ảnh và sửa nút chính thiếu tương phản/textarea bị ép chiều cao; không chỉ kiểm tra DOM.
- Chưa phải UI + API thật + đồng bộ end-to-end; kiểm thử backend PostgreSQL và browser fixture là hai lớp riêng. Chưa bật rework hoặc migration trên dữ liệu vận hành, chưa thay `.env.production`.

PostgreSQL kiểm thử dùng container tạm tại `127.0.0.1:55439`; database có tiền tố `codex_pms_tests_`, tách hoàn toàn dữ liệu vận hành. Container được dừng/xóa sau kiểm thử. Không đưa thông tin đăng nhập vận hành hoặc artifact TRX vào Git.

Sau bước hàng rào tương thích đồng bộ (26/10/2026):

- Toàn bộ backend Edge: **307 đạt, 0 lỗi, 0 bỏ qua**, PostgreSQL riêng (`pms-sync-fence-2026-10-26/edge-all.trx`). Sau phần bổ sung cuối, chạy lại toàn bộ nhóm đồng bộ Edge: **61 đạt, 0 lỗi, 0 bỏ qua** (`edge-sync-final.trx`), gồm phục hồi hàng đợi báo cáo với snapshot giữ nguyên.
- Shore: **88 đạt, 0 lỗi, 0 bỏ qua** cho nhóm đồng bộ và nền tảng Job/WO (`shore-sync.trx`). Bản sửa cuối: **10 đạt, 0 lỗi, 0 bỏ qua** (`shore-final-verified.trx`), gồm batch trùng biên nhận, push thiết bị giữ Job legacy/bỏ Job mirror mới và đường nhận trực tiếp không đụng DB trước khi chặn.
- Kiểm tra Edge giữ payload/EventId, không đánh dấu đã gửi khi bộ nhận chưa hỗ trợ; batch hỗn hợp vẫn gửi phân hệ khác, gói UPDATE/DELETE còn protocol, delta cũ được kiểm tra qua nguồn, pull không ACK hoặc ghi watermark cho gói bị chặn. Shared contract Edge/Shore có nội dung giống nhau.
- Không coi các kiểm tra này là đồng bộ rework end-to-end: bộ nhận chuyên biệt/capability, epoch reset, đồng bộ mobile và worker mới vẫn chưa hoàn tất. Không xóa dữ liệu vận hành và không thay `.env.production` trong bước này.

Sau bước lõi quét phát hành định kỳ (26/10/2026):

- **7 kiểm tra phát hành đạt**, gồm phân lô GUID trên PostgreSQL, tách lỗi thiết bị khỏi các Job còn lại, bỏ qua legacy/tạm dừng/tắt tự động, ON_UPCOMING so với ON_DUE, chạy đồng thời chỉ tạo và đếm một WO, không tái tạo khóa kỳ hủy và không reset WO hoàn thành.
- Toàn bộ backend Edge bản cuối: **311 đạt, 0 lỗi, 0 bỏ qua** trên PostgreSQL tạm; `artifacts/test-results/pms-release-sweep-2026-10-26/edge-all.trx`. Build đạt; cảnh báo EF1002/xUnit2031 vẫn ở các vị trí đã tồn tại. Container kiểm thử đã được dừng/xóa sau khi chạy.
- Đã push phần trước lên `origin/hiu67-rework` tại `79b0eef3` theo yêu cầu rồi mới triển khai lõi quét. Các thay đổi lõi quét ở bước này còn trong working tree, chưa thuộc commit đó. Không đổi frontend/Shore/schema vận hành, không bật hosted worker, không reset dữ liệu thật.

Sau bước bộ nhận riêng, worker và reset (26/10/2026):

- Toàn bộ backend Edge bản cuối: **321 đạt, 0 lỗi, 0 bỏ qua** trên PostgreSQL riêng, `pms-mirror-2026-10-26/edge-job-snapshot-final.trx`. Bao gồm capability/receipt, dấu dataset chụp khi xếp hàng, checklist Job nguyên tử, worker được ràng buộc đúng node/dataset/stream, chặn ghi khi reset, lọc nhánh có vòng lặp và truy vấn ưu tiên Job mới nhất trên PostgreSQL thật.
- Nhóm đồng bộ và nền tảng PMS Shore: **93 đạt, 0 lỗi, 0 bỏ qua**, `shore-release-final.trx`. Sau phần checklist/phiên bản, bộ nhận mới được kiểm tra lại **4 bài đạt** tại `shore-job-replay-final.trx`. Bao gồm hai tàu trùng ID nguồn, crew remap/rank theo code, cập nhật mẫu Job không đổi báo cáo, chặn sửa WO kết thúc, bằng chứng ký/report, ledger không trừ lại kho và migration Up/Down không gỡ fence đã có dữ liệu.
- Công cụ reset: **2 tình huống đạt**, `reset-scope-locked-final.trx`; kiểm tra trên schema PostgreSQL fixture riêng, gồm tham chiếu ngoài PMS với CASCADE vẫn bị chặn, tiếp tục sau lỗi, chỉ xóa dữ liệu tàu được chọn, giữ counter/bằng chứng ký/queue ngoài PMS và phát sinh cập nhật khôi phục trạng thái thiết bị. Chưa thay thế preview/dry-run trên database đích thực tế.
- Frontend: **49 test auth/quyền/dataset + 9 test PMS đạt**, build production và TypeScript đạt; Chrome **16 tình huống đạt** với fixture HTTP và profile kiểm thử riêng. Lượt trong sandbox bị treo ở `Runtime.enable`; xác minh cuối chạy Chrome ngoài sandbox. Đây chưa phải kiểm thử UI với backend và đồng bộ HTTP thật toàn hệ thống.
- Cảnh báo dependency cũ ImageSharp/EF1002/xUnit2031 và kích thước bundle vẫn còn; không thêm thay đổi package backend ngoài phạm vi để che cảnh báo. Công cụ reset mới dùng Npgsql 8.0.8, restore không báo cảnh báo package của công cụ.
- Những thay đổi sau `79b0eef3` chưa push. Chưa cập nhật mobile, chưa bật cờ rework hoặc chạy migration/reset trên hệ thống vận hành, không sửa `.env.production`. Các phần còn thiếu được giữ rõ trong danh sách phía trên, không đánh dấu toàn bộ kế hoạch đã hoàn tất.

### Tiếp tục rà soát và hoàn thiện giao diện/quyền (26/10/2026)

- Job thêm/sửa có bước xem trước hạn hiện tại/hạn sau lưu, trạng thái và số WO đang mở trước khi xác nhận. Sửa bất kỳ nội dung form nào sẽ xóa preview. Server dùng cùng kiểm tra tham chiếu và công thức với lệnh lưu; preview không ghi Job/checklist/audit/outbox, không sửa WO đã phát hành. Mốc đã có lần thực hiện được duyệt vẫn tính từ lần đó, không ngầm thay bằng mốc nhập lại. Lệnh lưu kiểm tra lại phiên bản dưới khóa.
- Khi bật rework, catalog chỉ hiện Job List và Work Order, ẩn mục cấu hình cũ. Quyền cấu hình cũ được chiếu sang đúng quyền Job tương ứng khi đọc, không cấp thêm quyền WO. Đọc quyền không tự ghi DB/tăng phiên bản; admin lưu tiếp sẽ dùng mã mới và audit hiện có. Alias legacy chưa xóa vật lý vì còn chế độ chưa cutover.
- Shore chặn sửa/xóa Job protocol 2 qua API cấu hình cũ; không cho bờ sửa bản mirror thuộc tàu. Giới hạn checklist Job nhận được thống nhất 500 dòng với nguồn Edge. Ledger phải khớp vật tư/số lượng trong báo cáo đã duyệt có bằng chứng ký; không trừ kho trên bờ.
- Xác minh cuối: **323 test Edge đạt, 0 lỗi, 0 bỏ qua** (`edge-job-impact-permissions-final.trx`); **4 test mirror Shore đạt** sau sửa ledger/quyền ghi/giới hạn checklist (`shore-ledger-ownership-final.trx`). Frontend build production/TypeScript và 9 test PMS đạt; Chrome đã xác minh thêm luồng xem trước → sửa form → xem trước lại → xác nhận, không ghi trước xác nhận. Ảnh `artifacts/test-results/pms-ui-2026-10-26/job-impact.png` đã kiểm tra trực quan.
- Chưa push thay đổi mới, chưa reset dữ liệu vận hành. Mobile, phát hành theo sự kiện, thông báo bền vững và kiểm thử liên thông thật vẫn thuộc các mục còn lại phía trên.
