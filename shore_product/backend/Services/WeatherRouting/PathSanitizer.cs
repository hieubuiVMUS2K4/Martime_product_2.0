namespace ProductApi.Services.WeatherRouting;

/// <summary>
/// Post-process A* waypoints: drop useless spikes only when the shortcut stays on water,
/// then replace any remaining land-crossing chords with latitude/longitude U-detours.
/// No named regions or vias.
/// </summary>
public static class PathSanitizer
{
    /// <summary>
    /// Hậu xử lý đường A*:
    ///   1. Bỏ các đỉnh "gai" vô ích (khi đường tắt vẫn an toàn).
    ///   2. String-pulling: thay đoạn gấp khúc bằng một đoạn thẳng nếu đoạn thẳng đó vẫn
    ///      đi trên nước và không cắt vật cản → khử các góc vuông/gấp khúc do lưới sinh ra.
    ///
    /// KHÔNG tự tạo detour hình chữ U hay cầu nối A* cục bộ. Đường A* đã được bảo đảm không
    /// cắt đất ngay trong bước tìm kiếm; mọi thao tác "sửa" bằng hình học tự chế chỉ làm xấu tuyến.
    /// </summary>
    /// <param name="blockedAt">Hàm kiểm tra một điểm có bị chặn không (đất hoặc vật cản như bão).</param>
    public static List<LatLon> Sanitize(IReadOnlyList<LatLon> input, Func<LatLon, bool>? blockedAt = null)
    {
        if (input.Count < 2) return input.Select(Wrap).ToList();
        LandMask.EnsureLoaded();
        var original = input.Select(Wrap).ToList();
        var pts = RemoveSpikes(original.ToList(), blockedAt);
        pts = StringPull(pts, blockedAt);
        // Bảo đảm cuối: không để lại đoạn thẳng nào cắt đất/vật cản.
        pts = RepairLandChords(original, pts, blockedAt);
        return pts;
    }

    /// <summary>
    /// Kiểm tra cuối cho từng đoạn: nếu còn cắt đất/vật cản thì chèn lại các đỉnh gốc
    /// đã bị lược giữa hai đầu đoạn đó. Đường A* gốc đi qua tâm ô lưới liền kề nên an toàn;
    /// nhờ vậy đầu ra không thể cắt đất dù bước string-pull có lọt lưới.
    /// </summary>
    private static List<LatLon> RepairLandChords(
        List<LatLon> original, List<LatLon> simplified, Func<LatLon, bool>? blockedAt)
    {
        if (simplified.Count < 2) return simplified;

        var indexOf = new Dictionary<(long, long), int>(original.Count);
        for (var i = 0; i < original.Count; i++)
            indexOf.TryAdd(CoordKey(original[i]), i);

        var result = new List<LatLon>(simplified.Count) { simplified[0] };
        for (var i = 0; i < simplified.Count - 1; i++)
        {
            var a = simplified[i];
            var b = simplified[i + 1];
            if (!DenseCrossesBlocked(a, b, blockedAt))
            {
                Append(result, b);
                continue;
            }

            var hasA = indexOf.TryGetValue(CoordKey(a), out var ia);
            var hasB = indexOf.TryGetValue(CoordKey(b), out var ib);
            if (hasA && hasB && ib > ia)
            {
                for (var k = ia + 1; k <= ib; k++)
                    Append(result, original[k]);
            }
            else
            {
                Append(result, b);
            }
        }
        return result;
    }

    private static (long, long) CoordKey(LatLon p) =>
        ((long)Math.Round(p.Lat * 1e6), (long)Math.Round(GeoMath.WrapLon(p.Lon) * 1e6));

    /// <summary>
    /// Dò cắt đất/vật cản với mật độ tối thiểu <see cref="LandMask.MaxSampleSpacingNm"/> NM
    /// (không bị thưa đi khi đoạn quá dài).
    /// </summary>
    private static bool DenseCrossesBlocked(LatLon a, LatLon b, Func<LatLon, bool>? blockedAt)
    {
        var distNm = GeoMath.HaversineNm(a, b);
        if (distNm < 1e-6) return false;
        var samples = Math.Clamp((int)Math.Ceiling(distNm / LandMask.MaxSampleSpacingNm), 1, 600);
        for (var i = 1; i <= samples; i++)
        {
            var t = (double)i / (samples + 1);
            var p = new LatLon(a.Lat + (b.Lat - a.Lat) * t, a.Lon + (b.Lon - a.Lon) * t);
            if (LandMask.IsBlockedLand(p)) return true;
            if (blockedAt is not null && blockedAt(p)) return true;
        }
        return false;
    }

    /// <summary>
    /// Khử góc gấp khúc: với mỗi đỉnh i, tìm đỉnh j xa nhất (trong cửa sổ giới hạn) mà đoạn
    /// thẳng i→j không cắt đất/vật cản, rồi nhảy tới j.
    /// </summary>
    private static List<LatLon> StringPull(List<LatLon> pts, Func<LatLon, bool>? blockedAt)
    {
        if (pts.Count < 3) return pts;

        const int window = 40;          // số đỉnh tối đa xét trong một lần nhảy
        const int landSamples = 32;
        const double landSpacingNm = 4.0;

        var result = new List<LatLon>(pts.Count) { pts[0] };
        var i = 0;
        while (i < pts.Count - 1)
        {
            var limit = Math.Min(pts.Count - 1, i + window);
            var chosen = i + 1;
            for (var j = limit; j > i + 1; j--)
            {
                if (!CrossesBlocked(pts[i], pts[j], blockedAt, landSpacingNm, landSamples))
                {
                    chosen = j;
                    break;
                }
            }

            if (chosen == i + 1 && i + 1 < pts.Count - 1)
            {
                // Không nhảy được xa hơn một bước: kiểm tra lại đỉnh kế tiếp để tránh vòng lặp vô hạn.
                chosen = i + 1;
            }

            result.Add(pts[chosen]);
            i = chosen;
        }

        return result;
    }

    /// <summary>Đoạn a→b có cắt đất hoặc vật cản không (lon có thể chưa unwrap).</summary>
    private static bool CrossesBlocked(
        LatLon a, LatLon b, Func<LatLon, bool>? blockedAt,
        double spacingNm, int maxSamples)
    {
        if (LandMask.SegmentCrossesLand(a, b, spacingNm, maxSamples)) return true;
        if (blockedAt is null) return false;

        // Lấy mẫu DÀY như khi dò cắt đất. Trước đây chỉ lấy 24 mẫu cho mọi độ dài nên với
        // dây cung dài, vật cản (kể cả vùng thiên tai) bị bỏ sót giữa hai mẫu.
        var distNm = GeoMath.HaversineNm(a, b);
        var samples = Math.Clamp((int)Math.Ceiling(distNm / LandMask.MaxSampleSpacingNm), 1, 400);
        for (var i = 1; i <= samples; i++)
        {
            var t = (double)i / (samples + 1);
            var p = new LatLon(a.Lat + (b.Lat - a.Lat) * t, a.Lon + (b.Lon - a.Lon) * t);
            if (blockedAt(p)) return true;
        }
        return false;
    }

    private static LatLon Wrap(LatLon p) => new(p.Lat, GeoMath.WrapLon(p.Lon));

    private static int CountLand(List<LatLon> pts)
    {
        var n = 0;
        for (var i = 0; i < pts.Count - 1; i++)
            if (DenseCrosses(pts[i], pts[i + 1])) n++;
        return n;
    }

    private static bool DenseCrosses(LatLon a, LatLon b)
    {
        LandMask.EnsureLoaded();
        var lon1 = a.Lon;
        var lon2 = b.Lon;
        if (lon2 < lon1 - 180) lon2 += 360;
        if (lon1 < lon2 - 180) lon1 += 360;
        const int n = 96;
        for (var i = 1; i <= n; i++)
        {
            var t = i / (double)(n + 1);
            var lat = a.Lat + (b.Lat - a.Lat) * t;
            var lon = GeoMath.WrapLon(lon1 + (lon2 - lon1) * t);
            if (LandMask.IsBlockedLand(new LatLon(lat, lon)))
                return true;
        }
        return false;
    }

    private static List<LatLon> RemoveSpikes(List<LatLon> pts, Func<LatLon, bool>? blockedAt = null)
    {
        if (pts.Count < 3) return pts;
        var changed = true;
        while (changed && pts.Count >= 3)
        {
            changed = false;
            for (var i = 1; i < pts.Count - 1; i++)
            {
                var a = pts[i - 1];
                var b = pts[i];
                var c = pts[i + 1];
                var ab = GeoMath.HaversineNm(a, b);
                var bc = GeoMath.HaversineNm(b, c);
                var ac = GeoMath.HaversineNm(a, c);
                var wasteful = ab + bc > ac * 1.05 + 30.0;
                var latU =
                    Math.Abs(a.Lat - b.Lat) > 5 &&
                    Math.Abs(b.Lat - c.Lat) > 5 &&
                    Math.Abs(a.Lat - c.Lat) < 3;
                // Không bao giờ bỏ đỉnh nếu đường tắt cắt đất/vật cản.
                if ((wasteful || latU) && !CrossesBlocked(a, c, blockedAt, 3.0, 32))
                {
                    pts.RemoveAt(i);
                    changed = true;
                    break;
                }
            }
        }
        return pts;
    }

    private static List<LatLon> FixLandChords(List<LatLon> pts)
    {
        var result = new List<LatLon>(pts.Count + 64) { pts[0] };
        for (var i = 0; i < pts.Count - 1; i++)
        {
            var a = result[^1];
            var b = pts[i + 1];
            if (!DenseCrosses(a, b))
            {
                Append(result, b);
                continue;
            }

            if (TryDetour(a, b, out var bridge))
            {
                foreach (var p in bridge)
                    Append(result, p);
            }
            else if (TryLocalWaterBridge(a, b, out bridge))
            {
                foreach (var p in bridge)
                    Append(result, p);
            }
            else
            {
                Append(result, b);
            }
        }
        return result;
    }

    private static void Append(List<LatLon> list, LatLon p)
    {
        p = Wrap(p);
        if (list.Count == 0 ||
            Math.Abs(list[^1].Lat - p.Lat) > 1e-9 ||
            Math.Abs(list[^1].Lon - p.Lon) > 1e-9)
            list.Add(p);
    }

    private static bool TryDetour(LatLon a, LatLon b, out List<LatLon> bridge)
    {
        bridge = [];
        List<LatLon>? best = null;
        var bestLen = double.MaxValue;

        void Consider(List<LatLon> cand)
        {
            if (cand.Count < 2) return;
            var prev = a;
            var len = 0.0;
            foreach (var p in cand)
            {
                if (LandMask.IsBlockedLand(p) || DenseCrosses(prev, p))
                    return;
                len += GeoMath.HaversineNm(prev, p);
                prev = p;
            }
            if (len < bestLen)
            {
                bestLen = len;
                best = cand;
            }
        }

        foreach (var sign in new[] { -1.0, 1.0 })
        {
            for (var o = 0.5; o <= 45.0; o += 0.5)
            {
                var la = a.Lat + sign * o;
                var lb = b.Lat + sign * o;
                Consider([new LatLon(la, a.Lon), new LatLon(la, b.Lon), b]);
                Consider([new LatLon(lb, a.Lon), new LatLon(lb, b.Lon), b]);
                Consider([new LatLon(la, a.Lon), new LatLon(lb, b.Lon), b]);
                var lm = 0.5 * (a.Lat + b.Lat) + sign * o;
                Consider([new LatLon(lm, a.Lon), new LatLon(lm, b.Lon), b]);
            }
        }

        foreach (var sign in new[] { -1.0, 1.0 })
        {
            for (var o = 0.5; o <= 45.0; o += 0.5)
            {
                var lon = GeoMath.WrapLon(a.Lon + sign * o);
                Consider([new LatLon(a.Lat, lon), new LatLon(b.Lat, lon), b]);
                var lonB = GeoMath.WrapLon(b.Lon + sign * o);
                Consider([new LatLon(a.Lat, lonB), new LatLon(b.Lat, lonB), b]);
            }
        }

        if (best is null) return false;
        bridge = best;
        return true;
    }
    /// <summary>
    /// Dense local water A* between two waypoints when U-detours fail.
    /// Uses the same land mask (with coastal erosion) — no named regions.
    /// </summary>
    private static bool TryLocalWaterBridge(LatLon a, LatLon b, out List<LatLon> bridge)
    {
        bridge = [];
        LandMask.EnsureLoaded();
        const int n = 72;
        const double padDeg = 3.5;
        var minLat = Math.Min(a.Lat, b.Lat) - padDeg;
        var maxLat = Math.Max(a.Lat, b.Lat) + padDeg;
        var minLon = Math.Min(a.Lon, b.Lon) - padDeg;
        var maxLon = Math.Max(a.Lon, b.Lon) + padDeg;
        if (maxLon < minLon) (minLon, maxLon) = (maxLon, minLon);

        bool Water(int i, int j)
        {
            var lat = minLat + (maxLat - minLat) * (i + 0.5) / n;
            var lon = GeoMath.WrapLon(minLon + (maxLon - minLon) * (j + 0.5) / n);
            return !LandMask.IsBlockedLand(new LatLon(lat, lon));
        }

        LatLon Cell(int i, int j)
        {
            var lat = minLat + (maxLat - minLat) * (i + 0.5) / n;
            var lon = GeoMath.WrapLon(minLon + (maxLon - minLon) * (j + 0.5) / n);
            return new LatLon(lat, lon);
        }

        (int i, int j)? Nearest(LatLon p)
        {
            var best = (-1, -1);
            var bd = double.MaxValue;
            for (var i = 0; i < n; i++)
            for (var j = 0; j < n; j++)
            {
                if (!Water(i, j)) continue;
                var c = Cell(i, j);
                var d = (c.Lat - p.Lat) * (c.Lat - p.Lat) + (c.Lon - p.Lon) * (c.Lon - p.Lon);
                if (d < bd) { bd = d; best = (i, j); }
            }
            return best.Item1 < 0 ? null : best;
        }

        var s = Nearest(a);
        var g = Nearest(b);
        if (s is null || g is null) return false;

        var open = new PriorityQueue<(int i, int j), double>();
        var gScore = new Dictionary<(int i, int j), double>();
        var parent = new Dictionary<(int i, int j), (int i, int j)>();
        var closed = new HashSet<(int i, int j)>();
        gScore[s.Value] = 0;
        open.Enqueue(s.Value, GeoMath.HaversineNm(Cell(s.Value.i, s.Value.j), b));

        ReadOnlySpan<(int di, int dj)> nbr = [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)];
        var found = false;
        while (open.Count > 0)
        {
            var cur = open.Dequeue();
            if (!closed.Add(cur)) continue;
            if (cur == g.Value) { found = true; break; }
            var curLl = Cell(cur.i, cur.j);
            var curG = gScore[cur];
            foreach (var (di, dj) in nbr)
            {
                var ni = cur.i + di;
                var nj = cur.j + dj;
                if ((uint)ni >= n || (uint)nj >= n) continue;
                if (!Water(ni, nj)) continue;
                var nxt = (ni, nj);
                if (closed.Contains(nxt)) continue;
                var nxtLl = Cell(ni, nj);
                if (LandMask.SegmentCrossesLand(curLl, nxtLl)) continue;
                var tentative = curG + GeoMath.HaversineNm(curLl, nxtLl);
                if (gScore.TryGetValue(nxt, out var old) && tentative >= old) continue;
                parent[nxt] = cur;
                gScore[nxt] = tentative;
                open.Enqueue(nxt, tentative + GeoMath.HaversineNm(nxtLl, b));
            }
        }
        if (!found) return false;

        var rev = new List<LatLon>();
        var c = g.Value;
        while (true)
        {
            rev.Add(Cell(c.i, c.j));
            if (c == s.Value) break;
            if (!parent.TryGetValue(c, out c)) break;
        }
        rev.Reverse();
        // drop first (near a), keep through b
        bridge = rev.Count <= 1 ? [b] : rev.Skip(1).Append(b).ToList();
        return bridge.Count > 0;
    }

}
