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
        "voyage_record", "voyage_plan_leg", "port_call", "voyage_status_history", "voyage_crew_assignment",
        "voyage_log_entry", "cargo_operation", "voyage_cargo_plan", "voyage_bunker_plan",
        "voyage_crew_change_plan", "voyage_cost_estimate", "voyage_revenue_estimate", "voyage_expense_request",
        "voyage_advance_payment", "voyage_disbursement", "voyage_actual_revenue", "voyage_settlement",
        "material_category", "material_item_catalog"
    };

    private async Task<List<(object Entity, string Table, SyncActionType Action, string? DeletedPayload, string? DeletedKey, string Target)>> CaptureOutgoingChangesAsync(CancellationToken token)
    {
        var result = new List<(object, string, SyncActionType, string?, string?, string)>();
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
            var target = "*";
            if (ProductApi.Services.Sync.VoyageSyncRouting.IsVoyageTable(table))
            {
                target = await ProductApi.Services.Sync.VoyageSyncRouting.ResolveTargetAsync(this, table,
                    entry.Properties.First(p => p.Metadata.IsPrimaryKey()).CurrentValue!.ToString()!, SerializeSyncScalars(entry.Entity), token);
            }
            else if (entry.Entity.GetType().GetProperty("VesselId")?.GetValue(entry.Entity) is Guid vesselId)
            {
                target = await ProductApi.Services.Sync.VesselSyncIdentity.CanonicalTargetAsync(this, $"vessel:{vesselId}");
            }
            result.Add((entry.Entity, table, deleting ? SyncActionType.DELETE : SyncActionType.SNAPSHOT,
                deleting ? SerializeSyncScalars(entry.Entity) : null,
                deleting ? entry.Properties.First(p => p.Metadata.IsPrimaryKey()).CurrentValue?.ToString() : null, target));
        }
        return result.OrderBy(change => change.Item3 == SyncActionType.DELETE
            ? -OutgoingDependencyOrder(change.Item2) : OutgoingDependencyOrder(change.Item2)).ToList();
    }

    private static int OutgoingDependencyOrder(string table) => table switch
    {
        "country" or "rank" or "certificate" or "report_type" or "ism_element" => 0,
        "crew_member" or "voyage_record" => 10,
        "voyage_plan_leg" or "sms_procedure" => 20,
        _ => 30
    };

    private string SerializeSyncScalars(object entity)
    {
        var values = Entry(entity).Properties.ToDictionary(p => p.Metadata.Name, p => p.CurrentValue);
        return JsonSerializer.Serialize(values);
    }

    private void AddCapturedOutbox(List<(object Entity, string Table, SyncActionType Action, string? DeletedPayload, string? DeletedKey, string Target)> changes)
    {
        foreach (var change in changes)
        {
            var key = change.DeletedKey ?? Entry(change.Entity).Properties.First(p => p.Metadata.IsPrimaryKey()).CurrentValue?.ToString();
            if (string.IsNullOrEmpty(key)) throw new InvalidOperationException("Cannot persist an outbox event without a record key.");
            SyncOutbox.Add(new SyncOutbox
            {
                TargetNode = change.Target, TableName = change.Table, RecordKey = key, ActionType = change.Action,
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
        var outgoing = await CaptureOutgoingChangesAsync(cancellationToken);
        var result = await base.SaveChangesAsync(cancellationToken);
        if (outgoing.Count > 0)
        {
            AddCapturedOutbox(outgoing);
            await base.SaveChangesAsync(cancellationToken);
        }
        if (transaction != null) await transaction.CommitAsync(cancellationToken);
        return result;
    }
}
