namespace Maritime.Shared.Models.Sync;

/// <summary>Field ownership shared by both ends of voyage synchronization.</summary>
public static class VoyageSyncOwnership
{
    public static readonly IReadOnlySet<string> EdgeRecordFields = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "VoyageStatus", "Status", "StartDateTime", "DepartureTime", "EndDateTime", "ArrivalTime",
        "DeparturePort", "DeparturePortCode", "ArrivalPort", "ArrivalPortCode", "CargoType", "CargoWeight",
        "DistanceTraveled", "FuelConsumed", "AverageSpeed", "CommencedAt", "ArrivedAt", "CompletedAt", "CancelledAt"
    };

    public static readonly IReadOnlySet<string> ShoreRecordFields = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "PlannedDistance", "PlannedDurationHours", "PlannedAverageSpeed", "PlannedFuelConsumption", "VoyageInstructions",
        "TotalEstimatedCost", "TotalEstimatedRevenue", "EstimatedProfitMargin", "FinancialStatus",
        "FinancialClosedAt", "FinancialClosedBy", "ApprovedAt", "ReadyAt"
    };

    // Shore controls approval/readiness while Edge controls actual execution.
    public static bool AcceptShoreStatus(string? existing, string? incoming) =>
        existing is "PLANNING" or "DRAFT" or "APPROVED" or "READY"
        && incoming is "APPROVED" or "READY" or "CANCELLED"
        && !(existing == "READY" && incoming == "APPROVED");
}
