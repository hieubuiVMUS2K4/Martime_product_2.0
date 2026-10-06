using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;
using System.Text.Json;
using System.IO;
using Microsoft.AspNetCore.Http;
using Mammoth;

using ProductApi.Services.Sync;
using Maritime.Shared.Models.Sync;

namespace ProductApi.Controllers
{
    [ApiController]
    [Route("api/sms")]
    public class SmsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly ILogger<SmsController> _logger;
        private readonly IConfiguration _configuration;
        private readonly ISyncOutboxService _syncOutboxService;

        public SmsController(
            AppDbContext context,
            ILogger<SmsController> logger,
            IConfiguration configuration,
            ISyncOutboxService syncOutboxService)
        {
            _context = context;
            _logger = logger;
            _configuration = configuration;
            _syncOutboxService = syncOutboxService;
        }

        private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true
        };

        // ==========================================
        // 1. GET ALL ISM ELEMENTS & PROCEDURES TREE
        // ==========================================
        [HttpGet("tree")]
        public async Task<IActionResult> GetSmsTree([FromQuery] string? search)
        {
            try
            {
                var elements = await _context.IsmElements
                    .Include(e => e.Procedures)
                        .ThenInclude(p => p.FormTemplates)
                    .OrderBy(e => e.Id)
                    .ToListAsync();

                var term = search?.Trim().ToLower();

                // Project to clean response format
                var result = elements.Select(e =>
                {
                    var procedures = e.Procedures.AsEnumerable();
                    if (!string.IsNullOrEmpty(term))
                    {
                        procedures = procedures.Where(p =>
                            p.ProcedureCode.ToLower().Contains(term) ||
                            p.Title.ToLower().Contains(term) ||
                            p.Content.ToLower().Contains(term)
                        );
                    }

                    return new
                    {
                        e.Id,
                        e.ChapterName,
                        Procedures = procedures.Select(p => new
                        {
                            p.Id,
                            p.ProcedureCode,
                            p.Title,
                            p.Version,
                            p.PublishDate,
                            p.Status,
                            p.WatermarkText,
                            p.FilePath,
                            FormTemplates = p.FormTemplates.Select(t => new
                            {
                                t.Id,
                                t.FormCode,
                                t.Title
                            }).ToList()
                        }).OrderBy(p => p.ProcedureCode).ToList()
                    };
                })
                .Where(e => e.Procedures.Any() || string.IsNullOrEmpty(term))
                .ToList();

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching SMS tree");
                return StatusCode(500, new { message = "Gặp lỗi khi tải cấu trúc dữ liệu SMS", error = ex.Message });
            }
        }

        // ==========================================
        // 2. GET PROCEDURE DETAILS
        // ==========================================
        [HttpGet("procedures/{id}")]
        public async Task<IActionResult> GetProcedure(Guid id)
        {
            try
            {
                var procedure = await _context.SmsProcedures
                    .Include(p => p.FormTemplates)
                    .Include(p => p.Acknowledgements)
                    .FirstOrDefaultAsync(p => p.Id == id);

                if (procedure == null)
                    return NotFound(new { message = "Không tìm thấy Quy trình yêu cầu" });

                return Ok(new
                {
                    procedure.Id,
                    procedure.IsmElementId,
                    procedure.ProcedureCode,
                    procedure.Title,
                    procedure.Content,
                    procedure.FilePath,
                    procedure.Version,
                    procedure.PublishDate,
                    procedure.Status,
                    procedure.ChangeNote,
                    procedure.ObsoleteDate,
                    procedure.WatermarkText,
                    FormTemplates = procedure.FormTemplates.Select(t => new
                    {
                        t.Id,
                        t.FormCode,
                        t.Title,
                        t.ContentSchema
                    }).ToList(),
                    Acknowledgements = procedure.Acknowledgements.Select(a => new
                    {
                        a.Id,
                        a.UserName,
                        a.Rank,
                        a.AcknowledgedAt
                    }).OrderByDescending(a => a.AcknowledgedAt).ToList()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching procedure {Id}", id);
                return StatusCode(500, new { message = "Lỗi khi lấy thông tin quy trình", error = ex.Message });
            }
        }

        // ==========================================
        // 3. READ & ACKNOWLEDGE PROCEDURE
        // ==========================================
        [HttpPost("procedures/{id}/acknowledge")]
        public async Task<IActionResult> AcknowledgeProcedure(Guid id, [FromBody] AcknowledgeRequest req)
        {
            try
            {
                var procedure = await _context.SmsProcedures.FindAsync(id);
                if (procedure == null)
                    return NotFound(new { message = "Không tìm thấy Quy trình" });

                if (procedure.Status == "Obsolete")
                    return BadRequest(new { message = "Quy trình này đã lỗi thời, không cần xác nhận đã đọc." });

                if (string.IsNullOrWhiteSpace(req.UserName) || string.IsNullOrWhiteSpace(req.Rank))
                    return BadRequest(new { message = "Vui lòng cung cấp đầy đủ tên và chức danh." });

                // Check if already acknowledged
                var existing = await _context.SmsProcedureAcknowledgements
                    .AnyAsync(a => a.SmsProcedureId == id && a.UserName == req.UserName && a.Rank == req.Rank);

                if (existing)
                    return Ok(new { message = "Thuyền viên đã xác nhận đọc quy trình này trước đó." });

                var ack = new SmsProcedureAcknowledge
                {
                    Id = Guid.NewGuid(),
                    SmsProcedureId = id,
                    UserName = req.UserName,
                    Rank = req.Rank,
                    AcknowledgedAt = DateTime.UtcNow,
                    IsSynced = false,
                    OriginNode = "SHORE"
                };

                await _context.SmsProcedureAcknowledgements.AddAsync(ack);
                await _context.SaveChangesAsync();

                return Ok(new { message = "Xác nhận đã đọc quy trình thành công." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error acknowledging procedure {Id}", id);
                return StatusCode(500, new { message = "Gặp lỗi khi lưu xác nhận", error = ex.Message });
            }
        }

        // ==========================================
        // 4. GET FORM TEMPLATE DETAILS BY ID
        // ==========================================
        [HttpGet("templates/{id}")]
        public async Task<IActionResult> GetFormTemplate(Guid id)
        {
            try
            {
                var template = await _context.SmsFormTemplates
                    .Include(t => t.Procedure)
                    .FirstOrDefaultAsync(t => t.Id == id);

                if (template == null)
                    return NotFound(new { message = "Không tìm thấy Biểu mẫu yêu cầu" });

                return Ok(new
                {
                    template.Id,
                    template.SmsProcedureId,
                    ProcedureCode = template.Procedure?.ProcedureCode,
                    ProcedureTitle = template.Procedure?.Title,
                    template.FormCode,
                    template.Title,
                    template.ContentSchema
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching form template {Id}", id);
                return StatusCode(500, new { message = "Lỗi khi lấy mẫu biểu", error = ex.Message });
            }
        }

        // ==========================================
        // 5. GET LIST OF ALL FORM TEMPLATES
        // ==========================================
        [HttpGet("templates")]
        public async Task<IActionResult> GetAllTemplates()
        {
            try
            {
                var templates = await _context.SmsFormTemplates
                    .Include(t => t.Procedure)
                    .OrderBy(t => t.FormCode)
                    .Select(t => new
                    {
                        t.Id,
                        t.SmsProcedureId,
                        ProcedureCode = t.Procedure != null ? t.Procedure.ProcedureCode : "",
                        ProcedureTitle = t.Procedure != null ? t.Procedure.Title : "",
                        t.FormCode,
                        t.Title,
                        t.ContentSchema
                    })
                    .ToListAsync();

                return Ok(templates);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching all form templates");
                return StatusCode(500, new { message = "Lỗi khi lấy danh sách biểu mẫu", error = ex.Message });
            }
        }

        // ==========================================
        // 6. GET FILLED RECORDS LIST (WITH FILTERS)
        // ==========================================
        [HttpGet("records")]
        public async Task<IActionResult> GetFilledRecords(
            [FromQuery] Guid? formTemplateId,
            [FromQuery] int? ismElementId,
            [FromQuery] int? ismChapter,
            [FromQuery] string? vesselName,
            [FromQuery] string? status)
        {
            try
            {
                var targetChapter = ismChapter ?? ismElementId;
                var query = _context.SmsFilledRecords
                    .Include(r => r.FormTemplate)
                        .ThenInclude(t => t!.Procedure)
                    .AsQueryable();

                if (formTemplateId.HasValue && formTemplateId.Value != Guid.Empty)
                {
                    query = query.Where(r => r.SmsFormTemplateId == formTemplateId.Value);
                }

                if (targetChapter.HasValue && targetChapter.Value > 0)
                {
                    query = query.Where(r => (r.FormTemplate != null &&
                                             r.FormTemplate.Procedure != null &&
                                             r.FormTemplate.Procedure.IsmElementId == targetChapter.Value));
                }

                if (!string.IsNullOrWhiteSpace(vesselName) && vesselName != "ALL")
                {
                    query = query.Where(r => r.VesselName.ToLower().Contains(vesselName.Trim().ToLower()));
                }

                if (!string.IsNullOrWhiteSpace(status) && status != "ALL")
                {
                    query = query.Where(r => r.Status == status);
                }

                var rawRecords = await query
                    .OrderByDescending(r => r.FilledDate)
                    .Select(r => new
                    {
                        r.Id,
                        r.SmsFormTemplateId,
                        FormCode = !string.IsNullOrWhiteSpace(r.FormCode) ? r.FormCode : (r.FormTemplate != null ? r.FormTemplate.FormCode : ""),
                        FormTitle = !string.IsNullOrWhiteSpace(r.FormTitle) ? r.FormTitle : (r.FormTemplate != null ? r.FormTemplate.Title : ""),
                        ProcedureCode = !string.IsNullOrWhiteSpace(r.ProcedureCode) ? r.ProcedureCode : (r.FormTemplate != null && r.FormTemplate.Procedure != null ? r.FormTemplate.Procedure.ProcedureCode : ""),
                        IsmElementId = r.FormTemplate != null && r.FormTemplate.Procedure != null ? (int?)r.FormTemplate.Procedure.IsmElementId : null,
                        r.VesselName,
                        r.FilledBy,
                        r.FilledDate,
                        r.FilledData,
                        r.DigitalSignatures,
                        r.Status
                    })
                    .ToListAsync();

                var procedures = await _context.SmsProcedures.AsNoTracking().ToListAsync();
                var procMap = procedures
                    .Where(p => !string.IsNullOrWhiteSpace(p.ProcedureCode))
                    .GroupBy(p => p.ProcedureCode, StringComparer.OrdinalIgnoreCase)
                    .ToDictionary(g => g.Key, g => g.First().IsmElementId, StringComparer.OrdinalIgnoreCase);

                var records = rawRecords.Select(r =>
                {
                    int? ismId = r.IsmElementId;
                    if (!ismId.HasValue && !string.IsNullOrEmpty(r.ProcedureCode) && procMap.TryGetValue(r.ProcedureCode, out var foundId))
                    {
                        ismId = foundId;
                    }

                    return new
                    {
                        r.Id,
                        r.SmsFormTemplateId,
                        r.FormCode,
                        r.FormTitle,
                        r.ProcedureCode,
                        IsmElementId = ismId,
                        IsmChapterId = ismId,
                        r.VesselName,
                        r.FilledBy,
                        r.FilledDate,
                        r.FilledData,
                        r.DigitalSignatures,
                        r.Status
                    };
                });

                return Ok(records);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching filled records");
                return StatusCode(500, new { message = "Lỗi khi lấy danh sách nhật ký ghi chép", error = ex.Message });
            }
        }

        // ==========================================
        // 7. GET SINGLE FILLED RECORD DETAILS BY ID
        // ==========================================
        [HttpGet("records/{id}")]
        public async Task<IActionResult> GetFilledRecordDetails(Guid id)
        {
            try
            {
                var record = await _context.SmsFilledRecords
                    .Include(r => r.FormTemplate)
                        .ThenInclude(t => t!.Procedure)
                    .FirstOrDefaultAsync(r => r.Id == id);

                if (record == null)
                    return NotFound(new { message = "Không tìm thấy nhật ký ghi chép yêu cầu" });

                return Ok(new
                {
                    record.Id,
                    record.SmsFormTemplateId,
                    FormCode = record.FormTemplate?.FormCode ?? "",
                    FormTitle = record.FormTemplate?.Title ?? "",
                    ContentSchema = record.FormTemplate?.ContentSchema ?? "[]",
                    ProcedureCode = record.FormTemplate?.Procedure?.ProcedureCode ?? "",
                    ProcedureTitle = record.FormTemplate?.Procedure?.Title ?? "",
                    record.VesselName,
                    record.FilledBy,
                    record.FilledDate,
                    record.FilledData,
                    record.DigitalSignatures,
                    record.Status
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching filled record {Id}", id);
                return StatusCode(500, new { message = "Lỗi khi tải thông tin nhật ký ghi chép", error = ex.Message });
            }
        }

        // ==========================================
        // 8. CREATE FILLED RECORD (DRAFT OR SUBMITTED)
        // ==========================================
        [HttpPost("records")]
        public async Task<IActionResult> CreateFilledRecord([FromBody] CreateRecordRequest req)
        {
            try
            {
                var template = await _context.SmsFormTemplates.FindAsync(req.FormTemplateId);
                if (template == null)
                    return NotFound(new { message = "Không tìm thấy Mẫu biểu tương ứng." });

                var record = new SmsFilledRecord
                {
                    Id = Guid.NewGuid(),
                    SmsFormTemplateId = req.FormTemplateId,
                    FormCode = template.FormCode,
                    VesselName = string.IsNullOrWhiteSpace(req.VesselName) ? "M/V Green Star" : req.VesselName,
                    FilledBy = req.FilledBy,
                    FilledDate = DateTime.UtcNow,
                    FilledData = req.FilledData,
                    DigitalSignatures = "[]",
                    Status = req.SubmitImmediately ? "Submitted" : "Draft",
                    IsSynced = false,
                    OriginNode = "SHORE"
                };

                await _context.SmsFilledRecords.AddAsync(record);
                await _context.SaveChangesAsync();

                return Ok(new
                {
                    message = req.SubmitImmediately ? "Đã gửi báo cáo / biểu mẫu thành công." : "Đã lưu bản nháp thành công.",
                    recordId = record.Id,
                    status = record.Status
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating filled record");
                return StatusCode(500, new { message = "Lỗi khi lưu biểu mẫu ghi chép", error = ex.Message });
            }
        }

        // ==========================================
        // 8B. UPDATE FILLED RECORD (DRAFT ONLY)
        // ==========================================
        [HttpPut("records/{id}")]
        public async Task<IActionResult> UpdateFilledRecord(Guid id, [FromBody] UpdateRecordRequest req)
        {
            try
            {
                var record = await _context.SmsFilledRecords.FindAsync(id);
                if (record == null)
                    return NotFound(new { message = "Không tìm thấy nhật ký ghi chép yêu cầu." });

                if (record.Status == "Approved")
                    return BadRequest(new { message = "Hồ sơ đã được phê duyệt chính thức, không thể chỉnh sửa." });

                record.FilledBy = req.FilledBy;
                record.FilledData = req.FilledData;
                record.UpdatedAt = DateTime.UtcNow;
                record.IsSynced = false;

                if (req.SubmitImmediately)
                {
                    record.Status = "Submitted";
                }

                await _context.SaveChangesAsync();

                return Ok(new
                {
                    message = req.SubmitImmediately ? "Đã cập nhật và gửi báo cáo thành công." : "Đã cập nhật bản nháp thành công.",
                    recordId = record.Id,
                    status = record.Status
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating filled record {Id}", id);
                return StatusCode(500, new { message = "Gặp lỗi khi cập nhật biểu mẫu ghi chép", error = ex.Message });
            }
        }

        // ==========================================
        // 9. SIGN FILLED RECORD (ADD DIGITAL SIGNATURE STAMP)
        // ==========================================
        [HttpPost("records/{id}/sign")]
        public async Task<IActionResult> SignFilledRecord(Guid id, [FromBody] SignRequest req)
        {
            try
            {
                var record = await _context.SmsFilledRecords.FindAsync(id);
                if (record == null)
                    return NotFound(new { message = "Không tìm thấy hồ sơ ghi chép" });

                // PIN verification logic (Demo PIN: 1111)
                if (req.Pin != "1111")
                {
                    return BadRequest(new { message = "Mã PIN xác thực chữ ký điện tử không chính xác." });
                }

                var signatures = new List<SignatureEntry>();
                if (!string.IsNullOrEmpty(record.DigitalSignatures) && record.DigitalSignatures != "[]")
                {
                    try
                    {
                        signatures = JsonSerializer.Deserialize<List<SignatureEntry>>(record.DigitalSignatures, JsonOptions) ?? new List<SignatureEntry>();
                    }
                    catch { }
                }

                // Check duplicate signature
                if (signatures.Any(s => s.Name == req.Name && s.Rank == req.Rank))
                {
                    return BadRequest(new { message = $"{req.Rank} - {req.Name} đã ký duyệt vào hồ sơ này trước đó." });
                }

                var sigCode = $"SIG-{Guid.NewGuid().ToString().Substring(0, 8).ToUpper()}";
                signatures.Add(new SignatureEntry
                {
                    Name = req.Name,
                    Rank = req.Rank,
                    Timestamp = DateTime.UtcNow,
                    SigCode = sigCode
                });

                record.DigitalSignatures = JsonSerializer.Serialize(signatures, JsonOptions);
                if (record.Status == "Draft")
                {
                    record.Status = "Submitted";
                }
                record.IsSynced = false;
                record.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                return Ok(new
                {
                    message = "Ký số điện tử thành công.",
                    signatures = signatures,
                    status = record.Status
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error signing record {Id}", id);
                return StatusCode(500, new { message = "Lỗi khi thực hiện ký số", error = ex.Message });
            }
        }

        // ==========================================
        // 9B. APPROVE FILLED RECORD (FINAL APPROVAL)
        // ==========================================
        [HttpPost("records/{id}/approve")]
        public async Task<IActionResult> ApproveFilledRecord(Guid id, [FromBody] ApproveRequest req)
        {
            try
            {
                var record = await _context.SmsFilledRecords.FindAsync(id);
                if (record == null)
                    return NotFound(new { message = "Không tìm thấy hồ sơ ghi chép" });

                if (req.Pin != "1111")
                {
                    return BadRequest(new { message = "Mã PIN phê duyệt không chính xác." });
                }

                var signatures = new List<SignatureEntry>();
                if (!string.IsNullOrEmpty(record.DigitalSignatures) && record.DigitalSignatures != "[]")
                {
                    try
                    {
                        signatures = JsonSerializer.Deserialize<List<SignatureEntry>>(record.DigitalSignatures, JsonOptions) ?? new List<SignatureEntry>();
                    }
                    catch { }
                }

                var sigCode = $"APP-{Guid.NewGuid().ToString().Substring(0, 8).ToUpper()}";
                signatures.Add(new SignatureEntry
                {
                    Name = req.Name,
                    Rank = string.IsNullOrEmpty(req.Rank) ? "Thuyền trưởng (Master) / QLAT (DPA)" : req.Rank,
                    Timestamp = DateTime.UtcNow,
                    SigCode = sigCode
                });

                record.DigitalSignatures = JsonSerializer.Serialize(signatures, JsonOptions);
                record.Status = "Approved";
                record.IsSynced = false;
                record.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                return Ok(new
                {
                    message = "Phê duyệt hồ sơ SMS chính thức thành công.",
                    signatures = signatures,
                    status = record.Status
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error approving record {Id}", id);
                return StatusCode(500, new { message = "Lỗi khi thực hiện phê duyệt hồ sơ", error = ex.Message });
            }
        }

        // ==========================================
        // 10. BUMP PROCEDURE VERSION (BAN HÀNH PHIÊN BẢN MỚI)
        // ==========================================
        [HttpPost("procedures/version-up")]
        public async Task<IActionResult> BumpProcedureVersion([FromBody] BumpVersionRequest req)
        {
            try
            {
                var currentProcedure = await _context.SmsProcedures
                    .FirstOrDefaultAsync(p => p.Id == req.ProcedureId);

                if (currentProcedure == null)
                    return NotFound(new { message = "Không tìm thấy quy trình nguồn" });

                // 1. Obsolete older active versions of the same code
                var code = currentProcedure.ProcedureCode;
                var olderProcedures = await _context.SmsProcedures
                    .Where(p => p.ProcedureCode == code && p.Status == "Active")
                    .ToListAsync();

                foreach (var old in olderProcedures)
                {
                    old.Status = "Obsolete";
                    old.ObsoleteDate = DateTime.UtcNow;
                    old.WatermarkText = "TÀI LIỆU LỖI THỜI (OBSOLETE)";
                    old.UpdatedAt = DateTime.UtcNow;
                    old.IsSynced = false;
                    _context.SmsProcedures.Update(old);
                }

                // 2. Create new procedure revision
                var newProc = new SmsProcedure
                {
                    Id = Guid.NewGuid(),
                    IsmElementId = currentProcedure.IsmElementId,
                    ProcedureCode = code,
                    Title = currentProcedure.Title,
                    Content = string.IsNullOrWhiteSpace(req.NewContent) ? currentProcedure.Content : req.NewContent,
                    Version = req.NewVersion,
                    PublishDate = DateTime.UtcNow,
                    Status = "Active",
                    ChangeNote = req.ChangeNote,
                    WatermarkText = "TÀI LIỆU ĐƯỢC KIỂM SOÁT",
                    FilePath = !string.IsNullOrWhiteSpace(req.FilePath) ? req.FilePath : currentProcedure.FilePath,
                    IsSynced = false,
                    OriginNode = "SHORE"
                };

                await _context.SmsProcedures.AddAsync(newProc);

                // 3. Duplicate templates from older to new procedure
                var templates = await _context.SmsFormTemplates
                    .Where(t => t.SmsProcedureId == currentProcedure.Id)
                    .ToListAsync();

                var duplicatedTemplates = new List<SmsFormTemplate>();
                foreach (var temp in templates)
                {
                    var newTemp = new SmsFormTemplate
                    {
                        Id = Guid.NewGuid(),
                        SmsProcedureId = newProc.Id,
                        FormCode = temp.FormCode,
                        Title = temp.Title,
                        ContentSchema = temp.ContentSchema,
                        IsSynced = false,
                        OriginNode = "SHORE"
                    };
                    await _context.SmsFormTemplates.AddAsync(newTemp);
                    duplicatedTemplates.Add(newTemp);
                }

                await _context.SaveChangesAsync();

                // Broadcast sync outbox items to all edge nodes
                foreach (var old in olderProcedures)
                {
                    await _syncOutboxService.BroadcastAsync("sms_procedures", old.Id.ToString(), SyncActionType.UPDATE, old);
                }
                await _syncOutboxService.BroadcastAsync("sms_procedures", newProc.Id.ToString(), SyncActionType.CREATE, newProc);
                foreach (var dt in duplicatedTemplates)
                {
                    await _syncOutboxService.BroadcastAsync("sms_form_templates", dt.Id.ToString(), SyncActionType.CREATE, dt);
                }

                return Ok(new { message = "Cập nhật phiên bản mới thành công. Phiên bản cũ đã được đưa vào kho lưu trữ Lỗi thời.", newProcedureId = newProc.Id });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error bumping procedure version");
                return StatusCode(500, new { message = "Gặp lỗi khi tạo phiên bản mới", error = ex.Message });
            }
        }

        // ==========================================
        // 11. IMPORT WORD/PDF PROCEDURE (EXTRACT TEXT & SAVE PDF)
        // ==========================================
        [HttpPost("procedures/import")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> ImportProcedureDocument([FromForm] IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0)
                {
                    return BadRequest(new { message = "Vui lòng chọn file (.docx, .doc, .pdf) để upload." });
                }

                var ext = Path.GetExtension(file.FileName).ToLower();
                if (ext != ".docx" && ext != ".doc" && ext != ".pdf")
                {
                    return BadRequest(new { message = "Chỉ chấp nhận các định dạng file .docx, .doc hoặc .pdf." });
                }

                byte[] pdfBytes;
                string plainText = "";

                if (ext == ".pdf")
                {
                    // 1. If it's already a PDF, read bytes directly without conversion
                    using (var memoryStream = new MemoryStream())
                    {
                        await file.CopyToAsync(memoryStream);
                        pdfBytes = memoryStream.ToArray();
                    }
                    plainText = $"<p>[Nội dung định dạng tài liệu PDF - Vui lòng xem chi tiết bằng file đính kèm: {file.FileName}]</p>";
                }
                else
                {
                    // 2. Convert Word (.docx or .doc) to PDF using local Gotenberg headless LibreOffice API
                    try
                    {
                        using (var httpClient = new System.Net.Http.HttpClient())
                        {
                            httpClient.Timeout = TimeSpan.FromSeconds(60);

                            using (var formContent = new System.Net.Http.MultipartFormDataContent())
                            {
                                using (var fileStream = file.OpenReadStream())
                                using (var streamContent = new System.Net.Http.StreamContent(fileStream))
                                {
                                    string mediaType = ext == ".doc" 
                                        ? "application/msword" 
                                        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                                    
                                    streamContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(mediaType);
                                    formContent.Add(streamContent, "files", file.FileName);

                                    var gotenbergUrl = (_configuration["DocumentConversion:GotenbergUrl"] ?? "http://localhost:3200").TrimEnd('/');
                                    var response = await httpClient.PostAsync($"{gotenbergUrl}/forms/libreoffice/convert", formContent);
                                    if (!response.IsSuccessStatusCode)
                                    {
                                        var errorText = await response.Content.ReadAsStringAsync();
                                        throw new Exception($"Gotenberg PDF conversion failed: {response.StatusCode} - {errorText}");
                                    }
                                    pdfBytes = await response.Content.ReadAsByteArrayAsync();
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "PDF conversion failed for {FileName}", file.FileName);
                        return StatusCode(503, new { message = "Không thể chuyển tài liệu Word sang PDF. Vui lòng thử lại khi dịch vụ chuyển đổi sẵn sàng." });
                    }

                    // 3. Extract Plain Text from .docx using Mammoth. If it is .doc, set a placeholder.
                    if (ext == ".docx")
                    {
                        try
                        {
                            using (var docxStream = file.OpenReadStream())
                            {
                                var mammothConverter = new DocumentConverter();
                                var textResult = mammothConverter.ExtractRawText(docxStream);
                                plainText = textResult.Value;
                                if (!string.IsNullOrEmpty(plainText))
                                {
                                    plainText = plainText.Normalize(System.Text.NormalizationForm.FormC);
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to extract plain text using Mammoth");
                            plainText = $"<p>[Nội dung bóc tách từ file Word gặp lỗi - Xem chi tiết bằng file đính kèm: {file.FileName}]</p>";
                        }
                    }
                    else // .doc
                    {
                        plainText = $"<p>[Nội dung định dạng tài liệu Word cũ .doc - Xem chi tiết bằng file đính kèm: {file.FileName}]</p>";
                    }
                }

                // 4. Save PDF file to disk under uploads/sms
                var uploadsDir = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "sms");
                if (!Directory.Exists(uploadsDir))
                {
                    Directory.CreateDirectory(uploadsDir);
                }

                var baseGuid = Guid.NewGuid().ToString();
                var pdfUniqueFileName = $"SMS_{baseGuid}_{Path.GetFileNameWithoutExtension(file.FileName)}.pdf";
                var pdfFilePath = Path.Combine(uploadsDir, pdfUniqueFileName);

                await System.IO.File.WriteAllBytesAsync(pdfFilePath, pdfBytes);

                var downloadUrl = $"/uploads/sms/{pdfUniqueFileName}";

                return Ok(new
                {
                    message = "Xử lý file tài liệu thành công",
                    html = plainText,
                    filePath = downloadUrl
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error importing file {FileName}", file?.FileName);
                return StatusCode(500, new { message = "Gặp lỗi khi xử lý file tài liệu", error = ex.Message });
            }
        }

        // ==========================================
        // 12. CREATE NEW PROCEDURE
        // ==========================================
        [HttpPost("procedures")]
        public async Task<IActionResult> CreateProcedure([FromBody] CreateProcedureRequest req)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(req.ProcedureCode) || string.IsNullOrWhiteSpace(req.Title))
                {
                    return BadRequest(new { message = "Vui lòng cung cấp đầy đủ mã quy trình và tiêu đề." });
                }

                // Check if code already exists under active state
                var exists = await _context.SmsProcedures
                    .AnyAsync(p => p.ProcedureCode == req.ProcedureCode && p.Status == "Active");
                if (exists)
                {
                    return BadRequest(new { message = $"Quy trình với mã số {req.ProcedureCode} đã tồn tại và đang hoạt động." });
                }

                var proc = new SmsProcedure
                {
                    Id = Guid.NewGuid(),
                    IsmElementId = req.IsmElementId,
                    ProcedureCode = req.ProcedureCode,
                    Title = req.Title,
                    Content = req.Content,
                    Version = req.Version,
                    FilePath = req.FilePath,
                    PublishDate = DateTime.UtcNow,
                    Status = "Active",
                    WatermarkText = "TÀI LIỆU ĐƯỢC KIỂM SOÁT",
                    IsSynced = false,
                    OriginNode = "SHORE"
                };

                await _context.SmsProcedures.AddAsync(proc);
                await _context.SaveChangesAsync();

                await _syncOutboxService.BroadcastAsync("sms_procedures", proc.Id.ToString(), SyncActionType.CREATE, proc);

                return Ok(new { message = "Tạo mới quy trình thành công.", procedureId = proc.Id });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating procedure");
                return StatusCode(500, new { message = "Lỗi khi tạo quy trình mới", error = ex.Message });
            }
        }

        // ==========================================
        // 13. CREATE FORM TEMPLATE (LINK TO PROCEDURE)
        // ==========================================
        [HttpPost("templates")]
        public async Task<IActionResult> CreateFormTemplate([FromBody] CreateFormTemplateRequest req)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(req.FormCode) || string.IsNullOrWhiteSpace(req.Title))
                {
                    return BadRequest(new { message = "Vui lòng nhập đầy đủ mã và tiêu đề biểu mẫu." });
                }

                var procedure = await _context.SmsProcedures.FindAsync(req.SmsProcedureId);
                if (procedure == null)
                {
                    return NotFound(new { message = "Quy trình liên kết không tồn tại." });
                }

                if (procedure.Status == "Obsolete")
                    return BadRequest(new { message = "Quy trình đã lỗi thời, không thể gắn biểu mẫu mới." });

                var template = new SmsFormTemplate
                {
                    Id = Guid.NewGuid(),
                    SmsProcedureId = req.SmsProcedureId,
                    FormCode = req.FormCode,
                    Title = req.Title,
                    ContentSchema = string.IsNullOrWhiteSpace(req.ContentSchema) ? "[]" : req.ContentSchema,
                    IsSynced = false,
                    OriginNode = "SHORE"
                };

                await _context.SmsFormTemplates.AddAsync(template);
                await _context.SaveChangesAsync();

                await _syncOutboxService.BroadcastAsync("sms_form_templates", template.Id.ToString(), SyncActionType.CREATE, template);

                return Ok(new { message = "Tạo mới biểu mẫu thành công.", templateId = template.Id });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating form template");
                return StatusCode(500, new { message = "Gặp lỗi khi tạo mới biểu mẫu", error = ex.Message });
            }
        }


        // ==========================================
        // 15. ASSIGN EXISTING FORM TEMPLATES TO A PROCEDURE (CLONE/DUPLICATE)
        // ==========================================
        [HttpPost("procedures/{procedureId}/assign-templates")]
        public async Task<IActionResult> AssignTemplates(Guid procedureId, [FromBody] AssignTemplatesRequest req)
        {
            try
            {
                var procedure = await _context.SmsProcedures.FindAsync(procedureId);
                if (procedure == null)
                    return NotFound(new { message = "Không tìm thấy quy trình liên kết." });

                if (procedure.Status == "Obsolete")
                    return BadRequest(new { message = "Quy trình đã lỗi thời, không thể gán thêm biểu mẫu." });

                var templateIds = req.TemplateIds;
                if (templateIds == null || !templateIds.Any())
                    return BadRequest(new { message = "Vui lòng chọn ít nhất một biểu mẫu để gán." });

                var templates = await _context.SmsFormTemplates
                    .Where(t => templateIds.Contains(t.Id))
                    .ToListAsync();

                if (!templates.Any())
                    return BadRequest(new { message = "Không tìm thấy các biểu mẫu được chọn." });

                var assignedTemplates = new List<SmsFormTemplate>();
                foreach (var temp in templates)
                {
                    var exists = await _context.SmsFormTemplates
                        .AnyAsync(t => t.FormCode == temp.FormCode && t.SmsProcedureId == procedureId);
                    
                    if (exists)
                    {
                        continue;
                    }

                    var newTemp = new SmsFormTemplate
                    {
                        Id = Guid.NewGuid(),
                        SmsProcedureId = procedureId,
                        FormCode = temp.FormCode,
                        Title = temp.Title,
                        ContentSchema = temp.ContentSchema,
                        IsSynced = false,
                        OriginNode = "SHORE",
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    await _context.SmsFormTemplates.AddAsync(newTemp);
                    assignedTemplates.Add(newTemp);
                }

                if (assignedTemplates.Any())
                {
                    await _context.SaveChangesAsync();

                    foreach (var assigned in assignedTemplates)
                    {
                        await _syncOutboxService.BroadcastAsync("sms_form_templates", assigned.Id.ToString(), SyncActionType.CREATE, assigned);
                    }
                }

                return Ok(new 
                { 
                    message = $"Đã gán thành công {assignedTemplates.Count} biểu mẫu vào quy trình.",
                    assignedTemplateIds = assignedTemplates.Select(t => t.Id).ToList()
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error assigning templates to procedure {ProcedureId}", procedureId);
                return StatusCode(500, new { message = "Gặp lỗi khi gán biểu mẫu", error = ex.Message });
            }
        }

        // ==========================================
        // 16. DELETE PROCEDURE
        // ==========================================
        [HttpDelete("procedures/{id}")]
        public async Task<IActionResult> DeleteProcedure(Guid id)
        {
            try
            {
                var procedure = await _context.SmsProcedures
                    .Include(p => p.Acknowledgements)
                    .Include(p => p.FormTemplates)
                        .ThenInclude(t => t.FilledRecords)
                    .FirstOrDefaultAsync(p => p.Id == id);

                if (procedure == null)
                    return NotFound(new { message = "Không tìm thấy Quy trình cần xóa" });

                // Remove related filled records
                foreach (var template in procedure.FormTemplates)
                {
                    _context.SmsFilledRecords.RemoveRange(template.FilledRecords);
                    await _syncOutboxService.BroadcastAsync("sms_form_templates", template.Id.ToString(), SyncActionType.DELETE, new { Id = template.Id });
                }

                // Remove related form templates
                _context.SmsFormTemplates.RemoveRange(procedure.FormTemplates);

                // Remove related acknowledgements
                _context.SmsProcedureAcknowledgements.RemoveRange(procedure.Acknowledgements);

                // Remove the procedure itself
                _context.SmsProcedures.Remove(procedure);

                await _context.SaveChangesAsync();

                await _syncOutboxService.BroadcastAsync("sms_procedures", id.ToString(), SyncActionType.DELETE,
                    new { Id = id, procedure.ProcedureCode, procedure.Version, procedure.Title });

                return Ok(new { message = "Xóa quy trình thành công." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting procedure {Id}", id);
                return StatusCode(500, new { message = "Gặp lỗi khi xóa quy trình", error = ex.Message });
            }
        }

        // ==========================================
        // 17. UNASSIGN / DELETE FORM TEMPLATE
        // ==========================================
        [HttpDelete("templates/{id}")]
        public async Task<IActionResult> DeleteFormTemplate(Guid id)
        {
            try
            {
                var template = await _context.SmsFormTemplates
                    .Include(t => t.FilledRecords)
                    .FirstOrDefaultAsync(t => t.Id == id);

                if (template == null)
                    return NotFound(new { message = "Không tìm thấy biểu mẫu cần xóa." });

                if (template.FilledRecords.Any())
                {
                    return BadRequest(new { message = "Biểu mẫu này đã có hồ sơ ghi chép (filled records) được điền, không thể xóa để bảo toàn dữ liệu." });
                }

                _context.SmsFormTemplates.Remove(template);
                await _context.SaveChangesAsync();

                await _syncOutboxService.BroadcastAsync("sms_form_templates", id.ToString(), SyncActionType.DELETE, new { Id = id });

                return Ok(new { message = "Xóa biểu mẫu thành công." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting form template {Id}", id);
                return StatusCode(500, new { message = "Gặp lỗi khi xóa biểu mẫu", error = ex.Message });
            }
        }
    }

    // ─── DTO Request Models ───────────────────────────

    public class AcknowledgeRequest
    {
        public string UserName { get; set; } = string.Empty;
        public string Rank { get; set; } = string.Empty;
    }

    public class CreateRecordRequest
    {
        public Guid FormTemplateId { get; set; }
        public string VesselName { get; set; } = "M/V Green Star";
        public string FilledBy { get; set; } = string.Empty;
        public string FilledData { get; set; } = "{}";
        public bool SubmitImmediately { get; set; } = false;
    }

    public class UpdateRecordRequest
    {
        public string FilledBy { get; set; } = string.Empty;
        public string FilledData { get; set; } = "{}";
        public bool SubmitImmediately { get; set; } = false;
    }

    public class SignRequest
    {
        public string Pin { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Rank { get; set; } = string.Empty;
    }

    public class ApproveRequest
    {
        public string Pin { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Rank { get; set; } = string.Empty;
    }

    public class BumpVersionRequest
    {
        public Guid ProcedureId { get; set; }
        public string NewVersion { get; set; } = string.Empty;
        public string NewContent { get; set; } = string.Empty;
        public string? ChangeNote { get; set; }
        public string? FilePath { get; set; }
    }

    public class SignatureEntry
    {
        public string Name { get; set; } = string.Empty;
        public string Rank { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; }
        public string SigCode { get; set; } = string.Empty;
    }

    public class CreateProcedureRequest
    {
        public int IsmElementId { get; set; }
        public string ProcedureCode { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public string Version { get; set; } = "Rev 1.0";
        public string? FilePath { get; set; }
    }

    public class CreateFormTemplateRequest
    {
        public Guid SmsProcedureId { get; set; }
        public string FormCode { get; set; } = string.Empty;
        public string Title { get; set; } = string.Empty;
        public string? ContentSchema { get; set; }
    }

    public class AssignTemplatesRequest
    {
        public List<Guid> TemplateIds { get; set; } = new List<Guid>();
    }
}
