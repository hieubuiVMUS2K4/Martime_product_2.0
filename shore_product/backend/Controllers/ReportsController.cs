using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.Services;

namespace ProductApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Produces("application/json")]
    public class ReportsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IVesselService _vesselService;
        private readonly ILogger<ReportsController> _logger;

        public ReportsController(AppDbContext context, IVesselService vesselService, ILogger<ReportsController> logger)
        {
            _context = context;
            _vesselService = vesselService;
            _logger = logger;
        }

        // ─────────────────────────────────────────────────────────────
        // GET /api/reports/vessels
        // Danh sách tàu kèm report statistics
        // ─────────────────────────────────────────────────────────────
        [HttpGet("vessels")]
        public async Task<IActionResult> GetVesselsWithReportStats()
        {
            try
            {
                var vessels = await _context.Vessels.AsNoTracking().Where(v => v.IsActive).ToListAsync();

                // OriginNode is a node ID; resolve vessel ownership through the registry.
                var reportStats = await _context.MaritimeReports
                    .Join(_context.SyncNodeTrackers.Where(n => n.VesselId != null),
                        r => r.OriginNode, n => n.NodeId, (r, n) => new { Report = r, n.VesselId })
                    .GroupBy(x => x.VesselId)
                    .Select(g => new
                    {
                        VesselId = g.Key!.Value,
                        Total = g.Count(),
                        Approved = g.Count(x => x.Report.Status == "APPROVED"),
                        Pending = g.Count(x => x.Report.Status == "SUBMITTED" || x.Report.Status == "DRAFT"),
                        LastReportAt = g.Max(x => x.Report.ReportDateTime)
                    })
                    .ToListAsync();

                var statsByVessel = reportStats.ToDictionary(s => s.VesselId);

                var result = vessels.Select(v => new
                {
                    v.Id,
                    v.IMO,
                    v.Name,
                    v.Flag,
                    v.VesselType,
                    v.CallSign,
                    Stats = statsByVessel.TryGetValue(v.Id, out var s) ? new
                    {
                        s.Total,
                        s.Approved,
                        s.Pending,
                        LastReportAt = (DateTime?)s.LastReportAt
                    } : new { Total = 0, Approved = 0, Pending = 0, LastReportAt = (DateTime?)null }
                });

                return Ok(result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting vessels with report stats");
                return StatusCode(500, "Internal server error");
            }
        }

        // ─────────────────────────────────────────────────────────────
        // GET /api/reports/vessel/{vesselId}
        // Danh sách report của một tàu (list view, có phân trang)
        // Query params: page, pageSize, from, to, type, status
        // ─────────────────────────────────────────────────────────────
        [HttpGet("vessel/{vesselId:guid}")]
        public async Task<IActionResult> GetVesselReports(
            Guid vesselId,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 10,
            [FromQuery] DateTime? from = null,
            [FromQuery] DateTime? to = null,
            [FromQuery] string? type = null,
            [FromQuery] string? status = null)
        {
            try
            {
                var vessel = await _vesselService.GetVesselByIdAsync(vesselId);
                if (vessel == null) return NotFound($"Vessel {vesselId} not found");

                var nodeIds = _context.SyncNodeTrackers.Where(n => n.VesselId == vesselId).Select(n => n.NodeId);
                var query = _context.MaritimeReports
                    .Where(r => nodeIds.Contains(r.OriginNode));

                if (from.HasValue) query = query.Where(r => r.ReportDateTime >= from.Value);
                if (to.HasValue)   query = query.Where(r => r.ReportDateTime <= to.Value.AddDays(1));
                if (!string.IsNullOrWhiteSpace(status)) query = query.Where(r => r.Status == status);

                // Filter by report type code via ReportType table
                if (!string.IsNullOrWhiteSpace(type))
                {
                    var typeIds = await _context.ReportTypes
                        .Where(rt => rt.TypeCode == type.ToUpper())
                        .Select(rt => rt.Id)
                        .ToListAsync();
                    query = query.Where(r => typeIds.Contains(r.ReportTypeId));
                }

                var total = await query.CountAsync();

                // Count by type for summary bar
                var typeCountsRaw = await _context.MaritimeReports
                    .Where(r => nodeIds.Contains(r.OriginNode))
                    .GroupBy(r => r.ReportTypeId)
                    .Select(g => new { TypeId = g.Key, Count = g.Count() })
                    .ToListAsync();

                var allTypeIds = typeCountsRaw.Select(t => t.TypeId).ToList();
                var typeNames = await _context.ReportTypes
                    .Where(rt => allTypeIds.Contains(rt.Id))
                    .ToDictionaryAsync(rt => rt.Id, rt => rt.TypeCode);

                var typeCounts = typeCountsRaw
                    .Where(t => typeNames.ContainsKey(t.TypeId))
                    .ToDictionary(t => typeNames[t.TypeId], t => t.Count);

                var data = await query
                    .OrderByDescending(r => r.ReportDateTime)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(r => new
                    {
                        r.Id,
                        r.ReportNumber,
                        r.ReportTypeId,
                        r.ReportDateTime,
                        r.Status,
                        r.OriginNode,
                        r.CreatedAt,
                        r.Remarks,
                        r.IsTransmitted
                    })
                    .ToListAsync();

                // Enrich with TypeCode
                var usedTypeIds2 = data.Select(d => d.ReportTypeId).Distinct().ToList();
                var typeCodeMap = await _context.ReportTypes
                    .Where(rt => usedTypeIds2.Contains(rt.Id))
                    .ToDictionaryAsync(rt => rt.Id, rt => rt.TypeCode);

                var enriched = data.Select(r => new
                {
                    r.Id,
                    r.ReportNumber,
                    r.ReportTypeId,
                    TypeCode = typeCodeMap.TryGetValue(r.ReportTypeId, out var tc) ? tc
                               : InferTypeCodeFromReportNumber(r.ReportNumber),
                    r.ReportDateTime,
                    r.Status,
                    r.OriginNode,
                    r.CreatedAt,
                    r.Remarks,
                    r.IsTransmitted
                });

                return Ok(new
                {
                    data = enriched,
                    total,
                    page,
                    pageSize,
                    typeCounts,
                    vessel = new { vessel.Id, vessel.IMO, vessel.Name, vessel.Flag }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting reports for vessel {VesselId}", vesselId);
                return StatusCode(500, "Internal server error");
            }
        }

        // ─────────────────────────────────────────────────────────────
        // GET /api/reports/vessel/{vesselId}/calendar
        // Dữ liệu lịch: trả về tất cả reports trong tháng + NO REPORT days
        // Query params: year, month
        // ─────────────────────────────────────────────────────────────
        [HttpGet("vessel/{vesselId:guid}/calendar")]
        public async Task<IActionResult> GetVesselCalendar(
            Guid vesselId,
            [FromQuery] int year = 0,
            [FromQuery] int month = 0)
        {
            try
            {
                var vessel = await _vesselService.GetVesselByIdAsync(vesselId);
                if (vessel == null) return NotFound($"Vessel {vesselId} not found");

                if (year == 0) year   = DateTime.UtcNow.Year;
                if (month == 0) month = DateTime.UtcNow.Month;

                var startDate = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
                var endDate   = startDate.AddMonths(1);
                var nodeIds = _context.SyncNodeTrackers.Where(n => n.VesselId == vesselId).Select(n => n.NodeId);

                var reports = await _context.MaritimeReports
                    .Where(r => nodeIds.Contains(r.OriginNode)
                             && r.ReportDateTime >= startDate
                             && r.ReportDateTime < endDate)
                    .OrderBy(r => r.ReportDateTime)
                    .Select(r => new
                    {
                        r.Id,
                        r.ReportNumber,
                        r.ReportTypeId,
                        r.ReportDateTime,
                        r.Status
                    })
                    .ToListAsync();

                var usedTypeIds = reports.Select(r => r.ReportTypeId).Distinct().ToList();
                var typeMap = await _context.ReportTypes
                    .Where(rt => usedTypeIds.Contains(rt.Id))
                    .ToDictionaryAsync(rt => rt.Id, rt => rt.TypeCode);

                // Build calendar events grouped by date
                var events = reports.GroupBy(r => r.ReportDateTime.Date)
                    .ToDictionary(
                        g => g.Key.ToString("yyyy-MM-dd"),
                        g => g.Select(r => new
                        {
                            r.Id,
                            r.ReportNumber,
                            TypeCode = typeMap.TryGetValue(r.ReportTypeId, out var tc) ? tc
                                       : InferTypeCodeFromReportNumber(r.ReportNumber),
                            Time = r.ReportDateTime.ToString("HH:mm"),
                            r.Status
                        }).ToList()
                    );

                // Determine NO REPORT days:
                // Find active voyage days in this month (voyage started before end, ended after start)
                var activeVoyages = await _context.VoyageRecords
                    .Where(v => nodeIds.Contains(v.OriginNode)
                             && v.DepartureTime < endDate
                             && (v.ArrivalTime == null || v.ArrivalTime > startDate))
                    .Select(v => new { v.DepartureTime, v.ArrivalTime })
                    .ToListAsync();

                var noReportDays = new List<string>();
                for (int d = 1; d <= DateTime.DaysInMonth(year, month); d++)
                {
                    var date = new DateTime(year, month, d, 0, 0, 0, DateTimeKind.Utc);
                    if (date > DateTime.UtcNow) break; // future days not counted

                    // Check if date falls within any voyage
                    bool inVoyage = activeVoyages.Any(v =>
                        v.DepartureTime.HasValue && v.DepartureTime.Value.Date <= date &&
                        (v.ArrivalTime == null || v.ArrivalTime.Value.Date >= date));

                    if (inVoyage && !events.ContainsKey(date.ToString("yyyy-MM-dd")))
                        noReportDays.Add(date.ToString("yyyy-MM-dd"));
                }

                return Ok(new { events, noReportDays, year, month });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting calendar for vessel {VesselId}", vesselId);
                return StatusCode(500, "Internal server error");
            }
        }

        // ─────────────────────────────────────────────────────────────
        // PATCH /api/reports/{id}/approve
        // Duyệt báo cáo (SUBMITTED → APPROVED)
        // ─────────────────────────────────────────────────────────────
        [HttpPatch("{id:guid}/approve")]
        public async Task<IActionResult> ApproveReport(Guid id, [FromBody] ApproveReportDto dto)
        {
            try
            {
                var report = await _context.MaritimeReports.FindAsync(id);
                if (report == null) return NotFound();
                if (report.Status != "SUBMITTED")
                    return BadRequest($"Cannot approve report with status {report.Status}");

                report.Status = "APPROVED";
                report.MasterSignature = dto.ApprovedBy;
                report.SignedAt = DateTime.UtcNow;
                report.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();
                return Ok(new { report.Id, report.Status, report.SignedAt });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error approving report {Id}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        // ─────────────────────────────────────────────────────────────
        // PATCH /api/reports/{id}/reject
        // Từ chối báo cáo (SUBMITTED → REJECTED)
        // ─────────────────────────────────────────────────────────────
        [HttpPatch("{id:guid}/reject")]
        public async Task<IActionResult> RejectReport(Guid id, [FromBody] RejectReportDto dto)
        {
            try
            {
                var report = await _context.MaritimeReports.FindAsync(id);
                if (report == null) return NotFound();
                if (report.Status != "SUBMITTED")
                    return BadRequest($"Cannot reject report with status {report.Status}");

                report.Status = "REJECTED";
                report.Remarks = dto.Reason;
                report.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();
                return Ok(new { report.Id, report.Status });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error rejecting report {Id}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        // ─────────────────────────────────────────────────────────────
        // GET /api/reports/{id}
        // Chi tiết báo cáo (parent MaritimeReport + child report data)
        // ─────────────────────────────────────────────────────────────
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetReportDetail(Guid id)
        {
            try
            {
                var report = await _context.MaritimeReports
                    .AsNoTracking()
                    .FirstOrDefaultAsync(r => r.Id == id);

                if (report == null) return NotFound();

                var reportType = await _context.ReportTypes
                    .AsNoTracking()
                    .FirstOrDefaultAsync(rt => rt.Id == report.ReportTypeId);

                // If ReportTypeId from edge doesn't match shore's ReportTypes IDs (ID mismatch
                // between edge and shore databases), fall back to inferring typeCode from the
                // ReportNumber prefix, then re-query ReportTypes by TypeCode.
                string typeCode;
                string typeName;
                if (reportType != null)
                {
                    typeCode = reportType.TypeCode ?? "UNKNOWN";
                    typeName = reportType.TypeName ?? "Unknown";
                }
                else
                {
                    typeCode = InferTypeCodeFromReportNumber(report.ReportNumber);
                    var inferredType = typeCode != "UNKNOWN"
                        ? await _context.ReportTypes.AsNoTracking()
                            .FirstOrDefaultAsync(rt => rt.TypeCode == typeCode)
                        : null;
                    typeName = inferredType?.TypeName ?? typeCode;
                }

                object? childReport = typeCode switch
                {
                    "NOON" => await _context.NoonReports.AsNoTracking()
                        .FirstOrDefaultAsync(r => r.MaritimeReportId == id),
                    "DEPARTURE" => await _context.DepartureReports.AsNoTracking()
                        .FirstOrDefaultAsync(r => r.MaritimeReportId == id),
                    "ARRIVAL" => await _context.ArrivalReports.AsNoTracking()
                        .FirstOrDefaultAsync(r => r.MaritimeReportId == id),
                    "BUNKER" => await _context.BunkerReports.AsNoTracking()
                        .FirstOrDefaultAsync(r => r.MaritimeReportId == id),
                    "POSITION" => await _context.PositionReports.AsNoTracking()
                        .FirstOrDefaultAsync(r => r.MaritimeReportId == id),
                    _ => null
                };

                return Ok(new
                {
                    report.Id,
                    report.ReportNumber,
                    report.ReportTypeId,
                    TypeCode = typeCode,
                    TypeName = typeName,
                    report.ReportDateTime,
                    report.Status,
                    report.PreparedBy,
                    report.MasterSignature,
                    report.SignedAt,
                    report.Remarks,
                    report.ReportData,
                    report.IsTransmitted,
                    report.TransmittedAt,
                    report.OriginNode,
                    report.CreatedAt,
                    report.UpdatedAt,
                    ChildReport = childReport
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting report detail {Id}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        // ─────────────────────────────────────────────────────────────
        // GET /api/reports/statistics
        // Thống kê báo cáo tổng quan
        // ─────────────────────────────────────────────────────────────
        [HttpGet("statistics")]
        public async Task<IActionResult> GetStatistics(
            [FromQuery] DateTime? from = null,
            [FromQuery] DateTime? to = null)
        {
            try
            {
                var query = _context.MaritimeReports.AsNoTracking().AsQueryable();
                if (from.HasValue) query = query.Where(r => r.ReportDateTime >= from.Value);
                if (to.HasValue) query = query.Where(r => r.ReportDateTime <= to.Value.AddDays(1));

                var total = await query.CountAsync();
                var byStatus = await query.GroupBy(r => r.Status)
                    .Select(g => new { Status = g.Key, Count = g.Count() })
                    .ToListAsync();

                var typeIds = await query.Select(r => r.ReportTypeId).Distinct().ToListAsync();
                var typeMap = await _context.ReportTypes
                    .Where(rt => typeIds.Contains(rt.Id))
                    .ToDictionaryAsync(rt => rt.Id, rt => rt.TypeCode);

                var byType = await query.GroupBy(r => r.ReportTypeId)
                    .Select(g => new { TypeId = g.Key, Count = g.Count() })
                    .ToListAsync();

                var byVessel = await query.GroupBy(r => r.OriginNode)
                    .Select(g => new { Vessel = g.Key, Count = g.Count() })
                    .ToListAsync();

                return Ok(new
                {
                    total,
                    byStatus = byStatus.ToDictionary(x => x.Status, x => x.Count),
                    byType = byType
                        .Where(t => typeMap.ContainsKey(t.TypeId))
                        .ToDictionary(t => typeMap[t.TypeId], t => t.Count),
                    byVessel = byVessel.ToDictionary(x => x.Vessel, x => x.Count)
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting report statistics");
                return StatusCode(500, "Internal server error");
            }
        }

        // Infer typeCode from ReportNumber prefix as fallback when ReportTypeId from edge
        // doesn't match shore's ReportTypes table (ID mismatch between edge/shore databases).
        private static string InferTypeCodeFromReportNumber(string? reportNumber)
        {
            if (string.IsNullOrEmpty(reportNumber)) return "UNKNOWN";
            var prefix = reportNumber.Split('-')[0].ToUpperInvariant();
            return prefix switch
            {
                "POS"       => "POSITION",
                "NOON"      => "NOON",
                "DEP"       => "DEPARTURE",
                "ARR"       => "ARRIVAL",
                "BNK"       => "BUNKER",
                "BUNKER"    => "BUNKER",
                _           => "UNKNOWN"
            };
        }
    }

    public class ApproveReportDto
    {
        public string ApprovedBy { get; set; } = string.Empty;
    }

    public class RejectReportDto
    {
        public string Reason { get; set; } = string.Empty;
    }
}
