namespace ProductApi.DTOs.WeatherRouting;

/// <summary>Tập vùng thiên tai dùng để vẽ lên bản đồ và để tuyến né theo.</summary>
public class HazardZoneSetDto
{
    /// <summary>Seed đã dùng — truyền lại vào job để tuyến né đúng tập vùng này.</summary>
    public int Seed { get; set; }

    public int Count { get; set; }

    /// <summary>Danh sách vùng thiên tai (hazardType, name, center, radiusNm, severity, icon, color).</summary>
    public List<object> Zones { get; set; } = new();

    /// <summary>Danh mục loại thiên tai để hiển thị chú thích (legend) trên bản đồ.</summary>
    public List<object> Legend { get; set; } = new();
}
