using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ProductApi.Models.WeatherRouting;

/// <summary>
/// Thông số hiệu năng / nhiên liệu của tàu, dùng cho mô hình tiêu thụ nhiên liệu
/// và lập kế hoạch chia chặng (bunkering plan).
/// Table: vessel_fuel_profiles
///
/// Ghi chú: bảng Vessels hiện KHÔNG có sức chứa nhiên liệu / công suất máy / SFOC,
/// nên các giá trị này được tách riêng và có cột <see cref="Source"/> để phân biệt
/// số liệu thật (từ hồ sơ tàu) và số liệu ước lượng.
/// </summary>
[Table("vessel_fuel_profiles")]
public class VesselFuelProfile
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// <summary>Mỗi tàu có 1 hồ sơ (unique index).</summary>
    public Guid VesselId { get; set; }

    [MaxLength(100)]
    public string? VesselName { get; set; }

    [MaxLength(20)]
    public string FuelType { get; set; } = "VLSFO";

    /// <summary>Sức chứa nhiên liệu tối đa (tấn).</summary>
    public double FuelCapacityTons { get; set; } = 220;

    /// <summary>Nhiên liệu hiện có trên tàu khi lập kế hoạch (tấn). Null = lấy theo tỷ lệ mặc định.</summary>
    public double? CurrentFuelTons { get; set; }

    /// <summary>Tỷ lệ dự trữ an toàn bắt buộc khi cập cảng (0.20 = 20%).</summary>
    public double ReserveFraction { get; set; } = 0.20;

    /// <summary>Tốc độ khai thác (hải lý/giờ).</summary>
    public double ServiceSpeedKts { get; set; } = 11.5;

    /// <summary>Công suất trục tại tốc độ khai thác, nước lặng (kW).</summary>
    public double ServicePowerKw { get; set; } = 900;

    /// <summary>SFOC máy chính (g/kWh) — MAN B&W/Wärtsilä: 2 kỳ 165–180, 4 kỳ 185–215.</summary>
    public double SfocMainGPerKwh { get; set; } = 180;

    /// <summary>Phụ tải máy đèn / tổng phụ (kW).</summary>
    public double AuxLoadKw { get; set; } = 120;

    /// <summary>SFOC máy đèn (g/kWh).</summary>
    public double SfocAuxGPerKwh { get; set; } = 215;

    /// <summary>Dung sai biển (sea margin).</summary>
    public double SeaMarginFraction { get; set; } = 0.15;

    /// <summary>Số mũ công suất–tốc độ (định luật chân vịt = 3).</summary>
    public double SpeedExponent { get; set; } = 3.0;

    /// <summary>Dung sai thời tiết khi lập kế hoạch chặng.</summary>
    public double WeatherAllowanceFraction { get; set; } = 0.08;

    /// <summary>Thời gian đỗ tại cảng tiếp nhiên liệu (giờ).</summary>
    public double PortStayHours { get; set; } = 8.0;

    /// <summary>Độ lệch ngang tối đa cho phép khi chọn cảng tiếp nhiên liệu (NM).</summary>
    public double MaxDetourNm { get; set; } = 250;

    /// <summary>ESTIMATE | OWNER | TRIAL | CLASS</summary>
    [MaxLength(20)]
    public string Source { get; set; } = "ESTIMATE";

    [MaxLength(500)]
    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(VesselId))]
    public Vessel? Vessel { get; set; }
}
