using System.Diagnostics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using ProductApi.Data;
using ProductApi.DTOs.WeatherRouting;
using ProductApi.Models.WeatherRouting;

namespace ProductApi.Services.WeatherRouting;

public sealed class WeatherRoutingService : IWeatherRoutingService
{
    /// <summary>Số vùng thiên tai demo mặc định (đủ loại thiên tai trên biển).</summary>
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
    private readonly IMemoryCache _cache;
    private readonly ILogger<WeatherRoutingService> _logger;

    /// <summary>Trạng thái D* Lite giữ giữa các lần replan của MỘT job (trong bộ nhớ).</summary>
    private sealed class DStarSession
    {
        public required DStarLiteRouter Router { get; init; }
        public required int GridSize { get; init; }
        public required LatLon Start { get; init; }
        public required LatLon Goal { get; init; }
        /// <summary>Bước thời tiết mà Router đang phản ánh.</summary>
        public int Step { get; set; }
        public object Lock { get; } = new();
    }

    private static string DStarKey(Guid jobId) => $"wr-dstar:{jobId}";

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
        IMemoryCache cache,
        ILogger<WeatherRoutingService> logger)
    {
        _db = db;
        _gridBuilder = gridBuilder;
        _heuristicCost = heuristicCost;
        _aStar = aStar;
        _baseline = baseline;
        _legPlanService = legPlanService;
        _cache = cache;
        _logger = logger;
    }

    /// <summary>
    /// Lập lại kế hoạch TĂNG DẦN bằng D* Lite khi thời tiết tiến sang <paramref name="step"/>.
    ///
    /// Có phiên của bước ngay trước ⇒ dùng lại nguyên trạng thái tìm kiếm. Không có (lần replan
    /// đầu, backend vừa khởi động lại, hoặc nhảy bước) ⇒ dựng phiên từ thời tiết bước trước rồi
    /// mới cập nhật sang bước này, để lần replan nào cũng là một lần cập nhật tăng dần thật sự.
    ///
    /// Đồng thời chạy A* TỪ ĐẦU trên CÙNG lưới làm đối chứng: hai bên phải cùng chi phí tối ưu,
    /// khác nhau ở số ô phải duyệt — đó là số liệu so sánh của nhiệm vụ A* động.
    /// </summary>
    private (RoutingGrid Grid, RouteResult Route, object Stats) ReplanIncremental(
        Guid jobId, int step, int gridSize, LatLon start, LatLon goal, IHazardProvider hazard)
    {
        var key = DStarKey(jobId);
        var session = _cache.Get<DStarSession>(key);
        var reused = session is not null && session.Step == step - 1 && session.GridSize == gridSize &&
                     session.Start == start && session.Goal == goal;

        int? initExpanded = null;
        long? initMs = null;
        if (!reused)
        {
            var swInit = Stopwatch.StartNew();
            var prevZones = VoyageHazardPlanner.Generate(step - 1);
            IHazardProvider prevHazard = prevZones.Count > 0
                ? new ZoneHazardProvider(prevZones)
                : NoHazardProvider.Instance;
            var router = new DStarLiteRouter(_gridBuilder.Build(start, goal, prevHazard, gridSize), _heuristicCost);
            initExpanded = router.Plan().Expanded;
            initMs = swInit.ElapsedMilliseconds;
            session = new DStarSession
            {
                Router = router, GridSize = gridSize, Start = start, Goal = goal, Step = step - 1
            };
        }

        lock (session!.Lock)
        {
            var grid = _gridBuilder.Rebuild(session.Router.Grid, hazard);

            var swInc = Stopwatch.StartNew();
            var inc = session.Router.Replan(grid);
            swInc.Stop();

            var swFull = Stopwatch.StartNew();
            var full = _aStar.FindPath(grid, _heuristicCost);
            swFull.Stop();

            session.Step = step;
            if (inc.Route.Found)
                _cache.Set(key, session, new MemoryCacheEntryOptions { SlidingExpiration = TimeSpan.FromHours(2) });
            else
                _cache.Remove(key);

            var stats = new
            {
                mode = inc.Route.Found ? "dstar-lite" : "astar-fallback",
                fromStep = step - 1,
                toStep = step,
                // false = phải dựng lại trạng thái từ bước trước (lần replan đầu / backend khởi động lại).
                reusedState = reused,
                initExpanded,
                initMs,
                changedCells = inc.ChangedCells,
                gridCells = grid.Rows * grid.Cols,
                incrementalExpanded = inc.Expanded,
                incrementalMs = swInc.ElapsedMilliseconds,
                fullAStarExplored = full.ExploredCells,
                fullAStarMs = swFull.ElapsedMilliseconds,
                incrementalCost = inc.Route.Found ? inc.Route.PathCost : (double?)null,
                fullAStarCost = full.Found ? full.PathCost : (double?)null,
                sameCost = inc.Route.Found && full.Found &&
                           Math.Abs(inc.Route.PathCost - full.PathCost) <= 1e-6 * Math.Max(1.0, full.PathCost)
            };

            _logger.LogInformation(
                "Job {JobId}: replan bước {From}->{To} — D* Lite {Inc} ô ({IncMs} ms), A* từ đầu {Full} ô ({FullMs} ms), {Changed} ô thời tiết đổi",
                jobId, step - 1, step, inc.Expanded, swInc.ElapsedMilliseconds, full.ExploredCells,
                swFull.ElapsedMilliseconds, inc.ChangedCells);

            return (grid, inc.Route.Found ? inc.Route : full, stats);
        }
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

            // NEO = những điểm tàu BẮT BUỘC đi qua, theo đúng thứ tự: A → C → D → … → B.
            // Giữ nguyên thứ tự người dùng nhập; cảng nào không tra được toạ độ thì bỏ ra
            // chứ KHÔNG im lặng đổi thứ tự còn lại.
            var anchors = new List<LatLon> { start };
            if (request.MustVisitPortCodes is { Count: > 0 })
            {
                var codes = request.MustVisitPortCodes;
                var rows = await _db.Ports.AsNoTracking()
                    .Where(p => codes.Contains(p.PortCode) && p.Latitude != null && p.Longitude != null)
                    .Select(p => new { p.PortCode, p.Latitude, p.Longitude })
                    .ToListAsync(ct);

                var ordered = codes
                    .Select(c => rows.FirstOrDefault(r =>
                        string.Equals(r.PortCode, c, StringComparison.OrdinalIgnoreCase)))
                    .Where(r => r is not null)
                    .Select(r => new LatLon(r!.Latitude!.Value, r.Longitude!.Value));

                anchors.AddRange(ordered);
            }
            anchors.Add(goal);

            // Thiên tai: toạ độ CỨNG tại bước thời tiết của phiên bản này. Không cảng đi, không cảng
            // đến, không seed. Mỗi lần replan (Version + 1) thời tiết tiến thêm một bước.
            var weatherStep = WeatherStepOf(job);
            var zones = VoyageHazardPlanner.Generate(weatherStep);
            IHazardProvider hazard = zones.Count > 0
                ? new ZoneHazardProvider(zones)
                : NoHazardProvider.Instance;

            job.HazardJson = JsonSerializer.Serialize(hazard.DescribeHazards(), JsonOpts);

            var gridSize = request.GridSize ?? WeatherRoutingDemoDefaults.DefaultGridSize;
            // Keep caller gridSize (auto-densify caused 30s FE timeouts on Pacific).
            gridSize = Math.Clamp(gridSize, WeatherRoutingDemoDefaults.MinGridSize, WeatherRoutingDemoDefaults.MaxGridSize);
            // Replan (bước thời tiết > 0) trên một lưới duy nhất: lập lại kế hoạch TĂNG DẦN bằng
            // D* Lite. Có cảng bắt buộc ghé thì tuyến đi hai tầng qua mốc biển (xem dưới), không
            // dùng lưới đơn — khi đó giữ A* như cũ. D* lỗi thì cũng quay về A* thay vì làm hỏng job.
            RoutingGrid grid;
            RouteResult aStarResult;
            object? replanStats = null;
            if (weatherStep > 0 && anchors.Count == 2)
            {
                try
                {
                    (grid, aStarResult, replanStats) =
                        ReplanIncremental(job.Id, weatherStep, gridSize, start, goal, hazard);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Job {JobId}: D* Lite lỗi — chạy lại A* từ đầu.", job.Id);
                    _cache.Remove(DStarKey(job.Id));
                    grid = _gridBuilder.Build(start, goal, hazard, gridSize);
                    aStarResult = _aStar.FindPath(grid, _heuristicCost);
                }
            }
            else
            {
                grid = _gridBuilder.Build(start, goal, hazard, gridSize);
                aStarResult = _aStar.FindPath(grid, _heuristicCost);
            }
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
            // Bộ tìm đường PHẢI trả ra đường. Né cứng thất bại không có nghĩa là không có đường
            // biển — chỉ nghĩa là không có đường biển NÉ ĐƯỢC HẾT thiên tai. Thực tế tàu vẫn phải
            // chạy, nên hạ thiên tai từ "cấm" xuống "đắt" rồi tìm lại: A* vẫn vòng tránh chừng nào
            // còn vòng được, hết đường vòng thì xuyên qua chỗ nhẹ nhất.
            var hazardsSoftened = false;
            if (!aStarResult.Found && zones.Count > 0)
            {
                var soft = new SoftZoneHazardProvider(zones);
                foreach (var paddingScale in new[] { 1.0 }.Concat(GridPaddingScales))
                {
                    var softGrid = _gridBuilder.Build(start, goal, soft, gridSize, paddingScale);
                    var retry = _aStar.FindPath(softGrid, _heuristicCost);
                    if (!retry.Found) continue;

                    grid = softGrid;
                    aStarResult = retry;
                    hazardsSoftened = true;
                    _logger.LogWarning(
                        "Job {JobId}: thiên tai bịt kín hành lang — chuyển sang né mềm (đi xuyên chỗ nhẹ nhất).",
                        job.Id);
                    break;
                }
            }

            // Lối thoát cuối: bỏ hẳn thiên tai, chỉ tránh đất liền. Tới đây mà vẫn không có đường
            // thì đúng là hai cảng không thông nhau bằng đường biển trong khung lưới này.
            if (!aStarResult.Found)
            {
                foreach (var paddingScale in new[] { 1.0 }.Concat(GridPaddingScales))
                {
                    var landGrid = _gridBuilder.Build(start, goal, NoHazardProvider.Instance, gridSize, paddingScale);
                    var retry = _aStar.FindPath(landGrid, _heuristicCost);
                    if (!retry.Found) continue;

                    grid = landGrid;
                    aStarResult = retry;
                    hazardsSoftened = true;
                    _logger.LogWarning(
                        "Job {JobId}: không né được thiên tai — trả về đường biển ngắn nhất tránh đất liền.",
                        job.Id);
                    break;
                }
            }

            // Lưới mịn hơn: túi nước quanh cảng có thể bị bịt kín ở độ phân giải thô.
            // Cảng sông/cảng trong vịnh hẹp (Chattogram, Thâm Quyến) chỉ hở ra biển bằng một
            // luồng rộng vài hải lý — ô lưới 30-40 NM nuốt trọn luồng đó thành đất.
            if (!aStarResult.Found && gridSize < WeatherRoutingDemoDefaults.MaxGridSize)
            {
                foreach (var paddingScale in new[] { 1.0 }.Concat(GridPaddingScales))
                {
                    var fineGrid = _gridBuilder.Build(
                        start, goal, NoHazardProvider.Instance, WeatherRoutingDemoDefaults.MaxGridSize, paddingScale);
                    var retry = _aStar.FindPath(fineGrid, _heuristicCost);
                    if (!retry.Found) continue;

                    grid = fineGrid;
                    aStarResult = retry;
                    hazardsSoftened = true;
                    _logger.LogWarning("Job {JobId}: phải tăng độ phân giải lưới mới thoát được cảng.", job.Id);
                    break;
                }
            }

            // --- Tuyến HAI TẦNG qua các mốc biển (xem SeaRouteGraph) ---
            //
            // Mọi tầng trên đều dựa vào MỘT lưới phủ cả hành trình, mà lưới đó suy ra từ dây
            // cung start→goal: hành trình càng dài về kinh độ thì lưới càng rộng và ô lưới càng
            // thô, đúng lúc cần mịn nhất. Le Havre→Hải Phòng luồn được Malacca với ô 44×73 NM,
            // nhưng Le Havre→Tokyo cho lưới có đáy 16,1°N — nằm TRÊN eo Bab el-Mandeb (12,6°N)
            // — nên Biển Đỏ thành ngõ cụt: A* mở rộng 215 ô rồi bỏ cuộc, và bản đồ đành vẽ đường
            // thẳng xuyên lục địa.
            //
            // Hai tầng tách độ mịn ra khỏi tổng độ dài: tầng thô chọn chuỗi mốc, tầng mịn cho
            // mỗi chặng một lưới riêng. Vì thế nó cũng là cách DUY NHẤT tôn trọng được danh sách
            // cảng bắt buộc A → C → D → … → B: lưới đơn không có khái niệm thứ tự ghé cảng.
            var routedViaSeaPassages = false;
            var singleGridFound = aStarResult.Found;
            if (anchors.Count > 2 || !aStarResult.Found)
            {
                var viaAnchors = SeaRouteGraph.BuildRoute(
                    _gridBuilder, _aStar, _heuristicCost, anchors, hazard, _logger);

                if (viaAnchors is { Count: >= 2 })
                {
                    var lengthNm = GeoMath.PathLengthNm(viaAnchors);
                    aStarResult = new RouteResult
                    {
                        Found = true,
                        Waypoints = viaAnchors,
                        // Không phải chi phí A* mà là độ dài polyline — đơn vị NM, xem viaSeaPassages
                        // trong metrics. Con số so sánh được vẫn là aStarFuelTons tính ở dưới.
                        PathCost = lengthNm,
                        DistanceNm = lengthNm,
                        ExploredCells = aStarResult.ExploredCells,
                        CellCount = viaAnchors.Count
                    };
                    routedViaSeaPassages = true;
                    if (!singleGridFound) hazardsSoftened = true;
                    _logger.LogWarning(
                        "Job {JobId}: dùng tuyến hai tầng qua mốc biển ({Anchors} neo, {Pts} điểm).",
                        job.Id, anchors.Count, viaAnchors.Count);
                }
            }

            var baselineResult = _baseline.Build(start, goal);

            // BẢO ĐẢM CUỐI CÙNG: đã là tìm đường thì phải trả ra đường.
            // Mọi tầng trên đều thất bại thì dùng chính đường baseline làm tuyến, đánh dấu là
            // suy biến. Vẽ một tuyến thô còn hơn trả về màn hình trống 0.0 NM — người dùng ít
            // nhất còn thấy hướng đi và biết hệ thống không né được gì.
            if (!aStarResult.Found)
            {
                aStarResult = new RouteResult
                {
                    Found = true,
                    Waypoints = baselineResult.Waypoints,
                    PathCost = baselineResult.PathCost,
                    DistanceNm = baselineResult.DistanceNm,
                    ExploredCells = aStarResult.ExploredCells,
                    CellCount = baselineResult.CellCount
                };
                hazardsSoftened = true;
                _logger.LogWarning(
                    "Job {JobId}: không dựng được tuyến trên lưới — trả về đường baseline làm tuyến suy biến.",
                    job.Id);
            }

            // Snap A* ends to exact requested coordinates, then sanitize spikes/land chords.
            if (aStarResult.Found && aStarResult.Waypoints.Count > 0)
            {
                var pts = aStarResult.Waypoints.ToList();
                pts[0] = start;
                pts[^1] = goal;
                // Sanitize after snap; do not re-snap (re-snap reintroduces land chords to ports).
                // Còn né cứng thì làm mượt cũng phải né thiên tai, nếu không string-pulling kéo
                // thẳng tuyến xuyên qua vùng mà A* vừa vòng tránh.
                pts = PathSanitizer.Sanitize(pts, hazardsSoftened ? null : hazard.IsBlocked);
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

            // Đối chiếu hai tuyến bằng CÙNG một thước đo: nhiên liệu tiêu thụ dưới đúng trường
            // sóng gió này. Đây là con số chứng minh việc tối ưu có tác dụng — so quãng đường
            // thì tuyến né bão luôn DÀI HƠN baseline nên nhìn như tệ hơn, trong khi thực tế nó
            // tốn ít nhiên liệu hơn vì không phải lết qua vùng sóng lớn.
            //
            // Tính lại từ polyline thay vì lấy PathCost của A*: PathCost chỉ là tấn khi
            // WeatherFuelCost đang được đăng ký, còn nếu ai đổi DI về HeuristicCost thì nó là NM.
            var fuelModel = (_heuristicCost as WeatherFuelCost)?.Fuel;
            double? aStarFuelTons = null;
            double? baselineFuelTons = null;
            if (fuelModel is not null)
            {
                if (aStarResult.Found && aStarResult.Waypoints.Count >= 2)
                    aStarFuelTons = WeatherFuelCost.PolylineFuelTons(aStarResult.Waypoints, hazard, fuelModel);
                baselineFuelTons = WeatherFuelCost.PolylineFuelTons(baselineResult.Waypoints, hazard, fuelModel);
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
                        // Chi phí thô của A* — đơn vị THEO hàm đánh giá đang đăng ký
                        // (tấn với WeatherFuelCost, NM với HeuristicCost). Dùng fuelTons để so sánh.
                        pathCost = aStarResult.PathCost,
                        fuelTons = aStarFuelTons,
                        cellCount = aStarResult.CellCount,
                        exploredCells = aStarResult.ExploredCells,
                        viaSeaPassages = routedViaSeaPassages,
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
                    fuelTons = baselineFuelTons,
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
                hazardZones = zones.Count,
                // Thời điểm của trường thiên tai: bước thời tiết và số giờ dự báo tính từ bản đồ gốc.
                weatherStep,
                weatherHours = weatherStep * VoyageHazardPlanner.WeatherStepHours,
                // Lập lại kế hoạch tăng dần (D* Lite) so với A* chạy lại từ đầu — null ở lần chạy đầu.
                replan = replanStats,
                aStarFound = aStarResult.Found,
                // true = tuyến được dựng theo hai tầng (chuỗi mốc biển + lưới riêng từng chặng)
                // thay vì một lưới phủ cả hành trình. Khi đó pathCost là NM, không phải chi phí A*.
                viaSeaPassages = routedViaSeaPassages,
                // true = thiên tai bịt kín hành lang nên tuyến phải đi xuyên chỗ nhẹ nhất
                // thay vì né hết. Giao diện nên nói rõ chỗ này cho người dùng.
                hazardsSoftened,
                aStarExplored = aStarResult.ExploredCells,
                aStarDistanceNm = aStarResult.DistanceNm,
                baselineDistanceNm = baselineResult.DistanceNm,

                // Kết quả tối ưu, đo bằng nhiên liệu. Tuyến A* thường DÀI HƠN baseline mà vẫn
                // tốn ít hơn — đó chính là điều cần chứng minh, và là lý do không thể đánh giá
                // module này bằng quãng đường.
                costModel = fuelModel is null ? "distance-only" : "fuel-tons (wave/wind resistance)",
                aStarFuelTons = aStarFuelTons,
                baselineFuelTons = baselineFuelTons,
                fuelSavedTons = aStarFuelTons is { } af && baselineFuelTons is { } bf
                    ? bf - af
                    : (double?)null,
                fuelSavedPercent = aStarFuelTons is { } af2 && baselineFuelTons is { } bf2 && bf2 > 0
                    ? (bf2 - af2) / bf2 * 100.0
                    : (double?)null,

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
                Persist = true,
                RefineLegDistances = true,
                WeatherStep = WeatherStepOf(job),
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

    /// <summary>
    /// Bước thời tiết của một phiên bản job: lần chạy đầu (Version 1) dùng bản đồ gốc — khớp với
    /// GET /hazards lúc mở trang; mỗi lần replan tiến thêm <see cref="VoyageHazardPlanner.WeatherStepHours"/> giờ.
    /// </summary>
    private static int WeatherStepOf(WeatherRoutingJob job) => Math.Max(0, job.Version - 1);

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





