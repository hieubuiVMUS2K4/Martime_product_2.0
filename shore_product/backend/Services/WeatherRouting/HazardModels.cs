namespace ProductApi.Services.WeatherRouting;

/// <summary>
/// Một vùng thiên tai trên biển: tâm, bán kính ảnh hưởng và loại thiên tai.
/// Dùng chung cho (a) vẽ lên bản đồ và (b) chặn ô lưới để A* né.
/// </summary>
public sealed record HazardZone(
    string Id,
    string Type,
    string Name,
    LatLon Center,
    double RadiusNm,
    string Severity,
    string Source)
{
    public object ToDto() => new
    {
        id = Id,
        zoneType = "circle",
        hazardType = Type,
        name = Name,
        center = new { lat = Center.Lat, lon = Center.Lon },
        radiusNm = Math.Round(RadiusNm, 0),
        severity = Severity,
        source = Source,
        icon = HazardCatalog.Icon(Type),
        color = HazardCatalog.Color(Type),
        label = HazardCatalog.Label(Type)
    };
}

/// <summary>Danh mục các loại thiên tai trên biển (icon hiển thị ở tâm vòng tròn).</summary>
public static class HazardCatalog
{
    /// <summary>type, nhãn tiếng Việt, icon, màu, bán kính nhỏ nhất, lớn nhất (NM)</summary>
    public static readonly (string Type, string Label, string Icon, string Color, double MinNm, double MaxNm)[] All =
    [
        ("TYPHOON",        "Bão cuồng phong",   "🌀", "#dc2626", 90, 240),
        ("HURRICANE",      "Bão lớn (Đại Tây Dương)", "🌀", "#b91c1c", 100, 280),
        ("TROPICAL_STORM", "Bão nhiệt đới",     "🌧️", "#ea580c", 60, 160),
        ("GALE",           "Bão cấp / gió mạnh", "💨", "#ca8a04", 40, 110),
        ("HIGH_WAVES",     "Sóng lớn",          "🌊", "#0284c7", 50, 180),
        ("TSUNAMI",        "Sóng thần",         "🌊", "#0e7490", 60, 220),
        ("ICEBERG",        "Băng trôi",         "🧊", "#0ea5e9", 20, 70),
        ("VOLCANIC_ASH",   "Tro núi lửa",       "🌋", "#7c2d12", 40, 130),
        ("SEA_FOG",        "Sương mù dày",      "🌫️", "#64748b", 40, 140),
        ("PIRACY",         "Khu vực cướp biển",  "☠️", "#4b5563", 30, 90)
    ];

    public static string Icon(string type) => Lookup(type)?.Icon ?? "⚠️";
    public static string Color(string type) => Lookup(type)?.Color ?? "#dc2626";
    public static string Label(string type) => Lookup(type)?.Label ?? type;

    private static (string Type, string Label, string Icon, string Color, double MinNm, double MaxNm)? Lookup(string type)
    {
        foreach (var t in All)
            if (string.Equals(t.Type, type, StringComparison.OrdinalIgnoreCase)) return t;
        return null;
    }
}

/// <summary>
/// Sinh thiên tai demo (deterministic theo seed) rải dọc hành trình.
/// Dùng khi chưa có nguồn dữ liệu thời tiết thật: vẫn đủ loại thiên tai, đủ để
/// kiểm chứng việc A* né vùng bão.
/// </summary>
public static class DemoHazardGenerator
{
    /// <summary>
    /// Sinh <paramref name="count"/> vùng thiên tai quanh hành trình start → goal.
    /// Mỗi loại thiên tai được dùng ít nhất một lần khi count ≥ số loại.
    /// </summary>
    public static IReadOnlyList<HazardZone> Generate(
        int seed, int count, LatLon start, LatLon goal, double spreadNm = 900)
    {
        count = Math.Clamp(count, 0, 40);
        if (count == 0) return Array.Empty<HazardZone>();

        var rng = new Random(seed);
        var zones = new List<HazardZone>(count);

        var totalNm = GeoMath.HaversineNm(start, goal);
        var dLon = GeoMath.WrapLon(goal.Lon - start.Lon);

        for (var i = 0; i < count; i++)
        {
            // Lấy loại theo vòng để luôn đủ loại thiên tai.
            var spec = HazardCatalog.All[i % HazardCatalog.All.Length];

            // Vị trí: nội suy dọc hành trình rồi lệch ngang ngẫu nhiên.
            var t = 0.06 + rng.NextDouble() * 0.88;
            var lat = start.Lat + (goal.Lat - start.Lat) * t;
            var lon = start.Lon + dLon * t;

            var offsetNm = (rng.NextDouble() * 2.0 - 1.0) * spreadNm;
            const double nmPerDeg = 60.0;
            var cosLat = Math.Max(0.15, Math.Cos(lat * Math.PI / 180.0));
            // Lệch chủ yếu theo hướng vuông góc (vĩ độ) để chắn ngang hành trình.
            var latOffset = offsetNm * (0.55 + rng.NextDouble() * 0.45) / nmPerDeg;
            var lonOffset = offsetNm * (rng.NextDouble() - 0.5) / (nmPerDeg * cosLat);

            var center = new LatLon(
                Math.Clamp(lat + latOffset, -70, 75),
                GeoMath.WrapLon(lon + lonOffset));

            var radius = spec.MinNm + rng.NextDouble() * (spec.MaxNm - spec.MinNm);
            var severity = radius >= spec.MaxNm * 0.8 ? "Red"
                         : radius >= spec.MaxNm * 0.55 ? "Orange"
                         : "Green";

            zones.Add(new HazardZone(
                Id: $"demo-{seed}-{i}",
                Type: spec.Type,
                Name: $"{spec.Label} #{i + 1}",
                Center: center,
                RadiusNm: Math.Round(radius, 0),
                Severity: severity,
                Source: "DEMO"));
        }

        _ = totalNm;
        return zones;
    }

    /// <summary>
    /// Sinh thiên tai demo cho một hành trình, chia làm hai nhóm:
    ///  • Mỗi <paramref name="straddleEvery"/> vùng một (mặc định 1/4) đặt CHẮN NGANG tuyến —
    ///    để luôn có cái mà kiểm chứng việc né.
    ///  • Phần còn lại rải NGẪU NHIÊN trên vùng biển quanh hành trình — để bản đồ trông tự
    ///    nhiên thay vì dồn hết lên đường đi.
    ///
    /// Phải chia tỉ lệ vì hai yêu cầu xung đột nhau:
    ///  • Ngẫu nhiên hoàn toàn (theo đường thẳng start→goal): VNVUT→Le Havre, 28 vùng
    ///    ⇒ tuyến xuyên qua 0 vùng, vùng gần nhất cách 374 NM. Không kiểm chứng được gì.
    ///  • Dọc tuyến hoàn toàn: mọi vùng dồn quanh đường đi, trông giả tạo.
    /// </summary>
    public static IReadOnlyList<HazardZone> GenerateAlongRoute(
        IReadOnlyList<LatLon> route, int seed, int count,
        int straddleEvery = 4, double regionPadFraction = 0.25)
    {
        count = Math.Clamp(count, 0, 40);
        if (count == 0) return Array.Empty<HazardZone>();
        if (route.Count < 2)
            return Generate(seed, count, route[0], route[^1]);

        LandMask.EnsureLoaded();
        var rng = new Random(seed);
        var zones = new List<HazardZone>(count);
        var straddleCount = 0;

        var cum = new double[route.Count];
        for (var i = 1; i < route.Count; i++)
            cum[i] = cum[i - 1] + GeoMath.HaversineNm(route[i - 1], route[i]);
        var total = cum[^1];
        if (total < 1.0) return Generate(seed, count, route[0], route[^1]);

        // Vùng biển để rải ngẫu nhiên: khung bao hành trình, nới thêm mỗi chiều.
        var baseLon = route[0].Lon;
        var bbMinLat = route[0].Lat;
        var bbMaxLat = route[0].Lat;
        var bbMinLon = 0.0;
        var bbMaxLon = 0.0;
        for (var i = 0; i < route.Count; i++)
        {
            var lonU = GeoMath.UnwrapShortestLon(baseLon, route[i].Lon);
            while (lonU - baseLon > 180.0) lonU -= 360.0;
            while (lonU - baseLon < -180.0) lonU += 360.0;

            if (i == 0) { bbMinLon = lonU; bbMaxLon = lonU; }
            bbMinLat = Math.Min(bbMinLat, route[i].Lat);
            bbMaxLat = Math.Max(bbMaxLat, route[i].Lat);
            bbMinLon = Math.Min(bbMinLon, lonU);
            bbMaxLon = Math.Max(bbMaxLon, lonU);
        }

        var padLat = Math.Max(6.0, (bbMaxLat - bbMinLat) * regionPadFraction);
        var padLon = Math.Max(6.0, (bbMaxLon - bbMinLon) * regionPadFraction);
        bbMinLat = Math.Max(-70.0, bbMinLat - padLat);
        bbMaxLat = Math.Min(75.0, bbMaxLat + padLat);
        bbMinLon -= padLon;
        bbMaxLon += padLon;

        for (var i = 0; i < count; i++)
        {
            var spec = HazardCatalog.All[i % HazardCatalog.All.Length];
            var radius = spec.MinNm + rng.NextDouble() * (spec.MaxNm - spec.MinNm);
            var straddle = straddleEvery > 0 && i % straddleEvery == 0;

            LatLon center;
            if (straddle)
            {
                // Đặt tại một mốc dọc tuyến rồi lệch ngang để chắn ngang đường đi.
                // Rải đều dọc tuyến (kèm chút nhiễu) để các vùng không dồn cục một chỗ.
                var t = (i + 0.5) / count + (rng.NextDouble() - 0.5) / count;
                t = Math.Clamp(t, 0.04, 0.96);
                var (p, nx, ny, cosLat) = PointAndNormal(route, cum, t * total);

                // Lệch luôn phiên hai phía để tuyến luồn hình chữ chi. Nếu phía chọn là đất
                // thì đổi phía; nếu cả hai phía đều là đất (eo hẹp: Gibraltar, eo Anh) thì
                // thôi không chắn ngang — chắn ở đó khoá hết lối đi, A* thất bại và tuyến
                // buộc phải đi xuyên qua vùng thiên tai (từng xuyên sâu 48/80 NM ở Gibraltar).
                var dir = ++straddleCount % 2 == 1 ? 1.0 : -1.0;
                if (!HasRoomToPass(p, nx, ny, cosLat, radius, dir)) dir = -dir;

                center = HasRoomToPass(p, nx, ny, cosLat, radius, dir)
                    ? Offset(p, nx, ny, dir * (0.45 + rng.NextDouble() * 0.35) * radius, cosLat)
                    : RandomOceanPoint(rng, radius, bbMinLat, bbMaxLat, bbMinLon, bbMaxLon);
            }
            else
            {
                center = RandomOceanPoint(rng, radius, bbMinLat, bbMaxLat, bbMinLon, bbMaxLon);
            }

            var severity = radius >= spec.MaxNm * 0.8 ? "Red"
                         : radius >= spec.MaxNm * 0.55 ? "Orange"
                         : "Green";

            zones.Add(new HazardZone(
                Id: $"route-{seed}-{i}",
                Type: spec.Type,
                Name: $"{spec.Label} #{i + 1}",
                Center: center,
                RadiusNm: Math.Round(radius, 0),
                Severity: severity,
                Source: "DEMO"));
        }

        return zones;
    }

    /// <summary>
    /// Điểm ngẫu nhiên trên biển trong khung cho trước. Bỏ qua hai loại vị trí:
    ///  • Trên đất liền — vô nghĩa và không thấy được trên bản đồ.
    ///  • Trong eo/luồng hẹp — đặt một vùng bán kính R vào đó là khoá kín lối đi, A* không còn
    ///    đường vòng nào và cả job thất bại với "No path around hazards". Kiểm tra bằng cách dò
    ///    8 hướng ở khoảng cách R + 80 NM: biển mở thì mọi hướng đều là nước, còn luồng hẹp chỉ
    ///    hở đúng hai hướng dọc luồng.
    /// </summary>
    private static LatLon RandomOceanPoint(
        Random rng, double radiusNm, double minLat, double maxLat, double minLon, double maxLon)
    {
        var p = new LatLon(minLat, minLon);
        for (var attempt = 0; attempt < 60; attempt++)
        {
            p = new LatLon(
                minLat + rng.NextDouble() * (maxLat - minLat),
                GeoMath.WrapLon(minLon + rng.NextDouble() * (maxLon - minLon)));

            if (LandMask.IsBlockedLand(p)) continue;
            if (OpenDirections(p, radiusNm) >= 5) return p;
        }
        return p;
    }

    /// <summary>Số hướng (trong 8 hướng la bàn) còn biển ở khoảng cách bán kính + 80 NM.</summary>
    private static int OpenDirections(LatLon p, double radiusNm)
    {
        var d = radiusNm + 80.0;
        var cosLat = Math.Max(0.15, Math.Cos(p.Lat * Math.PI / 180.0));
        var dLat = d / 60.0;
        var dLon = d / (60.0 * cosLat);
        var open = 0;

        for (var k = 0; k < 8; k++)
        {
            var ang = k * Math.PI / 4.0;
            var probe = new LatLon(
                Math.Clamp(p.Lat + Math.Cos(ang) * dLat, -70.0, 75.0),
                GeoMath.WrapLon(p.Lon + Math.Sin(ang) * dLon));

            if (!LandMask.IsBlockedLand(probe)) open++;
        }

        return open;
    }

    /// <summary>
    /// Còn chỗ để vòng qua vùng thiên tai không: dò vài mốc lệch sang phía <paramref name="dir"/>
    /// xa hơn bán kính vùng xem có phải là nước không. Dùng để tránh đặt vùng chắn ngang ở eo hẹp.
    /// </summary>
    private static bool HasRoomToPass(LatLon p, double nx, double ny, double cosLat, double radiusNm, double dir)
    {
        foreach (var extra in new[] { 60.0, 140.0, 240.0 })
        {
            var probe = Offset(p, nx, ny, dir * (radiusNm + extra), cosLat);
            if (!LandMask.IsBlockedLand(probe)) return true;
        }
        return false;
    }

    /// <summary>Điểm tại khoảng cách dọc tuyến, kèm vector pháp tuyến đơn vị (mặt phẳng NM).</summary>
    private static (LatLon Point, double Nx, double Ny, double CosLat) PointAndNormal(
        IReadOnlyList<LatLon> route, double[] cum, double d)
    {
        var seg = route.Count - 2;
        for (var i = 0; i < route.Count - 1; i++)
        {
            if (d <= cum[i + 1]) { seg = i; break; }
        }

        var a = route[seg];
        var b = route[seg + 1];
        var segNm = cum[seg + 1] - cum[seg];
        var f = segNm <= 1e-9 ? 0.0 : Math.Clamp((d - cum[seg]) / segNm, 0.0, 1.0);

        var lat = a.Lat + (b.Lat - a.Lat) * f;
        var lon = a.Lon + GeoMath.WrapLon(b.Lon - a.Lon) * f;
        var cosLat = Math.Max(0.15, Math.Cos(lat * Math.PI / 180.0));

        var tx = GeoMath.WrapLon(b.Lon - a.Lon) * cosLat * 60.0;
        var ty = (b.Lat - a.Lat) * 60.0;
        var len = Math.Sqrt(tx * tx + ty * ty);
        var point = new LatLon(lat, GeoMath.WrapLon(lon));

        return len <= 1e-9
            ? (point, 1.0, 0.0, cosLat)
            : (point, -ty / len, tx / len, cosLat);
    }

    private static LatLon Offset(LatLon p, double nx, double ny, double lateralNm, double cosLat) =>
        new(Math.Clamp(p.Lat + ny * lateralNm / 60.0, -70, 75),
            GeoMath.WrapLon(p.Lon + nx * lateralNm / (60.0 * cosLat)));
}

/// <summary>
/// Sinh thiên tai demo cho một hành trình — DÙNG CHUNG cho cả ba nơi:
/// <c>GET /hazards</c> (vẽ lên bản đồ), <c>POST /jobs</c> (tối ưu tuyến) và
/// <c>POST /plan-legs</c> (né thiên tai khi chia chặng).
///
/// Bắt buộc dùng chung: trước đây mỗi nơi sinh một kiểu nên bản đồ hiển thị một đằng
/// mà tuyến né một nẻo. Cùng start/goal + cùng seed ⇒ cùng tập vùng.
/// </summary>
public static class VoyageHazardPlanner
{
    /// <summary>Cỡ lưới A* khi dựng trục rải thiên tai (khớp CorridorGridSize của service).</summary>
    public const int CorridorGridSize = 160;

    public static IReadOnlyList<HazardZone> Generate(
        IGridBuilder gridBuilder, IAstStarRouter aStar, IHeuristicCost cost,
        LatLon start, LatLon goal, int seed, int count)
        => DemoHazardGenerator.GenerateAlongRoute(
            BuildCorridor(gridBuilder, aStar, cost, start, goal), seed, count);

    /// <summary>Hành lang A* nối start→goal (không thiên tai) — dùng làm trục rải thiên tai.</summary>
    public static IReadOnlyList<LatLon> BuildCorridor(
        IGridBuilder gridBuilder, IAstStarRouter aStar, IHeuristicCost cost,
        LatLon start, LatLon goal)
    {
        try
        {
            var grid = gridBuilder.Build(start, goal, NoHazardProvider.Instance, CorridorGridSize);
            var result = aStar.FindPath(grid, cost);
            if (result.Found && result.Waypoints.Count >= 2)
            {
                var pts = result.Waypoints.ToList();
                pts[0] = start;
                pts[^1] = goal;
                return PathSanitizer.Sanitize(pts);
            }
        }
        catch
        {
            // Không dựng được hành lang thì rơi về đường thẳng.
        }

        return new List<LatLon> { start, goal };
    }
}

/// <summary>Hazard provider dựa trên danh sách vùng thiên tai (nhiều vùng, nhiều loại).</summary>
public sealed class ZoneHazardProvider : IHazardProvider
{
    private readonly List<HazardZone> _zones;

    public ZoneHazardProvider(IEnumerable<HazardZone> zones) => _zones = zones.ToList();

    public IReadOnlyList<HazardZone> Zones => _zones;

    public bool IsBlocked(LatLon point)
    {
        foreach (var z in _zones)
        {
            if (GeoMath.HaversineNm(point, z.Center) <= z.RadiusNm) return true;
        }
        return false;
    }

    public IReadOnlyList<object> DescribeHazards() => _zones.Select(z => z.ToDto()).ToList();

    public IReadOnlyList<LatLon> InfluencePoints() => _zones.Select(z => z.Center).ToList();
}
