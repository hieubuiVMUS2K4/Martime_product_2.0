using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.DTOs.WeatherRouting;
using ProductApi.Models;
using ProductApi.Models.WeatherRouting;

namespace ProductApi.Services.WeatherRouting;

public interface IVoyageLegPlanService
{
    /// <summary>Lập kế hoạch n chặng cho một hành trình / cặp toạ độ.</summary>
    Task<VoyageLegPlanDto> PlanAsync(
        PlanVoyageLegsRequest request,
        IReadOnlyList<LatLon>? corridorWaypoints,
        CancellationToken ct = default);

    /// <summary>Đọc lại kế hoạch chặng đã lưu của một job.</summary>
    Task<VoyageLegPlanDto?> GetForJobAsync(Guid jobId, CancellationToken ct = default);

    /// <summary>Bản ghi tóm tắt hồ sơ nhiên liệu đang dùng cho một tàu (để hiển thị/tham chiếu).</summary>
    Task<object?> GetFuelProfileSummaryAsync(Guid? vesselId, CancellationToken ct = default);

    /// <summary>Danh sách cảng có toạ độ — dùng làm ứng viên tiếp nhiên liệu.</summary>
    Task<IReadOnlyList<object>> ListBunkerPortsAsync(CancellationToken ct = default);

    /// <summary>Danh sách tàu kèm hồ sơ nhiên liệu (để UI hiển thị thông số tính toán).</summary>
    Task<IReadOnlyList<object>> ListVesselsAsync(CancellationToken ct = default);

    /// <summary>
    /// Vùng thiên tai demo rải dọc đường biển start→goal. Dùng CHUNG với GET /hazards
    /// để bản đồ hiển thị đúng tập vùng mà planner sẽ né.
    /// </summary>
    IReadOnlyList<HazardZone> GetHazardZones();
}

public sealed class VoyageLegPlanService : IVoyageLegPlanService
{
    private const int CorridorGridSize = 160;

    /// <summary>Số vùng thiên tai demo mặc định khi lập kế hoạch chặng.</summary>
    /// <summary>Hành trình ngắn hơn ngưỡng này coi là chặng ngắn (dùng hành lang A*).</summary>
    private const double ShortHaulNm = 3000;

    /// <summary>
    /// Hành trình dài hơn ngưỡng này mà hành lang một lưới hỏng thì chuyển sang tuyến hai tầng.
    /// Dưới ngưỡng thì hành lang hai điểm (start, goal) là chuyện bình thường, không phải lỗi —
    /// chèn mốc biển vào một chặng ngắn chỉ tạo đường vòng vô nghĩa.
    /// </summary>
    private const double LongHaulNm = 1500;

    /// <summary>Khoảng cách tối đa để coi một cảng là "cảng khởi hành/kết thúc".</summary>
    private const double MaxSnapNm = 50;

    private readonly AppDbContext _db;
    private readonly IVoyageLegPlanner _planner;
    private readonly IGridBuilder _gridBuilder;
    private readonly IAstStarRouter _aStar;
    private readonly IHeuristicCost _heuristicCost;
    private readonly ILogger<VoyageLegPlanService> _logger;

    public VoyageLegPlanService(
        AppDbContext db,
        IVoyageLegPlanner planner,
        IGridBuilder gridBuilder,
        IAstStarRouter aStar,
        IHeuristicCost heuristicCost,
        ILogger<VoyageLegPlanService> logger)
    {
        _db = db;
        _planner = planner;
        _gridBuilder = gridBuilder;
        _aStar = aStar;
        _heuristicCost = heuristicCost;
        _logger = logger;
    }

    public async Task<VoyageLegPlanDto> PlanAsync(
        PlanVoyageLegsRequest request,
        IReadOnlyList<LatLon>? corridorWaypoints,
        CancellationToken ct = default)
    {
        // ---------- 1) Hành trình ----------
        VoyageRecord? voyage = null;
        if (request.VoyageId is { } voyageId)
        {
            voyage = await _db.VoyageRecords.AsNoTracking()
                .FirstOrDefaultAsync(v => v.Id == voyageId, ct);
        }

        var startPortCode = request.StartPortCode ?? voyage?.DeparturePortCode;
        var goalPortCode = request.GoalPortCode ?? voyage?.ArrivalPortCode;

        var ports = await _db.Ports.AsNoTracking()
            .Where(p => p.Latitude != null && p.Longitude != null)
            .ToListAsync(ct);

        var startPort = ResolvePort(ports, startPortCode);
        var goalPort = ResolvePort(ports, goalPortCode);

        var start = ResolveLatLon(request.StartLat, request.StartLon, startPort)
                    ?? throw new InvalidOperationException("Không xác định được điểm xuất phát.");
        var goal = ResolveLatLon(request.GoalLat, request.GoalLon, goalPort)
                   ?? throw new InvalidOperationException("Không xác định được điểm đích.");

        // Nếu caller chỉ truyền toạ độ thì suy ra cảng gần nhất để chặng đầu/cuối hiển thị đúng tên cảng.
        if (string.IsNullOrWhiteSpace(startPortCode))
        {
            startPort = NearestPort(ports, start, MaxSnapNm);
            startPortCode = startPort?.PortCode;
        }
        if (string.IsNullOrWhiteSpace(goalPortCode))
        {
            goalPort = NearestPort(ports, goal, MaxSnapNm);
            goalPortCode = goalPort?.PortCode;
        }

        // ---------- 2) Tàu + hồ sơ nhiên liệu ----------
        // Lưu ý: VoyageRecord không có VesselId — chỉ có VesselIMO/VesselName, nên phải tra theo IMO.
        var vesselId = request.VesselId ?? await ResolveVesselIdByImoAsync(voyage?.VesselIMO, ct);
        var profile = vesselId is { } vid
            ? await _db.VesselFuelProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.VesselId == vid, ct)
            : null;

        var options = BuildOptions(request, profile, voyage);
        var model = new FuelModel(options);

        // ---------- 3) Hành lang tuyến ----------
        var preference = (request.RoutePreference ?? "auto").Trim().ToLowerInvariant();
        var candidates = BuildCandidates(ports, request.PortCodes, startPortCode, goalPortCode);
        var departure = request.DepartureUtc ?? voyage?.DepartureTime ?? DateTime.UtcNow;
        var straightNm = GeoMath.HaversineNm(start, goal);

        // Vùng thiên tai: toạ độ CỨNG, không liên quan gì tới cảng đi / cảng đến / seed.
        var zones = VoyageHazardPlanner.Generate(request.WeatherStep ?? 0);
        IHazardProvider hazards = zones.Count > 0
            ? new ZoneHazardProvider(zones)
            : NoHazardProvider.Instance;

        VoyageLegPlan plan;
        var corridorSource = "astar-eastbound";
        // Hành lang thực sự dùng — cần cho bước dựng polyline chặng khi A* của riêng chặng thất bại.
        IReadOnlyList<LatLon>? usedCorridor = null;

        // Cảng bắt buộc ghé (nhập hàng/thủ tục).
        var mustVisit = BuildMandatoryPorts(ports, request.MustVisitPortCodes, startPortCode, goalPortCode);

        // Bước 1 — hành lang phải ĐI QUA cảng bắt buộc: start → P1 → … → Pn → goal.
        // Bước 2 — nhờ đó RouteCorridor.Project cho offset ≈ 0, LegDistanceNm hết bị thổi phồng.
        IReadOnlyList<LatLon> GuideVia(IReadOnlyList<LatLon> baseCorridor, IReadOnlyList<LatLon> leadingVia)
        {
            // Hành lang dựng trên MỘT lưới phủ cả hành trình. Với hành trình dài, đáy lưới có
            // thể không với tới eo biển bắt buộc phải qua (Le Havre → Tokyo: đáy lưới 16,1°N
            // nhưng eo Bab el-Mandeb ở 12,6°N), A* không còn đường nào và BuildCorridor trả về
            // đúng hai điểm start, goal — một đường thẳng xuyên lục địa. Mọi chặng con rồi sẽ
            // thừa hưởng hành lang hỏng đó.
            //
            // Khi ấy chuyển sang tuyến HAI TẦNG qua mốc biển. Đây cũng là cách duy nhất bảo đảm
            // hành lang đi qua ĐÚNG THỨ TỰ cảng bắt buộc A → C → D → … → B: lưới đơn không có
            // khái niệm thứ tự ghé cảng, nó chỉ biết điểm đầu và điểm cuối.
            if (baseCorridor.Count < 3 && GeoMath.HaversineNm(start, goal) > LongHaulNm)
            {
                var anchors = new List<LatLon> { start };
                anchors.AddRange(leadingVia);
                anchors.AddRange(mustVisit.Select(m => new LatLon(m.Lat, m.Lon)));
                anchors.Add(goal);

                var viaPassages = SeaRouteGraph.BuildRoute(
                    _gridBuilder, _aStar, _heuristicCost, anchors, NoHazardProvider.Instance, _logger);

                if (viaPassages is { Count: >= 3 })
                {
                    _logger.LogWarning(
                        "Hành lang một lưới không dựng được tuyến {A} -> {B} — dùng tuyến hai tầng qua mốc biển ({N} điểm).",
                        start, goal, viaPassages.Count);
                    return viaPassages;
                }
            }

            return mustVisit.Count == 0 && leadingVia.Count == 0
                ? baseCorridor
                : BuildGuideThroughMandatoryPorts(start, goal, leadingVia, mustVisit, baseCorridor);
        }

        IReadOnlyList<LatLon> Guide(IReadOnlyList<LatLon> baseCorridor) =>
            GuideVia(baseCorridor, Array.Empty<LatLon>());

        // Hành lang dựng qua cảng bắt buộc không còn phụ thuộc chuỗi hub đông/tây,
        // nên nhãn phải nói đúng nguồn gốc thay vì báo nhầm "hub-westbound".
        var guidedSource = mustVisit.Count > 0 ? "astar-via-mandatory" : null;

        VoyageLegPlan PlanWith(IReadOnlyList<LatLon> corridor) =>
            RunPlanner(start, goal, startPort, goalPort, startPortCode, goalPortCode,
                corridor, candidates, mustVisit, options, request, departure, hazards);

        switch (preference)
        {
            case "custom":
                // Hành lang do người dùng chỉ định: cảng mốc đi TRƯỚC, cảng bắt buộc đi sau.
                usedCorridor = GuideVia(
                    BuildHubCorridor(ports, start, goal, request.CorridorViaPortCodes ?? new List<string>()),
                    ResolveViaPoints(ports, request.CorridorViaPortCodes));
                corridorSource = guidedSource ?? "custom";
                plan = PlanWith(usedCorridor);
                break;

            case "westbound":
                // Cố ý bỏ qua hành lang A*: A* của module luôn đi về phía đông (Thái Bình Dương),
                // trong khi tuyến phía tây mới có các cảng tiếp nhiên liệu.
                corridorSource = guidedSource ?? "hub-westbound";
                usedCorridor = Guide(BuildWestboundCorridor(ports, start, goal));
                plan = PlanWith(usedCorridor);
                break;

            case "eastbound":
                corridorSource = guidedSource ?? "astar-eastbound";
                usedCorridor = Guide(corridorWaypoints ?? ComputeCorridor(start, goal));
                plan = PlanWith(usedCorridor);
                break;

            default: // auto
                if (mustVisit.Count > 0)
                {
                    // Hành lang đã đi qua cảng bắt buộc nên không còn là "đông" hay "tây" nữa.
                    // Dựng một lần thay vì so sánh hai hành lang giống hệt nhau.
                    corridorSource = guidedSource!;
                    usedCorridor = Guide(corridorWaypoints ?? ComputeCorridor(start, goal));
                    plan = PlanWith(usedCorridor);
                }
                else if (straightNm <= ShortHaulNm)
                {
                    // Chặng ngắn: hành lang A* là đúng nhất, gần như không cần tiếp nhiên liệu.
                    corridorSource = "astar-eastbound";
                    usedCorridor = Guide(corridorWaypoints ?? ComputeCorridor(start, goal));
                    plan = PlanWith(usedCorridor);
                }
                else
                {
                    // Hành trình dài: dựng CẢ HAI hành lang rồi chọn tuyến thực sự ngắn hơn.
                    // Lý do: chuỗi hub phía tây luôn kết thúc ở Panama, nên với đích ở
                    // Đại Tây Dương/Âu nó buộc tàu vòng qua Panama rồi quay lại
                    // (Vũng Tàu → Le Havre: 16 433 NM, trong khi hành lang A* chỉ 8 817 NM).
                    // Việc so sánh chỉ chạy planner, KHÔNG dựng polyline, nên rất nhẹ.
                    var east = Guide(corridorWaypoints ?? ComputeCorridor(start, goal));
                    var west = Guide(BuildWestboundCorridor(ports, start, goal));
                    var westPlan = PlanWith(west);
                    var eastPlan = PlanWith(east);

                    var westOk = ReachesGoal(westPlan, goalPortCode);
                    var eastOk = ReachesGoal(eastPlan, goalPortCode);

                    if (westOk && (!eastOk || westPlan.TotalDistanceNm <= eastPlan.TotalDistanceNm))
                    {
                        plan = westPlan;
                        corridorSource = "hub-westbound";
                        usedCorridor = west;
                    }
                    else if (eastOk && (!westOk || eastPlan.TotalDistanceNm < westPlan.TotalDistanceNm))
                    {
                        plan = eastPlan;
                        corridorSource = "astar-eastbound";
                        usedCorridor = east;
                        if (westOk)
                        {
                            plan.Warnings.Add(
                                $"Đã dùng hành lang A* vì ngắn hơn tuyến hub phía tây "
                                + $"({eastPlan.TotalDistanceNm:F0} NM so với {westPlan.TotalDistanceNm:F0} NM).");
                        }
                    }
                    else
                    {
                        var westShorter = westPlan.TotalDistanceNm <= eastPlan.TotalDistanceNm;
                        plan = westShorter ? westPlan : eastPlan;
                        corridorSource = westShorter ? "hub-westbound" : "astar-eastbound";
                        usedCorridor = westShorter ? west : east;
                        plan.Warnings.Add("Không hành lang nào tới đích trong tầm nhiên liệu — "
                                          + "cần tăng sức chứa nhiên liệu, giảm tốc độ hoặc bổ sung cảng bunker.");
                    }
                }
                break;
        }

        if (vesselId is null)
            plan.Warnings.Add("Không xác định được tàu — đang dùng thông số nhiên liệu mặc định/ước lượng.");
        else if (profile is null)
            plan.Warnings.Add("Tàu chưa có hồ sơ nhiên liệu (vessel_fuel_profiles) — dùng thông số ước lượng.");

        // Sinh polyline đường biển thật cho từng chặng (A* giữa hai cảng liên tiếp)
        // để bản đồ vẽ đúng tuyến hành trình thay vì nối thẳng qua lục địa.
        if (request.RefineLegDistances)
        {
            AttachLegGeometry(plan, hazards, usedCorridor);
            RepairReserveShortfalls(
                plan, hazards, model, candidates, usedCorridor, request.MaxDetourNm ?? 400);
        }

        var dto = MapPlan(plan, options, voyage?.Id, vesselId, profile);
        dto.CorridorSource = corridorSource;

        // Đối chiếu polyline vừa dựng với các vùng thiên tai — trả về số đo để giao diện
        // hiển thị trực tiếp, thay vì phải nhìn bản đồ đoán xem tuyến có né hay không.
        dto.HazardAvoidance = MeasureHazardAvoidance(plan, zones);

        // ---------- 6) Ghi vào voyage_plan_legs ----------
        if (request.Persist && voyage is not null && plan.Legs.Count > 0)
        {
            try
            {
                await PersistLegsAsync(voyage.Id, plan, ct);
                dto.VoyageId = voyage.Id;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Không ghi được voyage_plan_legs cho voyage {VoyageId}", voyage.Id);
                dto.Warnings.Add("Không ghi được kế hoạch chặng vào DB: " + ex.Message);
            }
        }
        else if (request.Persist && voyage is null)
        {
            dto.Warnings.Add("Không có VoyageId — kế hoạch chỉ trả về, không ghi vào voyage_plan_legs.");
        }

        return dto;
    }

    public async Task<VoyageLegPlanDto?> GetForJobAsync(Guid jobId, CancellationToken ct = default)
    {
        var job = await _db.WeatherRoutingJobs.AsNoTracking()
            .FirstOrDefaultAsync(j => j.Id == jobId, ct);
        if (job is null || string.IsNullOrWhiteSpace(job.PlanJson) || job.PlanJson == "{}")
            return null;

        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<VoyageLegPlanDto>(job.PlanJson,
                new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch
        {
            return null;
        }
    }

    public async Task<object?> GetFuelProfileSummaryAsync(Guid? vesselId, CancellationToken ct = default)
    {
        if (vesselId is null) return null;
        var p = await _db.VesselFuelProfiles.AsNoTracking()
            .FirstOrDefaultAsync(x => x.VesselId == vesselId.Value, ct);
        if (p is null) return null;

        var model = new FuelModel(ToOptions(p, new PlanVoyageLegsRequest()));
        return new
        {
            p.VesselId,
            p.VesselName,
            p.FuelType,
            p.Source,
            p.Notes,
            p.FuelCapacityTons,
            p.CurrentFuelTons,
            p.ReserveFraction,
            p.ServiceSpeedKts,
            p.ServicePowerKw,
            p.SfocMainGPerKwh,
            p.SfocAuxGPerKwh,
            p.AuxLoadKw,
            p.SeaMarginFraction,
            tonsPerDay = model.ServiceTonsPerHour() * 24.0,
            tonsPerNm = model.PlanTonsPerNm(),
            rangeNm = model.RangeNm(p.CurrentFuelTons ?? p.FuelCapacityTons * 0.75)
        };
    }

    /// <summary>Danh sách cảng bắt buộc ghé (đã loại cảng đầu/cuối).</summary>
    private static List<BunkerPort> BuildMandatoryPorts(
        List<Port> ports, List<string>? codes, string? startCode, string? goalCode)
    {
        var result = new List<BunkerPort>();
        if (codes is null || codes.Count == 0) return result;

        foreach (var code in codes.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(code)) continue;
            if (string.Equals(code.Trim(), startCode?.Trim(), StringComparison.OrdinalIgnoreCase)) continue;
            if (string.Equals(code.Trim(), goalCode?.Trim(), StringComparison.OrdinalIgnoreCase)) continue;

            var p = ResolvePort(ports, code);
            if (p?.Latitude is { } la && p.Longitude is { } lo)
                result.Add(new BunkerPort(p.PortCode, p.PortName, la, lo));
        }
        return result;
    }

    /// <summary>Cảng mốc do người dùng chỉ định (RoutePreference = custom) → toạ độ.</summary>
    private static List<LatLon> ResolveViaPoints(List<Port> ports, List<string>? codes)
    {
        var result = new List<LatLon>();
        if (codes is null) return result;
        foreach (var code in codes)
        {
            var p = ResolvePort(ports, code);
            if (p?.Latitude is { } la && p.Longitude is { } lo)
                result.Add(new LatLon(la, lo));
        }
        return result;
    }

    /// <summary>
    /// Danh sách tàu kèm hồ sơ nhiên liệu để UI hiển thị thông số đang dùng khi tính toán.
    /// </summary>
    public async Task<IReadOnlyList<object>> ListVesselsAsync(CancellationToken ct = default)
    {
        var vessels = await _db.Vessels.AsNoTracking()
            .Where(v => !v.Name.StartsWith("Vessel edge-"))
            .OrderBy(v => v.Name)
            .Select(v => new
            {
                v.Id,
                v.Name,
                v.IMO,
                v.CallSign,
                v.VesselType,
                v.Flag,
                v.YearBuilt,
                v.DeadWeight,
                v.GrossTonnage,
                v.ServiceSpeedKts,
                v.MainEnginePowerKw,
                v.FuelCapacityTons,
                v.FuelConsumptionTonsPerDay,
                v.CruisingRangeNm,
                v.DraftMoulded,
                v.DepthMoulded,
                v.NoOfCargoHolds,
                v.ClassSocietyName
            })
            .ToListAsync(ct);

        var profiles = await _db.VesselFuelProfiles.AsNoTracking().ToListAsync(ct);

        var list = new List<object>();
        foreach (var v in vessels)
        {
            var p = profiles.FirstOrDefault(x => x.VesselId == v.Id);
            var model = p is not null
                ? new FuelModel(ToOptions(p, new PlanVoyageLegsRequest()))
                : null;

            list.Add(new
            {
                id = v.Id,
                name = v.Name,
                imo = v.IMO,
                callSign = v.CallSign,
                hasProfile = p is not null,
                // Thông số kỹ thuật của tàu (hồ sơ đăng kiểm) — hiển thị cạnh thông số tính toán.
                specs = new
                {
                    v.VesselType,
                    v.Flag,
                    v.YearBuilt,
                    v.CallSign,
                    v.DeadWeight,
                    v.GrossTonnage,
                    v.ServiceSpeedKts,
                    v.MainEnginePowerKw,
                    v.FuelCapacityTons,
                    v.FuelConsumptionTonsPerDay,
                    v.CruisingRangeNm,
                    v.DraftMoulded,
                    v.DepthMoulded,
                    v.NoOfCargoHolds,
                    v.ClassSocietyName
                },
                profile = p is null ? null : new
                {
                    p.Id,
                    p.FuelType,
                    p.Source,
                    p.Notes,
                    p.FuelCapacityTons,
                    p.CurrentFuelTons,
                    p.ReserveFraction,
                    p.ServiceSpeedKts,
                    p.ServicePowerKw,
                    p.SfocMainGPerKwh,
                    p.SfocAuxGPerKwh,
                    p.AuxLoadKw,
                    p.SeaMarginFraction,
                    p.WeatherAllowanceFraction,
                    p.PortStayHours,
                    p.MaxDetourNm,
                    tonsPerDay = model is null ? (double?)null : Math.Round(model.ServiceTonsPerHour() * 24.0, 2),
                    tonsPerNm = model is null ? (double?)null : Math.Round(model.PlanTonsPerNm(), 4),
                    rangeNm = model is null ? (double?)null : Math.Round(
                        model.RangeNm(p.CurrentFuelTons ?? p.FuelCapacityTons * 0.75), 0),
                    reserveTons = model is null ? (double?)null : Math.Round(model.MinReserveTons, 1),
                    bunkerPortsPerTank = model is null ? (double?)null : Math.Round(
                        (p.FuelCapacityTons - model.MinReserveTons) / model.PlanTonsPerNm(), 0)
                }
            });
        }
        return list;
    }

    // ================= helpers =================

    /// <summary>
    /// Gắn polyline đường biển thật cho từng chặng bằng A* (không có bão).
    /// Nếu A* không tìm được thì giữ đoạn thẳng để không mất dữ liệu.
    /// </summary>
    private void AttachLegGeometry(VoyageLegPlan plan, IHazardProvider hazards, IReadOnlyList<LatLon>? corridor)
    {
        foreach (var leg in plan.Legs)
            AttachGeometry(leg, hazards, corridor);
    }

    /// <summary>Dựng polyline cho MỘT chặng (dùng cả cho chặng mới chèn khi bổ sung cảng nạp).</summary>
    private void AttachGeometry(VoyageLegPlanLeg leg, IHazardProvider hazards, IReadOnlyList<LatLon>? corridor)
    {
        var zones = (hazards as ZoneHazardProvider)?.Zones ?? (IReadOnlyList<HazardZone>)Array.Empty<HazardZone>();

        var a = new LatLon(leg.FromLat ?? 0, leg.FromLon ?? 0);
        var b = new LatLon(leg.ToLat ?? 0, leg.ToLon ?? 0);
        var pts = BuildLegGeometry(a, b, hazards, corridor);

        // Bước cuối, độc lập với mọi nhánh dự phòng ở trên: đoạn nào cắt vùng thiên tai thì
        // vẽ đường vòng qua nó. A* chỉ né được ở độ phân giải ô lưới (15–100 NM) nên không
        // bảo đảm — còn phép vòng này thì bảo đảm về mặt hình học.
        if (zones.Count == 0) { leg.Waypoints = pts; return; }

        // Truyền phép thử đất vào bộ vẽ vòng để nó chọn PHÍA BIỂN. Nếu không, cung ngắn hơn
        // hay đụng bờ, và cảnh báo bên dưới bỏ toàn bộ đường vòng của chặng — tuyến quay về
        // xuyên thẳng vùng thiên tai. Phép thử phải TRÙNG với phép đo ở đây, nếu không bộ vẽ
        // chọn phía này còn chỗ kiểm tra lại chê phía kia.
        var detoured = HazardDetour.Apply(
            pts,
            zones,
            HazardDetour.DefaultMarginNm,
            p => LandMask.CountLandCrossingSegments(p, skipEnds: false),
            LandMask.IsBlockedLand);

        // Đường vòng có thể đẩy tuyến lên đất liền, hoặc cắt đất nhiều hơn bản gốc — khi đó giữ bản gốc.
        if (LandMask.CountLandCrossingSegments(detoured, skipEnds: false) >
            LandMask.CountLandCrossingSegments(pts, skipEnds: false))
        {
            _logger.LogWarning(
                "Chặng {A} -> {B}: đường vòng qua thiên tai cắt đất — giữ polyline gốc.", a, b);
            detoured = pts;
        }

        leg.Waypoints = detoured;
    }

    /// <summary>
    /// Tính lại quãng đường, thời gian và nhiên liệu từng chặng theo ĐÚNG polyline đang vẽ,
    /// dưới trường sóng gió của thiên tai.
    ///
    /// Bộ chia chặng chọn cảng bằng quãng đường của lưới KHÔNG thiên tai và suất tiêu thụ cố định,
    /// nên bảng kế hoạch trước đây không đổi dù thiên tai đổi (201.53 t cho cả 0 lẫn 39 vùng).
    /// Ở đây GIỮ NGUYÊN mọi quyết định của nó (ghé cảng nào, nạp đầy ở đâu) và chỉ cập nhật số liệu:
    ///  - quãng đường = độ dài polyline;
    ///  - thời gian = giờ hải hành có tổn thất tốc độ do sóng gió;
    ///  - nhiên liệu = quãng đường × suất kế hoạch × (giờ thời tiết / giờ nước lặng) — công suất
    ///    không đổi nên nhiên liệu tỉ lệ thời gian; vẫn giữ dung sai thời tiết của suất kế hoạch
    ///    làm biên an toàn.
    /// Chặng không có polyline thật (đoạn thẳng dự phòng) giữ nguyên số liệu cũ.
    /// Trả về chỉ số các chặng tới cảng dưới mức dự trữ (xem <see cref="RepairReserveShortfalls"/>).
    /// </summary>
    private static List<int> RefreshLegsFromGeometry(
        VoyageLegPlan plan, IHazardProvider hazards, FuelModel model)
    {
        var belowReserve = new List<int>();
        if (plan.Legs.Count == 0) return belowReserve;

        var q = model.PlanTonsPerNm();
        var capacity = plan.FuelCapacityTons;
        var reserve = plan.ReserveTons;
        var portStay = model.Options.PortStayHours;

        var fuel = plan.InitialFuelTons;
        var clock = plan.DepartureUtc;

        for (var i = 0; i < plan.Legs.Count; i++)
        {
            var leg = plan.Legs[i];
            var pts = leg.Waypoints;

            // Hai điểm = đoạn thẳng dự phòng (có thể xuyên đất) — không đáng tin hơn số cũ.
            if (pts.Count >= 3)
            {
                var distNm = GeoMath.PathLengthNm(pts);
                var (hours, calmHours) = WeatherFuelCost.PolylineSailingHours(pts, hazards, model);
                if (distNm > 0 && hours > 0 && calmHours > 0)
                {
                    leg.DistanceNm = distNm;
                    leg.DurationHours = hours;
                    leg.AverageSpeedKts = distNm / hours;
                    leg.FuelConsumedTons = distNm * q * (hours / calmHours);
                }
            }

            leg.DepartureUtc = clock;
            leg.ArrivalUtc = clock.AddHours(leg.DurationHours);
            leg.FuelOnDepartureTons = fuel;
            leg.FuelOnArrivalTons = Math.Max(0.0, fuel - leg.FuelConsumedTons);
            leg.FuelOnArrivalPercent = capacity <= 0 ? 0 : leg.FuelOnArrivalTons / capacity * 100.0;

            if (leg.FuelOnArrivalTons < reserve)
                belowReserve.Add(i);

            // Cùng quy tắc với bộ chia chặng: cảng nạp nhiên liệu và cảng bắt buộc ghé đều nạp đầy.
            var refuels = leg.StopKind is LegStopKind.Bunker or LegStopKind.Mandatory;
            if (refuels)
            {
                var oldBunker = leg.BunkerTons;
                leg.BunkerTons = Math.Max(0.0, capacity - leg.FuelOnArrivalTons);
                if (leg.Notes is not null)
                    leg.Notes = leg.Notes.Replace(
                        $"nạp {oldBunker:F1} t lên", $"nạp {leg.BunkerTons:F1} t lên");
                fuel = capacity;
                clock = leg.ArrivalUtc.AddHours(portStay);
            }
            else
            {
                fuel = leg.FuelOnArrivalTons;
                clock = leg.ArrivalUtc;
            }
        }

        plan.TotalDistanceNm = plan.Legs.Sum(l => l.DistanceNm);
        plan.TotalFuelTons = plan.Legs.Sum(l => l.FuelConsumedTons);
        plan.TotalHours = plan.Legs.Sum(l => l.DurationHours)
                          + plan.Legs.Count(l => l.IsBunkerStop) * portStay;
        plan.FinalFuelTons = plan.Legs[^1].FuelOnArrivalTons;
        plan.ArrivalUtc = plan.Legs[^1].ArrivalUtc;
        return belowReserve;
    }

    /// <summary>Số cảng nạp tối đa được chèn thêm — chặn vòng lặp vô hạn khi không có cảng phù hợp.</summary>
    private const int MaxReserveRepairs = 4;

    /// <summary>
    /// Tính lại số liệu theo tuyến thật, rồi với chặng nào tới cảng DƯỚI MỨC DỰ TRỮ thì chèn một
    /// cảng nạp nhiên liệu nằm dọc tuyến thật của chặng đó và tính lại — lặp tối đa
    /// <see cref="MaxReserveRepairs"/> lần.
    ///
    /// Vì sao cần: bộ chia chặng quyết định ghé cảng theo quãng đường ước lượng, ngắn hơn tuyến thật
    /// (KWIQE→MAPTM ước lượng ngắn nhưng tuyến thật qua Biển Đỏ/Suez dài 5 188 NM, tới Tanger Med
    /// chỉ còn 11.5 t so với dự trữ 20 t). Chỉ sửa đúng chặng hụt, các chặng an toàn giữ nguyên.
    /// Không tìm được cảng phù hợp thì để nguyên kế hoạch và cảnh báo.
    /// </summary>
    private void RepairReserveShortfalls(
        VoyageLegPlan plan, IHazardProvider hazards, FuelModel model,
        IReadOnlyList<BunkerPort> candidates, IReadOnlyList<LatLon>? corridor, double maxDetourNm)
    {
        var belowReserve = RefreshLegsFromGeometry(plan, hazards, model);

        for (var round = 0; round < MaxReserveRepairs && belowReserve.Count > 0; round++)
        {
            var leg = plan.Legs[belowReserve[0]];
            var pick = PickBunkerOnLeg(plan, leg, candidates, maxDetourNm);
            if (pick is null) break;

            var (port, alongNm, offsetNm) = pick.Value;
            var index = plan.Legs.IndexOf(leg);
            var rate = leg.DistanceNm > 0 ? leg.FuelConsumedTons / leg.DistanceNm : model.PlanTonsPerNm();
            var speed = leg.AverageSpeedKts > 0 ? leg.AverageSpeedKts : model.Options.ServiceSpeedKts;
            var firstNm = alongNm + offsetNm;
            var restNm = Math.Max(0.0, leg.DistanceNm - alongNm) + offsetNm;

            // Chặng mới: điểm đầu cũ → cảng nạp. Số liệu ước lượng theo hình chiếu làm giá trị
            // dự phòng; có polyline thật thì RefreshLegsFromGeometry ghi đè ngay sau đây.
            var first = new VoyageLegPlanLeg
            {
                FromPortCode = leg.FromPortCode,
                FromPortName = leg.FromPortName,
                FromLat = leg.FromLat,
                FromLon = leg.FromLon,
                ToPortCode = port.Code,
                ToPortName = port.Name,
                ToLat = port.Lat,
                ToLon = GeoMath.WrapLon(port.Lon),
                DistanceNm = firstNm,
                DurationHours = firstNm / speed,
                AverageSpeedKts = speed,
                FuelConsumedTons = firstNm * rate,
                IsBunkerStop = true,
                StopKind = LegStopKind.Bunker,
                PortOffsetNm = offsetNm,
                Notes = $"Tiếp nhiên liệu tại {port.Name} (cách tuyến {offsetNm:F0} NM) — bổ sung vì chặng "
                        + $"{leg.FromPortCode}→{leg.ToPortCode} theo tuyến thật không đủ mức dự trữ"
                        + $"; nạp {0.0:F1} t lên {plan.FuelCapacityTons:F0} t"
            };

            // Chặng cũ rút lại thành cảng nạp → điểm cuối cũ, giữ nguyên vai trò của điểm cuối.
            leg.FromPortCode = port.Code;
            leg.FromPortName = port.Name;
            leg.FromLat = port.Lat;
            leg.FromLon = GeoMath.WrapLon(port.Lon);
            leg.DistanceNm = restNm;
            leg.DurationHours = restNm / speed;
            leg.FuelConsumedTons = restNm * rate;

            plan.Legs.Insert(index, first);
            AttachGeometry(first, hazards, corridor);
            AttachGeometry(leg, hazards, corridor);
            for (var i = 0; i < plan.Legs.Count; i++) plan.Legs[i].Sequence = i + 1;

            plan.Warnings.Add(
                $"Đã bổ sung cảng nạp {port.Name} ({port.Code}) giữa {first.FromPortCode} và {leg.ToPortCode}: "
                + "tính theo tuyến thật và sóng gió, chặng cũ tới cảng dưới mức dự trữ.");

            belowReserve = RefreshLegsFromGeometry(plan, hazards, model);
        }

        plan.Model += " + sóng gió dọc tuyến thật";

        if (belowReserve.Count > 0)
            plan.Warnings.Add(
                $"Tính theo tuyến thật và sóng gió, chặng tới cảng dưới mức dự trữ {plan.ReserveTons:F1} t: "
                + string.Join(", ", belowReserve.Select(i => plan.Legs[i]).Select(l =>
                    $"{l.FromPortCode}→{l.ToPortCode} ({l.FuelOnArrivalTons:F1} t)"))
                + " — không tìm được cảng nạp phù hợp dọc tuyến.");
    }

    /// <summary>
    /// Chọn cảng nạp dọc polyline thật của một chặng hụt nhiên liệu.
    /// Điều kiện: tới được cảng mà còn ≥ dự trữ; ưu tiên cảng mà từ đó (sau khi nạp đầy) đi tiếp
    /// được tới cuối chặng; trong nhóm đó chọn cảng lệch tuyến ít nhất (đường vòng ngắn nhất).
    /// </summary>
    private static (BunkerPort Port, double AlongNm, double OffsetNm)? PickBunkerOnLeg(
        VoyageLegPlan plan, VoyageLegPlanLeg leg, IReadOnlyList<BunkerPort> candidates, double maxDetourNm)
    {
        const double minLegNm = 120.0;
        if (leg.Waypoints.Count < 3 || leg.DistanceNm <= 2 * minLegNm) return null;

        var rate = leg.FuelConsumedTons / leg.DistanceNm;
        if (rate <= 0) return null;

        var reachNm = (leg.FuelOnDepartureTons - plan.ReserveTons) / rate;
        var fullReachNm = (plan.FuelCapacityTons - plan.ReserveTons) / rate;
        if (reachNm <= minLegNm) return null;

        var inPlan = new HashSet<string>(
            plan.Legs.SelectMany(l => new[] { l.FromPortCode, l.ToPortCode }).OfType<string>(),
            StringComparer.OrdinalIgnoreCase);

        var route = RouteCorridor.Build(leg.Waypoints);
        var feasible = new List<(BunkerPort Port, double AlongNm, double OffsetNm, bool Finishes)>();

        foreach (var port in candidates)
        {
            if (string.IsNullOrWhiteSpace(port.Code) || inPlan.Contains(port.Code)) continue;

            var proj = route.Project(port.Position);
            if (proj.OffsetNm > maxDetourNm) continue;
            if (proj.AlongTrackNm < minLegNm || proj.AlongTrackNm > route.TotalNm - minLegNm) continue;
            if (proj.AlongTrackNm + proj.OffsetNm > reachNm) continue;

            var restNm = route.TotalNm - proj.AlongTrackNm + proj.OffsetNm;
            feasible.Add((port, proj.AlongTrackNm, proj.OffsetNm, restNm <= fullReachNm));
        }

        if (feasible.Count == 0) return null;

        var best = feasible.Any(f => f.Finishes)
            ? feasible.Where(f => f.Finishes).OrderBy(f => f.OffsetNm).ThenByDescending(f => f.AlongNm).First()
            : feasible.OrderByDescending(f => f.AlongNm).ThenBy(f => f.OffsetNm).First();

        return (best.Port, best.AlongNm, best.OffsetNm);
    }

    /// <summary>Hệ số nới khung lưới cho từng chặng (xem chú thích trong thân hàm).</summary>
    private static readonly double[] LegPaddingScales = { 1.0, 2.5, 5.0, 10.0 };

    /// <summary>
    /// Dựng polyline đường biển cho một chặng bằng A*. KHÔNG bẻ vòng thiên tai ở đây.
    ///
    /// Việc bẻ vòng do <see cref="AttachLegGeometry"/> làm ĐÚNG MỘT LẦN, kèm kiểm tra để đường
    /// vòng không đẩy tuyến lên đất liền. Trước đây bẻ vòng ở cả hai chỗ nên mỗi chặng bị xử lý
    /// hai lượt, và lượt thứ hai lại chạy trên kết quả đã bẻ của lượt đầu.
    ///
    /// Tách hai lớp vì hai việc khác nhau: A* trả lời “đi thế nào cho ngắn”, còn vẽ ra cho đúng
    /// hình học thì không nên phụ thuộc cỡ ô lưới. Trước đây chỉ có A*, nên một vùng bán kính
    /// 94 NM nằm trên lưới ô 100 NM chỉ phủ một hai ô và đường nối các tâm ô vẫn cắt ngang vùng.
    /// </summary>
    private List<LatLon> BuildLegGeometry(
        LatLon a, LatLon b, IHazardProvider hazards, IReadOnlyList<LatLon>? corridor)
    {
        var straightNm = GeoMath.HaversineNm(a, b);
        if (straightNm < 1.0) return new List<LatLon> { a, b };

        // Lưới càng mịn càng bám sát eo hẹp; giới hạn 80..200 ô mỗi trục.
        var gridSize = Math.Clamp((int)Math.Ceiling(straightNm / 8.0), 80, 200);

        // Chặn kết quả vô lý. Khung lưới bị nới quá rộng (paddingScale × nhiều vùng thiên tai)
        // từng làm A* trả về chặng ESVLC→BEANR dài 14 089 NM cho 736 NM đường thẳng, cắt đất
        // 4 đoạn vì ô lưới thô ~90 NM không biểu diễn nổi bờ biển. Thà coi là thất bại để rơi
        // xuống các dự phòng bên dưới.
        bool Plausible(IReadOnlyList<LatLon> pts) =>
            GeoMath.PathLengthNm(pts) <= Math.Max(straightNm * 3.0, straightNm + 500.0);

        // Khung lưới mặc định chỉ rộng hơn a→b 5° nên chặng phải vòng xa sẽ không có đường:
        // Piraeus → Le Havre buộc qua Gibraltar (−5.6°) trong khi bbox chỉ tới −4.89°.
        foreach (var paddingScale in LegPaddingScales)
        {
            try
            {
                var grid = _gridBuilder.Build(a, b, hazards, gridSize, paddingScale);
                var res = _aStar.FindPath(grid, _heuristicCost);
                if (!res.Found || res.Waypoints.Count < 2) continue;

                var pts = res.Waypoints.ToList();
                var rawCrossings = LandMask.CountLandCrossingSegments(pts, skipEnds: false);
                pts[0] = a;
                pts[^1] = b;
                // Truyền phép thử thiên tai vào bước làm mượt. Không truyền thì string-pulling chỉ
                // tránh đất, kéo thẳng đường A* đã né xuyên ngược qua vùng thiên tai (MAPTM→PAPCN
                // từng xuyên sâu 54 NM qua vùng sóng lớn ở 22°N 50°W dù A* thô không xuyên vùng nào).
                var sanitized = PathSanitizer.Sanitize(pts, hazards.IsBlocked);
                if (!Plausible(sanitized))
                {
                    _logger.LogWarning(
                        "Chặng {A} -> {B} ({Nm:F0} NM, bbox {Pad}x): A* trả về {Poly:F0} NM — quá dài, bỏ qua.",
                        a, b, straightNm, paddingScale, GeoMath.PathLengthNm(sanitized));
                    continue;
                }

                var afterCrossings = LandMask.CountLandCrossingSegments(sanitized, skipEnds: false);
                if (rawCrossings > 0 || afterCrossings > 0)
                {
                    _logger.LogWarning(
                        "Chặng {From} -> {To} ({Nm:F0} NM, bbox {Pad}x): đoạn cắt đất trước lọc={Raw}, sau lọc={After}, số điểm={Pts}",
                        a, b, straightNm, paddingScale, rawCrossings, afterCrossings, sanitized.Count);
                }
                return sanitized;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Không dựng được polyline chặng {A} -> {B}", a, b);
                break;
            }
        }

        _logger.LogWarning("A* không tìm được đường biển cho chặng {A} -> {B} ({Nm:F0} NM)",
            a, b, straightNm);

        // Dự phòng 1 — bỏ thiên tai khỏi lưới rồi thử lại. Khi thiên tai được rải dọc tuyến,
        // các vùng có thể nối thành một bức tường chắn hết lối đi, trong khi đường biển vẫn tồn
        // tại — chỉ là không né được thiên tai. Vẽ đúng hình dạng đường biển vẫn hơn hẳn rơi vào
        // lát cắt hành lang (xem dự phòng 2).
        foreach (var paddingScale in LegPaddingScales)
        {
            try
            {
                var grid = _gridBuilder.Build(a, b, NoHazardProvider.Instance, gridSize, paddingScale);
                var res = _aStar.FindPath(grid, _heuristicCost);
                if (!res.Found || res.Waypoints.Count < 2) continue;

                var pts = res.Waypoints.ToList();
                pts[0] = a;
                pts[^1] = b;
                var noHazard = PathSanitizer.Sanitize(pts);
                if (!Plausible(noHazard)) continue;

                _logger.LogWarning(
                    "Chặng {A} -> {B} ({Nm:F0} NM): thiên tai chặn hết lối — vẽ đường biển không né thiên tai.",
                    a, b, straightNm);
                return noHazard;
            }
            catch
            {
                break;
            }
        }

        // Dự phòng 2 — cắt đoạn tương ứng từ hành lang chính. TUYỆT ĐỐI không nối thẳng a→b:
        // làm vậy sẽ vẽ một đường thẳng xuyên lục địa (Piraeus → Le Havre cắt qua cả châu Âu).
        //
        // Nhưng phải KIỂM TRA: hành lang chỉ hữu ích khi hai đầu chặng nằm trên nó. Nếu không,
        // "điểm gần nhất trên hành lang" rơi vào một đoạn hoàn toàn khác của tuyến — chặng
        // ESVLC→BEANR (734 NM) từng bị cắt thành 14 037 NM vì hai đầu chiếu vào đoạn vòng
        // quanh châu Phi rồi leo lên Đại Tây Dương.
        var slice = SliceCorridor(corridor, a, b);
        if (slice is not null && slice.Count >= 2)
        {
            var crossings = LandMask.CountLandCrossingSegments(slice, skipEnds: true);
            var hazardHits = CountHazardCrossingSegments(slice, hazards);

            if (crossings == 0 && hazardHits == 0)
            {
                var sliceNm = GeoMath.PathLengthNm(slice);
                if (sliceNm > Math.Max(straightNm * 2.5, straightNm + 300))
                    _logger.LogWarning(
                        "Chặng {A} -> {B}: lát cắt hành lang dài bất thường ({Slice:F0} NM so với {Straight:F0} NM đường thẳng).",
                        a, b, sliceNm, straightNm);
                else
                    _logger.LogInformation("Chặng {A} -> {B}: dùng đoạn cắt từ hành lang ({Pts} điểm)",
                        a, b, slice.Count);

                return slice;
            }

            _logger.LogWarning(
                "Chặng {A} -> {B}: lát cắt hành lang cắt đất ({Cross} đoạn), xuyên thiên tai ({Haz} đoạn) — không dùng.",
                a, b, crossings, hazardHits);
        }

        return new List<LatLon> { a, b };
    }

    /// <summary>
    /// Cắt đoạn hành lang giữa điểm gần a nhất và gần b nhất. Dùng khi A* của riêng chặng
    /// thất bại, để không phải vẽ đường thẳng qua lục địa.
    /// </summary>
    private static List<LatLon>? SliceCorridor(IReadOnlyList<LatLon>? corridor, LatLon a, LatLon b)
    {
        if (corridor is null || corridor.Count < 2) return null;
        var ia = NearestCorridorIndex(corridor, a);
        var ib = NearestCorridorIndex(corridor, b);
        if (ia < 0 || ib <= ia) return null;

        var pts = new List<LatLon>(ib - ia + 3) { a };
        for (var i = ia; i <= ib; i++) pts.Add(corridor[i]);
        pts.Add(b);
        return PathSanitizer.Sanitize(pts);
    }

    private static int NearestCorridorIndex(IReadOnlyList<LatLon> pts, LatLon p)
    {
        var best = -1;
        var bestNm = double.MaxValue;
        for (var i = 0; i < pts.Count; i++)
        {
            var d = GeoMath.HaversineNm(pts[i], p);
            if (d < bestNm)
            {
                bestNm = d;
                best = i;
            }
        }
        return best;
    }

    /// <summary>
    /// Chuỗi cảng mốc mặc định cho tuyến phía tây:
    /// Vũng Tàu → Singapore → Colombo → Port Said (Suez) → Algeciras (Gibraltar) → Cartagena → Panama.
    /// </summary>
    private static readonly string[] DefaultWestHubs = { "SGSIN", "LKCMB", "EGPSD", "ESALG", "COCTG" };

    private VoyageLegPlan RunPlanner(
        LatLon start, LatLon goal,
        Port? startPort, Port? goalPort,
        string? startPortCode, string? goalPortCode,
        IReadOnlyList<LatLon> corridor,
        IReadOnlyList<BunkerPort> candidates,
        IReadOnlyList<BunkerPort> mustVisit,
        FuelModelOptions options,
        PlanVoyageLegsRequest request,
        DateTime departure,
        IHazardProvider hazards) =>
        _planner.Plan(new VoyageLegPlanInput
        {
            Start = start,
            Goal = goal,
            StartPortCode = startPortCode,
            StartPortName = startPort?.PortName,
            GoalPortCode = goalPortCode,
            GoalPortName = goalPort?.PortName,
            RouteWaypoints = corridor,
            Ports = candidates,
            MustVisitPorts = mustVisit,
            Options = options,
            Hazards = hazards,
            MaxDetourNm = request.MaxDetourNm ?? 400,
            MaxLegs = 12,
            DepartureUtc = departure,
            RefineLegDistances = request.RefineLegDistances,
            RefineMaxStraightNm = request.RefineMaxStraightNm ?? 6000
        });

    /// <summary>Kế hoạch có tới được cảng đích không.</summary>
    private static bool ReachesGoal(VoyageLegPlan plan, string? goalPortCode)
    {
        var last = plan.Legs.LastOrDefault();
        if (last is null) return false;
        if (string.IsNullOrWhiteSpace(goalPortCode)) return true;
        return string.Equals(last.ToPortCode?.Trim(), goalPortCode.Trim(), StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>So sánh hai kế hoạch: ưu tiên tới đích, rồi tới số điểm tiếp nhiên liệu ít hơn.</summary>
    private static bool Better(VoyageLegPlan candidate, VoyageLegPlan current)
    {
        if (candidate.Legs.Count == 0) return false;
        if (current.Legs.Count == 0) return true;
        var cReaches = candidate.Warnings.Count == 0;
        var curReaches = current.Warnings.Count == 0;
        if (cReaches != curReaches) return cReaches;
        return candidate.Legs.Count > current.Legs.Count;
    }

    /// <summary>Độ nới khung lưới khi dựng đoạn dẫn qua cảng bắt buộc.</summary>
    private static readonly double[] GuidePaddingScales = { 1.0, 2.5, 5.0, 10.0 };

    /// <summary>
    /// Dựng hành lang ĐI QUA các cảng bắt buộc: start → P1 → … → Pn → goal, mỗi đoạn bằng A* thô.
    ///
    /// Vì sao cần: <see cref="RouteCorridor.LegDistanceNm"/> tính khoảng cách chặng bằng
    /// (along_đích − along_nguồn) + offset_nguồn + offset_đích — công thức này chỉ đúng khi hai
    /// đầu chặng NẰM TRÊN hành lang. Khi hành lang chỉ nối start→goal, một cảng bắt buộc lệch xa
    /// hành lang sẽ bị chiếu về điểm gần nhất, thường rơi đúng vào điểm cuối hành lang kèm offset
    /// lớn. Ví dụ Chattogram trong tuyến ARBUE→KHPNH bị chiếu đúng vào Phnom Penh với offset
    /// 993 NM, khiến MUPLU→Chattogram ước tính 6 480 NM (thực tế 3 250 NM), vượt tầm 4 692 NM
    /// nên bị loại oan — tàu phải vòng ngược qua Malacca hai lần.
    ///
    /// Ép hành lang đi qua cảng bắt buộc làm offset ≈ 0 và khôi phục tính hợp lệ của phép chiếu.
    /// </summary>
    private IReadOnlyList<LatLon> BuildGuideThroughMandatoryPorts(
        LatLon start, LatLon goal,
        IReadOnlyList<LatLon> leadingVia,
        IReadOnlyList<BunkerPort> mustVisit,
        IReadOnlyList<LatLon> baseCorridor)
    {
        var nodes = new List<LatLon> { start };
        nodes.AddRange(leadingVia);
        nodes.AddRange(mustVisit.Select(p => p.Position));
        nodes.Add(goal);

        var result = new List<LatLon> { start };
        for (var i = 0; i < nodes.Count - 1; i++)
        {
            foreach (var pt in RouteSeaSegment(nodes[i], nodes[i + 1], baseCorridor))
            {
                if (result.Count > 0 && SamePoint(result[^1], pt)) continue;
                result.Add(pt);
            }
        }

        if (result.Count < 2) return baseCorridor;

        // Ép hai đầu về đúng toạ độ yêu cầu (A* có thể trả về tâm ô gần đúng).
        result[0] = start;
        result[^1] = goal;
        return result;
    }

    private static bool SamePoint(LatLon a, LatLon b) =>
        Math.Abs(a.Lat - b.Lat) < 1e-7 && Math.Abs(GeoMath.WrapLon(a.Lon - b.Lon)) < 1e-7;

    /// <summary>
    /// Một đoạn dẫn giữa hai mốc bằng A* thô. Hai đầu được ép đúng toạ độ mốc để neo nằm chính
    /// xác trên hành lang (offset = 0). A* thất bại thì cắt đoạn tương ứng từ hành lang gốc.
    /// </summary>
    private List<LatLon> RouteSeaSegment(LatLon a, LatLon b, IReadOnlyList<LatLon> baseCorridor)
    {
        foreach (var paddingScale in GuidePaddingScales)
        {
            try
            {
                var grid = _gridBuilder.Build(a, b, NoHazardProvider.Instance, CorridorGridSize, paddingScale);
                var res = _aStar.FindPath(grid, _heuristicCost);
                if (!res.Found || res.Waypoints.Count < 2) continue;

                var pts = res.Waypoints.ToList();
                pts[0] = a;
                pts[^1] = b;
                var sanitized = PathSanitizer.Sanitize(pts);
                if (sanitized.Count == 0) return new List<LatLon> { a, b };

                // String-pull có thể bỏ mất đỉnh cảng ở hai đầu — ép lại để neo nằm trên hành lang.
                sanitized[0] = a;
                sanitized[^1] = b;
                return sanitized;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Không dựng được đoạn dẫn {A} -> {B}", a, b);
                break;
            }
        }

        // Dự phòng: cắt đoạn tương ứng từ hành lang gốc (vốn đã là đường biển thật).
        var slice = SliceCorridor(baseCorridor, a, b);
        if (slice is not null && slice.Count >= 2)
        {
            _logger.LogInformation("Đoạn dẫn {A} -> {B}: dùng lát cắt hành lang gốc ({N} điểm)",
                a, b, slice.Count);
            return slice;
        }

        _logger.LogWarning("Đoạn dẫn {A} -> {B}: A* và hành lang gốc đều thất bại, nối thẳng.", a, b);
        return new List<LatLon> { a, b };
    }

    /// <summary>
    /// Đếm số đoạn của polyline xuyên vào vùng thiên tai. Dùng để không nhận một lát cắt
    /// hành lang đi ngang qua vùng bão trong khi giao diện vẫn ghi “đã né thiên tai”.
    /// </summary>
    private static int CountHazardCrossingSegments(IReadOnlyList<LatLon> pts, IHazardProvider hazards)
    {
        var hits = 0;
        for (var i = 0; i < pts.Count - 1; i++)
        {
            var a = pts[i];
            var b = pts[i + 1];
            var n = Math.Clamp(
                (int)Math.Ceiling(GeoMath.HaversineNm(a, b) / LandMask.MaxSampleSpacingNm), 1, 400);

            for (var k = 1; k <= n; k++)
            {
                var t = (double)k / (n + 1);
                var p = new LatLon(a.Lat + (b.Lat - a.Lat) * t, a.Lon + (b.Lon - a.Lon) * t);
                if (hazards.IsBlocked(p)) { hits++; break; }
            }
        }
        return hits;
    }

    /// <summary>
    /// Đối chiếu polyline từng chặng với các vùng thiên tai để biết tuyến có thực sự né không.
    /// Lấy mẫu dọc từng đoạn (không chỉ tại đỉnh) vì đoạn nối hai đỉnh có thể lõm vào gần tâm
    /// vùng hơn cả hai đầu.
    /// </summary>
    private static HazardAvoidanceDto MeasureHazardAvoidance(
        VoyageLegPlan plan, IReadOnlyList<HazardZone> zones)
    {
        var result = new HazardAvoidanceDto { TotalZones = zones.Count };
        if (zones.Count == 0 || plan.Legs.Count == 0) return result;

        var points = new List<LatLon>();
        foreach (var leg in plan.Legs)
        {
            var wp = leg.Waypoints;
            if (wp is null || wp.Count == 0) continue;

            for (var i = 0; i < wp.Count - 1; i++)
            {
                var a = wp[i];
                var b = wp[i + 1];
                var n = Math.Clamp((int)Math.Ceiling(GeoMath.HaversineNm(a, b) / 20.0), 1, 1500);
                for (var k = 0; k <= n; k++)
                {
                    var t = (double)k / n;
                    points.Add(new LatLon(a.Lat + (b.Lat - a.Lat) * t, a.Lon + (b.Lon - a.Lon) * t));
                }
            }
        }

        if (points.Count == 0) return result;

        var minClearance = double.MaxValue;
        foreach (var z in zones)
        {
            var best = double.MaxValue;
            foreach (var p in points)
            {
                var d = GeoMath.HaversineNm(p, z.Center);
                if (d < best) best = d;
            }

            var penetration = z.RadiusNm - best;
            if (penetration > 0)
            {
                result.PiercedZones++;
                if (penetration > result.DeepestPenetrationNm)
                    result.DeepestPenetrationNm = penetration;
            }
            else if (-penetration < minClearance)
            {
                minClearance = -penetration;
            }
        }

        result.AvoidedZones = zones.Count - result.PiercedZones;
        result.MinClearanceNm = Math.Round(minClearance == double.MaxValue ? 0 : minClearance, 0);
        result.DeepestPenetrationNm = Math.Round(result.DeepestPenetrationNm, 0);
        return result;
    }

    /// <summary>Tuyến hub phía tây (Malacca – Suez – Gibraltar) — nơi tập trung cảng tiếp nhiên liệu.</summary>
    private IReadOnlyList<LatLon> BuildWestboundCorridor(List<Port> ports, LatLon start, LatLon goal) =>
        BuildHubCorridor(ports, start, goal, DefaultWestHubs);

    /// <summary>
    /// Dựng hành lang tuyến từ chuỗi cảng mốc: nối các cảng bằng đường nội suy theo
    /// kinh độ đã unwrap, lấy mẫu mỗi ~60 NM để phép chiếu cảng được mịn.
    /// </summary>
    private static IReadOnlyList<LatLon> BuildHubCorridor(
        List<Port> ports, LatLon start, LatLon goal, IReadOnlyList<string> viaCodes)
    {
        var nodes = new List<LatLon> { start };
        foreach (var code in viaCodes)
        {
            var p = ResolvePort(ports, code);
            if (p?.Latitude is { } la && p.Longitude is { } lo)
                nodes.Add(new LatLon(la, lo));
        }
        nodes.Add(goal);

        var result = new List<LatLon> { nodes[0] };
        for (var i = 0; i < nodes.Count - 1; i++)
        {
            var a = nodes[i];
            var b = nodes[i + 1];

            // Unwrap kinh độ theo hướng ngắn nhất giữa hai mốc liên tiếp.
            var bLon = a.Lon + GeoMath.WrapLon(b.Lon - a.Lon);
            while (bLon - a.Lon > 180) bLon -= 360;
            while (bLon - a.Lon < -180) bLon += 360;

            var segNm = GeoMath.HaversineNm(a, new LatLon(b.Lat, GeoMath.WrapLon(bLon)));
            var steps = Math.Clamp((int)Math.Ceiling(segNm / 60.0), 1, 400);
            for (var s = 1; s <= steps; s++)
            {
                var t = (double)s / steps;
                result.Add(new LatLon(a.Lat + (b.Lat - a.Lat) * t, a.Lon + (bLon - a.Lon) * t));
            }
        }

        return result;
    }

    public async Task<IReadOnlyList<object>> ListBunkerPortsAsync(CancellationToken ct = default)
    {
        var ports = await _db.Ports.AsNoTracking()
            .Where(p => p.Latitude != null && p.Longitude != null && p.IsActive)
            .OrderBy(p => p.Country)
            .ThenBy(p => p.PortName)
            .Select(p => new
            {
                code = p.PortCode,
                name = p.PortName,
                country = p.Country,
                lat = p.Latitude,
                lon = p.Longitude
            })
            .ToListAsync(ct);

        return ports.Cast<object>().ToList();
    }

    private async Task<Guid?> ResolveVesselIdByImoAsync(string? imo, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(imo)) return null;
        var key = imo.Trim();
        return await _db.Vessels.AsNoTracking()
            .Where(v => v.IMO == key)
            .Select(v => (Guid?)v.Id)
            .FirstOrDefaultAsync(ct);
    }

    private static Port? ResolvePort(List<Port> ports, string? code) =>
        string.IsNullOrWhiteSpace(code)
            ? null
            : ports.FirstOrDefault(p => string.Equals(p.PortCode, code.Trim(), StringComparison.OrdinalIgnoreCase));

    private static LatLon? ResolveLatLon(double? lat, double? lon, Port? port)
    {
        if (lat.HasValue && lon.HasValue) return new LatLon(lat.Value, lon.Value);
        if (port?.Latitude is { } pla && port.Longitude is { } plo) return new LatLon(pla, plo);
        return null;
    }

    /// <summary>Cảng gần nhất trong bán kính cho phép (dùng khi request chỉ có toạ độ).</summary>
    private static Port? NearestPort(List<Port> ports, LatLon point, double maxNm)
    {
        Port? best = null;
        var bestNm = maxNm;
        foreach (var p in ports)
        {
            if (p.Latitude is not { } la || p.Longitude is not { } lo) continue;
            var d = GeoMath.HaversineNm(point, new LatLon(la, lo));
            if (d < bestNm)
            {
                bestNm = d;
                best = p;
            }
        }
        return best;
    }

    /// <summary>
    /// Thứ tự ưu tiên: tham số request > hồ sơ nhiên liệu của tàu > giá trị mặc định (ước lượng).
    /// </summary>
    private static FuelModelOptions BuildOptions(
        PlanVoyageLegsRequest r, VesselFuelProfile? p, VoyageRecord? voyage)
    {
        var baseOptions = p is not null ? ToOptions(p, r) : new FuelModelOptions
        {
            FuelCapacityTons = r.FuelCapacityTons ?? 220,
            CurrentFuelTons = r.CurrentFuelTons ?? r.FuelCapacityTons ?? 220,
            ReserveFraction = r.ReserveFraction ?? 0.20,
            ServiceSpeedKts = r.ServiceSpeedKts ?? 11.5,
            ServicePowerKw = r.ServicePowerKw ?? 900
        };

        // Nếu voyage có số liệu kế hoạch thì ưu tiên tốc độ khai thác của voyage.
        if (r.ServiceSpeedKts is null && voyage?.PlannedAverageSpeed is > 0)
        {
            return new FuelModelOptions
            {
                FuelCapacityTons = baseOptions.FuelCapacityTons,
                CurrentFuelTons = baseOptions.CurrentFuelTons,
                ReserveFraction = baseOptions.ReserveFraction,
                ServiceSpeedKts = voyage.PlannedAverageSpeed.Value,
                ServicePowerKw = baseOptions.ServicePowerKw,
                SfocMainGPerKwh = baseOptions.SfocMainGPerKwh,
                AuxLoadKw = baseOptions.AuxLoadKw,
                SfocAuxGPerKwh = baseOptions.SfocAuxGPerKwh,
                SeaMarginFraction = baseOptions.SeaMarginFraction,
                SpeedExponent = baseOptions.SpeedExponent,
                WaveSpeedLossPerM2 = baseOptions.WaveSpeedLossPerM2,
                WindSpeedLossPerMs2 = baseOptions.WindSpeedLossPerMs2,
                MaxSpeedLossFraction = baseOptions.MaxSpeedLossFraction,
                WeatherAllowanceFraction = baseOptions.WeatherAllowanceFraction,
                PortStayHours = baseOptions.PortStayHours
            };
        }

        return baseOptions;
    }

    private static FuelModelOptions ToOptions(VesselFuelProfile p, PlanVoyageLegsRequest r) => new()
    {
        FuelCapacityTons = r.FuelCapacityTons ?? p.FuelCapacityTons,
        // Ở cảng xuất phát tàu nạp đầy bình (cảng nào cũng có dịch vụ bunker).
        // Chỉ dùng đúng mức "nhiên liệu hiện có" khi người gọi yêu cầu rõ ràng.
        // Trước đây lấy p.CurrentFuelTons (demo 75 t ⇒ tầm 3 226 NM) nên nhiều tuyến báo
        // "không có cảng tiếp nhiên liệu nào trong tầm" dù chỉ cần nạp thêm ngay tại cảng đi.
        CurrentFuelTons = r.CurrentFuelTons ?? r.FuelCapacityTons ?? p.FuelCapacityTons,
        ReserveFraction = r.ReserveFraction ?? p.ReserveFraction,
        ServiceSpeedKts = r.ServiceSpeedKts ?? p.ServiceSpeedKts,
        ServicePowerKw = r.ServicePowerKw ?? p.ServicePowerKw,
        SfocMainGPerKwh = p.SfocMainGPerKwh,
        AuxLoadKw = p.AuxLoadKw,
        SfocAuxGPerKwh = p.SfocAuxGPerKwh,
        SeaMarginFraction = p.SeaMarginFraction,
        SpeedExponent = p.SpeedExponent,
        WeatherAllowanceFraction = p.WeatherAllowanceFraction,
        PortStayHours = p.PortStayHours
    };

    private List<BunkerPort> BuildCandidates(
        List<Port> ports, List<string>? only, string? startCode, string? goalCode)
    {
        IEnumerable<Port> src = ports;
        if (only is { Count: > 0 })
        {
            var set = new HashSet<string>(only.Select(c => c.Trim()), StringComparer.OrdinalIgnoreCase);
            src = ports.Where(p => set.Contains(p.PortCode));
        }

        return src
            .Where(p => p.Latitude.HasValue && p.Longitude.HasValue)
            .Select(p => new BunkerPort(p.PortCode, p.PortName, p.Latitude!.Value, p.Longitude!.Value))
            .ToList();
    }

    /// <summary>
    /// Dựng hành lang tuyến biển bằng A* (không có bão) khi caller chưa có sẵn đường đi.
    /// Dùng chung <see cref="VoyageHazardPlanner.BuildCorridor"/> để hành lang và trục rải
    /// thiên tai luôn là một, tránh trường hợp bản đồ vẽ vùng ở chỗ tuyến không đi qua.
    /// </summary>
    private IReadOnlyList<LatLon> ComputeCorridor(LatLon start, LatLon goal)
    {
        var corridor = VoyageHazardPlanner.BuildCorridor(
            _gridBuilder, _aStar, _heuristicCost, start, goal);

        if (corridor.Count < 3)
            _logger.LogWarning("A* không tìm được hành lang tuyến, dùng đường thẳng.");

        return corridor;
    }

    /// <summary>
    /// Vùng thiên tai demo rải dọc đường biển start→goal (xem <see cref="VoyageHazardPlanner"/>).
    /// </summary>
    public IReadOnlyList<HazardZone> GetHazardZones() => VoyageHazardPlanner.Generate();

    private static VoyageLegPlanDto MapPlan(
        VoyageLegPlan plan, FuelModelOptions options, Guid? voyageId, Guid? vesselId, VesselFuelProfile? profile)
    {
        var model = new FuelModel(options);
        return new VoyageLegPlanDto
        {
            VoyageId = voyageId,
            VesselId = vesselId,
            TotalDistanceNm = Math.Round(plan.TotalDistanceNm, 1),
            TotalFuelTons = Math.Round(plan.TotalFuelTons, 2),
            TotalHours = Math.Round(plan.TotalHours, 1),
            LegCount = plan.Legs.Count,
            BunkerStopCount = plan.Legs.Count(l => l.IsBunkerStop),
            InitialFuelTons = Math.Round(plan.InitialFuelTons, 1),
            FinalFuelTons = Math.Round(plan.FinalFuelTons, 1),
            FuelCapacityTons = Math.Round(plan.FuelCapacityTons, 1),
            ReserveTons = Math.Round(plan.ReserveTons, 1),
            ReserveFraction = options.ReserveFraction,
            TonsPerNm = Math.Round(plan.TonsPerNm, 4),
            TonsPerDay = Math.Round(plan.TonsPerDay, 2),
            ServiceSpeedKts = plan.ServiceSpeedKts,
            RangeAtDepartureNm = Math.Round(plan.RangeAtDepartureNm, 0),
            DepartureUtc = plan.DepartureUtc,
            ArrivalUtc = plan.ArrivalUtc,
            Model = plan.Model,
            Warnings = plan.Warnings,
            FuelProfile = new
            {
                source = profile?.Source ?? "ESTIMATE",
                profileId = profile?.Id,
                profile?.FuelType,
                model = plan.Model,
                tonsPerDay = Math.Round(model.ServiceTonsPerHour() * 24.0, 2),
                tonsPerNm = Math.Round(model.PlanTonsPerNm(), 4),
                options
            },
            Legs = plan.Legs.Select(l => new VoyageLegDto
            {
                Sequence = l.Sequence,
                FromPortCode = l.FromPortCode,
                FromPortName = l.FromPortName,
                ToPortCode = l.ToPortCode,
                ToPortName = l.ToPortName,
                FromLat = l.FromLat,
                FromLon = l.FromLon,
                ToLat = l.ToLat,
                ToLon = l.ToLon,
                DistanceNm = Math.Round(l.DistanceNm, 1),
                DurationHours = Math.Round(l.DurationHours, 2),
                AverageSpeedKts = l.AverageSpeedKts,
                DepartureUtc = l.DepartureUtc,
                ArrivalUtc = l.ArrivalUtc,
                FuelOnDepartureTons = Math.Round(l.FuelOnDepartureTons, 2),
                FuelConsumedTons = Math.Round(l.FuelConsumedTons, 2),
                FuelOnArrivalTons = Math.Round(l.FuelOnArrivalTons, 2),
                FuelOnArrivalPercent = Math.Round(l.FuelOnArrivalPercent, 1),
                BunkerTons = Math.Round(l.BunkerTons, 2),
                IsBunkerStop = l.IsBunkerStop,
                StopKind = l.StopKind,
                PortOffsetNm = Math.Round(l.PortOffsetNm, 1),
                Waypoints = l.Waypoints
                    .Select(p => new LatLonDto { Lat = p.Lat, Lon = GeoMath.WrapLon(p.Lon) })
                    .ToList(),
                Notes = l.Notes
            }).ToList()
        };
    }

    /// <summary>Ghi kế hoạch chặng vào voyage_plan_legs và cập nhật số liệu kế hoạch của voyage.</summary>
    private async Task PersistLegsAsync(Guid voyageId, VoyageLegPlan plan, CancellationToken ct)
    {
        // DbContext đặt NoTracking toàn cục -> phải AsTracking() mới cập nhật được voyage_records.
        var voyage = await _db.VoyageRecords.AsTracking().FirstOrDefaultAsync(v => v.Id == voyageId, ct);
        if (voyage is null) return;

        var existing = await _db.VoyagePlanLegs.Where(l => l.VoyageId == voyageId).ToListAsync(ct);
        if (existing.Count > 0) _db.VoyagePlanLegs.RemoveRange(existing);

        foreach (var leg in plan.Legs)
        {
            _db.VoyagePlanLegs.Add(new VoyagePlanLeg
            {
                Id = Guid.NewGuid(),
                VoyageId = voyageId,
                Sequence = leg.Sequence,
                LegType = leg.IsBunkerStop ? "PASSAGE_BUNKER" : "PASSAGE",
                FromPortCode = Truncate(leg.FromPortCode, 5),
                FromPortName = Truncate(leg.FromPortName, 100),
                ToPortCode = Truncate(leg.ToPortCode, 5),
                ToPortName = Truncate(leg.ToPortName, 100),
                PlannedDepartureTime = leg.DepartureUtc,
                PlannedArrivalTime = leg.ArrivalUtc,
                PlannedDistance = Math.Round(leg.DistanceNm, 1),
                PlannedDurationHours = Math.Round(leg.DurationHours, 2),
                PlannedAverageSpeed = leg.AverageSpeedKts,
                CargoActivity = "NONE",
                CrewChangePlanned = false,
                BunkerSupplyPlanned = leg.IsBunkerStop,
                PlannedFuelConsumption = Math.Round(leg.FuelConsumedTons, 2),
                WeatherRoutingNotes = Truncate(leg.Notes, 2000),
                Notes = $"Nhiên liệu rời cảng {leg.FuelOnDepartureTons:F1} t → tới {leg.FuelOnArrivalTons:F1} t "
                        + $"({leg.FuelOnArrivalPercent:F0}% sức chứa); nạp tại cảng {leg.BunkerTons:F1} t",
                IsSynced = false,
                SyncVersion = 0,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                OriginNode = "SHORE"
            });
        }

        voyage.PlannedDistance = Math.Round(plan.TotalDistanceNm, 1);
        voyage.PlannedDurationHours = Math.Round(plan.TotalHours, 2);
        voyage.PlannedAverageSpeed = plan.ServiceSpeedKts;
        voyage.PlannedFuelConsumption = Math.Round(plan.TotalFuelTons, 2);
        voyage.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        _logger.LogInformation(
            "Đã ghi {Count} chặng vào voyage_plan_legs cho voyage {VoyageId}",
            plan.Legs.Count, voyageId);
    }

    private static string? Truncate(string? value, int max) =>
        string.IsNullOrEmpty(value) ? value : (value.Length <= max ? value : value[..max]);
}
