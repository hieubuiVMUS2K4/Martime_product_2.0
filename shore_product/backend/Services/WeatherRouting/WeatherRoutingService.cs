using System.Diagnostics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.DTOs.WeatherRouting;
using ProductApi.Models.WeatherRouting;

namespace ProductApi.Services.WeatherRouting;

public sealed class WeatherRoutingService : IWeatherRoutingService
{
    /// <summary>Số vùng thiên tai demo mặc định (đủ loại thiên tai trên biển).</summary>
    private const int DefaultHazardCount = 8;

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    private readonly AppDbContext _db;
    private readonly IGridBuilder _gridBuilder;
    private readonly IHeuristicCost _heuristicCost;
    private readonly IAstStarRouter _aStar;
    private readonly IStraightBaselineRouter _baseline;
    private readonly IVoyageLegPlanService _legPlanService;
    private readonly ILogger<WeatherRoutingService> _logger;

    /// <summary>
    /// Hệ số nới khung lưới thử lần lượt khi A* không tìm được đường với khung mặc định.
    /// Bbox mặc định chỉ rộng hơn start/goal 5° nên tuyến phải vòng xa hơn (qua Gibraltar,
    /// vòng mũi Iberia...) sẽ bị cắt cụt.
    /// </summary>
    private static readonly double[] GridPaddingScales = { 2.5, 5.0, 10.0 };

    public WeatherRoutingService(
        AppDbContext db,
        IGridBuilder gridBuilder,
        IHeuristicCost heuristicCost,
        IAstStarRouter aStar,
        IStraightBaselineRouter baseline,
        IVoyageLegPlanService legPlanService,
        ILogger<WeatherRoutingService> logger)
    {
        _db = db;
        _gridBuilder = gridBuilder;
        _heuristicCost = heuristicCost;
        _aStar = aStar;
        _baseline = baseline;
        _legPlanService = legPlanService;
        _logger = logger;
    }

    public async Task<WeatherRoutingJobDto> CreateAndRunAsync(CreateWeatherRoutingJobRequest request, CancellationToken ct = default)
    {
        var start = new LatLon(
            request.StartLat ?? WeatherRoutingDemoDefaults.Start.Lat,
            request.StartLon ?? WeatherRoutingDemoDefaults.Start.Lon);
        var goal = new LatLon(
            request.GoalLat ?? WeatherRoutingDemoDefaults.Goal.Lat,
            request.GoalLon ?? WeatherRoutingDemoDefaults.Goal.Lon);

        var job = new WeatherRoutingJob
        {
            Id = Guid.NewGuid(),
            VesselId = request.VesselId,
            StartLat = start.Lat,
            StartLon = start.Lon,
            GoalLat = goal.Lat,
            GoalLon = goal.Lon,
            Status = WeatherRoutingJobStatus.Queued,
            Version = 1,
            RequestJson = JsonSerializer.Serialize(request, JsonOpts),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.WeatherRoutingJobs.Add(job);
        await _db.SaveChangesAsync(ct);

        await RunRoutingAsync(job, request, ct);
        return await MapJobAsync(job.Id, ct) ?? throw new InvalidOperationException("Job missing after run");
    }

    public async Task<WeatherRoutingJobDto?> GetJobAsync(Guid id, CancellationToken ct = default) =>
        await MapJobAsync(id, ct);

    public async Task<IReadOnlyList<WeatherRoutingJobListItemDto>> ListJobsAsync(int take = 50, CancellationToken ct = default)
    {
        take = Math.Clamp(take, 1, 200);
        return await _db.WeatherRoutingJobs.AsNoTracking()
            .OrderByDescending(j => j.CreatedAt)
            .Take(take)
            .Select(j => new WeatherRoutingJobListItemDto
            {
                Id = j.Id,
                VesselId = j.VesselId,
                StartLat = j.StartLat,
                StartLon = j.StartLon,
                GoalLat = j.GoalLat,
                GoalLon = j.GoalLon,
                Status = j.Status,
                Version = j.Version,
                CreatedAt = j.CreatedAt,
                CompletedAt = j.CompletedAt
            })
            .ToListAsync(ct);
    }

    public async Task<WeatherRoutingJobDto?> ReplanAsync(Guid id, ReplanWeatherRoutingJobRequest? request = null, CancellationToken ct = default)
    {
        // DbContext đặt NoTracking toàn cục -> phải AsTracking() thì thay đổi mới được lưu.
        var job = await _db.WeatherRoutingJobs.AsTracking().FirstOrDefaultAsync(j => j.Id == id, ct);
        if (job is null) return null;

        // Dùng lại cấu hình của lần tạo job (trước đây replan bị mất gridSize/storm radius
        // và ghi đè RequestJson bằng payload khác shape).
        var effective = DeserializeRequest(job.RequestJson) ?? new CreateWeatherRoutingJobRequest
        {
            StartLat = job.StartLat,
            StartLon = job.StartLon,
            GoalLat = job.GoalLat,
            GoalLon = job.GoalLon
        };

        if (request?.GridSize is { } gridOverride) effective.GridSize = gridOverride;
        if (request?.MockStormRadiusNm is { } radiusOverride) effective.MockStormRadiusNm = radiusOverride;

        job.Version += 1;
        job.Status = WeatherRoutingJobStatus.Queued;
        job.ErrorMessage = null;
        job.CompletedAt = null;
        job.UpdatedAt = DateTime.UtcNow;
        job.RequestJson = JsonSerializer.Serialize(effective, JsonOpts);

        await _db.SaveChangesAsync(ct);
        await RunRoutingAsync(job, effective, ct);
        return await MapJobAsync(job.Id, ct);
    }

    public async Task<IReadOnlyList<WeatherRoutingRouteDto>> GetRoutesAsync(Guid jobId, CancellationToken ct = default)
    {
        var routes = await _db.WeatherRoutingRoutes.AsNoTracking()
            .Where(r => r.JobId == jobId)
            .OrderByDescending(r => r.Version)
            .ThenBy(r => r.Kind)
            .ToListAsync(ct);
        return routes.Select(MapRoute).ToList();
    }

    private async Task RunRoutingAsync(WeatherRoutingJob job, CreateWeatherRoutingJobRequest request, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        job.Status = WeatherRoutingJobStatus.Running;
        job.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        try
        {
            var start = new LatLon(job.StartLat, job.StartLon);
            var goal = new LatLon(job.GoalLat, job.GoalLon);

            // Thiên tai: sinh tập vùng thiên tai (đủ loại) theo seed. Cùng seed + cùng tuyến
            // cho ra cùng tập vùng, nên bản đồ và đường né luôn khớp nhau.
            // Rải DỌC ĐƯỜNG BIỂN THẬT (không phải đường thẳng start→goal) — đường thẳng chạy xuyên
            // lục địa nên thiên tai rơi vào chỗ tuyến không đi qua, không kiểm chứng được việc né.
            //
            // Mặc định seed 0 — PHẢI khớp với VoyageLegPlanService. Trước đây chỗ này lấy
            // Random.Shared.Next còn chỗ kia lấy 0, nên khi người gọi không truyền seed thì
            // BẢN ĐỒ HIỂN THỊ MỘT TẬP VÙNG còn TUYẾN LẠI NÉ MỘT TẬP KHÁC — nhìn như tuyến
            // “ăn trọn” vùng bão dù planner báo đã né hết.
            var hazardSeed = request.HazardSeed ?? 0;
            var hazardCount = Math.Clamp(request.HazardCount ?? DefaultHazardCount, 0, 40);
            var zones = VoyageHazardPlanner.Generate(
                _gridBuilder, _aStar, _heuristicCost, start, goal, hazardSeed, hazardCount);
            IHazardProvider hazard = zones.Count > 0
                ? new ZoneHazardProvider(zones)
                : NoHazardProvider.Instance;

            job.HazardJson = JsonSerializer.Serialize(hazard.DescribeHazards(), JsonOpts);

            var gridSize = request.GridSize ?? WeatherRoutingDemoDefaults.DefaultGridSize;
            // Keep caller gridSize (auto-densify caused 30s FE timeouts on Pacific).
            gridSize = Math.Clamp(gridSize, WeatherRoutingDemoDefaults.MinGridSize, WeatherRoutingDemoDefaults.MaxGridSize);
            var grid = _gridBuilder.Build(start, goal, hazard, gridSize);
            var aStarResult = _aStar.FindPath(grid, _heuristicCost);
            // Khung lưới mặc định bám sát start→goal nên tuyến phải vòng ra ngoài sẽ không có đường
            // (ví dụ Vũng Tàu → Le Havre: bbox tới lon −4.89 nhưng Gibraltar ở −5.6).
            // Thử lại với khung rộng dần trước khi báo thất bại.
            if (!aStarResult.Found)
            {
                foreach (var paddingScale in GridPaddingScales)
                {
                    _logger.LogInformation(
                        "Không có đường với khung mặc định — thử lại với bbox nới {Scale}x", paddingScale);
                    var wider = _gridBuilder.Build(start, goal, hazard, gridSize, paddingScale);
                    var retry = _aStar.FindPath(wider, _heuristicCost);
                    if (retry.Found)
                    {
                        grid = wider;
                        aStarResult = retry;
                        break;
                    }
                }
            }
            var baselineResult = _baseline.Build(start, goal);

            // Snap A* ends to exact requested coordinates, then sanitize spikes/land chords.
            if (aStarResult.Found && aStarResult.Waypoints.Count > 0)
            {
                var pts = aStarResult.Waypoints.ToList();
                pts[0] = start;
                pts[^1] = goal;
                // Sanitize after snap; do not re-snap (re-snap reintroduces land chords to ports).
                pts = PathSanitizer.Sanitize(pts);
                aStarResult = new RouteResult
                {
                    Found = true,
                    Waypoints = pts,
                    PathCost = aStarResult.PathCost,
                    DistanceNm = GeoMath.PathLengthNm(pts),
                    ExploredCells = aStarResult.ExploredCells,
                    CellCount = pts.Count
                };
            }

            // Kế hoạch n chặng: chia hành trình thành các chặng con, chọn cảng tiếp nhiên liệu
            // sao cho khi cập cảng nhiên liệu còn lại ≈ mức dự trữ (mặc định 20% sức chứa).
            if (request.PlanLegs != false && aStarResult.Found && aStarResult.Waypoints.Count >= 2)
            {
                await PlanLegsAsync(job, request, aStarResult.Waypoints, ct);
            }

            // Remove prior routes for this version (replan replaces same version set).
            var stale = await _db.WeatherRoutingRoutes
                .Where(r => r.JobId == job.Id && r.Version == job.Version)
                .ToListAsync(ct);
            if (stale.Count > 0)
                _db.WeatherRoutingRoutes.RemoveRange(stale);

            if (aStarResult.Found)
            {
                _db.WeatherRoutingRoutes.Add(new WeatherRoutingRoute
                {
                    Id = Guid.NewGuid(),
                    JobId = job.Id,
                    Kind = WeatherRoutingRouteKind.AStar,
                    Version = job.Version,
                    WaypointsJson = SerializeWaypoints(aStarResult.Waypoints),
                    MetricsJson = JsonSerializer.Serialize(new
                    {
                        distanceNm = aStarResult.DistanceNm,
                        pathCost = aStarResult.PathCost,
                        cellCount = aStarResult.CellCount,
                        exploredCells = aStarResult.ExploredCells,
                        avoidedHazard = true
                    }, JsonOpts),
                    CreatedAt = DateTime.UtcNow
                });
            }

            _db.WeatherRoutingRoutes.Add(new WeatherRoutingRoute
            {
                Id = Guid.NewGuid(),
                JobId = job.Id,
                Kind = WeatherRoutingRouteKind.Baseline,
                Version = job.Version,
                WaypointsJson = SerializeWaypoints(baselineResult.Waypoints),
                MetricsJson = JsonSerializer.Serialize(new
                {
                    distanceNm = baselineResult.DistanceNm,
                    pathCost = baselineResult.PathCost,
                    cellCount = baselineResult.CellCount,
                    crossesHazard = baselineResult.Waypoints.Any(hazard.IsBlocked)
                }, JsonOpts),
                CreatedAt = DateTime.UtcNow
            });

            sw.Stop();
            job.MetricsJson = JsonSerializer.Serialize(new
            {
                gridRows = grid.Rows,
                gridCols = grid.Cols,
                gridSize,
                hazardSeed,
                hazardCount,
                hazardBlockedCells = zones.Count,
                aStarFound = aStarResult.Found,
                aStarExplored = aStarResult.ExploredCells,
                aStarDistanceNm = aStarResult.DistanceNm,
                baselineDistanceNm = baselineResult.DistanceNm,
                elapsedMs = sw.ElapsedMilliseconds,
                version = job.Version
            }, JsonOpts);

            job.Status = aStarResult.Found
                ? WeatherRoutingJobStatus.Completed
                : WeatherRoutingJobStatus.Failed;
            job.ErrorMessage = aStarResult.Found ? null : aStarResult.FailureReason;
            job.CompletedAt = DateTime.UtcNow;
            job.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            _logger.LogInformation(
                "WeatherRouting job {JobId} v{Version} status={Status} aStarFound={Found} elapsedMs={Ms}",
                job.Id, job.Version, job.Status, aStarResult.Found, sw.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "WeatherRouting job {JobId} failed", job.Id);
            job.Status = WeatherRoutingJobStatus.Failed;
            job.ErrorMessage = ex.Message;
            job.CompletedAt = DateTime.UtcNow;
            job.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
        }
    }

    /// <summary>
    /// Gọi bộ lập kế hoạch chặng với hành lang tuyến chính là đường A* vừa tìm được.
    /// Kết quả lưu vào job.PlanJson; nếu job gắn với voyage thì ghi luôn voyage_plan_legs.
    /// </summary>
    private async Task PlanLegsAsync(
        WeatherRoutingJob job,
        CreateWeatherRoutingJobRequest request,
        IReadOnlyList<LatLon> corridorWaypoints,
        CancellationToken ct)
    {
        try
        {
            var legRequest = new PlanVoyageLegsRequest
            {
                VoyageId = request.VoyageId,
                VesselId = job.VesselId,
                StartLat = job.StartLat,
                StartLon = job.StartLon,
                GoalLat = job.GoalLat,
                GoalLon = job.GoalLon,
                CurrentFuelTons = request.CurrentFuelTons,
                FuelCapacityTons = request.FuelCapacityTons,
                ReserveFraction = request.ReserveFraction,
                ServiceSpeedKts = request.ServiceSpeedKts,
                ServicePowerKw = request.ServicePowerKw,
                MaxDetourNm = request.MaxDetourNm,
                PortCodes = request.PortCodes,
                RoutePreference = request.RoutePreference,
                CorridorViaPortCodes = request.CorridorViaPortCodes,
                MustVisitPortCodes = request.MustVisitPortCodes,
                HazardSeed = request.HazardSeed,
                HazardCount = request.HazardCount,
                Persist = true,
                RefineLegDistances = true,
                DepartureUtc = request.DepartureUtc
            };

            var plan = await _legPlanService.PlanAsync(legRequest, corridorWaypoints, ct);
            job.PlanJson = JsonSerializer.Serialize(plan, JsonOpts);

            _logger.LogInformation(
                "WeatherRouting job {JobId} v{Version}: kế hoạch {Legs} chặng, {Stops} điểm tiếp nhiên liệu, {Dist:F0} NM, {Fuel:F1} t",
                job.Id, job.Version, plan.LegCount, plan.BunkerStopCount, plan.TotalDistanceNm, plan.TotalFuelTons);
        }
        catch (Exception ex)
        {
            // Không để lỗi lập kế hoạch chặng làm hỏng kết quả tìm đường.
            _logger.LogError(ex, "Lập kế hoạch chặng thất bại cho job {JobId}", job.Id);
            job.PlanJson = JsonSerializer.Serialize(new VoyageLegPlanDto
            {
                Warnings = { "Lập kế hoạch chặng thất bại: " + ex.Message }
            }, JsonOpts);
        }
    }

    private static CreateWeatherRoutingJobRequest? DeserializeRequest(string json)
    {
        if (string.IsNullOrWhiteSpace(json) || json == "{}") return null;
        try
        {
            var parsed = JsonSerializer.Deserialize<CreateWeatherRoutingJobRequest>(json);
            if (parsed is null) return null;
            // Payload kiểu wrapper ({replan:true,...}) sẽ ra toàn null -> coi như không dùng được.
            if (parsed.StartLat is null && parsed.GoalLat is null && parsed.GridSize is null) return null;
            return parsed;
        }
        catch
        {
            return null;
        }
    }

    private async Task<WeatherRoutingJobDto?> MapJobAsync(Guid id, CancellationToken ct)
    {
        var job = await _db.WeatherRoutingJobs.AsNoTracking()
            .FirstOrDefaultAsync(j => j.Id == id, ct);
        if (job is null) return null;

        var routes = await _db.WeatherRoutingRoutes.AsNoTracking()
            .Where(r => r.JobId == id && r.Version == job.Version)
            .OrderBy(r => r.Kind)
            .ToListAsync(ct);

        return new WeatherRoutingJobDto
        {
            Id = job.Id,
            VesselId = job.VesselId,
            StartLat = job.StartLat,
            StartLon = job.StartLon,
            GoalLat = job.GoalLat,
            GoalLon = job.GoalLon,
            Status = job.Status,
            Version = job.Version,
            Request = DeserializeObj(job.RequestJson),
            Hazards = DeserializeObj(job.HazardJson),
            Metrics = DeserializeObj(job.MetricsJson),
            Plan = DeserializePlan(job.PlanJson),
            ErrorMessage = job.ErrorMessage,
            CreatedAt = job.CreatedAt,
            UpdatedAt = job.UpdatedAt,
            CompletedAt = job.CompletedAt,
            Routes = routes.Select(MapRoute).ToList()
        };
    }

    private static WeatherRoutingRouteDto MapRoute(WeatherRoutingRoute r) => new()
    {
        Id = r.Id,
        JobId = r.JobId,
        Kind = r.Kind,
        Version = r.Version,
        Waypoints = DeserializeWaypoints(r.WaypointsJson),
        Metrics = DeserializeObj(r.MetricsJson),
        CreatedAt = r.CreatedAt
    };

    private static string SerializeWaypoints(IReadOnlyList<LatLon> pts) =>
        JsonSerializer.Serialize(pts.Select(p => new { lat = p.Lat, lon = p.Lon }), JsonOpts);

    private static List<LatLonDto> DeserializeWaypoints(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(string.IsNullOrWhiteSpace(json) ? "[]" : json);
            var list = new List<LatLonDto>();
            foreach (var el in doc.RootElement.EnumerateArray())
            {
                list.Add(new LatLonDto
                {
                    Lat = el.GetProperty("lat").GetDouble(),
                    Lon = el.GetProperty("lon").GetDouble()
                });
            }
            return list;
        }
        catch
        {
            return new List<LatLonDto>();
        }
    }

    private static object? DeserializeObj(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<object>(string.IsNullOrWhiteSpace(json) ? "{}" : json);
        }
        catch
        {
            return json;
        }
    }

    private static VoyageLegPlanDto? DeserializePlan(string json)
    {
        if (string.IsNullOrWhiteSpace(json) || json == "{}") return null;
        try
        {
            return JsonSerializer.Deserialize<VoyageLegPlanDto>(json, JsonOpts);
        }
        catch
        {
            return null;
        }
    }
}





