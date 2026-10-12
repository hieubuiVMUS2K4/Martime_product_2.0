using System.Text.Json;
using ProductApi.Controllers;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

/// <summary>
/// Hợp đồng JSON của POST /api/sync/push đúng như giao diện gửi (tên nhóm dạng chữ). Lỗi cũ: API chỉ nhận
/// enum dạng số nên mọi lần bấm "Đồng bộ xuống tàu" đều trả 400 — test gọi thẳng service nên không bắt được.
/// </summary>
public class SyncPushRequestJsonTests
{
    // Giống cấu hình AddJsonOptions trong Program.cs
    private static readonly JsonSerializerOptions Api = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
    };

    [Fact]
    public void FrontendBody_WithScopeNames_Deserializes()
    {
        var request = JsonSerializer.Deserialize<SyncPushRequest>(
            """{"target":"edge-9876543-main","scopes":["Catalog","Crew","Vessel","Equipment","Voyages","Reports","Sms"]}""", Api)!;
        Assert.Equal("edge-9876543-main", request.Target);
        Assert.Equal(Enum.GetValues<SyncScope>(), request.Scopes);
    }

    [Fact]
    public void Result_SerializesScopeNamesForTheFrontend()
    {
        var node = new SyncPushNodeResult { NodeId = "edge-a" };
        node.Queued[SyncScope.Crew.ToString()] = 3;
        var json = JsonSerializer.Serialize(new { scope = SyncScope.Crew, node }, Api);
        Assert.Contains("\"scope\":\"Crew\"", json);
        Assert.Contains("\"Crew\":3", json);
    }
}
