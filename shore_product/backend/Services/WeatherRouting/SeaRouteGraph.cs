namespace ProductApi.Services.WeatherRouting;

/// <summary>
/// Tuyến biển HAI TẦNG — tầng thô chọn chuỗi mốc chặng, tầng mịn vẽ từng chặng.
///
/// Vì sao cần: bộ tìm đường cũ dựng MỘT lưới phủ cả hành trình rồi chạy A* trên đó. Lưới đó
/// suy ra từ dây cung start→goal:
///
///   latPad = clamp(max(15, lonSpan × 0.14), 15, 40)
///
/// nên hành trình càng dài về kinh độ thì lưới càng rộng mà ô lưới càng thô — đúng lúc cần
/// mịn nhất. Le Havre → Hải Phòng (lonSpan 106,6°) cho lưới 5,9°N–64,5°N với ô 44×73 NM,
/// A* luồn được qua Malacca. Le Havre → Tokyo (lonSpan 139,7°) cho lưới 16,1°N–69,0°N: đáy
/// lưới nằm TRÊN eo Bab el-Mandeb (12,6°N), nên Biển Đỏ thành ngõ cụt, A* chỉ mở rộng được
/// 215 ô rồi bỏ cuộc, và giao diện đành vẽ đường thẳng nối hai cảng xuyên lục địa.
///
/// Không sửa được bằng cách nới latPad: nới nữa thì ô lưới càng thô, lại rơi vào lỗi cũ
/// (ESVLC→BEANR 736 NM từng bị vẽ thành 14 089 NM vì ô lưới ~90 NM không biểu diễn nổi bờ biển).
///
/// Ở đây tách hai việc ra:
///   TẦNG THÔ — chọn chuỗi mốc trên biển (Gibraltar → Port Said → Bab el-Mandeb → Colombo →
///              Malacca → Singapore → Đài Loan → Nhật Bản) bằng Dijkstra trên một đồ thị nhỏ
///              các eo biển. Đồ thị là dữ liệu địa lý TĨNH, không phụ thuộc cảng nào.
///   TẦNG MỊN — mỗi chặng giữa hai mốc liên tiếp được vẽ bằng A* trên MỘT LƯỚI RIÊNG bám sát
///              chặng đó. Chặng ~1 500 NM cho ô lưới ~7 NM, đủ luồn eo Malacca.
///
/// Nhờ vậy độ mịn không còn phụ thuộc tổng độ dài hành trình, và vì tầng thô nhận một DANH SÁCH
/// NEO nên áp dụng được cho mọi hành trình A → C → D → … → B với bất kỳ số cảng trung gian nào.
/// </summary>
public static class SeaRouteGraph
{
    /// <summary>Cỡ lưới tối đa cho một chặng — đủ mịn cho eo hẹp mà vẫn nhanh.</summary>
    private const int MaxHopGridSize = 300;

    /// <summary>Mục tiêu ~6 NM mỗi ô cho từng chặng.</summary>
    private const double HopNmPerCell = 6.0;

    private static readonly double[] HopPaddingScales = { 1.0, 2.5, 5.0 };

    /// <summary>Số lần thử lại tối đa khi một chặng của chuỗi không có đường biển.</summary>
    private const int MaxChainAttempts = 24;

    private const string StartNode = "@START";
    private const string GoalNode = "@GOAL";

    /// <summary>
    /// Các mốc chặng trên biển. Toạ độ đặt ở giữa luồng nước, KHÔNG phải ở cảng — mốc chỉ có
    /// nhiệm vụ chia hành trình thành các chặng mà A* cục bộ giải được.
    ///
    /// Điều kiện khi thêm mốc: mọi cạnh phải ngắn hơn ~2 800 NM. Xa hơn thì tầng mịn không có
    /// cách nào vẽ nổi chặng đó, nên chỗ nào cần vượt đại dương đều phải có mốc trung gian
    /// (MNA, MSA, HNL, MPW, MPE...).
    /// </summary>
    private static readonly Dictionary<string, LatLon> Waypoints = new()
    {
        // --- Châu Âu / Địa Trung Hải ---
        ["GIB"] = new LatLon(35.95, -5.60),   // Gibraltar
        ["PSD"] = new LatLon(31.26, 32.30),   // Port Said (cửa bắc kênh Suez)
        ["SUZ"] = new LatLon(29.90, 32.55),   // cửa nam kênh Suez
        ["BAM"] = new LatLon(12.60, 43.35),   // Bab el-Mandeb
        ["HOR"] = new LatLon(26.55, 56.45),   // eo Hormuz (cửa vịnh Ba Tư)

        // --- Đại Tây Dương ---
        ["CAN"] = new LatLon(28.50, -15.00),  // quần đảo Canary
        ["CVI"] = new LatLon(15.50, -24.50),  // Cape Verde
        ["MNA"] = new LatLon(35.00, -45.00),  // giữa bắc Đại Tây Dương
        ["CAR"] = new LatLon(18.00, -65.00),  // Caribe
        ["MSA"] = new LatLon(-20.00, -5.00),  // giữa nam Đại Tây Dương
        ["SAT"] = new LatLon(-45.00, -10.00), // nam Đại Tây Dương
        ["GHA"] = new LatLon(-34.90, 18.45),  // mũi Hảo Vọng
        ["MOZ"] = new LatLon(-15.00, 41.00),  // eo Mozambique

        // --- Ấn Độ Dương / Đông Nam Á ---
        ["MIO"] = new LatLon(-20.00, 80.00),  // giữa Ấn Độ Dương
        ["CMB"] = new LatLon(6.00, 79.85),    // nam Sri Lanka
        ["MLK"] = new LatLon(5.50, 98.00),    // cửa tây bắc eo Malacca
        ["SIN"] = new LatLon(1.25, 104.00),   // cửa đông nam eo Malacca / Singapore
        ["SUN"] = new LatLon(-6.00, 105.50),  // eo Sunda
        ["LOM"] = new LatLon(-8.40, 116.05),  // eo Lombok

        // --- Đông Á ---
        ["TWN"] = new LatLon(23.50, 119.50),  // eo Đài Loan
        ["ECS"] = new LatLon(28.00, 123.00),  // Đông Hải
        ["KOR"] = new LatLon(34.00, 129.50),  // eo Triều Tiên
        ["JPE"] = new LatLon(37.00, 142.00),  // đông Nhật Bản

        // --- Thái Bình Dương / châu Mỹ ---
        ["TOR"] = new LatLon(-10.00, 142.00), // eo Torres
        ["BAS"] = new LatLon(-39.50, 145.00), // eo Bass
        ["MPW"] = new LatLon(25.00, 170.00),  // giữa tây Thái Bình Dương
        ["HNL"] = new LatLon(20.00, -157.00), // Hawaii
        ["MPE"] = new LatLon(10.00, -120.00), // giữa đông Thái Bình Dương
        ["MPS"] = new LatLon(-30.00, -95.00), // giữa nam Thái Bình Dương
        ["PNP"] = new LatLon(7.50, -79.50),   // cửa Thái Bình Dương của kênh Panama
        ["PNA"] = new LatLon(9.40, -79.90),   // cửa Đại Tây Dương của kênh Panama
        ["DRK"] = new LatLon(-58.00, -65.00), // eo Drake
    };

    /// <summary>
    /// Cạnh nối giữa các mốc. Chỉ liệt kê cạnh đi được thật bằng đường biển — không nối tắt
    /// qua lục địa (ví dụ không có cạnh CMB–SIN thẳng qua Sumatra, mà phải qua MLK).
    /// </summary>
    private static readonly (string A, string B)[] Links =
    {
        // Địa Trung Hải và kênh Suez
        ("GIB", "PSD"), ("PSD", "SUZ"), ("SUZ", "BAM"),

        // Bắc Đại Tây Dương
        ("GIB", "CAN"), ("CAN", "CVI"), ("GIB", "MNA"), ("CAN", "MNA"),
        ("MNA", "CAR"), ("CAR", "PNA"),

        // Nam Đại Tây Dương và mũi Hảo Vọng
        ("CVI", "MSA"), ("MSA", "GHA"), ("MSA", "SAT"), ("SAT", "DRK"),

        // Ấn Độ Dương
        ("BAM", "CMB"), ("BAM", "MOZ"), ("MOZ", "GHA"), ("MOZ", "MIO"),
        ("CMB", "MIO"), ("CMB", "MLK"), ("MIO", "SUN"),

        // Vịnh Ba Tư — cảng trong vịnh chỉ ra biển qua Hormuz. Thiếu mốc này thì chặng
        // KWIQE→EGPSD (thẳng 833 NM, đường biển thật ~3 600 NM) không có chuỗi nào đi được.
        ("HOR", "BAM"), ("HOR", "CMB"),

        // Eo Malacca và các eo thay thế
        ("MLK", "SIN"), ("SIN", "SUN"), ("SUN", "LOM"), ("LOM", "TOR"), ("SIN", "TOR"),

        // Đông Á
        ("SIN", "TWN"), ("TWN", "ECS"), ("ECS", "KOR"), ("KOR", "JPE"), ("TWN", "JPE"),

        // Thái Bình Dương
        ("JPE", "MPW"), ("MPW", "HNL"), ("HNL", "MPE"), ("MPE", "PNP"), ("PNP", "PNA"),
        ("PNP", "MPS"), ("MPS", "DRK"), ("TOR", "BAS"), ("BAS", "LOM"),
    };

    /// <summary>
    /// Chuỗi mốc đầy đủ cho danh sách NEO, đã gồm mọi neo theo đúng thứ tự.
    ///
    /// Neo là những điểm tàu BUỘC PHẢI đi qua: cảng khởi hành, các cảng bắt buộc ghé
    /// (A → C → D → … → B), cảng kết thúc. Giữa hai neo liên tiếp, chuỗi mốc biển được chèn
    /// vào để tầng mịn có đường mà vẽ.
    /// </summary>
    public static List<LatLon> FindChain(IReadOnlyList<LatLon> anchors)
    {
        if (anchors.Count < 2) return anchors.ToList();

        var chain = new List<LatLon> { anchors[0] };
        for (var i = 0; i < anchors.Count - 1; i++)
        {
            var segment = FindChainBetween(anchors[i], anchors[i + 1], new HashSet<(string, string)>());
            for (var k = 1; k < segment.Count; k++) chain.Add(segment[k]);
        }
        return chain;
    }

    /// <summary>
    /// Dựng polyline đường biển qua danh sách NEO: A → C → D → … → B.
    ///
    /// Trả null nếu BẤT KỲ chặng nào không có đường biển — thà báo thất bại để lớp gọi dùng
    /// dự phòng của nó, còn hơn trả về một tuyến nửa thật nửa thẳng nối xuyên lục địa.
    /// </summary>
    public static List<LatLon>? BuildRoute(
        IGridBuilder gridBuilder,
        IAstStarRouter aStar,
        IHeuristicCost cost,
        IReadOnlyList<LatLon> anchors,
        IHazardProvider hazards,
        ILogger? logger = null)
    {
        if (anchors.Count < 2) return null;

        var pts = new List<LatLon> { anchors[0] };
        for (var i = 0; i < anchors.Count - 1; i++)
        {
            var hop = RoutePair(gridBuilder, aStar, cost, anchors[i], anchors[i + 1], hazards, logger);
            if (hop is null) return null;

            for (var k = 1; k < hop.Count; k++) pts.Add(hop[k]);
        }

        var sanitized = PathSanitizer.Sanitize(pts);
        logger?.LogInformation(
            "Tuyến hai tầng: {Anchors} neo → {Pts} điểm, {Nm:F0} NM.",
            anchors.Count, sanitized.Count, GeoMath.PathLengthNm(sanitized));
        return sanitized;
    }

    /// <summary>
    /// Vẽ một chặng giữa hai neo.
    ///
    /// Thử A* trực tiếp trước — nhanh và đúng nhất khi hai neo gần nhau. Không ra đường thì
    /// chèn chuỗi mốc biển vào giữa. Chuỗi được chọn bằng Dijkstra, NHƯNG lựa chọn của Dijkstra
    /// chỉ là phỏng đoán theo khoảng cách thẳng: nó có thể chọn một "đường tắt" xuyên lục địa
    /// (Le Havre → đông Nhật Bản chỉ 5 400 NM đường thẳng, rẻ hơn tuyến Suez thật 10 400 NM).
    /// Nên mỗi chặng của chuỗi đều được A* THẬT kiểm chứng; chặng nào không có đường biển thì
    /// CẤM cạnh đó rồi chọn lại chuỗi. Nhờ vậy vẫn giữ được cách chọn tự động, mà kết quả thì
    /// do đường biển thật quyết định chứ không do đường thẳng trên giấy.
    /// </summary>
    private static List<LatLon>? RoutePair(
        IGridBuilder gridBuilder,
        IAstStarRouter aStar,
        IHeuristicCost cost,
        LatLon a,
        LatLon b,
        IHazardProvider hazards,
        ILogger? logger)
    {
        var direct = RouteHop(gridBuilder, aStar, cost, a, b, hazards);
        if (direct is not null) return direct;

        var banned = new HashSet<(string, string)>();
        for (var attempt = 0; attempt < MaxChainAttempts; attempt++)
        {
            var chain = FindChainNodes(a, b, banned);
            if (chain.Count < 2) return null;

            var result = new List<LatLon> { chain[0].Position };
            var broken = false;

            for (var i = 0; i < chain.Count - 1; i++)
            {
                var leg = RouteHop(gridBuilder, aStar, cost, chain[i].Position, chain[i + 1].Position, hazards);
                if (leg is null)
                {
                    banned.Add((chain[i].Id, chain[i + 1].Id));
                    banned.Add((chain[i + 1].Id, chain[i].Id));
                    broken = true;
                    break;
                }

                for (var k = 1; k < leg.Count; k++) result.Add(leg[k]);
            }

            if (!broken) return result;
        }

        logger?.LogWarning("Chặng {A} -> {B}: thử {N} chuỗi mốc đều đứt — bỏ tuyến.", a, b, MaxChainAttempts);
        return null;
    }

    /// <summary>
    /// Vẽ một chặng bằng A* trên lưới RIÊNG. Đây là điểm cốt lõi: độ mịn của lưới chỉ phụ thuộc
    /// độ dài chặng, không phụ thuộc toàn hành trình.
    /// </summary>
    private static List<LatLon>? RouteHop(
        IGridBuilder gridBuilder,
        IAstStarRouter aStar,
        IHeuristicCost cost,
        LatLon a,
        LatLon b,
        IHazardProvider hazards)
    {
        var straightNm = GeoMath.HaversineNm(a, b);
        if (straightNm < 1.0) return new List<LatLon> { a, b };

        var gridSize = Math.Clamp((int)Math.Ceiling(straightNm / HopNmPerCell), 120, MaxHopGridSize);

        foreach (var paddingScale in HopPaddingScales)
        {
            try
            {
                var grid = gridBuilder.Build(a, b, hazards, gridSize, paddingScale);
                var res = aStar.FindPath(grid, cost);
                if (!res.Found || res.Waypoints.Count < 2) continue;

                var pts = res.Waypoints.ToList();
                pts[0] = a;
                pts[^1] = b;

                var sanitized = PathSanitizer.Sanitize(pts);
                if (sanitized.Count < 2) continue;
                if (GeoMath.PathLengthNm(sanitized) > Math.Max(straightNm * 3.0, straightNm + 500.0)) continue;

                return sanitized;
            }
            catch
            {
                break;
            }
        }

        return null;
    }

    private readonly record struct ChainNode(string Id, LatLon Position);

    /// <summary>Chuỗi mốc giữa hai điểm, đã gồm cả hai đầu, tránh các cạnh bị cấm.</summary>
    private static List<LatLon> FindChainBetween(LatLon start, LatLon goal, HashSet<(string, string)> banned)
    {
        var nodes = FindChainNodes(start, goal, banned);
        return nodes.Select(n => n.Position).ToList();
    }

    /// <summary>
    /// Dijkstra trên đồ thị mốc, có thêm hai nút ảo START và GOAL.
    ///
    /// Cạnh nối từ START/GOAL tới một mốc là đường CHIM BAY, nên phải phạt theo tỷ lệ đoạn đi
    /// trên đất: không phạt thì Dijkstra luôn chọn mốc nào gần đường chim bay nhất, kể cả khi
    /// "đường" đó xuyên cả lục địa Âu Á. Cạnh giữa hai mốc là dữ liệu tự soạn, đã bảo đảm đi
    /// được bằng đường biển, nên không phạt.
    /// </summary>
    private static List<ChainNode> FindChainNodes(LatLon start, LatLon goal, HashSet<(string, string)> banned)
    {
        LandMask.EnsureLoaded();

        var adjacency = new Dictionary<string, List<(string To, double Weight)>>();
        foreach (var code in Waypoints.Keys) adjacency[code] = new List<(string, double)>();

        void Link(string from, string to, double weight)
        {
            if (banned.Contains((from, to))) return;
            adjacency[from].Add((to, weight));
        }

        foreach (var (a, b) in Links)
        {
            if (!Waypoints.TryGetValue(a, out var pa) || !Waypoints.TryGetValue(b, out var pb)) continue;
            var w = GeoMath.HaversineNm(pa, pb);
            Link(a, b, w);
            Link(b, a, w);
        }

        const double LandPenalty = 4.0;
        adjacency[StartNode] = new List<(string, double)>();
        adjacency[GoalNode] = new List<(string, double)>();

        foreach (var (code, p) in Waypoints)
        {
            Link(StartNode, code, GeoMath.HaversineNm(start, p) * (1.0 + LandPenalty * LandFraction(start, p)));
            Link(code, GoalNode, GeoMath.HaversineNm(p, goal) * (1.0 + LandPenalty * LandFraction(p, goal)));
        }

        var dist = new Dictionary<string, double> { [StartNode] = 0.0 };
        var prev = new Dictionary<string, string?>();
        var settled = new HashSet<string>();

        while (true)
        {
            string? current = null;
            var best = double.MaxValue;
            foreach (var (id, d) in dist)
            {
                if (settled.Contains(id) || d >= best) continue;
                best = d;
                current = id;
            }

            if (current is null || current == GoalNode) break;
            settled.Add(current);

            if (!adjacency.TryGetValue(current, out var edges)) continue;
            foreach (var (to, w) in edges)
            {
                var candidate = best + w;
                if (dist.TryGetValue(to, out var known) && candidate >= known) continue;
                dist[to] = candidate;
                prev[to] = current;
            }
        }

        if (!dist.ContainsKey(GoalNode)) return new List<ChainNode>();

        var ordered = new List<string>();
        for (var cur = GoalNode; cur is not null; cur = prev[cur])
        {
            ordered.Add(cur);
            if (cur == StartNode) break;
        }
        ordered.Reverse();

        var result = new List<ChainNode>(ordered.Count);
        foreach (var id in ordered)
        {
            if (id == StartNode) result.Add(new ChainNode(StartNode, start));
            else if (id == GoalNode) result.Add(new ChainNode(GoalNode, goal));
            else result.Add(new ChainNode(id, Waypoints[id]));
        }
        return result;
    }

    /// <summary>Tỷ lệ chiều dài đoạn thẳng đi trên đất — dùng để phạt "đường tắt" xuyên lục địa.</summary>
    private static double LandFraction(LatLon a, LatLon b)
    {
        var nm = GeoMath.HaversineNm(a, b);
        if (nm < 1.0) return 0.0;

        var samples = Math.Clamp((int)Math.Ceiling(nm / 20.0), 2, 400);
        var dLon = GeoMath.WrapLon(b.Lon - a.Lon);
        var onLand = 0;

        for (var i = 1; i < samples; i++)
        {
            var t = (double)i / samples;
            var p = new LatLon(a.Lat + (b.Lat - a.Lat) * t, GeoMath.WrapLon(a.Lon + dLon * t));
            if (LandMask.IsBlockedLand(p)) onLand++;
        }

        return (double)onLand / (samples - 1);
    }
}
