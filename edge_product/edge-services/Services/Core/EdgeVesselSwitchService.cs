using System.Text.Json;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace MaritimeEdge.Services.Core;

/// <summary>Kết quả kiểm tra trước khi kích hoạt một gói cấu hình.</summary>
public sealed class VesselSwitchCheck
{
    /// <summary>Gói thuộc tàu khác tàu đang chạy (hoặc máy có dữ liệu nhưng chưa từng kích hoạt gói nào).</summary>
    public bool RequiresReset { get; init; }
    public string? CurrentVesselName { get; init; }
    public string? CurrentVesselImo { get; init; }
    public string? NewVesselName { get; init; }
    public string? NewVesselImo { get; init; }
    /// <summary>Số thay đổi trên tàu chưa gửi lên bờ — sẽ mất nếu xoá.</summary>
    public int PendingUploads { get; init; }
}

public sealed record ShoreHandshakeResult(bool Success, string? Error, int FullSyncQueued);

public interface IEdgeVesselSwitchService
{
    Task<VesselSwitchCheck> CheckAsync(EdgeProvisioningProfile target, CancellationToken ct = default);

    /// <summary>Xoá toàn bộ dữ liệu của tàu (giữ danh mục dùng chung và tài khoản hệ thống). Gọi trong transaction của người gọi.</summary>
    Task<int> WipeVesselDataAsync(CancellationToken ct = default);

    /// <summary>Gọi /api/sync/handshake của bờ bằng thông tin của <paramref name="profile"/>.</summary>
    Task<ShoreHandshakeResult> HandshakeAsync(EdgeProvisioningProfile profile, bool requestFullSync, CancellationToken ct = default);

    Task<bool> HasPendingFullSyncAsync(CancellationToken ct = default);

    /// <summary>Nếu lần đổi tàu trước chưa xin được bờ gửi lại toàn bộ (bờ mất kết nối), thử lại. Trả về true khi đã xin được.</summary>
    Task<bool> CompletePendingFullSyncAsync(CancellationToken ct = default);
}

/// <summary>
/// Đổi tàu bằng gói cấu hình: một máy edge chỉ chứa dữ liệu của MỘT tàu. Khi kích hoạt gói của tàu khác
/// (khác shoreVesselId), toàn bộ dữ liệu tàu cũ bị xoá và bờ gửi lại toàn bộ dữ liệu của tàu mới — tàu luôn
/// theo bờ. Gói cùng tàu (xoay khoá, đổi địa chỉ bờ) thì giữ nguyên dữ liệu.
/// </summary>
public class EdgeVesselSwitchService(
    EdgeDbContext context,
    IEdgeDataEncryptionService encryption,
    IHttpClientFactory httpClientFactory,
    ILogger<EdgeVesselSwitchService> logger) : IEdgeVesselSwitchService
{
    /// <summary>Đánh dấu "đã xoá dữ liệu, chưa xin được bờ gửi lại toàn bộ". Giá trị = NodeId.</summary>
    public const string FullSyncPendingKey = "provisioning:full-sync-pending";

    /// <summary>
    /// Bảng GIỮ khi đổi tàu: danh mục bờ làm chủ (bờ gửi lại kèm danh sách đối chiếu, nên dòng thừa sẽ bị dọn),
    /// danh mục cục bộ, tài khoản/quyền và lịch sử gói cấu hình. Mọi bảng khác là dữ liệu của tàu → xoá.
    /// </summary>
    public static readonly IReadOnlySet<Type> KeptEntities = new HashSet<Type>
    {
        typeof(EdgeProvisioningProfile),
        typeof(Role), typeof(RankPermissionConfig), typeof(User), typeof(UserSession), typeof(LoginAttempt), typeof(SystemLog),
        typeof(Country), typeof(Rank), typeof(Certificate), typeof(RankCertificate), typeof(CountryCertificate),
        typeof(Port), typeof(ReportType), typeof(DrillType),
        typeof(MaterialCategory), typeof(MaterialCatalogItem),
        typeof(IsmElement), typeof(SmsProcedure), typeof(SmsFormTemplate),
    };

    public async Task<VesselSwitchCheck> CheckAsync(EdgeProvisioningProfile target, CancellationToken ct = default)
    {
        var active = await context.EdgeProvisioningProfiles.AsNoTracking()
            .FirstOrDefaultAsync(p => p.IsActive && p.Id != target.Id, ct);
        var ship = await context.ShipData.AsNoTracking().FirstOrDefaultAsync(ct);
        var pending = await context.SyncQueue.AsNoTracking().CountAsync(q => q.SyncedAt == null, ct);

        bool requiresReset;
        if (active != null)
            requiresReset = active.VesselId != target.VesselId;
        else
            // Chưa từng kích hoạt gói: dữ liệu đang có không rõ nguồn (dữ liệu mẫu, tàu khác) → làm sạch theo bờ.
            requiresReset = ship != null || await context.CrewMembers.AnyAsync(ct) || pending > 0;

        return new VesselSwitchCheck
        {
            RequiresReset = requiresReset,
            CurrentVesselName = active?.VesselName ?? ship?.ShipName,
            CurrentVesselImo = active?.VesselImo ?? ship?.ImoNumber,
            NewVesselName = target.VesselName,
            NewVesselImo = target.VesselImo,
            PendingUploads = pending,
        };
    }

    public async Task<int> WipeVesselDataAsync(CancellationToken ct = default)
    {
        var model = context.Model;
        var wiped = model.GetEntityTypes()
            .Where(e => !e.IsOwned() && e.GetTableName() != null && e.GetViewName() == null && !KeptEntities.Contains(e.ClrType))
            .ToList();
        var wipedTables = wiped.Select(TableOf).ToHashSet();

        // 1) Tài khoản tự tạo cho thuyền viên đi cùng thuyền viên.
        await context.Database.ExecuteSqlRawAsync(
            """DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE crew_id IS NOT NULL)""", ct);
        await context.Database.ExecuteSqlRawAsync("""DELETE FROM users WHERE crew_id IS NOT NULL""", ct);

        // 2) Bảng giữ lại còn trỏ vào bảng sắp xoá: khoá ngoại cho phép null thì gỡ, không thì xoá dòng.
        foreach (var kept in model.GetEntityTypes().Where(e => KeptEntities.Contains(e.ClrType) && e.GetTableName() != null))
        {
            var keptTable = TableOf(kept);
            foreach (var fk in kept.GetForeignKeys().Where(fk => wipedTables.Contains(TableOf(fk.PrincipalEntityType))))
            {
                var cols = fk.Properties.Select(p => Quote(p.GetColumnName(StoreObjectIdentifier.Table(keptTable.Name, keptTable.Schema))!)).ToList();
                var notNull = string.Join(" OR ", cols.Select(c => $"{c} IS NOT NULL"));
                var sql = fk.Properties.All(p => p.IsNullable)
                    ? $"UPDATE {keptTable} SET {string.Join(", ", cols.Select(c => $"{c} = NULL"))} WHERE {notNull}"
                    : $"DELETE FROM {keptTable} WHERE {notNull}";
                await context.Database.ExecuteSqlRawAsync(sql, ct);
            }
        }

        // 3) Xoá theo thứ tự khoá ngoại: bảng con trước, bảng cha sau.
        var deleted = 0;
        foreach (var table in DeleteOrder(wiped))
            deleted += await context.Database.ExecuteSqlRawAsync($"DELETE FROM {table}", ct);

        logger.LogWarning("[VESSEL-SWITCH] Đã xoá {Rows} dòng dữ liệu tàu cũ trong {Tables} bảng", deleted, wipedTables.Count);
        return deleted;
    }

    public async Task<ShoreHandshakeResult> HandshakeAsync(EdgeProvisioningProfile profile, bool requestFullSync, CancellationToken ct = default)
    {
        var rawToken = encryption.Decrypt(profile.NodeApiToken) ?? string.Empty;
        var client = httpClientFactory.CreateClient();
        client.BaseAddress = new Uri(profile.ShoreBaseUrl!.TrimEnd('/') + "/");
        client.Timeout = TimeSpan.FromSeconds(15);
        client.DefaultRequestHeaders.Add("X-Node-Api-Token", rawToken);

        var body = JsonSerializer.Serialize(new
        {
            nodeId = profile.NodeId,
            vesselImo = profile.VesselImo,
            shoreVesselId = profile.VesselId,
            edgeVersion = "3.0",
            networkType = profile.NetworkType ?? "Shore_WiFi",
            requestFullSync,
        });

        using var response = await client.PostAsync("api/sync/handshake",
            new StringContent(body, System.Text.Encoding.UTF8, "application/json"), ct);
        var responseBody = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            return new ShoreHandshakeResult(false, $"HTTP {(int)response.StatusCode}: {Truncate(responseBody, 500)}", 0);

        try
        {
            using var json = JsonDocument.Parse(responseBody);
            var root = json.RootElement;
            var accepted = root.TryGetProperty("accepted", out var a) && a.ValueKind == JsonValueKind.True;
            var nodeId = root.TryGetProperty("nodeId", out var n) ? n.GetString() : null;
            var imo = root.TryGetProperty("vesselImo", out var i) ? i.GetString() : null;
            var hasVessel = root.TryGetProperty("shoreVesselId", out var v) && v.TryGetGuid(out var vesselId) && vesselId == profile.VesselId;
            if (!accepted || nodeId != profile.NodeId || !string.Equals(imo, profile.VesselImo, StringComparison.OrdinalIgnoreCase) || !hasVessel)
                return new ShoreHandshakeResult(false, "Shore accepted the request but returned a different node/vessel identity.", 0);
            var queued = root.TryGetProperty("fullSyncQueued", out var q) && q.TryGetInt32(out var count) ? count : 0;
            return new ShoreHandshakeResult(true, null, queued);
        }
        catch (JsonException)
        {
            return new ShoreHandshakeResult(false, "Shore handshake response is not valid JSON.", 0);
        }
    }

    public Task<bool> HasPendingFullSyncAsync(CancellationToken ct = default) =>
        context.SyncState.AsNoTracking().AnyAsync(s => s.Key == FullSyncPendingKey, ct);

    public async Task<bool> CompletePendingFullSyncAsync(CancellationToken ct = default)
    {
        var flag = await context.SyncState.AsTracking().SingleOrDefaultAsync(s => s.Key == FullSyncPendingKey, ct);
        if (flag == null) return true;

        var profile = await context.EdgeProvisioningProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.IsActive, ct);
        if (profile == null || profile.NodeId != flag.Value)
        {
            context.SyncState.Remove(flag);
            await context.SaveChangesAsync(ct);
            return true;
        }

        try
        {
            var result = await HandshakeAsync(profile, requestFullSync: true, ct);
            if (!result.Success)
            {
                logger.LogWarning("[VESSEL-SWITCH] Chưa xin được bờ gửi lại toàn bộ dữ liệu: {Error}", result.Error);
                return false;
            }
            context.SyncState.Remove(flag);
            await context.SaveChangesAsync(ct);
            logger.LogInformation("[VESSEL-SWITCH] Bờ đã xếp hàng {Count} gói dữ liệu cho {NodeId}", result.FullSyncQueued, profile.NodeId);
            return true;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning(ex, "[VESSEL-SWITCH] Bờ không trả lời, sẽ thử lại");
            return false;
        }
    }

    private static List<TableRef> DeleteOrder(IEnumerable<IEntityType> entities)
    {
        // Gộp theo bảng (nhiều entity có thể dùng chung một bảng), rồi sắp xếp topo: con trước cha.
        var tables = entities.GroupBy(TableOf).ToDictionary(g => g.Key, g => g.ToList());
        var parents = tables.ToDictionary(t => t.Key, t => t.Value
            .SelectMany(e => e.GetForeignKeys())
            .Select(fk => TableOf(fk.PrincipalEntityType))
            .Where(p => p != t.Key && tables.ContainsKey(p))
            .ToHashSet());

        var order = new List<TableRef>();
        var remaining = tables.Keys.ToHashSet();
        while (remaining.Count > 0)
        {
            // Bảng không còn bảng con nào chưa xoá trỏ vào.
            var leaves = remaining.Where(t => !remaining.Any(o => o != t && parents[o].Contains(t))).OrderBy(t => t.ToString()).ToList();
            if (leaves.Count == 0)
                throw new InvalidOperationException("Vòng khoá ngoại giữa các bảng: " + string.Join(", ", remaining));
            order.AddRange(leaves);
            remaining.ExceptWith(leaves);
        }
        return order;
    }

    private static TableRef TableOf(IEntityType e) => new(e.GetTableName()!, e.GetSchema());

    private static string Quote(string identifier) => "\"" + identifier.Replace("\"", "\"\"") + "\"";

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];

    private sealed record TableRef(string Name, string? Schema)
    {
        public override string ToString() => Schema == null ? Quote(Name) : $"{Quote(Schema)}.{Quote(Name)}";
    }
}
