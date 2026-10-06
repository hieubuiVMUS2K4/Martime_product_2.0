using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using System.Text.Json;
using System.IO;
using Microsoft.AspNetCore.Http;
using Mammoth;

namespace MaritimeEdge.Controllers.Safety
{
    [ApiController]
    [Route("api/sms")]
    public class SmsController : ControllerBase
    {
        private readonly EdgeDbContext _context;
        private readonly ILogger<SmsController> _logger;
        private readonly IConfiguration _configuration;

        public SmsController(EdgeDbContext context, ILogger<SmsController> logger, IConfiguration configuration)
        {
            _context = context;
            _logger = logger;
            _configuration = configuration;
        }

        private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true
        };

        private Task<IActionResult> ShoreManagedPolicy() => Task.FromResult<IActionResult>(
            StatusCode(StatusCodes.Status403Forbidden, new
            {
                code = "SMS_POLICY_SHORE_ONLY",
                message = "Chính sách, quy trình và biểu mẫu SMS chỉ được cập nhật từ bờ (Shore). Tàu (Edge) chỉ được xem tài liệu và thực hiện hồ sơ."
            }));

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
                    OriginNode = "SHIP_01"
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
        // 4. GET FORM TEMPLATE SCHEMA
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

                if (template.Procedure?.Status == "Obsolete")
                {
                    return BadRequest(new { message = "Quy trình liên kết với Biểu mẫu này đã lỗi thời. Không được phép điền mới." });
                }

                return Ok(new
                {
                    template.Id,
                    template.SmsProcedureId,
                    template.FormCode,
                    template.Title,
                    template.ContentSchema,
                    ProcedureTitle = template.Procedure?.Title,
                    ProcedureCode = template.Procedure?.ProcedureCode
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching form template {Id}", id);
                return StatusCode(500, new { message = "Lỗi khi lấy thông tin biểu mẫu", error = ex.Message });
            }
        }

        // ==========================================
        // 5. GET ALL FILLED RECORDS (AUDITOR CROSS-REFERENCE)
        // ==========================================
        [HttpGet("records")]
        public async Task<IActionResult> GetFilledRecords([FromQuery] int? ismChapter, [FromQuery] string? status)
        {
            try
            {
                var query = _context.SmsFilledRecords
                    .Include(r => r.FormTemplate)
                        .ThenInclude(t => t!.Procedure)
                    .AsQueryable();

                if (ismChapter.HasValue)
                {
                    query = query.Where(r => r.FormTemplate!.Procedure!.IsmElementId == ismChapter.Value);
                }

                if (!string.IsNullOrEmpty(status) && status != "ALL")
                {
                    query = query.Where(r => r.Status == status);
                }

                var records = await query
                    .OrderByDescending(r => r.FilledDate)
                    .ToListAsync();

                var result = records.Select(r => new
                {
                    r.Id,
                    r.VesselName,
                    r.FilledBy,
                    r.FilledDate,
                    r.FilledData,
                    r.DigitalSignatures,
                    r.Status,
                    FormTitle = r.FormTemplate?.Title,
                    FormCode = r.FormTemplate?.FormCode,
                    ProcedureCode = r.FormTemplate?.Procedure?.ProcedureCode,
                    IsmChapterId = r.FormTemplate?.Procedure?.IsmElementId
                });

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error querying filled records");
                return StatusCode(500, new { message = "Gặp lỗi khi truy vấn hồ sơ", error = ex.Message });
            }
        }

        // ==========================================
        // 6. CREATE FILLED RECORD
        // ==========================================
        [HttpPost("records")]
        public async Task<IActionResult> CreateFilledRecord([FromBody] CreateRecordRequest req)
        {
            try
            {
                var template = await _context.SmsFormTemplates
                    .Include(t => t.Procedure)
                    .FirstOrDefaultAsync(t => t.Id == req.FormTemplateId);

                if (template == null)
                    return NotFound(new { message = "Không tìm thấy Biểu mẫu" });

                if (template.Procedure?.Status == "Obsolete")
                    return BadRequest(new { message = "Quy trình của biểu mẫu này đã lỗi thời, không thể tạo hồ sơ mới." });

                var record = new SmsFilledRecord
                {
                    Id = Guid.NewGuid(),
                    SmsFormTemplateId = req.FormTemplateId,
                    FormCode = template.FormCode,
                    FormTitle = template.Title,
                    ProcedureCode = template.Procedure?.ProcedureCode ?? string.Empty,
                    VesselName = string.IsNullOrWhiteSpace(req.VesselName) ? "M/V Green Star" : req.VesselName,
                    FilledBy = req.FilledBy,
                    FilledDate = DateTime.UtcNow,
                    FilledData = req.FilledData,
                    DigitalSignatures = "[]",
                    Status = req.SubmitImmediately ? "Submitted" : "Draft",
                    IsSynced = false,
                    OriginNode = "SHIP_01"
                };

                await _context.SmsFilledRecords.AddAsync(record);
                await _context.SaveChangesAsync();

                return Ok(new { message = "Lưu hồ sơ thành công", recordId = record.Id, status = record.Status });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating filled record");
                return StatusCode(500, new { message = "Gặp lỗi khi tạo hồ sơ", error = ex.Message });
            }
        }

        // ==========================================
        // 7. UPDATE FILLED RECORD (SAVE DRAFT)
        // ==========================================
        [HttpPut("records/{id}")]
        public async Task<IActionResult> UpdateFilledRecord(Guid id, [FromBody] UpdateRecordRequest req)
        {
            try
            {
                var record = await _context.SmsFilledRecords.FindAsync(id);
                if (record == null)
                    return NotFound(new { message = "Không tìm thấy Hồ sơ" });

                if (record.Status == "Approved")
                    return BadRequest(new { message = "Hồ sơ đã được phê duyệt, không thể chỉnh sửa." });

                record.FilledData = req.FilledData;
                record.FilledBy = req.FilledBy;
                record.UpdatedAt = DateTime.UtcNow;
                record.IsSynced = false;

                if (req.SubmitImmediately)
                {
                    record.Status = "Submitted";
                }

                _context.SmsFilledRecords.Update(record);
                await _context.SaveChangesAsync();

                return Ok(new { message = "Cập nhật hồ sơ thành công", status = record.Status });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating filled record {Id}", id);
                return StatusCode(500, new { message = "Gặp lỗi khi cập nhật hồ sơ", error = ex.Message });
            }
        }

        // ==========================================
        // 8. E-SIGNATURE (PIN SIGN OFF)
        // ==========================================
        [HttpPost("records/{id}/sign")]
        public async Task<IActionResult> SignRecord(Guid id, [FromBody] SignRequest req)
        {
            try
            {
                var record = await _context.SmsFilledRecords
                    .Include(r => r.FormTemplate)
                    .FirstOrDefaultAsync(r => r.Id == id);

                if (record == null)
                    return NotFound(new { message = "Không tìm thấy Hồ sơ" });

                if (record.Status == "Approved")
                    return BadRequest(new { message = "Hồ sơ đã được phê duyệt hoàn tất." });

                // Simple maritime PIN check:
                // Captain PIN: 1111 or 1234
                // Officers/Crew PIN: any 4 digits
                if (string.IsNullOrWhiteSpace(req.Pin) || req.Pin.Length != 4 || !req.Pin.All(char.IsDigit))
                {
                    return BadRequest(new { message = "Mã PIN chữ ký số không hợp lệ (yêu cầu 4 chữ số)." });
                }

                // Add signature to JSON array
                var signatures = JsonSerializer.Deserialize<List<SignatureEntry>>(record.DigitalSignatures, JsonOptions) ?? new List<SignatureEntry>();

                // Check if this rank already signed
                if (signatures.Any(s => s.Rank == req.Rank))
                {
                    return BadRequest(new { message = $"Chức danh {req.Rank} đã ký vào hồ sơ này." });
                }

                var newSig = new SignatureEntry
                {
                    Name = req.Name,
                    Rank = req.Rank,
                    Timestamp = DateTime.UtcNow,
                    SigCode = $"SIG-{req.Rank.Replace(" ", "").ToUpper()}-{Guid.NewGuid().ToString()[..8].ToUpper()}"
                };

                signatures.Add(newSig);
                record.DigitalSignatures = JsonSerializer.Serialize(signatures, JsonOptions);
                record.IsSynced = false;
                record.UpdatedAt = DateTime.UtcNow;

                // Auto-transition to Submitted if signed by officer, or just update
                if (record.Status == "Draft")
                {
                    record.Status = "Submitted";
                }

                _context.SmsFilledRecords.Update(record);
                await _context.SaveChangesAsync();

                return Ok(new { message = "Ký chữ ký số điện tử thành công", signatures, status = record.Status });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error signing record {Id}", id);
                return StatusCode(500, new { message = "Gặp lỗi khi ký số", error = ex.Message });
            }
        }

        // ==========================================
        // 9. APPROVE RECORD (CAPTAIN/CHIEF ENGINEER APPROVAL)
        // ==========================================
        [HttpPost("records/{id}/approve")]
        public async Task<IActionResult> ApproveRecord(Guid id, [FromBody] ApproveRequest req)
        {
            try
            {
                var record = await _context.SmsFilledRecords
                    .Include(r => r.FormTemplate)
                    .FirstOrDefaultAsync(r => r.Id == id);

                if (record == null)
                    return NotFound(new { message = "Không tìm thấy Hồ sơ" });

                if (record.Status == "Approved")
                    return Ok(new { message = "Hồ sơ đã được phê duyệt trước đó." });

                // Require Captain or DPA level signature
                if (string.IsNullOrWhiteSpace(req.Pin) || req.Pin != "1111")
                {
                    return BadRequest(new { message = "Mã PIN phê duyệt của Thuyền trưởng không đúng (Gợi ý: 1111)." });
                }

                var signatures = JsonSerializer.Deserialize<List<SignatureEntry>>(record.DigitalSignatures, JsonOptions) ?? new List<SignatureEntry>();

                var approveSig = new SignatureEntry
                {
                    Name = req.Name,
                    Rank = req.Rank,
                    Timestamp = DateTime.UtcNow,
                    SigCode = $"SIG-APPROVED-CAPT-{Guid.NewGuid().ToString()[..8].ToUpper()}"
                };

                signatures.Add(approveSig);
                record.DigitalSignatures = JsonSerializer.Serialize(signatures, JsonOptions);
                record.Status = "Approved";
                record.IsSynced = false;
                record.UpdatedAt = DateTime.UtcNow;

                _context.SmsFilledRecords.Update(record);
                await _context.SaveChangesAsync();

                return Ok(new { message = "Phê duyệt & Ban hành hồ sơ thành công", signatures, status = record.Status });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error approving record {Id}", id);
                return StatusCode(500, new { message = "Gặp lỗi khi phê duyệt hồ sơ", error = ex.Message });
            }
        }

        // ==========================================
        // 10. VERSION CONTROL (LOCKED AT EDGE)
        // ==========================================
        [HttpPost("procedures/version-up")]
        public Task<IActionResult> BumpProcedureVersion([FromBody] BumpVersionRequest req)
        {
            return ShoreManagedPolicy();
        }

        // ==========================================
        // 11. IMPORT DOCX (LOCKED AT EDGE)
        // ==========================================
        [HttpPost("procedures/import")]
        [Consumes("multipart/form-data")]
        public Task<IActionResult> ImportDocx([FromForm] IFormFile file)
        {
            return ShoreManagedPolicy();
        }

        // ==========================================
        // 12. CREATE NEW PROCEDURE (LOCKED AT EDGE)
        // ==========================================
        [HttpPost("procedures")]
        public Task<IActionResult> CreateProcedure([FromBody] CreateProcedureRequest req)
        {
            return ShoreManagedPolicy();
        }

        // ==========================================
        // 13. CREATE FORM TEMPLATE (LOCKED AT EDGE)
        // ==========================================
        [HttpPost("templates")]
        public Task<IActionResult> CreateFormTemplate([FromBody] CreateFormTemplateRequest req)
        {
            return ShoreManagedPolicy();
        }

        // ==========================================
        // 14. DELETE PROCEDURE (LOCKED AT EDGE)
        // ==========================================
        [HttpDelete("procedures/{id}")]
        public Task<IActionResult> DeleteProcedure(Guid id)
        {
            return ShoreManagedPolicy();
        }

        // ==========================================
        // 15. GET ALL FORM TEMPLATES
        // ==========================================
        [HttpGet("templates")]
        public async Task<IActionResult> GetAllFormTemplates()
        {
            try
            {
                var templates = await _context.SmsFormTemplates
                    .Include(t => t.Procedure)
                    .OrderBy(t => t.FormCode)
                    .ToListAsync();

                var result = templates.Select(t => new
                {
                    t.Id,
                    t.SmsProcedureId,
                    t.FormCode,
                    t.Title,
                    t.ContentSchema,
                    ProcedureTitle = t.Procedure?.Title,
                    ProcedureCode = t.Procedure?.ProcedureCode
                }).ToList();

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching all form templates");
                return StatusCode(500, new { message = "Lỗi khi lấy danh sách biểu mẫu", error = ex.Message });
            }
        }

        // ==========================================
        // 16. ASSIGN EXISTING FORM TEMPLATES (LOCKED AT EDGE)
        // ==========================================
        [HttpPost("procedures/{procedureId}/assign-templates")]
        public Task<IActionResult> AssignTemplates(Guid procedureId, [FromBody] List<Guid> templateIds)
        {
            return ShoreManagedPolicy();
        }

        // ==========================================
        // 17. UNASSIGN / DELETE FORM TEMPLATE (LOCKED AT EDGE)
        // ==========================================
        [HttpDelete("templates/{id}")]
        public Task<IActionResult> DeleteFormTemplate(Guid id)
        {
            return ShoreManagedPolicy();
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
}
