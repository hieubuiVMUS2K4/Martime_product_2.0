using MaritimeEdge.Services.Core;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using System.Text.Json;

namespace MaritimeEdge.Controllers.Safety
{
    [ApiController]
    [Route("api/hsqe")]
    public class HsqeController : ControllerBase
    {
        private readonly EdgeDbContext _context;
        private readonly ILogger<HsqeController> _logger;

        public HsqeController(EdgeDbContext context, ILogger<HsqeController> logger)
        {
            _context = context;
            _logger = logger;
        }

        // ==========================================
        // 0. SEED DATA ENDPOINT
        // ==========================================
        [HttpPost("seed")]
        public async Task<IActionResult> SeedHsqeData()
        {
            try
            {
                // 1. Seed Documents
                if (!await _context.HsqeDocuments.AnyAsync())
                {
                    var doc1 = new HsqeDocument
                    {
                        Id = Guid.NewGuid(),
                        DocumentCode = "TL-01",
                        Title = "Quy trình Kiểm soát Tài liệu & Dữ liệu",
                        Category = "PROCEDURE",
                        Content = "Quy trình này quy định phương pháp kiểm soát tất cả tài liệu, biểu mẫu trong hệ thống SMS của công ty. Tất cả quy trình được ký hiệu TL-XX và biểu mẫu đính kèm ký hiệu TL-XX-YY. Mọi sửa đổi phải thông qua DPA và được Giám đốc phê duyệt.",
                        CurrentVersion = "Rev 1.0",
                        Status = "Published",
                        ApprovedBy = "Giám đốc Trần Quốc Tuấn",
                        ApprovedAt = DateTime.UtcNow.AddDays(-10),
                        DigitalSignature = "SIG-DIR-TQT-2026-A1B2C3",
                        EditCount = 0
                    };
                    doc1.Revisions.Add(new HsqeDocumentRevision
                    {
                        Version = "Rev 1.0",
                        ChangeSummary = "Ban hành lần đầu tiên quy trình kiểm soát tài liệu điện tử.",
                        ChangedBy = "DPA Nguyễn Văn Hải",
                        ContentSnapshot = doc1.Content,
                        CreatedAt = DateTime.UtcNow.AddDays(-10)
                    });
                    doc1.SyncStatuses.Add(new HsqeDocumentSyncStatus { ShipName = "M/V Green Star", Received = true, ReceivedDate = DateTime.UtcNow.AddDays(-9), Trained = true, TrainedDate = DateTime.UtcNow.AddDays(-9), AcknowledgedBy = "Captain A" });
                    doc1.SyncStatuses.Add(new HsqeDocumentSyncStatus { ShipName = "M/V Sunrise", Received = true, ReceivedDate = DateTime.UtcNow.AddDays(-8), Trained = true, TrainedDate = DateTime.UtcNow.AddDays(-8), AcknowledgedBy = "Captain B" });

                    var doc2 = new HsqeDocument
                    {
                        Id = Guid.NewGuid(),
                        DocumentCode = "TL-01-01",
                        Title = "Danh mục Tài liệu được kiểm soát",
                        Category = "FORM",
                        Content = "Bảng theo danh mục tài liệu bao gồm Mã số, Tên quy trình, Phiên bản hiện hành, Ngày hiệu lực, Đơn vị áp dụng và Trạng thái đồng bộ.",
                        CurrentVersion = "Rev 1.0",
                        Status = "Published",
                        ApprovedBy = "Giám đốc Trần Quốc Tuấn",
                        ApprovedAt = DateTime.UtcNow.AddDays(-10),
                        DigitalSignature = "SIG-DIR-TQT-2026-F1G2H3"
                    };
                    doc2.Revisions.Add(new HsqeDocumentRevision
                    {
                        Version = "Rev 1.0",
                        ChangeSummary = "Ban hành biểu mẫu danh mục.",
                        ChangedBy = "DPA Nguyễn Văn Hải",
                        ContentSnapshot = doc2.Content,
                        CreatedAt = DateTime.UtcNow.AddDays(-10)
                    });

                    var doc3 = new HsqeDocument
                    {
                        Id = Guid.NewGuid(),
                        DocumentCode = "TL-01-02",
                        Title = "Phiếu yêu cầu Sửa đổi/Bổ sung/Hủy bỏ tài liệu",
                        Category = "FORM",
                        Content = "Mẫu biểu ghi nhận các ý kiến đề xuất sửa đổi tài liệu từ Thuyền viên dưới tàu hoặc Nhân viên văn phòng, gửi về DPA để xem xét tổng hợp trình Giám đốc.",
                        CurrentVersion = "Rev 1.0",
                        Status = "Published",
                        ApprovedBy = "Giám đốc Trần Quốc Tuấn",
                        ApprovedAt = DateTime.UtcNow.AddDays(-8),
                        DigitalSignature = "SIG-DIR-TQT-2026-X1Y2Z3"
                    };
                    doc3.Revisions.Add(new HsqeDocumentRevision
                    {
                        Version = "Rev 1.0",
                        ChangeSummary = "Thiết kế mẫu phiếu đề xuất sửa đổi quy trình.",
                        ChangedBy = "DPA Nguyễn Văn Hải",
                        ContentSnapshot = doc3.Content,
                        CreatedAt = DateTime.UtcNow.AddDays(-8)
                    });

                    var doc4 = new HsqeDocument
                    {
                        Id = Guid.NewGuid(),
                        DocumentCode = "TL-04",
                        Title = "Quy trình Quản lý Sự cố, Tai nạn & Không phù hợp",
                        Category = "PROCEDURE",
                        Content = "Quy trình này hướng dẫn cách thức báo cáo các hành vi không an toàn, tình huống cận nguy, tai nạn sự cố và các biện pháp điều tra CAPA. Nhằm ngăn ngừa tái diễn sự cố mất an toàn.",
                        CurrentVersion = "Rev 1.1",
                        Status = "Published",
                        ApprovedBy = "Giám đốc Trần Quốc Tuấn",
                        ApprovedAt = DateTime.UtcNow.AddDays(-5),
                        DigitalSignature = "SIG-DIR-TQT-2026-M4N5O6",
                        EditCount = 1
                    };
                    // Obsolete Revision
                    doc4.Revisions.Add(new HsqeDocumentRevision
                    {
                        Version = "Rev 1.0",
                        ChangeSummary = "Ban hành lần đầu quy trình xử lý sự cố.",
                        ChangedBy = "DPA Nguyễn Văn Hải",
                        ContentSnapshot = "Quy trình hướng dẫn báo cáo hành vi không an toàn và sự cố trên tàu.",
                        CreatedAt = DateTime.UtcNow.AddDays(-20)
                    });
                    // Published Revision
                    doc4.Revisions.Add(new HsqeDocumentRevision
                    {
                        Version = "Rev 1.1",
                        ChangeSummary = "Cập nhật bổ sung quy định điều tra nguyên nhân gốc rễ theo ISM Code.",
                        ChangedBy = "DPA Nguyễn Văn Hải",
                        ContentSnapshot = doc4.Content,
                        CreatedAt = DateTime.UtcNow.AddDays(-5)
                    });

                    var doc5 = new HsqeDocument
                    {
                        Id = Guid.NewGuid(),
                        DocumentCode = "TL-13",
                        Title = "Quy trình Cấp phép Làm việc Nguy hiểm trên Tàu",
                        Category = "PROCEDURE",
                        Content = "Quy trình quy định quy định cấp phép làm việc trước khi tiến hành các công việc đặc biệt: làm việc nóng/nguội, vào không gian kín, trên cao hoặc ngoài mạn, cô lập thiết bị.",
                        CurrentVersion = "Rev 1.0",
                        Status = "Published",
                        ApprovedBy = "Giám đốc Trần Quốc Tuấn",
                        ApprovedAt = DateTime.UtcNow.AddDays(-15),
                        DigitalSignature = "SIG-DIR-TQT-2026-P9Q8R7"
                    };
                    doc5.Revisions.Add(new HsqeDocumentRevision
                    {
                        Version = "Rev 1.0",
                        ChangeSummary = "Ban hành lần đầu tiên.",
                        ChangedBy = "DPA Nguyễn Văn Hải",
                        ContentSnapshot = doc5.Content,
                        CreatedAt = DateTime.UtcNow.AddDays(-15)
                    });

                    await _context.HsqeDocuments.AddRangeAsync(doc1, doc2, doc3, doc4, doc5);
                }

                // 2. Seed Incidents
                if (!await _context.HsqeIncidents.AnyAsync())
                {
                    var inc1 = new HsqeIncident
                    {
                        Id = Guid.NewGuid(),
                        IncidentCode = "INC-2026-001",
                        Title = "Trượt chân ngã trên thang boong chính",
                        IncidentType = "Incident",
                        Vessel = "M/V Green Star",
                        OccurrenceDate = DateTime.UtcNow.AddDays(-10),
                        Location = "Thang boong chính mạn phải",
                        Severity = "Medium",
                        Status = "CAPA_Open",
                        Description = "Thủy thủ A đang di chuyển xuống boong chính thì bị trượt chân ngã do bậc thang có dính dầu bôi trơn rò rỉ từ tời neo.",
                        ImmediateActions = "Sơ cứu vết trầy xước cho thủy thủ A. Lau sạch dầu loang trên cầu thang. Cắm biển cảnh báo trơn trượt.",
                        Why1 = "Tại sao thủy thủ A bị ngã? -> Vì bậc thang trơn trượt có dính dầu.",
                        Why2 = "Tại sao có dầu trên bậc thang? -> Vì tời neo mạn phải bị rò rỉ dầu thủy lực bắn ra bậc thang.",
                        Why3 = "Tại sao tời neo bị rò rỉ dầu? -> Vì gioăng làm kín xy lanh tời bị lão hóa nứt vỡ.",
                        Why4 = "Tại sao gioăng bị lão hóa không được phát hiện? -> Vì việc kiểm tra tời neo định kỳ chưa chú trọng tình trạng rò rỉ nhỏ.",
                        Why5 = "Tại sao kiểm tra định kỳ không phát hiện? -> Vì danh mục kiểm tra PMS của tời neo thiếu hạng mục kiểm tra chi tiết hệ thủy lực.",
                        RootCause = "Thiếu hạng mục kiểm tra hệ thủy lực tời trong quy trình bảo dưỡng PMS của tàu."
                    };
                    inc1.Capas.Add(new HsqeCapa
                    {
                        CapaCode = "CAPA-2026-001",
                        ActionType = "Corrective",
                        Description = "Thay thế gioăng làm kín xy lanh tời neo mạn phải.",
                        Assignee = "Máy hai Nguyễn Văn B",
                        DueDate = DateTime.UtcNow.AddDays(-8),
                        Completed = true,
                        CompletionDate = DateTime.UtcNow.AddDays(-8),
                        VerificationDetails = "Đã thay gioăng mới và test áp lực không rò rỉ."
                    });
                    inc1.Capas.Add(new HsqeCapa
                    {
                        CapaCode = "CAPA-2026-002",
                        ActionType = "Preventive",
                        Description = "Bổ sung hạng mục đo áp suất và kiểm tra rò rỉ dầu vào danh mục PMS hàng tháng của hệ thống tời neo.",
                        Assignee = "Máy trưởng Lê Văn C",
                        DueDate = DateTime.UtcNow.AddDays(5),
                        Completed = false
                    });

                    var inc2 = new HsqeIncident
                    {
                        Id = Guid.NewGuid(),
                        IncidentCode = "INC-2026-002",
                        Title = "Tia lửa bắn gần khu vực thông gió buồng sơn",
                        IncidentType = "Near-Miss",
                        Vessel = "M/V Sunrise",
                        OccurrenceDate = DateTime.UtcNow.AddDays(-5),
                        Location = "Boong mũi, gần buồng sơn",
                        Severity = "Low",
                        Status = "Investigating",
                        Description = "Trong khi mài vỏ tàu gần cửa thông gió buồng sơn đang mở, các tia lửa mài bay gần cửa hút khí buồng sơn. Phát hiện kịp thời nên dừng công việc trước khi xảy ra cháy nổ.",
                        ImmediateActions = "Dừng ngay công việc mài. Đóng cửa thông gió buồng sơn và đo nồng độ khí cháy sơn đạt mức an toàn mới cho tiếp tục công việc ở vị trí cách xa tối thiểu 5m.",
                        Why1 = "Tại sao tia lửa bay gần buồng sơn? -> Vì mài vỏ tàu ngay sát cửa gió mở.",
                        Why2 = "Tại sao cửa gió buồng sơn mở khi có việc mài bên ngoài? -> Vì không có sự phối hợp thông tin giữa đội sơn buồng và đội mài boong.",
                        Why3 = "Tại sao không có sự phối hợp? -> Vì đánh giá rủi ro công việc mài boong không tính đến mối nguy từ buồng sơn lân cận.",
                        RootCause = "Thiếu đánh giá rủi ro tương tác chéo giữa các công việc đồng thời (SIMOPS)."
                    };
                    inc2.Capas.Add(new HsqeCapa
                    {
                        CapaCode = "CAPA-2026-003",
                        ActionType = "Preventive",
                        Description = "Tổ chức họp giao ca đầu ngày để kiểm tra các công việc đồng thời và đặt biển cảnh báo khu vực mài/khu vực thông gió.",
                        Assignee = "Đại phó Trần Văn D",
                        DueDate = DateTime.UtcNow.AddDays(-2),
                        Completed = true,
                        CompletionDate = DateTime.UtcNow.AddDays(-2),
                        VerificationDetails = "Đã thực hiện triển khai họp giao ban và đặt biển cảnh báo."
                    });

                    var inc3 = new HsqeIncident
                    {
                        Id = Guid.NewGuid(),
                        IncidentCode = "INC-2026-003",
                        Title = "PSC chỉ ra khiếm khuyết thiết thiết bị thở khẩn cấp EEBD",
                        IncidentType = "PSC-Deficiency",
                        Vessel = "M/V Orion",
                        OccurrenceDate = DateTime.UtcNow.AddDays(-2),
                        Location = "Hành lang cabin tầng B",
                        Severity = "High",
                        Status = "Reported",
                        Description = "Chính quyền cảng PSC kiểm tra và phát hiện 01 bình EEBD tại cabin tầng B có đồng hồ chỉ thị áp suất nằm dưới vạch xanh (mất áp suất thở).",
                        ImmediateActions = "Thay ngay bình EEBD dự phòng vào vị trí bị chỉ ra khiếm khuyết."
                    };

                    await _context.HsqeIncidents.AddRangeAsync(inc1, inc2, inc3);
                }

                // 3. Seed Risk Assessments
                if (!await _context.HsqeRiskAssessments.AnyAsync())
                {
                    var steps = new List<object>
                    {
                        new {
                            id = "step-1",
                            stepDescription = "Đóng van chặn nước biển lân cận và cô lập điện bơm",
                            hazards = "Rò rỉ nước biển tràn buồng máy, chập điện khởi động bơm đột ngột",
                            initialL = 3,
                            initialS = 5,
                            initialScore = 15,
                            mitigations = "Áp dụng quy trình khóa thẻ LOTO, lắp van mù cơ khí chịu lực phụ.",
                            residualL = 1,
                            residualS = 5,
                            residualScore = 5
                        },
                        new {
                            id = "step-2",
                            stepDescription = "Tháo rã van mặt bích kiểm tra gioăng đệm",
                            hazards = "Kẹt cơ học chấn thương tay, rơi đĩa van đè chân",
                            initialL = 2,
                            initialS = 3,
                            initialScore = 6,
                            mitigations = "Sử dụng pa lăng nâng hạ chịu lực, đeo giày bảo hộ thép, găng tay cơ khí dày.",
                            residualL = 1,
                            residualS = 3,
                            residualScore = 3
                        }
                    };

                    var ra = new HsqeRiskAssessment
                    {
                        Id = Guid.NewGuid(),
                        AssessmentCode = "TL-24-01-01",
                        JobTitle = "Sửa chữa bảo dưỡng van thông biển buồng máy",
                        Department = "Engine",
                        Pic = "Máy trưởng Lê Văn C",
                        AssessmentDate = DateTime.UtcNow.AddDays(-2),
                        StepsJson = JsonSerializer.Serialize(steps)
                    };

                    await _context.HsqeRiskAssessments.AddAsync(ra);
                }

                // 4. Seed Work Permits
                if (!await _context.HsqeWorkPermits.AnyAsync())
                {
                    var ra = await _context.HsqeRiskAssessments.FirstOrDefaultAsync();

                    var precautions1 = new List<object>
                    {
                        new { label = "Đã thông gió cưỡng bức tối thiểu 24 giờ liên tục", @checked = true },
                        new { label = "Thiết bị thở thở khẩn cấp EEBD đặt tại cửa hầm", @checked = true },
                        new { label = "Bố trí 01 người trực canh gác thường xuyên ngoài cửa hầm", @checked = true },
                        new { label = "Bộ đàm kiểm tra liên lạc thông suốt mỗi 10 phút", @checked = true }
                    };

                    var perm1 = new HsqeWorkPermit
                    {
                        Id = Guid.NewGuid(),
                        PermitCode = "TL-13-03-01",
                        PermitType = "Enclosed",
                        Title = "Giấy phép vào Hầm Hàng số 2 đo gỉ hàng năm",
                        Vessel = "M/V Green Star",
                        Location = "Hầm hàng số 2 (Đáy hầm)",
                        Status = "Active",
                        DurationHours = 4,
                        StartTime = DateTime.UtcNow.AddHours(-1),
                        RiskAssessmentId = ra?.Id,
                        GasTestO2 = 20.9,
                        GasTestLEL = 0.0,
                        GasTestCO = 0.0,
                        GasTestH2S = 0.0,
                        PrecautionsJson = JsonSerializer.Serialize(precautions1),
                        ChiefOfficerSigned = true,
                        CaptainApproved = true
                    };

                    var precautions2 = new List<object>
                    {
                        new { label = "Di chuyển toàn bộ vật tư dễ cháy trong bán kính 10m", @checked = true },
                        new { label = "Bố trí người trực cảnh giới chữa cháy có sẵn bình CO2/Bọt", @checked = true }
                    };

                    var perm2 = new HsqeWorkPermit
                    {
                        Id = Guid.NewGuid(),
                        PermitCode = "TL-13-01-01",
                        PermitType = "Hot",
                        Title = "Giấy phép hàn cắt sửa ống gió boong xuồng",
                        Vessel = "M/V Sunrise",
                        Location = "Boong xuồng mạn trái",
                        Status = "Closed",
                        DurationHours = 2,
                        StartTime = DateTime.UtcNow.AddDays(-1),
                        GasTestO2 = 20.9,
                        GasTestLEL = 0.1,
                        GasTestCO = 2.0,
                        GasTestH2S = 0.0,
                        PrecautionsJson = JsonSerializer.Serialize(precautions2),
                        ChiefOfficerSigned = true,
                        CaptainApproved = true
                    };

                    await _context.HsqeWorkPermits.AddRangeAsync(perm1, perm2);
                }

                await _context.SaveChangesAsync();
                return Ok(new { message = "HSQE database seeded successfully with mock data!" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error seeding HSQE data");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ==========================================
        // 1. DOCUMENT CONTROL ENDPOINTS
        // ==========================================
        [HttpGet("documents")]
        public async Task<IActionResult> GetDocuments([FromQuery] bool showObsolete = false)
        {
            try
            {
                var query = _context.HsqeDocuments
                    .Include(d => d.Revisions)
                    .Include(d => d.SyncStatuses)
                    .AsQueryable();

                if (!showObsolete)
                {
                    query = query.Where(d => d.Status != "Obsolete");
                }

                var docs = await query.OrderBy(d => d.DocumentCode).ToListAsync();
                return Ok(docs);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving HSQE documents");
                return StatusCode(500, new { error = "Internal server error" });
            }
        }

        [HttpGet("documents/obsolete")]
        public async Task<IActionResult> GetObsoleteDocuments()
        {
            try
            {
                var docs = await _context.HsqeDocuments
                    .Include(d => d.Revisions)
                    .Where(d => d.Status == "Obsolete")
                    .OrderBy(d => d.DocumentCode)
                    .ToListAsync();
                return Ok(docs);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving obsolete documents");
                return StatusCode(500, new { error = "Internal server error" });
            }
        }

        [HttpGet("documents/{id}")]
        public async Task<IActionResult> GetDocumentById(Guid id)
        {
            try
            {
                var doc = await _context.HsqeDocuments
                    .Include(d => d.Revisions)
                    .Include(d => d.SyncStatuses)
                    .FirstOrDefaultAsync(d => d.Id == id);

                if (doc == null)
                    return NotFound(new { message = "Document not found" });

                return Ok(doc);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving document {Id}", id);
                return StatusCode(500, new { error = "Internal server error" });
            }
        }

        [HttpPost("documents")]
        public async Task<IActionResult> CreateDocument([FromBody] CreateDocDto dto)
        {
            try
            {
                var doc = new HsqeDocument
                {
                    DocumentCode = dto.DocumentCode,
                    Title = dto.Title,
                    Category = dto.Category ?? "PROCEDURE",
                    Content = dto.Content,
                    CurrentVersion = "Rev 1.0",
                    Status = "Draft",
                    IsControlled = dto.IsControlled,
                    WatermarkText = dto.WatermarkText ?? "TÀI LIỆU NHÁP"
                };

                doc.Revisions.Add(new HsqeDocumentRevision
                {
                    Version = "Rev 1.0",
                    ChangeSummary = "Khởi tạo tài liệu mới.",
                    ChangedBy = dto.CreatedBy ?? "DPA Nguyễn Văn Hải",
                    ContentSnapshot = dto.Content,
                    CreatedAt = DateTime.UtcNow
                });

                _context.HsqeDocuments.Add(doc);
                await _context.SaveChangesAsync();

                return CreatedAtAction(nameof(GetDocumentById), new { id = doc.Id }, doc);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating document");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPut("documents/{id}")]
        public async Task<IActionResult> UpdateDocument(Guid id, [FromBody] UpdateDocDto dto)
        {
            try
            {
                var doc = await _context.HsqeDocuments
                    .Include(d => d.Revisions)
                    .FirstOrDefaultAsync(d => d.Id == id);

                if (doc == null)
                    return NotFound(new { message = "Document not found" });

                if (doc.Status == "Published")
                {
                    // Save historical snapshot as Obsolete in revisions
                    doc.Revisions.Add(new HsqeDocumentRevision
                    {
                        Version = doc.CurrentVersion,
                        ChangeSummary = dto.ChangeSummary ?? "Cập nhật nội dung quy trình.",
                        ChangedBy = dto.ChangedBy ?? "DPA Nguyễn Văn Hải",
                        ContentSnapshot = doc.Content,
                        CreatedAt = DateTime.UtcNow
                    });

                    // Bumping process: Minor bump
                    doc.EditCount++;
                    var currentVStr = doc.CurrentVersion.Replace("Rev ", "");
                    if (double.TryParse(currentVStr, out double currentVNum))
                    {
                        if (doc.EditCount >= 3)
                        {
                            // Major bump
                            int major = (int)Math.Floor(currentVNum) + 1;
                            doc.CurrentVersion = $"Rev {major}.0";
                            doc.EditCount = 0; // reset

                            // Increment reissued process counter
                            var reissuedProcesses = await _context.HsqeDocuments
                                .CountAsync(d => d.Status == "Published" && d.Category == "PROCEDURE" && d.EditCount >= 3);
                            
                            // Reissue SMS Handbook if threshold reached
                            if (reissuedProcesses >= 5)
                            {
                                var handbook = await _context.HsqeDocuments
                                    .FirstOrDefaultAsync(d => d.Category == "SMS_HANDBOOK");
                                if (handbook != null)
                                {
                                    var hbVStr = handbook.CurrentVersion.Replace("Rev ", "");
                                    if (double.TryParse(hbVStr, out double hbVNum))
                                    {
                                        handbook.CurrentVersion = $"Rev {Math.Floor(hbVNum) + 1}.0";
                                        handbook.UpdatedAt = DateTime.UtcNow;
                                    }
                                }
                            }
                        }
                        else
                        {
                            // Minor bump
                            doc.CurrentVersion = $"Rev {(currentVNum + 0.1):0.0}";
                        }
                    }

                    // Move back to Draft for re-approval
                    doc.Status = "Draft";
                    doc.WatermarkText = dto.WatermarkText ?? "TÀI LIỆU NHÁP";
                }

                doc.Title = dto.Title ?? doc.Title;
                doc.Content = dto.Content ?? doc.Content;
                if (!string.IsNullOrEmpty(dto.WatermarkText))
                {
                    doc.WatermarkText = dto.WatermarkText;
                }
                doc.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();
                return Ok(doc);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating document {Id}", id);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("documents/bulk-delete")]
        public async Task<IActionResult> BulkDeleteDocuments([FromBody] BulkDeleteDocumentsDto dto)
        {
            try
            {
                if (dto.DocumentIds == null || dto.DocumentIds.Count == 0)
                {
                    return BadRequest(new { message = "No documents selected" });
                }

                var existingCount = await _context.HsqeDocuments
                    .Where(d => dto.DocumentIds.Contains(d.Id) && d.Status != "Obsolete")
                    .CountAsync();

                if (existingCount == 0)
                {
                    return NotFound(new { message = "Documents not found" });
                }

                var now = DateTime.UtcNow;
                var reason = dto.Reason ?? "Bulk delete from Document Library";
                var affected = await _context.HsqeDocuments
                    .Where(d => dto.DocumentIds.Contains(d.Id) && d.Status != "Obsolete")
                    .ExecuteUpdateAsync(setters => setters
                        .SetProperty(d => d.Status, "Obsolete")
                        .SetProperty(d => d.ObsoleteReason, reason)
                        .SetProperty(d => d.UpdatedAt, now));

                return Ok(new { deletedCount = affected });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error bulk deleting HSQE documents");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("documents/{id}")]
        public async Task<IActionResult> DeleteDocument(Guid id)
        {
            try
            {
                var exists = await _context.HsqeDocuments.AnyAsync(d => d.Id == id);

                if (!exists)
                {
                    return NotFound(new { message = "Document not found" });
                }

                var now = DateTime.UtcNow;
                var affected = await _context.HsqeDocuments
                    .Where(d => d.Id == id && d.Status != "Obsolete")
                    .ExecuteUpdateAsync(setters => setters
                        .SetProperty(d => d.Status, "Obsolete")
                        .SetProperty(d => d.ObsoleteReason, "Delete from Document Library")
                        .SetProperty(d => d.UpdatedAt, now));

                return Ok(new { deletedCount = affected });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting HSQE document {Id}", id);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("documents/{id}/submit-review")]
        public async Task<IActionResult> SubmitDocumentForReview(Guid id)
        {
            try
            {
                var doc = await _context.HsqeDocuments.FindAsync(id);
                if (doc == null) return NotFound();

                doc.Status = "Pending_DPA";
                doc.WatermarkText = "CHỜ DPA DUYỆT";
                doc.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();
                return Ok(doc);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error submitting document review");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("documents/{id}/approve")]
        public async Task<IActionResult> ApproveDocument(Guid id, [FromBody] ApproveDocDto dto)
        {
            try
            {
                var doc = await _context.HsqeDocuments
                    .Include(d => d.SyncStatuses)
                    .FirstOrDefaultAsync(d => d.Id == id);
                if (doc == null) return NotFound();

                var actor = (MaritimeEdge.Services.Core.ApprovalActor)HttpContext.Items["ApprovalActor"]!;
                var approver = actor.Name;
                var cleanName = approver.Replace("Giám đốc", "").Replace("DPA", "").Replace("Thuyền trưởng", "").Trim();
                var initials = string.Concat(cleanName.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(w => char.ToUpper(w[0])));
                if (string.IsNullOrEmpty(initials)) initials = "DIR";

                doc.Status = "Published";
                doc.ApprovedBy = approver;
                doc.ApprovedAt = DateTime.UtcNow;
                doc.DigitalSignature = HttpContext.Items["ApprovalActionId"]!.ToString();
                doc.WatermarkText = "TÀI LIỆU ĐƯỢC KIỂM SOÁT";
                doc.UpdatedAt = DateTime.UtcNow;

                // Sync status simulation
                doc.SyncStatuses.Clear();
                doc.SyncStatuses.Add(new HsqeDocumentSyncStatus { ShipName = "M/V Green Star", Received = false });
                doc.SyncStatuses.Add(new HsqeDocumentSyncStatus { ShipName = "M/V Sunrise", Received = false });
                doc.SyncStatuses.Add(new HsqeDocumentSyncStatus { ShipName = "M/V Orion", Received = false });

                await _context.SaveChangesAsync();
                return Ok(doc);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error approving document");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("documents/{id}/acknowledge")]
        public async Task<IActionResult> AcknowledgeDocumentSync(Guid id, [FromBody] AcknowledgeDocDto dto)
        {
            try
            {
                var sync = await _context.HsqeDocumentSyncStatuses
                    .FirstOrDefaultAsync(s => s.DocumentId == id && s.ShipName == (dto.ShipName ?? "M/V Green Star"));
                
                if (sync == null)
                {
                    sync = new HsqeDocumentSyncStatus
                    {
                        DocumentId = id,
                        ShipName = dto.ShipName ?? "M/V Green Star"
                    };
                    await _context.HsqeDocumentSyncStatuses.AddAsync(sync);
                }

                sync.Received = true;
                sync.ReceivedDate = DateTime.UtcNow;
                sync.Trained = true;
                sync.TrainedDate = DateTime.UtcNow;
                sync.AcknowledgedBy = dto.AcknowledgedBy ?? "Thuyền trưởng Nguyễn Văn A";
                sync.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();
                return Ok(sync);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error acknowledging sync");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ==========================================
        // 1.5. DOCUMENT ATTACHMENTS, READ LOGS, HISTORY ENDPOINTS
        // ==========================================

        [HttpGet("documents/{documentId}/attachments")]
        public async Task<IActionResult> GetDocumentAttachments(Guid documentId)
        {
            try
            {
                var attachments = await _context.HsqeDocumentAttachments
                    .Where(a => a.DocumentId == documentId)
                    .OrderByDescending(a => a.CreatedAt)
                    .ToListAsync();
                return Ok(attachments);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving document attachments for {DocumentId}", documentId);
                return StatusCode(500, new { error = "Internal server error" });
            }
        }

        [HttpPost("documents/{documentId}/attachments")]
        public async Task<IActionResult> UploadDocumentAttachment(Guid documentId, [FromForm] IFormFile file, [FromForm] string uploadedBy)
        {
            try
            {
                if (file == null || file.Length == 0)
                    return BadRequest(new { message = "No file uploaded" });

                var doc = await _context.HsqeDocuments.FindAsync(documentId);
                if (doc == null)
                    return NotFound(new { message = "Document not found" });

                var uploadsRoot = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "hsqe");
                Directory.CreateDirectory(uploadsRoot);

                var fileName = $"{Guid.NewGuid()}_{Path.GetFileName(file.FileName)}";
                var filePath = Path.Combine(uploadsRoot, fileName);

                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                var attachment = new HsqeDocumentAttachment
                {
                    Id = Guid.NewGuid(),
                    DocumentId = documentId,
                    FileName = file.FileName,
                    FileSize = file.Length,
                    FileType = file.ContentType,
                    FilePath = $"/uploads/hsqe/{fileName}",
                    UploadedBy = uploadedBy ?? "DPA Nguyễn Văn Hải",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                _context.HsqeDocumentAttachments.Add(attachment);
                await _context.SaveChangesAsync();

                return Ok(new
                {
                    id = attachment.Id,
                    documentId = attachment.DocumentId,
                    fileName = attachment.FileName,
                    fileSize = attachment.FileSize,
                    fileType = attachment.FileType,
                    uploadedBy = attachment.UploadedBy,
                    uploadedAt = attachment.CreatedAt,
                    url = attachment.FilePath
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading document attachment");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("documents/{documentId}/attachments/{attachmentId}")]
        public async Task<IActionResult> DeleteDocumentAttachment(Guid documentId, Guid attachmentId)
        {
            try
            {
                var attachment = await _context.HsqeDocumentAttachments
                    .FirstOrDefaultAsync(a => a.DocumentId == documentId && a.Id == attachmentId);

                if (attachment == null)
                    return NotFound(new { message = "Attachment not found" });

                if (!string.IsNullOrEmpty(attachment.FilePath))
                {
                    var cleanPath = attachment.FilePath.Replace("/uploads/", "").Replace("/", Path.DirectorySeparatorChar.ToString());
                    var physicalPath = Path.Combine(Directory.GetCurrentDirectory(), "uploads", cleanPath);
                    if (System.IO.File.Exists(physicalPath))
                    {
                        System.IO.File.Delete(physicalPath);
                    }
                }

                _context.HsqeDocumentAttachments.Remove(attachment);
                await _context.SaveChangesAsync();

                return Ok(new { message = "Attachment deleted successfully" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting document attachment {Id}", attachmentId);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("documents/{documentId}/read-logs")]
        public async Task<IActionResult> GetDocumentReadLogs(Guid documentId)
        {
            try
            {
                var logs = await _context.HsqeDocumentReadLogs
                    .Where(l => l.DocumentId == documentId)
                    .OrderByDescending(l => l.ReadAt)
                    .ToListAsync();
                return Ok(logs);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving read logs for {DocumentId}", documentId);
                return StatusCode(500, new { error = "Internal server error" });
            }
        }

        [HttpPost("documents/{documentId}/read-logs")]
        public async Task<IActionResult> MarkDocumentAsRead(Guid documentId, [FromBody] MarkAsReadDto dto)
        {
            try
            {
                var doc = await _context.HsqeDocuments.FindAsync(documentId);
                if (doc == null)
                    return NotFound(new { message = "Document not found" });

                var existing = await _context.HsqeDocumentReadLogs
                    .FirstOrDefaultAsync(l => l.DocumentId == documentId && l.UserName == dto.UserName);

                if (existing != null)
                {
                    return Ok(existing);
                }

                var readLog = new HsqeDocumentReadLog
                {
                    Id = Guid.NewGuid(),
                    DocumentId = documentId,
                    UserName = dto.UserName,
                    Rank = dto.Rank ?? "Thuyền viên",
                    ReadAt = DateTime.UtcNow,
                    Acknowledged = true,
                    Notes = dto.Notes
                };

                _context.HsqeDocumentReadLogs.Add(readLog);
                await _context.SaveChangesAsync();

                return Ok(readLog);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error marking document as read");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("documents/{documentId}/history")]
        public async Task<IActionResult> GetDocumentHistory(Guid documentId)
        {
            try
            {
                var doc = await _context.HsqeDocuments
                    .Include(d => d.Revisions)
                    .Include(d => d.SyncStatuses)
                    .FirstOrDefaultAsync(d => d.Id == documentId);

                if (doc == null)
                    return NotFound(new { message = "Document not found" });

                var historyList = new List<object>();

                historyList.Add(new
                {
                    id = $"hist-created-{doc.Id}",
                    action = "created",
                    userName = doc.ApprovedBy ?? "System",
                    timestamp = doc.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss"),
                    details = $"Khởi tạo tài liệu {doc.DocumentCode}: {doc.Title}",
                    version = "Rev 1.0"
                });

                foreach (var rev in doc.Revisions)
                {
                    historyList.Add(new
                    {
                        id = $"hist-rev-{rev.Id}",
                        action = "edited",
                        userName = rev.ChangedBy,
                        timestamp = rev.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss"),
                        details = rev.ChangeSummary ?? $"Sửa đổi nội dung phiên bản {rev.Version}",
                        version = rev.Version
                    });

                    if (doc.Status == "Published" && rev.Version == doc.CurrentVersion)
                    {
                        historyList.Add(new
                        {
                            id = $"hist-pub-{rev.Id}",
                            action = "released",
                            userName = rev.ChangedBy,
                            timestamp = rev.CreatedAt.ToString("yyyy-MM-dd HH:mm:ss"),
                            details = $"Ban hành phiên bản chính thức {rev.Version}",
                            version = rev.Version
                        });
                    }
                }

                var readLogs = await _context.HsqeDocumentReadLogs
                    .Where(l => l.DocumentId == documentId)
                    .ToListAsync();

                foreach (var log in readLogs)
                {
                    historyList.Add(new
                    {
                        id = $"hist-read-{log.Id}",
                        action = "read",
                        userName = log.UserName,
                        timestamp = log.ReadAt.ToString("yyyy-MM-dd HH:mm:ss"),
                        details = $"Đọc và xác nhận xem tài liệu (Chức danh: {log.Rank})",
                        version = doc.CurrentVersion
                    });
                }

                foreach (var sync in doc.SyncStatuses)
                {
                    if (sync.Received)
                    {
                        historyList.Add(new
                        {
                            id = $"hist-sync-{sync.Id}",
                            action = "synced",
                            userName = sync.AcknowledgedBy ?? "Tàu",
                            timestamp = (sync.ReceivedDate ?? DateTime.UtcNow).ToString("yyyy-MM-dd HH:mm:ss"),
                            details = $"Đã đồng bộ thành công tới tàu {sync.ShipName}",
                            version = doc.CurrentVersion
                        });
                    }
                }

                var sortedHistory = historyList
                    .OrderByDescending(h => ((dynamic)h).timestamp)
                    .ToList();

                return Ok(sortedHistory);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error building document history for {DocumentId}", documentId);
                return StatusCode(500, new { error = "Internal server error" });
            }
        }

        // ==========================================
        // 2. INCIDENTS & CAPA ENDPOINTS
        // ==========================================
        [HttpGet("incidents")]
        public async Task<IActionResult> GetIncidents()
        {
            try
            {
                var incidents = await _context.HsqeIncidents
                    .Include(i => i.Capas)
                    .OrderByDescending(i => i.OccurrenceDate)
                    .ToListAsync();

                // Heinrich statistics
                int total = incidents.Count;
                int activeCapa = await _context.HsqeCapas.CountAsync(c => !c.Completed);

                // Heinrich Pyramid categorization
                // Top tier (Major Accidents): Severity: Critical, High (not Near-miss)
                int major = incidents.Count(i => (i.Severity == "Critical" || i.Severity == "High") && i.IncidentType != "Near-Miss");
                // Middle tier (Minor Incidents): Severity: Medium, types Incident/Non-Conformity/Deficiency
                int minor = incidents.Count(i => i.Severity == "Medium" && i.IncidentType != "Near-Miss");
                // Bottom tier (Near-Misses / Unsafe actions): Severity Low or type Near-Miss
                int nearMiss = incidents.Count(i => i.IncidentType == "Near-Miss" || i.Severity == "Low");

                return Ok(new
                {
                    incidents,
                    stats = new
                    {
                        total,
                        activeCapa,
                        heinrich = new { major, minor, nearMiss }
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting incidents");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("incidents")]
        public async Task<IActionResult> CreateIncident([FromBody] CreateIncidentDto dto)
        {
            try
            {
                var totalInc = await _context.HsqeIncidents.CountAsync();
                var incidentCode = $"INC-2026-{totalInc + 1:D3}";

                var inc = new HsqeIncident
                {
                    IncidentCode = incidentCode,
                    Title = dto.Title,
                    IncidentType = dto.IncidentType,
                    Vessel = dto.Vessel ?? "M/V Green Star",
                    OccurrenceDate = dto.OccurrenceDate ?? DateTime.UtcNow,
                    Location = dto.Location,
                    Severity = dto.Severity ?? "Medium",
                    Status = "Reported",
                    Description = dto.Description,
                    ImmediateActions = dto.ImmediateActions
                };

                _context.HsqeIncidents.Add(inc);
                await _context.SaveChangesAsync();

                return Created("", inc);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating incident");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPut("incidents/{id}/investigate")]
        public async Task<IActionResult> InvestigateIncident(Guid id, [FromBody] InvestigateDto dto)
        {
            try
            {
                var inc = await _context.HsqeIncidents.FindAsync(id);
                if (inc == null) return NotFound();

                inc.Why1 = dto.Why1;
                inc.Why2 = dto.Why2;
                inc.Why3 = dto.Why3;
                inc.Why4 = dto.Why4;
                inc.Why5 = dto.Why5;
                inc.RootCause = dto.RootCause;
                inc.Status = "CAPA_Open";
                inc.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();
                return Ok(inc);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error investigating incident");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("incidents/{id}/capas")]
        public async Task<IActionResult> AddCapa(Guid id, [FromBody] CreateCapaDto dto)
        {
            try
            {
                var inc = await _context.HsqeIncidents.FindAsync(id);
                if (inc == null) return NotFound();

                var totalCapas = await _context.HsqeCapas.CountAsync();
                var capa = new HsqeCapa
                {
                    IncidentId = id,
                    CapaCode = $"CAPA-2026-{totalCapas + 1:D3}",
                    ActionType = dto.ActionType,
                    Description = dto.Description,
                    Assignee = dto.Assignee,
                    DueDate = dto.DueDate ?? DateTime.UtcNow.AddDays(7),
                    Completed = false
                };

                _context.HsqeCapas.Add(capa);
                await _context.SaveChangesAsync();

                return Ok(capa);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding CAPA");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPut("incidents/capas/{id}/toggle")]
        public async Task<IActionResult> ToggleCapa(Guid id, [FromBody] ToggleCapaDto dto)
        {
            try
            {
                var capa = await _context.HsqeCapas.FindAsync(id);
                if (capa == null) return NotFound();

                capa.Completed = !capa.Completed;
                capa.CompletionDate = capa.Completed ? DateTime.UtcNow : null;
                capa.VerificationDetails = dto.VerificationDetails ?? capa.VerificationDetails;
                capa.UpdatedAt = DateTime.UtcNow;

                // Update incident status if all CAPAs are resolved
                await _context.SaveChangesAsync();
                
                var incidentId = capa.IncidentId;
                var allCapas = await _context.HsqeCapas.Where(c => c.IncidentId == incidentId).ToListAsync();
                var incident = await _context.HsqeIncidents.FindAsync(incidentId);
                if (incident != null)
                {
                    if (allCapas.All(c => c.Completed))
                    {
                        incident.Status = "Closed";
                    }
                    else
                    {
                        incident.Status = "CAPA_Open";
                    }
                    await _context.SaveChangesAsync();
                }

                return Ok(capa);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error toggling CAPA status");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("incidents/{id}")]
        public async Task<IActionResult> DeleteIncident(Guid id)
        {
            try
            {
                var inc = await _context.HsqeIncidents
                    .Include(i => i.Capas)
                    .FirstOrDefaultAsync(i => i.Id == id);
                if (inc == null) return NotFound();

                _context.HsqeCapas.RemoveRange(inc.Capas);
                _context.HsqeIncidents.Remove(inc);
                await _context.SaveChangesAsync();
                return Ok(new { message = "Incident and related CAPAs deleted" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting incident {Id}", id);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ==========================================
        // 3. RISK ASSESSMENT & WORK PERMITS
        // ==========================================
        [HttpGet("risks")]
        public async Task<IActionResult> GetRisks()
        {
            try
            {
                var list = await _context.HsqeRiskAssessments
                    .OrderByDescending(r => r.AssessmentDate)
                    .ToListAsync();
                return Ok(list);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving risk assessments");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("risks")]
        public async Task<IActionResult> CreateRiskAssessment([FromBody] CreateRiskDto dto)
        {
            try
            {
                var totalRisks = await _context.HsqeRiskAssessments.CountAsync();
                var ra = new HsqeRiskAssessment
                {
                    AssessmentCode = $"TL-24-01-{totalRisks + 1:D2}",
                    JobTitle = dto.JobTitle,
                    Department = dto.Department,
                    Pic = dto.Pic,
                    AssessmentDate = DateTime.UtcNow,
                    StepsJson = dto.StepsJson
                };

                await _context.HsqeRiskAssessments.AddAsync(ra);
                await _context.SaveChangesAsync();

                return Created("", ra);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating risk assessment");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpGet("permits")]
        public async Task<IActionResult> GetWorkPermits()
        {
            try
            {
                var permits = await _context.HsqeWorkPermits
                    .OrderByDescending(p => p.StartTime)
                    .ToListAsync();
                return Ok(permits);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving work permits");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("permits")]
        public async Task<IActionResult> CreateWorkPermit([FromBody] CreatePermitDto dto)
        {
            try
            {
                var totalPermits = await _context.HsqeWorkPermits.CountAsync();
                string prefix = dto.PermitType switch
                {
                    "Hot" => "TL-13-01-",
                    "Enclosed" => "TL-13-03-",
                    "Aloft" => "TL-13-04-",
                    _ => "TL-13-02-"
                };

                var permit = new HsqeWorkPermit
                {
                    PermitCode = $"{prefix}{totalPermits + 1:D2}",
                    PermitType = dto.PermitType,
                    Title = dto.Title,
                    Vessel = dto.Vessel ?? "M/V Green Star",
                    Location = dto.Location,
                    Status = "Draft",
                    DurationHours = dto.DurationHours,
                    StartTime = dto.StartTime ?? DateTime.UtcNow,
                    RiskAssessmentId = dto.RiskAssessmentId,
                    PrecautionsJson = dto.PrecautionsJson ?? "[]"
                };

                await _context.HsqeWorkPermits.AddAsync(permit);
                await _context.SaveChangesAsync();

                return Created("", permit);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating permit");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("permits/{id}/gas-test")]
        public async Task<IActionResult> PerformGasTest(Guid id, [FromBody] GasTestDto dto)
        {
            try
            {
                var permit = await _context.HsqeWorkPermits.FindAsync(id);
                if (permit == null) return NotFound();
                if (permit.Status is not ("Draft" or "Returned")) return Conflict(new { message = "Sửa đổi giấy phép trước khi thay kết quả đo khí." });
                if (string.IsNullOrWhiteSpace(dto.Device)) return BadRequest(new { message = "Cần mã thiết bị đo khí." });
                permit.GasTestAt = DateTime.UtcNow;
                permit.GasTestDevice = dto.Device;
                permit.GasTestBy = HttpContext.GetUsername();

                permit.GasTestO2 = dto.GasTestO2;
                permit.GasTestLEL = dto.GasTestLEL;
                permit.GasTestCO = dto.GasTestCO;
                permit.GasTestH2S = dto.GasTestH2S;

                permit.IsSynced = false;
                permit.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();
                return Ok(new { message = "Đã lưu kết quả đo. Người kiểm tra đánh giá theo SMS công ty.", gasSafe = false, permit });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating gas test");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPost("permits/{id}/sign")]
        public IActionResult SignPermit(Guid id, [FromBody] SignPermitDto dto)
        {
            return Conflict(new { message = "Dùng luồng gửi kiểm tra / kiểm tra / cấp phép bằng tài khoản." });
        }

        [HttpPost("permits/{id}/close")]
        public async Task<IActionResult> ClosePermit(Guid id)
        {
            try
            {
                var permit = await _context.HsqeWorkPermits.FindAsync(id);
                if (permit == null) return NotFound();

                if (permit.Status is not ("Issued" or "Suspended")) return Conflict(new { message = "Chỉ đóng phép đã cấp hoặc đình chỉ." });
                permit.Status = "Closed";
                await _context.SaveChangesAsync();
                return Ok(permit);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error closing permit {Id}", id);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpPut("permits/{id}")]
        public async Task<IActionResult> UpdateDraftPermit(Guid id, [FromBody] CreatePermitDto dto)
        {
            var permit = await _context.HsqeWorkPermits.FindAsync(id);
            if (permit == null) return NotFound();
            if (permit.Status is not ("Draft" or "Returned")) return Conflict(new { message = "Sửa đổi giấy phép trước khi thay nội dung." });
            permit.Title = dto.Title; permit.Location = dto.Location; permit.PermitType = dto.PermitType;
            permit.DurationHours = dto.DurationHours; permit.StartTime = dto.StartTime ?? DateTime.UtcNow;
            permit.RiskAssessmentId = dto.RiskAssessmentId; permit.PrecautionsJson = dto.PrecautionsJson ?? "[]";
            permit.UpdatedAt = DateTime.UtcNow; permit.IsSynced = false;
            await _context.SaveChangesAsync();
            return Ok(permit);
        }

        [HttpDelete("risks/{id}")]
        public async Task<IActionResult> DeleteRiskAssessment(Guid id)
        {
            try
            {
                var ra = await _context.HsqeRiskAssessments.FindAsync(id);
                if (ra == null) return NotFound();

                _context.HsqeRiskAssessments.Remove(ra);
                await _context.SaveChangesAsync();
                return Ok(new { message = "Risk assessment deleted" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting risk assessment {Id}", id);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        [HttpDelete("permits/{id}")]
        public async Task<IActionResult> DeletePermit(Guid id)
        {
            try
            {
                var permit = await _context.HsqeWorkPermits.FindAsync(id);
                if (permit == null) return NotFound();

                if (permit.Status != "Draft" || await _context.ApprovalDocuments.AnyAsync(d => d.Module == "permit" && d.RecordKey == id.ToString()))
                    return Conflict(new { message = "Giữ nguyên giấy phép đã có lịch sử xác nhận." });
                _context.HsqeWorkPermits.Remove(permit);
                await _context.SaveChangesAsync();
                return Ok(new { message = "Permit deleted" });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ==========================================
        // DATA TRANSFER OBJECTS (DTOs)
        // ==========================================
        public class CreateDocDto
        {
            public string DocumentCode { get; set; } = string.Empty;
            public string Title { get; set; } = string.Empty;
            public string? Category { get; set; }
            public string Content { get; set; } = string.Empty;
            public bool IsControlled { get; set; } = true;
            public string? WatermarkText { get; set; }
            public string? CreatedBy { get; set; }
        }

        public class UpdateDocDto
        {
            public string? Title { get; set; }
            public string? Content { get; set; }
            public string? ChangeSummary { get; set; }
            public string? ChangedBy { get; set; }
            public string? WatermarkText { get; set; }
        }

        public class ApproveDocDto
        {
            public string? ApproverName { get; set; }
        }

        public class AcknowledgeDocDto
        {
            public string? ShipName { get; set; }
            public string? AcknowledgedBy { get; set; }
        }

        public class BulkDeleteDocumentsDto
        {
            public List<Guid> DocumentIds { get; set; } = new();
            public string? DeletedBy { get; set; }
            public string? Reason { get; set; }
        }

        public class CreateIncidentDto
        {
            public string Title { get; set; } = string.Empty;
            public string IncidentType { get; set; } = "Near-Miss";
            public string? Vessel { get; set; }
            public DateTime? OccurrenceDate { get; set; }
            public string Location { get; set; } = string.Empty;
            public string? Severity { get; set; }
            public string Description { get; set; } = string.Empty;
            public string? ImmediateActions { get; set; }
        }

        public class InvestigateDto
        {
            public string Why1 { get; set; } = string.Empty;
            public string Why2 { get; set; } = string.Empty;
            public string Why3 { get; set; } = string.Empty;
            public string Why4 { get; set; } = string.Empty;
            public string Why5 { get; set; } = string.Empty;
            public string RootCause { get; set; } = string.Empty;
        }

        public class CreateCapaDto
        {
            public string ActionType { get; set; } = "Corrective";
            public string Description { get; set; } = string.Empty;
            public string Assignee { get; set; } = string.Empty;
            public DateTime? DueDate { get; set; }
        }

        public class ToggleCapaDto
        {
            public string? VerificationDetails { get; set; }
        }

        public class CreateRiskDto
        {
            public string JobTitle { get; set; } = string.Empty;
            public string Department { get; set; } = "Engine";
            public string Pic { get; set; } = string.Empty;
            public string StepsJson { get; set; } = "[]";
        }

        public class CreatePermitDto
        {
            public string PermitType { get; set; } = "Cold";
            public string Title { get; set; } = string.Empty;
            public string? Vessel { get; set; }
            public string Location { get; set; } = string.Empty;
            public int DurationHours { get; set; } = 4;
            public DateTime? StartTime { get; set; }
            public Guid? RiskAssessmentId { get; set; }
            public string? PrecautionsJson { get; set; }
        }

        public class GasTestDto
        {
            public string Device { get; set; } = "";
            public double GasTestO2 { get; set; }
            public double GasTestLEL { get; set; }
            public double GasTestCO { get; set; }
            public double GasTestH2S { get; set; }
        }

        public class SignPermitDto { }

        public class MarkAsReadDto
        {
            public string UserName { get; set; } = string.Empty;
            public string? Rank { get; set; }
            public string? Notes { get; set; }
        }
    }
}
