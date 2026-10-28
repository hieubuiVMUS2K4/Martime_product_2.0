# Import Job theo biểu mẫu BQBD — 29/10/2026

## Phạm vi người dùng đã xác nhận

Dùng file kế hoạch BIENDONG làm bố cục tham khảo và biến tấu thành danh mục Job mẫu. Không nhập kế hoạch tháng thành WO, không tự phát hành WO và không coi dấu/ngày trong Excel là báo cáo hoàn thành. Việc chưa hoàn tất tiếp tục được theo dõi bằng WO, không nhân bản Job mỗi tháng.

## Mẫu tải xuống

- Nút Tải mẫu sử dụng file đã định dạng `public/templates/Mau_Job_BQBD.xlsx`.
- Hai sheet Máy/Boong giữ bố cục tiêu đề, bộ phận và nhóm thiết bị; tham chiếu BIENDONG-SP10-02/M và /B đúng file nguồn.
- Cột: STT, Mã công việc, Mã nguồn, Mã thiết bị, Tên thiết bị, Nội dung bảo dưỡng, Loại bảo trì, Chu kỳ, Ưu tiên, Hướng dẫn, Ghi chú.
- Bỏ Lần trước, lịch sử thực hiện và 12 cột ngày thực hiện. Không có mốc ban đầu/hạn tiếp theo/tự động phát hành trong mẫu.
- Có danh sách chọn loại/ưu tiên, tiêu đề cố định và dòng ví dụ được ghi rõ cần thay/xóa. Mã thiết bị ví dụ là placeholder, cần thay bằng mã thiết bị cụ thể đang có.
- Chu kỳ hỗ trợ M3, Y1, D7, H1000, M3/H1000; ba loại thủ công không điền chu kỳ. Sau import bổ sung trách nhiệm/checklist và mốc cho Job Định kỳ trong hệ thống.

## Bộ đọc và xác thực

- Đọc mẫu mới có phần tiêu đề/nhóm, mẫu kỹ thuật Maintenance cũ và file BIENDONG gốc ở cả hai sheet.
- Nhận dạng hàng tiêu đề thay vì mặc định dòng 1; không nhập các hàng nhóm/chữ ký/footer thành Job.
- Đọc TCVN3 của file gốc, giữ văn bản Unicode của mẫu mới. Mô tả dài nguồn được giữ đầy đủ trong Hướng dẫn, tên Job tối đa 200 ký tự.
- Code của file gốc là mã công việc nguồn, không phải mã thiết bị. Mã Job khi đọc nguyên bản được tạo ổn định theo năm/sheet/dòng nguồn để tránh mã nguồn lặp ở các nhóm. Không đổi mã ngẫu nhiên để né dữ liệu đã tồn tại.
- Có mã thiết bị thì dùng mã; tên đối chiếu nếu điền phải khớp. Thiếu mã thì tìm tên duy nhất trong danh mục đang hoạt động, kết hợp nhóm cha khi có thể xác định chắc chắn. Không tự tạo thiết bị và không chọn ngẫu nhiên khi tên trùng.
- Khoảng H8000-12000, chu kỳ thiếu/không rõ, loại không hợp lệ hoặc mã/tên không khớp được báo lỗi và khóa nhập; không lấy cận dưới làm chu kỳ.
- Các cột Lần trước/ngày thực hiện của nguyên bản không đi vào payload. File kỹ thuật cũ có các cột mốc/lịch sử bị từ chối như trước.
- Xem trước có sheet và số dòng thực, tên/mã thiết bị, loại/chu kỳ/bộ phận và lỗi gộp theo dòng. Metadata xem trước không gửi thành trường lạ trong API.
- API nhập hiện có tiếp tục kiểm tra lại và ghi nguyên tử; không thay backend/schema/dữ liệu vận hành trong đợt này.

## Xác minh

- 15 test frontend đạt: mẫu cũ/mới, cả hai bộ phận, bốn loại bảo trì, chu kỳ HYBRID, TCVN3/Unicode, nguồn có mã lặp, không nhập lịch sử, tên trùng/nhóm cha, mã-tên không khớp và payload sạch.
- Đọc nguyên bản đủ 680 công việc: 626 Định kỳ, 36 Lên đà, 14 Theo yêu cầu, 4 Theo chuyến; khớp bản tách trước. Mẫu mới đọc lại được 7 dòng ví dụ với đủ loại, không lỗi cú pháp.
- Thử trên popup với danh mục tàu hiện tại: 70 dòng nguồn cần kiểm tra, nút nhập bị khóa; không nhập Job thật.
- Nút tải mẫu đã tải được file; SHA256 file tải về khớp file trong public/templates.
- Artifact Tool dựng mẫu, kiểm tra giá trị/lỗi công thức và render cả sheet Máy/Boong để kiểm tra trực quan. File nguồn giữ nguyên.
- Log build/test trong artifacts/pms-bqbd-*.log. Mẫu bàn giao ở outputs/pms-job-bqbd-20261028/Mau_Job_BQBD.xlsx; thư mục authoring/preview được loại khỏi Git, chỉ mẫu ứng dụng và mã nguồn được theo dõi.

Chưa push các thay đổi này.
