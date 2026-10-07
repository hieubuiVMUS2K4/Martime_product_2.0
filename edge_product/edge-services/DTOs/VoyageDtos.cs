namespace MaritimeEdge.DTOs;

// ========== PORT DTOs ==========

public class PortDto
{
    public int Id { get; set; }
    public string PortCode { get; set; } = string.Empty;
    public string PortName { get; set; } = string.Empty;
    public string? Country { get; set; }
    public string? CountryCode { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string? TimeZone { get; set; }
    public bool IsActive { get; set; }
}

public class PortSearchQuery
{
    public string? Search { get; set; }
    public string? CountryCode { get; set; }
    public bool? IsActive { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 50;
}

// ========== PORT CALL DTOs ==========

public class PortCallDto
{
    public Guid Id { get; set; }
    public Guid VoyageId { get; set; }
    public int? PortId { get; set; }
    public string? PortCode { get; set; }
    public string PortName { get; set; } = string.Empty;
    public string? Country { get; set; }
    public string CallType { get; set; } = string.Empty;
    public int Sequence { get; set; }
    public DateTime? ArrivalTime { get; set; }
    public DateTime? DepartureTime { get; set; }
    public string? BerthNumber { get; set; }
    public DateTime? PilotOnBoard { get; set; }
    public DateTime? PilotOffBoard { get; set; }
    public double? DraftFore { get; set; }
    public double? DraftAft { get; set; }
    public bool CargoOpsCompleted { get; set; }
    public string? Remarks { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class CreatePortCallDto
{
    public Guid VoyageId { get; set; }
    public int? PortId { get; set; }
    public string? PortCode { get; set; }
    public string PortName { get; set; } = string.Empty;
    public string? Country { get; set; }
    public string CallType { get; set; } = "ARRIVAL";
    public int? Sequence { get; set; }
    public DateTime? ArrivalTime { get; set; }
    public DateTime? DepartureTime { get; set; }
    public string? BerthNumber { get; set; }
    public DateTime? PilotOnBoard { get; set; }
    public DateTime? PilotOffBoard { get; set; }
    public double? DraftFore { get; set; }
    public double? DraftAft { get; set; }
    public bool CargoOpsCompleted { get; set; }
    public string? Remarks { get; set; }
}

public class UpdatePortCallDto
{
    public int? PortId { get; set; }
    public string? PortCode { get; set; }
    public string? PortName { get; set; }
    public string? Country { get; set; }
    public string? CallType { get; set; }
    public int? Sequence { get; set; }
    public DateTime? ArrivalTime { get; set; }
    public DateTime? DepartureTime { get; set; }
    public string? BerthNumber { get; set; }
    public DateTime? PilotOnBoard { get; set; }
    public DateTime? PilotOffBoard { get; set; }
    public double? DraftFore { get; set; }
    public double? DraftAft { get; set; }
    public bool? CargoOpsCompleted { get; set; }
    public string? Remarks { get; set; }
}

// ========== VOYAGE CREW ASSIGNMENT DTOs ==========

public class VoyageCrewAssignmentDto
{
    public Guid Id { get; set; }
    public Guid VoyageId { get; set; }
    public string? VoyageNumber { get; set; }
    public Guid CrewMemberId { get; set; }
    public string? CrewName { get; set; }
    public string? CrewId { get; set; }
    public int? RankId { get; set; }
    public string? RankName { get; set; }
    public string Role { get; set; } = string.Empty;
    public string? EmbarkPortCode { get; set; }
    public string? EmbarkPortName { get; set; }
    public DateTime? EmbarkDate { get; set; }
    public string? DisembarkPortCode { get; set; }
    public string? DisembarkPortName { get; set; }
    public DateTime? DisembarkDate { get; set; }
    public string? WatchSchedule { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? Remarks { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class CreateVoyageCrewAssignmentDto
{
    public Guid VoyageId { get; set; }
    public Guid CrewMemberId { get; set; }
    public int? RankId { get; set; }
    public string Role { get; set; } = "REGULAR";
    public string? EmbarkPortCode { get; set; }
    public string? EmbarkPortName { get; set; }
    public DateTime? EmbarkDate { get; set; }
    public string? WatchSchedule { get; set; }
    public string? Remarks { get; set; }
}

public class UpdateVoyageCrewAssignmentDto
{
    public int? RankId { get; set; }
    public string? Role { get; set; }
    public string? EmbarkPortCode { get; set; }
    public string? EmbarkPortName { get; set; }
    public DateTime? EmbarkDate { get; set; }
    public string? DisembarkPortCode { get; set; }
    public string? DisembarkPortName { get; set; }
    public DateTime? DisembarkDate { get; set; }
    public string? WatchSchedule { get; set; }
    public string? Status { get; set; }
    public string? Remarks { get; set; }
}

public class BulkAssignCrewDto
{
    public Guid VoyageId { get; set; }
    public List<Guid> CrewMemberIds { get; set; } = new();
    public string? EmbarkPortCode { get; set; }
    public string? EmbarkPortName { get; set; }
    public DateTime? EmbarkDate { get; set; }
}

// ========== VOYAGE DTOs (Extended) ==========

public class VoyageDetailDto
{
    public Guid Id { get; set; }
    public string VoyageNumber { get; set; } = string.Empty;
    
    // Vessel Info
    public string? VesselIMO { get; set; }
    public string? VesselName { get; set; }
    public string? VesselFlag { get; set; }
    public string? CallSign { get; set; }
    
    // Port Info
    public string? DeparturePort { get; set; }
    public string? DeparturePortCode { get; set; }
    public DateTime? DepartureTime { get; set; }
    public string? ArrivalPort { get; set; }
    public string? ArrivalPortCode { get; set; }
    public DateTime? ArrivalTime { get; set; }
    public string? PreviousPortCode { get; set; }
    public string? PreviousPortName { get; set; }
    
    // Performance
    public string? CargoType { get; set; }
    public string? CharterType { get; set; }
    public double? CargoWeight { get; set; }
    public double? PlannedDistance { get; set; }
    public double? PlannedDurationHours { get; set; }
    public double? PlannedAverageSpeed { get; set; }
    public double? PlannedFuelConsumption { get; set; }
    public string? VoyageInstructions { get; set; }
    public double? DistanceTraveled { get; set; }
    public double? FuelConsumed { get; set; }
    public double? AverageSpeed { get; set; }
    public string VoyageStatus { get; set; } = string.Empty;
    public DateTime? ApprovedAt { get; set; }
    public DateTime? ReadyAt { get; set; }
    public DateTime? CommencedAt { get; set; }
    public DateTime? ArrivedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime? CancelledAt { get; set; }
    
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    
    // Related data
    public List<PortCallDto> PortCalls { get; set; } = new();
    public List<VoyageCrewAssignmentDto> CrewAssignments { get; set; } = new();
    public List<VoyagePlanLegDto> PlanLegs { get; set; } = new();
    public List<VoyageStatusHistoryDto> StatusHistory { get; set; } = new();
    public List<VoyageCargoPlanDto> CargoPlans { get; set; } = new();
    public List<VoyageBunkerPlanDto> BunkerPlans { get; set; } = new();
    public List<VoyageCrewChangePlanDto> CrewChangePlans { get; set; } = new();
    public List<VoyageCostEstimateDto> CostEstimates { get; set; } = new();
    public List<VoyageRevenueEstimateDto> RevenueEstimates { get; set; } = new();
    public double? TotalEstimatedCost { get; set; }
    public double? TotalEstimatedRevenue { get; set; }
    public double? EstimatedProfitMargin { get; set; }
    public int LogEntryCount { get; set; }
    public int CargoOperationCount { get; set; }
}

public class VoyagePlanLegDto
{
    public Guid Id { get; set; }
    public Guid VoyageId { get; set; }
    public int Sequence { get; set; }
    public string LegType { get; set; } = string.Empty;
    public string? FromPortCode { get; set; }
    public string? FromPortName { get; set; }
    public string? ToPortCode { get; set; }
    public string? ToPortName { get; set; }
    public DateTime? PlannedDepartureTime { get; set; }
    public DateTime? PlannedArrivalTime { get; set; }
    public double? PlannedDistance { get; set; }
    public double? PlannedDurationHours { get; set; }
    public double? PlannedAverageSpeed { get; set; }
    public double? PlannedFuelConsumption { get; set; }
    public string? CargoActivity { get; set; }
    public bool CrewChangePlanned { get; set; }
    public bool BunkerSupplyPlanned { get; set; }
    public string? WeatherRoutingNotes { get; set; }
    public string? Notes { get; set; }
}

public class UpsertVoyagePlanLegDto
{
    public int Sequence { get; set; }
    public string LegType { get; set; } = "PASSAGE";
    public string? FromPortCode { get; set; }
    public string? FromPortName { get; set; }
    public string? ToPortCode { get; set; }
    public string? ToPortName { get; set; }
    public DateTime? PlannedDepartureTime { get; set; }
    public DateTime? PlannedArrivalTime { get; set; }
    public double? PlannedDistance { get; set; }
    public double? PlannedDurationHours { get; set; }
    public double? PlannedAverageSpeed { get; set; }
    public double? PlannedFuelConsumption { get; set; }
    public string? CargoActivity { get; set; }
    public bool CrewChangePlanned { get; set; }
    public bool BunkerSupplyPlanned { get; set; }
    public string? WeatherRoutingNotes { get; set; }
    public string? Notes { get; set; }
}

public class VoyageStatusHistoryDto
{
    public Guid Id { get; set; }
    public string? FromStatus { get; set; }
    public string ToStatus { get; set; } = string.Empty;
    public string ChangedBy { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public DateTime ChangedAt { get; set; }
}

public class CreateVoyageDto
{
    public string VoyageNumber { get; set; } = string.Empty;
    public string? DeparturePort { get; set; }
    public string? DeparturePortCode { get; set; }
    public DateTime? DepartureTime { get; set; }
    public string? ArrivalPort { get; set; }
    public string? ArrivalPortCode { get; set; }
    public DateTime? ArrivalTime { get; set; }
    public string? PreviousPortCode { get; set; }
    public string? PreviousPortName { get; set; }
    public string? CargoType { get; set; }
    public string? CharterType { get; set; }
    public double? CargoWeight { get; set; }
    public double? PlannedDistance { get; set; }
    public double? PlannedDurationHours { get; set; }
    public double? PlannedAverageSpeed { get; set; }
    public double? PlannedFuelConsumption { get; set; }
    public string? VoyageInstructions { get; set; }
    public string? VoyageStatus { get; set; }
    public List<UpsertVoyagePlanLegDto>? PlanLegs { get; set; }
    public List<UpsertVoyageCargoPlanDto>? CargoPlans { get; set; }
    public List<UpsertVoyageBunkerPlanDto>? BunkerPlans { get; set; }
    public List<UpsertVoyageCrewChangePlanDto>? CrewChangePlans { get; set; }
    public List<UpsertVoyageCostEstimateDto>? CostEstimates { get; set; }
    public List<UpsertVoyageRevenueEstimateDto>? RevenueEstimates { get; set; }
}

public class UpdateVoyageDto
{
    public string? VoyageNumber { get; set; }
    public string? DeparturePort { get; set; }
    public string? DeparturePortCode { get; set; }
    public DateTime? DepartureTime { get; set; }
    public string? ArrivalPort { get; set; }
    public string? ArrivalPortCode { get; set; }
    public DateTime? ArrivalTime { get; set; }
    public string? PreviousPortCode { get; set; }
    public string? PreviousPortName { get; set; }
    public string? CargoType { get; set; }
    public string? CharterType { get; set; }
    public double? CargoWeight { get; set; }
    public double? PlannedDistance { get; set; }
    public double? PlannedDurationHours { get; set; }
    public double? PlannedAverageSpeed { get; set; }
    public double? PlannedFuelConsumption { get; set; }
    public string? VoyageInstructions { get; set; }
    public double? DistanceTraveled { get; set; }
    public double? FuelConsumed { get; set; }
    public double? AverageSpeed { get; set; }
    public string? VoyageStatus { get; set; }
    public List<UpsertVoyagePlanLegDto>? PlanLegs { get; set; }
    public List<UpsertVoyageCargoPlanDto>? CargoPlans { get; set; }
    public List<UpsertVoyageBunkerPlanDto>? BunkerPlans { get; set; }
    public List<UpsertVoyageCrewChangePlanDto>? CrewChangePlans { get; set; }
    public List<UpsertVoyageCostEstimateDto>? CostEstimates { get; set; }
    public List<UpsertVoyageRevenueEstimateDto>? RevenueEstimates { get; set; }
}

// ========== Phase 2: PLANNING DTOs ==========

public class VoyageCargoPlanDto
{
    public Guid Id { get; set; }
    public Guid VoyageId { get; set; }
    public Guid? PlanLegId { get; set; }
    public int Sequence { get; set; }
    public string OperationType { get; set; } = string.Empty;
    public string CargoType { get; set; } = string.Empty;
    public string? CargoDescription { get; set; }
    public double PlannedQuantity { get; set; }
    public string Unit { get; set; } = "MT";
    public string? PortCode { get; set; }
    public string? PortName { get; set; }
    public string? ShipperName { get; set; }
    public string? ConsigneeName { get; set; }
    public string? SpecialRequirements { get; set; }
    public string? Notes { get; set; }
}

public class UpsertVoyageCargoPlanDto
{
    public Guid? PlanLegId { get; set; }
    public int Sequence { get; set; }
    public string OperationType { get; set; } = "LOADING";
    public string CargoType { get; set; } = string.Empty;
    public string? CargoDescription { get; set; }
    public double PlannedQuantity { get; set; }
    public string Unit { get; set; } = "MT";
    public string? PortCode { get; set; }
    public string? PortName { get; set; }
    public string? ShipperName { get; set; }
    public string? ConsigneeName { get; set; }
    public string? SpecialRequirements { get; set; }
    public string? Notes { get; set; }
}

public class VoyageBunkerPlanDto
{
    public Guid Id { get; set; }
    public Guid VoyageId { get; set; }
    public Guid? PlanLegId { get; set; }
    public int Sequence { get; set; }
    public string FuelType { get; set; } = string.Empty;
    public double PlannedQuantity { get; set; }
    public string OperationType { get; set; } = string.Empty;
    public string? PortCode { get; set; }
    public string? PortName { get; set; }
    public double? EstimatedCostUsd { get; set; }
    public string? SupplierName { get; set; }
    public string? Notes { get; set; }
}

public class UpsertVoyageBunkerPlanDto
{
    public Guid? PlanLegId { get; set; }
    public int Sequence { get; set; }
    public string FuelType { get; set; } = "VLSFO";
    public double PlannedQuantity { get; set; }
    public string OperationType { get; set; } = "SUPPLY";
    public string? PortCode { get; set; }
    public string? PortName { get; set; }
    public double? EstimatedCostUsd { get; set; }
    public string? SupplierName { get; set; }
    public string? Notes { get; set; }
}

public class VoyageCrewChangePlanDto
{
    public Guid Id { get; set; }
    public Guid VoyageId { get; set; }
    public Guid? PlanLegId { get; set; }
    public int Sequence { get; set; }
    public Guid? CrewMemberId { get; set; }
    public string? CrewName { get; set; }
    public int? RankId { get; set; }
    public string? RankName { get; set; }
    public string ChangeType { get; set; } = string.Empty;
    public string? PortCode { get; set; }
    public string? PortName { get; set; }
    public DateTime? PlannedDate { get; set; }
    public string? ReplacementReason { get; set; }
    public string? Notes { get; set; }
}

public class UpsertVoyageCrewChangePlanDto
{
    public Guid? PlanLegId { get; set; }
    public int Sequence { get; set; }
    public Guid? CrewMemberId { get; set; }
    public int? RankId { get; set; }
    public string ChangeType { get; set; } = "ROTATION";
    public string? PortCode { get; set; }
    public string? PortName { get; set; }
    public DateTime? PlannedDate { get; set; }
    public string? ReplacementReason { get; set; }
    public string? Notes { get; set; }
}

public class VoyageCostEstimateDto
{
    public Guid Id { get; set; }
    public Guid VoyageId { get; set; }
    public int Sequence { get; set; }
    public string CostCategory { get; set; } = string.Empty;
    public string? Description { get; set; }
    public double EstimatedAmount { get; set; }
    public string Currency { get; set; } = "USD";
    public string? Notes { get; set; }
}

public class UpsertVoyageCostEstimateDto
{
    public int Sequence { get; set; }
    public string CostCategory { get; set; } = string.Empty;
    public string? Description { get; set; }
    public double EstimatedAmount { get; set; }
    public string Currency { get; set; } = "USD";
    public string? Notes { get; set; }
}

public class VoyageRevenueEstimateDto
{
    public Guid Id { get; set; }
    public Guid VoyageId { get; set; }
    public int Sequence { get; set; }
    public string RevenueCategory { get; set; } = string.Empty;
    public string? Description { get; set; }
    public double EstimatedAmount { get; set; }
    public string Currency { get; set; } = "USD";
    public string? Notes { get; set; }
}

public class UpsertVoyageRevenueEstimateDto
{
    public int Sequence { get; set; }
    public string RevenueCategory { get; set; } = string.Empty;
    public string? Description { get; set; }
    public double EstimatedAmount { get; set; }
    public string Currency { get; set; } = "USD";
    public string? Notes { get; set; }
}

/// <summary>
/// FAL Form 5 - Crew List export format
/// </summary>
public class FalForm5Dto
{
    public string VoyageNumber { get; set; } = string.Empty;
    public string? VesselName { get; set; }
    public string? VesselIMO { get; set; }
    public string? VesselFlag { get; set; }
    public string? CallSign { get; set; }
    public string? PortOfArrival { get; set; }
    public string? PortOfArrivalCode { get; set; }
    public DateTime? DateOfArrival { get; set; }
    public string? ArrivedFrom { get; set; }
    public List<FalCrewEntry> CrewList { get; set; } = new();
}

public class FalCrewEntry
{
    public int No { get; set; }
    public string? FullName { get; set; }
    public string? Rank { get; set; }
    public string? Nationality { get; set; }
    public DateTime? DateOfBirth { get; set; }
    public string? PlaceOfBirth { get; set; }
    public string? TravelDocumentType { get; set; }
    public string? TravelDocumentNumber { get; set; }
}

// ========== CARGO OPERATION DTOs ==========

public class CargoOperationDto
{
    public Guid Id { get; set; }
    public string OperationId { get; set; } = string.Empty;
    public Guid? VoyageId { get; set; }
    public string OperationType { get; set; } = string.Empty;
    public string CargoType { get; set; } = string.Empty;
    public string? CargoDescription { get; set; }
    public double Quantity { get; set; }
    public string Unit { get; set; } = "MT";
    public string? LoadingPort { get; set; }
    public string? DischargePort { get; set; }
    public DateTime? LoadedAt { get; set; }
    public DateTime? DischargedAt { get; set; }
    public string? Shipper { get; set; }
    public string? Consignee { get; set; }
    public string? BillOfLading { get; set; }
    public string? SealNumbers { get; set; }
    public string? SpecialRequirements { get; set; }
    public string Status { get; set; } = "PLANNED";
    public DateTime CreatedAt { get; set; }
}

public class CreateCargoOperationDto
{
    public Guid? VoyageId { get; set; }
    public string OperationType { get; set; } = "LOADING";
    public string CargoType { get; set; } = "GENERAL";
    public string? CargoDescription { get; set; }
    public double Quantity { get; set; }
    public string Unit { get; set; } = "MT";
    public string? LoadingPort { get; set; }
    public string? DischargePort { get; set; }
    public DateTime? LoadedAt { get; set; }
    public DateTime? DischargedAt { get; set; }
    public string? Shipper { get; set; }
    public string? Consignee { get; set; }
    public string? BillOfLading { get; set; }
    public string? SealNumbers { get; set; }
    public string? SpecialRequirements { get; set; }
}

public class UpdateCargoOperationDto
{
    public string? OperationType { get; set; }
    public string? CargoType { get; set; }
    public string? CargoDescription { get; set; }
    public double? Quantity { get; set; }
    public string? Unit { get; set; }
    public string? LoadingPort { get; set; }
    public string? DischargePort { get; set; }
    public DateTime? LoadedAt { get; set; }
    public DateTime? DischargedAt { get; set; }
    public string? Shipper { get; set; }
    public string? Consignee { get; set; }
    public string? BillOfLading { get; set; }
    public string? SealNumbers { get; set; }
    public string? SpecialRequirements { get; set; }
    public string? Status { get; set; }
}
