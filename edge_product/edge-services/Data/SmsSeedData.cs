using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Models;

namespace MaritimeEdge.Data
{
    public static class SmsSeedData
    {
        public static async Task SeedAsync(EdgeDbContext context, bool includeSampleProcedures = false)
        {
            // 1. Seed ISM Elements
            if (!await context.IsmElements.AnyAsync())
            {
                var elements = new List<IsmElement>
                {
                    new IsmElement { Id = 1, ChapterName = "Chính sách & Tổ chức (Policy & Organisation)" },
                    new IsmElement { Id = 2, ChapterName = "Quyền hạn & Trách nhiệm của Công ty (Company Responsibility & Authority)" },
                    new IsmElement { Id = 3, ChapterName = "Người được chỉ định - DPA (Designated Persons)" },
                    new IsmElement { Id = 4, ChapterName = "Quyền hạn & Trách nhiệm của Thuyền trưởng (Master's Responsibility & Authority)" },
                    new IsmElement { Id = 5, ChapterName = "Nguồn lực & Nhân sự (Resources & Personnel)" },
                    new IsmElement { Id = 6, ChapterName = "Làm quen & Huấn luyện (Crew Familiarization & Training)" },
                    new IsmElement { Id = 7, ChapterName = "Hoạt động trên tàu (Shipboard Operations)" },
                    new IsmElement { Id = 8, ChapterName = "Chuẩn bị tình huống khẩn cấp (Emergency Preparedness)" },
                    new IsmElement { Id = 9, ChapterName = "Báo cáo & Phân tích Sự cố (Reports & Analysis)" },
                    new IsmElement { Id = 10, ChapterName = "Bảo dưỡng tàu & Thiết bị (Maintenance)" },
                    new IsmElement { Id = 11, ChapterName = "Kiểm soát Tài liệu & Dữ liệu (Document Control)" },
                    new IsmElement { Id = 12, ChapterName = "Đánh giá của Công ty (Company Verification & Evaluation)" },
                    new IsmElement { Id = 13, ChapterName = "Đánh giá & Cấp chứng nhận (Certification & Periodical Verification)" },
                    new IsmElement { Id = 14, ChapterName = "An ninh tàu biển (Ship Security)" },
                    new IsmElement { Id = 15, ChapterName = "Kiểm tra môi trường (Environmental Protection)" },
                    new IsmElement { Id = 16, ChapterName = "Hướng dẫn kỹ thuật (Technical Instructions)" }
                };

                await context.IsmElements.AddRangeAsync(elements);
                await context.SaveChangesAsync();
            }

            // Procedures and templates are owned by Shore, including deletions.
            if (!includeSampleProcedures) return;

            // 2. Seed Procedures and Form Templates
            if (!await context.SmsProcedures.AnyAsync())
            {
                // Clause 1-5
                var proc1 = new SmsProcedure
                {
                    Id = Guid.NewGuid(),
                    IsmElementId = 1,
                    ProcedureCode = "SOP-01-01",
                    Title = "Chính sách An toàn và Bảo vệ Môi trường (Safety & Environmental Protection Policy)",
                    Content = "<h3>1. MỤC TIÊU</h3><p>Công ty cam kết đảm bảo an toàn trên biển, ngăn ngừa chấn thương cho con người, tránh tổn thất về tính mạng, tài sản và ngăn ngừa ô nhiễm môi trường biển.</p><h3>2. TRÁCH NHIỆM CỦA THUYỀN VIÊN</h3><p>Tất cả thuyền viên có trách nhiệm hiểu rõ, ký cam kết tuân thủ chính sách an toàn của công ty, và báo cáo kịp thời mọi tình huống không an toàn cho Thuyền trưởng hoặc DPA.</p>",
                    Version = "Rev 1.0",
                    PublishDate = DateTime.UtcNow.AddMonths(-6),
                    Status = "Active",
                    WatermarkText = "TÀI LIỆU ĐƯỢC KIỂM SOÁT"
                };
                proc1.FormTemplates.Add(new SmsFormTemplate
                {
                    Id = Guid.NewGuid(),
                    FormCode = "BM-01",
                    Title = "Bản cam kết tuân thủ chính sách của Thuyền viên (Crew Acknowledgment Form)",
                    ContentSchema = @"[
                        {""id"": ""crew_name"", ""label"": ""Họ và tên thuyền viên / Crew Name"", ""type"": ""text"", ""required"": true},
                        {""id"": ""crew_rank"", ""label"": ""Chức danh / Rank"", ""type"": ""text"", ""required"": true},
                        {""id"": ""ack_date"", ""label"": ""Ngày cam kết / Date"", ""type"": ""date"", ""required"": true},
                        {""id"": ""statement"", ""label"": ""Nội dung cam kết"", ""type"": ""info"", ""value"": ""Tôi xác nhận đã đọc, hiểu rõ và cam kết tuân thủ nghiêm túc Chính sách An toàn & Bảo vệ Môi trường của công ty.""}
                    ]"
                });

                // Clause 6
                var proc2 = new SmsProcedure
                {
                    Id = Guid.NewGuid(),
                    IsmElementId = 6,
                    ProcedureCode = "SOP-06-01",
                    Title = "Quy trình Huấn luyện Làm quen Tàu (Vessel Familiarization Procedure)",
                    Content = "<h3>1. QUY ĐỊNH CHUNG</h3><p>Mọi thuyền viên khi mới xuống tàu, trước khi nhận ca hoặc thực hiện bất kỳ nhiệm vụ nào, phải được hướng dẫn làm quen về an toàn, cứu sinh, cứu hỏa trong vòng 24 giờ đầu tiên.</p><h3>2. CÁC HẠNG MỤC CẦN KIỂM TRA</h3><p>Hướng dẫn sử dụng áo phao, vị trí xuồng cứu sinh, nút dừng khẩn cấp buồng máy, và báo động khẩn cấp.</p>",
                    Version = "Rev 1.0",
                    PublishDate = DateTime.UtcNow.AddMonths(-4),
                    Status = "Active",
                    WatermarkText = "TÀI LIỆU ĐƯỢC KIỂM SOÁT"
                };
                proc2.FormTemplates.Add(new SmsFormTemplate
                {
                    Id = Guid.NewGuid(),
                    FormCode = "BM-06-02",
                    Title = "Checklist làm quen an toàn cho thuyền viên mới (Familiarization Checklist)",
                    ContentSchema = @"[
                        {""id"": ""crew_name"", ""label"": ""Tên thuyền viên mới / Seafarer Name"", ""type"": ""text"", ""required"": true},
                        {""id"": ""crew_rank"", ""label"": ""Chức danh / Rank"", ""type"": ""text"", ""required"": true},
                        {""id"": ""instructor"", ""label"": ""Người hướng dẫn / Instructor"", ""type"": ""text"", ""required"": true},
                        {""id"": ""check_lifejacket"", ""label"": ""Đã biết vị trí và cách mặc áo phao, phao cứu sinh?"", ""type"": ""checkbox"", ""required"": true},
                        {""id"": ""check_muster"", ""label"": ""Đã biết vị trí tập trung Muster Station và nhiệm vụ trong Muster List?"", ""type"": ""checkbox"", ""required"": true},
                        {""id"": ""check_escapes"", ""label"": ""Đã nắm rõ các lối thoát hiểm khẩn cấp trong khu vực sinh hoạt và buồng máy?"", ""type"": ""checkbox"", ""required"": true},
                        {""id"": ""check_extinguisher"", ""label"": ""Đã biết vị trí các bình chữa cháy và nút ấn báo cháy gần nhất?"", ""type"": ""checkbox"", ""required"": true}
                    ]"
                });

                // Clause 7
                var proc3 = new SmsProcedure
                {
                    Id = Guid.NewGuid(),
                    IsmElementId = 7,
                    ProcedureCode = "SOP-07-05",
                    Title = "Quy trình Vào Không gian kín An toàn (Enclosed Space Entry SOP)",
                    Content = "<h3>1. ĐỊNH NGHĨA</h3><p>Không gian kín bao gồm hầm hàng, két nước ballast, két dầu, hộp xích neo, đường hầm ống, hoặc bất kỳ khu vực nào có giới hạn lối ra vào và nguy cơ tích tụ khí độc hoặc thiếu Oxy.</p><h3>2. CÁC ĐIỀU KIỆN ĐỂ CẤP PHÉP</h3><p>1. Đo khí: Oxy > 20.6%, LEL < 1%, CO < 25 ppm, H2S < 10 ppm.<br/>2. Thông gió cưỡng bức liên tục ít nhất 24 giờ.<br/>3. Bố trí người trực cảnh giới tại lối vào hầm hàng, có trang bị bộ đàm và thiết bị cứu hộ sẵn sàng.</p>",
                    Version = "Rev 1.0",
                    PublishDate = DateTime.UtcNow.AddMonths(-3),
                    Status = "Active",
                    WatermarkText = "TÀI LIỆU ĐƯỢC KIỂM SOÁT"
                };
                proc3.FormTemplates.Add(new SmsFormTemplate
                {
                    Id = Guid.NewGuid(),
                    FormCode = "BM-07-03",
                    Title = "Giấy phép vào không gian kín (Enclosed Space Entry PTW)",
                    ContentSchema = @"[
                        {""id"": ""location"", ""label"": ""Vị trí không gian kín cần vào / Entry Location"", ""type"": ""text"", ""required"": true},
                        {""id"": ""purpose"", ""label"": ""Mục đích vào hầm / Purpose of Entry"", ""type"": ""text"", ""required"": true},
                        {""id"": ""gas_o2"", ""label"": ""Nồng độ Oxy (O2) % (Yêu cầu > 20.6%)"", ""type"": ""number"", ""required"": true},
                        {""id"": ""gas_lel"", ""label"": ""Nồng độ khí cháy (LEL) % (Yêu cầu < 1%)"", ""type"": ""number"", ""required"": true},
                        {""id"": ""gas_co"", ""label"": ""Carbon Monoxide (CO) ppm (Yêu cầu < 25 ppm)"", ""type"": ""number"", ""required"": true},
                        {""id"": ""gas_h2s"", ""label"": ""Hydrogen Sulfide (H2S) ppm (Yêu cầu < 10 ppm)"", ""type"": ""number"", ""required"": true},
                        {""id"": ""chk_ventilated"", ""label"": ""Không gian đã được thông gió cưỡng bức?"", ""type"": ""checkbox"", ""required"": true},
                        {""id"": ""chk_loto"", ""label"": ""Van và thiết bị chấp hành đã được khóa và gắn thẻ cô lập (LOTO)?"", ""type"": ""checkbox"", ""required"": true},
                        {""id"": ""chk_watchkeeper"", ""label"": ""Đã bố trí Thủy thủ cảnh giới chuyên trách túc trực ngoài cửa hầm?"", ""type"": ""checkbox"", ""required"": true},
                        {""id"": ""chk_communication"", ""label"": ""Thử bộ đàm thông suốt mỗi 10 phút?"", ""type"": ""checkbox"", ""required"": true}
                    ]"
                });

                // Clause 8
                var proc4 = new SmsProcedure
                {
                    Id = Guid.NewGuid(),
                    IsmElementId = 8,
                    ProcedureCode = "SOP-08-01",
                    Title = "Quy trình Thực tập và Ứng phó Tình huống khẩn cấp (Emergency Drills Procedure)",
                    Content = "<h3>1. YÊU CẦU THỰC TẬP</h3><p>Thực tập cứu hỏa và cứu sinh phải được tiến hành hàng tháng dưới tàu theo quy định của SOLAS và ISM Code. Mỗi buổi thực tập phải được ghi nhận chi tiết về thời gian báo động, triển khai đội hình, và rút kinh nghiệm.</p><h3>2. ĐÁNH GIÁ THỰC TẬP</h3><p>Thuyền trưởng chịu trách nhiệm giám sát buổi thực tập và lập báo cáo gửi về văn phòng DPA.</p>",
                    Version = "Rev 1.0",
                    PublishDate = DateTime.UtcNow.AddMonths(-2),
                    Status = "Active",
                    WatermarkText = "TÀI LIỆU ĐƯỢC KIỂM SOÁT"
                };
                proc4.FormTemplates.Add(new SmsFormTemplate
                {
                    Id = Guid.NewGuid(),
                    FormCode = "BM-08-01",
                    Title = "Báo cáo thực tập cứu hỏa / cứu sinh (Drill Report)",
                    ContentSchema = @"[
                        {""id"": ""drill_type"", ""label"": ""Loại thực tập / Drill Type"", ""type"": ""select"", ""options"": [""Cứu hỏa / Fire Drill"", ""Cứu sinh / Abandon Ship Drill"", ""Sự cố tràn dầu / SOPEP Drill"", ""An ninh tàu biển / ISPS Drill""], ""required"": true},
                        {""id"": ""drill_date"", ""label"": ""Ngày thực tập / Date"", ""type"": ""date"", ""required"": true},
                        {""id"": ""alarm_time"", ""label"": ""Thời gian phát báo động / Alarm Time"", ""type"": ""text"", ""required"": true},
                        {""id"": ""duration_mins"", ""label"": ""Thời gian thực hiện (Phút) / Duration (Mins)"", ""type"": ""number"", ""required"": true},
                        {""id"": ""scenario"", ""label"": ""Kịch bản diễn tập / Scenario Description"", ""type"": ""textarea"", ""required"": true},
                        {""id"": ""chk_muster_ok"", ""label"": ""Mọi thuyền viên có mặt đúng Muster Station đầy đủ trang bị?"", ""type"": ""checkbox"", ""required"": true},
                        {""id"": ""comments"", ""label"": ""Đánh giá & Rút kinh nghiệm / Comments & Corrective Actions"", ""type"": ""textarea"", ""required"": false}
                    ]"
                });

                // Clause 9
                var proc5 = new SmsProcedure
                {
                    Id = Guid.NewGuid(),
                    IsmElementId = 9,
                    ProcedureCode = "SOP-09-01",
                    Title = "Quy trình Báo cáo Sự cố & Sự không phù hợp (Incident & Non-Conformity Reporting)",
                    Content = "<h3>1. BÁO CÁO</h3><p>Mọi tai nạn, sự cố, tình huống cận nguy (Near-miss) hoặc sự không phù hợp (NCR) phát hiện trong quá trình vận hành phải được lập biên bản và gửi về văn phòng trong vòng 24 giờ.</p><h3>2. CAPA</h3><p>Hệ thống CAPA bắt buộc phải phân tích nguyên nhân gốc rễ (Root Cause Analysis - RCA) và lập hành động khắc phục/ngăn ngừa.</p>",
                    Version = "Rev 1.0",
                    PublishDate = DateTime.UtcNow.AddMonths(-1),
                    Status = "Active",
                    WatermarkText = "TÀI LIỆU ĐƯỢC KIỂM SOÁT"
                };
                proc5.FormTemplates.Add(new SmsFormTemplate
                {
                    Id = Guid.NewGuid(),
                    FormCode = "BM-09-02",
                    Title = "Báo cáo điểm không phù hợp (NCR - Non-Conformity Report)",
                    ContentSchema = @"[
                        {""id"": ""ncr_title"", ""label"": ""Tên điểm không phù hợp / NCR Subject"", ""type"": ""text"", ""required"": true},
                        {""id"": ""ncr_date"", ""label"": ""Ngày phát hiện / Discovery Date"", ""type"": ""date"", ""required"": true},
                        {""id"": ""ncr_desc"", ""label"": ""Mô tả chi tiết điểm không phù hợp / Description"", ""type"": ""textarea"", ""required"": true},
                        {""id"": ""ncr_ism_ref"", ""label"": ""Liên chiếu điều khoản ISM Code / ISM Clause Reference"", ""type"": ""text"", ""required"": true},
                        {""id"": ""ncr_actions"", ""label"": ""Biện pháp khắc phục tức thời / Immediate Actions"", ""type"": ""textarea"", ""required"": true}
                    ]"
                });

                // Clause 10
                var proc6 = new SmsProcedure
                {
                    Id = Guid.NewGuid(),
                    IsmElementId = 10,
                    ProcedureCode = "SOP-10-01",
                    Title = "Quy trình Bảo dưỡng Tàu và Thiết bị (Vessel & Equipment Maintenance SOP)",
                    Content = "<h3>1. HỆ THỐNG PMS</h3><p>Tất cả máy móc thiết bị chính, thiết bị tới hạn (Critical Equipment) phải được bảo dưỡng và thử nghiệm định kỳ theo lịch PMS để đảm bảo tính sẵn sàng hoạt động.</p><h3>2. BÁO CÁO HƯ HỎNG</h3><p>Khi phát hiện hư hỏng, thiết bị mất khả năng hoạt động, phải lập Defect Report gửi Máy trưởng/Đại phó để đưa vào danh sách sửa chữa.</p>",
                    Version = "Rev 1.0",
                    PublishDate = DateTime.UtcNow.AddMonths(-5),
                    Status = "Active",
                    WatermarkText = "TÀI LIỆU ĐƯỢC KIỂM SOÁT"
                };
                proc6.FormTemplates.Add(new SmsFormTemplate
                {
                    Id = Guid.NewGuid(),
                    FormCode = "BM-10-01",
                    Title = "Báo cáo hư hỏng thiết bị (Defect Report)",
                    ContentSchema = @"[
                        {""id"": ""equipment_name"", ""label"": ""Tên thiết bị hư hỏng / Equipment Name"", ""type"": ""text"", ""required"": true},
                        {""id"": ""defect_date"", ""label"": ""Ngày phát hiện hư hỏng / Defect Date"", ""type"": ""date"", ""required"": true},
                        {""id"": ""defect_desc"", ""label"": ""Mô tả chi tiết tình trạng hư hỏng / Defect Description"", ""type"": ""textarea"", ""required"": true},
                        {""id"": ""impact"", ""label"": ""Mức độ ảnh hưởng / Impact Level"", ""type"": ""select"", ""options"": [""Nghiêm trọng - Tàu dừng hoạt động"", ""Trung bình - Giảm công suất"", ""Thấp - Không ảnh hưởng ngay""], ""required"": true},
                        {""id"": ""spare_needed"", ""label"": ""Vật tư/Phụ tùng yêu cầu thay thế / Spares Required"", ""type"": ""text"", ""required"": false}
                    ]"
                });

                // Clause 11
                var proc7 = new SmsProcedure
                {
                    Id = Guid.NewGuid(),
                    IsmElementId = 11,
                    ProcedureCode = "SOP-11-01",
                    Title = "Quy trình Kiểm soát, Sửa đổi và Cập nhật Tài liệu SMS (Document Control Procedure)",
                    Content = "<h3>1. NGUYÊN TẮC KIỂM SOÁT</h3><p>Tất cả quy trình, sổ tay và biểu mẫu SMS thuộc quyền kiểm soát của văn phòng DPA. Bản cập nhật sửa đổi sẽ được đánh số Rev và ban hành kèm Phiếu đề xuất sửa đổi DCR.</p><h3>2. HỦY BỎ TÀI LIỆU CŨ</h3><p>Khi phiên bản mới có hiệu lực, phiên bản cũ sẽ tự động bị đóng dấu Watermark OBSOLETE và lưu trữ riêng, không được phép lưu hành dưới tàu.</p>",
                    Version = "Rev 1.0",
                    PublishDate = DateTime.UtcNow.AddMonths(-6),
                    Status = "Active",
                    WatermarkText = "TÀI LIỆU ĐƯỢC KIỂM SOÁT"
                };
                proc7.FormTemplates.Add(new SmsFormTemplate
                {
                    Id = Guid.NewGuid(),
                    FormCode = "BM-11-01",
                    Title = "Phiếu đề xuất sửa đổi tài liệu (Document Change Request - DCR)",
                    ContentSchema = @"[
                        {""id"": ""dcr_doc_code"", ""label"": ""Mã tài liệu đề xuất sửa đổi / Document Code"", ""type"": ""text"", ""required"": true},
                        {""id"": ""dcr_doc_title"", ""label"": ""Tên tài liệu / Document Title"", ""type"": ""text"", ""required"": true},
                        {""id"": ""current_rev"", ""label"": ""Phiên bản hiện tại / Current Rev"", ""type"": ""text"", ""required"": true},
                        {""id"": ""proposed_change"", ""label"": ""Nội dung đề xuất sửa đổi cụ thể / Proposed Amendment"", ""type"": ""textarea"", ""required"": true},
                        {""id"": ""reason"", ""label"": ""Lý do sửa đổi (Phát sinh mối nguy, Audit chỉ ra,...) / Rationale"", ""type"": ""textarea"", ""required"": true}
                    ]"
                });

                await context.SmsProcedures.AddRangeAsync(proc1, proc2, proc3, proc4, proc5, proc6, proc7);
                await context.SaveChangesAsync();
            }

            // Ensure TL-26 procedure and its form template are seeded
            var hasTl26 = await context.SmsProcedures.AnyAsync(p => p.ProcedureCode == "TL-26");
            if (!hasTl26)
            {
                var tl26 = new SmsProcedure
                {
                    Id = Guid.NewGuid(),
                    IsmElementId = 2, // Quyền hạn & Trách nhiệm của Công ty
                    ProcedureCode = "TL-26",
                    Title = "QUY TRÌNH THỰC HIỆN AN TOÀN VÀ SỨC KHỎE NGHỀ NGHIỆP",
                    Content = @"<h3>1. MỤC TIÊU (OBJECTIVE)</h3><p>Quy trình này nhằm thiết lập các hướng dẫn, quy chuẩn cần thiết để đảm bảo an toàn lao động và bảo vệ sức khỏe nghề nghiệp của thuyền viên khi làm việc trên tàu biển, phù hợp với Bộ luật ISM Code và các quy định của Tổ chức Hàng hải Quốc tế (IMO).</p><h3>2. PHẠM VI ÁP DỤNG (SCOPE)</h3><p>Áp dụng đối với toàn bộ thuyền viên làm việc dưới tàu và các bộ phận hỗ trợ an toàn của Văn phòng Công ty.</p><h3>3. QUY TRÌNH THỰC HIỆN (PROCEDURE DETAILS)</h3><p>Thuyền trưởng chịu trách nhiệm tổ chức, giám sát và định kỳ soát xét (Master's Review) việc áp dụng hệ thống quản lý an toàn trên tàu, báo cáo trực tiếp về văn phòng công ty qua Biên bản soát xét TL-02-01.</p>",
                    Version = "Rev 1.0",
                    PublishDate = DateTime.UtcNow,
                    Status = "Active",
                    WatermarkText = "TÀI LIỆU ĐƯỢC KIỂM SOÁT"
                };

                tl26.FormTemplates.Add(new SmsFormTemplate
                {
                    Id = Guid.NewGuid(),
                    FormCode = "TL-02-01",
                    Title = "Biên bản soát xét công tác quản lý an toàn, sức khỏe, bảo vệ môi trường (Master's Review of the SLMS)",
                    ContentSchema = @"[
                        {""id"": ""shipName"", ""label"": ""Tên tàu / Ship's Name"", ""type"": ""text"", ""required"": true},
                        {""id"": ""shipType"", ""label"": ""Loại tàu / Ship Type"", ""type"": ""text"", ""required"": true},
                        {""id"": ""masterName"", ""label"": ""Thuyền trưởng / Master's Name"", ""type"": ""text"", ""required"": true},
                        {""id"": ""reviewDate"", ""label"": ""Ngày / Date"", ""type"": ""date"", ""required"": true},
                        {""id"": ""reviewItem1"", ""label"": ""1. Nhận thức của thuyền viên về các chính sách của Công ty / Are personnel aware of and understand the Company policies?"", ""type"": ""textarea"", ""required"": true},
                        {""id"": ""reviewItem2"", ""label"": ""2. Tiếp cận tài liệu QLAT&LĐHH và quy trình / Is the SLMS easily and readily accessible?"", ""type"": ""textarea"", ""required"": true},
                        {""id"": ""reviewItem3"", ""label"": ""3. Các báo cáo, danh mục kiểm tra và cặp hồ sơ / Are records, filing and checklists completed?"", ""type"": ""textarea"", ""required"": true},
                        {""id"": ""reviewItem4"", ""label"": ""4. Tóm tắt những phát hiện quan trọng trong đánh giá nội bộ & bên ngoài / Summarise significant audit findings"", ""type"": ""textarea"", ""required"": true},
                        {""id"": ""reviewItem5"", ""label"": ""5. Tóm tắt phát hiện của PSC kể từ lần soát xét trước / Summarise Port State Control findings"", ""type"": ""textarea"", ""required"": true},
                        {""id"": ""reviewItem6"", ""label"": ""6. Tóm tắt tai nạn, sự có kể từ lần soát xét và khuyến nghị hành động khắc phục / Summarise accidents and incidents"", ""type"": ""textarea"", ""required"": true},
                        {""id"": ""reviewItem7"", ""label"": ""7. Nhận xét, khiếu nại của khách hàng, người thuê tàu / Customer feedback regarding satisfaction or complaints"", ""type"": ""textarea"", ""required"": true},
                        {""id"": ""reviewItem8"", ""label"": ""8. Những cải tiến cần thiết đối với HTQLAT&LĐHH / What general improvements to SLMS?"", ""type"": ""textarea"", ""required"": true},
                        {""id"": ""reviewItem9"", ""label"": ""9. Huấn luyện thực hiện trong thời gian điều hành tàu và nhận xét hiệu quả / Discuss training and effectiveness"", ""type"": ""textarea"", ""required"": true},
                        {""id"": ""reviewItem10"", ""label"": ""10. Soát xét hệ thống tài liệu / Document Review (significant changes)"", ""type"": ""textarea"", ""required"": true}
                    ]"
                });

                 tl26.FormTemplates.Add(new SmsFormTemplate
                {
                    Id = Guid.NewGuid(),
                    FormCode = "TL-26-03",
                    Title = "Lịch làm vệ sinh bếp, các kho thực phẩm, khu vực sinh hoạt chung, phòng ở (Accommodations, Store, Galley Cleaning Schedule)",
                    ContentSchema = @"[
                        {""id"": ""shipName"", ""label"": ""Tên tàu / Ship's Name"", ""type"": ""text"", ""required"": true},
                        {""id"": ""monthYear"", ""label"": ""Tháng/month"", ""type"": ""text"", ""required"": true}
                    ]"
                });

                tl26.FormTemplates.Add(new SmsFormTemplate
                {
                    Id = Guid.NewGuid(),
                    FormCode = "TL-15-01",
                    Title = "Kế hoạch nhận nhiên liệu (Bunkering Plan)",
                    ContentSchema = @"[
                        {""id"": ""vessel"", ""label"": ""Tàu / Vessel"", ""type"": ""text"", ""required"": true},
                        {""id"": ""location"", ""label"": ""Vị trí / Location"", ""type"": ""text"", ""required"": true},
                        {""id"": ""supplyBarge"", ""label"": ""Xà lan/Cảng / Supply Barge / Terminal"", ""type"": ""text"", ""required"": true},
                        {""id"": ""bunkerDate"", ""label"": ""Ngày / Date"", ""type"": ""date"", ""required"": true},
                        {""id"": ""foreDraft"", ""label"": ""Mớn nước mũi / Fore draft"", ""type"": ""text"", ""required"": false},
                        {""id"": ""aftDraft"", ""label"": ""Mớn nước lái / Aft draft"", ""type"": ""text"", ""required"": false}
                    ]"
                });

                await context.SmsProcedures.AddAsync(tl26);
                await context.SaveChangesAsync();
            }

            var hasTl26_03 = await context.SmsFormTemplates.AnyAsync(f => f.FormCode == "TL-26-03");
            if (!hasTl26_03)
            {
                var tl26 = await context.SmsProcedures.FirstOrDefaultAsync(p => p.ProcedureCode == "TL-26");
                if (tl26 != null)
                {
                    var newTemplate = new SmsFormTemplate
                    {
                        Id = Guid.NewGuid(),
                        SmsProcedureId = tl26.Id,
                        FormCode = "TL-26-03",
                        Title = "Lịch làm vệ sinh bếp, các kho thực phẩm, khu vực sinh hoạt chung, phòng ở (Accommodations, Store, Galley Cleaning Schedule)",
                        ContentSchema = @"[
                            {""id"": ""shipName"", ""label"": ""Tên tàu / Ship's Name"", ""type"": ""text"", ""required"": true},
                            {""id"": ""monthYear"", ""label"": ""Tháng/month"", ""type"": ""text"", ""required"": true}
                        ]"
                    };
                    await context.SmsFormTemplates.AddAsync(newTemplate);
                    await context.SaveChangesAsync();
                }
            }

            var hasTl15_01 = await context.SmsFormTemplates.AnyAsync(f => f.FormCode == "TL-15-01");
            if (!hasTl15_01)
            {
                var tl26 = await context.SmsProcedures.FirstOrDefaultAsync(p => p.ProcedureCode == "TL-26");
                if (tl26 != null)
                {
                    var newTemplate = new SmsFormTemplate
                    {
                        Id = Guid.NewGuid(),
                        SmsProcedureId = tl26.Id,
                        FormCode = "TL-15-01",
                        Title = "Kế hoạch nhận nhiên liệu (Bunkering Plan)",
                        ContentSchema = @"[
                            {""id"": ""vessel"", ""label"": ""Tàu / Vessel"", ""type"": ""text"", ""required"": true},
                            {""id"": ""location"", ""label"": ""Vị trí / Location"", ""type"": ""text"", ""required"": true},
                            {""id"": ""supplyBarge"", ""label"": ""Xà lan/Cảng / Supply Barge / Terminal"", ""type"": ""text"", ""required"": true},
                            {""id"": ""bunkerDate"", ""label"": ""Ngày / Date"", ""type"": ""date"", ""required"": true},
                            {""id"": ""foreDraft"", ""label"": ""Mớn nước mũi / Fore draft"", ""type"": ""text"", ""required"": false},
                            {""id"": ""aftDraft"", ""label"": ""Mớn nước lái / Aft draft"", ""type"": ""text"", ""required"": false}
                        ]"
                    };
                    await context.SmsFormTemplates.AddAsync(newTemplate);
                    await context.SaveChangesAsync();
                }
            }
        }
    }
}
