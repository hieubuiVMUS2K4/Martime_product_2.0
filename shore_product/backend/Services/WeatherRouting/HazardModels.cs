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
    /// Vị trí CỐ ĐỊNH trên bản đồ, kèm loại thiên tai. Không random runtime, không seed, không phụ
    /// thuộc cảng đi / cảng đến. Toạ độ ghi thẳng ở đây, chạy bao nhiêu lần cũng ra đúng bằng đấy chỗ.
    ///
    /// Rải khắp các đại dương để nhìn bản đồ không dồn cục; thêm một số vùng nằm trên các tuyến hay
    /// đi (Biển Đông, vịnh Bengal, biển Ả Rập, Địa Trung Hải, Caribe, Bắc Thái Bình Dương) để thấy
    /// rõ A* vòng tránh. Không đặt ở eo hẹp (Malacca, Biển Đỏ, Gibraltar): chắn ở đó là bịt kín lối.
    /// Mọi tâm vùng phải nằm trên biển và còn chỗ vòng qua — xem test HazardFixedZonesTests.
    /// </summary>
    private static readonly (double Lat, double Lon, string Type)[] FixedZonePositions =
    [
        // Bắc Đại Tây Dương + Caribe
        (  58.0,  -30.0, "ICEBERG"),
        (  45.0,  -45.0, "SEA_FOG"),
        (  35.0,  -60.0, "HURRICANE"),
        (  28.0,  -25.0, "GALE"),
        (  15.0,  -40.0, "HURRICANE"),
        (  22.0,  -50.0, "HIGH_WAVES"),       // tuyến Gibraltar → Caribe
        (  14.5,  -76.0, "GALE"),             // tuyến vào Colón (Panama)
        // Nam Đại Tây Dương + vịnh Guinea
        (   2.0,    4.0, "PIRACY"),
        (  -5.0,  -22.0, "TSUNAMI"),
        ( -20.0,  -10.0, "HIGH_WAVES"),
        ( -35.0,  -30.0, "GALE"),
        ( -48.0,  -45.0, "HIGH_WAVES"),
        ( -30.0,    5.0, "SEA_FOG"),
        // Địa Trung Hải
        (  34.5,   20.0, "SEA_FOG"),          // tuyến Suez → Gibraltar
        // Ấn Độ Dương
        (  15.0,   62.0, "TROPICAL_STORM"),
        (   9.0,   64.0, "PIRACY"),           // tuyến Sri Lanka → vịnh Aden
        (   5.0,   86.0, "TROPICAL_STORM"),   // tuyến Malacca → Sri Lanka
        (   0.0,   75.0, "HIGH_WAVES"),
        ( -15.0,   88.0, "TYPHOON"),
        ( -32.0,   68.0, "GALE"),
        ( -45.0,   85.0, "HIGH_WAVES"),
        // Tây Thái Bình Dương / Biển Đông
        (  14.0,  114.5, "TYPHOON"),          // Biển Đông
        (  20.0,  132.0, "TYPHOON"),
        (  30.5,  135.0, "HIGH_WAVES"),       // tuyến Đài Loan → Tokyo
        (  35.0,  145.0, "TSUNAMI"),
        (   2.0,  155.0, "TROPICAL_STORM"),
        ( -18.0,  172.0, "VOLCANIC_ASH"),
        ( -40.0,  158.0, "GALE"),
        // Bắc + Đông Thái Bình Dương
        (  46.0, -178.0, "GALE"),             // tuyến Tokyo → Seattle
        (  40.0, -150.0, "HIGH_WAVES"),
        (  22.0, -135.0, "TROPICAL_STORM"),
        (   5.0, -115.0, "HURRICANE"),
        ( -12.0, -100.0, "TSUNAMI"),
        ( -30.0, -125.0, "SEA_FOG"),
        // Vĩ độ cao
        (  67.0,   -5.0, "ICEBERG"),
        (  57.0, -178.0, "VOLCANIC_ASH"),
        ( -55.0,   40.0, "ICEBERG"),
        ( -58.0,  -80.0, "ICEBERG"),
        ( -50.0,  120.0, "HIGH_WAVES")
    ];

    /// <summary>Số vùng thiên tai cố định.</summary>
    public static int FixedZoneCount => FixedZonePositions.Length;

    /// <summary>
    /// Các vùng ở vị trí cố định trong <see cref="FixedZonePositions"/>. Không tham số.
    /// </summary>
    public static IReadOnlyList<HazardZone> FixedZones()
    {
        var zones = new List<HazardZone>(FixedZonePositions.Length);

        for (var i = 0; i < FixedZonePositions.Length; i++)
        {
            var (lat, lon, type) = FixedZonePositions[i];
            var spec = HazardCatalog.All.First(t => t.Type == type);

            // Bán kính cố định theo loại: lấy giữa dải min–max để khỏi phụ thuộc random.
            var radius = (spec.MinNm + spec.MaxNm) * 0.5;

            var severity = radius >= spec.MaxNm * 0.8 ? "Red"
                         : radius >= spec.MaxNm * 0.55 ? "Orange"
                         : "Green";

            zones.Add(new HazardZone(
                Id: $"fixed-{i}",
                Type: spec.Type,
                Name: $"{spec.Label} #{i + 1}",
                Center: new LatLon(lat, lon),
                RadiusNm: Math.Round(radius, 0),
                Severity: severity,
                Source: "DEMO"));
        }

        return zones;
    }

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

        // Pad phải tính theo CHIỀU DÀI HÀNH TRÌNH, không theo riêng chiều cao hộp.
        //
        // Tuyến đông–tây có chiều cao hộp gần bằng 0 (Chattogram 22.34°N → Thâm Quyến 22.48°N,
        // chênh 0.15°), nên pad tối thiểu 6° cho ra một dải ngang mỏng dính 16°–28°. Dải đó
        // gần như toàn đất: Ấn Độ, Myanmar, Thái Lan, Nam Trung Quốc. RandomOceanPoint loại hết
        // điểm trên đất nên thiên tai chỉ còn đẻ được ở đúng hai vũng nước cạnh hai cảng —
        // đổi seed bao nhiêu lần cũng vẫn nằm đè lên cảng.
        //
        // Lấy cạnh dài nhất của hộp làm thước cho CẢ HAI chiều thì vùng rải mới ra hình vuông
        // phủ được biển thật quanh tuyến.
        var span = Math.Max(bbMaxLat - bbMinLat, bbMaxLon - bbMinLon);
        var padLat = Math.Max(12.0, span * regionPadFraction);
        var padLon = Math.Max(8.0, span * regionPadFraction);
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

    /// <summary>
    /// Thiên tai ở vị trí CỐ ĐỊNH (<see cref="DemoHazardGenerator.FixedZones"/>), không bám theo
    /// đường đi, không phụ thuộc cảng đi / cảng đến.
    ///
    /// Trước đây hàm này dựng trước một hành lang A* rồi cố tình đặt vùng CHẮN NGANG tuyến.
    /// Làm thế thì thiên tai luôn nằm đúng chỗ tàu phải đi, và ở các hành lang hẹp
    /// (Malacca, vịnh Bengal, cửa vịnh Thâm Quyến) nó bịt kín lối — A* không còn đường nào,
    /// job Failed, bản đồ trắng. Thiên tai thật không mọc theo tuyến của tàu.
    /// </summary>
    public static IReadOnlyList<HazardZone> Generate() => DemoHazardGenerator.FixedZones();

    /// <summary>Mỗi bước thời tiết là bấy nhiêu giờ dự báo.</summary>
    public const double WeatherStepHours = 24.0;

    /// <summary>
    /// Trường thiên tai tại BƯỚC THỜI TIẾT <paramref name="step"/> (0 = bản đồ gốc, mỗi bước
    /// +<see cref="WeatherStepHours"/> giờ). Đây là "luồng dữ liệu thời tiết cập nhật" cho việc
    /// lập lại kế hoạch: mỗi lần replan, bão di chuyển và đổi cường độ nên kết luận cũ về tuyến
    /// tối ưu có thể bị huỷ (suy lý không đơn điệu).
    ///
    /// Tất định: cùng một bước luôn ra cùng một tập vùng, nên bản đồ và tuyến luôn khớp nhau.
    /// Chuyển động theo loại, lấy theo quy luật khí tượng phổ biến (không phải dự báo thật):
    ///  • Bão (typhoon/hurricane/tropical storm): ~10 kn về tây-tây bắc (bắc bán cầu) hoặc
    ///    tây-tây nam (nam bán cầu) — hướng dịch chuyển điển hình trong đới gió mậu dịch.
    ///  • Gió mạnh / sóng lớn: theo gió tây ở vĩ độ trung bình (~18 kn về đông), theo gió mậu dịch
    ///    ở vùng nhiệt đới (~12 kn về tây).
    ///  • Băng trôi dạt về phía xích đạo ~3 kn; tro núi lửa theo gió ~8 kn về đông; sương mù trôi chậm.
    ///  • Cướp biển, sóng thần: đứng yên.
    /// Bán kính dao động theo thời gian (mạnh lên / yếu đi). Vùng trôi vào đất liền coi như tan
    /// (bão đổ bộ suy yếu) và bị bỏ khỏi trường.
    /// </summary>
    public static IReadOnlyList<HazardZone> Generate(int step)
    {
        var baseZones = DemoHazardGenerator.FixedZones();
        if (step <= 0) return baseZones;

        LandMask.EnsureLoaded();
        var hours = step * WeatherStepHours;
        var zones = new List<HazardZone>(baseZones.Count);

        for (var i = 0; i < baseZones.Count; i++)
        {
            var z = baseZones[i];
            var (speedKts, bearingDeg, pulse) = Motion(z, i);

            var center = Move(z.Center, bearingDeg, speedKts * hours);
            if (LandMask.IsBlockedLand(center)) continue;   // đổ bộ ⇒ tan

            // Pha lệch theo chỉ số để các vùng không cùng mạnh lên/yếu đi một lúc.
            var scale = 1.0 + pulse * Math.Sin(step * 0.9 + i * 1.7);
            var radius = Math.Round(z.RadiusNm * scale, 0);

            zones.Add(z with
            {
                Id = $"{z.Id}-t{step}",
                Center = center,
                RadiusNm = radius
            });
        }

        return zones;
    }

    /// <summary>(tốc độ kn, hướng di chuyển độ, biên độ dao động bán kính) theo loại thiên tai.</summary>
    private static (double SpeedKts, double BearingDeg, double Pulse) Motion(HazardZone z, int index)
    {
        var north = z.Center.Lat >= 0;
        var midLatitude = Math.Abs(z.Center.Lat) >= 25;

        return z.Type.ToUpperInvariant() switch
        {
            "TYPHOON" or "HURRICANE" or "TROPICAL_STORM" => (10.0, north ? 300.0 : 240.0, 0.15),
            "GALE" or "HIGH_WAVES" => midLatitude ? (18.0, 90.0, 0.20) : (12.0, 270.0, 0.20),
            "ICEBERG" => (3.0, north ? 180.0 : 0.0, 0.10),
            "VOLCANIC_ASH" => (8.0, 90.0, 0.25),
            "SEA_FOG" => (5.0, index * 67 % 360, 0.25),
            _ => (0.0, 0.0, 0.0)   // PIRACY, TSUNAMI: đứng yên
        };
    }

    /// <summary>Dịch điểm theo hướng và quãng đường (NM) — xấp xỉ phẳng, đủ cho vài trăm NM.</summary>
    private static LatLon Move(LatLon p, double bearingDeg, double distNm)
    {
        if (distNm <= 0) return p;
        var rad = bearingDeg * Math.PI / 180.0;
        var lat = p.Lat + Math.Cos(rad) * distNm / 60.0;
        var cosLat = Math.Max(0.15, Math.Cos(p.Lat * Math.PI / 180.0));
        var lon = p.Lon + Math.Sin(rad) * distNm / (60.0 * cosLat);
        return new LatLon(Math.Clamp(lat, -70.0, 75.0), GeoMath.WrapLon(lon));
    }

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

    /// <summary>
    /// Trường sóng/gió suy ra từ chính các vùng này (xem <see cref="HazardWeatherField"/>).
    /// Vùng bên trong vẫn bị chặn cứng bởi <see cref="IsBlocked"/>; trường này mô tả vành
    /// ảnh hưởng bên ngoài — nơi tàu đi được nhưng tốn thêm nhiên liệu.
    /// </summary>
    public (double WaveM, double WindMs, double WaveBearingDeg) WeatherAt(LatLon point) =>
        HazardWeatherField.Sample(_zones, point);

    public IReadOnlyList<object> DescribeHazards() => _zones.Select(z => z.ToDto()).ToList();

    public IReadOnlyList<LatLon> InfluencePoints() => _zones.Select(z => z.Center).ToList();
}

/// <summary>
/// Vùng thiên tai ở chế độ MỀM: không cấm đi, chỉ rất đắt.
///
/// Dùng khi né cứng làm mất hết lối đi. Với hành lang hẹp (Malacca, vịnh Bengal, Gibraltar),
/// vài vùng bán kính lớn đủ nối thành tường kín — A* duyệt hết lưới rồi trả về "No path around
/// hazards", tức là bộ tìm đường không trả ra đường nào cả. Đó là kết quả vô dụng: thực tế tàu
/// vẫn phải đi, chỉ là đi qua chỗ xấu.
///
/// Ở chế độ này <see cref="IsBlocked"/> luôn false nên đồ thị không bao giờ bị chia cắt bởi
/// thiên tai (chỉ còn đất liền chia cắt), trong khi trường sóng/gió vẫn nguyên vẹn — nên chi phí
/// nhiên liệu qua vùng bão vẫn cao gấp bội và A* vẫn tự vòng tránh CHỪNG NÀO CÒN VÒNG ĐƯỢC.
/// Hết đường vòng thì nó xuyên qua chỗ nhẹ nhất thay vì bó tay.
/// </summary>
public sealed class SoftZoneHazardProvider : IHazardProvider
{
    private readonly List<HazardZone> _zones;

    public SoftZoneHazardProvider(IEnumerable<HazardZone> zones) => _zones = zones.ToList();

    /// <summary>Vẫn công bố danh sách vùng để lưới cấp phát trường sóng/gió.</summary>
    public IReadOnlyList<HazardZone> Zones => _zones;

    /// <summary>Không cấm gì — đây là toàn bộ điểm khác biệt so với <see cref="ZoneHazardProvider"/>.</summary>
    public bool IsBlocked(LatLon point) => false;

    public (double WaveM, double WindMs, double WaveBearingDeg) WeatherAt(LatLon point) =>
        HazardWeatherField.Sample(_zones, point);

    public IReadOnlyList<object> DescribeHazards() => _zones.Select(z => z.ToDto()).ToList();

    public IReadOnlyList<LatLon> InfluencePoints() => _zones.Select(z => z.Center).ToList();
}
