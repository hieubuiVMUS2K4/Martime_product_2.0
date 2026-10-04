using System.ComponentModel.DataAnnotations;

namespace ProductApi.DTOs.WeatherRouting;

public class CreateWeatherRoutingJobRequest
{
    /// <summary>Optional vessel id (MEKONG nullable for demo).</summary>
    public Guid? VesselId { get; set; }

    /// <summary>Default: Vũng Tàu 10.346</summary>
    [Range(-90, 90)]
    public double? StartLat { get; set; }

    /// <summary>Default: Vũng Tàu 107.084</summary>
    [Range(-180, 180)]
    public double? StartLon { get; set; }

    /// <summary>Default: Đà Nẵng 16.054</summary>
    [Range(-90, 90)]
    public double? GoalLat { get; set; }

    /// <summary>Default: Đà Nẵng 108.202</summary>
    [Range(-180, 180)]
    public double? GoalLon { get; set; }

    /// <summary>Grid resolution (cells per axis). Default 80. Clamped 50–120.</summary>
    public int? GridSize { get; set; }

    /// <summary>Mock storm radius NM around Cam Ranh. Default 40.</summary>
    public double? MockStormRadiusNm { get; set; }

    /// <summary>
    /// Seed sinh thiên tai demo. Cùng seed + cùng điểm đầu/cuối cho ra cùng tập thiên tai
    /// (để bản đồ và tuyến né khớp nhau). Bỏ trống = sinh ngẫu nhiên.
    /// </summary>
    public int? HazardSeed { get; set; }

    /// <summary>Số vùng thiên tai demo (0 = không có thiên tai). Mặc định 8.</summary>
    [Range(0, 40)]
    public int? HazardCount { get; set; }

    // ---------- Lập kế hoạch n chặng (bunkering plan) ----------

    /// <summary>Hành trình gắn với job. Nếu có, kế hoạch chặng sẽ được ghi vào voyage_plan_legs.</summary>
    public Guid? VoyageId { get; set; }

    /// <summary>Bật/tắt sinh kế hoạch n chặng. Mặc định bật.</summary>
    public bool? PlanLegs { get; set; }

    /// <summary>Nhiên liệu hiện có (tấn). Null = theo hồ sơ tàu.</summary>
    [Range(0, 100000)]
    public double? CurrentFuelTons { get; set; }

    /// <summary>Sức chứa nhiên liệu (tấn). Null = theo hồ sơ tàu.</summary>
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

    /// <summary>Giới hạn danh sách cảng tiếp nhiên liệu (mã cảng). Bỏ trống = toàn bộ bảng ports.</summary>
    public List<string>? PortCodes { get; set; }

    /// <summary>Cảng BẮT BUỘC phải ghé (nhập hàng/thủ tục). Tuỳ chọn.</summary>
    public List<string>? MustVisitPortCodes { get; set; }

    /// <summary>Hướng tuyến dựng hành lang chặng: auto | eastbound | westbound | custom.</summary>
    [MaxLength(20)]
    public string? RoutePreference { get; set; }

    /// <summary>Chuỗi cảng mốc khi RoutePreference = custom.</summary>
    public List<string>? CorridorViaPortCodes { get; set; }

    /// <summary>Thời điểm khởi hành (UTC) dùng để tính ETA của các chặng.</summary>
    public DateTime? DepartureUtc { get; set; }
}

public class ReplanWeatherRoutingJobRequest
{
    public int? GridSize { get; set; }
    public double? MockStormRadiusNm { get; set; }
}

public class WeatherRoutingJobDto
{
    public Guid Id { get; set; }
    public Guid? VesselId { get; set; }
    public double StartLat { get; set; }
    public double StartLon { get; set; }
    public double GoalLat { get; set; }
    public double GoalLon { get; set; }
    public string Status { get; set; } = "";
    public int Version { get; set; }
    public object? Request { get; set; }
    public object? Hazards { get; set; }
    public object? Metrics { get; set; }

    /// <summary>Kế hoạch n chặng (bunkering plan) sinh kèm lần chạy này.</summary>
    public VoyageLegPlanDto? Plan { get; set; }

    public string? ErrorMessage { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public List<WeatherRoutingRouteDto> Routes { get; set; } = new();
}

public class WeatherRoutingRouteDto
{
    public Guid Id { get; set; }
    public Guid JobId { get; set; }
    public string Kind { get; set; } = "";
    public int Version { get; set; }
    public List<LatLonDto> Waypoints { get; set; } = new();
    public object? Metrics { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class LatLonDto
{
    public double Lat { get; set; }
    public double Lon { get; set; }
}

public class WeatherRoutingJobListItemDto
{
    public Guid Id { get; set; }
    public Guid? VesselId { get; set; }
    public double StartLat { get; set; }
    public double StartLon { get; set; }
    public double GoalLat { get; set; }
    public double GoalLon { get; set; }
    public string Status { get; set; } = "";
    public int Version { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
}
