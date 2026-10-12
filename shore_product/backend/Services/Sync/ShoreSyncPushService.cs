using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;
using ProductApi.Controllers.Materials;
using ProductApi.Data;
using ProductApi.Models;

namespace ProductApi.Services.Sync;

/// <summary>Nhóm dữ liệu bờ gửi xuống tàu. Người vận hành chọn một vài nhóm hoặc tất cả.</summary>
/// <remarks>API nhận/trả dạng chữ ("Catalog", "Crew"…) — giao diện gửi đúng tên này.</remarks>
[System.Text.Json.Serialization.JsonConverter(typeof(System.Text.Json.Serialization.JsonStringEnumConverter))]
public enum SyncScope
{
    /// <summary>DÙNG CHUNG — Danh mục công ty: quốc gia, chức danh, loại chứng chỉ, cảng, vật tư công ty, loại báo cáo.</summary>
    Catalog,
    /// <summary>RIÊNG TỪNG TÀU — Thuyền viên ĐANG THUỘC tàu cùng chứng chỉ, giấy tờ, sổ thuyền viên, kèm danh sách đối chiếu.</summary>
    Crew,
    /// <summary>RIÊNG TỪNG TÀU — Thông số tàu và vật tư riêng của tàu.</summary>
    Vessel,
    /// <summary>RIÊNG TỪNG TÀU — Thiết bị và lịch bảo dưỡng của tàu.</summary>
    Equipment,
    /// <summary>RIÊNG TỪNG TÀU — Chuyến đi của tàu cùng kế hoạch chặng, cảng ghé, hàng hoá, nhiên liệu, chi phí.</summary>
    Voyages,
    /// <summary>RIÊNG TỪNG TÀU — Báo cáo tàu đã gửi lên bờ (khôi phục lịch sử khi tàu cài lại/đổi máy).</summary>
    Reports,
    /// <summary>DÙNG CHUNG — Hệ thống quản lý an toàn: yếu tố ISM, quy trình, biểu mẫu.</summary>
    Sms,
}

public sealed class SyncPushNodeResult
{
    public string NodeId { get; init; } = string.Empty;
    public string? ShipName { get; init; }
    public string? Imo { get; init; }
    public Dictionary<string, int> Queued { get; } = new();
    public int Total => Queued.Values.Sum();
}

public sealed class SyncPushResult
{
    public List<SyncPushNodeResult> Nodes { get; } = new();
    public int Total => Nodes.Sum(n => n.Total);
}

public interface IShoreSyncPushService
{
    /// <summary>
    /// Xếp hàng dữ liệu các nhóm <paramref name="scopes"/> cho tàu <paramref name="target"/> ("ALL" = mọi tàu đã
    /// đăng ký). Mỗi tàu chỉ nhận dữ liệu của chính nó; danh mục dùng chung thì tàu nào cũng nhận.
    /// </summary>
    Task<SyncPushResult> PushAsync(string target, IReadOnlyCollection<SyncScope> scopes);
}

/// <summary>
/// Luồng bờ → tàu theo nhóm. Luôn gửi ĐÍCH DANH từng node (không phát "*"), nên một bờ phục vụ nhiều tàu
/// mà không tàu nào nhận nhầm dữ liệu của tàu khác.
/// </summary>
public class ShoreSyncPushService(AppDbContext context, ISyncOutboxService outbox, ILogger<ShoreSyncPushService> logger) : IShoreSyncPushService
{
    public const string AllTargets = "ALL";

    private sealed record Target(string NodeId, Guid VesselId, string? ShipName, string Imo);

    public async Task<SyncPushResult> PushAsync(string target, IReadOnlyCollection<SyncScope> scopes)
    {
        if (scopes.Count == 0) throw new ArgumentException("Chọn ít nhất một nhóm dữ liệu để đồng bộ.");
        var targets = await ResolveTargetsAsync(target);
        var result = new SyncPushResult();

        foreach (var t in targets)
        {
            var node = new SyncPushNodeResult { NodeId = t.NodeId, ShipName = t.ShipName, Imo = t.Imo };
            // Thứ tự cố định: danh mục trước (thuyền viên tham chiếu chức danh, quốc gia, loại chứng chỉ).
            foreach (var scope in scopes.Distinct().OrderBy(s => s))
            {
                var items = scope switch
                {
                    SyncScope.Catalog => await CatalogAsync(),
                    SyncScope.Crew => await CrewAsync(t.VesselId),
                    SyncScope.Vessel => await VesselAsync(t.VesselId),
                    SyncScope.Equipment => await EquipmentAsync(t.VesselId),
                    SyncScope.Voyages => await VoyagesAsync(t.VesselId, t.Imo),
                    SyncScope.Reports => await ReportsAsync(t.VesselId, t.Imo),
                    SyncScope.Sms => await SmsAsync(),
                    _ => throw new ArgumentOutOfRangeException(nameof(scopes), scope, null),
                };
                if (items.Count > 0) await outbox.EnqueueBatchAsync(t.NodeId, items);
                node.Queued[scope.ToString()] = items.Count;
            }
            result.Nodes.Add(node);
            logger.LogInformation("[SYNC-PUSH] {Node} ({Ship}): {Counts}", t.NodeId, t.ShipName,
                string.Join(", ", node.Queued.Select(q => $"{q.Key}={q.Value}")));
        }
        return result;
    }

    private async Task<List<Target>> ResolveTargetsAsync(string target)
    {
        var nodes = context.SyncNodeTrackers.AsNoTracking().Where(n => n.IsRegistered && !n.IsRevoked && n.VesselId != null);
        if (!string.Equals(target, AllTargets, StringComparison.OrdinalIgnoreCase))
            nodes = nodes.Where(n => n.NodeId == target);

        var list = await (from n in nodes
                          join v in context.Vessels.AsNoTracking() on n.VesselId equals v.Id
                          orderby v.Name
                          select new Target(n.NodeId, v.Id, v.Name, v.IMO)).ToListAsync();

        if (list.Count == 0)
            throw new ArgumentException(string.Equals(target, AllTargets, StringComparison.OrdinalIgnoreCase)
                ? "Chưa có tàu nào đăng ký đồng bộ."
                : $"Node {target} chưa đăng ký, đã bị thu hồi hoặc chưa gắn với tàu nào.");
        return list;
    }

    private static List<(string, string, SyncActionType, object)> Rows<T>(string table, IEnumerable<T> rows, Func<T, object> key) =>
        rows.Select(r => (table, key(r).ToString()!, SyncActionType.SNAPSHOT, (object)r!)).ToList();

    /// <summary>Gói đối chiếu danh mục: tàu xoá các dòng KHÔNG còn trên bờ (bờ làm chủ danh mục).</summary>
    public const string CatalogRosterTable = "catalog_roster";

    private async Task<List<(string, string, SyncActionType, object)>> CatalogAsync()
    {
        var items = new List<(string, string, SyncActionType, object)>();
        // Đối chiếu TRƯỚC khi gửi dữ liệu: xoá rác ở tàu (dòng bờ đã xoá, dòng tàu tự tạo trước kia)
        // để dòng mới không đụng mã trùng. Thứ tự: bảng nối trước, loại chứng chỉ sau.
        foreach (var (table, keys) in new[]
        {
            ("rank_certificate", await context.RankCertificates.AsNoTracking().Select(x => x.Id).ToListAsync()),
            ("country_certificate", await context.CountryCertificates.AsNoTracking().Select(x => x.Id).ToListAsync()),
            ("certificate", await context.CrewCertificateTypes.AsNoTracking().Select(x => x.Id).ToListAsync()),
        })
            items.Add((CatalogRosterTable, table, SyncActionType.SNAPSHOT, new CatalogRosterPayload { Table = table, Keys = keys }));

        items.AddRange(Rows("country", await context.Countries.AsNoTracking().OrderBy(x => x.Id).ToListAsync(), x => x.Id));
        items.AddRange(Rows("rank", await context.Ranks.AsNoTracking().OrderBy(x => x.Id).ToListAsync(), x => x.Id));
        items.AddRange(Rows("certificate", await context.CrewCertificateTypes.AsNoTracking().OrderBy(x => x.Id).ToListAsync(), x => x.Id));
        items.AddRange(Rows("country_certificate", await context.CountryCertificates.AsNoTracking().OrderBy(x => x.Id).ToListAsync(), x => x.Id));
        items.AddRange(Rows("rank_certificate", await context.RankCertificates.AsNoTracking().OrderBy(x => x.Id).ToListAsync(), x => x.Id));
        // Gồm cả mục đã ngừng dùng để tàu cũng cập nhật IsActive = false.
        items.AddRange(Rows("port", await context.Ports.AsNoTracking().OrderBy(x => x.Id).ToListAsync(), x => x.Id));
        // Danh sách vật tư công ty: loại vật tư trước, vật tư sau (vật tư tham chiếu loại).
        items.AddRange(Rows("material_category", await context.MaterialCategories.AsNoTracking().OrderBy(x => x.Id).ToListAsync(), x => x.Id));
        items.AddRange(Rows("material_item_catalog", await context.MaterialItems.AsNoTracking().OrderBy(x => x.Id).ToListAsync(), x => x.Id));
        // Loại báo cáo (mẫu) là danh mục công ty, dùng chung mọi tàu.
        items.AddRange(Rows("report_type", await context.ReportTypes.AsNoTracking().OrderBy(x => x.Id).ToListAsync(), x => x.Id));
        return items;
    }

    private async Task<List<(string, string, SyncActionType, object)>> CrewAsync(Guid vesselId)
    {
        var crew = await context.CrewMembers.AsNoTracking().Where(c => c.VesselId == vesselId).OrderBy(c => c.CrewId).ToListAsync();
        var ids = crew.Select(c => c.Id).ToList();

        var items = new List<(string, string, SyncActionType, object)>();
        items.AddRange(Rows("crew_member", crew, c => c.Id));
        items.AddRange(Rows("crew_certificate", await context.CrewCertificates.AsNoTracking().Where(x => ids.Contains(x.CrewMemberId)).OrderBy(x => x.Id).ToListAsync(), x => x.Id));
        items.AddRange(Rows("service_record", await context.ServiceRecords.AsNoTracking().Where(x => ids.Contains(x.CrewMemberId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows(CrewMemberDocument.SyncTable, await context.CrewMemberDocuments.AsNoTracking().Where(x => ids.Contains(x.CrewMemberId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("crew_logbook_entry", await context.CrewLogbookEntries.AsNoTracking().Where(x => ids.Contains(x.CrewMemberId)).ToListAsync(), x => x.Id));

        // Cuối cùng: danh sách đối chiếu. Tàu gỡ những thuyền viên từ bờ không còn trong danh sách.
        items.Add((SyncOutboxService.CrewRosterTable, vesselId.ToString(), SyncActionType.SNAPSHOT,
            new CrewRosterPayload { VesselId = vesselId, CrewIds = ids }));
        return items;
    }

    private async Task<List<(string, string, SyncActionType, object)>> VesselAsync(Guid vesselId)
    {
        var items = new List<(string, string, SyncActionType, object)>();
        var vessel = await context.Vessels.AsNoTracking().SingleAsync(v => v.Id == vesselId);

        // Thông số tàu: chỉ các trường bờ có giá trị — không xoá trắng dữ liệu tàu đã nhập mà bờ chưa có.
        var values = VesselParticulars.Editable
            .Select(p => (p.Key, Value: p.Value.GetValue(vessel)))
            .Where(p => p.Value is not null && p.Value is not string { Length: 0 })
            .ToDictionary(p => p.Key, p => p.Value);
        var patch = VesselParticulars.BuildEdgePatch(vessel, values);
        if (patch.Count > 0)
            items.Add((VesselParticulars.SyncTable, vessel.Id.ToString(), SyncActionType.UPDATE, patch));

        var materials = await (from s in context.MaterialItemShips.AsNoTracking()
                               where s.VesselId == vesselId
                               join c in context.MaterialItems.AsNoTracking() on s.MaterialItemCode equals c.ItemCode
                               select new VesselMaterialDefinition
                               {
                                   Id = s.Id, VesselId = vesselId, CatalogId = c.Id, MaterialItemCode = c.ItemCode,
                                   ItemCode = s.ShipItemCode, Name = c.Name, Unit = s.Unit, Specification = s.Specification,
                                   Manufacturer = s.Manufacturer, PartNumber = s.PartNumber, Supplier = s.Supplier,
                                   Notes = s.Notes, UnitCost = s.UnitCost, IsActive = s.IsActive, UpdatedAt = DateTime.UtcNow
                               }).ToListAsync();
        items.AddRange(materials.Select(m => (VesselMaterialsController.SyncTable, m.Id.ToString(), SyncActionType.UPDATE, (object)m)));
        return items;
    }

    private async Task<List<(string, string, SyncActionType, object)>> EquipmentAsync(Guid vesselId)
    {
        var items = new List<(string, string, SyncActionType, object)>();
        items.AddRange(Rows("equipment_asset", await context.EquipmentAssets.AsNoTracking()
            .Where(x => x.VesselId == vesselId).OrderBy(x => x.AssetCode).ToListAsync(), x => x.Id));
        items.AddRange(Rows("maintenance_schedule", await context.MaintenanceSchedules.AsNoTracking()
            .Where(x => x.VesselId == vesselId).OrderBy(x => x.Id).ToListAsync(), x => x.Id));
        return items;
    }

    /// <summary>Chuyến đi của tàu (theo IMO): bản ghi chuyến trước, các bảng con sau.</summary>
    private async Task<List<(string, string, SyncActionType, object)>> VoyagesAsync(Guid vesselId, string imo)
    {
        var voyages = await context.VoyageRecords.AsNoTracking().Where(v => v.VesselIMO == imo).OrderBy(v => v.CreatedAt).ToListAsync();
        var ids = voyages.Select(v => v.Id).ToList();

        var items = new List<(string, string, SyncActionType, object)>();
        items.AddRange(Rows("voyage_record", voyages, x => x.Id));
        items.AddRange(Rows("voyage_plan_leg", await context.VoyagePlanLegs.AsNoTracking().Where(x => ids.Contains(x.VoyageId)).OrderBy(x => x.Sequence).ToListAsync(), x => x.Id));
        items.AddRange(Rows("voyage_status_history", await context.VoyageStatusHistories.AsNoTracking().Where(x => ids.Contains(x.VoyageId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("port_call", await context.PortCalls.AsNoTracking().Where(x => x.VoyageId != null && ids.Contains(x.VoyageId.Value)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("voyage_cargo_plan", await context.VoyageCargoPlans.AsNoTracking().Where(x => ids.Contains(x.VoyageId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("voyage_bunker_plan", await context.VoyageBunkerPlans.AsNoTracking().Where(x => ids.Contains(x.VoyageId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("voyage_crew_change_plan", await context.VoyageCrewChangePlans.AsNoTracking().Where(x => ids.Contains(x.VoyageId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("voyage_cost_estimate", await context.VoyageCostEstimates.AsNoTracking().Where(x => ids.Contains(x.VoyageId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("voyage_revenue_estimate", await context.VoyageRevenueEstimates.AsNoTracking().Where(x => ids.Contains(x.VoyageId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("voyage_expense_request", await context.VoyageExpenseRequests.AsNoTracking().Where(x => ids.Contains(x.VoyageId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("voyage_advance_payment", await context.VoyageAdvancePayments.AsNoTracking().Where(x => ids.Contains(x.VoyageId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("voyage_disbursement", await context.VoyageDisbursements.AsNoTracking().Where(x => ids.Contains(x.VoyageId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("voyage_actual_revenue", await context.VoyageActualRevenues.AsNoTracking().Where(x => ids.Contains(x.VoyageId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("voyage_settlement", await context.VoyageSettlements.AsNoTracking().Where(x => ids.Contains(x.VoyageId)).ToListAsync(), x => x.Id));
        return items;
    }

    /// <summary>Báo cáo do chính tàu này gửi lên (theo node của tàu, hoặc IMO với node cũ).</summary>
    private async Task<List<(string, string, SyncActionType, object)>> ReportsAsync(Guid vesselId, string imo)
    {
        var origins = await context.SyncNodeTrackers.AsNoTracking().Where(n => n.VesselId == vesselId).Select(n => n.NodeId).ToListAsync();
        origins.Add(imo);
        var reports = await context.MaritimeReports.AsNoTracking()
            .Where(r => origins.Contains(r.OriginNode) && r.DeletedAt == null).OrderBy(r => r.ReportDateTime).ToListAsync();
        var ids = reports.Select(r => r.Id).ToList();

        var items = new List<(string, string, SyncActionType, object)>();
        items.AddRange(Rows("maritime_report", reports, x => x.Id));
        items.AddRange(Rows("noon_report", await context.NoonReports.AsNoTracking().Where(x => ids.Contains(x.MaritimeReportId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("departure_report", await context.DepartureReports.AsNoTracking().Where(x => ids.Contains(x.MaritimeReportId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("arrival_report", await context.ArrivalReports.AsNoTracking().Where(x => ids.Contains(x.MaritimeReportId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("bunker_report", await context.BunkerReports.AsNoTracking().Where(x => ids.Contains(x.MaritimeReportId)).ToListAsync(), x => x.Id));
        items.AddRange(Rows("position_report", await context.PositionReports.AsNoTracking().Where(x => ids.Contains(x.MaritimeReportId)).ToListAsync(), x => x.Id));
        return items;
    }

    private async Task<List<(string, string, SyncActionType, object)>> SmsAsync()
    {
        var items = new List<(string, string, SyncActionType, object)>();
        items.AddRange(Rows("ism_element", await context.IsmElements.AsNoTracking().OrderBy(x => x.Id).ToListAsync(), x => x.Id));
        items.AddRange(Rows("sms_procedures", await context.SmsProcedures.AsNoTracking().OrderBy(x => x.Id).ToListAsync(), x => x.Id));
        items.AddRange(Rows("sms_form_templates", await context.SmsFormTemplates.AsNoTracking().OrderBy(x => x.Id).ToListAsync(), x => x.Id));
        return items;
    }
}

/// <summary>Payload của <c>catalog_roster</c>: toàn bộ khoá của một bảng danh mục bờ làm chủ.</summary>
public sealed class CatalogRosterPayload
{
    public string Table { get; set; } = string.Empty;
    public List<int> Keys { get; set; } = new();
}

/// <summary>Payload của <c>crew_roster</c>: toàn bộ thuyền viên bờ đang gắn với tàu nhận.</summary>
public sealed class CrewRosterPayload
{
    public Guid VesselId { get; set; }
    public List<Guid> CrewIds { get; set; } = new();
}
