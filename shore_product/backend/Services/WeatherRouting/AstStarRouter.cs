namespace ProductApi.Services.WeatherRouting;

public interface IAstStarRouter
{
    RouteResult FindPath(RoutingGrid grid, IHeuristicCost cost);
}

public sealed class AstStarRouter : IAstStarRouter
{
    private static readonly (int dr, int dc)[] Neighbors =
    [
        (-1, 0), (1, 0), (0, -1), (0, 1),
        (-1, -1), (-1, 1), (1, -1), (1, 1)
    ];

    public RouteResult FindPath(RoutingGrid grid, IHeuristicCost cost)
    {
        // Dùng lại đúng độ nới hành lang đã dùng khi dựng lưới, nếu không các ô trong eo
        // sẽ passable nhưng cạnh nối chúng lại bị coi là cắt đất => tường chắn ảo.
        var prevDilation = LandMask.CorridorDilationDeg;
        LandMask.CorridorDilationDeg = grid.CorridorDilationDeg;
        try
        {
            return FindPathCore(grid, cost);
        }
        finally
        {
            LandMask.CorridorDilationDeg = prevDilation;
        }
    }

    private static RouteResult FindPathCore(RoutingGrid grid, IHeuristicCost cost)
    {
        var start = grid.Start;
        var goal = grid.Goal;
        if (!grid.IsPassable(start) || !grid.IsPassable(goal))
        {
            return new RouteResult
            {
                Found = false,
                Waypoints = Array.Empty<LatLon>(),
                PathCost = 0,
                DistanceNm = 0,
                ExploredCells = 0,
                CellCount = 0,
                FailureReason = "Start or goal cell blocked"
            };
        }

        var rows = grid.Rows;
        var cols = grid.Cols;
        var nCells = rows * cols;
        var gScore = new double[nCells];
        var parent = new int[nCells];
        var closed = new bool[nCells];
        Array.Fill(gScore, double.PositiveInfinity);
        Array.Fill(parent, -1);

        var open = new PriorityQueue<int, double>();
        var sIdx = start.Row * cols + start.Col;
        gScore[sIdx] = 0;
        open.Enqueue(sIdx, cost.Heuristic(grid, start, goal));

        var explored = 0;
        var goalIdx = goal.Row * cols + goal.Col;

        // Khoảng cách lấy mẫu khi kiểm tra cạnh cắt đất: ~1/2 độ dài cạnh, tối thiểu 2 NM.
        var cellStepNm = Math.Max(
            Math.Abs(grid.CellToLatLon(new GridCell(Math.Min(1, rows - 1), 0)).Lat -
                     grid.CellToLatLon(new GridCell(0, 0)).Lat) * 60.0,
            0.1);
        var edgeSampleNm = Math.Clamp(cellStepNm * 0.5, 2.0, 8.0);
        const int maxEdgeSamples = 24;

        while (open.Count > 0)
        {
            var currentIdx = open.Dequeue();
            if (closed[currentIdx]) continue;
            closed[currentIdx] = true;
            explored++;

            if (currentIdx == goalIdx)
            {
                var cells = Reconstruct(parent, cols, currentIdx);
                // Ô lưới rộng nên tâm ô trong hành lang kênh/eo có thể rơi vào đất (ví dụ kênh Suez).
                // Kéo các điểm đó về tim hành lang để polyline bám kênh thay vì cắt ngang qua đất.
                var waypoints = new List<LatLon>(cells.Count);
                foreach (var c in cells)
                {
                    var ll = grid.CellToLatLon(c);
                    if (LandMask.IsRawLand(ll))
                        ll = LandMask.ProjectToCorridor(ll) ?? ll;
                    if (waypoints.Count == 0 ||
                        Math.Abs(waypoints[^1].Lat - ll.Lat) > 1e-9 ||
                        Math.Abs(waypoints[^1].Lon - ll.Lon) > 1e-9)
                        waypoints.Add(ll);
                }
                // Truyền cả vật cản để string-pulling không cắt qua vùng bão.
                waypoints = PathSanitizer.Sanitize(waypoints, p => !grid.IsPassable(grid.LatLonToCell(p)));
                return new RouteResult
                {
                    Found = true,
                    Waypoints = waypoints,
                    PathCost = gScore[currentIdx],
                    DistanceNm = GeoMath.PathLengthNm(waypoints),
                    ExploredCells = explored,
                    CellCount = waypoints.Count
                };
            }

            var cr = currentIdx / cols;
            var cc = currentIdx % cols;
            var current = new GridCell(cr, cc);
            var currentG = gScore[currentIdx];
            var currentLl = grid.CellToLatLon(current);
            var currentNearLand = grid.IsNearLand(current);

            foreach (var (dr, dc) in Neighbors)
            {
                var nr = cr + dr;
                var nc = cc + dc;
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                var next = new GridCell(nr, nc);
                if (!grid.IsPassable(next)) continue;

                var nIdx = nr * cols + nc;
                if (closed[nIdx]) continue;

                // Chỉ kiểm tra cắt khi ít nhất một đầu cạnh nằm sát vùng bị chặn: giữa biển mở
                // chắc chắn không cắt gì nên bỏ qua để giữ tốc độ. Mask NearLand được dựng từ
                // mảng `blocked` nên đã bao gồm CẢ thiên tai, không chỉ đất liền.
                //
                // Phải kiểm tra cả thiên tai ở mức CẠNH, không chỉ mức tâm ô: hai tâm ô đều nằm
                // ngoài vòng tròn vẫn có thể nối với nhau bằng một cạnh chui qua giữa nó.
                var nextLl = grid.CellToLatLon(next);
                if ((currentNearLand || grid.IsNearLand(next)) &&
                    (LandMask.SegmentCrossesLand(currentLl, nextLl, edgeSampleNm, maxEdgeSamples) ||
                     grid.SegmentCrossesHazard(currentLl, nextLl, edgeSampleNm)))
                    continue;

                var tentative = currentG + cost.StepCost(grid, current, next);
                if (tentative >= gScore[nIdx]) continue;

                parent[nIdx] = currentIdx;
                gScore[nIdx] = tentative;
                open.Enqueue(nIdx, tentative + cost.Heuristic(grid, next, goal));
            }
        }

        return new RouteResult
        {
            Found = false,
            Waypoints = Array.Empty<LatLon>(),
            PathCost = 0,
            DistanceNm = 0,
            ExploredCells = explored,
            CellCount = 0,
            FailureReason = "No path around hazards"
        };
    }

    private static List<GridCell> Reconstruct(int[] parent, int cols, int currentIdx)
    {
        var path = new List<GridCell>();
        for (var i = currentIdx; i >= 0; i = parent[i])
            path.Add(new GridCell(i / cols, i % cols));
        path.Reverse();
        return path;
    }
}
