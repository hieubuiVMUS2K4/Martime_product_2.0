namespace ProductApi.Services.WeatherRouting;

public readonly record struct LatLon(double Lat, double Lon);

public readonly record struct GridCell(int Row, int Col);

public sealed class RoutingGrid
{
    public required int Rows { get; init; }
    public required int Cols { get; init; }
    public required double MinLat { get; init; }
    public required double MaxLat { get; init; }
    /// <summary>May be unwrapped east of start (e.g. goalLon+360) for Pacific crossings.</summary>
    public required double MinLon { get; init; }
    public required double MaxLon { get; init; }
    public required bool[,] Blocked { get; init; }
    public required GridCell Start { get; init; }
    public required GridCell Goal { get; init; }

    /// <summary>
    /// Trường thời tiết gắn vào từng NÚT của lưới: độ cao sóng (m), tốc độ gió (m/s)
    /// và hướng sóng truyền tới (độ, 0 = bắc).
    ///
    /// Tách thành ba mảng song song thay vì một mảng struct để tránh sinh rác khi A*
    /// đọc hàng trăm nghìn lượt, và để lưới không có thời tiết chỉ tốn ba con trỏ null.
    /// Null = không có dữ liệu thời tiết ⇒ <see cref="WeatherAt"/> trả về 0 và chi phí
    /// rút về đúng quãng đường.
    /// </summary>
    public double[,]? WaveM { get; init; }

    public double[,]? WindMs { get; init; }

    public double[,]? WaveBearingDeg { get; init; }

    /// <summary>Thời tiết tại một ô. Trả (0,0,0) nếu lưới được dựng không kèm thời tiết.</summary>
    public (double WaveM, double WindMs, double WaveBearingDeg) WeatherAt(GridCell c)
    {
        if (WaveM is null || !InBounds(c)) return (0.0, 0.0, 0.0);
        return (WaveM[c.Row, c.Col],
                WindMs?[c.Row, c.Col] ?? 0.0,
                WaveBearingDeg?[c.Row, c.Col] ?? 0.0);
    }

    /// <summary>
    /// Ô nằm sát đất (lân cận 8 hướng có ô bị chặn). Cạnh nối hai ô đều KHÔNG gần đất
    /// chắc chắn không cắt bờ, nên bỏ qua kiểm tra để tiết kiệm CPU.
    /// </summary>
    public bool[,]? NearLand { get; init; }

    /// <summary>Ô có nằm sát đất không (false nếu lưới không cung cấp mask).</summary>
    public bool IsNearLand(GridCell c) =>
        NearLand is not null && c.Row >= 0 && c.Row < Rows && c.Col >= 0 && c.Col < Cols && NearLand[c.Row, c.Col];

    /// <summary>
    /// Vùng thiên tai — kiểm tra cạnh cắt GIỐNG NHƯ ĐẤT LIỀN.
    /// Trước đây thiên tai chỉ chặn ở mức TÂM Ô, nên một cạnh nối hai tâm ô đều nằm ngoài
    /// vòng tròn vẫn chui thẳng qua nó — đường vẽ ra cắt ngang vùng bão dù A* “đã né”.
    /// </summary>
    public IHazardProvider Hazards { get; init; } = NoHazardProvider.Instance;

    /// <summary>
    /// Đoạn a→b có cắt vùng thiên tai nào không. Lấy mẫu dày như khi dò cắt đất.
    /// </summary>
    public bool SegmentCrossesHazard(LatLon a, LatLon b, double spacingNm)
    {
        var distNm = GeoMath.HaversineNm(a, b);
        if (distNm < 1e-6) return false;

        var samples = Math.Clamp((int)Math.Ceiling(distNm / Math.Max(2.0, spacingNm)), 1, 64);
        for (var i = 1; i <= samples; i++)
        {
            var t = (double)i / (samples + 1);
            var p = new LatLon(a.Lat + (b.Lat - a.Lat) * t, a.Lon + (b.Lon - a.Lon) * t);
            if (Hazards.IsBlocked(p)) return true;
        }

        return false;
    }

    /// <summary>
    /// Độ nới rộng hành lang kênh/eo (đọ) đã dùng khi dựng lưới. A* phải dùng CÙNG giá trị
    /// khi kiểm tra cạnh cắt đất, nếu không sẽ xuất hiện "tường ảo" tại eo hẹp.
    /// </summary>
    public double CorridorDilationDeg { get; init; }

    /// <summary>
    /// Cell center in grid lon space (unwrapped). Do not WrapLon here â€” edge land tests
    /// and Haversine need continuous lon along eastbound routes.
    /// </summary>
    public LatLon CellToLatLon(GridCell cell)
    {
        var lat = Rows <= 1 ? MinLat : MinLat + (MaxLat - MinLat) * cell.Row / (Rows - 1);
        var lon = Cols <= 1 ? MinLon : MinLon + (MaxLon - MinLon) * cell.Col / (Cols - 1);
        return new LatLon(lat, lon);
    }

    public bool InBounds(GridCell c) =>
        c.Row >= 0 && c.Row < Rows && c.Col >= 0 && c.Col < Cols;

    /// <summary>Ô chứa toạ độ cho trước (nghịch đảo của <see cref="CellToLatLon"/>).</summary>
    public GridCell LatLonToCell(LatLon p)
    {
        var latSpan = MaxLat - MinLat;
        var lonSpan = MaxLon - MinLon;
        var lon = MinLon + GeoMath.WrapLon(p.Lon - MinLon);
        var r = Rows <= 1 || latSpan <= 1e-12 ? 0 : (int)Math.Round((p.Lat - MinLat) / latSpan * (Rows - 1));
        var c = Cols <= 1 || lonSpan <= 1e-12 ? 0 : (int)Math.Round((lon - MinLon) / lonSpan * (Cols - 1));
        return new GridCell(Math.Clamp(r, 0, Rows - 1), Math.Clamp(c, 0, Cols - 1));
    }

    public bool IsPassable(GridCell c) =>
        InBounds(c) && !Blocked[c.Row, c.Col];
}

public sealed class RouteResult
{
    public required bool Found { get; init; }
    public required IReadOnlyList<LatLon> Waypoints { get; init; }
    /// <summary>
    /// Tổng chi phí theo ĐÚNG đơn vị của hàm đánh giá đã dùng — tấn nhiên liệu với
    /// <see cref="WeatherFuelCost"/>, hải lý với <see cref="HeuristicCost"/>.
    /// Không so sánh trực tiếp giá trị này giữa hai tuyến trừ khi chắc chắn cùng một hàm chi phí;
    /// để đối chiếu hãy dùng <see cref="WeatherFuelCost.PolylineFuelTons"/>.
    /// </summary>
    public required double PathCost { get; init; }
    public required double DistanceNm { get; init; }
    public required int ExploredCells { get; init; }
    public required int CellCount { get; init; }
    public string? FailureReason { get; init; }
}

public static class GeoMath
{
    public const double EarthRadiusNm = 3440.065;

    public static double WrapLon(double lon)
    {
        while (lon > 180.0) lon -= 360.0;
        while (lon < -180.0) lon += 360.0;
        return lon;
    }

    public static double UnwrapEastboundLon(double startLon, double goalLon) =>
        goalLon < startLon ? goalLon + 360.0 : goalLon;

    /// <summary>
    /// Đưa kinh độ đích về phía NGẮN NHẤT so với kinh độ xuất phát (có thể về phía tây).
    /// Dùng cho lưới A*: nếu luôn ép về phía đông thì mọi hành trình đi tây (ví dụ
    /// Vũng Tàu → Chennai qua Malacca) sẽ bị bẻ vòng quanh Trái Đất.
    /// </summary>
    public static double UnwrapShortestLon(double startLon, double goalLon) =>
        startLon + WrapLon(goalLon - startLon);

    public static double HaversineNm(LatLon a, LatLon b)
    {
        static double Rad(double deg) => deg * Math.PI / 180.0;
        var dLat = Rad(b.Lat - a.Lat);
        var dLon = Rad(WrapLon(b.Lon - a.Lon));
        var lat1 = Rad(a.Lat);
        var lat2 = Rad(b.Lat);
        var h = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(lat1) * Math.Cos(lat2) *
                Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return 2 * EarthRadiusNm * Math.Asin(Math.Min(1.0, Math.Sqrt(h)));
    }

    public static double PathLengthNm(IReadOnlyList<LatLon> pts)
    {
        double sum = 0;
        for (var i = 1; i < pts.Count; i++)
            sum += HaversineNm(pts[i - 1], pts[i]);
        return sum;
    }
}

public static class WeatherRoutingDemoDefaults
{
    public static readonly LatLon Start = new(10.346, 107.084); // Vung Tau, VN
    public static readonly LatLon Goal = new(9.359, -79.901);   // Colon / Panama
    public static readonly LatLon MockStormCenter = new(12.0, -160.0);
    public const double DefaultStormRadiusNm = 250.0;
    public const int DefaultGridSize = 160;
    public const int MinGridSize = 50;
    public const int MaxGridSize = 200;
}

