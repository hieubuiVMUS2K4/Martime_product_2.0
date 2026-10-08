using System.Text.Json;
using System.Text.RegularExpressions;
using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;

namespace ProductApi.Data;

public partial class AppDbContext
{
    public bool SuppressAutoOutbox { get; set; }

    // Capture changes before committing business data, including deletions and generated IDs.
    // Explicit service enqueue calls remain compatible: they may add redundant immutable snapshots.
    private static readonly HashSet<string> OutgoingTables = new(StringComparer.OrdinalIgnoreCase)
    {
        "certificate", "country", "rank", "rank_certificate", "country_certificate", "port", "report_type",
        "crew_member", "crew_certificate", "crew_logbook_entry", "crew_member_document", "ism_element", "sms_procedure", "sms_form_template",
        "voyage_record", "voyage_plan_leg", "voyage_crew_assignment", "voyage_cargo_plan", "voyage_bunker_plan",
        "voyage_crew_change_plan", "voyage_cost_estimate", "voyage_revenue_estimate", "voyage_expense_request",
        "voyage_advance_payment", "voyage_disbursement", "voyage_actual_revenue", "voyage_settlement",
        "material_category", "material_item_catalog",
        // Thiết bị và lịch bảo dưỡng của tàu: bờ sửa thì gửi về đúng tàu đó.
        "equipment_asset", "maintenance_schedule"
    };

    private List<(object Entity, string Table, SyncActionType Action, string? DeletedPayload, string? DeletedKey, Guid? PreviousVesselId)> CaptureOutgoingChanges()
    {
        var result = new List<(object, string, SyncActionType, string?, string?, Guid?)>();
        if (SuppressAutoOutbox) return result;
        ChangeTracker.DetectChanges();
        foreach (var entry in ChangeTracker.Entries().Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted).ToList())
        {
            var table = Regex.Replace(entry.Metadata.ClrType.Name, "([a-z0-9])([A-Z])", "$1_$2").ToLowerInvariant();
            if (table == "material_catalog_item") table = "material_item_catalog";
            if (!OutgoingTables.Contains(table)) continue;
            if (entry.State == EntityState.Modified && !entry.Properties.Any(p => p.IsModified &&
                p.Metadata.Name is not ("IsSynced" or "SyncVersion" or "OriginNode" or "LastSyncedAt" or "UpdatedAt" or "EdgeChanges" or "EdgeChangesViewed"))) continue;
            var deleting = entry.State == EntityState.Deleted;
            // Thuyền viên vừa rời tàu (VesselId → null) vẫn phải báo cho tàu cũ: giữ tàu trước khi sửa.
            Guid? previousVessel = entry.Entity is Maritime.Shared.Models.Crew.CrewMember && entry.State != EntityState.Added
                ? entry.Property("VesselId").OriginalValue as Guid? : null;
            result.Add((entry.Entity, table, deleting ? SyncActionType.DELETE : SyncActionType.SNAPSHOT,
                deleting ? SerializeSyncScalars(entry.Entity) : null,
                deleting ? entry.Properties.First(p => p.Metadata.IsPrimaryKey()).CurrentValue?.ToString() : null,
                previousVessel));
        }
        return result;
    }

    private string SerializeSyncScalars(object entity)
    {
        var values = Entry(entity).Properties.ToDictionary(p => p.Metadata.Name, p => p.CurrentValue);
        return JsonSerializer.Serialize(values);
    }

    private async Task AddCapturedOutboxAsync(List<(object Entity, string Table, SyncActionType Action, string? DeletedPayload, string? DeletedKey, Guid? PreviousVesselId)> changes, CancellationToken token)
    {
        foreach (var change in changes)
        {
            var key = change.DeletedKey ?? Entry(change.Entity).Properties.First(p => p.Metadata.IsPrimaryKey()).CurrentValue?.ToString();
            if (string.IsNullOrEmpty(key)) throw new InvalidOperationException("Cannot persist an outbox event without a record key.");
            var target = "*";
            string? stampImo = null;
            if (!ProductApi.Services.Sync.SyncOutboxService.SharedCatalogTables.Contains(change.Table))
            {
                // Dữ liệu riêng của tàu: chỉ tới đúng một tàu. Không xác định được tàu (thuyền viên chưa thuộc tàu
                // nào, chuyến đi chưa gắn tàu…) thì KHÔNG gửi đi đâu — tuyệt đối không phát cho mọi tàu.
                stampImo = await TargetVesselImoAsync(change.Entity, change.Table, change.PreviousVesselId, token);
                if (string.IsNullOrWhiteSpace(stampImo)) continue;
                target = await ProductApi.Services.Sync.VesselSyncIdentity.CanonicalTargetAsync(this, stampImo);
            }
            SyncOutbox.Add(new SyncOutbox
            {
                TargetNode = target, TableName = change.Table, RecordKey = key, ActionType = change.Action,
                Payload = Stamp(change.DeletedPayload ?? SerializeSyncScalars(change.Entity), stampImo), CreatedAt = DateTime.UtcNow,
                SyncVersion = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            });
        }
    }

    /// <summary>IMO tàu sở hữu bản ghi: thuyền viên theo tàu thuyền viên đang thuộc; bản ghi có VesselId theo tàu đó;
    /// dữ liệu chuyến đi theo tàu của chuyến.</summary>
    private async Task<string?> TargetVesselImoAsync(object entity, string table, Guid? previousVesselId, CancellationToken token)
    {
        Guid? vesselId;
        if (ProductApi.Services.Sync.SyncOutboxService.CrewScopedTables.Contains(table))
            // Không theo VesselId của chính bản ghi — sổ thuyền viên mang tàu của kỳ phục vụ cũ.
            vesselId = await CrewVesselAsync(entity, previousVesselId, token);
        else if (entity is ProductApi.Models.VoyageRecord voyage)
            return string.IsNullOrWhiteSpace(voyage.VesselIMO) ? null : voyage.VesselIMO;
        else if (entity.GetType().GetProperty("VesselId")?.GetValue(entity) is Guid ownVessel)
            vesselId = ownVessel;
        else if (entity.GetType().GetProperty("VoyageId")?.GetValue(entity) is Guid voyageId)
            return await VoyageRecords.Where(v => v.Id == voyageId).Select(v => v.VesselIMO).FirstOrDefaultAsync(token);
        else
            vesselId = null;

        if (vesselId == null) return null;
        return await Vessels.Where(v => v.Id == vesselId.Value).Select(v => v.IMO).FirstOrDefaultAsync(token);
    }

    private async Task<Guid?> CrewVesselAsync(object entity, Guid? previousVesselId, CancellationToken token)
    {
        if (entity is Maritime.Shared.Models.Crew.CrewMember crew) return crew.VesselId ?? previousVesselId;
        if (entity.GetType().GetProperty("CrewMemberId")?.GetValue(entity) is not Guid crewId) return null;
        return await CrewMembers.Where(c => c.Id == crewId).Select(c => c.VesselId).FirstOrDefaultAsync(token);
    }

    private static string Stamp(string payload, string? imo)
    {
        if (imo == null || System.Text.Json.Nodes.JsonNode.Parse(payload) is not System.Text.Json.Nodes.JsonObject json) return payload;
        json[ProductApi.Services.Sync.SyncOutboxService.TargetVesselImoField] = imo;
        return json.ToJsonString();
    }

    public override int SaveChanges() => SaveChangesAsync().GetAwaiter().GetResult();

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        await using var transaction = Database.IsRelational() && Database.CurrentTransaction == null
            ? await Database.BeginTransactionAsync(cancellationToken) : null;
        var outgoing = CaptureOutgoingChanges();
        var result = await base.SaveChangesAsync(cancellationToken);
        if (outgoing.Count > 0)
        {
            await AddCapturedOutboxAsync(outgoing, cancellationToken);
            await base.SaveChangesAsync(cancellationToken);
        }
        if (transaction != null) await transaction.CommitAsync(cancellationToken);
        return result;
    }
}
