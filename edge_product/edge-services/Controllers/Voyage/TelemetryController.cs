using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;

namespace MaritimeEdge.Controllers.Voyage;

[ApiController]
[Route("api/telemetry")]
public class TelemetryController : ControllerBase
{
    private readonly EdgeDbContext _context;
    private readonly ILogger<TelemetryController> _logger;
    private readonly IConfiguration _configuration;
    private readonly IMemoryCache _cache;
    private static int _cleanupCounter = 0;

    public TelemetryController(EdgeDbContext context, ILogger<TelemetryController> logger, IConfiguration configuration, IMemoryCache cache)
    {
        _context = context;
        _logger = logger;
        _configuration = configuration;
        _cache = cache;
    }

    // Position endpoints
    [HttpGet("position/latest")]
    public async Task<IActionResult> GetLatestPosition()
    {
        try
        {
            var position = await _context.PositionData
                .AsNoTracking()
                .Where(p => p.Source.ToUpper() == "GPS")
                .OrderByDescending(p => p.Timestamp)
                .FirstOrDefaultAsync();

            if (position == null)
            {
                var latestAvailable = await _context.PositionData
                    .AsNoTracking()
                    .OrderByDescending(p => p.Timestamp)
                    .Select(p => new
                    {
                        p.Id,
                        p.Timestamp,
                        p.Source,
                        p.OriginNode,
                        p.Latitude,
                        p.Longitude
                    })
                    .FirstOrDefaultAsync();

                if (latestAvailable == null)
                {
                    _logger.LogWarning("PositionLatest: no position records available");
                    return NotFound(new { message = "No GPS position data available" });
                }

                _logger.LogWarning(
                    "PositionLatest: no GPS records; latest available ignored source={Source} node={Node} ts={Timestamp:o} lat={Latitude:F6} lon={Longitude:F6} id={Id}",
                    latestAvailable.Source,
                    latestAvailable.OriginNode,
                    latestAvailable.Timestamp,
                    latestAvailable.Latitude,
                    latestAvailable.Longitude,
                    latestAvailable.Id);

                return NotFound(new
                {
                    message = "No GPS position data available",
                    latestIgnoredSource = latestAvailable.Source,
                    latestIgnoredTimestamp = latestAvailable.Timestamp,
                    latestIgnoredOriginNode = latestAvailable.OriginNode
                });
            }

            _logger.LogInformation(
                "PositionLatest: selected source={Source} node={Node} ts={Timestamp:o} lat={Latitude:F6} lon={Longitude:F6} sog={Sog:F2} cog={Cog:F1} id={Id}",
                position.Source,
                position.OriginNode,
                position.Timestamp,
                position.Latitude,
                position.Longitude,
                position.SpeedOverGround,
                position.CourseOverGround,
                position.Id);

            return Ok(position);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting latest position");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("position/history")]
    public async Task<IActionResult> GetPositionHistory(
        [FromQuery] int hours = 24,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100)
    {
        try
        {
            // Validate pagination
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 100;
            if (pageSize > 1000) pageSize = 1000; // Max 1000 for telemetry data

            var since = DateTime.UtcNow.AddHours(-hours);
            
            var query = _context.PositionData
                .AsNoTracking()
                .Where(p => p.Timestamp >= since && p.Source.ToUpper() == "GPS")
                .OrderByDescending(p => p.Timestamp);

            var totalCount = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

            var positions = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            _logger.LogInformation(
                "PositionHistory: selected source=GPS hours={Hours} page={Page} pageSize={PageSize} returned={Returned} total={Total}",
                hours,
                page,
                pageSize,
                positions.Count,
                totalCount);

            return Ok(new
            {
                data = positions,
                pagination = new
                {
                    currentPage = page,
                    pageSize = pageSize,
                    totalCount = totalCount,
                    totalPages = totalPages,
                    hasNextPage = page < totalPages,
                    hasPreviousPage = page > 1
                },
                timeRange = new
                {
                    since = since,
                    hours = hours
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting position history");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // Navigation endpoints
    [HttpGet("navigation/latest")]
    public async Task<IActionResult> GetLatestNavigation()
    {
        try
        {
            if (_cache.TryGetValue("LatestNavigation", out NavigationData? cachedNav) && cachedNav != null)
            {
                return Ok(cachedNav);
            }

            var navigation = await _context.NavigationData
                .AsNoTracking()
                .OrderByDescending(n => n.Timestamp)
                .FirstOrDefaultAsync();

            if (navigation == null)
            {
                return NotFound(new { message = "No navigation data available" });
            }

            _cache.Set("LatestNavigation", navigation, TimeSpan.FromSeconds(5));

            return Ok(navigation);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting latest navigation");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// POST: Nhận dữ liệu Pitch/Roll từ cảm biến MPU6050 (ESP32) qua WiFi
    /// Cho phép anonymous vì cảm biến không có cơ chế đăng nhập
    /// 
    /// Đồng thời auto-detect:
    /// - Engine start/stop events (EngineEvent)
    /// - Sensor anomalies (SafetyAlarm) như pitch/roll vượt ngưỡng
    /// </summary>
    [AllowAnonymous]
    [HttpPost("navigation")]
    public async Task<IActionResult> PostNavigationData([FromBody] SensorNavigationDto dto)
    {
        try
        {
            if (dto == null)
                return BadRequest(new { error = "Invalid sensor data" });

            var now = DateTime.UtcNow;
            var navigation = new NavigationData
            {
                Id = Guid.NewGuid(),
                Timestamp = now,
                Pitch = dto.Pitch,
                Roll = dto.Roll,
                HeadingTrue = dto.HeadingTrue,
                HeadingMagnetic = dto.HeadingMagnetic,
                SpeedThroughWater = dto.Speed ?? dto.SpeedThroughWater,
                Depth = dto.Depth,
                IsSynced = false,
                CreatedAt = now
            };

            _context.NavigationData.Add(navigation);

            // ── Đồng thời tạo EngineData để trạng thái motor được đồng bộ lên Shore ──
            if (dto.Speed.HasValue)
            {
                var isRunning = dto.Speed.Value > 0;
                var engineData = new EngineData
                {
                    Timestamp = now,
                    EngineId = "MAIN_ENGINE",
                    Rpm = dto.Speed.Value,
                    IsRunning = isRunning,
                    IsSynced = false,
                    CreatedAt = now,
                    UpdatedAt = now,
                    OriginNode = "SHIP_01"
                };
                _context.EngineData.Add(engineData);

                // ── Detect engine start/stop events ──
                var lastEngine = await _context.EngineData
                    .Where(e => e.EngineId == "MAIN_ENGINE")
                    .OrderByDescending(e => e.Timestamp)
                    .Skip(1) // Bỏ qua cái vừa thêm
                    .FirstOrDefaultAsync();

                if (lastEngine != null && lastEngine.IsRunning != isRunning)
                {
                    var eventType = isRunning ? "START" : "STOP";
                    var engineEvent = new EngineEvent
                    {
                        Timestamp = now,
                        EngineId = "MAIN_ENGINE",
                        EventType = eventType,
                        Rpm = dto.Speed.Value,
                        TriggerSource = "ESP8266",
                        IsSynced = false,
                        CreatedAt = now,
                        OriginNode = "SHIP_01"
                    };
                    _context.EngineEvents.Add(engineEvent);

                    _logger.LogInformation(
                        "[ENGINE-EVENT] {EventType} detected for MAIN_ENGINE (RPM={Rpm})",
                        eventType, dto.Speed.Value);
                }
            }

            // ── Check sensor thresholds → auto-create SafetyAlarm ──
            var pitchThreshold = _configuration.GetValue<double>("Alerts:Thresholds:PitchMax", 15.0);
            var rollThreshold = _configuration.GetValue<double>("Alerts:Thresholds:RollMax", 20.0);

            if (dto.Pitch.HasValue && Math.Abs(dto.Pitch.Value) > pitchThreshold)
            {
                var alarm = new SafetyAlarm
                {
                    Timestamp = now,
                    AlarmType = "EXCESSIVE_PITCH",
                    AlarmCode = "PITCH_HIGH",
                    Severity = "WARNING",
                    Location = "HULL",
                    Description = $"Pitch angle {dto.Pitch.Value:F1}° exceeds threshold {pitchThreshold}°",
                    IsSynced = false,
                    CreatedAt = now,
                    OriginNode = "SHIP_01"
                };
                _context.SafetyAlarms.Add(alarm);
                _logger.LogWarning("[ALERT] Excessive pitch: {Pitch}°", dto.Pitch.Value);
            }

            if (dto.Roll.HasValue && Math.Abs(dto.Roll.Value) > rollThreshold)
            {
                var alarm = new SafetyAlarm
                {
                    Timestamp = now,
                    AlarmType = "EXCESSIVE_ROLL",
                    AlarmCode = "ROLL_HIGH",
                    Severity = "WARNING",
                    Location = "HULL",
                    Description = $"Roll angle {dto.Roll.Value:F1}° exceeds threshold {rollThreshold}°",
                    IsSynced = false,
                    CreatedAt = now,
                    OriginNode = "SHIP_01"
                };
                _context.SafetyAlarms.Add(alarm);
                _logger.LogWarning("[ALERT] Excessive roll: {Roll}°", dto.Roll.Value);
            }

            // Giữ tối đa 1000 bản ghi navigation gần nhất trên edge
            if (Interlocked.Increment(ref _cleanupCounter) % 100 == 0)
            {
                var count = await _context.NavigationData.CountAsync();
                if (count > 1000)
                {
                    var toDelete = await _context.NavigationData
                        .OrderBy(n => n.Timestamp)
                        .Take(count - 1000)
                        .ToListAsync();
                    _context.NavigationData.RemoveRange(toDelete);
                }
            }

            await _context.SaveChangesAsync();

            // Cập nhật cache ngay lập tức để dashboard nhận được data tức thì
            _cache.Set("LatestNavigation", navigation, TimeSpan.FromSeconds(5));

            _logger.LogInformation(
                "Sensor data received: Pitch={Pitch}, Roll={Roll}, Speed={Speed}",
                dto.Pitch, dto.Roll, dto.Speed);

            return CreatedAtAction(nameof(GetLatestNavigation), new { id = navigation.Id }, navigation);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving navigation sensor data");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// GET: Lịch sử dữ liệu navigation
    /// </summary>
    [HttpGet("navigation/history")]
    public async Task<IActionResult> GetNavigationHistory(
        [FromQuery] int hours = 24,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100)
    {
        try
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 100;
            if (pageSize > 1000) pageSize = 1000;

            var since = DateTime.UtcNow.AddHours(-hours);

            var query = _context.NavigationData
                .AsNoTracking()
                .Where(n => n.Timestamp >= since)
                .OrderByDescending(n => n.Timestamp);

            var totalCount = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

            var data = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return Ok(new
            {
                data,
                pagination = new
                {
                    currentPage = page,
                    pageSize,
                    totalCount,
                    totalPages,
                    hasNextPage = page < totalPages,
                    hasPreviousPage = page > 1
                },
                timeRange = new { since, hours }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting navigation history");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // Engine endpoints
    [HttpGet("engines")]
    public async Task<IActionResult> GetEngineStatus([FromQuery] string? id = null)
    {
        try
        {
            var query = _context.EngineData.AsNoTracking().AsQueryable();

            if (!string.IsNullOrEmpty(id))
            {
                query = query.Where(e => e.EngineId == id);
            }

            var engines = await query
                .GroupBy(e => e.EngineId)
                .Select(g => g.OrderByDescending(e => e.Timestamp).First())
                .ToListAsync();

            return Ok(engines);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting engine status");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // Generator endpoints
    [HttpGet("generators")]
    public async Task<IActionResult> GetGeneratorStatus([FromQuery] string? id = null)
    {
        try
        {
            var query = _context.GeneratorData.AsNoTracking().AsQueryable();

            if (!string.IsNullOrEmpty(id))
            {
                query = query.Where(g => g.GeneratorId == id);
            }

            var generators = await query
                .GroupBy(g => g.GeneratorId)
                .Select(g => g.OrderByDescending(e => e.Timestamp).First())
                .ToListAsync();

            return Ok(generators);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting generator status");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // Tank levels
    [HttpGet("tanks")]
    public async Task<IActionResult> GetTankLevels()
    {
        try
        {
            var tanks = await _context.TankLevels
                .AsNoTracking()
                .GroupBy(t => t.TankId)
                .Select(g => g.OrderByDescending(t => t.Timestamp).First())
                .ToListAsync();

            return Ok(tanks);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting tank levels");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // Fuel consumption
    [HttpGet("fuel/consumption")]
    public async Task<IActionResult> GetFuelConsumption(
        [FromQuery] int days = 7,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 100)
    {
        try
        {
            // Validate pagination
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 100;
            if (pageSize > 500) pageSize = 500;

            var since = DateTime.UtcNow.AddDays(-days);
            
            var query = _context.FuelConsumption
                .AsNoTracking()
                .Where(f => f.Timestamp >= since)
                .OrderByDescending(f => f.Timestamp);

            var totalCount = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

            var consumption = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return Ok(new
            {
                data = consumption,
                pagination = new
                {
                    currentPage = page,
                    pageSize = pageSize,
                    totalCount = totalCount,
                    totalPages = totalPages,
                    hasNextPage = page < totalPages,
                    hasPreviousPage = page > 1
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting fuel consumption");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // Environmental data
    [HttpGet("environmental/latest")]
    public async Task<IActionResult> GetLatestEnvironmental()
    {
        try
        {
            var env = await _context.EnvironmentalData
                .AsNoTracking()
                .OrderByDescending(e => e.Timestamp)
                .FirstOrDefaultAsync();

            if (env == null)
            {
                return NotFound(new { message = "No environmental data available" });
            }

            return Ok(env);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting environmental data");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // AIS data
    [HttpGet("ais/nearby")]
    public async Task<IActionResult> GetNearbyVessels([FromQuery] int range = 10)
    {
        try
        {
            // Get AIS data from last 30 minutes
            var since = DateTime.UtcNow.AddMinutes(-30);
            var vessels = await _context.AisData
                .AsNoTracking()
                .Where(a => a.Timestamp >= since && a.Latitude != null && a.Longitude != null)
                .GroupBy(a => a.Mmsi)
                .Select(g => g.OrderByDescending(a => a.Timestamp).First())
                .Take(50)
                .ToListAsync();

            return Ok(vessels);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting AIS data");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }
}
