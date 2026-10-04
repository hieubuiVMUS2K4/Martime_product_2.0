namespace ProductApi.Services.WeatherRouting;

/// <summary>
/// Tham số hiệu năng / nhiên liệu của tàu dùng cho mô hình tiêu thụ.
///
/// Cơ sở công thức:
///  - Định luật chân vịt (propeller law / admiralty): P ∝ V^3 khi cùng lượng chiếm nước.
///    => công suất cần thiết tăng theo lập phương tốc độ.
///  - SFOC (specific fuel oil consumption, g/kWh): m_dot = SFOC * P.
///    (MAN B&W / Wärtsilä project guide: 2 kỳ chậm 165–180 g/kWh, 4 kỳ 185–215 g/kWh.)
///  - Tổn thất tốc độ do sóng gió (involuntary speed loss) xấp xỉ theo bình phương
///    chiều cao sóng và bình phương tốc độ gió, chiếu theo hướng tương đối.
///    (Molland et al., "Ship Resistance and Propulsion"; ISO 15016 speed/power trial analysis.)
///
/// Hệ quả: PIF (power increase factor) = 1/(1-λ)^3 — quan hệ chuẩn giữa tổn thất tốc độ
/// và mức tăng công suất/sức cản để giữ nguyên tốc độ.
/// </summary>
public sealed class FuelModelOptions
{
    /// <summary>Sức chứa nhiên liệu tối đa (tấn).</summary>
    public double FuelCapacityTons { get; init; } = 220;

    /// <summary>Nhiên liệu hiện có trên tàu khi khởi hành (tấn).</summary>
    public double CurrentFuelTons { get; init; } = 160;

    /// <summary>Tỷ lệ dự trữ an toàn bắt buộc khi cập cảng (0.20 = 20%).</summary>
    public double ReserveFraction { get; init; } = 0.20;

    /// <summary>Tốc độ khai thác (hải lý/giờ).</summary>
    public double ServiceSpeedKts { get; init; } = 11.5;

    /// <summary>Công suất trục tại tốc độ khai thác, nước lặng (kW).</summary>
    public double ServicePowerKw { get; init; } = 900;

    /// <summary>SFOC máy chính (g/kWh).</summary>
    public double SfocMainGPerKwh { get; init; } = 180;

    /// <summary>Phụ tải máy đèn / tổng phụ (kW).</summary>
    public double AuxLoadKw { get; init; } = 120;

    /// <summary>SFOC máy đèn (g/kWh).</summary>
    public double SfocAuxGPerKwh { get; init; } = 215;

    /// <summary>Dung sai biển (sea margin) — mức tăng tiêu thụ so với điều kiện lý tưởng.</summary>
    public double SeaMarginFraction { get; init; } = 0.15;

    /// <summary>Số mũ quan hệ công suất - tốc độ (định luật chân vịt = 3).</summary>
    public double SpeedExponent { get; init; } = 3.0;

    /// <summary>Hệ số tổn thất tốc độ theo H_s^2 (1/m^2), hướng ngược sóng.</summary>
    public double WaveSpeedLossPerM2 { get; init; } = 0.0125;

    /// <summary>Hệ số tổn thất tốc độ theo V_wind^2 (1/(m/s)^2), hướng ngược gió.</summary>
    public double WindSpeedLossPerMs2 { get; init; } = 2.2e-4;

    /// <summary>Trần tổn thất tốc độ (tránh V_eff -> 0).</summary>
    public double MaxSpeedLossFraction { get; init; } = 0.55;

    /// <summary>
    /// Dung sai thời tiết khi ước lượng tầm hoạt động mà CHƯA có lưới thời tiết
    /// (dùng trường hợp lập kế hoạch chặng). 0.08 = +8% tiêu thụ.
    /// </summary>
    public double WeatherAllowanceFraction { get; init; } = 0.08;

    /// <summary>Thời gian đỗ tại cảng tiếp nhiên liệu (giờ).</summary>
    public double PortStayHours { get; init; } = 8.0;

    public FuelModelOptions Clamped()
    {
        var cap = FuelCapacityTons > 0 ? FuelCapacityTons : 220;
        var speed = ServiceSpeedKts > 0.5 ? ServiceSpeedKts : 11.5;
        return new FuelModelOptions
        {
            FuelCapacityTons = cap,
            CurrentFuelTons = Math.Clamp(CurrentFuelTons, 0, cap),
            ReserveFraction = Math.Clamp(ReserveFraction, 0.0, 0.6),
            ServiceSpeedKts = speed,
            ServicePowerKw = Math.Clamp(ServicePowerKw, 50, 80_000),
            SfocMainGPerKwh = Math.Clamp(SfocMainGPerKwh, 100, 400),
            AuxLoadKw = Math.Clamp(AuxLoadKw, 0, 20_000),
            SfocAuxGPerKwh = Math.Clamp(SfocAuxGPerKwh, 100, 400),
            SeaMarginFraction = Math.Clamp(SeaMarginFraction, 0, 0.5),
            SpeedExponent = Math.Clamp(SpeedExponent, 2.0, 4.0),
            WaveSpeedLossPerM2 = Math.Clamp(WaveSpeedLossPerM2, 0, 0.1),
            WindSpeedLossPerMs2 = Math.Clamp(WindSpeedLossPerMs2, 0, 0.01),
            MaxSpeedLossFraction = Math.Clamp(MaxSpeedLossFraction, 0.05, 0.8),
            WeatherAllowanceFraction = Math.Clamp(WeatherAllowanceFraction, 0, 0.5),
            PortStayHours = Math.Clamp(PortStayHours, 0, 72)
        };
    }
}

/// <summary>Kết quả tính công suất - tiêu thụ tại một điều kiện cụ thể.</summary>
public readonly record struct FuelRate(
    double EffectiveSpeedKts,
    double ShaftPowerKw,
    double PowerIncreaseFactor,
    double AddedResistanceRatio,
    double MainTonsPerHour,
    double AuxTonsPerHour,
    double TotalTonsPerHour);

/// <summary>Mô hình tiêu thụ nhiên liệu dùng chung cho A* cost + lập kế hoạch chặng.</summary>
public sealed class FuelModel
{
    private readonly FuelModelOptions _o;

    public FuelModel(FuelModelOptions options) => _o = options.Clamped();

    public FuelModelOptions Options => _o;

    public double MinReserveTons => _o.ReserveFraction * _o.FuelCapacityTons;

    /// <summary>Mức tiêu thụ nhiên liệu (tấn/giờ) tại tốc độ thực tế V.</summary>
    public double TotalTonsPerHour(double speedKts)
    {
        var v = Math.Max(0.1, speedKts);
        var p = _o.ServicePowerKw * Math.Pow(v / _o.ServiceSpeedKts, _o.SpeedExponent);
        var main = _o.SfocMainGPerKwh * p / 1_000_000.0;          // g/kWh * kW -> t/h
        var aux = _o.SfocAuxGPerKwh * _o.AuxLoadKw / 1_000_000.0;
        return (main + aux) * (1.0 + _o.SeaMarginFraction);
    }

    /// <summary>Tiêu thụ khi máy chạy ở điểm công suất khai thác (dùng cho mô hình công suất không đổi).</summary>
    public double ServiceTonsPerHour() => TotalTonsPerHour(_o.ServiceSpeedKts);

    /// <summary>Tổn thất tốc độ do sóng (lambda_wave), hướng tương đối 0 = ngược sóng.</summary>
    public double WaveSpeedLoss(double waveHeightM, double relativeHeadingDeg)
    {
        if (waveHeightM <= 0) return 0;
        var headFactor = 0.5 * (1.0 + Math.Cos(relativeHeadingDeg * Math.PI / 180.0));
        return _o.WaveSpeedLossPerM2 * waveHeightM * waveHeightM * headFactor;
    }

    /// <summary>Tổn thất tốc độ do gió (lambda_wind).</summary>
    public double WindSpeedLoss(double windSpeedMs, double relativeHeadingDeg)
    {
        if (windSpeedMs <= 0) return 0;
        var headFactor = 0.5 * (1.0 + Math.Cos(relativeHeadingDeg * Math.PI / 180.0));
        return _o.WindSpeedLossPerMs2 * windSpeedMs * windSpeedMs * headFactor;
    }

    /// <summary>
    /// Tính trạng thái tại một điểm: tốc độ thực tế, công suất, tiêu thụ.
    /// Mô hình CÔNG SUẤT KHÔNG ĐỔI: máy chính giữ ở điểm khai thác, tàu bị mất tốc độ
    /// khi gặp sóng gió => thời gian đi tăng => tiêu thụ trên mỗi hải lý tăng.
    /// </summary>
    public FuelRate Evaluate(double waveHeightM, double windSpeedMs, double relativeHeadingDeg)
    {
        var loss = WaveSpeedLoss(waveHeightM, relativeHeadingDeg)
                 + WindSpeedLoss(windSpeedMs, relativeHeadingDeg);
        loss = Math.Clamp(loss, 0.0, _o.MaxSpeedLossFraction);

        var vEff = _o.ServiceSpeedKts * (1.0 - loss);
        var pif = 1.0 / Math.Pow(1.0 - loss, 3.0);       // power increase factor
        var shaftKw = _o.ServicePowerKw;                  // công suất không đổi

        var main = _o.SfocMainGPerKwh * shaftKw / 1_000_000.0;
        var aux = _o.SfocAuxGPerKwh * _o.AuxLoadKw / 1_000_000.0;
        var total = (main + aux) * (1.0 + _o.SeaMarginFraction);

        return new FuelRate(vEff, shaftKw, pif, pif - 1.0, main, aux, total);
    }

    /// <summary>Tiêu thụ trên mỗi hải lý (tấn/NM) tại tốc độ thực tế.</summary>
    public double TonsPerNm(double effectiveSpeedKts)
    {
        var v = Math.Max(0.5, effectiveSpeedKts);
        return TotalTonsPerHour(_o.ServiceSpeedKts) / v;
    }

    /// <summary>Tiêu thụ/NM nước lặng tại tốc độ khai thác — dùng cho lập kế hoạch chặng.</summary>
    public double PlanTonsPerNm()
    {
        var baseQ = ServiceTonsPerHour() / _o.ServiceSpeedKts;
        return baseQ * (1.0 + _o.WeatherAllowanceFraction);
    }

    /// <summary>Nhiên liệu có thể đốt trước khi chạm mức dự trữ an toàn (tấn).</summary>
    public double BurnableTons(double fuelOnBoardTons) =>
        Math.Max(0, fuelOnBoardTons - MinReserveTons);

    /// <summary>Tầm hoạt động còn lại (NM) với lượng nhiên liệu hiện có.</summary>
    public double RangeNm(double fuelOnBoardTons)
    {
        var q = PlanTonsPerNm();
        return q <= 0 ? 0 : BurnableTons(fuelOnBoardTons) / q;
    }

    /// <summary>Tóm tắt thông số để lưu vào metrics/notes.</summary>
    public object Describe() => new
    {
        fuelCapacityTons = _o.FuelCapacityTons,
        currentFuelTons = _o.CurrentFuelTons,
        reserveFraction = _o.ReserveFraction,
        reserveTons = MinReserveTons,
        serviceSpeedKts = _o.ServiceSpeedKts,
        servicePowerKw = _o.ServicePowerKw,
        sfocMainGPerKwh = _o.SfocMainGPerKwh,
        sfocAuxGPerKwh = _o.SfocAuxGPerKwh,
        auxLoadKw = _o.AuxLoadKw,
        seaMarginFraction = _o.SeaMarginFraction,
        weatherAllowanceFraction = _o.WeatherAllowanceFraction,
        tonsPerDay = TotalTonsPerHour(_o.ServiceSpeedKts) * 24.0,
        tonsPerNm = PlanTonsPerNm(),
        rangeNm = RangeNm(_o.CurrentFuelTons),
        model = "constant-power propeller-law + SFOC"
    };
}
