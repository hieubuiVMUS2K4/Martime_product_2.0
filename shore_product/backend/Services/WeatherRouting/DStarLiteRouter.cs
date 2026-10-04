namespace ProductApi.Services.WeatherRouting;

/// <summary>Kết quả một lần tìm/lập lại kế hoạch bằng D* Lite.</summary>
public sealed class DStarLiteResult
{
    public required RouteResult Route { get; init; }

    /// <summary>Số đỉnh được mở rộng (lấy ra khỏi hàng đợi và xử lý) trong lần chạy này.</summary>
    public required int Expanded { get; init; }

    /// <summary>Số ô có thời tiết/vật cản thay đổi so với lưới trước (0 ở lần khởi tạo).</summary>
    public required int ChangedCells { get; init; }
}

/// <summary>
/// D* Lite (Koenig &amp; Likhachev, 2002) — A* TĂNG DẦN để lập lại kế hoạch khi chi phí cạnh thay đổi.
///
/// Khác A*: tìm NGƯỢC từ đích về tàu và GIỮ LẠI toàn bộ trạng thái tìm kiếm (g, rhs, hàng đợi)
/// giữa các lần. Khi luồng thời tiết mới tới, chỉ các ô có sóng gió/vật cản thay đổi (và lân cận)
/// bị đánh giá lại; phần đồ thị không đổi giữ nguyên kết quả cũ. Kết luận cũ về tuyến tối ưu có thể
/// bị huỷ bỏ khi dữ liệu mới đến — đây chính là suy lý không đơn điệu.
///
///  • g(s)   — chi phí tốt nhất đã biết từ s tới đích.
///  • rhs(s) — giá trị nhìn trước một bước: min qua ô kế s' của c(s,s') + g(s').
///  • s nhất quán khi g = rhs; hàng đợi chỉ chứa ô bất nhất quán, sắp theo khoá
///    [min(g,rhs) + h(tàu,s); min(g,rhs)].
///
/// Dùng ĐÚNG hàm chi phí (<see cref="IHeuristicCost"/>) và quy tắc cạnh (<see cref="GridEdges"/>)
/// của A*, nên trên cùng một lưới hai thuật toán cho cùng chi phí tối ưu — chỉ khác số ô phải duyệt.
/// Chi phí cạnh không đối xứng (ngược/xuôi sóng khác nhau) vẫn đúng vì rhs lấy theo chiều s→s'.
/// </summary>
public sealed class DStarLiteRouter
{
    private static readonly (int dr, int dc)[] Neighbors =
    [
        (-1, 0), (1, 0), (0, -1), (0, 1),
        (-1, -1), (-1, 1), (1, -1), (1, 1)
    ];

    /// <summary>Bán kính (ô) quanh ô thay đổi cần đánh giá lại: mask sát-vật-cản lan 2 ô.</summary>
    private const int ChangeDilation = 2;

    private readonly IHeuristicCost _cost;
    private RoutingGrid _grid;
    private double _edgeSampleNm;

    private readonly double[] _g;
    private readonly double[] _rhs;
    private readonly bool[] _inOpen;
    private readonly int[] _stamp;
    private readonly PriorityQueue<(int Idx, int Stamp), (double K1, double K2)> _open = new();

    private int _expanded;

    public DStarLiteRouter(RoutingGrid grid, IHeuristicCost cost)
    {
        _grid = grid;
        _cost = cost;
        _edgeSampleNm = GridEdges.SampleNm(grid);

        var n = grid.Rows * grid.Cols;
        _g = new double[n];
        _rhs = new double[n];
        _inOpen = new bool[n];
        _stamp = new int[n];
        Array.Fill(_g, double.PositiveInfinity);
        Array.Fill(_rhs, double.PositiveInfinity);

        var goal = Index(grid.Goal);
        _rhs[goal] = 0.0;
        Push(goal);
    }

    /// <summary>Lưới đang dùng (lần replan sau dựng lưới mới trên cùng khung với lưới này).</summary>
    public RoutingGrid Grid => _grid;

    /// <summary>Lần tìm đầu tiên — tương đương một lần A* ngược.</summary>
    public DStarLiteResult Plan() => Run(changedCells: 0);

    /// <summary>
    /// Lập lại kế hoạch trên lưới mới (cùng khung, cùng kích thước, cùng ô xuất phát/đích).
    /// Chỉ đánh giá lại các ô có thay đổi và lân cận của chúng, rồi sửa tiếp từ trạng thái cũ.
    /// </summary>
    public DStarLiteResult Replan(RoutingGrid newGrid)
    {
        if (newGrid.Rows != _grid.Rows || newGrid.Cols != _grid.Cols ||
            newGrid.Start != _grid.Start || newGrid.Goal != _grid.Goal)
            throw new ArgumentException("D* Lite chỉ lập lại kế hoạch trên cùng một khung lưới.", nameof(newGrid));

        var changed = ChangedCells(_grid, newGrid);
        _grid = newGrid;
        _edgeSampleNm = GridEdges.SampleNm(newGrid);

        // Vật cản đổi thì cạnh cắt thiên tai của các ô sát đó cũng có thể đổi dù mask của chúng
        // không đổi (vốn đã sát đất liền) — nới theo bán kính mask. Rồi thêm một vòng ô kề: rhs
        // của ô s phụ thuộc cạnh s→s', nên ô kề của vùng thay đổi cũng phải tính lại.
        var affected = Dilate(changed, ChangeDilation + 1);

        var prevDilation = LandMask.CorridorDilationDeg;
        LandMask.CorridorDilationDeg = _grid.CorridorDilationDeg;
        try
        {
            foreach (var idx in affected)
                UpdateVertex(idx);
        }
        finally
        {
            LandMask.CorridorDilationDeg = prevDilation;
        }

        return Run(changed.Count);
    }

    // ------------------------------------------------------------------ lõi thuật toán

    private DStarLiteResult Run(int changedCells)
    {
        _expanded = 0;

        // Kiểm tra cạnh cắt đất phải dùng đúng độ nới hành lang của lưới (giống A*).
        var prevDilation = LandMask.CorridorDilationDeg;
        LandMask.CorridorDilationDeg = _grid.CorridorDilationDeg;
        try
        {
            ComputeShortestPath();
            return new DStarLiteResult
            {
                Route = ExtractRoute(),
                Expanded = _expanded,
                ChangedCells = changedCells
            };
        }
        finally
        {
            LandMask.CorridorDilationDeg = prevDilation;
        }
    }

    private void ComputeShortestPath()
    {
        var start = Index(_grid.Start);
        var guard = 50L * _g.Length;   // chặn vòng lặp vô hạn do sai số dấu phẩy động

        // Chỉ NHÌN đỉnh heap để xét điều kiện dừng; lấy ra trong thân vòng lặp. Lấy ra trước khi
        // xét thì ở vòng cuối một ô còn bất nhất quán bị rơi khỏi hàng đợi mà không được xử lý.
        while (guard-- > 0 && TryPeekTop(out var u, out var kOld) &&
               (Less(kOld, Key(start)) || !Same(_rhs[start], _g[start])))
        {
            _open.Dequeue();
            var kNew = Key(u);
            if (Less(kOld, kNew))
            {
                Push(u);   // khoá cũ lỗi thời ⇒ đưa lại với khoá mới
                continue;
            }

            _inOpen[u] = false;
            _expanded++;

            if (_g[u] > _rhs[u])
            {
                // Ô trở nên rẻ hơn: chốt g và báo cho các ô đi được TỚI u.
                _g[u] = _rhs[u];
                foreach (var p in Predecessors(u))
                {
                    var c = EdgeCost(p, u);
                    if (c + _g[u] < _rhs[p] && p != Index(_grid.Goal))
                    {
                        _rhs[p] = c + _g[u];
                        Requeue(p);
                    }
                }
            }
            else
            {
                // Ô trở nên đắt hơn (hoặc bị chặn): huỷ g cũ, tính lại chính nó và các ô dựa vào nó.
                _g[u] = double.PositiveInfinity;
                UpdateVertex(u);
                foreach (var p in Predecessors(u))
                    UpdateVertex(p);
            }
        }
    }

    /// <summary>Tính lại rhs(s) = min qua ô kế s' của c(s,s') + g(s') và cập nhật hàng đợi.</summary>
    private void UpdateVertex(int s)
    {
        if (s != Index(_grid.Goal))
        {
            var best = double.PositiveInfinity;
            if (IsPassable(s))
            {
                foreach (var t in Successors(s))
                {
                    var v = EdgeCost(s, t) + _g[t];
                    if (v < best) best = v;
                }
            }
            _rhs[s] = best;
        }
        Requeue(s);
    }

    private void Requeue(int s)
    {
        _inOpen[s] = false;           // xoá lười: mục cũ trong heap bị bỏ qua nhờ stamp
        if (!Same(_g[s], _rhs[s])) Push(s);
    }

    private void Push(int s)
    {
        _stamp[s]++;
        _inOpen[s] = true;
        _open.Enqueue((s, _stamp[s]), Key(s));
    }

    /// <summary>Đỉnh hợp lệ của heap (bỏ dần các mục lỗi thời), KHÔNG lấy ra.</summary>
    private bool TryPeekTop(out int idx, out (double K1, double K2) key)
    {
        while (_open.TryPeek(out var item, out key))
        {
            if (_inOpen[item.Idx] && item.Stamp == _stamp[item.Idx])
            {
                idx = item.Idx;
                return true;
            }
            _open.Dequeue();   // mục lỗi thời
        }
        idx = -1;
        key = default;
        return false;
    }

    private (double K1, double K2) Key(int s)
    {
        var m = Math.Min(_g[s], _rhs[s]);
        if (double.IsPositiveInfinity(m)) return (m, m);
        return (m + _cost.Heuristic(_grid, Cell(s), _grid.Start), m);
    }

    private static bool Less((double K1, double K2) a, (double K1, double K2) b) =>
        a.K1 < b.K1 - 1e-9 || (Math.Abs(a.K1 - b.K1) <= 1e-9 && a.K2 < b.K2 - 1e-9);

    private static bool Same(double a, double b) =>
        (double.IsPositiveInfinity(a) && double.IsPositiveInfinity(b)) || Math.Abs(a - b) <= 1e-9;

    // ------------------------------------------------------------------ đồ thị

    private IEnumerable<int> Successors(int s) => Adjacent(s);

    /// <summary>Quy tắc cạnh đối xứng (chỉ chi phí là không đối xứng) nên tập tiền bối = tập kế.</summary>
    private IEnumerable<int> Predecessors(int s) => Adjacent(s);

    private IEnumerable<int> Adjacent(int s)
    {
        var r = s / _grid.Cols;
        var c = s % _grid.Cols;
        foreach (var (dr, dc) in Neighbors)
        {
            var nr = r + dr;
            var nc = c + dc;
            if (nr < 0 || nr >= _grid.Rows || nc < 0 || nc >= _grid.Cols) continue;
            var t = nr * _grid.Cols + nc;
            if (IsPassable(t)) yield return t;
        }
    }

    /// <summary>Chi phí cạnh a→b theo đúng A*: vô cùng nếu bị chặn hoặc cắt đất/thiên tai.</summary>
    private double EdgeCost(int a, int b)
    {
        if (!IsPassable(a) || !IsPassable(b)) return double.PositiveInfinity;
        var ca = Cell(a);
        var cb = Cell(b);
        if (!GridEdges.Traversable(_grid, ca, _grid.CellToLatLon(ca), _grid.IsNearLand(ca), cb, _edgeSampleNm))
            return double.PositiveInfinity;
        return _cost.StepCost(_grid, ca, cb);
    }

    private RouteResult ExtractRoute()
    {
        var start = Index(_grid.Start);
        var goal = Index(_grid.Goal);

        if (double.IsPositiveInfinity(_g[start]) && double.IsPositiveInfinity(_rhs[start]))
            return NotFound("No path around hazards");

        // Đi xuôi từ tàu: mỗi bước chọn ô kế có c(s,s') + g(s') nhỏ nhất.
        var cells = new List<GridCell> { _grid.Start };
        var visited = new HashSet<int> { start };
        var s = start;
        while (s != goal)
        {
            var best = -1;
            var bestV = double.PositiveInfinity;
            foreach (var t in Successors(s))
            {
                var v = EdgeCost(s, t) + _g[t];
                if (v < bestV) { bestV = v; best = t; }
            }
            if (best < 0 || double.IsPositiveInfinity(bestV) || !visited.Add(best))
                return NotFound("D* Lite path extraction failed");
            s = best;
            cells.Add(Cell(s));
        }

        var waypoints = AstStarRouter.ToWaypoints(_grid, cells);
        return new RouteResult
        {
            Found = true,
            Waypoints = waypoints,
            PathCost = _g[start],
            DistanceNm = GeoMath.PathLengthNm(waypoints),
            ExploredCells = _expanded,
            CellCount = waypoints.Count
        };
    }

    private RouteResult NotFound(string reason) => new()
    {
        Found = false,
        Waypoints = Array.Empty<LatLon>(),
        PathCost = 0,
        DistanceNm = 0,
        ExploredCells = _expanded,
        CellCount = 0,
        FailureReason = reason
    };

    // ------------------------------------------------------------------ phát hiện thay đổi

    /// <summary>Ô có vật cản, mask sát-vật-cản hoặc sóng/gió/hướng sóng khác nhau giữa hai lưới.</summary>
    private static List<int> ChangedCells(RoutingGrid oldGrid, RoutingGrid newGrid)
    {
        var changed = new List<int>();
        for (var r = 0; r < oldGrid.Rows; r++)
        {
            for (var c = 0; c < oldGrid.Cols; c++)
            {
                var cell = new GridCell(r, c);
                var differs =
                    oldGrid.Blocked[r, c] != newGrid.Blocked[r, c] ||
                    oldGrid.IsNearLand(cell) != newGrid.IsNearLand(cell) ||
                    oldGrid.WeatherAt(cell) != newGrid.WeatherAt(cell);
                if (differs) changed.Add(r * oldGrid.Cols + c);
            }
        }
        return changed;
    }

    private List<int> Dilate(List<int> cells, int radius)
    {
        var rows = _grid.Rows;
        var cols = _grid.Cols;
        if (radius <= 0 || cells.Count == 0) return cells;
        var set = new HashSet<int>();
        foreach (var idx in cells)
        {
            var r = idx / cols;
            var c = idx % cols;
            for (var dr = -radius; dr <= radius; dr++)
            for (var dc = -radius; dc <= radius; dc++)
            {
                var nr = r + dr;
                var nc = c + dc;
                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                set.Add(nr * cols + nc);
            }
        }
        return set.ToList();
    }

    private bool IsPassable(int idx) => !_grid.Blocked[idx / _grid.Cols, idx % _grid.Cols];

    private int Index(GridCell c) => c.Row * _grid.Cols + c.Col;

    private GridCell Cell(int idx) => new(idx / _grid.Cols, idx % _grid.Cols);
}
