namespace ProductApi.Services.WeatherRouting;

public interface IGridBuilder
{
    /// <param name="paddingScale">
    /// Hệ số nới khung lưới quanh start/goal. Dùng &gt; 1 khi tuyến cần vòng ra ngoài
    /// phạm vi mặc định (ví dụ tới cảng Đại Tây Dương phải qua Gibraltar).
    /// </param>
    RoutingGrid Build(LatLon start, LatLon goal, IHazardProvider hazards, int gridSize, double paddingScale = 1.0);
}

public sealed class GridBuilder : IGridBuilder
{
    public RoutingGrid Build(LatLon start, LatLon goal, IHazardProvider hazards, int gridSize, double paddingScale = 1.0)
    {
        gridSize = Math.Clamp(gridSize, WeatherRoutingDemoDefaults.MinGridSize, WeatherRoutingDemoDefaults.MaxGridSize);
        LandMask.EnsureLoaded();
        if (LandMask.LoadError is not null)
            throw new InvalidOperationException("Land mask failed to load: " + LandMask.LoadError);

        var startLon = start.Lon;
        // Hướng ngắn nhất (có thể về tây) — không ép về phía đông.
        var goalLonU = GeoMath.UnwrapShortestLon(start.Lon, goal.Lon);

        var minLat = Math.Min(start.Lat, goal.Lat);
        var maxLat = Math.Max(start.Lat, goal.Lat);
        var lonSpan = Math.Abs(goalLonU - startLon);
        lonSpan = Math.Max(1.0, lonSpan);
        var latPad = Math.Clamp(Math.Max(15.0, lonSpan * 0.14), 15.0, 40.0);
        var lonPad = Math.Max(5.0, lonSpan * 0.03);

        // Tuyến ven bờ ngắn: khung tối thiểu 15°/5° khiến ô lưới thô ~20 NM, không thấy được
        // cửa sông/delta (Antwerp → Rotterdam 44 NM phải vòng qua cửa Scheldt rồi ra Bắc Hải).
        // Co khung theo độ dài hành trình để ô lưới đủ mịn. Tuyến dài không bị ảnh hưởng
        // vì coastPad > 15 ngay khi hành trình > ~380 NM.
        var straightNm = GeoMath.HaversineNm(start, goal);
        var coastPad = Math.Max(1.5, straightNm * 0.04);
        latPad = Math.Min(latPad, coastPad);
        lonPad = Math.Min(lonPad, coastPad);

        // Nới khung theo yêu cầu: tuyến có thể phải vòng ra ngoài dải start→goal
        // (ví dụ Vũng Tàu → Le Havre buộc qua Gibraltar ở −5.6° trong khi bbox chỉ tới −4.89°).
        //
        // Trần TUYỆT ĐỐI là bắt buộc: mặc định latPad tới 40°, nhân với paddingScale 10x
        // thành 400° (rồi bị kẹp ở 80°) — tức nửa địa cầu. Ô lưới khi đó thô ~90 NM, không
        // biểu diễn nổi bờ biển, và A* có thể vòng qua cả châu Phi cho một chặng 736 NM
        // (ESVLC→BEANR từng bị vẽ thành 14 089 NM, cắt đất 4 đoạn).
        if (paddingScale > 1.0)
        {
            lonPad = Math.Min(lonPad * paddingScale, 40.0);
            latPad = Math.Min(latPad * paddingScale, 30.0);
        }

        minLat -= latPad;
        maxLat += latPad;
        var minLon = Math.Min(startLon, goalLonU) - lonPad;
        var maxLon = Math.Max(startLon, goalLonU) + lonPad;

        // Mở rộng bbox theo vùng ảnh hưởng do hazard tự khai báo (không hardcode vị trí bão).
        foreach (var influence in hazards.InfluencePoints())
        {
            var lonU = GeoMath.UnwrapShortestLon(startLon, influence.Lon);
            // Điểm ảnh hưởng phải nằm cùng nhánh kinh độ với hành trình.
            while (lonU < minLon - 180.0) lonU += 360.0;
            while (lonU > maxLon + 180.0) lonU -= 360.0;

            // Chỉ nới cho vùng hơi ló ra ngoài khung hiện tại. Nới cho MỌI vùng khiến khung
            // phình tới toàn cầu khi thiên tai rải dọc một tuyến dài: 24 vùng trải trên
            // 7 900 NM là đủ đẩy bbox ra cả hai bán cầu. Vùng nằm trong khung rồi thì không
            // cần nới, mà vùng ở xa hành trình cũng chẳng giúp gì cho A*.
            var needLat = Math.Max(0.0, Math.Max(influence.Lat - maxLat, minLat - influence.Lat));
            var needLon = Math.Max(0.0, Math.Max(lonU - maxLon, minLon - lonU));
            if (needLat > 6.0 || needLon > 12.0) continue;

            minLat = Math.Min(minLat, influence.Lat - 3.0);
            maxLat = Math.Max(maxLat, influence.Lat + 3.0);
            minLon = Math.Min(minLon, lonU - 6.0);
            maxLon = Math.Max(maxLon, lonU + 6.0);
        }

        // Trần vĩ độ phải với tới mũi Horn (−55.98) thì tuyến vòng Nam Mỹ mới đi được.
        // Trước đây chặn ở −55.0 nên A* không bao giờ qua được eo Drake và buộc phải
        // vòng lên Panama: Valparaíso → Buenos Aires bị tính 8 300 NM thay vì ~2 400 NM.
        minLat = Math.Clamp(minLat, -62.0, 70.0);
        maxLat = Math.Clamp(maxLat, -55.0, 75.0);
        if (maxLat <= minLat) maxLat = minLat + 1.0;
        if (maxLon <= minLon) maxLon = minLon + 1.0;

        var rows = gridSize;
        var cols = gridSize;
        var blocked = new bool[rows, cols];

        GridCell Nearest(double lat, double lonU)
        {
            var r = rows <= 1 ? 0 : (int)Math.Round((lat - minLat) / (maxLat - minLat) * (rows - 1));
            var c = cols <= 1 ? 0 : (int)Math.Round((lonU - minLon) / (maxLon - minLon) * (cols - 1));
            return new GridCell(Math.Clamp(r, 0, rows - 1), Math.Clamp(c, 0, cols - 1));
        }

        LatLon CellUnwrapped(GridCell cell)
        {
            var lat = rows <= 1 ? minLat : minLat + (maxLat - minLat) * cell.Row / (rows - 1);
            var lonU = cols <= 1 ? minLon : minLon + (maxLon - minLon) * cell.Col / (cols - 1);
            return new LatLon(lat, lonU);
        }

        // Lưới có thể thô hơn chiều rộng eo biển/kênh => nới hành lang để chắc chắn có ô lọt vào eo.
        // Giá trị này được lưu vào lưới để A* dùng lại khi kiểm tra cạnh cắt đất (nhất quán).
        var cellLatDeg = rows <= 1 ? 0 : (maxLat - minLat) / (rows - 1);
        var cellLonDeg = cols <= 1 ? 0 : (maxLon - minLon) / (cols - 1);
        var latMidRad = (minLat + maxLat) * 0.5 * Math.PI / 180.0;
        var dilation = Math.Clamp(
            0.75 * Math.Max(cellLatDeg, cellLonDeg * Math.Cos(latMidRad)), 0.05, 0.7);
        var previousDilation = LandMask.CorridorDilationDeg;
        LandMask.CorridorDilationDeg = dilation;

        try
        {
            for (var r = 0; r < rows; r++)
            {
                for (var c = 0; c < cols; c++)
                {
                    var llU = CellUnwrapped(new GridCell(r, c));
                    var ll = new LatLon(llU.Lat, GeoMath.WrapLon(llU.Lon));
                    blocked[r, c] = hazards.IsBlocked(ll) || LandMask.IsBlockedLand(ll);
                }
            }
        }
        finally
        {
            LandMask.CorridorDilationDeg = previousDilation;
        }

        GridCell SnapToWater(GridCell preferred)
        {
            if (!blocked[preferred.Row, preferred.Col])
                return preferred;
            for (var radius = 1; radius <= 16; radius++)
            {
                for (var dr = -radius; dr <= radius; dr++)
                for (var dc = -radius; dc <= radius; dc++)
                {
                    if (Math.Abs(dr) != radius && Math.Abs(dc) != radius) continue;
                    var rr = preferred.Row + dr;
                    var cc = preferred.Col + dc;
                    if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
                    if (!blocked[rr, cc])
                        return new GridCell(rr, cc);
                }
            }
            blocked[preferred.Row, preferred.Col] = false;
            return preferred;
        }

        return new RoutingGrid
        {
            Rows = rows,
            Cols = cols,
            MinLat = minLat,
            MaxLat = maxLat,
            MinLon = minLon,
            MaxLon = maxLon,
            Blocked = blocked,
            NearLand = BuildNearLandMask(blocked, rows, cols),
            Hazards = hazards,
            CorridorDilationDeg = dilation,
            Start = SnapToWater(Nearest(start.Lat, startLon)),
            Goal = SnapToWater(Nearest(goal.Lat, goalLonU))
        };
    }

    /// <summary>
    /// Đánh dấu các ô nằm trong bán kính <paramref name="radius"/> ô tính từ một ô bị chặn.
    /// Bán kính 2 để các dải đất/mũi đất mảnh (lọt giữa các tâm ô) vẫn được kiểm tra cắt đất.
    /// </summary>
    private static bool[,] BuildNearLandMask(bool[,] blocked, int rows, int cols, int radius = 2)
    {
        var near = new bool[rows, cols];
        for (var r = 0; r < rows; r++)
        {
            for (var c = 0; c < cols; c++)
            {
                if (blocked[r, c]) { near[r, c] = false; continue; }
                var hit = false;
                for (var dr = -radius; dr <= radius && !hit; dr++)
                {
                    for (var dc = -radius; dc <= radius; dc++)
                    {
                        var rr = r + dr;
                        var cc = c + dc;
                        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
                        if (blocked[rr, cc]) { hit = true; break; }
                    }
                }
                near[r, c] = hit;
            }
        }
        return near;
    }
}
