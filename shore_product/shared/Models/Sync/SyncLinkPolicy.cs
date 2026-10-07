namespace Maritime.Shared.Models.Sync;

/// <summary>Conservative per-link budgets, overridable after measuring the vessel's actual link.</summary>
public sealed record SyncLinkPolicy(int MetadataBytes, int ChunkBytes, int RequestTimeoutSeconds, int PollSeconds)
{
    public static SyncLinkPolicy For(NetworkType network) => network switch
    {
        NetworkType.None => new(0, 0, 0, 60),
        NetworkType.Satellite_Iridium => new(8 * 1024, 8 * 1024, 120, 120),
        NetworkType.Satellite_VSAT => new(32 * 1024, 32 * 1024, 120, 60),
        NetworkType.Cellular_4G => new(128 * 1024, 128 * 1024, 60, 30),
        _ => new(256 * 1024, 256 * 1024, 60, 30)
    };

    public static SyncPriority[] Priorities(NetworkType network) => network switch
    {
        NetworkType.None => [],
        NetworkType.Satellite_Iridium => [SyncPriority.Critical],
        NetworkType.Satellite_VSAT => [SyncPriority.Critical, SyncPriority.Operational],
        _ => [SyncPriority.Critical, SyncPriority.Operational, SyncPriority.Low]
    };

    public static SyncPriority TablePriority(string table) => table.ToLowerInvariant() switch
    {
        "safety_alarm" or "engine_event" or "alert" => SyncPriority.Critical,
        "maintenance_history" or "task_deferral_request" or "maintenance_task" or "maintenance_schedule" or "equipment_asset" or "equipment_group" or
        "crew_member" or "crew_certificate" or "crew_logbook_entry" or "maritime_report" or "report_type" or "ship_data" or
        "rank" or "country" or "certificate" or "rank_certificate" or "country_certificate" or "port" or
        "ism_element" or "sms_procedure" or "sms_procedures" or "sms_form_template" or "sms_form_templates" => SyncPriority.Operational,
        _ => SyncPriority.Low
    };
}
