namespace ProductApi.Services.WeatherRouting;

/// <summary>
/// Trường sóng / gió suy ra từ các vùng thiên tai — biến tập vòng tròn NHỊ PHÂN
/// (đi được / không đi được) thành các đại lượng LIÊN TỤC gắn vào từng nút lưới.
///
/// Vì sao cần: vùng thiên tai vẫn bị chặn cứng như trước, nên bên trong vòng tròn
/// không có ô nào đi được và độ cao sóng ở đó không ảnh hưởng gì tới chi phí.
/// Thứ thật sự quyết định hình dạng tuyến là VÀNH NGOÀI bán kính: chỗ tàu đi được
/// nhưng sóng còn lớn. Không có trường này thì đi sát mép bão và đi giữa biển lặng
/// có chi phí y hệt nhau, nên A* luôn chọn liếm sát mép — ngắn hơn vài hải lý.
///
/// Mô hình: mỗi vùng toả ra một vành ảnh hưởng rộng <see cref="InfluenceFactor"/> lần
/// bán kính. Sóng đạt đỉnh tại biên vùng rồi tắt dần theo hàm cosin tới 0 ở mép vành.
/// Nhiều vùng chồng nhau thì lấy giá trị LỚN NHẤT (không cộng dồn — hai cơn bão cạnh
/// nhau không tạo ra sóng cao gấp đôi).
/// </summary>
public static class HazardWeatherField
{
    /// <summary>Vành ảnh hưởng rộng gấp bấy nhiêu lần bán kính vùng.</summary>
    public const double InfluenceFactor = 2.5;

    /// <summary>
    /// Sóng đỉnh (m) và gió đỉnh (m/s) ngay tại biên mỗi loại thiên tai.
    /// Lấy theo thang Beaufort / cấp bão thực tế, không phải số bịa cho đẹp:
    ///  - Bão cuồng phong / hurricane: gió &gt; 32 m/s (cấp 12), sóng 9–14 m.
    ///  - Bão nhiệt đới: gió 17–24 m/s, sóng 4–6 m.
    ///  - Gió mạnh (gale, cấp 8–9): gió 17–24 m/s, sóng 4–5,5 m.
    ///  - Sóng thần ngoài khơi biên độ rất nhỏ (&lt; 1 m) — nguy hiểm khi vào bờ,
    ///    không phải ở vùng nước sâu; giữ mức thấp để mô hình không nói dối.
    /// </summary>
    private static readonly Dictionary<string, (double WaveM, double WindMs)> Peaks =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["TYPHOON"] = (9.0, 45.0),
            ["HURRICANE"] = (10.0, 50.0),
            ["TROPICAL_STORM"] = (5.5, 24.0),
            ["GALE"] = (4.5, 20.0),
            ["HIGH_WAVES"] = (6.0, 12.0),
            ["TSUNAMI"] = (1.0, 5.0),
            ["ICEBERG"] = (2.0, 8.0),
            ["VOLCANIC_ASH"] = (2.0, 10.0),
            ["SEA_FOG"] = (1.5, 4.0),
            ["PIRACY"] = (1.0, 3.0)
        };

    /// <summary>Mặc định cho loại chưa có trong bảng — coi như gió mạnh vừa.</summary>
    private static readonly (double WaveM, double WindMs) DefaultPeak = (4.0, 18.0);

    /// <summary>
    /// Hệ số theo mức độ nghiêm trọng. Cùng một loại bão, vùng "Red" nguy hiểm hơn "Green";
    /// dùng chính trường Severity mà <see cref="DemoHazardGenerator"/> đã gán theo bán kính.
    /// </summary>
    private static double SeverityScale(string? severity) => severity?.ToUpperInvariant() switch
    {
        "RED" => 1.0,
        "ORANGE" => 0.8,
        _ => 0.6
    };

    /// <summary>Sóng đỉnh + gió đỉnh của một vùng (đã nhân hệ số nghiêm trọng).</summary>
    public static (double WaveM, double WindMs) PeakOf(HazardZone zone)
    {
        var peak = Peaks.TryGetValue(zone.Type, out var p) ? p : DefaultPeak;
        var scale = SeverityScale(zone.Severity);
        return (peak.WaveM * scale, peak.WindMs * scale);
    }

    /// <summary>
    /// Tỷ lệ cường độ tại khoảng cách <paramref name="distNm"/> tính từ tâm vùng bán kính
    /// <paramref name="radiusNm"/>: 1.0 ở trong vùng, tắt dần theo cosin ra tới mép vành, 0 ngoài đó.
    ///
    /// Dùng cosin thay vì tuyến tính để trường có đạo hàm liên tục — gradient mượt thì A*
    /// bẻ tuyến thành đường vòng đều, còn gradient gãy khúc cho ra đường răng cưa.
    /// </summary>
    public static double Falloff(double distNm, double radiusNm)
    {
        if (radiusNm <= 0) return 0.0;
        if (distNm <= radiusNm) return 1.0;

        var outerNm = radiusNm * InfluenceFactor;
        if (distNm >= outerNm) return 0.0;

        var t = (distNm - radiusNm) / (outerNm - radiusNm);   // 0 tại biên vùng -> 1 tại mép vành
        return 0.5 * (1.0 + Math.Cos(t * Math.PI));
    }

    /// <summary>
    /// Độ cao sóng (m) và tốc độ gió (m/s) tại một điểm, lấy MAX trên mọi vùng.
    /// Trả về cả hướng sóng truyền tới (độ, 0 = bắc) của vùng chi phối — sóng toả ra
    /// theo hướng kính từ tâm bão, nên hướng đó là phương vị từ tâm vùng tới điểm đang xét.
    /// </summary>
    public static (double WaveM, double WindMs, double WaveBearingDeg) Sample(
        IReadOnlyList<HazardZone> zones, LatLon p)
    {
        var waveM = 0.0;
        var windMs = 0.0;
        var bearing = 0.0;
        var strongest = 0.0;

        foreach (var z in zones)
        {
            var distNm = GeoMath.HaversineNm(p, z.Center);
            var f = Falloff(distNm, z.RadiusNm);
            if (f <= 0.0) continue;

            var (peakWave, peakWind) = PeakOf(z);
            var w = peakWave * f;
            if (w > waveM) waveM = w;

            var v = peakWind * f;
            if (v > windMs) windMs = v;

            // Hướng sóng lấy theo vùng ĐANG MẠNH NHẤT tại điểm này, không phải vùng gần nhất:
            // một cơn bão lớn ở xa vẫn áp đảo một vùng sương mù ngay cạnh.
            if (w > strongest)
            {
                strongest = w;
                bearing = BearingDeg(z.Center, p);
            }
        }

        return (waveM, windMs, bearing);
    }

    /// <summary>Phương vị (độ, 0 = bắc, thuận chiều kim đồng hồ) từ a tới b.</summary>
    public static double BearingDeg(LatLon a, LatLon b)
    {
        static double Rad(double d) => d * Math.PI / 180.0;

        var lat1 = Rad(a.Lat);
        var lat2 = Rad(b.Lat);
        var dLon = Rad(GeoMath.WrapLon(b.Lon - a.Lon));

        var y = Math.Sin(dLon) * Math.Cos(lat2);
        var x = Math.Cos(lat1) * Math.Sin(lat2) - Math.Sin(lat1) * Math.Cos(lat2) * Math.Cos(dLon);

        var deg = Math.Atan2(y, x) * 180.0 / Math.PI;
        return (deg + 360.0) % 360.0;
    }

    /// <summary>
    /// Góc tương đối (độ) giữa hướng đi của tàu và hướng sóng, theo quy ước của
    /// <see cref="FuelModel.Evaluate"/>: 0° = NGƯỢC sóng (mất tốc độ nhiều nhất),
    /// 180° = xuôi sóng (gần như không mất).
    ///
    /// Sóng truyền THEO hướng <paramref name="waveBearingDeg"/>, nên tàu đi ngược sóng
    /// khi hướng đi của nó ngược lại hướng đó 180°.
    /// </summary>
    public static double RelativeHeadingDeg(double courseDeg, double waveBearingDeg)
    {
        var headOn = (waveBearingDeg + 180.0) % 360.0;
        var diff = Math.Abs(courseDeg - headOn) % 360.0;
        return diff > 180.0 ? 360.0 - diff : diff;
    }
}
