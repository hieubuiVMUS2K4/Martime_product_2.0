namespace ProductApi.Services.WeatherRouting;

/// <summary>
/// Hàm đánh giá của A* tính bằng NHIÊN LIỆU (tấn) thay vì quãng đường (NM).
///
/// g(n) — chi phí một bước: quãng đường × suất tiêu thụ tại điều kiện sóng gió của cạnh đó.
/// Mô hình công suất không đổi (xem <see cref="FuelModel"/>): máy giữ nguyên điểm khai thác,
/// sóng gió làm tàu MẤT TỐC ĐỘ, nên đi cùng một hải lý mất nhiều giờ hơn ⇒ tốn thêm nhiên liệu.
/// Không phải "đốt mạnh hơn" — đây là chỗ hay bị hiểu nhầm.
///
/// h(n) — cận dưới: quãng đường thẳng tới đích × suất tiêu thụ ở NƯỚC LẶNG.
/// Không ô nào rẻ hơn nước lặng, nên h không bao giờ vượt chi phí thật còn lại
/// ⇒ hàm chấp nhận được (admissible) ⇒ A* vẫn bảo đảm tìm ra tuyến tối ưu.
/// Đây cũng là lý do KHÔNG được nhân thêm hệ số "cho chắc" vào h: làm thế là đánh đổi
/// tính tối ưu lấy tốc độ, và phải nói rõ chứ không giấu.
///
/// Cả g và h cùng đơn vị TẤN — bắt buộc, vì trộn NM với tấn thì f = g + h vô nghĩa
/// và A* mất luôn tính chấp nhận được.
/// </summary>
public sealed class WeatherFuelCost : IHeuristicCost
{
    private readonly FuelModel _fuel;

    /// <summary>Suất tiêu thụ nước lặng (tấn/NM) — dùng cho h(n), tính sẵn một lần.</summary>
    private readonly double _calmTonsPerNm;

    public WeatherFuelCost(FuelModel fuel)
    {
        _fuel = fuel;
        var o = fuel.Options;
        _calmTonsPerNm = fuel.ServiceTonsPerHour() / o.ServiceSpeedKts;
    }

    /// <summary>Tham số nhiên liệu đang dùng (để ghi vào metrics của job).</summary>
    public FuelModel Fuel => _fuel;

    public double CalmTonsPerNm => _calmTonsPerNm;

    public double StepCost(RoutingGrid grid, GridCell from, GridCell to)
    {
        var a = grid.CellToLatLon(from);
        var b = grid.CellToLatLon(to);
        var distNm = GeoMath.HaversineNm(a, b);
        if (distNm <= 0) return 0.0;

        // Thời tiết lấy trung bình hai đầu cạnh: dùng riêng đầu nào cũng lệch, mà lấy mẫu
        // dọc cạnh thì đắt — cạnh chỉ dài bằng một ô lưới nên trung bình là đủ.
        var (waveA, windA, bearA) = grid.WeatherAt(from);
        var (waveB, windB, bearB) = grid.WeatherAt(to);
        var waveM = 0.5 * (waveA + waveB);
        var windMs = 0.5 * (windA + windB);

        if (waveM <= 0.0 && windMs <= 0.0)
            return distNm * _calmTonsPerNm;      // biển lặng: khỏi gọi mô hình

        // Hướng sóng lấy theo đầu cạnh có sóng lớn hơn — đầu kia có thể đang ở rìa vành
        // ảnh hưởng của một vùng khác, lấy trung bình hai phương vị là vô nghĩa
        // (trung bình của 350° và 10° ra 180°, tức ngược hẳn hướng thật).
        var waveBearing = waveA >= waveB ? bearA : bearB;
        var courseDeg = HazardWeatherField.BearingDeg(a, b);
        var relHeadingDeg = HazardWeatherField.RelativeHeadingDeg(courseDeg, waveBearing);

        var rate = _fuel.Evaluate(waveM, windMs, relHeadingDeg);

        // tấn/giờ ÷ hải lý/giờ = tấn/hải lý. Tốc độ thực tế giảm ⇒ tấn/NM tăng.
        var tonsPerNm = rate.TotalTonsPerHour / Math.Max(0.5, rate.EffectiveSpeedKts);
        return distNm * tonsPerNm;
    }

    public double Heuristic(RoutingGrid grid, GridCell from, GridCell goal) =>
        GeoMath.HaversineNm(grid.CellToLatLon(from), grid.CellToLatLon(goal)) * _calmTonsPerNm;

    /// <summary>
    /// Nhiên liệu (tấn) để đi hết một polyline bất kỳ dưới trường thời tiết đã cho.
    ///
    /// Dùng để đối chiếu tuyến A* với tuyến thẳng bằng CÙNG một thước đo — chính là con số
    /// chứng minh việc tối ưu có tác dụng. Không đi qua lưới nên dùng được cho cả đường
    /// baseline (vốn không có lưới nào).
    ///
    /// Lấy mẫu giữa mỗi đoạn thay vì chỉ ở hai đầu: đoạn baseline dài hàng trăm NM có thể
    /// xuyên giữa một vùng bão mà hai đầu đều nằm ngoài vành ảnh hưởng.
    /// </summary>
    public static double PolylineFuelTons(
        IReadOnlyList<LatLon> pts, IHazardProvider hazards, FuelModel fuel)
    {
        if (pts.Count < 2) return 0.0;

        var calmTonsPerNm = fuel.ServiceTonsPerHour() / fuel.Options.ServiceSpeedKts;
        var total = 0.0;

        for (var i = 0; i < pts.Count - 1; i++)
        {
            var a = pts[i];
            var b = pts[i + 1];
            var distNm = GeoMath.HaversineNm(a, b);
            if (distNm <= 0) continue;

            var samples = Math.Clamp((int)Math.Ceiling(distNm / 25.0), 1, 400);
            var courseDeg = HazardWeatherField.BearingDeg(a, b);
            var segTons = 0.0;

            for (var k = 0; k < samples; k++)
            {
                var t = (k + 0.5) / samples;
                var p = new LatLon(a.Lat + (b.Lat - a.Lat) * t,
                                   a.Lon + GeoMath.WrapLon(b.Lon - a.Lon) * t);

                var (waveM, windMs, waveBearing) = hazards.WeatherAt(p);
                var stepNm = distNm / samples;

                if (waveM <= 0.0 && windMs <= 0.0)
                {
                    segTons += stepNm * calmTonsPerNm;
                    continue;
                }

                var rel = HazardWeatherField.RelativeHeadingDeg(courseDeg, waveBearing);
                var rate = fuel.Evaluate(waveM, windMs, rel);
                segTons += stepNm * rate.TotalTonsPerHour / Math.Max(0.5, rate.EffectiveSpeedKts);
            }

            total += segTons;
        }

        return total;
    }

    /// <summary>
    /// Số giờ hải hành dọc một polyline dưới trường thời tiết đã cho, kèm số giờ nếu biển lặng.
    ///
    /// Mô hình công suất không đổi: máy đốt cùng một lượng tấn/giờ, sóng gió chỉ làm tàu chậm
    /// lại. Vì thế tỉ số <c>Hours / CalmHours</c> cũng chính là tỉ số nhiên liệu thời tiết / nước
    /// lặng — dùng để hiệu chỉnh nhiên liệu của bảng kế hoạch chặng mà không đổi mô hình của nó.
    /// Lấy mẫu giống <see cref="PolylineFuelTons"/>.
    /// </summary>
    public static (double Hours, double CalmHours) PolylineSailingHours(
        IReadOnlyList<LatLon> pts, IHazardProvider hazards, FuelModel fuel)
    {
        var speed = fuel.Options.ServiceSpeedKts;
        var hours = 0.0;
        var calmHours = 0.0;

        for (var i = 0; i < pts.Count - 1; i++)
        {
            var a = pts[i];
            var b = pts[i + 1];
            var distNm = GeoMath.HaversineNm(a, b);
            if (distNm <= 0) continue;

            calmHours += distNm / speed;

            var samples = Math.Clamp((int)Math.Ceiling(distNm / 25.0), 1, 400);
            var courseDeg = HazardWeatherField.BearingDeg(a, b);
            var stepNm = distNm / samples;

            for (var k = 0; k < samples; k++)
            {
                var t = (k + 0.5) / samples;
                var p = new LatLon(a.Lat + (b.Lat - a.Lat) * t,
                                   a.Lon + GeoMath.WrapLon(b.Lon - a.Lon) * t);

                var (waveM, windMs, waveBearing) = hazards.WeatherAt(p);
                if (waveM <= 0.0 && windMs <= 0.0)
                {
                    hours += stepNm / speed;
                    continue;
                }

                var rel = HazardWeatherField.RelativeHeadingDeg(courseDeg, waveBearing);
                hours += stepNm / Math.Max(0.5, fuel.Evaluate(waveM, windMs, rel).EffectiveSpeedKts);
            }
        }

        return (hours, calmHours);
    }
}
