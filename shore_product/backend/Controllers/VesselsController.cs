using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.Services;
using ProductApi.DTOs;
using System.Text.Json;

namespace ProductApi.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Produces("application/json")]
    public class VesselsController : ControllerBase
    {
        private readonly IVesselService _vesselService;
        private readonly IAlertService _alertService;
        private readonly IVesselProvisioningService _provisioningService;
        private readonly ILogger<VesselsController> _logger;
        private readonly AppDbContext _context;

        public VesselsController(
            IVesselService vesselService,
            IAlertService alertService,
            IVesselProvisioningService provisioningService,
            ILogger<VesselsController> logger,
            AppDbContext context)
        {
            _vesselService = vesselService;
            _alertService = alertService;
            _provisioningService = provisioningService;
            _logger = logger;
            _context = context;
        }

        /// <summary>
        /// Get all vessels with latest position and alert count
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<IEnumerable<VesselDto>>> GetVessels()
        {
            try
            {
                var vessels = await _vesselService.GetAllVesselsAsync();
                return Ok(vessels);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving vessels");
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Get per-vessel crew/report statistics for the fleet overview.
        /// Returns a dictionary keyed by vessel IMO.
        /// </summary>
        [HttpGet("fleet-summary")]
        public async Task<IActionResult> GetFleetSummary()
        {
            try
            {
                var vessels = await _context.Vessels.AsNoTracking().ToListAsync();
                var vesselIds = vessels.Select(v => v.Id).ToList();
                var imos = vessels.Select(v => v.IMO).ToList();

                // Crew counts grouped by VesselId
                var crewTotals = await _context.CrewMembers
                    .Where(c => c.VesselId.HasValue && vesselIds.Contains(c.VesselId.Value))
                    .GroupBy(c => c.VesselId!.Value)
                    .Select(g => new { VesselId = g.Key, Total = g.Count(), Onboard = g.Count(c => c.IsOnboard) })
                    .ToListAsync();

                // Last sync per IMO
                var lastSyncs = await _context.SyncLogs
                    .Where(s => imos.Contains(s.OriginNode) && s.Status == "SUCCESS")
                    .GroupBy(s => s.OriginNode)
                    .Select(g => new { Imo = g.Key, LastSync = g.Max(s => s.ProcessedAt) })
                    .ToListAsync();

                // Reports count per IMO
                var reportCounts = await _context.MaritimeReports
                    .Where(r => imos.Contains(r.OriginNode))
                    .GroupBy(r => r.OriginNode)
                    .Select(g => new { Imo = g.Key, Total = g.Count() })
                    .ToListAsync();

                var crewDict   = crewTotals.ToDictionary(x => x.VesselId);
                var syncDict   = lastSyncs.ToDictionary(x => x.Imo);
                var reportDict = reportCounts.ToDictionary(x => x.Imo);

                var summary = vessels.Select(v => new
                {
                    VesselId     = v.Id,
                    Imo          = v.IMO,
                    CrewTotal    = crewDict.TryGetValue(v.Id, out var c)   ? c.Total    : 0,
                    CrewOnboard  = crewDict.TryGetValue(v.Id, out var c2)  ? c2.Onboard : 0,
                    ReportsTotal = reportDict.TryGetValue(v.IMO, out var r) ? r.Total    : 0,
                    LastSyncAt   = syncDict.TryGetValue(v.IMO, out var s)  ? s.LastSync : (DateTime?)null,
                });

                return Ok(summary);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating fleet summary");
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Get vessel by ID with complete details
        /// </summary>
        [HttpGet("{id:guid}")]
        public async Task<ActionResult<VesselDto>> GetVessel(Guid id)
        {
            try
            {
                var vessel = await _vesselService.GetVesselByIdAsync(id);
                if (vessel == null)
                {
                    return NotFound($"Vessel with ID {id} not found");
                }
                return Ok(vessel);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Get vessel by IMO number
        /// </summary>
        [HttpGet("imo/{imo}")]
        public async Task<ActionResult<VesselDto>> GetVesselByIMO(string imo)
        {
            try
            {
                var vessel = await _vesselService.GetVesselByIMOAsync(imo);
                if (vessel == null)
                {
                    return NotFound($"Vessel with IMO {imo} not found");
                }
                return Ok(vessel);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving vessel with IMO {IMO}", imo);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Create a new vessel
        /// </summary>
        [HttpPost]
        public async Task<ActionResult<VesselDto>> CreateVessel([FromBody] CreateVesselDto vesselDto)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                // Check if vessel with same IMO already exists
                var existingVessel = await _vesselService.GetVesselByIMOAsync(vesselDto.IMO);
                if (existingVessel != null)
                {
                    return Conflict($"Vessel with IMO {vesselDto.IMO} already exists");
                }

                var vessel = await _vesselService.CreateVesselAsync(vesselDto);

                // Vessel Provisioning v3 (Component 2): auto-create a placeholder SyncNodeTracker
                // in "Unknown" status. No secrets are generated here — that only happens when the
                // admin explicitly clicks "Provision" (POST /api/vessels/{id}/provision).
                var existingNode = await _context.SyncNodeTrackers
                    .FirstOrDefaultAsync(n => n.ImoNumber == vessel.IMO);
                if (existingNode == null)
                {
                    _context.SyncNodeTrackers.Add(new SyncNodeTracker
                    {
                        NodeId = $"pending-{vessel.IMO}",
                        ShipName = vessel.Name,
                        ImoNumber = vessel.IMO,
                        VesselId = vessel.Id,
                        IsRegistered = false,
                        IsRevoked = false,
                        ProvisioningStatus = "Unknown",
                        KeyVersion = 1,
                        NodeApiTokenVersion = 1,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    });
                    await _context.SaveChangesAsync();
                }

                return CreatedAtAction(nameof(GetVessel), new { id = vessel.Id }, vessel);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating vessel with IMO {IMO}", vesselDto.IMO);
                return StatusCode(500, "Internal server error");
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // Vessel Provisioning v3 — Component 2 (Shore Backend Endpoints)
        // ═══════════════════════════════════════════════════════════════

        /// <summary>
        /// POST /api/vessels/{id}/provision — Generate (or rotate, if already provisioned) node
        /// secrets (NodeApiToken + SigningKey). Plaintext secrets are NEVER returned by this
        /// endpoint — they are stored encrypted and only ever exposed via the ZIP download
        /// (GET /provisioning-package).
        /// </summary>
        [HttpPost("{id:guid}/provision")]
        [Authorize(Policy = "FleetManagement")]
        public async Task<IActionResult> ProvisionVessel(Guid id, [FromBody] ProvisionNodeRequestDto? request)
        {
            try
            {
                var provisionedBy = User?.Identity?.Name ?? "unknown";
                var clientIp = HttpContext.Connection.RemoteIpAddress?.ToString();

                var result = await _provisioningService.ProvisionNodeAsync(id, provisionedBy, clientIp, request?.NodeId);

                return Ok(new
                {
                    result.NodeId,
                    result.ProvisionedAt,
                    result.Status,
                    result.KeyVersion,
                    message = "Secrets đã sinh. Tải Provisioning Package bằng /provisioning-package."
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error provisioning node for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// GET /api/vessels/{id}/provisioning-package — Download the Provisioning Package ZIP
        /// (edge-provisioning.json + .env.shore-sync + README.txt). Requires the node to already
        /// have been provisioned at least once. Every download is audited (count, timestamp, by, ip).
        /// </summary>
        [HttpGet("{id:guid}/provisioning-package")]
        [Authorize(Policy = "FleetManagement")]
        public async Task<IActionResult> DownloadProvisioningPackage(Guid id)
        {
            try
            {
                var downloadedBy = User?.Identity?.Name ?? "unknown";
                var clientIp = HttpContext.Connection.RemoteIpAddress?.ToString();
                var shoreBaseUrl = ResolveShoreBaseUrl();

                var bundle = await _provisioningService.BuildProvisioningPackageAsync(id, shoreBaseUrl, downloadedBy, clientIp);

                return File(bundle.ZipContent, "application/zip", bundle.FileName);
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error building provisioning package for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// POST /api/vessels/{id}/provision/rotate — Generate a brand-new NodeApiToken + SigningKey,
        /// keep the previous signing key valid for a grace window, and mark the node as needing
        /// re-import (ProvisioningStatus → Downloaded, "🔴 Needs Re-import" badge on Shore UI).
        /// </summary>
        [HttpPost("{id:guid}/provision/rotate")]
        [Authorize(Policy = "FleetManagement")]
        public async Task<IActionResult> RotateProvisioningKey(Guid id)
        {
            try
            {
                var rotatedBy = User?.Identity?.Name ?? "unknown";
                var clientIp = HttpContext.Connection.RemoteIpAddress?.ToString();

                var result = await _provisioningService.RotateKeyAsync(id, rotatedBy, clientIp);

                return Ok(new
                {
                    result.NodeId,
                    newKeyVersion = result.KeyVersion,
                    message = "Key mới đã sinh. Tải lại Provisioning Package. Tàu cần import lại config."
                });
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error rotating provisioning key for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Resolve the Shore base URL that will be embedded into the Provisioning Package so Edge
        /// knows where to sync to. Prefers explicit config (Shore:PublicBaseUrl); falls back to the
        /// scheme+host of the current request (works for both reverse-proxied and direct access).
        /// </summary>
        private string ResolveShoreBaseUrl()
        {
            var configured = HttpContext.RequestServices
                .GetRequiredService<IConfiguration>()["Shore:PublicBaseUrl"];
            if (!string.IsNullOrWhiteSpace(configured))
                return configured.TrimEnd('/');

            return $"{Request.Scheme}://{Request.Host}";
        }

        /// <summary>
        /// Update vessel commercial data (Shore Master fields only)
        /// Technical fields are synced from Edge and cannot be edited on Shore
        /// </summary>
        [HttpPut("{id:guid}")]
        public async Task<ActionResult<VesselDto>> UpdateVessel(Guid id, [FromBody] JsonElement payload)
        {
            try
            {
                VesselDto? vessel;
                var updateKind = IsBasicVesselUpdate(payload) ? "basic" : "commercial";
                var requestedCallSign = GetStringProperty(payload, "callSign", "CallSign");

                _logger.LogInformation(
                    "Vessel update request {TraceId}: id={VesselId}, kind={UpdateKind}, requestedCallSign={RequestedCallSign}",
                    HttpContext.TraceIdentifier,
                    id,
                    updateKind,
                    requestedCallSign ?? "(not supplied)");

                if (updateKind == "basic")
                {
                    var vesselDto = payload.Deserialize<UpdateVesselDto>(JsonOptions);
                    if (vesselDto == null) return BadRequest("Invalid vessel update payload");

                    ModelState.Clear();
                    if (!TryValidateModel(vesselDto))
                    {
                        return BadRequest(ModelState);
                    }

                    vessel = await _vesselService.UpdateVesselAsync(id, vesselDto);
                }
                else
                {
                    var commercialDto = payload.Deserialize<UpdateCommercialDataDto>(JsonOptions);
                    if (commercialDto == null) return BadRequest("Invalid commercial update payload");

                    ModelState.Clear();
                    if (!TryValidateModel(commercialDto))
                    {
                        return BadRequest(ModelState);
                    }

                    vessel = await _vesselService.UpdateCommercialDataAsync(id, commercialDto);
                }

                if (vessel == null)
                {
                    _logger.LogWarning(
                        "Vessel update request {TraceId} not found: id={VesselId}, kind={UpdateKind}",
                        HttpContext.TraceIdentifier,
                        id,
                        updateKind);
                    return NotFound($"Vessel with ID {id} not found");
                }

                _logger.LogInformation(
                    "Vessel update request {TraceId} completed: id={VesselId}, kind={UpdateKind}, savedCallSign={SavedCallSign}",
                    HttpContext.TraceIdentifier,
                    id,
                    updateKind,
                    vessel.CallSign);

                return Ok(vessel);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating commercial data for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNameCaseInsensitive = true
        };

        private static bool IsBasicVesselUpdate(JsonElement payload)
        {
            return payload.ValueKind == JsonValueKind.Object &&
                   (payload.TryGetProperty("callSign", out _) ||
                    payload.TryGetProperty("CallSign", out _) ||
                    payload.TryGetProperty("vesselType", out _) ||
                    payload.TryGetProperty("VesselType", out _) ||
                    payload.TryGetProperty("grossTonnage", out _) ||
                    payload.TryGetProperty("GrossTonnage", out _) ||
                    payload.TryGetProperty("deadWeight", out _) ||
                    payload.TryGetProperty("DeadWeight", out _) ||
                    payload.TryGetProperty("isActive", out _) ||
                    payload.TryGetProperty("IsActive", out _));
        }

        private static string? GetStringProperty(JsonElement payload, params string[] propertyNames)
        {
            if (payload.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            foreach (var propertyName in propertyNames)
            {
                if (payload.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String)
                {
                    return value.GetString();
                }
            }

            return null;
        }

        /// <summary>
        /// Update basic vessel registry fields from the fleet list form.
        /// </summary>
        [HttpPut("{id:guid}/basic")]
        public async Task<ActionResult<VesselDto>> UpdateVesselBasic(Guid id, [FromBody] UpdateVesselDto vesselDto)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                var vessel = await _vesselService.UpdateVesselAsync(id, vesselDto);
                if (vessel == null)
                {
                    return NotFound($"Vessel with ID {id} not found");
                }

                return Ok(vessel);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating basic vessel data for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Deactivate a vessel (soft delete)
        /// </summary>
        [HttpDelete("{id:guid}")]
        public async Task<IActionResult> DeleteVessel(Guid id)
        {
            try
            {
                var result = await _vesselService.DeleteVesselAsync(id);
                if (!result)
                {
                    return NotFound($"Vessel with ID {id} not found");
                }

                return NoContent();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Add position update for a vessel
        /// </summary>
        [HttpPost("{id:guid}/positions")]
        public async Task<ActionResult<VesselPositionDto>> AddPosition(Guid id, [FromBody] CreateVesselPositionDto positionDto)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                // Verify vessel exists
                var vessel = await _vesselService.GetVesselByIdAsync(id);
                if (vessel == null)
                {
                    return NotFound($"Vessel with ID {id} not found");
                }

                var position = await _vesselService.AddPositionAsync(id, positionDto);
                return CreatedAtAction(nameof(GetVesselPositions), new { id = id }, position);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding position for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Get position history for a vessel
        /// </summary>
        [HttpGet("{id:guid}/positions")]
        public async Task<ActionResult<IEnumerable<VesselPositionDto>>> GetVesselPositions(
            Guid id, 
            [FromQuery] DateTime? fromDate = null)
        {
            try
            {
                var positions = await _vesselService.GetVesselPositionsAsync(id, fromDate);
                return Ok(positions);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving positions for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Add fuel consumption record for a vessel
        /// </summary>
        [HttpPost("{id:guid}/fuel")]
        public async Task<ActionResult<FuelConsumptionDto>> AddFuelRecord(Guid id, [FromBody] CreateFuelConsumptionDto fuelDto)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                // Verify vessel exists
                var vessel = await _vesselService.GetVesselByIdAsync(id);
                if (vessel == null)
                {
                    return NotFound($"Vessel with ID {id} not found");
                }

                var fuelRecord = await _vesselService.AddFuelRecordAsync(id, fuelDto);
                
                // Check for fuel efficiency alerts
                if (fuelRecord.FuelEfficiency > 0.5) // Threshold for poor efficiency
                {
                    await _alertService.CreateAlertAsync(id, new CreateVesselAlertDto
                    {
                        AlertType = "FUEL_EFFICIENCY",
                        Message = $"High fuel consumption detected: {fuelRecord.FuelEfficiency:F3} MT/NM",
                        Severity = "WARNING"
                    });
                }

                return CreatedAtAction(nameof(GetVesselFuelRecords), new { id = id }, fuelRecord);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error adding fuel record for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Get fuel consumption history for a vessel
        /// </summary>
        [HttpGet("{id:guid}/fuel")]
        public async Task<ActionResult<IEnumerable<FuelConsumptionDto>>> GetVesselFuelRecords(
            Guid id, 
            [FromQuery] DateTime? fromDate = null)
        {
            try
            {
                var fuelRecords = await _vesselService.GetVesselFuelRecordsAsync(id, fromDate);
                return Ok(fuelRecords);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving fuel records for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Get alerts for a vessel
        /// </summary>
        [HttpGet("{id:guid}/alerts")]
        public async Task<ActionResult<IEnumerable<VesselAlertDto>>> GetVesselAlerts(
            Guid id, 
            [FromQuery] bool? acknowledged = null)
        {
            try
            {
                var alerts = await _alertService.GetVesselAlertsAsync(id, acknowledged);
                return Ok(alerts);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving alerts for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Create manual alert for a vessel
        /// </summary>
        [HttpPost("{id:guid}/alerts")]
        public async Task<ActionResult<VesselAlertDto>> CreateVesselAlert(Guid id, [FromBody] CreateVesselAlertDto alertDto)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                // Verify vessel exists
                var vessel = await _vesselService.GetVesselByIdAsync(id);
                if (vessel == null)
                {
                    return NotFound($"Vessel with ID {id} not found");
                }

                var alert = await _alertService.CreateAlertAsync(id, alertDto);
                return CreatedAtAction(nameof(GetVesselAlerts), new { id = id }, alert);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating alert for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Bulk upload position data from AIS/GPS sources
        /// </summary>
        [HttpPost("{id:guid}/positions/bulk")]
        public async Task<IActionResult> BulkUploadPositions(Guid id, [FromBody] List<CreateVesselPositionDto> positions)
        {
            try
            {
                // Verify vessel exists
                var vessel = await _vesselService.GetVesselByIdAsync(id);
                if (vessel == null)
                {
                    return NotFound($"Vessel with ID {id} not found");
                }

                var successCount = 0;
                var errors = new List<string>();

                foreach (var position in positions)
                {
                    try
                    {
                        await _vesselService.AddPositionAsync(id, position);
                        successCount++;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error adding position at {Timestamp} for vessel {VesselId}", position.Timestamp, id);
                        errors.Add($"Position at {position.Timestamp}: Processing failed");
                    }
                }

                return Ok(new { 
                    TotalSubmitted = positions.Count, 
                    SuccessfullyProcessed = successCount, 
                    Errors = errors 
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error bulk uploading positions for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Get vessel performance metrics
        /// </summary>
        [HttpGet("{id:guid}/metrics")]
        public async Task<ActionResult> GetVesselMetrics(Guid id, [FromQuery] DateTime? fromDate = null)
        {
            try
            {
                var vessel = await _vesselService.GetVesselByIdAsync(id);
                if (vessel == null)
                {
                    return NotFound($"Vessel with ID {id} not found");
                }

                var positions = await _vesselService.GetVesselPositionsAsync(id, fromDate);
                var fuelRecords = await _vesselService.GetVesselFuelRecordsAsync(id, fromDate);
                var alerts = await _alertService.GetVesselAlertsAsync(id);

                var metrics = new
                {
                    VesselId = id,
                    VesselName = vessel.Name,
                    VesselIMO = vessel.IMO,
                    Period = new
                    {
                        From = fromDate ?? DateTime.UtcNow.AddDays(-30),
                        To = DateTime.UtcNow
                    },
                    Navigation = new
                    {
                        TotalPositions = positions.Count(),
                        AverageSpeed = positions.Where(p => p.Speed.HasValue).Average(p => p.Speed ?? 0),
                        MaxSpeed = positions.Where(p => p.Speed.HasValue).Max(p => p.Speed ?? 0),
                        LastPosition = positions.FirstOrDefault()
                    },
                    Fuel = new
                    {
                        TotalRecords = fuelRecords.Count(),
                        TotalFuelConsumed = fuelRecords.Sum(f => f.FuelConsumed),
                        TotalDistanceTraveled = fuelRecords.Sum(f => f.DistanceTraveled),
                        AverageFuelEfficiency = fuelRecords.Any() ? fuelRecords.Average(f => f.FuelEfficiency) : 0,
                        BestEfficiency = fuelRecords.Any() ? fuelRecords.Min(f => f.FuelEfficiency) : 0,
                        WorstEfficiency = fuelRecords.Any() ? fuelRecords.Max(f => f.FuelEfficiency) : 0
                    },
                    Alerts = new
                    {
                        Total = alerts.Count(),
                        Unacknowledged = alerts.Count(a => !a.IsAcknowledged),
                        Critical = alerts.Count(a => a.Severity == "CRITICAL"),
                        Warnings = alerts.Count(a => a.Severity == "WARNING"),
                        ByType = alerts.GroupBy(a => a.AlertType)
                                      .Select(g => new { Type = g.Key, Count = g.Count() })
                    }
                };

                return Ok(metrics);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating metrics for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Get crew members currently onboard a vessel (filtered by vessel IMO via OriginNode)
        /// </summary>
        [HttpGet("{id:guid}/crew")]
        public async Task<IActionResult> GetVesselCrew(
            Guid id,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 50,
            [FromQuery] string? search = null,
            [FromQuery] bool? isOnboard = null)
        {
            try
            {
                var vessel = await _vesselService.GetVesselByIdAsync(id);
                if (vessel == null) return NotFound($"Vessel with ID {id} not found");

                var query = _context.CrewMembers
                    .Include(c => c.Rank)
                    .Include(c => c.Country)
                    .AsQueryable()
                    .Where(c => c.VesselId == id);

                if (isOnboard.HasValue)
                    query = query.Where(c => c.IsOnboard == isOnboard.Value);

                if (!string.IsNullOrWhiteSpace(search))
                    query = query.Where(c => c.FullName.Contains(search) || c.CrewId.Contains(search));

                var total = await query.CountAsync();
                var data = await query
                    .OrderBy(c => c.FullName)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(c => new
                    {
                        c.Id,
                        c.CrewId,
                        c.FullName,
                        c.RankId,
                        RankName = c.Rank != null ? c.Rank.RankName : null,
                        RankCode = c.Rank != null ? c.Rank.RankCode : null,
                        c.Department,
                        c.CountryId,
                        CountryName = c.Country != null ? c.Country.CountryName : null,
                        c.DateOfBirth,
                        c.JoinDate,
                        c.EmbarkDate,
                        c.DisembarkDate,
                        c.ContractEnd,
                        c.IsOnboard,
                        c.EmergencyContact,
                        c.EmailAddress,
                        c.PhoneNumber,
                        c.PhotoUrl,
                        c.MaritalStatus,
                        c.BloodGroup,
                        c.CertificateNumber,
                        c.CertificateExpiry,
                        c.MedicalExpiry,
                        c.OriginNode,
                        c.CreatedAt,
                        c.UpdatedAt
                    })
                    .ToListAsync();

                return Ok(new { data, total, page, pageSize });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving crew for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Get maritime reports submitted from a vessel (filtered by vessel IMO via OriginNode)
        /// </summary>
        [HttpGet("{id:guid}/reports")]
        public async Task<IActionResult> GetVesselReports(
            Guid id,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20,
            [FromQuery] string? status = null)
        {
            try
            {
                var vessel = await _vesselService.GetVesselByIdAsync(id);
                if (vessel == null) return NotFound($"Vessel with ID {id} not found");

                var origins = await ProductApi.Services.Sync.VesselSyncIdentity.HistoricalOriginsAsync(_context, id);
                var query = _context.MaritimeReports.AsQueryable()
                    .Where(r => origins.Contains(r.OriginNode));

                if (!string.IsNullOrWhiteSpace(status))
                    query = query.Where(r => r.Status == status);

                var total = await query.CountAsync();
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
                        r.PreparedBy,
                        r.IsTransmitted,
                        r.TransmittedAt,
                        r.Remarks,
                        r.OriginNode,
                        r.CreatedAt
                    })
                    .ToListAsync();

                return Ok(new { data, total, page, pageSize });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving reports for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }

        /// <summary>
        /// Get sync logs for a specific vessel (filtered by vessel IMO via OriginNode)
        /// </summary>
        [HttpGet("{id:guid}/sync-logs")]
        public async Task<IActionResult> GetVesselSyncLogs(
            Guid id,
            [FromQuery] int take = 100,
            [FromQuery] string? status = null,
            [FromQuery] string? tableName = null)
        {
            try
            {
                var vessel = await _vesselService.GetVesselByIdAsync(id);
                if (vessel == null) return NotFound($"Vessel with ID {id} not found");

                var origins = await ProductApi.Services.Sync.VesselSyncIdentity.HistoricalOriginsAsync(_context, id);
                var query = _context.SyncLogs.AsQueryable()
                    .Where(l => origins.Contains(l.OriginNode));

                if (!string.IsNullOrWhiteSpace(status))
                    query = query.Where(l => l.Status == status);

                if (!string.IsNullOrWhiteSpace(tableName))
                    query = query.Where(l => l.TableName == tableName);

                var logs = await query
                    .OrderByDescending(l => l.ProcessedAt)
                    .Take(take)
                    .ToListAsync();

                var stats = new
                {
                    Total = await _context.SyncLogs.CountAsync(l => origins.Contains(l.OriginNode)),
                    Success = await _context.SyncLogs.CountAsync(l => origins.Contains(l.OriginNode) && l.Status == "SUCCESS"),
                    Failed = await _context.SyncLogs.CountAsync(l => origins.Contains(l.OriginNode) && l.Status == "FAILED"),
                    Conflict = await _context.SyncLogs.CountAsync(l => origins.Contains(l.OriginNode) && l.Status == "CONFLICT")
                };

                return Ok(new { logs, stats });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving sync logs for vessel {VesselId}", id);
                return StatusCode(500, "Internal server error");
            }
        }
    }
}
