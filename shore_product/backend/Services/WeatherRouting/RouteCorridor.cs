namespace ProductApi.Services.WeatherRouting;

/// <summary>Vị trí một điểm so với hành lang tuyến: khoảng cách dọc tuyến + độ lệch ngang.</summary>
public readonly record struct CorridorProjection(double AlongTrackNm, double OffsetNm);

/// <summary>
/// Hành lang tuyến biển (polyline lấy từ A*) + phép chiếu một điểm (cảng) lên tuyến.
/// Dùng để (a) chọn cảng tiếp nhiên liệu "gần tuyến", (b) quy đổi vị trí cảng thành
/// khoảng cách dọc tuyến để chia chặng.
/// </summary>
public sealed class RouteCorridor
{
    private readonly List<LatLon> _points;
    private readonly double[] _cumulativeNm;

    private RouteCorridor(List<LatLon> points, double[] cumulativeNm)
    {
        _points = points;
        _cumulativeNm = cumulativeNm;
    }

    public IReadOnlyList<LatLon> Points => _points;

    /// <summary>Tổng chiều dài đường biển của tuyến (NM).</summary>
    public double TotalNm => _cumulativeNm[^1];

    public LatLon Start => _points[0];
    public LatLon Goal => _points[^1];

    public static RouteCorridor Build(IReadOnlyList<LatLon> waypoints)
    {
        if (waypoints is null || waypoints.Count < 2)
            throw new ArgumentException("Cần ít nhất 2 điểm để dựng hành lang tuyến.", nameof(waypoints));

        var pts = waypoints.ToList();

        // BẮT BUỘC: đưa polyline về kinh độ liên tục. Đường A* đi qua dateline có thể đã bị
        // wrap về [-180,180] (PathSanitizer wrap), khiến bước nhảy 179 -> -179 làm phép chiếu
        // cảng ra kết quả sai (cảng xa vẫn "khớp" đoạn cắt dateline).
        for (var i = 1; i < pts.Count; i++)
        {
            var prevLon = pts[i - 1].Lon;
            pts[i] = new LatLon(pts[i].Lat, prevLon + GeoMath.WrapLon(pts[i].Lon - prevLon));
        }

        var cum = new double[pts.Count];
        for (var i = 1; i < pts.Count; i++)
            cum[i] = cum[i - 1] + GeoMath.HaversineNm(pts[i - 1], pts[i]);
        return new RouteCorridor(pts, cum);
    }

    /// <summary>
    /// Chiếu điểm p lên tuyến. Kinh độ của p được đưa về cùng "nhánh" với tuyến nên
    /// vẫn đúng khi tuyến dùng lon chưa unwrap (ví dụ đi qua dateline).
    /// </summary>
    public CorridorProjection Project(LatLon p)
    {
        var bestAlong = double.NaN;
        var bestOffset = double.MaxValue;

        for (var i = 0; i < _points.Count - 1; i++)
        {
            var a = _points[i];
            var b = _points[i + 1];
            var segNm = _cumulativeNm[i + 1] - _cumulativeNm[i];
            if (segNm <= 1e-9) continue;

            var plon = a.Lon + GeoMath.WrapLon(p.Lon - a.Lon);

            var latMidRad = (a.Lat + b.Lat) * 0.5 * Math.PI / 180.0;
            var cosLat = Math.Max(0.05, Math.Cos(latMidRad));

            // Toạ độ phẳng cục bộ (NM) quanh điểm a.
            var bx = (b.Lon - a.Lon) * cosLat * 60.0;
            var by = (b.Lat - a.Lat) * 60.0;
            var px = (plon - a.Lon) * cosLat * 60.0;
            var py = (p.Lat - a.Lat) * 60.0;

            var ab2 = bx * bx + by * by;
            var t = ab2 <= 1e-12 ? 0.0 : Math.Clamp((px * bx + py * by) / ab2, 0.0, 1.0);

            var dx = px - bx * t;
            var dy = py - by * t;
            var offset = Math.Sqrt(dx * dx + dy * dy);

            if (offset < bestOffset)
            {
                bestOffset = offset;
                bestAlong = _cumulativeNm[i] + segNm * t;
            }
        }

        if (double.IsNaN(bestAlong))
        {
            // Tuyến suy biến: quy về khoảng cách thẳng từ điểm đầu.
            bestAlong = 0.0;
            bestOffset = GeoMath.HaversineNm(p, Start);
        }

        return new CorridorProjection(bestAlong, bestOffset);
    }

    /// <summary>
    /// Khoảng cách đi biển ước tính từ một vị trí trên hành lang (along, offset) tới một
    /// điểm có toạ độ hành lang (along', offset'): đi dọc tuyến + ra/vào khỏi tuyến.
    /// </summary>
    public static double LegDistanceNm(
        double fromAlongNm, double fromOffsetNm,
        double toAlongNm, double toOffsetNm) =>
        Math.Max(0.0, toAlongNm - fromAlongNm) + fromOffsetNm + toOffsetNm;
}
