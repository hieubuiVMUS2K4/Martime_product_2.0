using System.ComponentModel.DataAnnotations;

namespace ProductApi.DTOs.WeatherRouting;

/// <summary>Yêu cầu lập kế hoạch n chặng (bunkering plan) cho một hành trình.</summary>
public class PlanVoyageLegsRequest
{
    /// <summary>Hành trình cần lập kế hoạch. Nếu null sẽ dùng cặp toạ độ bên dưới.</summary>
    public Guid? VoyageId { get; set; }

    public Guid? VesselId { get; set; }

    [Range(-90, 90)]
    public double? StartLat { get; set; }

    [Range(-180, 180)]
    public double? StartLon { get; set; }

    [Range(-90, 90)]
    public double? GoalLat { get; set; }

    [Range(-180, 180)]
    public double? GoalLon { get; set; }

    [MaxLength(5)]
    public string? StartPortCode { get; set; }

    [MaxLength(5)]
    public string? GoalPortCode { get; set; }

    /// <summary>Nhiên liệu hiện có (tấn). Null = lấy từ hồ sơ tàu.</summary>
    [Range(0, 100000)]
    public double? CurrentFuelTons { get; set; }

    /// <summary>Sức chứa nhiên liệu (tấn). Null = lấy từ hồ sơ tàu.</summary>
    [Range(1, 100000)]
    public double? FuelCapacityTons { get; set; }

    /// <summary>Tỷ lệ dự trữ khi cập cảng (0.20 = 20%).</summary>
    [Range(0, 0.6)]
    public double? ReserveFraction { get; set; }

    [Range(1, 40)]
    public double? ServiceSpeedKts { get; set; }

    [Range(50, 80000)]
    public double? ServicePowerKw { get; set; }

    /// <summary>Độ lệch ngang tối đa khi chọn cảng tiếp nhiên liệu (NM).</summary>
    [Range(10, 1000)]
    public double? MaxDetourNm { get; set; }

    /// <summary>Chỉ dùng các cảng này (mã cảng). Bỏ trống = toàn bộ bảng ports.</summary>
    public List<string>? PortCodes { get; set; }

    /// <summary>Ghi kết quả vào bảng voyage_plan_legs (chỉ khi có VoyageId).</summary>
    public bool Persist { get; set; } = true;

    /// <summary>Tinh chỉnh khoảng cách từng chặng bằng A*.</summary>
    public bool RefineLegDistances { get; set; } = true;

    /// <summary>
    /// Chỉ chạy A* để lấy khoảng cách thật cho chặng có đường chim bay ≤ ngưỡng này (NM).
    /// Đặt quá thấp thì chặng dài sẽ rơi về ước lượng theo hành lang — vốn cao hơn
    /// thực tế ~15–20%, khiến bảng kế hoạch lệch với polyline vẽ trên bản đồ.
    /// </summary>
    [Range(100, 20000)]
    public double? RefineMaxStraightNm { get; set; }

    /// <summary>
    /// Hướng tuyến dùng để dựng hành lang: auto | eastbound | westbound | custom.
    ///   auto      = thử hành lang A* trước, nếu không tới được đích thì thử tuyến hub phía tây.
    ///   eastbound = hành lang A* (mặc định của module tối ưu tuyến).
    ///   westbound = tuyến hub qua Malacca – Suez – Gibraltar (nơi có nhiều cảng bunker).
    ///   custom    = dùng đúng CorridorViaPortCodes.
    /// </summary>
    [MaxLength(20)]
    public string? RoutePreference { get; set; }

    /// <summary>Chuỗi cảng mốc để dựng hành lang (theo thứ tự). Dùng khi RoutePreference = custom.</summary>
    public List<string>? CorridorViaPortCodes { get; set; }

    /// <summary>Cảng BẮT BUỘC phải ghé (nhập hàng/thủ tục) — tuỳ chọn.</summary>
    public List<string>? MustVisitPortCodes { get; set; }

    /// <summary>Seed sinh thiên tai demo (phải trùng job để chặng né đúng vùng đã vẽ).</summary>
    public int? HazardSeed { get; set; }

    /// <summary>Số vùng thiên tai demo. 0 = không né thiên tai.</summary>
    [Range(0, 40)]
    public int? HazardCount { get; set; }

    public DateTime? DepartureUtc { get; set; }
}

/// <summary>Một chặng con trong kế hoạch.</summary>
public class VoyageLegDto
{
    public int Sequence { get; set; }
    public string? FromPortCode { get; set; }
    public string? FromPortName { get; set; }
    public string? ToPortCode { get; set; }
    public string? ToPortName { get; set; }

    public double? FromLat { get; set; }
    public double? FromLon { get; set; }
    public double? ToLat { get; set; }
    public double? ToLon { get; set; }

    public double DistanceNm { get; set; }
    public double DurationHours { get; set; }
    public double AverageSpeedKts { get; set; }

    public DateTime DepartureUtc { get; set; }
    public DateTime ArrivalUtc { get; set; }

    public double FuelOnDepartureTons { get; set; }
    public double FuelConsumedTons { get; set; }
    public double FuelOnArrivalTons { get; set; }
    public double FuelOnArrivalPercent { get; set; }
    public double BunkerTons { get; set; }

    public bool IsBunkerStop { get; set; }

    /// <summary>Vai trò cảng đến: START | BUNKER | MANDATORY | END.</summary>
    public string StopKind { get; set; } = "BUNKER";

    public double PortOffsetNm { get; set; }

    /// <summary>Polyline đường biển thật của chặng (nối hai cảng) để vẽ lên bản đồ.</summary>
    public List<LatLonDto> Waypoints { get; set; } = new();

    public string? Notes { get; set; }
}

/// <summary>Kế hoạch n chặng hoàn chỉnh.</summary>
public class VoyageLegPlanDto
{    public Guid? VoyageId { get; set; }
    public Guid? VesselId { get; set; }

    public double TotalDistanceNm { get; set; }
    public double TotalFuelTons { get; set; }
    public double TotalHours { get; set; }
    public int LegCount { get; set; }
    public int BunkerStopCount { get; set; }

    public double InitialFuelTons { get; set; }
    public double FinalFuelTons { get; set; }
    public double FuelCapacityTons { get; set; }
    public double ReserveTons { get; set; }
    public double ReserveFraction { get; set; }
    public double TonsPerNm { get; set; }
    public double TonsPerDay { get; set; }
    public double ServiceSpeedKts { get; set; }
    public double RangeAtDepartureNm { get; set; }

    public DateTime DepartureUtc { get; set; }
    public DateTime ArrivalUtc { get; set; }

    public string Model { get; set; } = "";

    /// <summary>Nguồn hành lang tuyến đã dùng: astar-eastbound | hub-westbound | custom.</summary>
    public string? CorridorSource { get; set; }

    /// <summary>
    /// Kết quả đối chiếu polyline từng chặng với các vùng thiên tai — để kiểm chứng được
    /// ngay trên giao diện, không phải nhìn bản đồ đoán.
    /// </summary>
    public HazardAvoidanceDto? HazardAvoidance { get; set; }

    public List<string> Warnings { get; set; } = new();
    public List<VoyageLegDto> Legs { get; set; } = new();

    /// <summary>Hồ sơ nhiên liệu đã dùng (kèm nguồn số liệu).</summary>
    public object? FuelProfile { get; set; }
}

/// <summary>
/// Kết quả đối chiếu polyline từng chặng với các vùng thiên tai.
/// Có số này thì trả lời được ngay “tuyến có né thiên tai không” mà không phải nhìn bản đồ đoán.
/// </summary>
public class HazardAvoidanceDto
{
    /// <summary>Tổng số vùng thiên tai của lượt chạy.</summary>
    public int TotalZones { get; set; }

    /// <summary>Số vùng tuyến không hề chạm tới.</summary>
    public int AvoidedZones { get; set; }

    /// <summary>Số vùng tuyến đi xuyên vào.</summary>
    public int PiercedZones { get; set; }

    /// <summary>Khoảng hở nhỏ nhất tới mép vùng gần nhất (NM).</summary>
    public double MinClearanceNm { get; set; }

    /// <summary>Độ xuyên sâu nhất vào một vùng (NM). 0 = không xuyên vùng nào.</summary>
    public double DeepestPenetrationNm { get; set; }
}
