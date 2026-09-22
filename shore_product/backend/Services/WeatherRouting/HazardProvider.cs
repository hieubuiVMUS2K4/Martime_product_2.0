namespace ProductApi.Services.WeatherRouting;

public interface IHazardProvider
{
    bool IsBlocked(LatLon point);
    IReadOnlyList<object> DescribeHazards();

    /// <summary>
    /// Các điểm mà lưới tìm kiếm BẮT BUỘC phải bao phủ (ví dụ tâm bão), để A* có thể
    /// đi vòng qua. Trả về rỗng nếu hazard không giới hạn vùng cụ thể.
    /// </summary>
    IReadOnlyList<LatLon> InfluencePoints();

    /// <summary>
    /// Danh sách vùng dạng hình tròn (tâm + bán kính) để vẽ đường vòng ở MỨC HÌNH HỌC.
    /// Rỗng nếu hazard không biểu diễn được bằng vòng tròn.
    /// </summary>
    IReadOnlyList<HazardZone> Zones => Array.Empty<HazardZone>();
}

/// <summary>Không có hazard — dùng khi chỉ cần khoảng cách đường biển (lập kế hoạch chặng).</summary>
public sealed class NoHazardProvider : IHazardProvider
{
    public static readonly NoHazardProvider Instance = new();

    public bool IsBlocked(LatLon point) => false;

    public IReadOnlyList<object> DescribeHazards() => Array.Empty<object>();

    public IReadOnlyList<LatLon> InfluencePoints() => Array.Empty<LatLon>();
}

/// <summary>MOCK circular storm — Pacific corridor for VN→Panama demo.</summary>
public sealed class MockCamRanhHazardProvider : IHazardProvider
{
    private readonly LatLon _center;
    private readonly double _radiusNm;

    public MockCamRanhHazardProvider(
        LatLon? center = null,
        double? radiusNm = null)
    {
        _center = center ?? WeatherRoutingDemoDefaults.MockStormCenter;
        _radiusNm = radiusNm is > 0
            ? radiusNm.Value
            : WeatherRoutingDemoDefaults.DefaultStormRadiusNm;
    }

    public LatLon Center => _center;

    public double RadiusNm => _radiusNm;

    public bool IsBlocked(LatLon point) =>
        GeoMath.HaversineNm(point, _center) <= _radiusNm;

    public IReadOnlyList<object> DescribeHazards() =>
    [
        new
        {
            type = "mock_storm_circle",
            name = "Pacific mock storm",
            center = new { lat = _center.Lat, lon = _center.Lon },
            radiusNm = _radiusNm,
            source = "MOCK"
        }
    ];

    public IReadOnlyList<LatLon> InfluencePoints() => new[] { _center };
}
