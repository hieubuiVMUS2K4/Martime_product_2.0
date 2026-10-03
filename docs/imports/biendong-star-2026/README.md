# Tách kế hoạch BIENDONG STAR 2026

Nguồn: Copy of KHBQBD 2026 Biendong star - .xls, gồm May BD.star 2026 và BOONG BD STAR 2026. Chưa nhập dữ liệu vào database tàu.

- BIENDONG_STAR_2026_Thiet_bi.xlsx: sheet Equipment theo cột mẫu import hiện có (AssetCode, AssetName, Category, ParentAssetCode). 662 thiết bị và 91 tiêu đề/nhóm, gồm hai nhóm gốc Máy/Boong. Các nhóm cần được người dùng gán người phụ trách sau khi import.
- BIENDONG_STAR_2026_Cong_viec_bao_tri.xlsx: 680 công việc. WorkCode giữ nguyên mã công việc nguồn, AssetCode liên kết file thiết bị. ScheduleCode là khóa import riêng theo sheet/dòng; không dùng mã công việc nguồn làm mã thiết bị.
- 626 công việc định kỳ; 36 lên đà; 14 theo yêu cầu/khi cần; 4 theo chuyến. As need/As request cùng loại ON_DEMAND, giữ OriginalFrequency để phân biệt nội dung nguồn.
- Sheet Can_ra_soat chứa 54 dòng cần kiểm tra: thiếu mã/chu kỳ, khoảng giờ chạy hoặc mô tả chưa đầy đủ. Khoảng giờ không được tự chuyển thành một chu kỳ. Tháng/năm giữ bằng IntervalMonths/IntervalYears, chưa quy đổi thành ngày.
- Các trường Original... cùng sheet Nguon_goc lưu nội dung trước khi chuyển font TCVN3; giữ các từ Unicode trong ô hỗn hợp. Mô tả nối giữa các dòng, Như trên và lỗi chính tả nguồn cần được duyệt lại, không suy diễn nội dung kỹ thuật.
- LastExecutedAt chuyển từ ngày Excel; LastExecutedRunningHours để trống vì nguồn không cho giờ máy tại lần bảo trì. Plan và MonthlyMarks giữ nguyên, chưa tạo lịch sử hoàn thành từ các dấu tháng.
- AutoGenerate=false cho toàn bộ danh sách công việc để không phát sinh hàng loạt công việc chưa được duyệt.

Đã bổ sung **Import Excel** tại trang **Danh sách công việc** trên Edge. Bộ import đọc sheet Maintenance, kiểm tra toàn bộ file trước khi nhập. AssetCode phải tồn tại và là thiết bị thật; ScheduleCode phải duy nhất. Nếu có lỗi thì chưa nhập dòng nào, không ghi đè cấu hình đã có. Chu kỳ tháng/năm được lưu riêng và tính bằng lịch thực tế, không quy đổi sang 30/365 ngày.

File đầy đủ có các dòng Review và khoảng giờ cần được người dùng rà soát trước khi import. Bộ import sẽ báo lỗi các dòng này, không tự đoán chu kỳ.

## Mẫu 10 thiết bị

- **BIENDONG_STAR_2026_Cong_viec_bao_tri_10_thiet_bi.xlsx**: 10 thiết bị, 10 công việc có đủ 3 theo tháng, 1 theo năm, 3 theo giờ, 1 lên đà, 1 theo yêu cầu và 1 theo chuyến. Chọn các dòng rõ thông tin từ nguồn, không tự tạo công việc.
- **BIENDONG_STAR_2026_Thiet_bi_mau_10.xlsx**: 10 thiết bị và 6 nhóm cha, dùng đúng AssetCode của file công việc mẫu.

Nếu chưa có thiết bị: nhập file thiết bị mẫu trong Quản lý thiết bị trước, rồi nhập file công việc tại Danh sách công việc → Import Excel. Có thể tải mẫu chung trong popup import. Sau khi nhập, các cấu hình nằm trong tab Cấu hình; AutoGenerate=false để người dùng rà soát người phụ trách, checklist và ngày/giờ thực hiện gần nhất trước khi bật sinh việc. Để trống ngày/giờ lần cuối thì hệ thống lấy ngày/giờ hiện tại làm mốc, không coi dữ liệu nguồn là lịch sử đã hoàn thành.

Code có migration thêm IntervalMonths, IntervalYears và WorkCode trên Edge và Shore để giữ dữ liệu khi đồng bộ cấu hình. Cần triển khai backend và migration mới trước khi sử dụng import; chưa chạy migration hay nhập file trên database thật.

Các loại DRY_DOCK, ON_DEMAND và VOYAGE được bổ sung vào cấu hình công việc Edge. Chúng không yêu cầu chu kỳ ngày/giờ, không tự sinh lịch định kỳ hoặc tự đánh dấu đến hạn. Chưa triển khai cơ chế tự kích hoạt theo sự kiện lên đà/chuyến/yêu cầu.

Tạo lại file:

    node scripts/pms/extract-biendong-plan.cjs "<đường dẫn file .xls>"

    node scripts/pms/create-biendong-sample.cjs

Đã kiểm tra giới hạn cột import thiết bị và toàn bộ liên kết AssetCode/ParentAssetCode. Chưa push các thay đổi của bước này.

Kiểm tra bước import: build frontend Edge và backend Edge/Shore đạt; 51 kiểm thử Edge và 10 kiểm thử Shore trên PostgreSQL riêng đạt. Bao gồm nhập nguyên file hoặc không nhập dòng nào, chặn nhập trùng, tính tháng/năm và năm nhuận, chuyển giờ sang tháng không giữ chu kỳ cũ, và nhận đồng bộ giữ WorkCode/IntervalMonths. Database kiểm thử đã được dọn; chưa thay đổi dữ liệu thật.
