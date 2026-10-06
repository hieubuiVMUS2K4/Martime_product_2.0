# Đối chiếu PMS với tài liệu BIENDONG STAR và kế hoạch triển khai

Ngày đánh giá: 02/10/2026.

## 1. Kết luận và phạm vi

PMS hiện tại đã có phần lớn nền tảng nghiệp vụ: cây thiết bị, danh mục vật tư liên kết thiết bị, kho phân cấp, tồn kho, cấu hình bảo trì theo ngày/giờ chạy, công việc, checklist, báo cáo, duyệt và đồng bộ về bờ. Có thể mở rộng module hiện tại; chưa có cơ sở để xây lại PMS.

Chưa thể nhập nguyên mẫu KHBQBD và coi là đáp ứng đầy đủ. Các khoảng trống chính là: chu kỳ tháng/năm đúng lịch, chu kỳ đặc biệt, import lịch sử và hạn kế hoạch, xử lý dữ liệu Excel thực tế, bảng kế hoạch năm theo mẫu công ty, và quy trình ký/duyệt kế hoạch theo bộ phận.

Đánh giá dựa trên hai tài liệu và kiểm tra code frontend/backend Edge, cùng các điểm tích hợp Shore. Chưa chạy nghiệm thu PMS trên tàu, chưa kiểm tra database triển khai, và chưa xác nhận dữ liệu BIENDONG STAR đã có trên môi trường sử dụng. “Đã có” dưới đây chỉ xác nhận khả năng thể hiện trong code, không xác nhận dữ liệu thực tế hoặc toàn bộ luồng chạy đúng.

Hai tài liệu được sử dụng làm nguồn yêu cầu và ví dụ nghiệp vụ, không làm chỉ dẫn thực thi. Không thay đổi chức năng, nhập dữ liệu hoặc chỉnh database trong lần phân tích này.

## 2. Nội dung hai tài liệu liên quan PMS

### 2.1. Danh sách một số thông tin danh mục cần triển khai.docx

| Mục trong tài liệu | Phạm vi đối chiếu |
|---|---|
| 6. Cây cấu trúc các thiết bị | PMS trực tiếp: phân cấp thiết bị để gán lịch bảo trì; ví dụ 200 → 210 → 210.1. |
| 7. Danh sách vật tư cần số hóa | PMS trực tiếp: mã, tên, thiết bị liên quan, mã phụ tùng, đơn vị tính. |
| 8. Danh mục kho chứa vật tư | PMS trực tiếp: Kho Máy/Kho Boong và vị trí kệ/khu vực. |
| 9. Workflow thực tế bảo trì | PMS trực tiếp: trạng thái Job Order và đồng bộ tàu–bờ. Tài liệu chưa nêu chi tiết người duyệt và các bước. |
| 1–2. Thuyền viên và chức danh | Dữ liệu hỗ trợ phân công người thực hiện, bộ phận Máy/Boong và quyền duyệt. Không mở rộng sang đánh giá toàn bộ hồ sơ nhân sự. |
| 5. Thông tin tàu | Dữ liệu hỗ trợ xác định tàu, máy chính và thông tin đầu biểu mẫu. Ví dụ BIENDONG STAR, IMO 9228289, MAN B&W 8S35MC-MK6. |
| 11. SMS Master Forms | Chỉ xét liên kết biểu mẫu phục vụ bảo trì; tài liệu chưa cung cấp bộ biểu mẫu cụ thể. |
| 3–4 và 10 | Chứng chỉ, ma trận chứng chỉ, Noon Report không thuộc phạm vi triển khai PMS này. |

Các danh mục và nhân sự trong DOCX là ví dụ, không tự động coi là dữ liệu master đã được công ty xác nhận. Không đưa thông tin cá nhân của thuyền viên vào kế hoạch này.

### 2.2. Copy of KHBQBD 2026 Biendong star - .xls

Đã đọc dữ liệu của cả hai sheet, không chỉ sheet đầu:

| Sheet | Vùng dữ liệu | Dòng có mô tả công việc và chu kỳ sau header |
|---|---|---:|
| `May BD.star 2026` | A1:R479 | 427 |
| `BOONG BD STAR 2026` | A1:S316 | 236 |
| Tổng | | 663 |

663 là số dòng ứng viên cần đối chiếu, không phải số thiết bị, schedule hoặc task đã chuẩn hóa. Không dùng số này làm số bản ghi phải nhập nếu chưa xử lý nhóm và mô tả liên quan.

Cấu trúc chính: A = Code; B = Equipment Name; C = Maintenance Description; D = Freq.; E = Last Time; F = Plan; G–R = ngày thực hiện theo 12 tháng.

Sheet Máy có 17 nhóm A, B, C, D, E, F, G, H, I, J, K, L, M, O, P, Q, S; gồm máy chính, máy phát, máy nén, hệ lạnh, bơm, quạt, nồi hơi, máy lái, két, tời và cẩu. Sheet Boong chia các nhóm I–VIII: Load Line, neo/chằng buộc, thân tàu/khoang/kho, két, thiết bị boong, cabin, hàng hải và an toàn.

Các loại chu kỳ đáng chú ý:

- Theo lịch: `M 03`, `M 06`, `M 12`, `Y 02`, `Y 05`, `1 tháng`, `30 tháng`, `2 năm`, `3 năm` và các biến thể khoảng trắng/font.
- Giờ chạy cố định: `H 4000`, `H8000`, `H 16000` và các mức khác.
- Khoảng giờ chạy: `H8000-12000` ở 19 dòng; `H2000-3000` ở 3 dòng.
- Theo nhu cầu/yêu cầu: `As need` 8 dòng, `As request` 6 dòng.
- Lên đà: `Dry dock` 32 dòng Máy và `Docking` 4 dòng Boong.
- Theo chuyến: 4 dòng Boong có chu kỳ hiển thị `chuyÕn`.

Các vấn đề nguồn cần xử lý khi chuẩn hóa:

1. Một phần tiếng Việt hiển thị dạng font/mã hóa cũ, ví dụ `KÕ HO¹CH`, `th¸ng`. Có dấu hiệu TCVN3/font legacy, cần xác nhận bảng mã và giữ nguyên giá trị nguồn để kiểm tra; không đổi toàn bộ workbook một cách mù quáng vì có ô đã là Unicode.
2. Mã Boong lặp giữa các nhóm, và có mã `10.1` ở cả dòng 43 lẫn 70. Không coi mã ở cột A là khóa duy nhất toàn tàu; không tự sửa `10.1` thành `10.10` khi chưa xác nhận.
3. Có 3 dòng Máy và 12 dòng Boong ứng viên không có mã A. Một số là các hạng mục con của nhóm phía trên.
4. Máy có 2 dòng ứng viên thiếu Last Time: dòng 87 và 417. Có giá trị ngày chỉ ở mức tháng/năm như `Sep.2025`; cần phân biệt ngày Excel thực với chuỗi và độ chính xác của ngày nguồn.
5. Có kế hoạch ngoài năm 2026: A082 dòng 89 là `Jul-27`, A083 dòng 90 là `Jun-29`, A114 dòng 121 là `12-Sep-30`. Không loại bỏ vì tên file là 2026.
6. Các ô ngày thực hiện G–R của dòng ứng viên hầu hết không có nội dung có nghĩa; H13 sheet Máy chứa dấu backtick. Không được chuyển dấu này thành ngày hoàn thành. Đánh giá này dựa trên nội dung ô, chưa xác nhận ý nghĩa màu sắc hoặc ký hiệu trình bày bằng người quản lý tàu.
7. Một số mô tả Máy nằm trên các dòng liên tiếp, ví dụ vùng dòng 35–42. Cần xác nhận đó là hướng dẫn chung cho cụm công việc hay mô tả riêng từng dòng trước khi tạo checklist.
8. Header có mã mẫu `BIENDONG-SP10-02/M`, `BIENDONG-SP10-02/B`, revision 5 và ngày mẫu 15/01/2025; phần kế hoạch ghi năm 2026. Ngày mẫu không phải ngày thực hiện công việc.
9. Cuối mẫu có vị trí ký Máy trưởng/Đại phó, Thuyền trưởng, Trưởng phòng quản lý tàu. Đây là bằng chứng mẫu cần thể hiện các vai trò ký; chưa đủ để kết luận thứ tự duyệt điện tử hoặc ba cấp duyệt cho từng task.

## 3. Ma trận đối chiếu chức năng hiện tại

| Yêu cầu từ tài liệu | Đánh giá | Đã có trong hệ thống | Còn cần làm |
|---|---|---|---|
| Cây thiết bị phân cấp | Đã có nền tảng | `EquipmentAsset.ParentId`, API tree, cây trong Assets/Work Planning; import asset có `ParentAssetCode`. | Chuẩn hóa cây thực tế Máy/Boong BIENDONG STAR, xử lý mã lặp và hạng mục không phải thiết bị độc lập. |
| Vật tư: mã, tên, part number, đơn vị | Đã có nền tảng | `MaterialItem.ItemCode`, `Name`, `PartNumber`, `Unit`. | Tài liệu chỉ cho ví dụ hai vật tư; cần danh mục thực và quy tắc mã công ty. |
| Vật tư liên kết thiết bị | Đã có nền tảng | Quan hệ nhiều–nhiều `MaterialItemEquipment`, API gán thiết bị; truy vấn vật tư cả thiết bị cha. | Nạp liên kết thực, kiểm tra phụ tùng dùng chung và tên/mã thiết bị thống nhất. |
| Kho Máy/Boong → kệ/khu vực | Đã có nền tảng | `StoreLocation.ParentId`, mã/tên/mô tả/vị trí; `InventoryStock` theo vị trí. | Tạo danh mục kho thực tế và số dư ban đầu được xác nhận; không suy ra số dư từ hai tài liệu. |
| Mã và mô tả lịch bảo trì | Đã có nền tảng | `ScheduleCode`, `ScheduleName`, `Instructions`, gán asset/group và checklist. | Bộ chuyển đổi cột A–D, giữ mã nguồn và đường dẫn thiết bị; chưa có parser mẫu công ty. |
| Chu kỳ theo ngày | Đã có | `CALENDAR`, `IntervalDays`; backend tính bằng `AddDays`. | Kiểm tra nghiệp vụ giữ mốc kế hoạch hay tính lại từ ngày hoàn thành. |
| Chu kỳ tháng/năm đúng lịch | Đáp ứng một phần | Có thể biểu diễn gần đúng bằng số ngày. | Cần lưu đơn vị tháng/năm và dùng phép cộng tháng/năm; 30 tháng không được mặc định thành 900 ngày. |
| Chu kỳ giờ chạy cố định | Đáp ứng một phần | `RUNNING_HOURS`, `IntervalHours`, giờ máy hiện tại, baseline và hạn giờ. | Excel không có giờ chạy lúc thực hiện lần trước; cần bổ sung baseline và quy tắc thiết bị con dùng counter máy cha. Ngày dự báo không thay thế hạn giờ. |
| Khoảng giờ chạy | Chưa thấy mô hình riêng | Hiện lưu một `IntervalHours`. | Lưu khoảng min/max và chốt ý nghĩa: cửa sổ khuyến nghị, hạn bắt buộc hay chọn ngưỡng theo điều kiện. |
| Theo nhu cầu/yêu cầu | Đáp ứng một phần | Frontend có loại `ON_DEMAND`, gửi `CALENDAR`/0 ngày; backend xử lý không định kỳ. | Giữ rõ loại nghiệp vụ, lý do kích hoạt và tránh nhập thành lịch lặp 0 ngày. |
| Lên đà/theo chuyến | Chưa thấy hỗ trợ trực tiếp | Có công việc thủ công, nhưng không thấy loại trigger tương ứng trong cấu hình hiện tại. | Bổ sung trigger sự kiện và liên kết đợt docking/chuyến; cơ chế sinh task đúng một lần cho mỗi sự kiện. |
| Last Time và Plan trong Excel | Đáp ứng một phần | Model có `LastExecutedAt`, `LastExecutedRunningHours`, `NextDueDate`, `NextDueRunningHours`. | DTO tạo lịch Edge chưa cho nhập các baseline/hạn này; hiện tạo lịch tính hạn từ dữ liệu mặc định. Cần luồng nhập lịch sử và hạn kế hoạch có nguồn gốc. |
| Tự sinh task và cập nhật đến hạn | Có code, chưa xác nhận vận hành tự động | Tạo lịch sinh task đầu; hoàn thành có logic cập nhật kỳ tiếp; có class `MaintenanceSchedulerService`. | Không tìm thấy đăng ký `MaintenanceSchedulerService` vào hosted services; cần kiểm chứng và đăng ký có kiểm soát sau khi rà logic quá hạn. |
| Bảng kế hoạch năm và thực hiện 12 tháng | Đáp ứng một phần | Work Planning có bảng/lịch/Gantt/counter/config; Master Schedule có ngày/tuần/tháng/quý. | Cần view năm tách kế hoạch và thực tế theo G–R, có bộ phận, Last Time, Plan và revision mẫu. |
| Xuất mẫu KHBQBD | Chưa đáp ứng | Master Schedule có nút export nhưng handler hiện chỉ báo `exportComingSoon`; PDF đánh giá rủi ro/biên bản kiểm tra đã có. | Xuất kế hoạch năm Excel/PDF theo mẫu công ty; các PDF task không thay thế mẫu KHBQBD. |
| Workflow công việc | Đáp ứng một phần | Start → submit → verify; `SCHEDULED/DUE/OVERDUE`, `IN_PROGRESS`, `PENDING_APPROVAL`, `COMPLETED`, `RECTIFY`; có checklist, vật tư sử dụng, lịch sử và hoãn. | DOCX chưa nêu chi tiết workflow thực. Cần xác nhận ai phân công/duyệt, Boong và Máy khác nhau thế nào, và quyền thực thi tại API. |
| Ký/duyệt kế hoạch cấp bộ phận/tàu/công ty | Chưa thấy luồng tương ứng mẫu | Có duyệt từng task và lưu người duyệt. | Tách duyệt kế hoạch/revision khỏi duyệt hoàn thành task; xác nhận có cần ba cấp và chữ ký điện tử hay chỉ xuất vị trí ký. |
| Đồng bộ tàu–bờ và theo tàu | Đáp ứng một phần | Shore có mapping sync cho asset, task, history, schedule, spare parts, checklist template, vật tư/kho/tồn; màn hình tàu nhúng PMS read-only. | Nghiệm thu đầy đủ field mới, quan hệ cha/con, retry và chống trùng; chi tiết checklist task, forms và status history cần kiểm tra riêng. Không suy ra đầy đủ chỉ vì có mapping. |
| SMS forms cho công việc | Đáp ứng một phần | Có đánh giá rủi ro, biên bản kiểm tra và PDF. | Công ty chưa cung cấp toàn bộ forms; chưa thể xác nhận đáp ứng mẫu SMS thực tế. |

## 4. Những điểm code cần xử lý trước khi nhập kế hoạch

### 4.1. Giữ dấu công việc tồn đọng

`MaintenanceSchedulerService.FixPastDueDatesInSchedules` đẩy `NextDueDate` quá khứ sang kỳ tương lai; controller cấu hình cũng có endpoint sửa hạn quá khứ. Khi đưa Last Time 2023–2025 vào hệ thống tại thời điểm hiện tại, cần giữ nguyên nghĩa lịch sử và quá hạn. Không được coi việc chưa làm là đã chuyển kỳ chỉ để tránh phát sinh OVERDUE.

Đề xuất: lưu lịch sử nhập riêng, giữ hạn gốc, xác định kỳ tồn đọng, chỉ chuyển kỳ khi hoàn thành/duyệt hoặc có quyết định điều chỉnh/hoãn có audit. Chốt quy tắc nghiệp vụ trước khi bật scheduler trên dữ liệu mới.

### 4.2. Quyền duyệt cần kiểm chứng phía backend

`TaskWorkflowController.VerifyTask` nhận người dùng và kiểm tra trạng thái/action, nhưng chưa thấy kiểm tra chức danh trực tiếp trong action; middleware session có thông tin role. Không coi việc ẩn nút frontend là đủ kiểm soát quyền. Cần kiểm tra policy toàn ứng dụng và bổ sung kiểm thử người không có quyền bị từ chối. Đây là việc cần xác minh, không phải kết luận về quyền truy cập của môi trường triển khai.

### 4.3. Không làm task ngay trong bước xem trước import

API tạo schedule hiện có logic tạo task đầu tiên. Luồng import mới cần staging và commit có kiểm soát, tách khỏi API tạo thủ công để không sinh hàng trăm task khi parser còn đang thử dữ liệu. Dữ liệu lịch sử không được đi qua workflow hoàn thành có trừ tồn kho.

### 4.4. Tránh thiếu dữ liệu khi lập báo cáo

Work Planning đang lấy tối đa 1.000 task mỗi lần. Với nhiều kỳ phát sinh từ 663 dòng ứng viên, đây không đủ làm nguồn báo cáo năm. View năm và export cần truy vấn theo tàu/bộ phận/năm ở backend và phân trang hoặc tổng hợp đầy đủ.

## 5. Kế hoạch theo thứ tự triển khai

Thứ tự: G0 → G1 → G2 → G3 → G4. Giai đoạn danh mục vật tư/kho có thể thực hiện trong lúc chuẩn hóa nguồn, nhưng chưa nạp số dư hoặc lịch sử thực tế khi chưa được xác nhận.

### G0 — Chốt dữ liệu và quy tắc nghiệp vụ

Đầu ra:

- Bảng chuẩn hóa từng dòng Excel với sheet, số dòng, nhóm cha, mã nguồn, tên thiết bị, mô tả, chu kỳ, Last Time, Plan và vấn đề cần xác nhận.
- Cây thiết bị dự kiến và bảng mapping mã nguồn → mã hệ thống; mã công việc tách với mã thiết bị.
- Danh sách nhóm Máy/Boong, chức danh chịu trách nhiệm và vai trò duyệt.
- Danh sách lỗi/ngoại lệ: font legacy, mã thiếu/lặp, ngày không đầy đủ, ký hiệu không phải ngày, khoảng giờ chạy, mô tả liên tiếp.

Tiêu chí hoàn tất: mỗi dòng ứng viên có kết quả “nhập”, “gộp”, “loại khỏi nghiệp vụ” hoặc “chờ xác nhận”, kèm lý do; không loại im lặng. Có người nghiệp vụ xác nhận các quy tắc ở mục 7.

### G1 — Hoàn thiện lịch bảo trì và baseline

Việc thực hiện:

1. Mở rộng schedule theo hướng `TriggerType` (calendar/running-hours/on-demand/docking/voyage), giá trị/đơn vị chu kỳ; hỗ trợ tháng/năm và khoảng giờ nếu đã chốt ý nghĩa. Đây là đề xuất thiết kế, chưa phải field đã có.
2. Giữ tương thích schedule cũ `IntervalDays` và `IntervalHours`; cập nhật đồng thời model, DTO, migration Edge/Shore, sync và frontend.
3. Cho phép luồng import nhập Last Time, baseline counter, hạn kế hoạch và mức chính xác ngày (ngày/tháng/năm); lưu giá trị nguồn. Ngày Plan do người quản lý phê duyệt phải được phân biệt với ngày dự báo từ giờ máy.
4. Làm rõ reset counter, thiết bị con dùng counter cha và trạng thái “thiếu baseline”; không mặc định giờ thực hiện lần trước bằng 0 hoặc giờ hiện tại.
5. Sửa/chốt chính sách quá hạn, giữ overdue backlog, chống sinh task trùng và đăng ký scheduler có kiểm soát.
6. Kiểm tra quyền API start/submit/verify/hoãn theo người thực hiện và vai trò được duyệt; kiểm tra ảnh hưởng của duyệt đối với tồn kho.

Tiêu chí nghiệm thu:

- M3, M12, Y2, 30 tháng ra hạn đúng lịch kể cả cuối tháng/năm nhuận; không quy đổi cố định tháng = 30 ngày.
- Lịch H4000 không đủ baseline được đánh dấu rõ; chỉ sinh/đánh dấu đến hạn theo counter hợp lệ. Dự báo ngày được ghi là dự báo.
- Task quá hạn chưa làm không biến thành kỳ tương lai sau restart hoặc sửa lịch.
- Bắt đầu/duyệt sai quyền bị API từ chối; retry scheduler/duyệt không tạo trùng hoặc trừ tồn lần hai.
- Schedule ngày/giờ cũ vẫn hoạt động với dữ liệu hiện có.

### G2 — Import KHBQBD và danh mục thực tế

Việc thực hiện:

1. Tạo luồng import kế hoạch riêng: đọc cả hai sheet, nhận diện header/nhóm, chuẩn hóa font có chọn lọc, diễn giải chu kỳ và ngày.
2. Màn hình preview hiển thị cây, lịch, Last Time, Plan, lỗi từng dòng và dữ liệu sẽ tạo/cập nhật. Không ghi DB trong preview.
3. Commit theo batch được xác nhận; có mapping và khóa chống trùng theo tàu + nguồn/nhóm + mã công việc chuẩn hóa. Lưu checksum/import batch, phiên bản parser và dòng nguồn để tra ngược.
4. Cho nhập lịch sử ban đầu theo đường riêng, không tự đánh dấu task hiện tại hoàn thành và không trừ tồn từ vật tư lịch sử.
5. Tận dụng import asset hiện có cho dữ liệu đã chuẩn hóa. Import hiện tại chỉ đọc sheet đầu, header chuẩn `AssetCode/AssetName/Category/...`, nên chưa thể nhận thẳng file KHBQBD.
6. Tạo cây kho mẫu từ DOCX; nhận danh mục phụ tùng thực, gán thiết bị và nạp số dư theo vị trí sau xác nhận nghiệp vụ.

Tiêu chí nghiệm thu:

- Cả Máy và Boong có đủ bản ghi được chấp nhận, kiểm tra được số dòng nhập/gộp/chờ; mọi dòng truy về nguồn được.
- Import lại cùng batch không tạo thiết bị/lịch/history/task trùng.
- Mã Boong `10.1` ở hai vị trí không bị ghi đè; hạng mục không có mã không bị mất.
- Plan 2027–2030 được giữ; dấu backtick không được nhập thành ngày.
- Dry dock, theo chuyến và khoảng H không bị tự đổi thành số ngày hoặc tự chọn một ngưỡng chưa được duyệt.

### G3 — Bảng năm, biểu mẫu và duyệt kế hoạch

Việc thực hiện:

- Bổ sung view Kế hoạch năm trong PMS hiện tại, lọc tàu/bộ phận/thiết bị/năm; các cột mã, tên, mô tả, chu kỳ gốc, Last Time, Plan, Jan–Dec.
- Tách planned/actual, ngày thực hiện và ngày duyệt. Nếu một công việc có nhiều lần làm trong tháng, giữ danh sách lần thực hiện hoặc drill-down, không ghi đè một ô.
- Xuất Excel/PDF có tên tàu, mã biểu mẫu M/B, revision, ngày lập/phát hành và vị trí ký như mẫu; giữ dữ liệu ngoài năm để tra cứu mà không ép vào cột năm hiện tại.
- Nếu công ty xác nhận cần duyệt điện tử: lập bản kế hoạch theo revision, lưu người/bộ phận ký và snapshot, không làm thay đổi nội dung bản đã duyệt khi schedule hiện tại được sửa.
- Giữ workflow duyệt hoàn thành task riêng biệt; không tự áp ba cấp ký kế hoạch thành ba cấp duyệt mọi task.

Tiêu chí nghiệm thu: người nghiệp vụ đối chiếu được một nhóm Máy và một nhóm Boong với Excel gốc; báo cáo phân biệt lịch sử, kế hoạch và thực tế; export không còn placeholder và không bị giới hạn 1.000 task.

### G4 — Đồng bộ, nghiệm thu tàu–bờ và đưa vào sử dụng

Việc thực hiện:

- Kiểm tra field/quan hệ mới ở Shore, lọc đúng BIENDONG STAR và quyền xem/duyệt nếu có.
- Nghiệm thu trên môi trường thử: nhập kế hoạch → phát sinh công việc → phân công → thực hiện/checklist/forms → gửi duyệt → approve/reject/hoãn → cập nhật kỳ tiếp và vật tư → sync Shore → báo cáo năm.
- Kiểm tra mất mạng/kết nối lại, retry batch, restart, lịch tháng/năm, counter thay đổi/reset và đồng bộ quan hệ cha/con.
- Chuyển dữ liệu có bản sao và phương án quay lại; hướng dẫn người dùng xử lý ngoại lệ import, công việc quá hạn và sửa revision.

Tiêu chí nghiệm thu: không mất task tồn đọng, không nhân đôi dữ liệu, không trừ tồn hai lần; bờ nhìn đúng tàu và trạng thái; báo cáo đúng mẫu được bộ phận Máy/Boong xác nhận.

## 6. Phạm vi code dự kiến thay đổi và bằng chứng hiện trạng

Các đường dẫn dưới đây tính từ file kế hoạch này; số dòng là mốc tại thời điểm đánh giá.

| Hạng mục | Code hiện tại / điểm mở rộng |
|---|---|
| Thiết bị, vật tư, kho, schedule | [EdgeModels.cs](../../edge_product/edge-services/Models/EdgeModels.cs:4826), [MaterialItem](../../edge_product/edge-services/Models/EdgeModels.cs:3519), [StoreLocation](../../edge_product/edge-services/Models/EdgeModels.cs:6001), [MaintenanceSchedule](../../edge_product/edge-services/Models/EdgeModels.cs:4966) |
| Import và cây thiết bị | [EquipmentAssetController.cs](../../edge_product/edge-services/Controllers/Maintenance/EquipmentAssetController.cs:209), [ImportAssetsModal.tsx](../../edge_product/frontend-edge/src/components/pms/ImportAssetsModal.tsx:40) |
| Vật tư liên kết thiết bị | [MaterialController.cs](../../edge_product/edge-services/Controllers/Inventory/MaterialController.cs:892) |
| Tạo lịch, baseline, tính hạn | [MaintenanceScheduleDto.cs](../../edge_product/edge-services/DTOs/MaintenanceScheduleDto.cs:78), [WorkItemConfigController.cs](../../edge_product/edge-services/Controllers/Maintenance/WorkItemConfigController.cs:480), [CalculateNextDueDate](../../edge_product/edge-services/Controllers/Maintenance/WorkItemConfigController.cs:1418) |
| Scheduler và xử lý quá hạn | [MaintenanceSchedulerService.cs](../../edge_product/edge-services/Services/Maintenance/MaintenanceSchedulerService.cs:152), [Program.cs](../../edge_product/edge-services/Program.cs:301), [FixPastDueDates endpoint](../../edge_product/edge-services/Controllers/Maintenance/WorkItemConfigController.cs:1481) |
| Workflow task/kỳ tiếp | [TaskWorkflowController.cs](../../edge_product/edge-services/Controllers/Maintenance/TaskWorkflowController.cs:294), [MaintenanceCompletionService.cs](../../edge_product/edge-services/Services/Maintenance/MaintenanceCompletionService.cs:602) |
| Forms bảo trì | [PmsFormsController.cs](../../edge_product/edge-services/Controllers/Maintenance/PmsFormsController.cs:37) |
| Work Planning và giới hạn tải | [WorkPlanningPage.tsx](../../edge_product/frontend-edge/src/pages/PMS/WorkPlanningPage.tsx:343) |
| Export còn placeholder | [MasterSchedulePage.tsx](../../edge_product/frontend-edge/src/pages/PMS/MasterSchedulePage.tsx:352) |
| Shore và sync PMS | [SyncInboxService.cs](../../shore_product/backend/Services/Sync/SyncInboxService.cs:231), [MaintenanceSchedulesController.cs](../../shore_product/backend/Controllers/Pms/MaintenanceSchedulesController.cs:14), [MaintenanceTasksController.cs](../../shore_product/backend/Controllers/Pms/MaintenanceTasksController.cs:25) |

Các chức năng nên tái sử dụng: Assets, Material, Store Locations, Inventory, Work Planning, Work Report, checklist/forms, task workflow và sync hiện tại. Không đưa việc xóa toàn bộ API maintenance hoặc xây lại PMS vào kế hoạch.

## 7. Các quyết định nghiệp vụ cần xác nhận trước phần triển khai phụ thuộc

1. Mã nhóm/thiết bị chính thức theo DOCX (100/200/210...) hay giữ cấu trúc Excel (A001 và các nhóm Boong)? Đề xuất giữ mã nguồn và có mã chuẩn hóa riêng, không bỏ dấu truy ngược.
2. Lịch theo tháng/năm cố định theo kỳ kế hoạch hay cộng từ ngày thực hiện thực tế? Ai được đổi Plan và có cần duyệt không?
3. `H8000-12000`/`H2000-3000` mang nghĩa gì; lấy giờ máy tại lần thực hiện trước từ nguồn nào; thiết bị con dùng counter của máy nào?
4. `Dry dock`/`Docking` dựa trên đợt lên đà nào; “chuyến” là mỗi chuyến hay thời điểm kết thúc chuyến; ai kích hoạt và hủy sự kiện?
5. Với lịch sử chỉ biết tháng/năm, cần lưu độ chính xác hay có ngày quy ước được nghiệp vụ cho phép? Không tự giả định đã hoàn thành ngày đầu tháng.
6. Ba vị trí ký trong mẫu là ký bản kế hoạch, ký báo cáo thực hiện hay cả hai? Công ty có cần ký điện tử theo thứ tự hay chỉ cần xuất mẫu in?
7. Đại phó/Máy trưởng/Thuyền trưởng phân công và duyệt task thế nào; Shore chỉ xem hay được điều chỉnh/duyệt kế hoạch?
8. Cung cấp danh mục vật tư, số dư kho và SMS forms thực tế: hai tài liệu hiện tại chưa đủ để xác nhận các dữ liệu này.
9. Có màu/định dạng ô Excel mang ý nghĩa kế hoạch hoặc hoàn thành ngoài nội dung ô không?

Các câu hỏi này là danh sách đầu vào cho G0. Có thể tiếp tục chuẩn hóa dữ liệu và kiểm tra code trong khi chờ; không tự quyết định thay công ty các quy tắc ảnh hưởng hạn bảo trì hoặc lịch sử.
