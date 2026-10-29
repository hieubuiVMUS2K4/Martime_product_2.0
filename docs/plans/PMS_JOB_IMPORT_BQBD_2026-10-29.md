# Import Job theo biểu mẫu BQBD — 29/10/2026

## Phạm vi người dùng đã xác nhận

Dùng file kế hoạch BIENDONG làm bố cục tham khảo và biến tấu thành danh mục Job mẫu. Không nhập kế hoạch tháng thành WO, không tự phát hành WO và không coi dấu/ngày trong Excel là báo cáo hoàn thành. Việc chưa hoàn tất tiếp tục được theo dõi bằng WO, không nhân bản Job mỗi tháng.

## Mẫu tải xuống

- Nút Tải mẫu sử dụng bố cục `public/templates/Mau_Job_BQBD.xlsx`, rồi điền danh mục thiết bị mới nhất qua API tại thời điểm tải.
- Hai sheet Máy/Boong giữ bố cục tiêu đề, bộ phận và nhóm thiết bị; tham chiếu BIENDONG-SP10-02/M và /B đúng file nguồn.
- Cột: STT, Mã công việc, Mã nguồn, Mã thiết bị, Tên thiết bị, Nội dung bảo dưỡng, Loại bảo trì, Chu kỳ, Ưu tiên, Hướng dẫn, Ghi chú, Mốc bắt đầu (giờ tàu).
- Bỏ Lần trước, lịch sử thực hiện và 12 cột ngày thực hiện. Không nhập counter mốc/hạn tiếp theo/tự động phát hành trong mẫu.
- Mốc bắt đầu theo lịch là tùy chọn cho Định kỳ CALENDAR/HYBRID. Nhận ngày Excel (kể cả workbook hệ 1904) hoặc dd/MM/yyyy [HH:mm], yyyy-MM-dd [HH:mm]; thiếu giờ hiểu là 00:00. Quy đổi theo múi giờ tàu, không dùng múi giờ máy tính. Ngày sai hoặc điền cho loại không phù hợp được báo lỗi theo dòng.
- Mốc đi vào BaselineAt cùng nguồn "Import Excel", không đi vào LastExecutedAt hoặc lịch sử. Hạn đầu tính từ mốc cộng chu kỳ theo logic Job hiện tại. HYBRID vẫn cần counter mốc riêng để đủ thông tin; không tự lấy counter hiện tại làm mốc.
- Toàn bộ mẫu dùng nền trắng, chữ đen và đường kẻ mảnh theo biểu mẫu nguồn; không dùng các khối màu trang trí.
- Bốn sheet: Máy, Boong, Danh_muc_thiet_bi và Huong_dan. Hai sheet phụ chỉ để đối chiếu/hướng dẫn, không được nhập thành Job.
- Danh_muc_thiet_bi có toàn bộ mã/tên thiết bị, đường dẫn nhóm cha, loại, trạng thái và khả năng dùng cho Job. Nhóm hoặc thiết bị ngừng sử dụng vẫn xuất hiện để đối chiếu.
- Ô Mã thiết bị có danh sách chọn từ thiết bị cụ thể đang sử dụng (không phải SYSTEM hoặc DECOMMISSIONED), thông qua vùng tên MaThietBiChoJob. Không có mã thiết bị ví dụ giả. Tên thiết bị được phép để trống khi đã chọn mã đúng.
- Huong_dan giải thích từng cột, cách lấy mã từ danh mục, phân biệt mã Job/mã nguồn/mã thiết bị, bốn loại bảo trì, chu kỳ, cách thêm dòng và các bước sau import.
- Có danh sách chọn loại/ưu tiên, tiêu đề cố định và dòng ví dụ được ghi rõ cần thay/xóa. Sao chép dòng trống có sẵn để mở rộng bảng và giữ danh sách chọn.
- Chu kỳ hỗ trợ M3, Y1, D7, H1000, M3/H1000; ba loại thủ công không điền chu kỳ hoặc mốc lịch. Sau import bổ sung trách nhiệm/checklist và các mốc còn thiếu trong hệ thống. AutoGenerate vẫn tắt, không phát hành WO trong import.

## Bộ đọc và xác thực

- Đọc mẫu mới có phần tiêu đề/nhóm, mẫu kỹ thuật Maintenance cũ và file BIENDONG gốc ở cả hai sheet.
- Nhận dạng hàng tiêu đề thay vì mặc định dòng 1; không nhập các hàng nhóm/chữ ký/footer thành Job.
- Đọc TCVN3 của file gốc, giữ văn bản Unicode của mẫu mới. Mô tả dài nguồn được giữ đầy đủ trong Hướng dẫn, tên Job tối đa 200 ký tự.
- Code của file gốc là mã công việc nguồn, không phải mã thiết bị. Mã Job khi đọc nguyên bản được tạo ổn định theo năm/sheet/dòng nguồn để tránh mã nguồn lặp ở các nhóm. Không đổi mã ngẫu nhiên để né dữ liệu đã tồn tại.
- Có mã thiết bị thì dùng mã; tên đối chiếu nếu điền phải khớp. Thiếu mã thì tìm tên duy nhất trong danh mục đang hoạt động, kết hợp nhóm cha khi có thể xác định chắc chắn. Không tự tạo thiết bị và không chọn ngẫu nhiên khi tên trùng.
- Khoảng H8000-12000, chu kỳ thiếu/không rõ, loại không hợp lệ hoặc mã/tên không khớp được báo lỗi và khóa nhập; không lấy cận dưới làm chu kỳ.
- Các cột Lần trước/ngày thực hiện của nguyên bản không đi vào payload và không được đoán thành mốc. File kỹ thuật cũ được nhận BaselineAt theo giờ tàu, tiếp tục từ chối lịch sử/counter mốc/hạn tiếp theo.
- Xem trước có sheet và số dòng thực, tên/mã thiết bị, loại/chu kỳ/bộ phận và lỗi gộp theo dòng. Metadata xem trước không gửi thành trường lạ trong API.
- API nhập hiện có tiếp tục kiểm tra lại và ghi nguyên tử. API chỉ đọc GET /api/pms/jobs/import-equipment lấy toàn bộ danh mục không phân trang; dùng quyền import Job, không yêu cầu quyền WO. Không thay schema hoặc dữ liệu vận hành.

## Xác minh

- 17 test frontend đạt: workbook đủ bốn sheet, danh mục/vùng chọn mã, sheet phụ không nhập thành Job; mốc lịch dạng ngày Excel (1900/1904), chuỗi ngày/giờ tàu, mốc trống, ngày sai, loại không phù hợp, HYBRID và payload giữ đúng BaselineAt.
- Đọc nguyên bản đủ 680 công việc: 626 Định kỳ, 36 Lên đà, 14 Theo yêu cầu, 4 Theo chuyến; khớp bản tách trước. Mẫu mới đọc lại được 7 dòng ví dụ với đủ loại, không lỗi cú pháp.
- Thử trên popup với danh mục tàu hiện tại: 70 dòng nguồn cần kiểm tra, nút nhập bị khóa; không nhập Job thật.
- File tải về được điền danh mục nên không còn so SHA256 với bản khung tĩnh. Kiểm tra đọc lại workbook, số dòng danh mục và vùng chọn mã; lỗi tải API hoặc không có thiết bị hợp lệ phải báo lỗi thay vì cung cấp danh mục giả/rỗng.
- Artifact Tool dựng mẫu, kiểm tra giá trị/lỗi công thức và render cả sheet Máy/Boong để kiểm tra trực quan. File nguồn giữ nguyên.
- Bổ sung 2 kiểm tra backend đạt: dữ liệu đối chiếu chứa cả nhóm/thiết bị ngừng dùng mà không phát sinh ghi dữ liệu/outbox, và API được nối với quyền import Job.
- Kiểm tra backend mở rộng cho mốc lịch: preview chỉ đọc, lưu mốc và nguồn, tính hạn cuối tháng, giữ HYBRID thiếu counter ở trạng thái cần bổ sung, không tạo WO/lịch sử, từ chối mốc sai loại hoặc thiếu múi giờ; giữ các kiểm tra import nguyên tử/xóa mềm và chặn cột lịch sử/tự động phát hành.
- Tải thử thực tế bằng tài khoản chức danh có quyền import thành công: đủ 4 sheet, 760 dòng danh mục và 662 mã thiết bị hợp lệ trong vùng chọn MaThietBiChoJob. File đầy đủ ở outputs/pms-job-bqbd-20261028/Mau_Job_BQBD_co_danh_muc.xlsx. Build frontend đạt.
- Log build/test trong artifacts/pms-bqbd-*.log. Mẫu bàn giao ở outputs/pms-job-bqbd-20261028/Mau_Job_BQBD.xlsx; thư mục authoring/preview được loại khỏi Git, chỉ mẫu ứng dụng và mã nguồn được theo dõi.

Chưa push các thay đổi này.

## Kiểm thử trực tiếp trên giao diện tàu — 29/10/2026

- Tạo file riêng gồm 8 Job trên hai sheet Máy/Boong, mã QA-IMP-291026-01 đến 08; dùng thiết bị thật BD26-E0003. Không sửa thiết bị/counter hoặc các Job đang vận hành.
- File có ngày 31/02/2027: báo lỗi đúng dòng, khóa nút nhập, chưa tạo Job nào. Sửa cùng file thành ngày hợp lệ: đủ 8 dòng hợp lệ.
- Import thành công: mốc Excel dạng số và chuỗi đều hiển thị 31/01/2027 09:30 theo giờ tàu. CALENDAR M3 tính hạn 30/04/2027 09:30, D7 tính hạn 07/02/2027 09:30. Đối chiếu DB lưu UTC 02:30 và vẫn giữ đúng giờ sau khi tải lại/mở form sửa; nguồn mốc là Import Excel.
- CALENDAR để trống mốc, RUNNING_HOURS chưa có counter mốc và HYBRID chỉ có mốc lịch đều ở NEEDS_INFORMATION; ba loại thủ công ở ACTIVE nhưng chờ phát hành WO. Cả 8 Job có AutoGenerate=false, không có lần hoàn tất/giờ chạy lần cuối và không sinh WO.
- Chọn lại cùng file sau import: chặn cả 8 mã trùng, không ghi đè và không nhân đôi.
- Dọn bằng xóa hàng loạt qua giao diện: đúng 8 Job thử chuyển REMOVED/is_active=false. DB xác nhận 8/8 đã xóa mềm, 0 WO liên quan. Xóa file Excel thử khỏi ổ đĩa; danh sách trở về đúng testing1/testing2/testing3 như trước. Không xóa cứng nhật ký hoặc bản ghi xóa mềm.
