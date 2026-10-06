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
        "crew_member", "crew_certificate", "crew_logbook_entry", "travel_document", "seafarer_document",
        "employment_document", "health_document", "ism_element", "sms_procedure", "sms_form_template",
        "voyage_record", "voyage_plan_leg", "voyage_crew_assignment", "voyage_cargo_plan", "voyage_bunker_plan",
        "voyage_crew_change_plan", "voyage_cost_estimate", "voyage_revenue_estimate", "voyage_expense_request",
        "voyage_advance_payment", "voyage_disbursement", "voyage_actual_revenue", "voyage_settlement",
        "material_category", "material_item_catalog"
    };

    private List<(object Entity, string Table, SyncActionType Action, string? DeletedPayload, string? DeletedKey)> CaptureOutgoingChanges()
    {
        var result = new List<(object, string, SyncActionType, string?, string?)>();
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
            result.Add((entry.Entity, table, deleting ? SyncActionType.DELETE : SyncActionType.SNAPSHOT,
                deleting ? SerializeSyncScalars(entry.Entity) : null,
                deleting ? entry.Properties.First(p => p.Metadata.IsPrimaryKey()).CurrentValue?.ToString() : null));
        }
        return result;
    }

    private string SerializeSyncScalars(object entity)
    {
        var values = Entry(entity).Properties.ToDictionary(p => p.Metadata.Name, p => p.CurrentValue);
        return JsonSerializer.Serialize(values);
    }

    private async Task AddCapturedOutboxAsync(List<(object Entity, string Table, SyncActionType Action, string? DeletedPayload, string? DeletedKey)> changes, CancellationToken token)
    {
        foreach (var change in changes)
        {
            var key = change.DeletedKey ?? Entry(change.Entity).Properties.First(p => p.Metadata.IsPrimaryKey()).CurrentValue?.ToString();
            if (string.IsNullOrEmpty(key)) throw new InvalidOperationException("Cannot persist an outbox event without a record key.");
            var target = "*";
            if (change.Entity.GetType().GetProperty("VesselId")?.GetValue(change.Entity) is Guid vesselId)
            {
                var imo = await Vessels.Where(v => v.Id == vesselId).Select(v => v.IMO).FirstOrDefaultAsync(token)
                    ?? throw new InvalidOperationException("Cannot route a vessel-scoped outbox event.");
                target = await ProductApi.Services.Sync.VesselSyncIdentity.CanonicalTargetAsync(this, imo);
            }
            SyncOutbox.Add(new SyncOutbox
            {
                TargetNode = target, TableName = change.Table, RecordKey = key, ActionType = change.Action,
                Payload = change.DeletedPayload ?? SerializeSyncScalars(change.Entity), CreatedAt = DateTime.UtcNow,
                SyncVersion = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            });
        }
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
