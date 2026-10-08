using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Services.Sync;
using Maritime.Shared.Models.Sync;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace ProductApi.Controllers.Crew;

/// <summary>
/// REST Controller for Managing Crew Member Logbook Entries (Shore-side)
/// </summary>
[ApiController]
[Route("api/crew/{crewMemberId:guid}/logbook")]
[Authorize(Policy = "InternalAccess")]
public class LogbookController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly ISyncOutboxService _syncOutbox;
    private readonly ILogger<LogbookController> _logger;

    public LogbookController(AppDbContext context, ISyncOutboxService syncOutbox, ILogger<LogbookController> logger)
    {
        _context = context;
        _syncOutbox = syncOutbox;
        _logger = logger;
    }

    /// <summary>
    /// GET /api/crew/{crewMemberId}/logbook - Search and retrieve list of logbook entries
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetLogbook(
        Guid crewMemberId,
        [FromQuery] string? search = null,
        [FromQuery] string? entryOrigin = null,
        [FromQuery] string? entryType = null,
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null)
    {
        try
        {
            var crew = await _context.CrewMembers.AnyAsync(c => c.Id == crewMemberId);
            if (!crew)
            {
                return NotFound(new { error = "Crew member not found" });
            }

            var query = _context.CrewLogbookEntries
                .Where(e => e.CrewMemberId == crewMemberId)
                .AsNoTracking();

            // Filters
            if (!string.IsNullOrWhiteSpace(search))
            {
                var lowerSearch = search.ToLower();
                query = query.Where(e => e.Title.ToLower().Contains(lowerSearch) || 
                                         e.Description.ToLower().Contains(lowerSearch) ||
                                         (e.Notes != null && e.Notes.ToLower().Contains(lowerSearch)));
            }

            if (!string.IsNullOrWhiteSpace(entryOrigin))
            {
                query = query.Where(e => e.EntryOrigin == entryOrigin);
            }

            if (!string.IsNullOrWhiteSpace(entryType))
            {
                query = query.Where(e => e.EntryType == entryType);
            }

            if (startDate.HasValue)
            {
                var utcStart = DateTime.SpecifyKind(startDate.Value, DateTimeKind.Utc);
                query = query.Where(e => e.EntryDate >= utcStart);
            }

            if (endDate.HasValue)
            {
                var utcEnd = DateTime.SpecifyKind(endDate.Value, DateTimeKind.Utc);
                query = query.Where(e => e.EntryDate <= utcEnd);
            }

            var entries = await query
                .OrderByDescending(e => e.EntryDate)
                .ThenByDescending(e => e.CreatedAt)
                .ToListAsync();

            return Ok(entries);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting logbook entries for crew {CrewId}", crewMemberId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// POST /api/crew/{crewMemberId}/logbook - Create new logbook entry
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> CreateEntry(Guid crewMemberId, [FromBody] CrewLogbookEntry entry)
    {
        try
        {
            var crew = await _context.CrewMembers.AnyAsync(c => c.Id == crewMemberId);
            if (!crew)
            {
                return NotFound(new { error = "Crew member not found" });
            }

            if (string.IsNullOrWhiteSpace(entry.Title) || string.IsNullOrWhiteSpace(entry.Description))
            {
                return BadRequest(new { error = "Title and Description are required" });
            }

            entry.Id = Guid.NewGuid();
            entry.CrewMemberId = crewMemberId;
            entry.EntryOrigin = "SHORE";
            entry.OriginNode = "SHORE";
            entry.IsSynced = false;
            entry.SyncVersion = 1;
            entry.CreatedAt = DateTime.UtcNow;
            entry.UpdatedAt = DateTime.UtcNow;
            entry.EntryDate = DateTime.SpecifyKind(entry.EntryDate, DateTimeKind.Utc);

            if (entry.EdgeLocalCreatedAt.HasValue)
            {
                entry.EdgeLocalCreatedAt = DateTime.SpecifyKind(entry.EdgeLocalCreatedAt.Value, DateTimeKind.Utc);
            }

            _context.CrewLogbookEntries.Add(entry);
            await _context.SaveChangesAsync();

            // Broadcast update to Edge node outbox
            await _syncOutbox.EnqueueForCrewAsync(crewMemberId, "crew_logbook_entry", entry.Id.ToString(), SyncActionType.CREATE, entry);

            _logger.LogInformation("Successfully created logbook entry {Id} for crew {CrewId}", entry.Id, crewMemberId);
            return Created($"/api/crew/{crewMemberId}/logbook/{entry.Id}", entry);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating logbook entry for crew {CrewId}", crewMemberId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// PUT /api/crew/{crewMemberId}/logbook/{entryId} - Update an existing logbook entry
    /// </summary>
    [HttpPut("{entryId:guid}")]
    public async Task<IActionResult> UpdateEntry(Guid crewMemberId, Guid entryId, [FromBody] CrewLogbookEntry entryUpdate)
    {
        try
        {
            var existing = await _context.CrewLogbookEntries
                .FirstOrDefaultAsync(e => e.Id == entryId && e.CrewMemberId == crewMemberId);

            if (existing == null)
            {
                return NotFound(new { error = "Logbook entry not found" });
            }

            if (string.IsNullOrWhiteSpace(entryUpdate.Title) || string.IsNullOrWhiteSpace(entryUpdate.Description))
            {
                return BadRequest(new { error = "Title and Description are required" });
            }

            // Update allowed fields
            existing.Title = entryUpdate.Title;
            existing.Description = entryUpdate.Description;
            existing.EntryDate = DateTime.SpecifyKind(entryUpdate.EntryDate, DateTimeKind.Utc);
            existing.Notes = entryUpdate.Notes;
            existing.Status = entryUpdate.Status;

            // Shore specific
            existing.ShoreActivity = entryUpdate.ShoreActivity;
            existing.TrainingCourse = entryUpdate.TrainingCourse;
            existing.ShoreLocation = entryUpdate.ShoreLocation;
            existing.Supervisor = entryUpdate.Supervisor;

            // Edge specific
            existing.WatchDuty = entryUpdate.WatchDuty;
            existing.NavigationPhase = entryUpdate.NavigationPhase;
            existing.IncidentType = entryUpdate.IncidentType;
            existing.WeatherConditions = entryUpdate.WeatherConditions;
            existing.VesselPosition = entryUpdate.VesselPosition;
            existing.OperationalNotes = entryUpdate.OperationalNotes;

            // Sync metadata
            existing.IsSynced = false;
            existing.SyncVersion += 1;
            existing.UpdatedAt = DateTime.UtcNow;

            _context.CrewLogbookEntries.Update(existing);
            await _context.SaveChangesAsync();

            // Broadcast update to Edge node outbox
            await _syncOutbox.EnqueueForCrewAsync(crewMemberId, "crew_logbook_entry", existing.Id.ToString(), SyncActionType.UPDATE, existing);

            _logger.LogInformation("Successfully updated logbook entry {Id} for crew {CrewId}", entryId, crewMemberId);
            return Ok(existing);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating logbook entry {Id} for crew {CrewId}", entryId, crewMemberId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// DELETE /api/crew/{crewMemberId}/logbook/{entryId} - Delete logbook entry
    /// </summary>
    [HttpDelete("{entryId:guid}")]
    public async Task<IActionResult> DeleteEntry(Guid crewMemberId, Guid entryId)
    {
        try
        {
            var entry = await _context.CrewLogbookEntries
                .FirstOrDefaultAsync(e => e.Id == entryId && e.CrewMemberId == crewMemberId);

            if (entry == null)
            {
                return NotFound(new { error = "Logbook entry not found" });
            }

            _context.CrewLogbookEntries.Remove(entry);
            await _context.SaveChangesAsync();

            // Broadcast deletion to Edge node outbox
            await _syncOutbox.EnqueueForCrewAsync(crewMemberId, "crew_logbook_entry", entryId.ToString(), SyncActionType.DELETE, new { Id = entryId });

            _logger.LogInformation("Successfully deleted logbook entry {Id} for crew {CrewId}", entryId, crewMemberId);
            return Ok(new { message = "Logbook entry deleted successfully" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting logbook entry {Id} for crew {CrewId}", entryId, crewMemberId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ════════════════════════════════════════════════════════════
    // PHÊ DUYỆT ĐỀ NGHỊ XUỐNG TÀU TỪ TÀU
    // ════════════════════════════════════════════════════════════

    /// <summary>
    /// GET /api/crew/pending-sign-offs — Hàng chờ duyệt của bờ.
    /// Đặt ở đây thay vì trong route theo crewMemberId vì bờ cần xem TẤT CẢ đề nghị.
    /// </summary>
    [HttpGet("/api/crew/pending-sign-offs")]
    public async Task<IActionResult> GetPendingSignOffs()
    {
        try
        {
            var pending = await _context.CrewLogbookEntries
                .AsNoTracking()
                .Where(e => e.EntryType == "SEA_SERVICE" && e.RecordStatus == "PENDING_APPROVAL")
                .OrderBy(e => e.SignOffRequestedAt)
                .Join(_context.CrewMembers, e => e.CrewMemberId, c => c.Id, (e, c) => new
                {
                    e.Id,
                    e.CrewMemberId,
                    c.CrewId,
                    c.FullName,
                    e.VesselName,
                    e.ImoNumber,
                    e.RankAtTime,
                    e.SignOnDate,
                    e.SignOffDate,
                    e.SignOffPortName,
                    e.SignOffRequestReason,
                    e.SignOffRequestedBy,
                    e.SignOffRequestedAt,
                })
                .ToListAsync();

            return Ok(pending);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error listing pending sign-offs");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// POST /api/crew/{crewMemberId}/logbook/{entryId}/approve-sign-off
    /// Bờ duyệt — kỳ phục vụ đóng lại, thuyền viên về danh bạ chung.
    /// </summary>
    [HttpPost("{entryId:guid}/approve-sign-off")]
    public async Task<IActionResult> ApproveSignOff(Guid crewMemberId, Guid entryId, [FromBody] ApproveSignOffDto dto)
    {
        try
        {
            var entry = await _context.CrewLogbookEntries.AsTracking()
                .FirstOrDefaultAsync(e => e.Id == entryId && e.CrewMemberId == crewMemberId);
            if (entry == null) return NotFound(new { error = "Không tìm thấy kỳ phục vụ" });
            if (entry.RecordStatus != "PENDING_APPROVAL")
                return BadRequest(new { error = "Kỳ này không ở trạng thái chờ duyệt" });

            entry.SignOffDate = dto.SignOffDate.HasValue
                ? DateTime.SpecifyKind(dto.SignOffDate.Value, DateTimeKind.Utc)
                : entry.SignOffDate ?? DateTime.UtcNow;
            entry.SignOffPortCode = dto.PortCode ?? entry.SignOffPortCode;
            entry.SignOffPortName = dto.PortName ?? entry.SignOffPortName;
            entry.SignOffReason = entry.SignOffRequestReason;
            entry.SignOffBy = entry.SignOffRequestedBy;
            entry.RecordStatus = "CLOSED";
            entry.Status = "Approved";
            entry.ApprovedBy = dto.ApprovedBy;
            entry.ApprovedAt = DateTime.UtcNow;
            entry.RejectedBy = null;
            entry.RejectedAt = null;
            entry.RejectionReason = null;
            AppendApprovalHistory(entry, "APPROVED", dto.ApprovedBy, dto.Note);

            // Trả thuyền viên về danh bạ chung
            // AsTracking: DbContext mặc định NoTracking — thiếu nó thì việc cho rời tàu không được lưu.
            var crew = await _context.CrewMembers.AsTracking().FirstOrDefaultAsync(c => c.Id == crewMemberId);
            string? targetNode = null;
            if (crew != null)
            {
                if (crew.VesselId.HasValue)
                    targetNode = await _context.Vessels.AsNoTracking()
                        .Where(v => v.Id == crew.VesselId.Value).Select(v => v.IMO).FirstOrDefaultAsync();

                crew.VesselId = null;
                crew.IsOnboard = false;
                crew.DisembarkDate = entry.SignOffDate;
                crew.PoolStatus = "Available";
                crew.OnboardStatus = null;
                crew.UpdatedAt = DateTime.UtcNow;
                crew.IsSynced = false;
            }

            await SaveAndPushAsync(entry, crew, targetNode);
            _logger.LogInformation("Bờ DUYỆT cho {CrewId} xuống tàu", crewMemberId);
            return Ok(entry);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error approving sign-off {Id}", entryId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// POST /api/crew/{crewMemberId}/logbook/{entryId}/reject-sign-off
    /// Bờ từ chối — BẮT BUỘC ghi lý do để tàu biết phải sửa gì rồi gửi lại.
    /// </summary>
    [HttpPost("{entryId:guid}/reject-sign-off")]
    public async Task<IActionResult> RejectSignOff(Guid crewMemberId, Guid entryId, [FromBody] RejectSignOffDto dto)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(dto.Reason))
                return BadRequest(new { error = "Phải ghi lý do từ chối để tàu biết cần sửa gì" });

            var entry = await _context.CrewLogbookEntries.AsTracking()
                .FirstOrDefaultAsync(e => e.Id == entryId && e.CrewMemberId == crewMemberId);
            if (entry == null) return NotFound(new { error = "Không tìm thấy kỳ phục vụ" });
            if (entry.RecordStatus != "PENDING_APPROVAL")
                return BadRequest(new { error = "Kỳ này không ở trạng thái chờ duyệt" });

            entry.RecordStatus = "REJECTED";
            entry.RejectedBy = dto.RejectedBy;
            entry.RejectedAt = DateTime.UtcNow;
            entry.RejectionReason = dto.Reason;
            AppendApprovalHistory(entry, "REJECTED", dto.RejectedBy, dto.Reason);

            // Người đó VẪN đang phục vụ — không đụng gì tới bản ghi thuyền viên
            var targetNode = await _context.CrewMembers.AsNoTracking()
                .Where(c => c.Id == crewMemberId && c.VesselId != null)
                .Join(_context.Vessels, c => c.VesselId, v => v.Id, (c, v) => v.IMO)
                .FirstOrDefaultAsync();

            await SaveAndPushAsync(entry, null, targetNode);
            _logger.LogInformation("Bờ TỪ CHỐI cho {CrewId} xuống tàu: {Reason}", crewMemberId, dto.Reason);
            return Ok(entry);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error rejecting sign-off {Id}", entryId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ── Helpers ─────────────────────────────────────────────────

    private static void AppendApprovalHistory(
        Maritime.Shared.Models.Crew.CrewLogbookEntry entry, string action, string? by, string? note)
    {
        var rounds = new System.Collections.Generic.List<System.Text.Json.JsonElement>();
        if (!string.IsNullOrWhiteSpace(entry.ApprovalHistory))
        {
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(entry.ApprovalHistory);
                if (doc.RootElement.ValueKind == System.Text.Json.JsonValueKind.Array)
                    foreach (var el in doc.RootElement.EnumerateArray()) rounds.Add(el.Clone());
            }
            catch { /* nhật ký hỏng — bắt đầu lại, không chặn thao tác chính */ }
        }

        rounds.Add(System.Text.Json.JsonSerializer.SerializeToElement(new
        {
            at = DateTime.UtcNow,
            action,
            by,
            note,
            source = "SHORE"
        }));
        entry.ApprovalHistory = System.Text.Json.JsonSerializer.Serialize(rounds);
    }

    private async Task SaveAndPushAsync(
        Maritime.Shared.Models.Crew.CrewLogbookEntry entry,
        Maritime.Shared.Models.Crew.CrewMember? crew,
        string? targetNode)
    {
        entry.UpdatedAt = DateTime.UtcNow;
        entry.IsSynced = false;
        await _context.SaveChangesAsync();

        if (string.IsNullOrEmpty(targetNode)) return;
        try
        {
            await _syncOutbox.EnqueueAsync(targetNode, "crew_logbook_entry", entry.Id.ToString(), SyncActionType.SNAPSHOT, entry);
            if (crew != null)
                await _syncOutbox.EnqueueAsync(targetNode, "crew_member", crew.Id.ToString(), SyncActionType.UPDATE, crew);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Không đẩy được kết quả duyệt xuống tàu {IMO}", targetNode);
        }
    }
}

/// <summary>Bờ duyệt đề nghị cho xuống tàu.</summary>
public class ApproveSignOffDto
{
    /// <summary>Bờ có thể chốt lại ngày/cảng khác với đề nghị của tàu.</summary>
    public DateTime? SignOffDate { get; set; }
    public string? PortCode { get; set; }
    public string? PortName { get; set; }
    public string? ApprovedBy { get; set; }
    public string? Note { get; set; }
}

/// <summary>Bờ từ chối đề nghị cho xuống tàu.</summary>
public class RejectSignOffDto
{
    /// <summary>BẮT BUỘC — tàu cần biết phải sửa gì.</summary>
    public string Reason { get; set; } = string.Empty;
    public string? RejectedBy { get; set; }
}
