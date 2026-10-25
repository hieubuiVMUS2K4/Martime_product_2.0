using System.Text.Json;

namespace Maritime.Shared.Models.Sync;

/// <summary>Keep protocol-2 Job/WO events out of the lossy legacy entity mapper.</summary>
public static class PmsSyncProtocol
{
    public const string UpgradeRequired = "pms_protocol_upgrade_required: dedicated Job/Work Order synchronization is not ready; event retained";

    public static bool RequiresDedicatedReceiver(string tableName, string payload)
    {
        var table = tableName.Trim().ToLowerInvariant();
        if (table is "pms_work_order_reports" or "pms_work_order_report" or
            "pms_work_order_material_postings" or "pms_work_order_material_posting") return true;
        if (table is not ("maintenance_schedule" or "maintenance_schedules" or
            "maintenance_task" or "maintenance_tasks")) return false;
        try
        {
            using var document = JsonDocument.Parse(payload);
            if (document.RootElement.ValueKind != JsonValueKind.Object) return true;
            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (!property.Name.Equals("PmsProtocolVersion", StringComparison.OrdinalIgnoreCase) &&
                    !property.Name.Equals("pms_protocol_version", StringComparison.OrdinalIgnoreCase)) continue;
                if (property.Value.ValueKind == JsonValueKind.Null) continue;
                if (property.Value.ValueKind != JsonValueKind.Number ||
                    !property.Value.TryGetInt32(out var version) || version != 1) return true;
            }
            return false;
        }
        catch (JsonException) { return true; }
    }

    public static void RejectLegacyReceiver(string tableName, string payload)
    {
        if (RequiresDedicatedReceiver(tableName, payload))
            throw new InvalidOperationException(UpgradeRequired);
    }
}
