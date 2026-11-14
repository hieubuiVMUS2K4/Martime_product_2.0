using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.DTOs;
using ProductApi.Services.AI;
using System.Globalization;
using System.Security.Claims;

namespace ProductApi.Controllers
{
    [ApiController]
    [Route("api/reports")]
    public class ReportEvaluationsController : ControllerBase
    {
        [HttpGet("debug/status")]
        public async Task<IActionResult> GetDebugStatus()
        {
            var noonCount = await _context.NoonReports.CountAsync();
            var evalCount = await _context.ReportEvaluations.CountAsync();
            
            var latestNoonReports = await _context.NoonReports
                .OrderByDescending(r => r.ReportDate)
                .Take(5)
                .Select(r => new { r.Id, r.ReportDate, r.MaritimeReportId })
                .ToListAsync();
            
            var latestEvaluations = await _context.ReportEvaluations
                .OrderByDescending(r => r.Id)
                .Take(5)
                .Select(r => new { r.ReportId, r.Status })
                .ToListAsync();

            return Ok(new
            {
                noonReportsTotal = noonCount,
                evaluationsTotal = evalCount,
                latestNoonReports,
                latestEvaluations,
                timestamp = DateTime.UtcNow
            });
        }

        [HttpPost("debug/enqueue-missing")]
        public async Task<IActionResult> EnqueueMissingReports([FromServices] ProductApi.Services.Background.ReportEvaluationQueue queue)
        {
            // Find all NoonReports without evaluations
            var missingEvals = await _context.NoonReports
                .Where(nr => !_context.ReportEvaluations.Any(e => e.ReportId == nr.Id))
                .Select(nr => nr.Id)
                .ToListAsync();

            _logger.LogInformation($"Enqueueing {missingEvals.Count} reports for evaluation");

            var ct = new CancellationTokenSource(TimeSpan.FromSeconds(30)).Token;
            int enqueued = 0;
            
            foreach (var reportId in missingEvals)
            {
                try
                {
                    await queue.EnqueueAsync(reportId, ct);
                    enqueued++;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Failed to enqueue report {reportId}");
                }
            }

            return Ok(new
            {
                message = $"Enqueued {enqueued} reports for evaluation",
                totalMissing = missingEvals.Count,
                enqueued,
                timestamp = DateTime.UtcNow
            });
        }

        [HttpPost("seed-noon/{shipName}")]
        public async Task<IActionResult> SeedNoonReports(string shipName)
        {
            var vessel = await _context.Vessels.FirstOrDefaultAsync(v => v.Name.ToLower().Contains(shipName.ToLower()));
            if (vessel == null) return NotFound($"Vessel '{shipName}' not found.");

            var voyageId = await _context.VoyageRecords
                .Where(v => v.VesselIMO == vessel.IMO)
                .Select(v => v.Id)
                .FirstOrDefaultAsync();

            int reportTypeId = 1;
            var noonReportType = await _context.ReportTypes.FirstOrDefaultAsync(rt => rt.TypeCode == "NOON" || rt.TypeName.Contains("Noon"));
            if (noonReportType != null) reportTypeId = noonReportType.Id;

            var random = new Random();
            var reports = new List<MaritimeReport>();
            var noonData = new List<NoonReport>();

            for (int i = 1; i <= 30; i++)
            {
                bool isAbnormal = i <= 5; // 5 abnormal

                var noon = new NoonReport
                {
                    Id = Guid.NewGuid(),
                    MaritimeReportId = Guid.NewGuid(),
                    ReportDate = DateTime.UtcNow.AddDays(-i),

                    // Normal vs Abnormal metrics
                    Latitude = 12.5 + random.NextDouble(),
                    Longitude = 104.5 + random.NextDouble(),
                    CourseOverGround = isAbnormal ? random.Next(350, 400) : random.Next(10, 360),
                    SpeedOverGround = isAbnormal ? random.Next(25, 40) : random.Next(10, 20),
                    DistanceTraveled = isAbnormal ? random.Next(600, 1000) : random.Next(200, 400),
                    
                    AirTemperature = random.Next(20, 35),
                    SeaTemperature = random.Next(20, 30),
                    BarometricPressure = isAbnormal ? random.Next(900, 950) : random.Next(1005, 1020),
                    
                    FuelOilConsumed = isAbnormal ? random.Next(80, 100) : random.Next(15, 30),
                    DieselOilConsumed = isAbnormal ? random.Next(20, 40) : random.Next(2, 5),
                    
                    MainEngineRPM = isAbnormal ? random.Next(150, 200) : random.Next(80, 110),
                    CargoOnBoard = random.Next(10000, 50000),
                    OperationalRemarks = isAbnormal ? "Experienced heavy weather and mechanical issues." : "Regular operations, all normal."
                };

                var mr = new MaritimeReport
                {
                    Id = noon.MaritimeReportId,
                    ReportNumber = $"TEST-NOON-{i:00}",
                    ReportTypeId = reportTypeId,
                    ReportDateTime = noon.ReportDate,
                    VoyageId = voyageId == Guid.Empty ? null : voyageId,
                    Status = "COMPLETED",
                    ReportData = System.Text.Json.JsonSerializer.Serialize(noon),
                    OriginNode = vessel.IMO,
                    IsTransmitted = true,
                    CreatedAt = DateTime.UtcNow
                };

                reports.Add(mr);
                noonData.Add(noon);
            }

            _context.MaritimeReports.AddRange(reports);
            _context.NoonReports.AddRange(noonData);
            await _context.SaveChangesAsync();

            return Ok(new { Message = $"Seeded 30 reports for {vessel.Name} (5 abnormal, 25 normal)." });
        }

        private const int ChatCooldownSeconds = 6;

        private readonly AppDbContext _context;
        private readonly IAiChatService _chatService;
        private readonly IMemoryCache _memoryCache;
        private readonly ILogger<ReportEvaluationsController> _logger;

        public ReportEvaluationsController(
            AppDbContext context,
            IAiChatService chatService,
            IMemoryCache memoryCache,
            ILogger<ReportEvaluationsController> logger)
        {
            _context = context;
            _chatService = chatService;
            _memoryCache = memoryCache;
            _logger = logger;
        }

        [HttpGet("{id}/ai-insights")]
        public async Task<ActionResult<AiEvaluationResponse>> GetInsights(Guid id)
        {
            var evaluation = await _context.ReportEvaluations
                .OrderByDescending(e => e.CreatedDate)
                .FirstOrDefaultAsync(e => e.ReportId == id);

            if (evaluation == null)
            {
                return NotFound();
            }

            return Ok(new AiEvaluationResponse
            {
                Status = evaluation.Status,
                ContentVi = evaluation.ContentVi
            });
        }

        [HttpPost("chat/vessels/{vesselId}")]
        public async Task<IActionResult> ChatWithReports(string vesselId, [FromBody] ChatRequestDto request, CancellationToken token)
        {
            if (!Guid.TryParse(vesselId, out var vesselGuid) || string.IsNullOrWhiteSpace(request.Message))
            {
                return BadRequest("Invalid inputs.");
            }

            var userKey = ResolveUserKey();
            var cooldownKey = $"ai-chat-cooldown:{userKey}:{vesselGuid}";
            var now = DateTimeOffset.UtcNow;

            if (_memoryCache.TryGetValue<DateTimeOffset>(cooldownKey, out var nextAllowedAt) && nextAllowedAt > now)
            {
                var retryAfterSeconds = Math.Max(1, (int)Math.Ceiling((nextAllowedAt - now).TotalSeconds));
                Response.Headers["Retry-After"] = retryAfterSeconds.ToString(CultureInfo.InvariantCulture);

                _logger.LogInformation("AI chat cooldown hit for user {UserKey} vessel {VesselId}; retry after {RetryAfterSeconds}s", userKey, vesselGuid, retryAfterSeconds);

                return StatusCode(StatusCodes.Status429TooManyRequests, new AiChatResponse
                {
                    Success = false,
                    Answer = $"Bạn đang gửi yêu cầu quá nhanh. Vui lòng thử lại sau {retryAfterSeconds}s.",
                    ErrorSource = "backend_user_cooldown",
                    RetryAfterSeconds = retryAfterSeconds,
                    Sources = "Shore backend"
                });
            }

            _memoryCache.Set(cooldownKey, now.AddSeconds(ChatCooldownSeconds), TimeSpan.FromSeconds(ChatCooldownSeconds + 1));

            var chatRequest = new AiChatRequest
            {
                Question = request.Message,
                VesselId = vesselGuid,
                SessionId = string.IsNullOrWhiteSpace(request.SessionId) ? Guid.NewGuid().ToString() : request.SessionId,
                FromDate = DateTime.UtcNow.AddDays(-30),
                ToDate = DateTime.UtcNow
            };

            var response = await _chatService.ChatAsync(chatRequest, token);

            if (!response.Success)
            {
                if (response.ErrorSource == "gemini_rate_limit" || response.ErrorSource == "gemini_quota_exceeded")
                {
                    if (response.RetryAfterSeconds.HasValue)
                    {
                        Response.Headers["Retry-After"] = response.RetryAfterSeconds.Value.ToString(CultureInfo.InvariantCulture);
                    }
                    return StatusCode(StatusCodes.Status429TooManyRequests, response);
                }
                
                if (response.ErrorSource == "gemini_service_unavailable" || response.ErrorSource == "gemini_api" || response.ErrorSource == "gemini_network")
                {
                    return StatusCode(StatusCodes.Status503ServiceUnavailable, response);
                }
            }

            return Ok(response);
        }

        private string ResolveUserKey()
        {
            return User.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? User.FindFirstValue("sub")
                ?? User.Identity?.Name
                ?? HttpContext.Connection.RemoteIpAddress?.ToString()
                ?? "anonymous";
        }
    }
}
