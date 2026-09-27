using System.Text.Json;

namespace ProductApi.Services.WeatherRouting;

/// <summary>
/// Global land mask from Natural Earth 110m land polygons.
/// Cells and neighbor edges that touch/cross land are impassable so A* stays on water.
/// No regional hardcodes â€” one global geometry dataset only.
/// </summary>
public static class LandMask
{
    private static readonly object InitLock = new();
    private static volatile bool _ready;
    private static List<(double MinLat, double MaxLat, double MinLon, double MaxLon, List<double[]>[] Rings)> _polys = new();
    private static List<(double Lat1, double Lon1, double Lat2, double Lon2, double WidthDeg)> _canalSegments = new();
    private static string? _loadError;

    /// <summary>Target spacing (NM) between interior sample points on an edge.</summary>
    public const double SampleSpacingNm = 2.5;

    /// <summary>
    /// Khoảng cách lấy mẫu TỐI ĐA (NM) khi dò cắt đất. Trần số mẫu một mình là không đủ:
    /// đoạn 2000 NM chỉ lấy 32 mẫu ⇒ thưa ~64 NM/mẫu ⇒ bỏ sót lục địa và tuyến "nhảy một mạch"
    /// qua đất. Vì vậy luôn bảo đảm mật độ ≤ giá trị này, bất kể maxSamples truyền vào.
    /// </summary>
    public const double MaxSampleSpacingNm = 6.0;

    /// <summary>Trần cứng số mẫu để không tốn CPU vô hạn với đoạn cực dài.</summary>
    private const int HardSampleCap = 400;

    public static string? LoadError => _loadError;
    public static int PolygonCount => _polys.Count;

    public static void EnsureLoaded()
    {
        if (_ready) return;
        lock (InitLock)
        {
            if (_ready) return;
            try
            {
                var path = ResolveGeoJsonPath();
                if (path is null || !File.Exists(path))
                    throw new FileNotFoundException("ne_110m_land.geojson not found", path ?? "(null)");

                using var doc = JsonDocument.Parse(File.ReadAllText(path));
                var features = doc.RootElement.GetProperty("features");
                var list = new List<(double, double, double, double, List<double[]>[])>();

                foreach (var f in features.EnumerateArray())
                {
                    if (!f.TryGetProperty("geometry", out var geom)) continue;
                    var type = geom.GetProperty("type").GetString();
                    if (type == "Polygon")
                    {
                        if (TryReadPolygon(geom.GetProperty("coordinates"), out var poly))
                            list.Add(poly);
                    }
                    else if (type == "MultiPolygon")
                    {
                        foreach (var polyCoords in geom.GetProperty("coordinates").EnumerateArray())
                        {
                            if (TryReadPolygon(polyCoords, out var poly))
                                list.Add(poly);
                        }
                    }
                }

                _polys = list;
                _polys.AddRange(LoadBlockedAreas());
                _canalSegments = LoadCanalSegments();
                _loadError = null;
                _ready = true;
            }
            catch (Exception ex)
            {
                _loadError = ex.Message;
                _polys = new();
                _ready = true;
            }
        }
    }

    private static string? ResolveGeoJsonPath()
    {
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Services", "WeatherRouting", "Data", "ne_110m_land.geojson"),
            Path.Combine(AppContext.BaseDirectory, "ne_110m_land.geojson"),
            Path.Combine(Directory.GetCurrentDirectory(), "Services", "WeatherRouting", "Data", "ne_110m_land.geojson"),
            Path.Combine(Directory.GetCurrentDirectory(), "Data", "ne_110m_land.geojson"),
        };
        return candidates.FirstOrDefault(File.Exists);
    }

    /// <summary>
    /// Vùng đất bổ sung do dữ liệu NE110m quá thô (đảo nhỏ / eo hẹp bị bỏ sót).
    /// Ví dụ: Adam's Bridge – Rameswaram để buộc tuyến vòng phía nam Sri Lanka.
    /// File optional; không có cũng không sao.
    /// </summary>
    private static List<(double MinLat, double MaxLat, double MinLon, double MaxLon, List<double[]>[] Rings)> LoadBlockedAreas()
    {
        var result = new List<(double, double, double, double, List<double[]>[])>();
        try
        {
            var candidates = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "Services", "WeatherRouting", "Data", "blocked_areas.geojson"),
                Path.Combine(AppContext.BaseDirectory, "blocked_areas.geojson"),
                Path.Combine(Directory.GetCurrentDirectory(), "Services", "WeatherRouting", "Data", "blocked_areas.geojson"),
                Path.Combine(Directory.GetCurrentDirectory(), "Data", "blocked_areas.geojson"),
            };
            var path = candidates.FirstOrDefault(File.Exists);
            if (path is null) return result;

            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            foreach (var f in doc.RootElement.GetProperty("features").EnumerateArray())
            {
                if (!f.TryGetProperty("geometry", out var geom)) continue;
                var type = geom.GetProperty("type").GetString();
                if (type == "Polygon")
                {
                    if (TryReadPolygon(geom.GetProperty("coordinates"), out var poly)) result.Add(poly);
                }
                else if (type == "MultiPolygon")
                {
                    foreach (var pc in geom.GetProperty("coordinates").EnumerateArray())
                        if (TryReadPolygon(pc, out var poly)) result.Add(poly);
                }
            }
        }
        catch
        {
            // File vùng chặn là tuỳ chọn.
        }
        return result;
    }

    private static bool TryReadPolygon(
        JsonElement coordinates,
        out (double MinLat, double MaxLat, double MinLon, double MaxLon, List<double[]>[] Rings) poly)
    {
        var rings = new List<List<double[]>>();
        double minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
        foreach (var ringEl in coordinates.EnumerateArray())
        {
            var ring = new List<double[]>();
            foreach (var pt in ringEl.EnumerateArray())
            {
                var lon = pt[0].GetDouble();
                var lat = pt[1].GetDouble();
                ring.Add(new[] { lon, lat });
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lon < minLon) minLon = lon;
                if (lon > maxLon) maxLon = lon;
            }
            if (ring.Count >= 3) rings.Add(ring);
        }
        if (rings.Count == 0)
        {
            poly = default;
            return false;
        }
        // Slight bbox pad so cull doesn't miss grazing edges.
        const double pad = 0.05;
        poly = (minLat - pad, maxLat + pad, minLon - pad, maxLon + pad, rings.ToArray());
        return true;
    }

    
    
    // Half-width (deg) mặc định quanh tim hành lang (kênh/eo) được coi là nước lưu thông được.
    // Từng feature có thể ghi đè bằng thuộc tính "widthDeg" trong geojson.
    private const double DefaultCorridorHalfWidthDeg = 0.12;

    /// <summary>
    /// Nới rộng thêm hành lang (độ) trong lúc dựng lưới. Khi lưới thô hơn chiều rộng eo biển,
    /// có thể không có ô lưới nào lọt vào eo dù eo có trong dữ liệu → A* phải đi vòng rất xa.
    /// GridBuilder set giá trị này theo kích thước ô lưới rồi reset về 0.
    ///
    /// RIÊNG THEO LUỒNG ([ThreadStatic]): GridBuilder, A* và D* Lite đều gán tạm rồi trả lại giá
    /// trị này trong CÙNG một lời gọi đồng bộ. Để dùng chung một biến tĩnh thì hai request (hoặc
    /// hai test chạy song song) giẫm lên nhau — đã gặp thật: test D* Lite lệch chi phí khi chạy
    /// chung với test khác nhưng đúng khi chạy riêng.
    /// </summary>
    public static double CorridorDilationDeg
    {
        get => _corridorDilationDeg;
        set => _corridorDilationDeg = value;
    }

    [ThreadStatic] private static double _corridorDilationDeg;

    public static bool IsBlockedLand(LatLon p) => IsInteriorLand(p);

    /// <summary>Điểm có nằm trong hành lang kênh/eo biển được phép đi qua không.</summary>
    public static bool IsInCorridor(LatLon p)
    {
        EnsureLoaded();
        return InCanalCorridor(p);
    }

    /// <summary>Raw polygon containment (no erosion / corridors).</summary>
    public static bool IsRawLand(LatLon p)
    {
        EnsureLoaded();
        var lat = p.Lat;
        var lon = GeoMath.WrapLon(p.Lon);

        foreach (var poly in _polys)
        {
            if (lat < poly.MinLat || lat > poly.MaxLat || lon < poly.MinLon || lon > poly.MaxLon)
                continue;

            if (!PointInRing(lon, lat, poly.Rings[0]))
                continue;

            var inHole = false;
            for (var ii = 1; ii < poly.Rings.Length; ii++)
            {
                if (PointInRing(lon, lat, poly.Rings[ii]))
                {
                    inHole = true;
                    break;
                }
            }
            if (!inHole) return true;
        }
        return false;
    }

    /// <summary>
    /// Interior land. Raw land is blocked unless it falls in a narrow coastal fringe
    /// (ports) or a shipping-canal corridor loaded from Data/shipping_canals.geojson.
    /// No named-region branches in routing code.
    /// </summary>
    public static bool IsInteriorLand(LatLon p)
    {
        EnsureLoaded();
        if (!IsRawLand(p)) return false;
        // Only shipping-canal corridors (from geojson) are exempt — no coastal
        // fringe (that punched island edges and looked like land cuts on the map).
        // Ports rely on SnapToWater in GridBuilder.
        return !InCanalCorridor(p);
    }

    private static bool InCanalCorridor(LatLon p)
    {
        if (_canalSegments.Count == 0) return false;
        var lat = p.Lat;
        var lon = GeoMath.WrapLon(p.Lon);
        var cos = Math.Max(0.2, Math.Cos(lat * Math.PI / 180.0));
        foreach (var s in _canalSegments)
        {
            var ax = s.Lon1 * cos; var ay = s.Lat1;
            var bx = s.Lon2 * cos; var by = s.Lat2;
            var px = lon * cos; var py = lat;
            var abx = bx - ax; var aby = by - ay;
            var apx = px - ax; var apy = py - ay;
            var ab2 = abx * abx + aby * aby;
            var tt = ab2 < 1e-18 ? 0.0 : Math.Clamp((apx * abx + apy * aby) / ab2, 0.0, 1.0);
            var dx = apx - abx * tt; var dy = apy - aby * tt;
            var w = s.WidthDeg > 0 ? s.WidthDeg : DefaultCorridorHalfWidthDeg;
            var dil = CorridorDilationDeg;
            if (dil > w) w = dil;
            if (dx * dx + dy * dy <= w * w) return true;
        }
        return false;
    }

    /// <summary>
    /// Chiếu một điểm về tim hành lang kênh/eo gần nhất (nếu có, trong bán kính maxDeg).
    /// Dùng để vẽ polyline bám tim kênh: ô lưới rộng nên tâm ô có thể nằm sâu trong đất
    /// dù A* cho đi qua nhờ hành lang được nới rộng khi dựng lưới.
    /// </summary>
    public static LatLon? ProjectToCorridor(LatLon p, double maxDeg = 1.0)
    {
        EnsureLoaded();
        if (_canalSegments.Count == 0) return null;
        var lat = p.Lat;
        var lon = GeoMath.WrapLon(p.Lon);
        var cos = Math.Max(0.2, Math.Cos(lat * Math.PI / 180.0));
        LatLon? best = null;
        var bestD = maxDeg;
        foreach (var s in _canalSegments)
        {
            var ax = s.Lon1 * cos; var ay = s.Lat1;
            var bx = s.Lon2 * cos; var by = s.Lat2;
            var px = lon * cos; var py = lat;
            var abx = bx - ax; var aby = by - ay;
            var apx = px - ax; var apy = py - ay;
            var ab2 = abx * abx + aby * aby;
            var tt = ab2 < 1e-18 ? 0.0 : Math.Clamp((apx * abx + apy * aby) / ab2, 0.0, 1.0);
            var qx = ax + abx * tt;
            var qy = ay + aby * tt;
            var dx = px - qx; var dy = py - qy;
            var d = Math.Sqrt(dx * dx + dy * dy);
            if (d < bestD)
            {
                bestD = d;
                best = new LatLon(qy, qx / cos);
            }
        }
        return best;
    }

    private static List<(double Lat1, double Lon1, double Lat2, double Lon2, double WidthDeg)> LoadCanalSegments()
    {
        var list = new List<(double, double, double, double, double)>();
        try
        {
            var paths = ResolveCorridorGeoJsonPaths();
            if (paths.Count == 0) return list;
            foreach (var path in paths)
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(path));
                foreach (var f in doc.RootElement.GetProperty("features").EnumerateArray())
                {
                    if (!f.TryGetProperty("geometry", out var geom)) continue;
                    var type = geom.GetProperty("type").GetString();
                    if (type != "LineString" && type != "MultiLineString") continue;

                    var width = DefaultCorridorHalfWidthDeg;
                    if (f.TryGetProperty("properties", out var props) &&
                        props.TryGetProperty("widthDeg", out var wEl) &&
                        wEl.ValueKind == JsonValueKind.Number)
                    {
                        width = wEl.GetDouble();
                    }

                    if (type == "LineString")
                    {
                        AddLineSegments(geom.GetProperty("coordinates"), width, list);
                    }
                    else
                    {
                        foreach (var line in geom.GetProperty("coordinates").EnumerateArray())
                            AddLineSegments(line, width, list);
                    }
                }
            }
        }
        catch
        {
            // Canal/strait file optional.
        }
        return list;
    }

    private static void AddLineSegments(
        JsonElement coords, double widthDeg,
        List<(double, double, double, double, double)> list)
    {
        double? prevLat = null, prevLon = null;
        foreach (var pt in coords.EnumerateArray())
        {
            var lon = pt[0].GetDouble();
            var lat = pt[1].GetDouble();
            if (prevLat is not null)
                list.Add((prevLat.Value, prevLon!.Value, lat, lon, widthDeg));
            prevLat = lat; prevLon = lon;
        }
    }

    /// <summary>
    /// Các file hành lang được phép đi qua (kênh đào + eo biển hẹp) — nạp tất cả file có mặt.
    /// </summary>
    private static List<string> ResolveCorridorGeoJsonPaths()
    {
        var names = new[] { "shipping_canals.geojson", "shipping_straits.geojson" };
        var found = new List<string>();
        foreach (var name in names)
        {
            var candidates = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "Services", "WeatherRouting", "Data", name),
                Path.Combine(AppContext.BaseDirectory, name),
                Path.Combine(Directory.GetCurrentDirectory(), "Services", "WeatherRouting", "Data", name),
                Path.Combine(Directory.GetCurrentDirectory(), "Data", name),
            };
            var hit = candidates.FirstOrDefault(File.Exists);
            if (hit is not null) found.Add(hit);
        }
        return found;
    }


    /// <summary>
    /// True if the chord aâ†’b crosses land. Uses distance-adaptive interior sampling so
    /// coarse grid neighbor hops cannot tunnel through coastlines/islands.
    /// Endpoints are assumed already classified (passable water cells); only the open
    /// segment interior is tested. Lon may be unwrapped (e.g. eastbound Pacific).
    /// </summary>
    public static bool SegmentCrossesLand(LatLon a, LatLon b, double spacingNm = SampleSpacingNm, int maxSamples = 48)
    {
        EnsureLoaded();
        if (_polys.Count == 0) return false;

        var distNm = GeoMath.HaversineNm(a, b);
        if (distNm < 1e-6) return false;

        spacingNm = Math.Clamp(spacingNm, 2.0, 20.0);
        // Số mẫu theo khoảng cách mong muốn, nhưng KHÔNG được thưa hơn MaxSampleSpacingNm.
        var wantBySpacing = (int)Math.Ceiling(distNm / spacingNm);
        var wantByMaxSpacing = (int)Math.Ceiling(distNm / MaxSampleSpacingNm);
        var cap = Math.Min(Math.Max(Math.Max(1, maxSamples), wantByMaxSpacing), HardSampleCap);
        var samples = Math.Clamp(Math.Max(wantBySpacing, wantByMaxSpacing), 1, cap);

        for (var i = 1; i <= samples; i++)
        {
            var t = (double)i / (samples + 1);
            var lat = a.Lat + (b.Lat - a.Lat) * t;
            var lon = a.Lon + (b.Lon - a.Lon) * t;
            if (IsBlockedLand(new LatLon(lat, lon)))
                return true;
        }
        return false;
    }

    /// <summary>
    /// Count how many consecutive waypoint chords have an interior land hit.
    /// skipFirst/skipLast allow ignoring port-snap segments at the ends.
    /// </summary>
    public static int CountLandCrossingSegments(IReadOnlyList<LatLon> waypoints, bool skipEnds = true)
    {
        EnsureLoaded();
        if (waypoints.Count < 2) return 0;
        var hits = 0;
        var first = skipEnds ? 1 : 0;
        var last = skipEnds ? waypoints.Count - 2 : waypoints.Count - 1;
        for (var i = first; i < last; i++)
        {
            if (SegmentCrossesLand(waypoints[i], waypoints[i + 1]))
                hits++;
        }
        // If skipEnds, still check middle of whole path; if only 2 points, check the one segment
        // excluding pure port snap when skipEnds and count==2 â†’ 0 by design.
        if (!skipEnds)
        {
            // already counted all
        }
        else if (waypoints.Count == 2)
        {
            // single port-to-port chord â€” treat as possible port snap; do not count
        }
        return hits;
    }

    private static bool PointInRing(double lon, double lat, List<double[]> ring)
    {
        var inside = false;
        for (int i = 0, j = ring.Count - 1; i < ring.Count; j = i++)
        {
            var xi = ring[i][0];
            var yi = ring[i][1];
            var xj = ring[j][0];
            var yj = ring[j][1];
            var intersect = ((yi > lat) != (yj > lat)) &&
                            (lon < (xj - xi) * (lat - yi) / (yj - yi + double.Epsilon) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
}

