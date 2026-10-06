namespace MaritimeEdge.Constants;

public static class MaintenanceCategories
{
    public static bool IsSupported(string? category) => category is "PERIODIC" or "AD_HOC" or "CORRECTIVE" or "DRY_DOCK" or "ON_DEMAND" or "VOYAGE";
    public static bool IsEventDriven(string? category) => category is "DRY_DOCK" or "ON_DEMAND" or "VOYAGE";
    public static string TaskType(string? category, string? interval) => category is "AD_HOC" or "CORRECTIVE" or "DRY_DOCK" or "ON_DEMAND" or "VOYAGE"
        ? category : interval ?? "CALENDAR";
}
