using System.Diagnostics;

namespace ProductApi.Services.WeatherRouting;

/// <summary>Cảng ứng viên để tiếp nhiên liệu.</summary>
public sealed record BunkerPort(string Code, string Name, double Lat, double Lon)
{
    public LatLon Position => new(Lat, Lon);
}

/// <summary>
/// Vai trò của điểm dừng trong hành trình:
/// START (cảng đầu), BUNKER (gợi ý nạp nhiên liệu), MANDATORY (cảng bắt buộc ghé), END (cảng cuối).
/// </summary>
public static class LegStopKind
{
    public const string Start = "START";
    public const string Bunker = "BUNKER";
    public const string Mandatory = "MANDATORY";
    public const string End = "END";
}

/// <summary>Một chặng con của hành trình.</summary>
public sealed class VoyageLegPlanLeg
{
    public int Sequence { get; set; }
    public string? FromPortCode { get; set; }
    public string? FromPortName { get; set; }
    public string? ToPortCode { get; set; }
    public string? ToPortName { get; set; }

    /// <summary>Toạ độ điểm đầu/cuối chặng (để vẽ tuyến chặng lên bản đồ).</summary>
    public double? FromLat { get; set; }
    public double? FromLon { get; set; }
    public double? ToLat { get; set; }
    public double? ToLon { get; set; }

    public double DistanceNm { get; set; }
    public double DurationHours { get; set; }
    public double AverageSpeedKts { get; set; }

    public DateTime DepartureUtc { get; set; }
    public DateTime ArrivalUtc { get; set; }

    public double FuelOnDepartureTons { get; set; }
    public double FuelConsumedTons { get; set; }
    public double FuelOnArrivalTons { get; set; }
    public double FuelOnArrivalPercent { get; set; }

    /// <summary>Lượng nhiên liệu nạp thêm tại cảng đến (0 nếu không tiếp nhiên liệu).</summary>
    public double BunkerTons { get; set; }

    /// <summary>
    /// Loại điểm dừng của chặng: START (cảng đầu), BUNKER (gợi ý nạp nhiên liệu),
    /// MANDATORY (cảng bắt buộc ghé để nhập hàng/làm thủ tục), END (cảng cuối).
    /// </summary>
    public bool IsBunkerStop { get; set; }

    /// <summary>Vai trò của cảng đến trong hành trình (để tô màu marker trên bản đồ).</summary>
    public string StopKind { get; set; } = LegStopKind.Bunker;

    /// <summary>Độ lệch của cảng so với hành lang tuyến (NM).</summary>
    public double PortOffsetNm { get; set; }

    /// <summary>Polyline đường biển thật của chặng (nối hai cảng) để vẽ lên bản đồ.</summary>
    public List<LatLon> Waypoints { get; set; } = new();

    public string? Notes { get; set; }
}

/// <summary>Kết quả lập kế hoạch n chặng.</summary>
public sealed class VoyageLegPlan
{
    public List<VoyageLegPlanLeg> Legs { get; set; } = new();
    public List<string> Warnings { get; set; } = new();

    public double TotalDistanceNm { get; set; }
    public double TotalFuelTons { get; set; }
    public double TotalHours { get; set; }

    public double InitialFuelTons { get; set; }
    public double FinalFuelTons { get; set; }
    public double FuelCapacityTons { get; set; }
    public double ReserveTons { get; set; }
    public double TonsPerNm { get; set; }
    public double TonsPerDay { get; set; }
    public double ServiceSpeedKts { get; set; }
    public double RangeAtDepartureNm { get; set; }

    public DateTime DepartureUtc { get; set; }
    public DateTime ArrivalUtc { get; set; }

    public string Model { get; set; } = "constant-power propeller-law + SFOC";
    public long ElapsedMs { get; set; }
}

/// <summary>Đầu vào cho bộ lập kế hoạch chặng (thuần logic, không truy cập DB).</summary>
public sealed class VoyageLegPlanInput
{
    public required LatLon Start { get; init; }
    public required LatLon Goal { get; init; }
    public string? StartPortCode { get; init; }
    public string? StartPortName { get; init; }
    public string? GoalPortCode { get; init; }
    public string? GoalPortName { get; init; }

    /// <summary>Polyline tuyến biển (thường lấy từ A*).</summary>
    public required IReadOnlyList<LatLon> RouteWaypoints { get; init; }

    /// <summary>Các cảng có thể tiếp nhiên liệu (thường là toàn bộ bảng ports).</summary>
    public IReadOnlyList<BunkerPort> Ports { get; init; } = Array.Empty<BunkerPort>();

    /// <summary>
    /// Cảng BẮT BUỘC phải ghé (nhập hàng/làm thủ tục) — tuỳ chọn. Hành trình sẽ được chia
    /// tại các cảng này, thứ tự theo vị trí dọc tuyến. Có thể nạp nhiên liệu luôn tại đây.
    /// </summary>
    public IReadOnlyList<BunkerPort> MustVisitPorts { get; init; } = Array.Empty<BunkerPort>();

    public required FuelModelOptions Options { get; init; }

    /// <summary>Vùng thiên tai cần né khi dựng polyline từng chặng (mặc định không có).</summary>
    public IHazardProvider Hazards { get; init; } = NoHazardProvider.Instance;

    /// <summary>Độ lệch ngang tối đa cho phép của cảng so với tuyến (NM).</summary>
    public double MaxDetourNm { get; init; } = 250;

    /// <summary>Chặng ngắn nhất để tránh chọn cảng quá gần điểm xuất phát (NM).</summary>
    public double MinLegNm { get; init; } = 120;

    public int MaxLegs { get; init; } = 12;

    public DateTime DepartureUtc { get; init; } = DateTime.UtcNow;

    /// <summary>Tinh chỉnh lại khoảng cách từng chặng bằng A* (chậm hơn nhưng chính xác hơn).</summary>
    public bool RefineLegDistances { get; init; } = true;

    /// <summary>
    /// Chỉ tinh chỉnh bằng A* cho chặng có khoảng cách thẳng ≤ ngưỡng này (NM).
    /// Để quá thấp sẽ khiến các chặng vượt đại dương rơi về ước lượng hành lang,
    /// cao hơn đường biển thật đáng kể (ARBUE→ZACPT: 4 365 so với 3 716 NM thật).
    /// </summary>
    public double RefineMaxStraightNm { get; init; } = 6000;
}

public interface IVoyageLegPlanner
{
    VoyageLegPlan Plan(VoyageLegPlanInput input);
}

/// <summary>
/// Bộ lập kế hoạch n chặng Vũng Tàu → Panama (và tổng quát cho mọi cặp cảng).
///
/// Thuật toán: tham lam (greedy) có kiểm soát trên hành lang tuyến
///  1. Chiếu mọi cảng ứng viên lên hành lang tuyến (along-track, offset).
///  2. Từ vị trí hiện tại với lượng nhiên liệu F, tính tầm hoạt động
///     R = (F - dự_trữ) / q.
///  3. Nếu đích nằm trong tầm → chặng cuối, kết thúc.
///  4. Ngược lại chọn cảng có along-track gần "điểm lý tưởng" nhất
///     (điểm mà khi tới đó nhiên liệu còn ≈ mức dự trữ 20%) nhưng vẫn ≤ tầm hoạt động.
///  5. Nạp đầy ở cảng đó rồi lặp lại. Bảo đảm mỗi lần lặp tiến về phía trước
///     (along-track tăng) nên thuật toán dừng sau tối đa MaxLegs bước.
/// </summary>
public sealed class VoyageLegPlanner : IVoyageLegPlanner
{
    private readonly IGridBuilder _gridBuilder;
    private readonly IAstStarRouter _aStar;
    private readonly IHeuristicCost _heuristicCost;
    private readonly ILogger<VoyageLegPlanner> _logger;

    public VoyageLegPlanner(
        IGridBuilder gridBuilder,
        IAstStarRouter aStar,
        IHeuristicCost heuristicCost,
        ILogger<VoyageLegPlanner> logger)
    {
        _gridBuilder = gridBuilder;
        _aStar = aStar;
        _heuristicCost = heuristicCost;
        _logger = logger;
    }

    public VoyageLegPlan Plan(VoyageLegPlanInput input)
    {
        var sw = Stopwatch.StartNew();
        var o = input.Options.Clamped();
        var model = new FuelModel(o);
        var corridor = RouteCorridor.Build(input.RouteWaypoints);

        var q = model.PlanTonsPerNm();                 // tấn/NM (đã gồm dung sai thời tiết)
        var capacity = o.FuelCapacityTons;
        var reserve = model.MinReserveTons;
        var speed = o.ServiceSpeedKts;

        var plan = new VoyageLegPlan
        {
            InitialFuelTons = o.CurrentFuelTons,
            FuelCapacityTons = capacity,
            ReserveTons = reserve,
            TonsPerNm = q,
            TonsPerDay = model.ServiceTonsPerHour() * 24.0,
            ServiceSpeedKts = speed,
            RangeAtDepartureNm = model.RangeNm(o.CurrentFuelTons),
            DepartureUtc = input.DepartureUtc
        };

        // 1) Chiếu cảng ứng viên lên hành lang tuyến.
        //    Gồm 2 mức: trong bán kính MaxDetourNm (bình thường) và mức nới rộng — chỉ dùng khi
        //    hành lang không có cảng nào trong tầm. Ví dụ ARBUE → Phnom Penh: hành lang chạy thẳng
        //    qua mũi Hảo Vọng nên Rio/Salvador lệch ~1 900 NM và bị loại, trong khi chúng chính là
        //    những cảng gần nhất có thể ghé để chia chặng.
        var candidates = new List<(BunkerPort Port, double AlongNm, double OffsetNm)>();
        var relaxedCandidates = new List<(BunkerPort Port, double AlongNm, double OffsetNm)>();
        var relaxedCapNm = Math.Max(input.MaxDetourNm * 5.0, 2500.0);
        foreach (var port in input.Ports)
        {
            if (string.IsNullOrWhiteSpace(port.Code)) continue;
            if (IsSamePort(port.Code, input.StartPortCode)) continue;
            if (IsSamePort(port.Code, input.GoalPortCode)) continue;

            var proj = corridor.Project(port.Position);
            if (proj.AlongTrackNm < input.MinLegNm) continue;
            if (proj.AlongTrackNm > corridor.TotalNm - 1.0) continue;

            if (proj.OffsetNm <= relaxedCapNm)
                relaxedCandidates.Add((port, proj.AlongTrackNm, proj.OffsetNm));

            if (proj.OffsetNm > input.MaxDetourNm) continue;
            candidates.Add((port, proj.AlongTrackNm, proj.OffsetNm));
        }

        candidates = candidates
            .OrderBy(c => c.AlongNm)
            .ThenBy(c => c.OffsetNm)
            .ToList();
        relaxedCandidates = relaxedCandidates
            .OrderBy(c => c.AlongNm)
            .ThenBy(c => c.OffsetNm)
            .ToList();

        // 2) Neo hành trình: điểm xuất phát + các cảng BẮT BUỘC ghé (theo thứ tự dọc tuyến) + đích.
        var mandatoryCodes = new HashSet<string>(
            input.MustVisitPorts.Select(p => p.Code).Where(c => !string.IsNullOrWhiteSpace(c)),
            StringComparer.OrdinalIgnoreCase);

        if (mandatoryCodes.Count > 0)
            candidates = candidates.Where(c => !mandatoryCodes.Contains(c.Port.Code)).ToList();

        var anchors = new List<(string? Code, string? Name, LatLon Pos, double Along, double Offset)>
        {
            (input.StartPortCode, input.StartPortName, corridor.Start, 0.0, 0.0)
        };

        foreach (var p in input.MustVisitPorts)
        {
            if (string.IsNullOrWhiteSpace(p.Code)) continue;
            if (IsSamePort(p.Code, input.StartPortCode)) continue;
            if (IsSamePort(p.Code, input.GoalPortCode)) continue;
            var proj = corridor.Project(p.Position);
            anchors.Add((p.Code, p.Name, p.Position, proj.AlongTrackNm, proj.OffsetNm));
        }

        anchors = anchors.OrderBy(a => a.Along).ToList();
        anchors.Add((input.GoalPortCode, input.GoalPortName, corridor.Goal, corridor.TotalNm, 0.0));

        // 3) Vòng lặp tham lam chia chặng theo từng neo.
        var fuel = o.CurrentFuelTons;
        var anchorIndex = 0;
        var cursor = anchors[0].Pos;
        string? cursorCode = anchors[0].Code;
        string? cursorName = anchors[0].Name;
        var cursorAlong = anchors[0].Along;
        var cursorOffset = anchors[0].Offset;

        var usedPorts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var clock = input.DepartureUtc;
        var sequence = 1;

        // Điểm lý tưởng: đốt vừa đủ 80% sức chứa để tới cảng với ~20% dự trữ.
        var idealLegNm = (capacity - reserve) / q;

        while (sequence <= input.MaxLegs && anchorIndex < anchors.Count - 1)
        {
            var nextAnchor = anchors[anchorIndex + 1];
            var isFinalAnchor = anchorIndex + 1 == anchors.Count - 1;
            var reachNm = model.BurnableTons(fuel) / q;
            var distToAnchorNm = RouteCorridor.LegDistanceNm(
                cursorAlong, cursorOffset, nextAnchor.Along, nextAnchor.Offset);

            // 3a) Tới được neo kế tiếp.
            if (distToAnchorNm <= reachNm)
            {
                var legNm = ResolveLegDistance(
                    input, cursor, nextAnchor.Pos, distToAnchorNm, cursorOffset, nextAnchor.Offset);

                var anchorLeg = BuildLeg(
                    sequence, cursor, nextAnchor.Pos,
                    cursorCode, cursorName, nextAnchor.Code, nextAnchor.Name,
                    legNm, speed, clock,
                    fuel, q, reserve, capacity,
                    isBunkerStop: !isFinalAnchor, portOffsetNm: nextAnchor.Offset,
                    notes: isFinalAnchor
                        ? "Chặng cuối tới đích"
                        : $"Cảng bắt buộc ghé (hàng hoá/thủ tục): {nextAnchor.Name}");

                if (isFinalAnchor)
                {
                    anchorLeg.StopKind = LegStopKind.End;
                    anchorLeg.BunkerTons = 0;
                    fuel = anchorLeg.FuelOnArrivalTons;
                }
                else
                {
                    // Cảng bắt buộc ghé: tranh thủ nạp đầy nhiên liệu.
                    anchorLeg.StopKind = LegStopKind.Mandatory;
                    anchorLeg.BunkerTons = Math.Max(0.0, capacity - anchorLeg.FuelOnArrivalTons);
                    anchorLeg.Notes += $"; nạp {anchorLeg.BunkerTons:F1} t lên {capacity:F0} t";
                    fuel = capacity;
                }

                plan.Legs.Add(anchorLeg);
                clock = isFinalAnchor
                    ? anchorLeg.ArrivalUtc
                    : anchorLeg.ArrivalUtc.AddHours(o.PortStayHours);

                cursor = nextAnchor.Pos;
                cursorCode = nextAnchor.Code;
                cursorName = nextAnchor.Name;
                cursorAlong = nextAnchor.Along;
                cursorOffset = nextAnchor.Offset;
                anchorIndex++;
                sequence++;
                continue;
            }

            if (reachNm <= 0 || fuel <= reserve)
            {
                plan.Warnings.Add(
                    $"Không đủ nhiên liệu để rời vị trí hiện tại (còn {fuel:F1} t, dự trữ {reserve:F1} t).");
                break;
            }

            // 2b) Chọn cảng tiếp nhiên liệu.
            List<(BunkerPort Port, double AlongNm, double OffsetNm, double DistNm)> FeasibleFrom(
                IReadOnlyList<(BunkerPort Port, double AlongNm, double OffsetNm)> src)
            {
                var list = new List<(BunkerPort, double, double, double)>();
                foreach (var c in src)
                {
                    if (usedPorts.Contains(c.Port.Code)) continue;
                    if (c.AlongNm <= cursorAlong + 1.0) continue;      // phải tiến về phía trước
                    if (c.AlongNm > nextAnchor.Along) continue;        // không vượt quá neo kế tiếp

                    var distNm = RouteCorridor.LegDistanceNm(cursorAlong, cursorOffset, c.AlongNm, c.OffsetNm);
                    if (distNm < input.MinLegNm) continue;
                    if (distNm > reachNm) continue;

                    list.Add((c.Port, c.AlongNm, c.OffsetNm, distNm));
                }
                return list;
            }

            var feasible = FeasibleFrom(candidates);
            var usedRelaxed = false;
            if (feasible.Count == 0)
            {
                // Không có cảng nào gần hành lang trong tầm → nới rộng bán kính lệch ngang
                // để vẫn chia được chặng bằng những cảng xa hành lang nhưng tới được.
                feasible = FeasibleFrom(relaxedCandidates);
                usedRelaxed = feasible.Count > 0;
            }

            if (feasible.Count == 0)
            {
                plan.Warnings.Add(
                    $"Từ {(cursorCode ?? "vị trí hiện tại")} (còn {fuel:F1} t, tầm {reachNm:F0} NM) " +
                    $"không có cảng tiếp nhiên liệu nào trong tầm. " +
                    $"Còn {distToAnchorNm:F0} NM tới {nextAnchor.Name ?? "neo kế tiếp"} — " +
                    $"cần tăng sức chứa, giảm tốc độ hoặc bổ sung cảng.");
                break;
            }

            // Ưu tiên cảng có along-track lớn nhất nhưng không vượt quá điểm lý tưởng
            // (tức là tới nơi với nhiên liệu còn ≥ mức dự trữ, gần 20% nhất).
            var idealAlong = cursorAlong + idealLegNm;
            var pick = feasible
                .Where(f => f.AlongNm <= idealAlong)
                .OrderByDescending(f => f.AlongNm)
                .ThenBy(f => f.OffsetNm)
                .FirstOrDefault();

            if (pick.Port is null)
            {
                // Mọi cảng trong tầm đều nằm sau điểm lý tưởng → chọn cảng gần điểm lý tưởng nhất.
                pick = feasible
                    .OrderBy(f => Math.Abs(f.AlongNm - idealAlong))
                    .ThenBy(f => f.OffsetNm)
                    .First();
            }

            var bunkerLegNm = ResolveLegDistance(
                input, cursor, pick.Port.Position, pick.DistNm, cursorOffset, pick.OffsetNm);

            var leg = BuildLeg(
                sequence, cursor, pick.Port.Position,
                cursorCode, cursorName, pick.Port.Code, pick.Port.Name,
                bunkerLegNm, speed, clock,
                fuel, q, reserve, capacity, isBunkerStop: true, portOffsetNm: pick.OffsetNm,
                notes: $"Tiếp nhiên liệu tại {pick.Port.Name} (cách tuyến {pick.OffsetNm:F0} NM)"
                       + (usedRelaxed ? " [cảng xa hành lang — dùng để chia chặng]" : string.Empty));

            var bunkerTons = Math.Max(0.0, capacity - leg.FuelOnArrivalTons);
            leg.BunkerTons = bunkerTons;
            leg.StopKind = LegStopKind.Bunker;
            leg.Notes += $"; nạp {bunkerTons:F1} t lên {capacity:F0} t";

            plan.Legs.Add(leg);

            fuel = capacity;                     // nạp đầy
            clock = leg.ArrivalUtc.AddHours(o.PortStayHours);
            cursor = pick.Port.Position;
            cursorCode = pick.Port.Code;
            cursorName = pick.Port.Name;
            cursorAlong = pick.AlongNm;
            cursorOffset = pick.OffsetNm;
            usedPorts.Add(pick.Port.Code);
            sequence++;
        }

        if (sequence > input.MaxLegs && plan.Legs.Count > 0)
            plan.Warnings.Add($"Đã đạt giới hạn {input.MaxLegs} chặng, kế hoạch có thể chưa tới đích.");

        // 3) Tổng hợp.
        plan.TotalDistanceNm = plan.Legs.Sum(l => l.DistanceNm);
        plan.TotalFuelTons = plan.Legs.Sum(l => l.FuelConsumedTons);
        plan.TotalHours = plan.Legs.Sum(l => l.DurationHours)
                          + Math.Max(0, plan.Legs.Count(l => l.IsBunkerStop)) * o.PortStayHours;
        plan.FinalFuelTons = plan.Legs.Count > 0 ? plan.Legs[^1].FuelOnArrivalTons : o.CurrentFuelTons;
        plan.ArrivalUtc = plan.Legs.Count > 0 ? plan.Legs[^1].ArrivalUtc : input.DepartureUtc;

        var last = plan.Legs.LastOrDefault();
        if (last is not null && !IsSamePort(last.ToPortCode, input.GoalPortCode))
            plan.Warnings.Add("Kế hoạch chưa kết thúc tại cảng đích.");

        var goalsReached = last is not null && IsSamePort(last.ToPortCode, input.GoalPortCode);
        if (goalsReached && plan.FinalFuelTons < reserve)
            plan.Warnings.Add($"Nhiên liệu khi tới đích ({plan.FinalFuelTons:F1} t) thấp hơn mức dự trữ ({reserve:F1} t).");

        sw.Stop();
        plan.ElapsedMs = sw.ElapsedMilliseconds;

        _logger.LogInformation(
            "VoyageLegPlan: {Legs} chặng, {Dist:F0} NM, {Fuel:F1} t, {Hours:F0} h, q={Q:F4} t/NM, elapsedMs={Ms}",
            plan.Legs.Count, plan.TotalDistanceNm, plan.TotalFuelTons, plan.TotalHours, q, plan.ElapsedMs);

        return plan;
    }

    /// <summary>
    /// Khoảng cách chặng. Mặc định dùng ước lượng theo hành lang tuyến; nếu bật
    /// RefineLegDistances thì chạy lại A* trên chặng ngắn để có số liệu đường biển thực.
    /// </summary>
    private double ResolveLegDistance(
        VoyageLegPlanInput input,
        LatLon from,
        LatLon to,
        double corridorEstimateNm,
        double fromOffsetNm,
        double toOffsetNm)
    {
        if (!input.RefineLegDistances) return corridorEstimateNm;

        var straightNm = GeoMath.HaversineNm(from, to);
        if (straightNm > input.RefineMaxStraightNm) return corridorEstimateNm;

        try
        {
            var gridSize = Math.Clamp((int)Math.Ceiling(straightNm / 12.0) + 40, 60, 200);
            var grid = _gridBuilder.Build(from, to, NoHazardProvider.Instance, gridSize);
            var result = _aStar.FindPath(grid, _heuristicCost);
            if (result.Found && result.DistanceNm > 0)
                return result.DistanceNm;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Không tinh chỉnh được khoảng cách chặng bằng A*, dùng ước lượng hành lang.");
        }

        return corridorEstimateNm;
    }

    private static VoyageLegPlanLeg BuildLeg(
        int sequence,
        LatLon from, LatLon to,
        string? fromCode, string? fromName,
        string? toCode, string? toName,
        double distanceNm, double speedKts, DateTime departureUtc,
        double fuelOnDepartureTons, double tonsPerNm, double reserveTons, double capacityTons,
        bool isBunkerStop, double portOffsetNm, string? notes)
    {
        var durationHours = speedKts <= 0 ? 0 : distanceNm / speedKts;
        var consumed = distanceNm * tonsPerNm;
        var onArrival = Math.Max(0.0, fuelOnDepartureTons - consumed);

        return new VoyageLegPlanLeg
        {
            Sequence = sequence,
            FromPortCode = fromCode,
            FromPortName = fromName,
            ToPortCode = toCode,
            ToPortName = toName,
            FromLat = from.Lat,
            FromLon = GeoMath.WrapLon(from.Lon),
            ToLat = to.Lat,
            ToLon = GeoMath.WrapLon(to.Lon),
            DistanceNm = distanceNm,
            DurationHours = durationHours,
            AverageSpeedKts = speedKts,
            DepartureUtc = departureUtc,
            ArrivalUtc = departureUtc.AddHours(durationHours),
            FuelOnDepartureTons = fuelOnDepartureTons,
            FuelConsumedTons = consumed,
            FuelOnArrivalTons = onArrival,
            FuelOnArrivalPercent = capacityTons <= 0 ? 0 : onArrival / capacityTons * 100.0,
            IsBunkerStop = isBunkerStop,
            PortOffsetNm = portOffsetNm,
            Notes = notes
        };
    }

    private static bool IsSamePort(string? a, string? b) =>
        !string.IsNullOrWhiteSpace(a) && !string.IsNullOrWhiteSpace(b) &&
        string.Equals(a.Trim(), b.Trim(), StringComparison.OrdinalIgnoreCase);
}
