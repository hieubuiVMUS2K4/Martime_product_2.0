using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;

namespace ProductApi.Services.Sync;

/// <summary>Routes voyage events through their parent, including before a parent is deleted.</summary>
public static class VoyageSyncRouting
{
    public static bool IsVoyageTable(string table) => table.StartsWith("voyage_", StringComparison.OrdinalIgnoreCase)
        || table.Equals("port_call", StringComparison.OrdinalIgnoreCase)
        || table.Equals("cargo_operation", StringComparison.OrdinalIgnoreCase);

    public static async Task<string> ResolveTargetAsync(AppDbContext context, string table, string key,
        string payload, CancellationToken token = default)
    {
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;
        var parentId = table.Equals("voyage_record", StringComparison.OrdinalIgnoreCase)
            ? key : Property(root, "VoyageId");
        if (!Guid.TryParse(parentId, out var voyageId))
            return "unrouted:" + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes($"{table}:{key}")))[..32]; // Fits the 50-character routing column.

        var voyage = context.ChangeTracker.Entries<VoyageRecord>()
            .FirstOrDefault(e => e.Entity.Id == voyageId)?.Entity
            ?? await context.VoyageRecords.AsNoTracking().SingleOrDefaultAsync(v => v.Id == voyageId, token);
        var imo = table.Equals("voyage_record", StringComparison.OrdinalIgnoreCase)
            ? Property(root, "VesselIMO") ?? voyage?.VesselIMO : voyage?.VesselIMO;
        var origin = voyage?.OriginNode ?? Property(root, "OriginNode");
        Guid? vesselId = null;
        if (!string.IsNullOrWhiteSpace(imo))
            vesselId = await context.Vessels.Where(v => v.IMO == imo.Trim()).Select(v => (Guid?)v.Id).SingleOrDefaultAsync(token);
        // Older voyages may carry only a provisioned Edge origin.
        if (vesselId == null && string.IsNullOrWhiteSpace(imo) && !string.IsNullOrWhiteSpace(origin))
            vesselId = await VesselSyncIdentity.ResolveVesselIdAsync(context, origin);
        return vesselId.HasValue
            ? await VesselSyncIdentity.CanonicalTargetAsync(context, $"vessel:{vesselId}")
            : $"voyage:{voyageId}"; // Unassigned drafts stay durable until their vessel is known.
    }

    private static string? Property(JsonElement root, string name)
    {
        foreach (var field in root.EnumerateObject())
            if (field.Name.Replace("_", "").Equals(name, StringComparison.OrdinalIgnoreCase)
                && field.Value.ValueKind == JsonValueKind.String)
                return field.Value.GetString();
        return null;
    }
}
