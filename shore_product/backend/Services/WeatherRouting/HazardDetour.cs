namespace ProductApi.Services.WeatherRouting;

/// <summary>
/// Vẽ đường vòng qua vùng thiên tai bằng HÌNH HỌC CHÍNH XÁC — không qua lưới A*.
///
/// Vì sao cần: A* chỉ chặn ở mức Ô LƯỚI, mà ô lưới ở đây rộng 15–100 NM. Một vùng bán kính
/// 94 NM chỉ phủ 1–2 ô, nên A* "né" ở độ phân giải ô rồi string-pull nối thẳng hai đỉnh cách
/// nhau cả trăm NM — đường vẽ ra vẫn cắt ngang vùng. Kiểm tra ở mức cạnh có đỡ hơn nhưng vẫn
/// phụ thuộc độ mịn lưới, và các nhánh dự phòng (lát cắt hành lang, A* bỏ thiên tai) thì hoàn
/// toàn không né gì.
///
/// Ở đây chỉ làm đúng một việc: đoạn nào cắt vòng tròn thì thay bằng hai đường TIẾP TUYẾN
/// nối với một CUNG trên vòng tròn đã nới bán kính. Bảo đảm thu được: mọi điểm của tuyến
/// cách tâm vùng ít nhất bằng bán kính + lề. Không lưới, không lấy mẫu, không phụ thuộc
/// nhánh dự phòng nào — nên nó đúng kể cả khi mọi thứ phía trên thất bại.
/// </summary>
public static class HazardDetour
{
    /// <summary>Lề an toàn cộng thêm ngoài bán kính vùng (NM).</summary>
    public const double DefaultMarginNm = 15.0;

    /// <summary>Bước lấy mẫu trên cung vòng tròn, tính theo GÓC (chặn trên 0.4 rad ≈ 23°).</summary>
    private const double ArcStepNm = 40.0;

    /// <summary>
    /// Bẻ vòng MỘT LƯỢT: gộp các vùng giao nhau thành một vòng bao, rồi mỗi vòng bao xử lý trọn
    /// vẹn — đẩy đỉnh nằm trong ra biên, thay mọi đoạn cắt vùng bằng tiếp tuyến + cung.
    ///
    /// Không lặp “sửa đến khi ổn định” và không chặn số điểm. Vẽ đúng thì phép biến đổi đã ổn
    /// định sẵn: cung được vẽ ở bán kính lớn hơn bán kính kiểm tra nên các dây cung của nó nằm
    /// ngoài vùng, lượt sau không có gì để sửa. Lặp lại chỉ để che lỗi vẽ — đã từng che một lỗi
    /// như thế thành polyline 221 979 điểm.
    /// </summary>
    /// <param name="landCrossings">
    /// Đếm số đoạn của một polyline cắt đất. Khi có, đường vòng chọn PHÍA BỜ BIỂN thay vì phía
    /// ngắn hơn. Thiếu tham số này thì cung vòng hay đụng đất, bị lớp gọi hoàn nguyên về polyline
    /// gốc — và tuyến lại xuyên thẳng qua vùng thiên tai như chưa hề né.
    /// </param>
    /// <param name="pointOnLand">Kiểm tra một điểm có nằm trên đất không, dùng khi đẩy đỉnh ra biên.</param>
    public static List<LatLon> Apply(
        IReadOnlyList<LatLon> pts,
        IReadOnlyList<HazardZone> zones,
        double marginNm = DefaultMarginNm,
        Func<IReadOnlyList<LatLon>, int>? landCrossings = null,
        Func<LatLon, bool>? pointOnLand = null)
    {
        if (pts.Count < 2 || zones.Count == 0) return pts.ToList();

        var obstacles = MergeIntoObstacles(zones, marginNm);
        var path = pts.ToList();

        foreach (var (center, radiusNm) in obstacles)
        {
            // Không đụng điểm đầu/cuối — đó là cảng, không được dịch.
            for (var i = 1; i < path.Count - 1; i++)
                path[i] = PushOut(path[i], center, radiusNm, pointOnLand);

            path = DetourAroundZone(path, center, radiusNm, landCrossings);
        }

        return path;
    }

    /// <summary>
    /// Gộp các vùng giao nhau thành một vòng bao duy nhất, lặp tới khi các vòng bao rời nhau.
    ///
    /// Cần thiết vì xử lý từng vùng riêng thì đường vòng của vùng này có thể lọt vào vùng kia —
    /// mà một lượt duy nhất thì không còn cơ hội sửa. Vòng bao lớn hơn hợp các vùng một chút,
    /// đổi lại bảo đảm: đi vòng quanh nó là không chạm vùng nào bên trong.
    /// </summary>
    private static List<(LatLon Center, double RadiusNm)> MergeIntoObstacles(
        IReadOnlyList<HazardZone> zones, double marginNm)
    {
        // +1 NM: khe hở kỹ thuật, để đỉnh nằm đúng trên biên không rơi vào lằn ranh sai số.
        var current = zones
            .Select(z => (Center: z.Center, RadiusNm: z.RadiusNm + marginNm + 1.0))
            .ToList();

        // Mỗi lượt gộp làm số vòng bao giảm, hoặc dừng. Tối đa 16 lượt là thừa thãi với ≤ 40 vùng.
        for (var round = 0; round < 16; round++)
        {
            var merged = new List<(LatLon Center, double RadiusNm)>();
            var used = new bool[current.Count];

            for (var i = 0; i < current.Count; i++)
            {
                if (used[i]) continue;
                used[i] = true;

                var group = new List<(LatLon Center, double RadiusNm)> { current[i] };

                // Gộp bắc cầu: thêm vòng bao nào chạm vòng bao hiện tại, lặp tới khi hết.
                var grew = true;
                while (grew)
                {
                    grew = false;
                    var enclosing = Enclose(group);

                    for (var j = 0; j < current.Count; j++)
                    {
                        if (used[j]) continue;
                        if (DistanceNm(enclosing.Center, current[j].Center) >
                            enclosing.RadiusNm + current[j].RadiusNm) continue;

                        group.Add(current[j]);
                        used[j] = true;
                        grew = true;
                    }
                }

                merged.Add(Enclose(group));
            }

            var stable = merged.Count == current.Count;
            current = merged;
            if (stable) break;
        }

        return current;
    }

    /// <summary>Vòng bao nhỏ nhất tính được của một nhóm vòng tròn (tâm = trung bình các tâm).</summary>
    private static (LatLon Center, double RadiusNm) Enclose(
        IReadOnlyList<(LatLon Center, double RadiusNm)> group)
    {
        if (group.Count == 1) return group[0];

        // Kinh độ phải UNWRAP quanh phần tử đầu trước khi lấy trung bình. Nhóm vắt qua kinh tuyến
        // 180 (tuyến Thái Bình Dương) mà lấy trung bình trực tiếp thì hai vùng ở 179 và −179
        // cho ra tâm ở 0 — vòng bao thành nửa địa cầu.
        var baseLon = group[0].Center.Lon;
        var lat = group.Average(g => g.Center.Lat);
        var lon = group.Average(g => baseLon + GeoMath.WrapLon(g.Center.Lon - baseLon));
        var center = new LatLon(lat, GeoMath.WrapLon(lon));

        var radius = 0.0;
        foreach (var g in group)
            radius = Math.Max(radius, DistanceNm(center, g.Center) + g.RadiusNm);

        return (center, radius);
    }

    private static double DistanceNm(LatLon a, LatLon b) => GeoMath.HaversineNm(a, b);

    /// <summary>Đẩy một điểm nằm trong vòng bao ra ngoài biên theo hướng kính.</summary>
    private static LatLon PushOut(
        LatLon p, LatLon center, double radiusNm, Func<LatLon, bool>? pointOnLand)
    {
        // Dùng CÙNG khung phẳng cục bộ với chỗ kiểm tra cắt và vẽ cung. Nếu chỗ này đo bằng
        // Haversine còn chỗ kia đo trên mặt phẳng thì hai bên lệch nhau một chút — đủ để điểm
        // vừa đẩy ra lại bị coi là còn nằm trong.
        var (x, y) = ToLocal(p, center);
        var len = Math.Sqrt(x * x + y * y);
        if (len >= radiusNm) return p;

        var angle = len < 1e-9 ? 0.0 : Math.Atan2(y, x);
        var radial = ToLatLon(angle, radiusNm, center);
        if (pointOnLand is null || !pointOnLand(radial)) return radial;

        // Hướng kính rơi vào đất (vùng bão nằm sát bờ) — thử phía đối diện trên cùng vòng tròn.
        var opposite = ToLatLon(angle + Math.PI, radiusNm, center);
        return pointOnLand(opposite) ? radial : opposite;
    }

    /// <summary>Thay mọi đoạn cắt vòng tròn bằng đường vòng qua nó.</summary>
    private static List<LatLon> DetourAroundZone(
        IReadOnlyList<LatLon> pts, LatLon center, double radiusNm,
        Func<IReadOnlyList<LatLon>, int>? landCrossings)
    {
        var result = new List<LatLon>(pts.Count + 8) { pts[0] };

        for (var i = 0; i < pts.Count - 1; i++)
        {
            var a = pts[i];
            var b = pts[i + 1];
            if (!SegmentHitsCircle(a, b, center, radiusNm))
            {
                result.Add(b);
                continue;
            }

            var detour = DetourSegment(a, b, center, radiusNm, landCrossings);
            for (var k = 1; k < detour.Count; k++) result.Add(detour[k]);
        }

        return result;
    }

    /// <summary>
    /// Đoạn a→b cắt vòng tròn (tâm, bán kính) không. Đo trong mặt phẳng phẳng cục bộ (NM)
    /// quanh tâm — sai số không đáng kể ở quy mô vài trăm NM.
    /// </summary>
    private static bool SegmentHitsCircle(LatLon a, LatLon b, LatLon center, double radiusNm)
    {
        var (ax, ay) = ToLocal(a, center);
        var (bx, by) = ToLocal(b, center);

        var dx = bx - ax;
        var dy = by - ay;
        var len2 = dx * dx + dy * dy;
        if (len2 <= 1e-9)
            return ax * ax + ay * ay < radiusNm * radiusNm;

        var t = Math.Clamp(-(ax * dx + ay * dy) / len2, 0.0, 1.0);
        var cx = ax + dx * t;
        var cy = ay + dy * t;
        return cx * cx + cy * cy < radiusNm * radiusNm;
    }

    /// <summary>
    /// Đường vòng a → tiếp tuyến → cung → tiếp tuyến → b. Hai đầu nằm trong vòng tròn thì
    /// được đẩy thẳng ra biên theo hướng tâm trước.
    /// </summary>
    private static List<LatLon> DetourSegment(
        LatLon a, LatLon b, LatLon center, double radiusNm,
        Func<IReadOnlyList<LatLon>, int>? landCrossings)
    {
        var (ax, ay) = ToLocal(a, center);
        var (bx, by) = ToLocal(b, center);

        var da = Math.Sqrt(ax * ax + ay * ay);
        var db = Math.Sqrt(bx * bx + by * by);

        // Một đầu mút nằm trong vùng (đã cộng biên) = cập/rời cảng ngay trong vùng bão.
        // Không né được ở mức hình học — trả về đoạn gốc. TUYỆT ĐỐI không dịch toạ độ cảng
        // cho vừa vòng tròn, vì như thế là sửa cảng của người dùng.
        if (da < radiusNm || db < radiusNm) return new List<LatLon> { a, b };

        // Vẽ cung trên bán kính LỚN HƠN bán kính kiểm tra.
        //
        // Cung bị chia thành các DÂY CUNG khi lấy mẫu, mà dây cung luôn lõm vào trong so với
        // cung tròn. Nếu vẽ đúng bằng bán kính kiểm tra thì lượt lặp sau chính các dây cung đó
        // lại bị coi là cắt vùng → sinh thêm điểm mãi không dừng; đã gặp polyline phình lên
        // 221 979 điểm cho một chặng. Nới đúng bằng độ võng của dây cung thì mọi điểm của cung
        // đều nằm ngoài bán kính kiểm tra.
        //
        // Bước lấy mẫu tính theo GÓC, không theo độ dài cung: bước cố định 40 NM quá thô với
        // vùng nhỏ (bán kính 20 NM chỉ được 2 điểm cho cả nửa vòng, và độ võng lớn tới mức phải
        // nới bán kính lên 90%). Chặn trên 0.4 rad ≈ 23°.
        var stepAngle = Math.Min(0.4, ArcStepNm / radiusNm);
        var drawn = radiusNm / Math.Cos(stepAngle / 2.0) + 1.0;

        var thetaA = Math.Atan2(ay, ax);
        var thetaB = Math.Atan2(by, bx);
        var alpha = Math.Acos(Math.Clamp(drawn / da, -1.0, 1.0));
        var beta = Math.Acos(Math.Clamp(drawn / db, -1.0, 1.0));

        // Hai cách vòng quanh: hai tiếp điểm của A là thetaA ± alpha, của B là thetaB ± beta.
        // Phải ghép LỆCH DẤU (A lấy +alpha thì B lấy −beta) để hai tiếp điểm nằm cùng một phía
        // hình học; ghép cùng dấu cho ra hai phía đối nhau, cung vẽ vòng qua nửa bên kia.
        var startNorth = thetaA - alpha;
        var endNorth = thetaB + beta;
        var startSouth = thetaA + alpha;
        var endSouth = thetaB - beta;

        var sweepNorth = Math.Abs(NormalizeAngle(endNorth - startNorth));
        var sweepSouth = Math.Abs(NormalizeAngle(endSouth - startSouth));

        // Không có phép thử đất thì chỉ còn tiêu chí ngắn nhất — như cũ.
        if (landCrossings is null)
        {
            return sweepNorth <= sweepSouth
                ? BuildArc(a, b, center, drawn, stepAngle, startNorth, endNorth)
                : BuildArc(a, b, center, drawn, stepAngle, startSouth, endSouth);
        }

        // Vẽ cả hai phía rồi chọn phía KHÔNG đụng đất.
        //
        // Trước đây chỉ chọn phía ngắn hơn. Cung ngắn hơn rất hay cắt vào bờ biển khi vùng bão
        // nằm gần bờ, và khi đó lớp gọi phát hiện đất nhiều hơn bản gốc nên bỏ toàn bộ đường vòng
        // của cả chặng — kết quả là tuyến vẫn xuyên thẳng tâm vùng. Đo được: VNVUT→Le Havre
        // 3/24 vùng bị xuyên, ARBUE→Antwerp 1/24, sâu tới 95 NM. Chọn phía biển thì cả hai phía
        // đều là phương án né hợp lệ, chỉ khác chiều dài.
        var north = BuildArc(a, b, center, drawn, stepAngle, startNorth, endNorth);
        var south = BuildArc(a, b, center, drawn, stepAngle, startSouth, endSouth);

        var northLand = landCrossings(north);
        var southLand = landCrossings(south);

        // Ưu tiên phía KHÔNG đụng đất; cùng mức đất thì lấy phía ngắn hơn. Cả hai phía đều đụng
        // đất chỉ xảy ra khi vùng bão trùm hẳn qua bờ — khi đó lấy phía ít đất hơn.
        if (northLand != southLand) return northLand < southLand ? north : south;
        return sweepNorth <= sweepSouth ? north : south;
    }

    /// <summary>Dựng chuỗi a → tiếp tuyến → cung startAngle→endAngle → tiếp tuyến → b.</summary>
    private static List<LatLon> BuildArc(
        LatLon a, LatLon b, LatLon center, double radiusNm, double stepAngle,
        double startAngle, double endAngle)
    {
        var sweep = NormalizeAngle(endAngle - startAngle);
        var steps = Math.Max(2, (int)Math.Ceiling(Math.Abs(sweep) / stepAngle));

        var pts = new List<LatLon>(steps + 3) { a, ToLatLon(startAngle, radiusNm, center) };
        for (var i = 1; i < steps; i++)
            pts.Add(ToLatLon(startAngle + sweep * i / steps, radiusNm, center));

        pts.Add(ToLatLon(endAngle, radiusNm, center));
        pts.Add(b);
        return pts;
    }

    private static double NormalizeAngle(double rad)
    {
        while (rad > Math.PI) rad -= 2 * Math.PI;
        while (rad < -Math.PI) rad += 2 * Math.PI;
        return rad;
    }

    /// <summary>Toạ độ phẳng cục bộ (NM) quanh tâm vùng.</summary>
    private static (double X, double Y) ToLocal(LatLon p, LatLon center)
    {
        var cosLat = Math.Max(0.05, Math.Cos(center.Lat * Math.PI / 180.0));
        return (GeoMath.WrapLon(p.Lon - center.Lon) * cosLat * 60.0, (p.Lat - center.Lat) * 60.0);
    }

    private static LatLon ToLatLon(double angle, double radiusNm, LatLon center)
    {
        var cosLat = Math.Max(0.05, Math.Cos(center.Lat * Math.PI / 180.0));
        var x = Math.Cos(angle) * radiusNm;
        var y = Math.Sin(angle) * radiusNm;
        return new LatLon(
            Math.Clamp(center.Lat + y / 60.0, -85.0, 85.0),
            GeoMath.WrapLon(center.Lon + x / (60.0 * cosLat)));
    }
}
