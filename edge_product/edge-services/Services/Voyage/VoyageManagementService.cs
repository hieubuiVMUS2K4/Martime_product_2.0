using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.DTOs;
using MaritimeEdge.DTOs.Common;
using MaritimeEdge.Constants;
using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Documents;
using MaritimeEdge.Services.Common;

namespace MaritimeEdge.Services.Voyage;

public interface IVoyageManagementService
{
    // Voyage CRUD
    Task<VoyageDetailDto?> GetVoyageDetailAsync(Guid voyageId);
    Task<VoyageRecord> CreateVoyageAsync(CreateVoyageDto dto);
    Task<VoyageRecord?> UpdateVoyageAsync(Guid voyageId, UpdateVoyageDto dto);
    Task<bool> DeleteVoyageAsync(Guid voyageId);
    
    // Port Calls
    Task<List<PortCallDto>> GetPortCallsAsync(Guid voyageId);
    Task<PaginatedResponse<PortCallDto>> GetPortCallsAsync(Guid voyageId, PaginationParams pagination);
    Task<PortCallDto> CreatePortCallAsync(CreatePortCallDto dto);
    Task<PortCallDto?> UpdatePortCallAsync(Guid portCallId, UpdatePortCallDto dto);
    Task<bool> DeletePortCallAsync(Guid portCallId);
    
    // Crew Assignments
    Task<List<VoyageCrewAssignmentDto>> GetCrewAssignmentsAsync(Guid voyageId);
    Task<VoyageCrewAssignmentDto> AssignCrewAsync(CreateVoyageCrewAssignmentDto dto);
    Task<List<VoyageCrewAssignment>> BulkAssignCrewAsync(BulkAssignCrewDto dto);
    Task<VoyageCrewAssignmentDto?> UpdateCrewAssignmentAsync(Guid assignmentId, UpdateVoyageCrewAssignmentDto dto);
    Task<bool> RemoveCrewAssignmentAsync(Guid assignmentId);
    Task<List<VoyageCrewAssignmentDto>> GetCrewVoyageHistoryAsync(Guid crewMemberId);
    Task<PaginatedResponse<VoyageCrewAssignmentDto>> GetCrewVoyageHistoryAsync(Guid crewMemberId, PaginationParams pagination);
    
    // FAL Form 5
    Task<FalForm5Dto?> GenerateFalForm5Async(Guid voyageId);
}

public class VoyageManagementService : IVoyageManagementService
{
    private readonly EdgeDbContext _context;
    private readonly ILogger<VoyageManagementService> _logger;

    public VoyageManagementService(
        EdgeDbContext context,
        ILogger<VoyageManagementService> logger)
    {
        _context = context;
        _logger = logger;
    }

    // ========== VOYAGE CRUD ==========

    public async Task<VoyageDetailDto?> GetVoyageDetailAsync(Guid voyageId)
    {
        var voyage = await _context.VoyageRecords
            .AsNoTracking()
            .AsSplitQuery() // Avoid cartesian explosion from multiple Includes
            .Include(v => v.PortCalls.OrderBy(p => p.Sequence))
            .Include(v => v.PlanLegs.OrderBy(p => p.Sequence))
            .Include(v => v.StatusHistory.OrderByDescending(h => h.ChangedAt))
            .Include(v => v.CargoPlans.OrderBy(cp => cp.Sequence))
            .Include(v => v.BunkerPlans.OrderBy(bp => bp.Sequence))
            .Include(v => v.CrewChangePlans.OrderBy(ccp => ccp.Sequence))
                .ThenInclude(ccp => ccp.CrewMember)
            .Include(v => v.CrewChangePlans)
                .ThenInclude(ccp => ccp.Rank)
            .Include(v => v.CostEstimates.OrderBy(ce => ce.Sequence))
            .Include(v => v.RevenueEstimates.OrderBy(re => re.Sequence))
            .Include(v => v.CrewAssignments)
                .ThenInclude(a => a.CrewMember)
            .Include(v => v.CrewAssignments)
                .ThenInclude(a => a.Rank)
            .FirstOrDefaultAsync(v => v.Id == voyageId);

        if (voyage == null) return null;

        // Single query fetching both counts
        var counts = await _context.VoyageRecords
            .Where(v => v.Id == voyageId)
            .Select(v => new {
                LogCount = _context.VoyageLogEntries.Count(l => l.VoyageId == voyageId),
                CargoCount = _context.CargoOperations.Count(c => c.VoyageId == voyageId)
            })
            .FirstOrDefaultAsync();

        return MapToDetailDto(voyage, counts?.LogCount ?? 0, counts?.CargoCount ?? 0);
    }

    public async Task<VoyageRecord> CreateVoyageAsync(CreateVoyageDto dto)
    {
        // Vessel identity comes from the ShipData DB table (single source of truth), NOT from
        // appsettings.json "Vessel" section — see Vessel Provisioning v3 plan.
        var ship = await _context.ShipData.AsNoTracking().FirstOrDefaultAsync();
        var initialStatus = NormalizeVoyageStatus(dto.VoyageStatus ?? VoyageStatus.PLANNING);
        var charterType = NormalizeCharterType(dto.CharterType);

        var voyage = new VoyageRecord
        {
            VoyageNumber = dto.VoyageNumber,
            VesselIMO = ship?.ImoNumber,
            VesselName = ship?.ShipName,
            VesselFlag = ship?.Flag,
            CallSign = ship?.CallSign,
            DeparturePort = dto.DeparturePort,
            DeparturePortCode = dto.DeparturePortCode,
            DepartureTime = dto.DepartureTime,
            ArrivalPort = dto.ArrivalPort,
            ArrivalPortCode = dto.ArrivalPortCode,
            ArrivalTime = dto.ArrivalTime,
            PreviousPortCode = dto.PreviousPortCode,
            PreviousPortName = dto.PreviousPortName,
            CargoType = dto.CargoType,
            CharterType = charterType,
            CargoWeight = dto.CargoWeight,
            PlannedDistance = dto.PlannedDistance,
            PlannedDurationHours = dto.PlannedDurationHours,
            PlannedAverageSpeed = dto.PlannedAverageSpeed,
            PlannedFuelConsumption = dto.PlannedFuelConsumption,
            VoyageInstructions = dto.VoyageInstructions,
            VoyageStatus = initialStatus
        };

        // Auto-fill vessel info from DB (ShipData)
        voyage.VesselIMO = ship?.ImoNumber;
        voyage.VesselName = ship?.ShipName;
        voyage.CallSign = ship?.CallSign;

        ApplyLifecycleMilestones(voyage, initialStatus);
        ApplyPlanLegs(voyage, dto.PlanLegs);
        ApplyCargoPlans(voyage, dto.CargoPlans);
        ApplyBunkerPlans(voyage, dto.BunkerPlans);
        ApplyCrewChangePlans(voyage, dto.CrewChangePlans);
        ApplyCostEstimates(voyage, dto.CostEstimates);
        ApplyRevenueEstimates(voyage, dto.RevenueEstimates);
        RecalculateFinancialSummary(voyage);

        _context.VoyageRecords.Add(voyage);
        AddStatusHistory(voyage, null, initialStatus, "Voyage created");
        await _context.SaveChangesAsync();
        
        _logger.LogInformation("Created voyage {VoyageNumber} (ID: {VoyageId})", voyage.VoyageNumber, voyage.Id);
        return voyage;
    }

    public async Task<VoyageRecord?> UpdateVoyageAsync(Guid voyageId, UpdateVoyageDto dto)
    {
        var voyage = await _context.VoyageRecords.FindAsync(voyageId);
        if (voyage == null) return null;

        var currentStatus = voyage.VoyageStatus;
        string? nextStatus = null;

        // ── Status transition validation ──
        if (dto.VoyageStatus != null && dto.VoyageStatus != currentStatus)
        {
            nextStatus = NormalizeVoyageStatus(dto.VoyageStatus);

            if (!VoyageStatus.IsValidTransition(currentStatus, nextStatus))
                throw new InvalidOperationException(
                    $"Invalid status transition: {currentStatus} → {nextStatus}. " +
                    $"Allowed transitions from {currentStatus}: {string.Join(", ", VoyageStatus.ValidTransitions.GetValueOrDefault(currentStatus, Array.Empty<string>()))}");
        }

        // ── Field-level access control based on current status ──
        // Handle read-only statuses (COMPLETED/CANCELLED) - only status transitions allowed
        if (VoyageStatus.ReadOnlyStatuses.Contains(currentStatus))
        {
            if (nextStatus != null && nextStatus != currentStatus)
            {
                voyage.VoyageStatus = nextStatus;
                ApplyLifecycleMilestones(voyage, nextStatus);
                AddStatusHistory(voyage, currentStatus, nextStatus, "Status changed via voyage update");
                voyage.UpdatedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();
                _logger.LogInformation("Voyage {VoyageId} status changed from {From} to {To}", voyageId, currentStatus, nextStatus);
                return voyage;
            }
            throw new InvalidOperationException(
                $"Voyage is {currentStatus} and cannot be modified. Only status transitions are allowed.");
        }

        // Handle limited edit status (UNDERWAY) - block changes to core identity fields
        if (VoyageStatus.LimitedEditStatuses.Contains(currentStatus))
        {
            // UNDERWAY: block changes to core identity fields
            if (dto.VoyageNumber != null && dto.VoyageNumber != voyage.VoyageNumber)
                throw new InvalidOperationException("Cannot change voyage number while UNDERWAY.");
            if (dto.DeparturePort != null && dto.DeparturePort != voyage.DeparturePort)
                throw new InvalidOperationException("Cannot change departure port while UNDERWAY.");
            if (dto.DeparturePortCode != null && dto.DeparturePortCode != voyage.DeparturePortCode)
                throw new InvalidOperationException("Cannot change departure port code while UNDERWAY.");
            if (dto.DepartureTime.HasValue && dto.DepartureTime != voyage.DepartureTime)
                throw new InvalidOperationException("Cannot change departure time while UNDERWAY.");
            if (dto.PlanLegs != null)
                throw new InvalidOperationException($"Cannot modify planning legs while voyage is {currentStatus}.");
        }

        // ── Apply allowed updates ──
        if (dto.VoyageNumber != null) voyage.VoyageNumber = dto.VoyageNumber;
        if (dto.DeparturePort != null) voyage.DeparturePort = dto.DeparturePort;
        if (dto.DeparturePortCode != null) voyage.DeparturePortCode = dto.DeparturePortCode;
        if (dto.DepartureTime.HasValue) voyage.DepartureTime = dto.DepartureTime;
        if (dto.ArrivalPort != null) voyage.ArrivalPort = dto.ArrivalPort;
        if (dto.ArrivalPortCode != null) voyage.ArrivalPortCode = dto.ArrivalPortCode;
        if (dto.ArrivalTime.HasValue) voyage.ArrivalTime = dto.ArrivalTime;
        if (dto.PreviousPortCode != null) voyage.PreviousPortCode = dto.PreviousPortCode;
        if (dto.PreviousPortName != null) voyage.PreviousPortName = dto.PreviousPortName;
        if (dto.CargoType != null) voyage.CargoType = dto.CargoType;
        if (dto.CharterType != null) voyage.CharterType = NormalizeCharterType(dto.CharterType);
        if (dto.CargoWeight.HasValue) voyage.CargoWeight = dto.CargoWeight;
        if (dto.PlannedDistance.HasValue) voyage.PlannedDistance = dto.PlannedDistance;
        if (dto.PlannedDurationHours.HasValue) voyage.PlannedDurationHours = dto.PlannedDurationHours;
        if (dto.PlannedAverageSpeed.HasValue) voyage.PlannedAverageSpeed = dto.PlannedAverageSpeed;
        if (dto.PlannedFuelConsumption.HasValue) voyage.PlannedFuelConsumption = dto.PlannedFuelConsumption;
        if (dto.VoyageInstructions != null) voyage.VoyageInstructions = dto.VoyageInstructions;
        if (dto.DistanceTraveled.HasValue) voyage.DistanceTraveled = dto.DistanceTraveled;
        if (dto.FuelConsumed.HasValue) voyage.FuelConsumed = dto.FuelConsumed;
        if (dto.AverageSpeed.HasValue) voyage.AverageSpeed = dto.AverageSpeed;
        if (dto.PlanLegs != null)
        {
            ValidateVoyageAllowsEntityModification(voyage, "planning legs");
            await ReplacePlanLegsAsync(voyage, dto.PlanLegs);
        }
        if (dto.CargoPlans != null)
        {
            ValidateVoyageAllowsEntityModification(voyage, "cargo plans");
            await ReplaceCargoPlansAsync(voyage, dto.CargoPlans);
        }
        if (dto.BunkerPlans != null)
        {
            ValidateVoyageAllowsEntityModification(voyage, "bunker plans");
            await ReplaceBunkerPlansAsync(voyage, dto.BunkerPlans);
        }
        if (dto.CrewChangePlans != null)
        {
            ValidateVoyageAllowsEntityModification(voyage, "crew change plans");
            await ReplaceCrewChangePlansAsync(voyage, dto.CrewChangePlans);
        }
        if (dto.CostEstimates != null)
        {
            ValidateVoyageAllowsEntityModification(voyage, "cost estimates");
            await ReplaceCostEstimatesAsync(voyage, dto.CostEstimates);
        }
        if (dto.RevenueEstimates != null)
        {
            ValidateVoyageAllowsEntityModification(voyage, "revenue estimates");
            await ReplaceRevenueEstimatesAsync(voyage, dto.RevenueEstimates);
        }
        RecalculateFinancialSummary(voyage);
        if (nextStatus != null)
        {
            voyage.VoyageStatus = nextStatus;
            ApplyLifecycleMilestones(voyage, nextStatus);
            AddStatusHistory(voyage, currentStatus, nextStatus, "Status changed via voyage update");
        }
        
        voyage.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return voyage;
    }

    public async Task<bool> DeleteVoyageAsync(Guid voyageId)
    {
        var voyage = await _context.VoyageRecords.FindAsync(voyageId);
        if (voyage == null) return false;

        // Only allow deleting PLANNING or CANCELLED voyages
        if (VoyageStatus.IsCurrentVoyageStatus(voyage.VoyageStatus))
            throw new InvalidOperationException("Cannot delete a voyage that is UNDERWAY. Change status to CANCELLED first.");
        if (voyage.VoyageStatus == VoyageStatus.COMPLETED)
            throw new InvalidOperationException("Cannot delete a COMPLETED voyage. Historical records must be preserved.");

        _context.VoyageRecords.Remove(voyage);
        await _context.SaveChangesAsync();
        _logger.LogInformation("Deleted voyage {VoyageId} (status was {Status})", voyageId, voyage.VoyageStatus);
        return true;
    }

    // ========== PORT CALLS ==========

    public async Task<List<PortCallDto>> GetPortCallsAsync(Guid voyageId)
    {
        var portCalls = await _context.PortCalls
            .AsNoTracking()
            .Where(p => p.VoyageId == voyageId)
            .OrderBy(p => p.Sequence)
            .Select(p => new PortCallDto
            {
                Id = p.Id,
                VoyageId = p.VoyageId,
                PortId = p.PortId,
                PortCode = p.PortCode,
                PortName = p.PortName,
                Country = p.Country,
                CallType = p.CallType,
                Sequence = p.Sequence,
                ArrivalTime = p.ArrivalTime,
                DepartureTime = p.DepartureTime,
                BerthNumber = p.BerthNumber,
                PilotOnBoard = p.PilotOnBoard,
                PilotOffBoard = p.PilotOffBoard,
                DraftFore = p.DraftFore,
                DraftAft = p.DraftAft,
                CargoOpsCompleted = p.CargoOpsCompleted,
                Remarks = p.Remarks,
                CreatedAt = p.CreatedAt
            })
            .ToListAsync();

        return portCalls;
    }

    /// <summary>
    /// Gets port calls for a voyage with pagination.
    /// Supports large voyages by limiting results per page (default 50, max 1000).
    /// </summary>
    public async Task<PaginatedResponse<PortCallDto>> GetPortCallsAsync(Guid voyageId, PaginationParams pagination)
    {
        var query = _context.PortCalls
            .AsNoTracking()
            .Where(p => p.VoyageId == voyageId)
            .OrderBy(p => p.Sequence)
            .Select(p => new PortCallDto
            {
                Id = p.Id,
                VoyageId = p.VoyageId,
                PortId = p.PortId,
                PortCode = p.PortCode,
                PortName = p.PortName,
                Country = p.Country,
                CallType = p.CallType,
                Sequence = p.Sequence,
                ArrivalTime = p.ArrivalTime,
                DepartureTime = p.DepartureTime,
                BerthNumber = p.BerthNumber,
                PilotOnBoard = p.PilotOnBoard,
                PilotOffBoard = p.PilotOffBoard,
                DraftFore = p.DraftFore,
                DraftAft = p.DraftAft,
                CargoOpsCompleted = p.CargoOpsCompleted,
                Remarks = p.Remarks,
                CreatedAt = p.CreatedAt
            });

        var (total, data) = await query.GetPagedResultsAsync(pagination);
        return PaginatedResponse<PortCallDto>.Create(data, total, pagination);
    }

    public async Task<PortCallDto> CreatePortCallAsync(CreatePortCallDto dto)
    {
        var voyage = await _context.VoyageRecords.FindAsync(dto.VoyageId);
        if (voyage == null) throw new InvalidOperationException("Voyage not found.");
        ValidateVoyageAllowsPortCallModification(voyage, "add");

        // Auto-calculate sequence if not provided
        var sequence = dto.Sequence ?? (await _context.PortCalls
            .Where(p => p.VoyageId == dto.VoyageId)
            .MaxAsync(p => (int?)p.Sequence) ?? 0) + 1;

        // Auto-fill port info from master data if PortId provided
        string portName = dto.PortName;
        string? portCode = dto.PortCode;
        string? country = dto.Country;
        
        if (dto.PortId.HasValue)
        {
            var port = await _context.Ports.FindAsync(dto.PortId.Value);
            if (port != null)
            {
                portName = port.PortName;
                portCode = port.PortCode;
                country = port.Country;
            }
        }

        var portCall = new PortCall
        {
            VoyageId = dto.VoyageId,
            PortId = dto.PortId,
            PortCode = portCode,
            PortName = portName,
            Country = country,
            CallType = dto.CallType,
            Sequence = sequence,
            ArrivalTime = dto.ArrivalTime,
            DepartureTime = dto.DepartureTime,
            BerthNumber = dto.BerthNumber,
            PilotOnBoard = dto.PilotOnBoard,
            PilotOffBoard = dto.PilotOffBoard,
            DraftFore = dto.DraftFore,
            DraftAft = dto.DraftAft,
            CargoOpsCompleted = dto.CargoOpsCompleted,
            Remarks = dto.Remarks
        };

        _context.PortCalls.Add(portCall);
        await _context.SaveChangesAsync();
        return MapToPortCallDto(portCall);
    }

    public async Task<PortCallDto?> UpdatePortCallAsync(Guid portCallId, UpdatePortCallDto dto)
    {
        var portCall = await _context.PortCalls.FindAsync(portCallId);
        if (portCall == null) return null;

        var voyage = await _context.VoyageRecords.FindAsync(portCall.VoyageId);
        if (voyage != null)
            ValidateVoyageAllowsPortCallModification(voyage, "modify");

        if (dto.PortId.HasValue)
        {
            portCall.PortId = dto.PortId;

            var selectedPort = await _context.Ports.FindAsync(dto.PortId.Value);
            if (selectedPort != null)
            {
                portCall.PortCode = selectedPort.PortCode;
                portCall.PortName = selectedPort.PortName;
                portCall.Country = selectedPort.Country;
            }
        }
        else
        {
            if (dto.PortCode != null) portCall.PortCode = dto.PortCode;
            if (dto.PortName != null) portCall.PortName = dto.PortName;
            if (dto.Country != null) portCall.Country = dto.Country;
        }
        if (dto.CallType != null) portCall.CallType = dto.CallType;
        if (dto.Sequence.HasValue) portCall.Sequence = dto.Sequence.Value;
        if (dto.ArrivalTime.HasValue) portCall.ArrivalTime = dto.ArrivalTime;
        if (dto.DepartureTime.HasValue) portCall.DepartureTime = dto.DepartureTime;
        if (dto.BerthNumber != null) portCall.BerthNumber = dto.BerthNumber;
        if (dto.PilotOnBoard.HasValue) portCall.PilotOnBoard = dto.PilotOnBoard;
        if (dto.PilotOffBoard.HasValue) portCall.PilotOffBoard = dto.PilotOffBoard;
        if (dto.DraftFore.HasValue) portCall.DraftFore = dto.DraftFore;
        if (dto.DraftAft.HasValue) portCall.DraftAft = dto.DraftAft;
        if (dto.CargoOpsCompleted.HasValue) portCall.CargoOpsCompleted = dto.CargoOpsCompleted.Value;
        if (dto.Remarks != null) portCall.Remarks = dto.Remarks;

        portCall.UpdatedAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();
        return MapToPortCallDto(portCall);
    }

    public async Task<bool> DeletePortCallAsync(Guid portCallId)
    {
        var portCall = await _context.PortCalls.FindAsync(portCallId);
        if (portCall == null) return false;

        var voyage = await _context.VoyageRecords.FindAsync(portCall.VoyageId);
        if (voyage != null)
            ValidateVoyageAllowsPortCallModification(voyage, "delete");

        _context.PortCalls.Remove(portCall);
        await _context.SaveChangesAsync();
        return true;
    }

    // ========== CREW ASSIGNMENTS ==========

    public async Task<List<VoyageCrewAssignmentDto>> GetCrewAssignmentsAsync(Guid voyageId)
    {
        var assignments = await _context.VoyageCrewAssignments
            .AsNoTracking()
            .Where(a => a.VoyageId == voyageId)
            .Include(a => a.CrewMember)
            .Include(a => a.Rank)
            .Include(a => a.Voyage)
            .ToListAsync();
        
        return assignments.Select(MapToAssignmentDto).ToList();
    }

    public async Task<VoyageCrewAssignmentDto> AssignCrewAsync(CreateVoyageCrewAssignmentDto dto)
    {
        var voyage = await _context.VoyageRecords.FindAsync(dto.VoyageId);
        if (voyage == null) throw new InvalidOperationException("Voyage not found.");
        ValidateVoyageAllowsCrewModification(voyage, "assign");

        // Check if already assigned
        var existing = await _context.VoyageCrewAssignments
            .FirstOrDefaultAsync(a => a.VoyageId == dto.VoyageId && a.CrewMemberId == dto.CrewMemberId);
        
        if (existing != null)
            throw new InvalidOperationException($"Crew member is already assigned to this voyage");

        // Auto-fill rank from crew member if not provided
        var rankId = dto.RankId;
        if (!rankId.HasValue)
        {
            var crew = await _context.CrewMembers.FindAsync(dto.CrewMemberId);
            rankId = crew?.RankId;
        }

        var assignment = new VoyageCrewAssignment
        {
            VoyageId = dto.VoyageId,
            CrewMemberId = dto.CrewMemberId,
            RankId = rankId,
            Role = dto.Role,
            EmbarkPortCode = dto.EmbarkPortCode,
            EmbarkPortName = dto.EmbarkPortName,
            EmbarkDate = dto.EmbarkDate,
            WatchSchedule = dto.WatchSchedule,
            Remarks = dto.Remarks,
            Status = "ASSIGNED"
        };

        _context.VoyageCrewAssignments.Add(assignment);
        await _context.SaveChangesAsync();

        // Mở mục sổ thuyền viên ngay khi vừa gán — không đợi tới lúc lên tàu.
        await SyncSeamanBookEntryAsync(assignment, voyage);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Assigned crew {CrewId} to voyage {VoyageId}", dto.CrewMemberId, dto.VoyageId);

        // Reload with navigation properties for DTO mapping
        var loaded = await _context.VoyageCrewAssignments
            .Include(a => a.CrewMember)
            .Include(a => a.Rank)
            .Include(a => a.Voyage)
            .FirstAsync(a => a.Id == assignment.Id);
        return MapToAssignmentDto(loaded);
    }

    public async Task<List<VoyageCrewAssignment>> BulkAssignCrewAsync(BulkAssignCrewDto dto)
    {
        var voyage = await _context.VoyageRecords.FindAsync(dto.VoyageId);
        if (voyage == null) throw new InvalidOperationException("Voyage not found.");
        ValidateVoyageAllowsCrewModification(voyage, "assign");

        var assignments = new List<VoyageCrewAssignment>();
        
        foreach (var crewId in dto.CrewMemberIds)
        {
            var existing = await _context.VoyageCrewAssignments
                .AnyAsync(a => a.VoyageId == dto.VoyageId && a.CrewMemberId == crewId);
            
            if (existing) continue;

            var crew = await _context.CrewMembers.FindAsync(crewId);
            if (crew == null) continue;

            var assignment = new VoyageCrewAssignment
            {
                VoyageId = dto.VoyageId,
                CrewMemberId = crewId,
                RankId = crew.RankId,
                Role = "REGULAR",
                EmbarkPortCode = dto.EmbarkPortCode,
                EmbarkPortName = dto.EmbarkPortName,
                EmbarkDate = dto.EmbarkDate,
                Status = "ASSIGNED"
            };

            _context.VoyageCrewAssignments.Add(assignment);
            assignments.Add(assignment);
        }

        await _context.SaveChangesAsync();

        // Mở mục sổ thuyền viên cho từng người vừa gán
        foreach (var assignment in assignments)
            await SyncSeamanBookEntryAsync(assignment, voyage);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Bulk assigned {Count} crew to voyage {VoyageId}", assignments.Count, dto.VoyageId);
        return assignments;
    }

    public async Task<VoyageCrewAssignmentDto?> UpdateCrewAssignmentAsync(Guid assignmentId, UpdateVoyageCrewAssignmentDto dto)
    {
        var assignment = await _context.VoyageCrewAssignments.FindAsync(assignmentId);
        if (assignment == null) return null;

        var voyage = await _context.VoyageRecords.FindAsync(assignment.VoyageId);
        if (voyage != null)
        {
            ValidateVoyageAllowsCrewModification(voyage, "modify");
            
            // UNDERWAY: only allow status changes and disembark info, not reassigning to different roles/ranks
            if (VoyageStatus.LimitedEditStatuses.Contains(voyage.VoyageStatus))
            {
                if (dto.RankId.HasValue && dto.RankId != assignment.RankId)
                    throw new InvalidOperationException("Cannot change crew rank while voyage is UNDERWAY.");
                if (dto.Role != null && dto.Role != assignment.Role)
                    throw new InvalidOperationException("Cannot change crew role while voyage is UNDERWAY.");
                if (dto.EmbarkPortCode != null && dto.EmbarkPortCode != assignment.EmbarkPortCode)
                    throw new InvalidOperationException("Cannot change embark port while voyage is UNDERWAY.");
                if (dto.EmbarkDate.HasValue && dto.EmbarkDate != assignment.EmbarkDate)
                    throw new InvalidOperationException("Cannot change embark date while voyage is UNDERWAY.");
            }
        }

        var previousStatus = assignment.Status;
        var normalizedStatus = dto.Status?.Trim().ToUpperInvariant();

        if (dto.RankId.HasValue) assignment.RankId = dto.RankId;
        if (dto.Role != null) assignment.Role = dto.Role;
        if (dto.EmbarkPortCode != null) assignment.EmbarkPortCode = dto.EmbarkPortCode;
        if (dto.EmbarkPortName != null) assignment.EmbarkPortName = dto.EmbarkPortName;
        if (dto.EmbarkDate.HasValue) assignment.EmbarkDate = dto.EmbarkDate;
        if (dto.DisembarkPortCode != null) assignment.DisembarkPortCode = dto.DisembarkPortCode;
        if (dto.DisembarkPortName != null) assignment.DisembarkPortName = dto.DisembarkPortName;
        if (dto.DisembarkDate.HasValue) assignment.DisembarkDate = dto.DisembarkDate;
        if (dto.WatchSchedule != null) assignment.WatchSchedule = dto.WatchSchedule;
        if (normalizedStatus == "ONBOARD" && !assignment.EmbarkDate.HasValue)
            assignment.EmbarkDate = DateTime.UtcNow;
        if ((normalizedStatus == "DISEMBARKED" || normalizedStatus == "CANCELLED") && !assignment.DisembarkDate.HasValue && previousStatus == "ONBOARD")
            assignment.DisembarkDate = DateTime.UtcNow;
        if (normalizedStatus != null) assignment.Status = normalizedStatus;
        if (dto.Remarks != null) assignment.Remarks = dto.Remarks;

        assignment.UpdatedAt = DateTime.UtcNow;

        // Auto-sync CrewMember.IsOnboard based on assignment status change
        var shouldSyncCrewState = normalizedStatus != null && normalizedStatus != previousStatus;
        var shouldSyncServiceRecord = shouldSyncCrewState
            || dto.EmbarkDate.HasValue
            || dto.DisembarkDate.HasValue
            || dto.EmbarkPortCode != null
            || dto.EmbarkPortName != null
            || dto.DisembarkPortCode != null
            || dto.DisembarkPortName != null
            || dto.RankId.HasValue;

        if (shouldSyncCrewState)
        {
            await SyncCrewOnboardStatusAsync(
                assignment.CrewMemberId,
                assignment.Status,
                assignment.EmbarkDate,
                assignment.DisembarkDate,
                assignment.Id);
        }

        // Sổ thuyền viên là nơi lưu kỳ phục vụ (thay cho service_records — xoá hẳn ở GĐ 7)
        if (shouldSyncServiceRecord)
            await SyncSeamanBookEntryAsync(assignment, voyage);

        await _context.SaveChangesAsync();
        
        // Reload with navigation properties for DTO mapping
        var loaded = await _context.VoyageCrewAssignments
            .Include(a => a.CrewMember)
            .Include(a => a.Rank)
            .Include(a => a.Voyage)
            .FirstAsync(a => a.Id == assignmentId);
        return MapToAssignmentDto(loaded);
    }

    /// <summary>
    /// Automatically syncs CrewMember.IsOnboard, EmbarkDate, DisembarkDate
    /// based on VoyageCrewAssignment status transitions.
    /// - ONBOARD → CrewMember.IsOnboard = true, EmbarkDate updated
    /// - DISEMBARKED/CANCELLED → Check if crew has any other ONBOARD assignments;
    ///   if not, set IsOnboard = false and update DisembarkDate
    /// </summary>
    private async Task SyncCrewOnboardStatusAsync(Guid crewMemberId, string newStatus, DateTime? embarkDate, DateTime? disembarkDate, Guid? currentAssignmentId = null)
    {
        var crewMember = await _context.CrewMembers.FindAsync(crewMemberId);
        if (crewMember == null) return;

        switch (newStatus.ToUpperInvariant())
        {
            case "ONBOARD":
                crewMember.IsOnboard = true;
                if (embarkDate.HasValue)
                    crewMember.EmbarkDate = embarkDate;
                crewMember.DisembarkDate = null;
                crewMember.UpdatedAt = DateTime.UtcNow;
                crewMember.IsSynced = false;
                _logger.LogInformation("Auto-sync: CrewMember {CrewId} marked as ONBOARD", crewMember.CrewId);
                break;

            case "DISEMBARKED":
            case "CANCELLED":
                // Check if crew has any OTHER active (ONBOARD) assignment on any voyage
                var hasOtherActiveAssignment = await _context.VoyageCrewAssignments
                    .AnyAsync(a => a.CrewMemberId == crewMemberId
                                && a.Id != currentAssignmentId
                                && a.Status == "ONBOARD");

                if (!hasOtherActiveAssignment)
                {
                    crewMember.IsOnboard = false;
                    if (disembarkDate.HasValue)
                        crewMember.DisembarkDate = disembarkDate;
                    else
                        crewMember.DisembarkDate = DateTime.UtcNow;
                    crewMember.UpdatedAt = DateTime.UtcNow;
                    crewMember.IsSynced = false;
                    _logger.LogInformation("Auto-sync: CrewMember {CrewId} marked as OFF-BOARD (no other active assignments)", crewMember.CrewId);
                }
                else
                {
                    _logger.LogInformation("Auto-sync: CrewMember {CrewId} still has other ONBOARD assignments, keeping IsOnboard=true", crewMember.CrewId);
                }
                break;
        }
    }

    private async Task SyncServiceRecordAsync(VoyageCrewAssignment assignment, VoyageRecord? voyage)
    {
        if (voyage == null) return;

        var assignmentStatus = assignment.Status?.Trim().ToUpperInvariant();
        if (assignmentStatus is not ("ONBOARD" or "DISEMBARKED" or "CANCELLED")) return;

        var marker = BuildServiceRecordMarker(assignment.Id, assignment.VoyageId);
        var serviceRecord = await _context.ServiceRecords
            .FirstOrDefaultAsync(r => r.CrewMemberId == assignment.CrewMemberId && r.BoardingRecords == marker);

        if (serviceRecord == null)
        {
            if (assignmentStatus == "CANCELLED") return;
            if (assignmentStatus == "DISEMBARKED" && !assignment.EmbarkDate.HasValue) return;

            var shipData = await GetLatestShipDataAsync();
            serviceRecord = new ServiceRecord
            {
                CrewMemberId = assignment.CrewMemberId,
                VesselName = voyage.VesselName ?? shipData?.ShipName ?? "Unknown Vessel",
                VesselFlag = voyage.VesselFlag ?? shipData?.Flag,
                VesselType = shipData?.TypeOfVessel,
                VesselGrt = shipData?.GrossTonnageInternational is double gt ? Convert.ToDecimal(gt) : null,
                VesselYearBuilt = shipData?.YearBuilt,
                TradeArea = BuildTradeArea(voyage),
                RankAtTime = await ResolveRankNameAsync(assignment),
                BoardingDate = assignment.EmbarkDate ?? DateTime.UtcNow,
                BoardingPortCode = assignment.EmbarkPortCode,
                BoardingPortName = assignment.EmbarkPortName,
                BoardingRecords = marker,
                Notes = $"Auto-synced from voyage {voyage.VoyageNumber}",
                OriginNode = assignment.OriginNode,
                IsSynced = false,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };

            _context.ServiceRecords.Add(serviceRecord);
        }

        serviceRecord.VesselName = voyage.VesselName ?? serviceRecord.VesselName;
        serviceRecord.VesselFlag = voyage.VesselFlag ?? serviceRecord.VesselFlag;
        serviceRecord.RankAtTime = await ResolveRankNameAsync(assignment) ?? serviceRecord.RankAtTime;
        serviceRecord.BoardingDate = assignment.EmbarkDate ?? serviceRecord.BoardingDate;
        serviceRecord.BoardingPortCode = assignment.EmbarkPortCode ?? serviceRecord.BoardingPortCode;
        serviceRecord.BoardingPortName = assignment.EmbarkPortName ?? serviceRecord.BoardingPortName;
        serviceRecord.BoardingRecords = marker;

        if (assignmentStatus is "DISEMBARKED" or "CANCELLED")
        {
            serviceRecord.DisembarkDate = assignment.DisembarkDate
                ?? serviceRecord.DisembarkDate
                ?? DateTime.UtcNow;
            serviceRecord.DisembarkPortCode = assignment.DisembarkPortCode ?? serviceRecord.DisembarkPortCode;
            serviceRecord.DisembarkPortName = assignment.DisembarkPortName ?? serviceRecord.DisembarkPortName;
        }
        else
        {
            serviceRecord.DisembarkDate = null;
            serviceRecord.DisembarkPortCode = null;
            serviceRecord.DisembarkPortName = null;
        }

        serviceRecord.UpdatedAt = DateTime.UtcNow;
        serviceRecord.IsSynced = false;
        serviceRecord.OriginNode = assignment.OriginNode;
    }

    /// <summary>
    /// Sinh / cập nhật mục SỔ THUYỀN VIÊN từ một kỳ phân công.
    ///
    /// Một kỳ phục vụ = một lần sign-on → sign-off = đúng một dòng SEA_SERVICE.
    /// Chống trùng bằng AssignmentId (khoá thật), thay cho chuỗi marker nhét trong BoardingRecords
    /// mà phiên bản service_records trước đây dùng.
    ///
    /// Thông số tàu được CHỤP LẠI từ ship_data ngay tại đây. Trước kia giao diện tự điền bằng
    /// hằng số viết cứng ("MV VINALINES VIGOR", IMO 9568762...) nên mọi mục sổ đều sai tàu.
    /// </summary>
    private async Task SyncSeamanBookEntryAsync(VoyageCrewAssignment assignment, VoyageRecord? voyage)
    {
        var status = assignment.Status?.Trim().ToUpperInvariant();
        if (status is not ("ASSIGNED" or "ONBOARD" or "DISEMBARKED" or "CANCELLED")) return;

        // Huỷ phân công khi chưa từng lên tàu → không có kỳ phục vụ nào để ghi
        if (status == "CANCELLED" && !assignment.EmbarkDate.HasValue) return;

        var entry = await _context.CrewLogbookEntries
            .FirstOrDefaultAsync(e => e.AssignmentId == assignment.Id
                                   && e.EntryType == "SEA_SERVICE");

        // Bờ có thể đã mở sẵn kỳ phục vụ khi gán thuyền viên lên tàu (chưa gắn chuyến nào).
        // Nhận lại chính mục đó thay vì tạo mục thứ hai cho cùng một kỳ.
        entry ??= await _context.CrewLogbookEntries
            .Where(e => e.CrewMemberId == assignment.CrewMemberId
                     && e.EntryType == "SEA_SERVICE"
                     && e.AssignmentId == null
                     && e.RecordStatus != "CLOSED")
            .OrderByDescending(e => e.SignOnDate ?? e.CreatedAt)
            .FirstOrDefaultAsync();

        var isNew = entry == null;
        if (!isNew) entry!.AssignmentId = assignment.Id;

        if (isNew)
        {
            entry = new CrewLogbookEntry
            {
                CrewMemberId = assignment.CrewMemberId,
                EntryType = "SEA_SERVICE",
                EntryOrigin = "EDGE",
                EntrySource = "AUTO",
                AssignmentId = assignment.Id,
                CreatedAt = DateTime.UtcNow,
            };
        }

        entry!.VoyageId = assignment.VoyageId;
        entry.RankId = assignment.RankId;
        entry.RankAtTime = await ResolveRankNameAsync(assignment) ?? entry.RankAtTime;

        // ── Ảnh chụp định danh tàu ──────────────────────────────
        // Chỉ chụp một lần lúc tạo: sổ thuyền viên là giấy tờ pháp lý, mục ghi hôm nay phải giữ
        // nguyên tên/cờ tàu của hôm nay kể cả khi tàu đổi tên về sau.
        if (isNew)
        {
            var ship = await GetLatestShipDataAsync();
            entry.VesselName = ship?.ShipName ?? voyage?.VesselName;
            entry.ImoNumber = ship?.ImoNumber;
            entry.CallSign = ship?.CallSign ?? voyage?.CallSign;
            entry.VesselFlag = ship?.Flag ?? voyage?.VesselFlag;
            entry.VesselType = ship?.TypeOfVessel;
            entry.YearBuilt = ship?.YearBuilt;
            entry.GrossTonnage = ship?.GrossTonnageInternational is double gt ? Convert.ToDecimal(gt) : null;

            if (ship != null)
            {
                var engine = await _context.ShipMainEngines.AsNoTracking()
                    .Where(m => m.ShipDataId == ship.Id)
                    .OrderBy(m => m.SortOrder)
                    .FirstOrDefaultAsync();
                entry.MainEngineType = engine?.MeType;
                entry.MainEnginePowerKw = engine?.MePowerKW is double kw ? Convert.ToInt32(kw) : null;

                // Deadweight lấy theo đường nước mùa hè (Summer) — chuẩn dùng cho hồ sơ đi biển
                var summer = await _context.ShipLoadLines.AsNoTracking()
                    .Where(l => l.ShipDataId == ship.Id && l.LoadLineType == "S")
                    .FirstOrDefaultAsync();
                entry.Deadweight = summer?.DeadweightMt is double dwt ? Convert.ToDecimal(dwt) : null;
            }

            entry.Title = string.IsNullOrWhiteSpace(entry.VesselName) ? "Kỳ phục vụ" : $"Tàu {entry.VesselName}";
            entry.Description = $"Kỳ phục vụ sinh tự động từ chuyến {voyage?.VoyageNumber ?? "-"}";
        }

        if (voyage != null)
            entry.TradeArea = BuildTradeArea(voyage) ?? entry.TradeArea;

        // ── Lên tàu ─────────────────────────────────────────────
        entry.SignOnDate = assignment.EmbarkDate ?? entry.SignOnDate;
        entry.SignOnPortCode = assignment.EmbarkPortCode ?? entry.SignOnPortCode;
        entry.SignOnPortName = assignment.EmbarkPortName ?? entry.SignOnPortName;
        entry.EntryDate = entry.SignOnDate ?? DateTime.UtcNow;

        // ── Rời tàu ─────────────────────────────────────────────
        if (status is "DISEMBARKED" or "CANCELLED")
        {
            entry.SignOffDate = assignment.DisembarkDate ?? entry.SignOffDate ?? DateTime.UtcNow;
            entry.SignOffPortCode = assignment.DisembarkPortCode ?? entry.SignOffPortCode;
            entry.SignOffPortName = assignment.DisembarkPortName ?? entry.SignOffPortName;
            entry.RecordStatus = "CLOSED";
        }
        else
        {
            // Quay lại trạng thái đang phục vụ: xoá dấu vết rời tàu nếu có
            entry.SignOffDate = null;
            entry.SignOffPortCode = null;
            entry.SignOffPortName = null;
            entry.RecordStatus = status == "ONBOARD" ? "OPEN" : "DRAFT";
        }

        entry.Status = entry.RecordStatus == "CLOSED" ? "Approved" : "Draft";
        entry.UpdatedAt = DateTime.UtcNow;
        entry.IsSynced = false;
        entry.OriginNode = assignment.OriginNode;

        if (isNew) _context.CrewLogbookEntries.Add(entry);

        _logger.LogInformation(
            "Sổ thuyền viên: {Action} kỳ phục vụ crew={CrewId} tàu={Vessel} trạng thái={Status}",
            isNew ? "tạo" : "cập nhật", assignment.CrewMemberId, entry.VesselName, entry.RecordStatus);
    }

    private async Task<ShipData?> GetLatestShipDataAsync()
    {
        return await _context.ShipData
            .AsNoTracking()
            .OrderByDescending(s => s.UpdatedAt)
            .FirstOrDefaultAsync();
    }

    private async Task<string?> ResolveRankNameAsync(VoyageCrewAssignment assignment)
    {
        if (assignment.Rank?.RankName != null) return assignment.Rank.RankName;
        if (assignment.RankId.HasValue)
        {
            return await _context.Ranks
                .Where(r => r.Id == assignment.RankId.Value)
                .Select(r => r.RankName)
                .FirstOrDefaultAsync();
        }

        var crewRankId = await _context.CrewMembers
            .Where(c => c.Id == assignment.CrewMemberId)
            .Select(c => c.RankId)
            .FirstOrDefaultAsync();

        if (!crewRankId.HasValue) return null;

        return await _context.Ranks
            .Where(r => r.Id == crewRankId.Value)
            .Select(r => r.RankName)
            .FirstOrDefaultAsync();
    }

    private static string BuildServiceRecordMarker(Guid assignmentId, Guid voyageId)
    {
        return $"VOYAGE:{voyageId};ASSIGNMENT:{assignmentId}";
    }

    private static string? BuildTradeArea(VoyageRecord voyage)
    {
        var dep = voyage.DeparturePortCode;
        var arr = voyage.ArrivalPortCode;
        if (string.IsNullOrWhiteSpace(dep) || string.IsNullOrWhiteSpace(arr)) return null;

        var depCountry = dep[..2];
        var arrCountry = arr[..2];
        return depCountry == arrCountry ? "Coastal" : "International";
    }

    public async Task<bool> RemoveCrewAssignmentAsync(Guid assignmentId)
    {
        var assignment = await _context.VoyageCrewAssignments.FindAsync(assignmentId);
        if (assignment == null) return false;

        var voyage = await _context.VoyageRecords.FindAsync(assignment.VoyageId);
        if (voyage != null)
            ValidateVoyageAllowsCrewModification(voyage, "remove");

        _context.VoyageCrewAssignments.Remove(assignment);
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<List<VoyageCrewAssignmentDto>> GetCrewVoyageHistoryAsync(Guid crewMemberId)
    {
        return await _context.VoyageCrewAssignments
            .AsNoTracking()
            .Where(a => a.CrewMemberId == crewMemberId)
            .Include(a => a.Voyage)
            .Include(a => a.Rank)
            .OrderByDescending(a => a.EmbarkDate ?? a.CreatedAt)
            .Select(a => new VoyageCrewAssignmentDto
            {
                Id = a.Id,
                VoyageId = a.VoyageId,
                VoyageNumber = a.Voyage != null ? a.Voyage.VoyageNumber : null,
                CrewMemberId = a.CrewMemberId,
                CrewId = null,
                CrewName = null,
                RankId = a.RankId,
                RankName = a.Rank != null ? a.Rank.RankName : null,
                Role = a.Role,
                EmbarkPortCode = a.EmbarkPortCode,
                EmbarkPortName = a.EmbarkPortName,
                EmbarkDate = a.EmbarkDate,
                DisembarkPortCode = a.DisembarkPortCode,
                DisembarkPortName = a.DisembarkPortName,
                DisembarkDate = a.DisembarkDate,
                WatchSchedule = a.WatchSchedule,
                Status = a.Status,
                Remarks = a.Remarks,
                CreatedAt = a.CreatedAt
            })
            .ToListAsync();
    }

    /// <summary>
    /// Gets crew voyage history for a crew member with pagination.
    /// Supports long-serving crew with many assignments by limiting results per page.
    /// </summary>
    public async Task<PaginatedResponse<VoyageCrewAssignmentDto>> GetCrewVoyageHistoryAsync(Guid crewMemberId, PaginationParams pagination)
    {
        var query = _context.VoyageCrewAssignments
            .AsNoTracking()
            .Where(a => a.CrewMemberId == crewMemberId)
            .Include(a => a.Voyage)
            .Include(a => a.Rank)
            .OrderByDescending(a => a.EmbarkDate ?? a.CreatedAt)
            .Select(a => new VoyageCrewAssignmentDto
            {
                Id = a.Id,
                VoyageId = a.VoyageId,
                VoyageNumber = a.Voyage != null ? a.Voyage.VoyageNumber : null,
                CrewMemberId = a.CrewMemberId,
                CrewId = null,
                CrewName = null,
                RankId = a.RankId,
                RankName = a.Rank != null ? a.Rank.RankName : null,
                Role = a.Role,
                EmbarkPortCode = a.EmbarkPortCode,
                EmbarkPortName = a.EmbarkPortName,
                EmbarkDate = a.EmbarkDate,
                DisembarkPortCode = a.DisembarkPortCode,
                DisembarkPortName = a.DisembarkPortName,
                DisembarkDate = a.DisembarkDate,
                WatchSchedule = a.WatchSchedule,
                Status = a.Status,
                Remarks = a.Remarks,
                CreatedAt = a.CreatedAt
            });

        var (total, data) = await query.GetPagedResultsAsync(pagination);
        return PaginatedResponse<VoyageCrewAssignmentDto>.Create(data, total, pagination);
    }

    // ========== FAL FORM 5 ==========

    public async Task<FalForm5Dto?> GenerateFalForm5Async(Guid voyageId)
    {
        var voyage = await _context.VoyageRecords
            .AsNoTracking()
            .Include(v => v.CrewAssignments)
                .ThenInclude(a => a.CrewMember)
                    .ThenInclude(c => c!.Certificates)
                        .ThenInclude(cc => cc.Certificate)
            .Include(v => v.CrewAssignments)
                .ThenInclude(a => a.CrewMember)
                    .ThenInclude(c => c!.Documents)
            .Include(v => v.CrewAssignments)
                .ThenInclude(a => a.CrewMember)
                    .ThenInclude(c => c!.Country)
            .Include(v => v.CrewAssignments)
                .ThenInclude(a => a.Rank)
            .FirstOrDefaultAsync(v => v.Id == voyageId);

        if (voyage == null) return null;

        var falForm = new FalForm5Dto
        {
            VoyageNumber = voyage.VoyageNumber,
            VesselName = voyage.VesselName,
            VesselIMO = voyage.VesselIMO,
            VesselFlag = voyage.VesselFlag,
            CallSign = voyage.CallSign,
            PortOfArrival = voyage.ArrivalPort,
            PortOfArrivalCode = voyage.ArrivalPortCode,
            DateOfArrival = voyage.ArrivalTime,
            ArrivedFrom = voyage.PreviousPortName ?? voyage.DeparturePort,
            CrewList = voyage.CrewAssignments
                .Where(a => a.Status != "CANCELLED" && a.Status != "DISEMBARKED")
                .Select((a, index) =>
                {
                    var selectedDocument = SelectFalDocument(a.CrewMember);
                    return new FalCrewEntry
                    {
                        No = index + 1,
                        FullName = a.CrewMember?.FullName,
                        Rank = a.Rank?.RankName,
                        Nationality = a.CrewMember?.Country?.CountryName,
                        DateOfBirth = a.CrewMember?.DateOfBirth,
                        PlaceOfBirth = a.CrewMember?.PlaceOfBirth,
                        TravelDocumentType = selectedDocument?.DocumentType,
                        TravelDocumentNumber = selectedDocument?.DocumentNumber,
                    };
                })
                .ToList()
        };

        return falForm;
    }

    private static CrewMemberDocument? SelectFalDocument(CrewMember? crewMember)
    {
        if (crewMember == null) return null;

        static int Priority(CrewMemberDocument document)
        {
            var type = document.DocumentType?.Trim().ToUpperInvariant() ?? string.Empty;
            return type switch
            {
                "PASSPORT" => 0,
                "SEAMAN BOOK" => 1,
                "SEAFARER BOOK" => 1,
                "SEAFARER IDENTITY DOCUMENT" => 2,
                _ => 10,
            };
        }

        // Giấy tờ đi lại cho FAL Form 5: hộ chiếu (travel) và sổ thuyền viên (seafarer)
        return crewMember.Documents
            .Where(d => d.Category == CrewDocumentCategory.Travel || d.Category == CrewDocumentCategory.Seafarer)
            .OrderBy(d => d.ExpiryDate.HasValue && d.ExpiryDate.Value < DateTime.UtcNow ? 1 : 0)
            .ThenBy(Priority)
            .ThenByDescending(d => d.IssueDate)
            .FirstOrDefault();
    }

    // ========== PRIVATE HELPERS ==========

    private VoyageDetailDto MapToDetailDto(VoyageRecord voyage, int logCount, int cargoCount)
    {
        return new VoyageDetailDto
        {
            Id = voyage.Id,
            VoyageNumber = voyage.VoyageNumber,
            VesselIMO = voyage.VesselIMO,
            VesselName = voyage.VesselName,
            VesselFlag = voyage.VesselFlag,
            CallSign = voyage.CallSign,
            DeparturePort = voyage.DeparturePort,
            DeparturePortCode = voyage.DeparturePortCode,
            DepartureTime = voyage.DepartureTime,
            ArrivalPort = voyage.ArrivalPort,
            ArrivalPortCode = voyage.ArrivalPortCode,
            ArrivalTime = voyage.ArrivalTime,
            PreviousPortCode = voyage.PreviousPortCode,
            PreviousPortName = voyage.PreviousPortName,
            CargoType = voyage.CargoType,
            CharterType = voyage.CharterType,
            CargoWeight = voyage.CargoWeight,
            PlannedDistance = voyage.PlannedDistance,
            PlannedDurationHours = voyage.PlannedDurationHours,
            PlannedAverageSpeed = voyage.PlannedAverageSpeed,
            PlannedFuelConsumption = voyage.PlannedFuelConsumption,
            VoyageInstructions = voyage.VoyageInstructions,
            DistanceTraveled = voyage.DistanceTraveled,
            FuelConsumed = voyage.FuelConsumed,
            AverageSpeed = voyage.AverageSpeed,
            VoyageStatus = voyage.VoyageStatus,
            ApprovedAt = voyage.ApprovedAt,
            ReadyAt = voyage.ReadyAt,
            CommencedAt = voyage.CommencedAt,
            ArrivedAt = voyage.ArrivedAt,
            CompletedAt = voyage.CompletedAt,
            CancelledAt = voyage.CancelledAt,
            CreatedAt = voyage.CreatedAt,
            UpdatedAt = voyage.UpdatedAt,
            PortCalls = voyage.PortCalls.Select(p => new PortCallDto
            {
                Id = p.Id,
                VoyageId = p.VoyageId,
                PortId = p.PortId,
                PortCode = p.PortCode,
                PortName = p.PortName,
                Country = p.Country,
                CallType = p.CallType,
                Sequence = p.Sequence,
                ArrivalTime = p.ArrivalTime,
                DepartureTime = p.DepartureTime,
                BerthNumber = p.BerthNumber,
                PilotOnBoard = p.PilotOnBoard,
                PilotOffBoard = p.PilotOffBoard,
                DraftFore = p.DraftFore,
                DraftAft = p.DraftAft,
                CargoOpsCompleted = p.CargoOpsCompleted,
                Remarks = p.Remarks,
                CreatedAt = p.CreatedAt
            }).ToList(),
            CrewAssignments = voyage.CrewAssignments.Select(a => MapToAssignmentDto(a)).ToList(),
            PlanLegs = voyage.PlanLegs
                .OrderBy(p => p.Sequence)
                .Select(p => new VoyagePlanLegDto
                {
                    Id = p.Id,
                    VoyageId = p.VoyageId,
                    Sequence = p.Sequence,
                    LegType = p.LegType,
                    FromPortCode = p.FromPortCode,
                    FromPortName = p.FromPortName,
                    ToPortCode = p.ToPortCode,
                    ToPortName = p.ToPortName,
                    PlannedDepartureTime = p.PlannedDepartureTime,
                    PlannedArrivalTime = p.PlannedArrivalTime,
                    PlannedDistance = p.PlannedDistance,
                    PlannedDurationHours = p.PlannedDurationHours,
                    PlannedAverageSpeed = p.PlannedAverageSpeed,
                    PlannedFuelConsumption = p.PlannedFuelConsumption,
                    CargoActivity = p.CargoActivity,
                    CrewChangePlanned = p.CrewChangePlanned,
                    BunkerSupplyPlanned = p.BunkerSupplyPlanned,
                    WeatherRoutingNotes = p.WeatherRoutingNotes,
                    Notes = p.Notes,
                })
                .ToList(),
            StatusHistory = voyage.StatusHistory
                .OrderByDescending(h => h.ChangedAt)
                .Select(h => new VoyageStatusHistoryDto
                {
                    Id = h.Id,
                    FromStatus = h.FromStatus,
                    ToStatus = h.ToStatus,
                    ChangedBy = h.ChangedBy,
                    Notes = h.Notes,
                    ChangedAt = h.ChangedAt,
                })
                .ToList(),
            LogEntryCount = logCount,
            CargoOperationCount = cargoCount,
            TotalEstimatedCost = voyage.TotalEstimatedCost,
            TotalEstimatedRevenue = voyage.TotalEstimatedRevenue,
            EstimatedProfitMargin = voyage.EstimatedProfitMargin,
            CargoPlans = voyage.CargoPlans
                .OrderBy(cp => cp.Sequence)
                .Select(cp => new VoyageCargoPlanDto
                {
                    Id = cp.Id, VoyageId = cp.VoyageId, PlanLegId = cp.PlanLegId,
                    Sequence = cp.Sequence, OperationType = cp.OperationType, CargoType = cp.CargoType,
                    CargoDescription = cp.CargoDescription, PlannedQuantity = cp.PlannedQuantity,
                    Unit = cp.Unit, PortCode = cp.PortCode, PortName = cp.PortName,
                    ShipperName = cp.ShipperName, ConsigneeName = cp.ConsigneeName,
                    SpecialRequirements = cp.SpecialRequirements, Notes = cp.Notes,
                }).ToList(),
            BunkerPlans = voyage.BunkerPlans
                .OrderBy(bp => bp.Sequence)
                .Select(bp => new VoyageBunkerPlanDto
                {
                    Id = bp.Id, VoyageId = bp.VoyageId, PlanLegId = bp.PlanLegId,
                    Sequence = bp.Sequence, FuelType = bp.FuelType, PlannedQuantity = bp.PlannedQuantity,
                    OperationType = bp.OperationType, PortCode = bp.PortCode, PortName = bp.PortName,
                    EstimatedCostUsd = bp.EstimatedCostUsd, SupplierName = bp.SupplierName, Notes = bp.Notes,
                }).ToList(),
            CrewChangePlans = voyage.CrewChangePlans
                .OrderBy(ccp => ccp.Sequence)
                .Select(ccp => new VoyageCrewChangePlanDto
                {
                    Id = ccp.Id, VoyageId = ccp.VoyageId, PlanLegId = ccp.PlanLegId,
                    Sequence = ccp.Sequence, CrewMemberId = ccp.CrewMemberId,
                    CrewName = ccp.CrewMember?.FullName, RankId = ccp.RankId,
                    RankName = ccp.Rank?.RankName, ChangeType = ccp.ChangeType,
                    PortCode = ccp.PortCode, PortName = ccp.PortName,
                    PlannedDate = ccp.PlannedDate, ReplacementReason = ccp.ReplacementReason,
                    Notes = ccp.Notes,
                }).ToList(),
            CostEstimates = voyage.CostEstimates
                .OrderBy(ce => ce.Sequence)
                .Select(ce => new VoyageCostEstimateDto
                {
                    Id = ce.Id, VoyageId = ce.VoyageId, Sequence = ce.Sequence,
                    CostCategory = ce.CostCategory, Description = ce.Description,
                    EstimatedAmount = ce.EstimatedAmount, Currency = ce.Currency, Notes = ce.Notes,
                }).ToList(),
            RevenueEstimates = voyage.RevenueEstimates
                .OrderBy(re => re.Sequence)
                .Select(re => new VoyageRevenueEstimateDto
                {
                    Id = re.Id, VoyageId = re.VoyageId, Sequence = re.Sequence,
                    RevenueCategory = re.RevenueCategory, Description = re.Description,
                    EstimatedAmount = re.EstimatedAmount, Currency = re.Currency, Notes = re.Notes,
                }).ToList(),
        };
    }

    private static string NormalizeVoyageStatus(string status)
    {
        var normalized = status.Trim().ToUpperInvariant();

        if (!VoyageStatus.IsKnownStatus(normalized))
            throw new InvalidOperationException($"Unsupported voyage status: {status}");

        return normalized;
    }

    private static string? NormalizeCharterType(string? charterType)
    {
        if (string.IsNullOrWhiteSpace(charterType))
            return null;

        var normalized = charterType.Trim().ToUpperInvariant();
        if (!VoyageCharterType.IsKnownType(normalized))
            throw new InvalidOperationException($"Unsupported charter type: {charterType}");

        return normalized;
    }

    private static void ApplyPlanLegs(VoyageRecord voyage, List<UpsertVoyagePlanLegDto>? planLegs)
    {
        if (planLegs == null || planLegs.Count == 0)
            return;

        ValidatePlanLegs(planLegs);

        foreach (var leg in planLegs.OrderBy(l => l.Sequence))
        {
            voyage.PlanLegs.Add(new VoyagePlanLeg
            {
                VoyageId = voyage.Id,
                Sequence = leg.Sequence,
                LegType = string.IsNullOrWhiteSpace(leg.LegType) ? "PASSAGE" : leg.LegType.Trim().ToUpperInvariant(),
                FromPortCode = leg.FromPortCode,
                FromPortName = leg.FromPortName,
                ToPortCode = leg.ToPortCode,
                ToPortName = leg.ToPortName,
                PlannedDepartureTime = leg.PlannedDepartureTime,
                PlannedArrivalTime = leg.PlannedArrivalTime,
                PlannedDistance = leg.PlannedDistance,
                PlannedDurationHours = leg.PlannedDurationHours,
                PlannedAverageSpeed = leg.PlannedAverageSpeed,
                PlannedFuelConsumption = leg.PlannedFuelConsumption,
                CargoActivity = leg.CargoActivity,
                CrewChangePlanned = leg.CrewChangePlanned,
                BunkerSupplyPlanned = leg.BunkerSupplyPlanned,
                WeatherRoutingNotes = leg.WeatherRoutingNotes,
                Notes = leg.Notes,
            });
        }
    }

    private async Task ReplacePlanLegsAsync(VoyageRecord voyage, List<UpsertVoyagePlanLegDto> planLegs)
    {
        var existingLegs = await _context.VoyagePlanLegs
            .Where(l => l.VoyageId == voyage.Id)
            .ToListAsync();

        if (existingLegs.Count > 0)
            _context.VoyagePlanLegs.RemoveRange(existingLegs);

        voyage.PlanLegs.Clear();
        ApplyPlanLegs(voyage, planLegs);
    }

    private static void ValidatePlanLegs(List<UpsertVoyagePlanLegDto> planLegs)
    {
        if (planLegs.Any(l => l.Sequence <= 0))
            throw new InvalidOperationException("Voyage plan leg sequence must be greater than zero.");

        var duplicateSequences = planLegs
            .GroupBy(l => l.Sequence)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToList();

        if (duplicateSequences.Count > 0)
            throw new InvalidOperationException($"Duplicate voyage plan leg sequence(s): {string.Join(", ", duplicateSequences)}");
    }

    private void AddStatusHistory(VoyageRecord voyage, string? fromStatus, string toStatus, string notes)
    {
        _context.VoyageStatusHistories.Add(new VoyageStatusHistory
        {
            VoyageId = voyage.Id,
            FromStatus = fromStatus,
            ToStatus = toStatus,
            ChangedBy = "system",
            Notes = notes,
            ChangedAt = DateTime.UtcNow,
        });
    }

    private static void ApplyLifecycleMilestones(VoyageRecord voyage, string status)
    {
        var now = DateTime.UtcNow;

        if (status == VoyageStatus.PLANNING)
        {
            voyage.ApprovedAt = null;
            voyage.ReadyAt = null;
            voyage.CommencedAt = null;
            voyage.ArrivedAt = null;
            voyage.CompletedAt = null;
            voyage.CancelledAt = null;
            return;
        }

        if (status == VoyageStatus.APPROVED)
        {
            voyage.ApprovedAt ??= now;
            voyage.ReadyAt = null;
            voyage.CommencedAt = null;
            voyage.ArrivedAt = null;
            voyage.CompletedAt = null;
            voyage.CancelledAt = null;
            return;
        }

        if (status == VoyageStatus.READY)
        {
            voyage.ApprovedAt ??= now;
            voyage.ReadyAt ??= now;
            voyage.CommencedAt = null;
            voyage.ArrivedAt = null;
            voyage.CompletedAt = null;
            voyage.CancelledAt = null;
            return;
        }

        if (status == VoyageStatus.UNDERWAY)
        {
            voyage.ApprovedAt ??= now;
            voyage.ReadyAt ??= now;
            voyage.CommencedAt ??= now;
            voyage.ArrivedAt = null;
            voyage.CompletedAt = null;
            voyage.CancelledAt = null;
            return;
        }

        if (status == VoyageStatus.ARRIVED)
        {
            voyage.ApprovedAt ??= now;
            voyage.ReadyAt ??= now;
            voyage.CommencedAt ??= now;
            voyage.ArrivedAt ??= now;
            voyage.CompletedAt = null;
            voyage.CancelledAt = null;
            return;
        }

        if (status == VoyageStatus.COMPLETED)
        {
            voyage.ApprovedAt ??= now;
            voyage.ReadyAt ??= now;
            voyage.CommencedAt ??= now;
            voyage.ArrivedAt ??= now;
            voyage.CompletedAt ??= now;
            voyage.CancelledAt = null;
            return;
        }

        if (status == VoyageStatus.CANCELLED)
        {
            voyage.CancelledAt = now;
        }
    }

    // ========== Phase 2: PLANNING SUB-ENTITY HELPERS ==========

    private static void ApplyCargoPlans(VoyageRecord voyage, List<UpsertVoyageCargoPlanDto>? plans)
    {
        if (plans == null || plans.Count == 0) return;
        foreach (var p in plans.OrderBy(x => x.Sequence))
        {
            voyage.CargoPlans.Add(new VoyageCargoPlan
            {
                VoyageId = voyage.Id, PlanLegId = p.PlanLegId, Sequence = p.Sequence,
                OperationType = p.OperationType.Trim().ToUpperInvariant(),
                CargoType = p.CargoType, CargoDescription = p.CargoDescription,
                PlannedQuantity = p.PlannedQuantity, Unit = p.Unit,
                PortCode = p.PortCode, PortName = p.PortName,
                ShipperName = p.ShipperName, ConsigneeName = p.ConsigneeName,
                SpecialRequirements = p.SpecialRequirements, Notes = p.Notes,
            });
        }
    }

    private async Task ReplaceCargoPlansAsync(VoyageRecord voyage, List<UpsertVoyageCargoPlanDto> plans)
    {
        var existing = await _context.VoyageCargoPlans.Where(x => x.VoyageId == voyage.Id).ToListAsync();
        if (existing.Count > 0) _context.VoyageCargoPlans.RemoveRange(existing);
        voyage.CargoPlans.Clear();
        ApplyCargoPlans(voyage, plans);
    }

    private static void ApplyBunkerPlans(VoyageRecord voyage, List<UpsertVoyageBunkerPlanDto>? plans)
    {
        if (plans == null || plans.Count == 0) return;
        foreach (var p in plans.OrderBy(x => x.Sequence))
        {
            voyage.BunkerPlans.Add(new VoyageBunkerPlan
            {
                VoyageId = voyage.Id, PlanLegId = p.PlanLegId, Sequence = p.Sequence,
                FuelType = p.FuelType.Trim().ToUpperInvariant(),
                PlannedQuantity = p.PlannedQuantity, OperationType = p.OperationType.Trim().ToUpperInvariant(),
                PortCode = p.PortCode, PortName = p.PortName,
                EstimatedCostUsd = p.EstimatedCostUsd, SupplierName = p.SupplierName, Notes = p.Notes,
            });
        }
    }

    private async Task ReplaceBunkerPlansAsync(VoyageRecord voyage, List<UpsertVoyageBunkerPlanDto> plans)
    {
        var existing = await _context.VoyageBunkerPlans.Where(x => x.VoyageId == voyage.Id).ToListAsync();
        if (existing.Count > 0) _context.VoyageBunkerPlans.RemoveRange(existing);
        voyage.BunkerPlans.Clear();
        ApplyBunkerPlans(voyage, plans);
    }

    private static void ApplyCrewChangePlans(VoyageRecord voyage, List<UpsertVoyageCrewChangePlanDto>? plans)
    {
        if (plans == null || plans.Count == 0) return;
        foreach (var p in plans.OrderBy(x => x.Sequence))
        {
            voyage.CrewChangePlans.Add(new VoyageCrewChangePlan
            {
                VoyageId = voyage.Id, PlanLegId = p.PlanLegId, Sequence = p.Sequence,
                CrewMemberId = p.CrewMemberId, RankId = p.RankId,
                ChangeType = p.ChangeType.Trim().ToUpperInvariant(),
                PortCode = p.PortCode, PortName = p.PortName,
                PlannedDate = p.PlannedDate, ReplacementReason = p.ReplacementReason, Notes = p.Notes,
            });
        }
    }

    private async Task ReplaceCrewChangePlansAsync(VoyageRecord voyage, List<UpsertVoyageCrewChangePlanDto> plans)
    {
        var existing = await _context.VoyageCrewChangePlans.Where(x => x.VoyageId == voyage.Id).ToListAsync();
        if (existing.Count > 0) _context.VoyageCrewChangePlans.RemoveRange(existing);
        voyage.CrewChangePlans.Clear();
        ApplyCrewChangePlans(voyage, plans);
    }

    private static void ApplyCostEstimates(VoyageRecord voyage, List<UpsertVoyageCostEstimateDto>? estimates)
    {
        if (estimates == null || estimates.Count == 0) return;
        foreach (var e in estimates.OrderBy(x => x.Sequence))
        {
            voyage.CostEstimates.Add(new VoyageCostEstimate
            {
                VoyageId = voyage.Id, Sequence = e.Sequence,
                CostCategory = e.CostCategory.Trim().ToUpperInvariant(),
                Description = e.Description, EstimatedAmount = e.EstimatedAmount,
                Currency = e.Currency, Notes = e.Notes,
            });
        }
    }

    private async Task ReplaceCostEstimatesAsync(VoyageRecord voyage, List<UpsertVoyageCostEstimateDto> estimates)
    {
        var existing = await _context.VoyageCostEstimates.Where(x => x.VoyageId == voyage.Id).ToListAsync();
        if (existing.Count > 0) _context.VoyageCostEstimates.RemoveRange(existing);
        voyage.CostEstimates.Clear();
        ApplyCostEstimates(voyage, estimates);
    }

    private static void ApplyRevenueEstimates(VoyageRecord voyage, List<UpsertVoyageRevenueEstimateDto>? estimates)
    {
        if (estimates == null || estimates.Count == 0) return;
        foreach (var e in estimates.OrderBy(x => x.Sequence))
        {
            voyage.RevenueEstimates.Add(new VoyageRevenueEstimate
            {
                VoyageId = voyage.Id, Sequence = e.Sequence,
                RevenueCategory = e.RevenueCategory.Trim().ToUpperInvariant(),
                Description = e.Description, EstimatedAmount = e.EstimatedAmount,
                Currency = e.Currency, Notes = e.Notes,
            });
        }
    }

    private async Task ReplaceRevenueEstimatesAsync(VoyageRecord voyage, List<UpsertVoyageRevenueEstimateDto> estimates)
    {
        var existing = await _context.VoyageRevenueEstimates.Where(x => x.VoyageId == voyage.Id).ToListAsync();
        if (existing.Count > 0) _context.VoyageRevenueEstimates.RemoveRange(existing);
        voyage.RevenueEstimates.Clear();
        ApplyRevenueEstimates(voyage, estimates);
    }

    private static void RecalculateFinancialSummary(VoyageRecord voyage)
    {
        var totalCost = voyage.CostEstimates.Sum(c => c.EstimatedAmount);
        var totalRevenue = voyage.RevenueEstimates.Sum(r => r.EstimatedAmount);
        voyage.TotalEstimatedCost = totalCost > 0 ? totalCost : null;
        voyage.TotalEstimatedRevenue = totalRevenue > 0 ? totalRevenue : null;
        voyage.EstimatedProfitMargin = (totalCost > 0 || totalRevenue > 0)
            ? totalRevenue - totalCost
            : null;
    }

    private static VoyageCrewAssignmentDto MapToAssignmentDto(VoyageCrewAssignment a)
    {
        return new VoyageCrewAssignmentDto
        {
            Id = a.Id,
            VoyageId = a.VoyageId,
            VoyageNumber = a.Voyage?.VoyageNumber,
            CrewMemberId = a.CrewMemberId,
            CrewName = a.CrewMember?.FullName,
            CrewId = a.CrewMember?.CrewId,
            RankId = a.RankId,
            RankName = a.Rank?.RankName,
            Role = a.Role,
            EmbarkPortCode = a.EmbarkPortCode,
            EmbarkPortName = a.EmbarkPortName,
            EmbarkDate = a.EmbarkDate,
            DisembarkPortCode = a.DisembarkPortCode,
            DisembarkPortName = a.DisembarkPortName,
            DisembarkDate = a.DisembarkDate,
            WatchSchedule = a.WatchSchedule,
            Status = a.Status,
            Remarks = a.Remarks,
            CreatedAt = a.CreatedAt
        };
    }

    private static PortCallDto MapToPortCallDto(PortCall p)
    {
        return new PortCallDto
        {
            Id = p.Id,
            VoyageId = p.VoyageId,
            PortId = p.PortId,
            PortCode = p.PortCode,
            PortName = p.PortName,
            Country = p.Country,
            CallType = p.CallType,
            Sequence = p.Sequence,
            ArrivalTime = p.ArrivalTime,
            DepartureTime = p.DepartureTime,
            BerthNumber = p.BerthNumber,
            PilotOnBoard = p.PilotOnBoard,
            PilotOffBoard = p.PilotOffBoard,
            DraftFore = p.DraftFore,
            DraftAft = p.DraftAft,
            CargoOpsCompleted = p.CargoOpsCompleted,
            Remarks = p.Remarks,
            CreatedAt = p.CreatedAt
        };
    }

    // ========== VOYAGE STATUS VALIDATION HELPERS ==========
    // Consolidated from 12 repeated checks - single source of truth for status validation

    /// <summary>
    /// Validates if a voyage is editable based on its current status.
    /// Throws InvalidOperationException if voyage cannot be edited.
    /// </summary>
    /// <param name="voyage">The voyage to validate</param>
    /// <param name="allowLimitedEdit">If true, allows limited edits for UNDERWAY voyages</param>
    private void ValidateVoyageIsEditable(VoyageRecord voyage, bool allowLimitedEdit = false)
    {
        // Read-only statuses: COMPLETED, CANCELLED - cannot be edited except for status transitions
        if (VoyageStatus.ReadOnlyStatuses.Contains(voyage.VoyageStatus))
            throw new InvalidOperationException($"Voyage is {voyage.VoyageStatus} and cannot be modified. Only status transitions are allowed.");

        // Limited edit status: UNDERWAY - only certain fields can be updated
        if (!allowLimitedEdit && VoyageStatus.LimitedEditStatuses.Contains(voyage.VoyageStatus))
            throw new InvalidOperationException($"Cannot modify voyage while {voyage.VoyageStatus}. Limited editing only in {voyage.VoyageStatus} status.");
    }

    /// <summary>
    /// Validates if a voyage allows adding/deleting port calls based on its status.
    /// </summary>
    private void ValidateVoyageAllowsPortCallModification(VoyageRecord voyage, string operation = "modify")
    {
        if (VoyageStatus.ReadOnlyStatuses.Contains(voyage.VoyageStatus))
            throw new InvalidOperationException($"Cannot {operation} port calls on a {voyage.VoyageStatus} voyage.");
    }

    /// <summary>
    /// Validates if a voyage allows crew assignment changes based on its status.
    /// </summary>
    private void ValidateVoyageAllowsCrewModification(VoyageRecord voyage, string operation = "modify")
    {
        if (VoyageStatus.ReadOnlyStatuses.Contains(voyage.VoyageStatus))
            throw new InvalidOperationException($"Cannot {operation} crew assignments on a {voyage.VoyageStatus} voyage.");

        if (VoyageStatus.LimitedEditStatuses.Contains(voyage.VoyageStatus) && operation == "remove")
            throw new InvalidOperationException("Cannot remove crew while voyage is UNDERWAY. Change status to DISEMBARKED instead.");
    }

    /// <summary>
    /// Validates if voyage allows editing a specific entity type (cargo plans, bunker plans, etc.)
    /// </summary>
    private void ValidateVoyageAllowsEntityModification(VoyageRecord voyage, string entityType)
    {
        if (!VoyageStatus.EditableStatuses.Contains(voyage.VoyageStatus))
            throw new InvalidOperationException($"Cannot modify {entityType} while voyage is {voyage.VoyageStatus}.");
    }
}
