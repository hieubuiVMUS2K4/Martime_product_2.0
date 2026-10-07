using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using AutoMapper;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.DTOs;
using MaritimeEdge.Services.Maintenance;
using MaritimeEdge.Services.Voyage;
using MaritimeEdge.Services.Core;
using System.Text.Json;

namespace MaritimeEdge.Services.Reporting;

/// <summary>
/// Maritime Reporting Service - IMO/SOLAS/MARPOL Compliant
/// High-performance service with caching and optimized queries
/// </summary>
public interface IReportingService
{
    // Report CRUD
    Task<(bool Success, string ReportNumber, Guid? ReportId, string? Error)> CreateNoonReportAsync(CreateNoonReportDto dto, string? username = null);
    Task<(bool Success, string ReportNumber, Guid? ReportId, string? Error)> CreateDepartureReportAsync(CreateDepartureReportDto dto, string? username = null);
    Task<(bool Success, string ReportNumber, Guid? ReportId, string? Error)> CreateArrivalReportAsync(CreateArrivalReportDto dto, string? username = null);
    Task<(bool Success, string ReportNumber, Guid? ReportId, string? Error)> CreateBunkerReportAsync(CreateBunkerReportDto dto, string? username = null);
    Task<(bool Success, string ReportNumber, Guid? ReportId, string? Error)> CreatePositionReportAsync(CreatePositionReportDto dto, string? username = null);

    Task<NoonReportDto?> GetNoonReportAsync(Guid reportId);
    Task<DepartureReportDto?> GetDepartureReportAsync(Guid reportId);
    Task<ArrivalReportDto?> GetArrivalReportAsync(Guid reportId);
    Task<BunkerReportDto?> GetBunkerReportAsync(Guid reportId);
    Task<PositionReportDto?> GetPositionReportAsync(Guid reportId);
    
    // Generic report access
    Task<object?> GetReportByIdAsync(Guid reportId);

    Task<PaginatedReportResponseDto<ReportSummaryDto>> GetReportsAsync(ReportPaginationDto pagination);
    
    // Workflow
    Task<(bool Success, string? Error)> SubmitReportAsync(Guid reportId, string? username = null);
    Task<(bool Success, string? Error)> ApproveReportAsync(Guid reportId, ApproveReportDto dto, string? username = null);
    Task<(bool Success, string? Error)> RejectReportAsync(Guid reportId, string reason, string? username = null);
    Task<(bool Success, string? Error)> ReopenRejectedReportAsync(Guid reportId, string reopenedBy, string corrections);
    Task<(bool Success, string? Error)> UpdateDraftReportAsync(Guid reportId, Dictionary<string, object> updates);
    Task<(bool Success, string? Error)> UpdateFullNoonReportAsync(Guid reportId, CreateNoonReportDto dto, string? username = null);
    Task<(bool Success, string? Error)> UpdateFullDepartureReportAsync(Guid reportId, CreateDepartureReportDto dto, string? username = null);
    Task<(bool Success, string? Error)> UpdateFullArrivalReportAsync(Guid reportId, CreateArrivalReportDto dto, string? username = null);
    Task<(bool Success, string? Error)> UpdateFullBunkerReportAsync(Guid reportId, CreateBunkerReportDto dto, string? username = null);
    Task<(bool Success, string? Error)> UpdateFullPositionReportAsync(Guid reportId, CreatePositionReportDto dto, string? username = null);
    
    // Transmission
    Task<(bool Success, string? Error)> TransmitReportAsync(Guid reportId, TransmitReportDto dto, string? username = null);
    Task<TransmissionStatusDto?> GetTransmissionStatusAsync(Guid reportId);
    
    // Statistics
    Task<ReportStatisticsDto> GetReportStatisticsAsync(DateTime? fromDate = null, DateTime? toDate = null);
    
    // Report Types
    Task<List<ReportTypeDto>> GetReportTypesAsync(bool activeOnly = true);
    
    // Audit Trail
    Task<List<WorkflowHistoryDto>> GetWorkflowHistoryAsync(Guid reportId);
    
    // Soft Delete
    Task<(bool Success, string? Error)> SoftDeleteReportAsync(Guid reportId, string deletedBy, string reason);
    Task<List<DeletedReportDto>> GetDeletedReportsAsync(DateTime? fromDate = null, DateTime? toDate = null);
    Task<(bool Success, string? Error)> RestoreReportAsync(Guid reportId, string restoredBy);
    
    // Amendments
    Task<(bool Success, Guid? AmendmentId, int? AmendmentNumber, string? Error)> CreateAmendmentAsync(Guid reportId, CreateAmendmentDto dto, string amendedBy);
    Task<List<ReportAmendmentDto>> GetAmendmentsAsync(Guid reportId);
    Task<ReportAmendmentDto?> GetAmendmentAsync(Guid amendmentId);
    Task<(bool Success, string? Error)> ApproveAmendmentAsync(Guid amendmentId, ApproveAmendmentDto dto);
    Task<(bool Success, string? Error)> TransmitAmendmentAsync(Guid amendmentId, TransmitReportDto dto);
}

public class ReportingService : IReportingService
{
    private readonly EdgeDbContext _context;
    private readonly ILogger<ReportingService> _logger;
    private readonly IMemoryCache _cache;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly IVoyageContextService _voyageContext;
    private readonly IMapper _mapper;
    private readonly IEdgeRuntimeConfigService _runtimeConfigService;
    private static readonly TimeSpan CacheDuration = TimeSpan.FromHours(24);

    public ReportingService(
        EdgeDbContext context, 
        ILogger<ReportingService> logger,
        IMemoryCache cache,
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        IVoyageContextService voyageContext,
        IMapper mapper,
        IEdgeRuntimeConfigService runtimeConfigService)
    {
        _context = context;
        _logger = logger;
        _cache = cache;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _voyageContext = voyageContext;
        _mapper = mapper;
        _runtimeConfigService = runtimeConfigService;
    }

    // ============================================================
    // NOON REPORT
    // ============================================================

    public async Task<(bool Success, string ReportNumber, Guid? ReportId, string? Error)> CreateNoonReportAsync(
        CreateNoonReportDto dto, string? username = null)
    {
        try
        {
            // Validate maritime business rules
            var (isValid, errors, warnings) = MaritimeValidationService.ValidateNoonReport(dto);
            
            if (!isValid)
            {
                var errorMessage = string.Join("; ", errors);
                _logger.LogWarning("Noon report validation failed: {Errors}", errorMessage);
                return (false, string.Empty, null, errorMessage);
            }

            // Log warnings if any
            if (warnings.Any())
            {
                _logger.LogWarning("Noon report warnings: {Warnings}", string.Join("; ", warnings));
            }

            // Get NOON report type (cached for performance)
            var reportType = await GetReportTypeByCodeAsync("NOON");

            if (reportType == null)
            {
                return (false, string.Empty, null, "Report type NOON not found. Please seed report types.");
            }

            // CRITICAL: Check for duplicate Noon Report on same date
            // In maritime practice, only ONE noon report per day is allowed
            var reportDateOnly = dto.ReportDate.Date;
            var existingNoonReport = await (
                from mr in _context.MaritimeReports
                join nr in _context.NoonReports on mr.Id equals nr.MaritimeReportId
                where mr.ReportTypeId == reportType.Id 
                    && mr.DeletedAt == null
                    && nr.ReportDate.Date == reportDateOnly
                select mr
            ).AnyAsync();

            if (existingNoonReport)
            {
                return (false, string.Empty, null, 
                    $"Noon report already exists for {reportDateOnly:yyyy-MM-dd}. Only one noon report per day is allowed.");
            }

            // Generate report number
            var reportNumber = await GenerateReportNumberAsync("NOON");

            // Prepare remarks with validation warnings
            var remarks = dto.GeneralRemarks;
            if (warnings.Any())
            {
                remarks = $"[VALIDATION WARNINGS]\n{string.Join("\n", warnings)}\n\n{remarks}";
            }

            // Use transaction to ensure atomicity
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                // Create maritime report (parent)
                var maritimeReport = new MaritimeReport
                {
                    ReportNumber = reportNumber,
                    ReportTypeId = reportType.Id,
                    ReportDateTime = dto.ReportDate,
                    VoyageId = dto.VoyageId,
                    Status = "DRAFT",
                    PreparedBy = username ?? dto.PreparedBy,
                    ReportData = JsonSerializer.Serialize(dto), // Store as JSON for flexibility
                    Remarks = remarks,
                    IsTransmitted = false,
                    IsSynced = false,
                    CreatedAt = DateTime.UtcNow
                };

                var (_, legId) = await _voyageContext.ResolveActiveVoyageAsync(maritimeReport.ReportDateTime);
                maritimeReport.VoyagePlanLegId = legId;

                _context.MaritimeReports.Add(maritimeReport);
                await _context.SaveChangesAsync(); // Need to get maritimeReport.Id

                // Auto-calculate crew on board if not provided
                int? crewOnBoard = dto.CrewOnBoard;
                if (!crewOnBoard.HasValue)
                {
                    try
                    {
                        crewOnBoard = await _context.CrewMembers.CountAsync(c => c.IsOnboard);
                    }
                    catch
                    {
                        // Ignore if crew table not available
                    }
                }

                // Create noon report (child)
                var noonReport = new NoonReport
                {
                    MaritimeReportId = maritimeReport.Id,
                    ReportDate = dto.ReportDate,
                    
                    // Position
                    Latitude = dto.Latitude,
                    Longitude = dto.Longitude,
                    CourseOverGround = dto.CourseOverGround,
                    SpeedOverGround = dto.SpeedOverGround,
                    DistanceTraveled = dto.DistanceTraveled,
                    DistanceToGo = dto.DistanceToGo,
                    EstimatedTimeOfArrival = dto.EstimatedTimeOfArrival,
                    
                    // Weather
                    WeatherConditions = dto.WeatherConditions,
                    SeaState = dto.SeaState,
                    AirTemperature = dto.AirTemperature,
                    SeaTemperature = dto.SeaTemperature,
                    BarometricPressure = dto.BarometricPressure,
                    WindDirection = dto.WindDirection,
                    WindSpeed = dto.WindSpeed,
                    Visibility = dto.Visibility,
                    
                    // Fuel Consumption
                    FuelOilConsumed = dto.FuelOilConsumed,
                    DieselOilConsumed = dto.DieselOilConsumed,
                    LubOilConsumed = dto.LubOilConsumed,
                    FreshWaterConsumed = dto.FreshWaterConsumed,
                    
                    // ROB
                    FuelOilROB = dto.FuelOilROB,
                    DieselOilROB = dto.DieselOilROB,
                    LubOilROB = dto.LubOilROB,
                    FreshWaterROB = dto.FreshWaterROB,
                    
                    // Engine
                    MainEngineRunningHours = dto.MainEngineRunningHours,
                    MainEngineRPM = dto.MainEngineRPM,
                    MainEnginePower = dto.MainEnginePower,
                    AuxEngineRunningHours = dto.AuxEngineRunningHours,
                    
                    // Cargo
                    CargoOnBoard = dto.CargoOnBoard,
                    CargoDescription = dto.CargoDescription,
                    
                    // Crew Status
                    CrewOnBoard = crewOnBoard,
                    PassengersOnBoard = dto.PassengersOnBoard,
                    
                    // Safety
                    SafetyDrillsConducted = dto.SafetyDrillsConducted,
                    SafetyIncidents = dto.SafetyIncidents,
                    
                    // Remarks
                    OperationalRemarks = dto.OperationalRemarks,
                    MachineryRemarks = dto.MachineryRemarks,
                    CargoRemarks = dto.CargoRemarks,
                    MaintenanceRemarks = dto.MaintenanceRemarks,
                    
                    CreatedAt = DateTime.UtcNow
                };

                _context.NoonReports.Add(noonReport);
                await _context.SaveChangesAsync();

                // Commit transaction
                await transaction.CommitAsync();

                _logger.LogInformation("Noon report created: {ReportNumber}", reportNumber);
                
                return (true, reportNumber, maritimeReport.Id, null);
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Transaction failed while creating noon report");
                throw;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating noon report");
            return (false, string.Empty, null, ex.InnerException?.Message ?? ex.Message);
        }
    }

    public async Task<NoonReportDto?> GetNoonReportAsync(Guid reportId)
    {
        // Fetch with eager loading of related entity
        var noonReport = await _context.NoonReports
            .AsNoTracking()
            .Include(n => n.MaritimeReport)
            .FirstOrDefaultAsync(n => n.MaritimeReportId == reportId && n.MaritimeReport!.DeletedAt == null);

        if (noonReport == null)
            return null;

        var reportDate = noonReport.ReportDate.Date;

        // Use AutoMapper for core property mapping (85+ properties consolidated into 1 line)
        var dto = _mapper.Map<NoonReportDto>(noonReport);

        // Get voyage number if linked
        if (noonReport.MaritimeReport!.VoyageId.HasValue)
        {
            var voyage = await _context.VoyageRecords
                .Where(v => v.Id == noonReport.MaritimeReport.VoyageId.Value)
                .Select(v => v.VoyageNumber)
                .FirstOrDefaultAsync();
            dto.VoyageNumber = voyage;
        }

        // Aggregate Crew data
        try
        {
            dto.CrewOnBoard = await _context.CrewMembers
                .CountAsync(c => c.IsOnboard);
            
            var thirtyDaysFromNow = DateTime.UtcNow.AddDays(30);
            
            var onboardCrewIds = await _context.CrewMembers
                .Where(c => c.IsOnboard)
                .Select(c => c.Id)
                .ToListAsync();
            
            var certsExpiringSoon = await _context.CrewCertificates
                .Where(cc => onboardCrewIds.Contains(cc.CrewMemberId) && 
                             cc.ExpiryDate <= thirtyDaysFromNow)
                .CountAsync();
            
            dto.CertificatesExpiringSoon = certsExpiringSoon;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not aggregate crew data for noon report");
        }

        // Aggregate Maintenance data
        try
        {
            var yesterday = reportDate.AddDays(-1);
            var sevenDaysFromNow = reportDate.AddDays(7);

            var maintenanceSummary = new NoonReportMaintenanceSummaryDto
            {
                TasksCompletedLast24h = await _context.MaintenanceTasks
                    .CountAsync(t => t.Status == "COMPLETED" && t.CompletedAt >= yesterday && t.CompletedAt <= reportDate.AddDays(1)),
                
                TasksInProgress = await _context.MaintenanceTasks
                    .CountAsync(t => t.Status == "IN_PROGRESS"),
                
                OverdueTasks = await _context.MaintenanceTasks
                    .CountAsync(t => t.Status == "OVERDUE" || (t.NextDueAt < reportDate && t.Status != "COMPLETED" && t.Status != "CANCELLED")),
                
                CriticalTasksDueSoon = await _context.MaintenanceTasks
                    .CountAsync(t => (t.Priority == "CRITICAL" || t.Priority == "HIGH") && 
                                    t.NextDueAt <= sevenDaysFromNow && 
                                    t.Status != "COMPLETED" && t.Status != "CANCELLED"),
                
                TotalScheduledToday = await _context.MaintenanceTasks
                    .CountAsync(t => t.NextDueAt.Date == reportDate && t.Status != "COMPLETED" && t.Status != "CANCELLED"),
                
                PendingDeferrals = await _context.MaintenanceTasks
                    .CountAsync(t => t.HasPendingDeferral)
            };

            var criticalTasks = await _context.MaintenanceTasks
                .Where(t => t.Priority == "CRITICAL" && t.Status == "OVERDUE")
                .Take(3)
                .Select(t => t.TaskDescription)
                .ToListAsync();
            
            if (criticalTasks.Any())
            {
                maintenanceSummary.CriticalMaintenanceNotes = string.Join("; ", criticalTasks.Select(t => t.Length > 50 ? t.Substring(0, 47) + "..." : t));
            }

            dto.MaintenanceSummary = maintenanceSummary;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not aggregate maintenance data for noon report");
        }

        // Aggregate Alarm data
        try
        {
            var yesterday = reportDate.AddDays(-1);

            var alarmSummary = new NoonReportAlarmSummaryDto
            {
                ActiveAlarms = await _context.SafetyAlarms
                    .CountAsync(a => !a.IsAcknowledged && !a.IsResolved),
                
                AcknowledgedAlarms = await _context.SafetyAlarms
                    .CountAsync(a => a.IsAcknowledged && !a.IsResolved),
                
                ResolvedLast24h = await _context.SafetyAlarms
                    .CountAsync(a => a.IsResolved && a.ResolvedAt >= yesterday),
                
                CriticalAlarms = await _context.SafetyAlarms
                    .CountAsync(a => a.Severity == "CRITICAL" && !a.IsResolved),
                
                WarningAlarms = await _context.SafetyAlarms
                    .CountAsync(a => a.Severity == "WARNING" && !a.IsResolved)
            };

            var recentCriticalAlarms = await _context.SafetyAlarms
                .Where(a => a.Severity == "CRITICAL" && !a.IsResolved)
                .Take(2)
                .Select(a => a.Description)
                .ToListAsync();
            
            if (recentCriticalAlarms.Any())
            {
                alarmSummary.SafetyNotes = string.Join("; ", recentCriticalAlarms.Select(m => m != null && m.Length > 50 ? m.Substring(0, 47) + "..." : m ?? ""));
            }

            dto.AlarmSummary = alarmSummary;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not aggregate alarm data for noon report");
        }

        return dto;
    }

    // ============================================================
    // DEPARTURE REPORT
    // ============================================================

    public async Task<(bool Success, string ReportNumber, Guid? ReportId, string? Error)> CreateDepartureReportAsync(
        CreateDepartureReportDto dto, string? username = null)
    {
        try
        {
            // Validate maritime business rules
            var (isValid, errors, warnings) = MaritimeValidationService.ValidateDepartureReport(dto);
            
            if (!isValid)
            {
                var errorMessage = string.Join("; ", errors);
                _logger.LogWarning("Departure report validation failed: {Errors}", errorMessage);
                return (false, string.Empty, null, errorMessage);
            }

            // Log warnings if any
            if (warnings.Any())
            {
                _logger.LogWarning("Departure report warnings: {Warnings}", string.Join("; ", warnings));
            }

            var reportType = await GetReportTypeByCodeAsync("DEPARTURE");

            if (reportType == null)
            {
                return (false, string.Empty, null, "Report type DEPARTURE not found");
            }

            // BUSINESS RULE: Check if voyage already has a departure report
            if (dto.VoyageId.HasValue)
            {
                var existingDeparture = await (
                    from mr in _context.MaritimeReports
                    join dr in _context.DepartureReports on mr.Id equals dr.MaritimeReportId
                    where dr.VoyageId == dto.VoyageId.Value 
                        && mr.DeletedAt == null
                    select mr
                ).AnyAsync();

                if (existingDeparture)
                {
                    return (false, string.Empty, null, 
                        $"Departure report already exists for voyage ID {dto.VoyageId}. Only one departure report per voyage is allowed.");
                }
            }

            var reportNumber = await GenerateReportNumberAsync("DEP");

            var maritimeReport = new MaritimeReport
            {
                ReportNumber = reportNumber,
                ReportTypeId = reportType.Id,
                ReportDateTime = dto.DepartureDateTime,
                VoyageId = dto.VoyageId,
                Status = "DRAFT",
                PreparedBy = username ?? dto.PreparedBy,
                ReportData = JsonSerializer.Serialize(dto),
                Remarks = dto.Remarks,
                IsTransmitted = false,
                IsSynced = false,
                CreatedAt = DateTime.UtcNow
            };

            var (_, depLegId) = await _voyageContext.ResolveActiveVoyageAsync(maritimeReport.ReportDateTime);
            maritimeReport.VoyagePlanLegId = depLegId;

            _context.MaritimeReports.Add(maritimeReport);
            await _context.SaveChangesAsync();

            var departureReport = new DepartureReport
            {
                MaritimeReportId = maritimeReport.Id,
                VoyageId = dto.VoyageId,
                PortName = dto.PortName,
                PortCode = dto.PortCode,
                DepartureDateTime = dto.DepartureDateTime,
                PilotOnBoardTime = dto.PilotOffTime,
                LastLineAshoreTime = dto.LastLineLetGoTime,
                DepartureLatitude = dto.DepartureLatitude,
                DepartureLongitude = dto.DepartureLongitude,
                DraftForward = dto.DraftForward,
                DraftAft = dto.DraftAft,
                DraftMidship = dto.DraftMidship,
                FuelOilROB = dto.FuelOilROB,
                DieselOilROB = dto.DieselOilROB,
                LubOilROB = dto.LubOilROB,
                FreshWaterROB = dto.FreshWaterROB,
                CargoOnBoard = dto.CargoOnBoard,
                CargoDescription = dto.CargoDescription,
                CrewOnBoard = dto.CrewOnBoard,
                PassengersOnBoard = dto.PassengersOnBoard,
                NextPort = dto.DestinationPort,
                NextPortCode = dto.NextPortCode,
                DistanceToNextPort = dto.DistanceToNextPort,
                EstimatedTimeOfArrival = dto.EstimatedArrival,
                Remarks = dto.Remarks,
                CreatedAt = DateTime.UtcNow
            };

            _context.DepartureReports.Add(departureReport);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Departure report created: {ReportNumber}", reportNumber);
            
            return (true, reportNumber, maritimeReport.Id, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating departure report");
            return (false, string.Empty, null, ex.Message);
        }
    }

    public async Task<DepartureReportDto?> GetDepartureReportAsync(Guid reportId)
    {
        var departureReport = await _context.DepartureReports
            .AsNoTracking()
            .Include(d => d.MaritimeReport)
            .FirstOrDefaultAsync(d => d.MaritimeReportId == reportId && d.MaritimeReport!.DeletedAt == null);

        if (departureReport == null)
            return null;

        return _mapper.Map<DepartureReportDto>(departureReport);
    }

    // ============================================================
    // ARRIVAL REPORT
    // ============================================================

    public async Task<(bool Success, string ReportNumber, Guid? ReportId, string? Error)> CreateArrivalReportAsync(
        CreateArrivalReportDto dto, string? username = null)
    {
        try
        {
            var reportType = await GetReportTypeByCodeAsync("ARRIVAL");

            if (reportType == null)
            {
                return (false, string.Empty, null, "Report type ARRIVAL not found");
            }

            // BUSINESS RULE: Check if voyage already has an arrival report
            if (dto.VoyageId.HasValue)
            {
                var existingArrival = await (
                    from mr in _context.MaritimeReports
                    join ar in _context.ArrivalReports on mr.Id equals ar.MaritimeReportId
                    where ar.VoyageId == dto.VoyageId.Value 
                        && mr.DeletedAt == null
                    select mr
                ).AnyAsync();

                if (existingArrival)
                {
                    return (false, string.Empty, null, 
                        $"Arrival report already exists for voyage ID {dto.VoyageId}. Only one arrival report per voyage is allowed.");
                }
            }

            var reportNumber = await GenerateReportNumberAsync("ARR");

            var maritimeReport = new MaritimeReport
            {
                ReportNumber = reportNumber,
                ReportTypeId = reportType.Id,
                ReportDateTime = dto.ArrivalDateTime,
                VoyageId = dto.VoyageId,
                Status = "DRAFT",
                PreparedBy = username ?? dto.PreparedBy,
                ReportData = JsonSerializer.Serialize(dto),
                Remarks = dto.Remarks,
                IsTransmitted = false,
                IsSynced = false,
                CreatedAt = DateTime.UtcNow
            };

            var (_, arrLegId) = await _voyageContext.ResolveActiveVoyageAsync(maritimeReport.ReportDateTime);
            maritimeReport.VoyagePlanLegId = arrLegId;

            _context.MaritimeReports.Add(maritimeReport);
            await _context.SaveChangesAsync();

            var arrivalReport = new ArrivalReport
            {
                MaritimeReportId = maritimeReport.Id,
                VoyageId = dto.VoyageId,
                PortName = dto.PortName,
                PortCode = dto.PortCode,
                ArrivalDateTime = dto.ArrivalDateTime,
                PilotOnBoardTime = dto.PilotOnBoardTime,
                FirstLineAshoreTime = dto.FirstLineAshoreTime,
                ArrivalLatitude = dto.ArrivalLatitude,
                ArrivalLongitude = dto.ArrivalLongitude,
                VoyageDistance = dto.VoyageDistance,
                VoyageDuration = dto.VoyageDuration,
                AverageSpeed = dto.AverageSpeed,
                DraftForward = dto.DraftForward,
                DraftAft = dto.DraftAft,
                DraftMidship = dto.DraftMidship,
                FuelOilROB = dto.FuelOilROB,
                DieselOilROB = dto.DieselOilROB,
                LubOilROB = dto.LubOilROB,
                FreshWaterROB = dto.FreshWaterROB,
                TotalFuelConsumed = dto.TotalFuelConsumed,
                TotalDieselConsumed = dto.TotalDieselConsumed,
                CargoOnBoard = dto.CargoOnBoard,
                CargoDescription = dto.CargoDescription,
                CrewOnBoard = dto.CrewOnBoard,
                PassengersOnBoard = dto.PassengersOnBoard,
                Remarks = dto.Remarks,
                CreatedAt = DateTime.UtcNow
            };

            _context.ArrivalReports.Add(arrivalReport);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Arrival report created: {ReportNumber}", reportNumber);
            
            return (true, reportNumber, maritimeReport.Id, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating arrival report");
            return (false, string.Empty, null, ex.Message);
        }
    }

    public async Task<ArrivalReportDto?> GetArrivalReportAsync(Guid reportId)
    {
        var arrivalReport = await _context.ArrivalReports
            .AsNoTracking()
            .Include(a => a.MaritimeReport)
            .FirstOrDefaultAsync(a => a.MaritimeReportId == reportId && a.MaritimeReport!.DeletedAt == null);

        if (arrivalReport == null)
            return null;

        return _mapper.Map<ArrivalReportDto>(arrivalReport);
    }

    // ============================================================
    // BUNKER REPORT
    // ============================================================

    public async Task<(bool Success, string ReportNumber, Guid? ReportId, string? Error)> CreateBunkerReportAsync(
        CreateBunkerReportDto dto, string? username = null)
    {
        try
        {
            // Validate maritime business rules (MARPOL Annex VI compliance)
            var (isValid, errors, warnings) = MaritimeValidationService.ValidateBunkerReport(dto);
            
            if (!isValid)
            {
                var errorMessage = string.Join("; ", errors);
                _logger.LogWarning("Bunker report validation failed: {Errors}", errorMessage);
                return (false, string.Empty, null, errorMessage);
            }

            // Log warnings if any (including MARPOL sulphur warnings)
            if (warnings.Any())
            {
                _logger.LogWarning("Bunker report warnings: {Warnings}", string.Join("; ", warnings));
            }

            var reportType = await GetReportTypeByCodeAsync("BUNKER");

            if (reportType == null)
            {
                return (false, string.Empty, null, "Report type BUNKER not found");
            }

            // BUSINESS RULE: Check for duplicate BDN Number (each BDN is unique per bunkering operation)
            if (!string.IsNullOrWhiteSpace(dto.BDNNumber))
            {
                var existingBunker = await (
                    from mr in _context.MaritimeReports
                    join br in _context.BunkerReports on mr.Id equals br.MaritimeReportId
                    where br.BDNNumber == dto.BDNNumber 
                        && mr.DeletedAt == null
                    select mr
                ).AnyAsync();

                if (existingBunker)
                {
                    return (false, string.Empty, null, 
                        $"Bunker report with BDN Number '{dto.BDNNumber}' already exists. Each BDN must be unique.");
                }
            }

            var reportNumber = await GenerateReportNumberAsync("BNK");

            var maritimeReport = new MaritimeReport
            {
                ReportNumber = reportNumber,
                ReportTypeId = reportType.Id,
                ReportDateTime = dto.BunkerDate,
                VoyageId = dto.VoyageId,
                Status = "DRAFT",
                PreparedBy = username ?? dto.PreparedBy,
                ReportData = JsonSerializer.Serialize(dto),
                Remarks = dto.Remarks,
                IsTransmitted = false,
                IsSynced = false,
                CreatedAt = DateTime.UtcNow
            };

            var (_, bnkLegId) = await _voyageContext.ResolveActiveVoyageAsync(maritimeReport.ReportDateTime);
            maritimeReport.VoyagePlanLegId = bnkLegId;

            _context.MaritimeReports.Add(maritimeReport);
            await _context.SaveChangesAsync();

            var bunkerReport = new BunkerReport
            {
                MaritimeReportId = maritimeReport.Id,
                BunkerDate = dto.BunkerDate,
                PortName = dto.PortName,
                PortCode = dto.PortCode,
                SupplierName = dto.SupplierName,
                BDNNumber = dto.BDNNumber,
                FuelType = dto.FuelType,
                FuelGrade = dto.FuelGrade,
                QuantityReceived = dto.QuantityReceived,
                Density = dto.Density,
                SulphurContent = dto.SulphurContent,
                Viscosity = dto.Viscosity,
                FlashPoint = dto.FlashPoint,
                ROBefore = dto.ROBBefore,
                ROBAfter = dto.ROBAfter,
                TanksLoaded = dto.TanksLoaded,
                SealNumbers = dto.SealNumbers,
                ChiefEngineerSignature = dto.ChiefEngineerSignature,
                Remarks = dto.Remarks,
                CreatedAt = DateTime.UtcNow
            };

            _context.BunkerReports.Add(bunkerReport);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Bunker report created: {ReportNumber}, BDN: {BDN}", reportNumber, dto.BDNNumber);
            
            return (true, reportNumber, maritimeReport.Id, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating bunker report");
            return (false, string.Empty, null, ex.Message);
        }
    }

    public async Task<BunkerReportDto?> GetBunkerReportAsync(Guid reportId)
    {
        var bunkerReport = await _context.BunkerReports
            .AsNoTracking()
            .Include(b => b.MaritimeReport)
            .FirstOrDefaultAsync(b => b.MaritimeReportId == reportId && b.MaritimeReport!.DeletedAt == null);

        if (bunkerReport == null)
            return null;

        var dto = _mapper.Map<BunkerReportDto>(bunkerReport);
        
        // Extract additional data from ReportData JSON if needed
        if (!string.IsNullOrWhiteSpace(bunkerReport.MaritimeReport!.ReportData))
        {
            try
            {
                var reportData = JsonSerializer.Deserialize<CreateBunkerReportDto>(bunkerReport.MaritimeReport.ReportData);
                if (reportData != null)
                {
                    dto.UnitPrice = reportData.UnitPrice;
                    dto.TotalCost = reportData.TotalCost;
                    dto.DeliveryMethod = reportData.DeliveryMethod;
                }
            }
            catch (JsonException ex)
            {
                _logger.LogWarning(ex, "Could not deserialize bunker report data for report {ReportId}", reportId);
            }
        }

        return dto;
    }

    // ============================================================
    // POSITION REPORT
    // ============================================================

    public async Task<(bool Success, string ReportNumber, Guid? ReportId, string? Error)> CreatePositionReportAsync(
        CreatePositionReportDto dto, string? username = null)
    {
        try
        {
            // Validate maritime business rules
            var (isValid, errors, warnings) = MaritimeValidationService.ValidatePositionReport(dto);
            
            if (!isValid)
            {
                var errorMessage = string.Join("; ", errors);
                _logger.LogWarning("Position report validation failed: {Errors}", errorMessage);
                return (false, string.Empty, null, errorMessage);
            }

            // Log warnings if any
            if (warnings.Any())
            {
                _logger.LogWarning("Position report warnings: {Warnings}", string.Join("; ", warnings));
            }

            var reportType = await GetReportTypeByCodeAsync("POSITION");

            if (reportType == null)
            {
                return (false, string.Empty, null, "Report type POSITION not found");
            }

            var reportNumber = await GenerateReportNumberAsync("POS");

            var maritimeReport = new MaritimeReport
            {
                ReportNumber = reportNumber,
                ReportTypeId = reportType.Id,
                ReportDateTime = dto.ReportDateTime,
                VoyageId = dto.VoyageId,
                Status = "DRAFT",
                PreparedBy = username ?? dto.PreparedBy,
                ReportData = JsonSerializer.Serialize(dto),
                Remarks = dto.Remarks,
                IsTransmitted = false,
                IsSynced = false,
                CreatedAt = DateTime.UtcNow
            };

            var (_, posLegId) = await _voyageContext.ResolveActiveVoyageAsync(maritimeReport.ReportDateTime);
            maritimeReport.VoyagePlanLegId = posLegId;

            _context.MaritimeReports.Add(maritimeReport);
            await _context.SaveChangesAsync();

            var positionReport = new PositionReport
            {
                MaritimeReportId = maritimeReport.Id,
                ReportDateTime = dto.ReportDateTime,
                Latitude = dto.Latitude,
                Longitude = dto.Longitude,
                CourseOverGround = dto.CourseOverGround,
                SpeedOverGround = dto.SpeedOverGround,
                ReportReason = dto.ReportReason,
                LastPort = dto.LastPort,
                NextPort = dto.NextPort,
                ETA = dto.ETA,
                CargoOnBoard = dto.CargoOnBoard,
                CrewOnBoard = dto.CrewOnBoard,
                Remarks = dto.Remarks,
                CreatedAt = DateTime.UtcNow
            };

            _context.PositionReports.Add(positionReport);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Position report created: {ReportNumber}, Reason: {Reason}", 
                reportNumber, dto.ReportReason);
            
            return (true, reportNumber, maritimeReport.Id, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating position report");
            return (false, string.Empty, null, ex.Message);
        }
    }

    public async Task<PositionReportDto?> GetPositionReportAsync(Guid reportId)
    {
        var positionReport = await _context.PositionReports
            .AsNoTracking()
            .Include(p => p.MaritimeReport)
            .FirstOrDefaultAsync(p => p.MaritimeReportId == reportId && p.MaritimeReport!.DeletedAt == null);

        if (positionReport == null)
            return null;

        return _mapper.Map<PositionReportDto>(positionReport);
    }

    // ============================================================
    // GENERIC REPORT ACCESS
    // ============================================================

    /// <summary>
    /// Get any report by ID, auto-detecting the report type
    /// Returns the appropriate DTO based on report type
    /// </summary>
    public async Task<object?> GetReportByIdAsync(Guid reportId)
    {
        // First, get the maritime report to determine the type
        var maritimeReport = await _context.MaritimeReports
            .AsNoTracking()
            .FirstOrDefaultAsync(mr => mr.Id == reportId && mr.DeletedAt == null);

        if (maritimeReport == null)
        {
            return null;
        }

        // Get the report type
        var reportType = await _context.ReportTypes
            .AsNoTracking()
            .FirstOrDefaultAsync(rt => rt.Id == maritimeReport.ReportTypeId);

        var typeCode = reportType?.TypeCode ?? "";

        // Based on type, get the specific report
        return typeCode switch
        {
            "NOON" => await GetNoonReportAsync(reportId),
            "DEPARTURE" => await GetDepartureReportAsync(reportId),
            "ARRIVAL" => await GetArrivalReportAsync(reportId),
            "BUNKER" => await GetBunkerReportAsync(reportId),
            "POSITION" => await GetPositionReportAsync(reportId),
            _ => new
            {
                Id = maritimeReport.Id,
                ReportNumber = maritimeReport.ReportNumber,
                ReportType = typeCode,
                Status = maritimeReport.Status,
                ReportDateTime = maritimeReport.ReportDateTime,
                PreparedBy = maritimeReport.PreparedBy,
                IsTransmitted = maritimeReport.IsTransmitted,
                CreatedAt = maritimeReport.CreatedAt,
                Error = $"Unknown report type: {typeCode}"
            }
        };
    }

    // ============================================================
    // REPORT LISTING (High Performance with Pagination)
    // ============================================================

    public async Task<PaginatedReportResponseDto<ReportSummaryDto>> GetReportsAsync(ReportPaginationDto pagination)
    {
        var query = from mr in _context.MaritimeReports.AsNoTracking()
                    join rt in _context.ReportTypes.AsNoTracking() on mr.ReportTypeId equals rt.Id
                    join vr in _context.VoyageRecords.AsNoTracking() on mr.VoyageId equals vr.Id into voyageJoin
                    from vr in voyageJoin.DefaultIfEmpty()
                    where mr.DeletedAt == null  // Exclude soft-deleted reports
                    select new { mr, rt, vr };

        // Filters
        if (!string.IsNullOrEmpty(pagination.Status))
        {
            query = query.Where(x => x.mr.Status == pagination.Status);
        }

        if (pagination.ReportTypeId.HasValue)
        {
            query = query.Where(x => x.mr.ReportTypeId == pagination.ReportTypeId.Value);
        }

        if (!string.IsNullOrWhiteSpace(pagination.ReportTypeCode))
        {
            var reportTypeCode = pagination.ReportTypeCode.Trim().ToUpperInvariant();
            query = query.Where(x => x.rt.TypeCode == reportTypeCode);
        }

        if (pagination.FromDate.HasValue)
        {
            query = query.Where(x => x.mr.ReportDateTime >= pagination.FromDate.Value);
        }

        if (pagination.ToDate.HasValue)
        {
            query = query.Where(x => x.mr.ReportDateTime <= pagination.ToDate.Value);
        }

        if (pagination.VoyageId.HasValue)
        {
            query = query.Where(x => x.mr.VoyageId == pagination.VoyageId.Value);
        }

        if (!string.IsNullOrWhiteSpace(pagination.SearchTerm))
        {
            var searchTerm = pagination.SearchTerm.Trim().ToLowerInvariant();

            query = query.Where(x =>
                x.mr.ReportNumber.ToLower().Contains(searchTerm) ||
                x.rt.TypeName.ToLower().Contains(searchTerm) ||
                x.rt.TypeCode.ToLower().Contains(searchTerm) ||
                (x.mr.PreparedBy != null && x.mr.PreparedBy.ToLower().Contains(searchTerm)) ||
                (x.mr.MasterSignature != null && x.mr.MasterSignature.ToLower().Contains(searchTerm)) ||
                (x.mr.Remarks != null && x.mr.Remarks.ToLower().Contains(searchTerm)) ||
                (x.vr != null && x.vr.VoyageNumber != null && x.vr.VoyageNumber.ToLower().Contains(searchTerm)));
        }

        // Total count
        var totalRecords = await query.CountAsync();

        // Paginated data
        var reports = await query
            .OrderByDescending(x => x.mr.ReportDateTime)
            .Skip((pagination.Page - 1) * pagination.PageSize)
            .Take(pagination.PageSize)
            .Select(x => new ReportSummaryDto
            {
                Id = x.mr.Id,
                ReportNumber = x.mr.ReportNumber,
                ReportTypeId = x.rt.Id,
                ReportTypeName = x.rt.TypeName,
                ReportTypeCode = x.rt.TypeCode,
                ReportDateTime = x.mr.ReportDateTime,
                Status = x.mr.Status,
                VoyageId = x.mr.VoyageId,
                VoyagePlanLegId = x.mr.VoyagePlanLegId,
                VoyageNumber = x.vr != null ? x.vr.VoyageNumber : null,
                PreparedBy = x.mr.PreparedBy,
                MasterSignature = x.mr.MasterSignature,
                SignedAt = x.mr.SignedAt,
                IsTransmitted = x.mr.IsTransmitted,
                TransmittedAt = x.mr.TransmittedAt,
                CreatedAt = x.mr.CreatedAt
            })
            .ToListAsync();

        return new PaginatedReportResponseDto<ReportSummaryDto>
        {
            Data = reports,
            TotalRecords = totalRecords,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    // ============================================================
    // WORKFLOW OPERATIONS
    // ============================================================

    public async Task<(bool Success, string? Error)> SubmitReportAsync(Guid reportId, string? username = null)
    {
        try
        {
            var report = await _context.MaritimeReports.FindAsync(reportId);
            if (report == null)
            {
                return (false, "Report not found");
            }

            // Check if report is soft-deleted
            if (report.DeletedAt.HasValue)
            {
                return (false, "Cannot submit deleted report");
            }

            if (report.Status != "DRAFT")
            {
                return (false, $"Cannot submit report with status {report.Status}");
            }

            var oldStatus = report.Status;
            report.Status = "SUBMITTED";
            report.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            
            // Track workflow change for audit trail
            await TrackWorkflowChangeAsync(
                reportId, 
                oldStatus, 
                "SUBMITTED", 
                ResolveWorkflowActor(username, report.PreparedBy),
                "Report submitted for approval");
            
            _logger.LogInformation("Report {ReportNumber} submitted", report.ReportNumber);
            
            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error submitting report {ReportId}", reportId);
            return (false, ex.Message);
        }
    }

    public async Task<(bool Success, string? Error)> ApproveReportAsync(Guid reportId, ApproveReportDto dto, string? username = null)
    {
        try
        {
            var report = await _context.MaritimeReports
                .FirstOrDefaultAsync(r => r.Id == reportId);
                
            if (report == null)
            {
                return (false, "Report not found");
            }

            // Check if report is soft-deleted
            if (report.DeletedAt.HasValue)
            {
                return (false, "Cannot approve deleted report");
            }

            if (report.Status != "SUBMITTED")
            {
                return (false, $"Cannot approve report with status {report.Status}. Must be SUBMITTED.");
            }

            // Enhanced validation: Check if Master signature is required
            var reportType = await _context.ReportTypes
                .AsNoTracking()
                .FirstOrDefaultAsync(rt => rt.Id == report.ReportTypeId);
                
            if (reportType != null && reportType.RequiresMasterSignature)
            {
                if (string.IsNullOrWhiteSpace(dto.MasterSignature))
                {
                    return (false, $"Master signature is required for {reportType.TypeName}");
                }
            }

            // Validate report datetime is not in future
            if (report.ReportDateTime > DateTime.UtcNow)
            {
                return (false, "Cannot approve report with future date/time");
            }

            var oldStatus = report.Status;
            report.Status = "APPROVED";
            report.MasterSignature = dto.MasterSignature;
            report.SignedAt = DateTime.UtcNow;
            report.UpdatedAt = DateTime.UtcNow;

            if (!string.IsNullOrEmpty(dto.ApprovalRemarks))
            {
                report.Remarks = (report.Remarks ?? "") + "\n[APPROVAL] " + dto.ApprovalRemarks;
            }

            await _context.SaveChangesAsync();
            
            // Track workflow change for audit trail
            await TrackWorkflowChangeAsync(
                reportId, 
                oldStatus, 
                "APPROVED", 
                ResolveWorkflowActor(username, dto.MasterSignature),
                dto.ApprovalRemarks);
            
            _logger.LogInformation("Report {ReportNumber} approved by {Master}", 
                report.ReportNumber, dto.MasterSignature);
            
            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error approving report {ReportId}", reportId);
            return (false, ex.Message);
        }
    }

    public async Task<(bool Success, string? Error)> RejectReportAsync(Guid reportId, string reason, string? username = null)
    {
        try
        {
            var report = await _context.MaritimeReports.FindAsync(reportId);
            if (report == null)
            {
                return (false, "Report not found");
            }

            // Check if report is soft-deleted
            if (report.DeletedAt.HasValue)
            {
                return (false, "Cannot reject deleted report");
            }

            if (report.Status != "SUBMITTED")
            {
                return (false, $"Cannot reject report with status {report.Status}");
            }

            var oldStatus = report.Status;
            report.Status = "REJECTED";
            report.Remarks = (report.Remarks ?? "") + "\n[REJECTED] " + reason;
            report.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            
            // Track workflow change for audit trail
            await TrackWorkflowChangeAsync(
                reportId, 
                oldStatus, 
                "REJECTED", 
                ResolveWorkflowActor(username, report.MasterSignature ?? report.PreparedBy),
                reason);
            
            _logger.LogWarning("Report {ReportNumber} rejected: {Reason}", report.ReportNumber, reason);
            
            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error rejecting report {ReportId}", reportId);
            return (false, ex.Message);
        }
    }

    public async Task<(bool Success, string? Error)> ReopenRejectedReportAsync(
        Guid reportId, string reopenedBy, string corrections)
    {
        try
        {
            var report = await _context.MaritimeReports.FindAsync(reportId);
            if (report == null)
            {
                return (false, "Report not found");
            }

            // Check if report is soft-deleted
            if (report.DeletedAt.HasValue)
            {
                return (false, "Cannot reopen deleted report");
            }

            // Only REJECTED reports can be reopened
            if (report.Status != "REJECTED")
            {
                return (false, $"Only rejected reports can be reopened. Current status: {report.Status}");
            }

            var oldStatus = report.Status;
            report.Status = "DRAFT";
            report.Remarks = (report.Remarks ?? "") + 
                $"\n[REOPENED {DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC by {reopenedBy}] Corrections to be made: {corrections}";
            report.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            
            // Track workflow change for audit trail
            await TrackWorkflowChangeAsync(
                reportId, 
                oldStatus, 
                "DRAFT", 
                reopenedBy,
                $"Reopened after rejection. Corrections: {corrections}");
            
            _logger.LogInformation(
                "Report {ReportNumber} reopened by {User} for corrections: {Corrections}", 
                report.ReportNumber, reopenedBy, corrections);
            
            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reopening report {ReportId}", reportId);
            return (false, ex.Message);
        }
    }

    public async Task<(bool Success, string? Error)> UpdateDraftReportAsync(
        Guid reportId, Dictionary<string, object> updates)
    {
        try
        {
            var report = await _context.MaritimeReports.FindAsync(reportId);
            if (report == null)
            {
                return (false, "Report not found");
            }

            // Only DRAFT reports can be edited
            if (report.Status != "DRAFT")
            {
                return (false, $"Cannot edit report with status {report.Status}. Only DRAFT reports can be edited.");
            }

            // Update ReportData JSON
            var currentData = string.IsNullOrEmpty(report.ReportData) 
                ? new Dictionary<string, object>() 
                : System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, object>>(report.ReportData);

            if (currentData != null)
            {
                foreach (var kvp in updates)
                {
                    currentData[kvp.Key] = kvp.Value;
                }

                report.ReportData = System.Text.Json.JsonSerializer.Serialize(currentData);
                report.UpdatedAt = DateTime.UtcNow;
                report.Remarks = (report.Remarks ?? "") + 
                    $"\n[UPDATED {DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC] Draft modified";

                await _context.SaveChangesAsync();
                
                _logger.LogInformation(
                    "Draft report {ReportNumber} updated with {Count} field(s)", 
                    report.ReportNumber, updates.Count);
            }
            
            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating draft report {ReportId}", reportId);
            return (false, ex.Message);
        }
    }

    public async Task<(bool Success, string? Error)> UpdateFullNoonReportAsync(
        Guid reportId, CreateNoonReportDto dto, string? username = null)
    {
        try
        {
            // Get maritime report
            var maritimeReport = await _context.MaritimeReports.FindAsync(reportId);
            if (maritimeReport == null)
            {
                return (false, "Report not found");
            }

            // Only DRAFT reports can be fully updated
            if (maritimeReport.Status != "DRAFT")
            {
                return (false, $"Cannot update report with status {maritimeReport.Status}. Only DRAFT reports can be edited.");
            }

            // Validate maritime business rules
            var (isValid, errors, warnings) = MaritimeValidationService.ValidateNoonReport(dto);
            
            if (!isValid)
            {
                var errorMessage = string.Join("; ", errors);
                _logger.LogWarning("Noon report update validation failed: {Errors}", errorMessage);
                return (false, errorMessage);
            }

            // Log warnings if any
            if (warnings.Any())
            {
                _logger.LogWarning("Noon report update warnings: {Warnings}", string.Join("; ", warnings));
            }

            // Get existing noon report
            var noonReport = await _context.NoonReports
                .FirstOrDefaultAsync(nr => nr.MaritimeReportId == reportId);

            if (noonReport == null)
            {
                return (false, "Noon report data not found");
            }

            // Update noon report required fields
            noonReport.ReportDate = dto.ReportDate;

            // Update noon report nullable fields - only if provided
            if (dto.Latitude.HasValue) noonReport.Latitude = dto.Latitude;
            if (dto.Longitude.HasValue) noonReport.Longitude = dto.Longitude;
            if (dto.CourseOverGround.HasValue) noonReport.CourseOverGround = dto.CourseOverGround;
            if (dto.SpeedOverGround.HasValue) noonReport.SpeedOverGround = dto.SpeedOverGround;
            if (dto.WeatherConditions != null) noonReport.WeatherConditions = dto.WeatherConditions;
            if (dto.WindDirection != null) noonReport.WindDirection = dto.WindDirection;
            if (dto.WindSpeed.HasValue) noonReport.WindSpeed = dto.WindSpeed;
            if (dto.SeaState != null) noonReport.SeaState = dto.SeaState;
            if (dto.Visibility != null) noonReport.Visibility = dto.Visibility;
            if (dto.AirTemperature.HasValue) noonReport.AirTemperature = dto.AirTemperature;
            if (dto.SeaTemperature.HasValue) noonReport.SeaTemperature = dto.SeaTemperature;
            if (dto.BarometricPressure.HasValue) noonReport.BarometricPressure = dto.BarometricPressure;
            if (dto.DistanceTraveled.HasValue) noonReport.DistanceTraveled = dto.DistanceTraveled;
            if (dto.DistanceToGo.HasValue) noonReport.DistanceToGo = dto.DistanceToGo;
            if (dto.FuelOilROB.HasValue) noonReport.FuelOilROB = dto.FuelOilROB;
            if (dto.DieselOilROB.HasValue) noonReport.DieselOilROB = dto.DieselOilROB;
            if (dto.FuelOilConsumed.HasValue) noonReport.FuelOilConsumed = dto.FuelOilConsumed;
            if (dto.DieselOilConsumed.HasValue) noonReport.DieselOilConsumed = dto.DieselOilConsumed;
            if (dto.MainEngineRunningHours != null) noonReport.MainEngineRunningHours = dto.MainEngineRunningHours;
            if (dto.AuxEngineRunningHours != null) noonReport.AuxEngineRunningHours = dto.AuxEngineRunningHours;
            if (dto.CargoOnBoard.HasValue) noonReport.CargoOnBoard = dto.CargoOnBoard;
            if (dto.GeneralRemarks != null) noonReport.OperationalRemarks = dto.GeneralRemarks;

            // Update maritime report fields
            maritimeReport.ReportDateTime = dto.ReportDate;
            maritimeReport.VoyageId = dto.VoyageId;
            maritimeReport.PreparedBy = username ?? dto.PreparedBy;
            maritimeReport.ReportData = JsonSerializer.Serialize(dto);
            maritimeReport.UpdatedAt = DateTime.UtcNow;
            
            // Update remarks with warnings
            var remarks = dto.GeneralRemarks;
            if (warnings.Any())
            {
                remarks = $"[VALIDATION WARNINGS]\n{string.Join("\n", warnings)}\n\n{remarks}";
            }
            maritimeReport.Remarks = remarks;

            await _context.SaveChangesAsync();
            
            _logger.LogInformation(
                "Noon report {ReportNumber} fully updated by {User}", 
                maritimeReport.ReportNumber, username ?? "System");
            
            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating full noon report {ReportId}", reportId);
            return (false, ex.Message);
        }
    }

    public async Task<(bool Success, string? Error)> UpdateFullDepartureReportAsync(
        Guid reportId, CreateDepartureReportDto dto, string? username = null)
    {
        try
        {
            var maritimeReport = await _context.MaritimeReports.FindAsync(reportId);
            if (maritimeReport == null)
            {
                return (false, "Report not found");
            }

            if (maritimeReport.Status != "DRAFT")
            {
                return (false, $"Cannot update report with status {maritimeReport.Status}. Only DRAFT reports can be edited.");
            }

            var (isValid, errors, warnings) = MaritimeValidationService.ValidateDepartureReport(dto);
            if (!isValid)
            {
                return (false, string.Join("; ", errors));
            }

            var departureReport = await _context.DepartureReports.FirstOrDefaultAsync(dr => dr.MaritimeReportId == reportId);
            if (departureReport == null)
            {
                return (false, "Departure report data not found");
            }

            departureReport.VoyageId = dto.VoyageId;
            departureReport.PortName = dto.PortName;
            departureReport.PortCode = dto.PortCode;
            departureReport.DepartureDateTime = dto.DepartureDateTime;
            departureReport.PilotOnBoardTime = dto.PilotOffTime;
            departureReport.LastLineAshoreTime = dto.LastLineLetGoTime;
            departureReport.DepartureLatitude = dto.DepartureLatitude;
            departureReport.DepartureLongitude = dto.DepartureLongitude;
            departureReport.DraftForward = dto.DraftForward;
            departureReport.DraftAft = dto.DraftAft;
            departureReport.DraftMidship = dto.DraftMidship;
            departureReport.FuelOilROB = dto.FuelOilROB;
            departureReport.DieselOilROB = dto.DieselOilROB;
            departureReport.LubOilROB = dto.LubOilROB;
            departureReport.FreshWaterROB = dto.FreshWaterROB;
            departureReport.CargoOnBoard = dto.CargoOnBoard;
            departureReport.CargoDescription = dto.CargoDescription;
            departureReport.CrewOnBoard = dto.CrewOnBoard;
            departureReport.PassengersOnBoard = dto.PassengersOnBoard;
            departureReport.NextPort = dto.DestinationPort;
            departureReport.NextPortCode = dto.NextPortCode;
            departureReport.DistanceToNextPort = dto.DistanceToNextPort;
            departureReport.EstimatedTimeOfArrival = dto.EstimatedArrival;
            departureReport.Remarks = dto.Remarks;

            maritimeReport.ReportDateTime = dto.DepartureDateTime;
            maritimeReport.VoyageId = dto.VoyageId;
            maritimeReport.PreparedBy = username ?? dto.PreparedBy;
            maritimeReport.ReportData = JsonSerializer.Serialize(dto);
            maritimeReport.UpdatedAt = DateTime.UtcNow;
            maritimeReport.Remarks = warnings.Any()
                ? $"[VALIDATION WARNINGS]\n{string.Join("\n", warnings)}\n\n{dto.Remarks}"
                : dto.Remarks;

            await _context.SaveChangesAsync();
            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating full departure report {ReportId}", reportId);
            return (false, ex.Message);
        }
    }

    public async Task<(bool Success, string? Error)> UpdateFullArrivalReportAsync(
        Guid reportId, CreateArrivalReportDto dto, string? username = null)
    {
        try
        {
            var maritimeReport = await _context.MaritimeReports.FindAsync(reportId);
            if (maritimeReport == null)
            {
                return (false, "Report not found");
            }

            if (maritimeReport.Status != "DRAFT")
            {
                return (false, $"Cannot update report with status {maritimeReport.Status}. Only DRAFT reports can be edited.");
            }

            var arrivalReport = await _context.ArrivalReports.FirstOrDefaultAsync(ar => ar.MaritimeReportId == reportId);
            if (arrivalReport == null)
            {
                return (false, "Arrival report data not found");
            }

            arrivalReport.VoyageId = dto.VoyageId;
            arrivalReport.PortName = dto.PortName;
            arrivalReport.PortCode = dto.PortCode;
            arrivalReport.ArrivalDateTime = dto.ArrivalDateTime;
            arrivalReport.PilotOnBoardTime = dto.PilotOnBoardTime;
            arrivalReport.FirstLineAshoreTime = dto.FirstLineAshoreTime;
            arrivalReport.ArrivalLatitude = dto.ArrivalLatitude;
            arrivalReport.ArrivalLongitude = dto.ArrivalLongitude;
            arrivalReport.VoyageDistance = dto.VoyageDistance;
            arrivalReport.VoyageDuration = dto.VoyageDuration;
            arrivalReport.AverageSpeed = dto.AverageSpeed;
            arrivalReport.DraftForward = dto.DraftForward;
            arrivalReport.DraftAft = dto.DraftAft;
            arrivalReport.DraftMidship = dto.DraftMidship;
            arrivalReport.FuelOilROB = dto.FuelOilROB;
            arrivalReport.DieselOilROB = dto.DieselOilROB;
            arrivalReport.LubOilROB = dto.LubOilROB;
            arrivalReport.FreshWaterROB = dto.FreshWaterROB;
            arrivalReport.TotalFuelConsumed = dto.TotalFuelConsumed;
            arrivalReport.TotalDieselConsumed = dto.TotalDieselConsumed;
            arrivalReport.CargoOnBoard = dto.CargoOnBoard;
            arrivalReport.CargoDescription = dto.CargoDescription;
            arrivalReport.CrewOnBoard = dto.CrewOnBoard;
            arrivalReport.PassengersOnBoard = dto.PassengersOnBoard;
            arrivalReport.Remarks = dto.Remarks;

            maritimeReport.ReportDateTime = dto.ArrivalDateTime;
            maritimeReport.VoyageId = dto.VoyageId;
            maritimeReport.PreparedBy = username ?? dto.PreparedBy;
            maritimeReport.ReportData = JsonSerializer.Serialize(dto);
            maritimeReport.UpdatedAt = DateTime.UtcNow;
            maritimeReport.Remarks = dto.Remarks;

            await _context.SaveChangesAsync();
            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating full arrival report {ReportId}", reportId);
            return (false, ex.Message);
        }
    }

    public async Task<(bool Success, string? Error)> UpdateFullBunkerReportAsync(
        Guid reportId, CreateBunkerReportDto dto, string? username = null)
    {
        try
        {
            var maritimeReport = await _context.MaritimeReports.FindAsync(reportId);
            if (maritimeReport == null)
            {
                return (false, "Report not found");
            }

            if (maritimeReport.Status != "DRAFT")
            {
                return (false, $"Cannot update report with status {maritimeReport.Status}. Only DRAFT reports can be edited.");
            }

            var (isValid, errors, warnings) = MaritimeValidationService.ValidateBunkerReport(dto);
            if (!isValid)
            {
                return (false, string.Join("; ", errors));
            }

            var bunkerReport = await _context.BunkerReports.FirstOrDefaultAsync(br => br.MaritimeReportId == reportId);
            if (bunkerReport == null)
            {
                return (false, "Bunker report data not found");
            }

            bunkerReport.BunkerDate = dto.BunkerDate;
            bunkerReport.PortName = dto.PortName;
            bunkerReport.PortCode = dto.PortCode;
            bunkerReport.SupplierName = dto.SupplierName;
            bunkerReport.BDNNumber = dto.BDNNumber;
            bunkerReport.FuelType = dto.FuelType;
            bunkerReport.FuelGrade = dto.FuelGrade;
            bunkerReport.QuantityReceived = dto.QuantityReceived;
            bunkerReport.Density = dto.Density;
            bunkerReport.SulphurContent = dto.SulphurContent;
            bunkerReport.Viscosity = dto.Viscosity;
            bunkerReport.FlashPoint = dto.FlashPoint;
            bunkerReport.ROBefore = dto.ROBBefore;
            bunkerReport.ROBAfter = dto.ROBAfter;
            bunkerReport.TanksLoaded = dto.TanksLoaded;
            bunkerReport.SealNumbers = dto.SealNumbers;
            bunkerReport.ChiefEngineerSignature = dto.ChiefEngineerSignature;
            bunkerReport.Remarks = dto.Remarks;

            maritimeReport.ReportDateTime = dto.BunkerDate;
            maritimeReport.VoyageId = dto.VoyageId;
            maritimeReport.PreparedBy = username ?? dto.PreparedBy;
            maritimeReport.ReportData = JsonSerializer.Serialize(dto);
            maritimeReport.UpdatedAt = DateTime.UtcNow;
            maritimeReport.Remarks = warnings.Any()
                ? $"[VALIDATION WARNINGS]\n{string.Join("\n", warnings)}\n\n{dto.Remarks}"
                : dto.Remarks;

            await _context.SaveChangesAsync();
            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating full bunker report {ReportId}", reportId);
            return (false, ex.Message);
        }
    }

    public async Task<(bool Success, string? Error)> UpdateFullPositionReportAsync(
        Guid reportId, CreatePositionReportDto dto, string? username = null)
    {
        try
        {
            var maritimeReport = await _context.MaritimeReports.FindAsync(reportId);
            if (maritimeReport == null)
            {
                return (false, "Report not found");
            }

            if (maritimeReport.Status != "DRAFT")
            {
                return (false, $"Cannot update report with status {maritimeReport.Status}. Only DRAFT reports can be edited.");
            }

            var (isValid, errors, warnings) = MaritimeValidationService.ValidatePositionReport(dto);
            if (!isValid)
            {
                return (false, string.Join("; ", errors));
            }

            var positionReport = await _context.PositionReports.FirstOrDefaultAsync(pr => pr.MaritimeReportId == reportId);
            if (positionReport == null)
            {
                return (false, "Position report data not found");
            }

            positionReport.ReportDateTime = dto.ReportDateTime;
            positionReport.Latitude = dto.Latitude;
            positionReport.Longitude = dto.Longitude;
            positionReport.CourseOverGround = dto.CourseOverGround;
            positionReport.SpeedOverGround = dto.SpeedOverGround;
            positionReport.ReportReason = dto.ReportReason;
            positionReport.LastPort = dto.LastPort;
            positionReport.NextPort = dto.NextPort;
            positionReport.ETA = dto.ETA;
            positionReport.CargoOnBoard = dto.CargoOnBoard;
            positionReport.CrewOnBoard = dto.CrewOnBoard;
            positionReport.Remarks = dto.Remarks;

            maritimeReport.ReportDateTime = dto.ReportDateTime;
            maritimeReport.VoyageId = dto.VoyageId;
            maritimeReport.PreparedBy = username ?? dto.PreparedBy;
            maritimeReport.ReportData = JsonSerializer.Serialize(dto);
            maritimeReport.UpdatedAt = DateTime.UtcNow;
            maritimeReport.Remarks = warnings.Any()
                ? $"[VALIDATION WARNINGS]\n{string.Join("\n", warnings)}\n\n{dto.Remarks}"
                : dto.Remarks;

            await _context.SaveChangesAsync();
            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating full position report {ReportId}", reportId);
            return (false, ex.Message);
        }
    }

    // ============================================================
    // TRANSMISSION — Send report directly to Shore via HTTP
    // ============================================================

    private static readonly JsonSerializerOptions _syncJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false
    };

    public async Task<(bool Success, string? Error)> TransmitReportAsync(Guid reportId, TransmitReportDto dto, string? username = null)
    {
        try
        {
            var report = await _context.MaritimeReports.FindAsync(reportId);
            if (report == null)
            {
                return (false, "Report not found");
            }

            if (report.DeletedAt.HasValue)
            {
                return (false, "Cannot transmit deleted report");
            }

            if (report.Status != "APPROVED")
            {
                return (false, $"Cannot transmit report with status {report.Status}. Must be APPROVED.");
            }

            // Set status to TRANSMITTED BEFORE building sync items,
            // so the payload sent to shore already carries the final status.
            // (Reports are excluded from auto-sync, so this is the only chance
            // for shore to receive the TRANSMITTED status.)
            var oldStatus = report.Status;
            report.Status = "TRANSMITTED";
            report.IsTransmitted = true;
            report.TransmittedAt = DateTime.UtcNow;
            report.UpdatedAt = DateTime.UtcNow;

            // Build sync items for the report (parent + child)
            var syncItems = await BuildReportSyncItemsAsync(report);

            // Persist the complete report and queue together; the signed worker confirms delivery.
            var log = new ReportTransmissionLog
            {
                MaritimeReportId = reportId, TransmissionDateTime = DateTime.UtcNow,
                TransmissionMethod = dto.TransmissionMethod, Status = "QUEUED",
                Recipients = string.Join(";", dto.RecipientEmails ?? new List<string>())
            };
            var queued = syncItems.Select(item => new SyncQueue
            {
                TableName = item.TableName, RecordKey = item.RecordKey,
                ActionType = Maritime.Shared.Models.Sync.SyncActionType.SNAPSHOT, Payload = item.Payload,
                Priority = Maritime.Shared.Models.Sync.SyncPriority.Operational, CreatedAt = DateTime.UtcNow
            }).ToList();
            log.SyncEventIdsJson = JsonSerializer.Serialize(queued.Select(item => item.EventId));
            _context.ReportTransmissionLogs.Add(log);
            _context.SyncQueue.AddRange(queued);

            await _context.SaveChangesAsync();

            await TrackWorkflowChangeAsync(
                reportId,
                oldStatus,
                "TRANSMITTED",
                ResolveWorkflowActor(username, report.MasterSignature ?? report.PreparedBy),
                "Queued for Shore delivery through durable sync");

            _logger.LogInformation("Report {ReportNumber} queued for Shore delivery", report.ReportNumber);
            return (true, "Report queued for background delivery to Shore.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error transmitting report {ReportId}", reportId);
            return (false, ex.Message);
        }
    }

    /// <summary>
    /// Resolve the provisioned identity used in report queue payloads.
    /// </summary>
    private async Task<string> ResolveNodeIdAsync()
    {
        try
        {
            var syncConfig = await _runtimeConfigService.GetSyncConfigAsync();
            return syncConfig?.NodeId ?? "UNKNOWN";
        }
        catch (ProvisioningRequiredException ex)
        {
            _logger.LogWarning("BuildReportSyncItemsAsync: NodeId unavailable — {Message}", ex.Message);
            return "UNKNOWN";
        }
        catch (ConfigInvalidException ex)
        {
            _logger.LogError("BuildReportSyncItemsAsync: NodeId unavailable — {Message}", ex.Message);
            return "UNKNOWN";
        }
    }

    /// <summary>
    /// Enrich NoonReport entity with PMS/Alarm/Crew snapshot data before syncing to shore.
    /// This stores computed summaries as JSON so they persist in the NoonReport record.
    /// </summary>
    private async Task EnrichNoonReportForSyncAsync(NoonReport noon)
    {
        var reportDate = noon.ReportDate;

        // --- Crew data ---
        try
        {
            var onboardCrewIds = await _context.CrewMembers
                .Where(c => c.IsOnboard)
                .Select(c => c.Id)
                .ToListAsync();

            noon.CrewOnBoard = onboardCrewIds.Count;

            var thirtyDaysFromNow = reportDate.AddDays(30);
            noon.CertificatesExpiringSoon = await _context.CrewCertificates
                .Where(cc => onboardCrewIds.Contains(cc.CrewMemberId) &&
                             cc.ExpiryDate <= thirtyDaysFromNow)
                .CountAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not enrich crew data for noon report sync");
        }

        // --- Maintenance/PMS summary ---
        try
        {
            var yesterday = reportDate.AddDays(-1);
            var sevenDaysFromNow = reportDate.AddDays(7);

            var summary = new NoonReportMaintenanceSummaryDto
            {
                TasksCompletedLast24h = await _context.MaintenanceTasks
                    .CountAsync(t => t.Status == "COMPLETED" && t.CompletedAt >= yesterday && t.CompletedAt <= reportDate.AddDays(1)),
                TasksInProgress = await _context.MaintenanceTasks
                    .CountAsync(t => t.Status == "IN_PROGRESS"),
                OverdueTasks = await _context.MaintenanceTasks
                    .CountAsync(t => t.Status == "OVERDUE" || (t.NextDueAt < reportDate && t.Status != "COMPLETED" && t.Status != "CANCELLED")),
                CriticalTasksDueSoon = await _context.MaintenanceTasks
                    .CountAsync(t => (t.Priority == "CRITICAL" || t.Priority == "HIGH") &&
                                    t.NextDueAt <= sevenDaysFromNow &&
                                    t.Status != "COMPLETED" && t.Status != "CANCELLED"),
                TotalScheduledToday = await _context.MaintenanceTasks
                    .CountAsync(t => t.NextDueAt.Date == reportDate && t.Status != "COMPLETED" && t.Status != "CANCELLED"),
                PendingDeferrals = await _context.MaintenanceTasks
                    .CountAsync(t => t.HasPendingDeferral)
            };

            var criticalTasks = await _context.MaintenanceTasks
                .Where(t => t.Priority == "CRITICAL" && t.Status == "OVERDUE")
                .Take(3)
                .Select(t => t.TaskDescription)
                .ToListAsync();
            if (criticalTasks.Any())
                summary.CriticalMaintenanceNotes = string.Join("; ", criticalTasks.Select(t => t.Length > 50 ? t.Substring(0, 47) + "..." : t));

            noon.MaintenanceSummaryJson = JsonSerializer.Serialize(summary, _syncJsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not enrich maintenance data for noon report sync");
        }

        // --- Alarm summary ---
        try
        {
            var yesterday = reportDate.AddDays(-1);

            var alarmSummary = new NoonReportAlarmSummaryDto
            {
                ActiveAlarms = await _context.SafetyAlarms
                    .CountAsync(a => !a.IsAcknowledged && !a.IsResolved),
                AcknowledgedAlarms = await _context.SafetyAlarms
                    .CountAsync(a => a.IsAcknowledged && !a.IsResolved),
                ResolvedLast24h = await _context.SafetyAlarms
                    .CountAsync(a => a.IsResolved && a.ResolvedAt >= yesterday),
                CriticalAlarms = await _context.SafetyAlarms
                    .CountAsync(a => a.Severity == "CRITICAL" && !a.IsResolved),
                WarningAlarms = await _context.SafetyAlarms
                    .CountAsync(a => a.Severity == "WARNING" && !a.IsResolved)
            };

            var recentCriticalAlarms = await _context.SafetyAlarms
                .Where(a => a.Severity == "CRITICAL" && !a.IsResolved)
                .Take(2)
                .Select(a => a.Description)
                .ToListAsync();
            if (recentCriticalAlarms.Any())
                alarmSummary.SafetyNotes = string.Join("; ", recentCriticalAlarms.Select(m => m != null && m.Length > 50 ? m.Substring(0, 47) + "..." : m ?? ""));

            noon.AlarmSummaryJson = JsonSerializer.Serialize(alarmSummary, _syncJsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not enrich alarm data for noon report sync");
        }
    }

    /// <summary>
    /// Build SyncQueueItemDto list for a report (parent MaritimeReport + child report).
    /// </summary>
    private async Task<List<Maritime.Shared.DTOs.Sync.SyncQueueItemDto>> BuildReportSyncItemsAsync(MaritimeReport report)
    {
        var nodeId = await ResolveNodeIdAsync();
        var items = new List<Maritime.Shared.DTOs.Sync.SyncQueueItemDto>();

        // Use the provisioned transport identity; Shore resolves its vessel binding.
        report.OriginNode = nodeId;

        // Generate a SyncVersion for idempotency (ticks-based, unique per transmit)
        var syncVersion = DateTime.UtcNow.Ticks;

        // 1. Parent MaritimeReport
        items.Add(new Maritime.Shared.DTOs.Sync.SyncQueueItemDto
        {
            TableName = "maritime_report",
            RecordKey = report.Id.ToString(),
            ActionType = "CREATE",
            Payload = JsonSerializer.Serialize(report, _syncJsonOptions),
            OriginNode = nodeId,
            SyncVersion = syncVersion,
            Timestamp = DateTime.UtcNow,
        });

        // 2. Child report based on type
        var reportType = await _context.ReportTypes.AsNoTracking()
            .FirstOrDefaultAsync(rt => rt.Id == report.ReportTypeId);
        var typeCode = reportType?.TypeCode?.ToUpperInvariant() ?? "";

        switch (typeCode)
        {
            case "NOON":
                var noon = await _context.NoonReports
                    .FirstOrDefaultAsync(r => r.MaritimeReportId == report.Id);
                if (noon != null)
                {
                    // Enrich with PMS/Alarm/Crew snapshots before sync
                    await EnrichNoonReportForSyncAsync(noon);

                    items.Add(new Maritime.Shared.DTOs.Sync.SyncQueueItemDto
                    {
                        TableName = "noon_report",
                        RecordKey = noon.Id.ToString(),
                        ActionType = "CREATE",
                        Payload = JsonSerializer.Serialize(noon, _syncJsonOptions),
                        OriginNode = nodeId,
                        SyncVersion = syncVersion,
                        Timestamp = DateTime.UtcNow,
                    });
                }
                break;

            case "DEPARTURE":
                var dep = await _context.DepartureReports.AsNoTracking()
                    .FirstOrDefaultAsync(r => r.MaritimeReportId == report.Id);
                if (dep != null)
                    items.Add(new Maritime.Shared.DTOs.Sync.SyncQueueItemDto
                    {
                        TableName = "departure_report",
                        RecordKey = dep.Id.ToString(),
                        ActionType = "CREATE",
                        Payload = JsonSerializer.Serialize(dep, _syncJsonOptions),
                        OriginNode = nodeId,
                        SyncVersion = syncVersion,
                        Timestamp = DateTime.UtcNow,
                    });
                break;

            case "ARRIVAL":
                var arr = await _context.ArrivalReports.AsNoTracking()
                    .FirstOrDefaultAsync(r => r.MaritimeReportId == report.Id);
                if (arr != null)
                    items.Add(new Maritime.Shared.DTOs.Sync.SyncQueueItemDto
                    {
                        TableName = "arrival_report",
                        RecordKey = arr.Id.ToString(),
                        ActionType = "CREATE",
                        Payload = JsonSerializer.Serialize(arr, _syncJsonOptions),
                        OriginNode = nodeId,
                        SyncVersion = syncVersion,
                        Timestamp = DateTime.UtcNow,
                    });
                break;

            case "BUNKER":
                var bunk = await _context.BunkerReports.AsNoTracking()
                    .FirstOrDefaultAsync(r => r.MaritimeReportId == report.Id);
                if (bunk != null)
                    items.Add(new Maritime.Shared.DTOs.Sync.SyncQueueItemDto
                    {
                        TableName = "bunker_report",
                        RecordKey = bunk.Id.ToString(),
                        ActionType = "CREATE",
                        Payload = JsonSerializer.Serialize(bunk, _syncJsonOptions),
                        OriginNode = nodeId,
                        SyncVersion = syncVersion,
                        Timestamp = DateTime.UtcNow,
                    });
                break;

            case "POSITION":
                var pos = await _context.PositionReports.AsNoTracking()
                    .FirstOrDefaultAsync(r => r.MaritimeReportId == report.Id);
                if (pos != null)
                    items.Add(new Maritime.Shared.DTOs.Sync.SyncQueueItemDto
                    {
                        TableName = "position_report",
                        RecordKey = pos.Id.ToString(),
                        ActionType = "CREATE",
                        Payload = JsonSerializer.Serialize(pos, _syncJsonOptions),
                        OriginNode = nodeId,
                        SyncVersion = syncVersion,
                        Timestamp = DateTime.UtcNow,
                    });
                break;

            default:
                _logger.LogWarning("Unknown report type {TypeCode} for report {Id}", typeCode, report.Id);
                break;
        }

        if (items.Count != 2) throw new InvalidOperationException($"Report {report.ReportNumber} has no supported detail record; transmission was not queued.");
        return items;
    }

    public async Task<TransmissionStatusDto?> GetTransmissionStatusAsync(Guid reportId)
    {
        var report = await _context.MaritimeReports
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == reportId);

        if (report == null) return null;

        var lastLog = await _context.ReportTransmissionLogs
            .AsNoTracking()
            .Where(l => l.MaritimeReportId == reportId)
            .OrderByDescending(l => l.TransmissionDateTime)
            .FirstOrDefaultAsync();

        var attemptCount = await _context.ReportTransmissionLogs
            .AsNoTracking()
            .Where(l => l.MaritimeReportId == reportId)
            .CountAsync();

        return new TransmissionStatusDto
        {
            ReportId = reportId,
            ReportNumber = report.ReportNumber,
            IsTransmitted = report.IsTransmitted,
            TransmittedAt = report.TransmittedAt,
            TransmissionAttempts = attemptCount,
            LastTransmissionStatus = lastLog?.Status,
            LastTransmissionTime = lastLog?.TransmissionDateTime,
            ErrorMessage = lastLog?.ErrorMessage
        };
    }

    // ============================================================
    // STATISTICS
    // ============================================================

    public async Task<ReportStatisticsDto> GetReportStatisticsAsync(DateTime? fromDate = null, DateTime? toDate = null)
    {
        var query = _context.MaritimeReports.AsNoTracking()
            .Where(r => r.DeletedAt == null);  // Exclude soft-deleted reports from statistics

        if (fromDate.HasValue)
        {
            query = query.Where(r => r.ReportDateTime >= fromDate.Value);
        }

        if (toDate.HasValue)
        {
            query = query.Where(r => r.ReportDateTime <= toDate.Value);
        }

        // OPTIMIZED: Single query with GroupBy instead of 7 separate COUNT queries
        var statusCounts = await query
            .GroupBy(r => new { r.Status, r.IsTransmitted })
            .Select(g => new { 
                g.Key.Status, 
                g.Key.IsTransmitted, 
                Count = g.Count() 
            })
            .ToListAsync();

        var totalCount = statusCounts.Sum(x => x.Count);

        var filteredReportIds = query.Select(r => r.Id);
        var failedTransmissions = await _context.ReportTransmissionLogs
            .AsNoTracking()
            .Where(log => log.Status == "FAILED" && filteredReportIds.Contains(log.MaritimeReportId))
            .CountAsync();

        var stats = new ReportStatisticsDto
        {
            TotalReports = totalCount,
            DraftReports = statusCounts.Where(x => x.Status == "DRAFT").Sum(x => x.Count),
            SubmittedReports = statusCounts.Where(x => x.Status == "SUBMITTED").Sum(x => x.Count),
            ApprovedReports = statusCounts.Where(x => x.Status == "APPROVED").Sum(x => x.Count),
            TransmittedReports = statusCounts.Where(x => x.Status == "TRANSMITTED").Sum(x => x.Count),
            PendingApproval = statusCounts.Where(x => x.Status == "SUBMITTED").Sum(x => x.Count),
            PendingTransmission = statusCounts.Where(x => x.Status == "APPROVED" && !x.IsTransmitted).Sum(x => x.Count),
            FailedTransmissions = failedTransmissions
        };

        // Reports by type
        var byType = await (from r in query
                           join rt in _context.ReportTypes.AsNoTracking() on r.ReportTypeId equals rt.Id
                           group r by rt.TypeName into g
                           select new { TypeName = g.Key, Count = g.Count() })
                           .ToDictionaryAsync(x => x.TypeName, x => x.Count);

        stats.ReportsByType = byType;

        // Last 7 days
        var sevenDaysAgo = DateTime.UtcNow.AddDays(-7);
        var last7Days = await query
            .Where(r => r.CreatedAt >= sevenDaysAgo)
            .GroupBy(r => r.CreatedAt.Date)
            .Select(g => new { Date = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Date.ToString("yyyy-MM-dd"), x => x.Count);

        stats.ReportsLast7Days = last7Days;

        return stats;
    }

    // ============================================================
    // REPORT TYPES
    // ============================================================

    public async Task<List<ReportTypeDto>> GetReportTypesAsync(bool activeOnly = true)
    {
        var query = _context.ReportTypes.AsNoTracking();

        if (activeOnly)
        {
            query = query.Where(rt => rt.IsActive);
        }

        return await query
            .OrderBy(rt => rt.TypeCode)
            .Select(rt => new ReportTypeDto
            {
                Id = rt.Id,
                TypeCode = rt.TypeCode,
                TypeName = rt.TypeName,
                Category = rt.Category,
                Description = rt.Description,
                RegulationReference = rt.RegulationReference,
                Frequency = rt.Frequency,
                IsMandatory = rt.IsMandatory,
                RequiresMasterSignature = rt.RequiresMasterSignature,
                IsActive = rt.IsActive
            })
            .ToListAsync();
    }

    // ============================================================
    // HELPER METHODS
    // ============================================================

    /// <summary>
    /// Get report type by code with caching for performance
    /// Cache duration: 24 hours (report types rarely change)
    /// </summary>
    private async Task<ReportType?> GetReportTypeByCodeAsync(string typeCode)
    {
        var cacheKey = $"ReportType_{typeCode}";
        
        if (!_cache.TryGetValue(cacheKey, out ReportType? reportType))
        {
            reportType = await _context.ReportTypes
                .AsNoTracking()
                .FirstOrDefaultAsync(rt => rt.TypeCode == typeCode);
            
            if (reportType != null)
            {
                var cacheOptions = new MemoryCacheEntryOptions()
                    .SetAbsoluteExpiration(CacheDuration)
                    .SetPriority(CacheItemPriority.High);
                
                _cache.Set(cacheKey, reportType, cacheOptions);
                
                _logger.LogDebug("Report type {TypeCode} cached for {Duration} hours", 
                    typeCode, CacheDuration.TotalHours);
            }
        }
        
        return reportType;
    }

    /// <summary>
    /// Generate unique report number with transaction safety to prevent duplicates
    /// Format: PREFIX-YYYYMMDD-NNNN (e.g., NOON-20251111-0001)
    /// </summary>
    /// <summary>
    /// Generate unique report number with transaction safety to prevent duplicates
    /// Uses database-level pessimistic locking to prevent race conditions
    /// Format: PREFIX-YYYYMMDD-NNNN (e.g., NOON-20251111-0001)
    /// </summary>
    private async Task<string> GenerateReportNumberAsync(string prefix)
    {
        // CRITICAL: Use serializable isolation level to prevent race conditions
        using var transaction = await _context.Database.BeginTransactionAsync(
            System.Data.IsolationLevel.Serializable);
        
        try
        {
            var today = DateTime.UtcNow;
            var dateStr = today.ToString("yyyyMMdd");
            var searchPrefix = $"{prefix}-{dateStr}";
            
            // IMPORTANT: This query will lock the rows to prevent concurrent access
            // In PostgreSQL with Serializable isolation, this prevents phantom reads
            var lastReport = await _context.MaritimeReports
                .Where(r => r.ReportNumber.StartsWith(searchPrefix))
                .OrderByDescending(r => r.ReportNumber)
                .FirstOrDefaultAsync();
            
            int nextSequence = 1;
            
            if (lastReport != null)
            {
                // Extract sequence number from last report
                var parts = lastReport.ReportNumber.Split('-');
                if (parts.Length == 3 && int.TryParse(parts[2], out int lastSeq))
                {
                    nextSequence = lastSeq + 1;
                }
            }
            
            var reportNumber = $"{prefix}-{dateStr}-{nextSequence:D4}";
            
            await transaction.CommitAsync();
            
            _logger.LogDebug("Generated report number: {ReportNumber} (sequence: {Sequence})", 
                reportNumber, nextSequence);
            
            return reportNumber;
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            _logger.LogError(ex, "Error generating report number for prefix {Prefix}", prefix);
            throw;
        }
    }

    private static string ResolveWorkflowActor(string? username, string? fallback = null)
    {
        if (!string.IsNullOrWhiteSpace(username))
        {
            return username.Trim();
        }

        if (!string.IsNullOrWhiteSpace(fallback))
        {
            return fallback.Trim();
        }

        return "System";
    }

    // ============================================================
    // AUDIT TRAIL - IMO COMPLIANCE
    // ============================================================

    /// <summary>
    /// Track workflow status changes for compliance and audit purposes
    /// Required by IMO for accountability and traceability
    /// </summary>
    private async Task TrackWorkflowChangeAsync(
        Guid maritimeReportId, 
        string fromStatus, 
        string toStatus, 
        string changedBy,
        string? remarks = null,
        string? ipAddress = null,
        string? userAgent = null)
    {
        try
        {
            var history = new ReportWorkflowHistory
            {
                MaritimeReportId = maritimeReportId,
                FromStatus = fromStatus,
                ToStatus = toStatus,
                ChangedBy = changedBy,
                ChangedAt = DateTime.UtcNow,
                Remarks = remarks,
                IpAddress = ipAddress,
                UserAgent = userAgent
            };

            await _context.ReportWorkflowHistories.AddAsync(history);
            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Workflow change tracked: Report {ReportId} status changed from {FromStatus} to {ToStatus} by {User}",
                maritimeReportId, fromStatus, toStatus, changedBy);
        }
        catch (Exception ex)
        {
            // Don't fail the main operation if audit logging fails
            _logger.LogError(ex, 
                "Failed to track workflow change for report {ReportId}", maritimeReportId);
        }
    }

    /// <summary>
    /// Get workflow history for a specific report
    /// Shows complete audit trail of all status changes
    /// </summary>
    public async Task<List<WorkflowHistoryDto>> GetWorkflowHistoryAsync(Guid reportId)
    {
        var history = await _context.ReportWorkflowHistories
            .Where(h => h.MaritimeReportId == reportId)
            .OrderByDescending(h => h.ChangedAt)
            .Select(h => new WorkflowHistoryDto
            {
                Id = h.Id,
                FromStatus = h.FromStatus,
                ToStatus = h.ToStatus,
                ChangedBy = h.ChangedBy,
                ChangedAt = h.ChangedAt,
                Remarks = h.Remarks,
                IpAddress = h.IpAddress
            })
            .ToListAsync();

        return history;
    }

    // ============================================================
    // SOFT DELETE - 3-YEAR RETENTION (IMO REQUIREMENT)
    // ============================================================

    /// <summary>
    /// Soft delete a report (marks as deleted without removing from database)
    /// IMO requires 3-year data retention for maritime records
    /// Only DRAFT reports can be deleted
    /// </summary>
    public async Task<(bool Success, string? Error)> SoftDeleteReportAsync(
        Guid reportId, 
        string deletedBy, 
        string reason)
    {
        try
        {
            var report = await _context.MaritimeReports.FindAsync(reportId);
            
            if (report == null)
            {
                return (false, "Report not found");
            }

            // Validation: Only allow deletion of DRAFT reports
            if (report.Status != "DRAFT")
            {
                return (false, $"Cannot delete report with status {report.Status}. Only DRAFT reports can be deleted.");
            }

            // Check if already deleted
            if (report.DeletedAt.HasValue)
            {
                return (false, "Report is already deleted");
            }

            // Soft delete
            report.DeletedAt = DateTime.UtcNow;
            report.DeletedBy = deletedBy;
            report.DeletedReason = reason;
            report.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            _logger.LogWarning(
                "Report {ReportNumber} soft deleted by {User}. Reason: {Reason}",
                report.ReportNumber, deletedBy, reason);

            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error soft deleting report {ReportId}", reportId);
            return (false, ex.Message);
        }
    }

    /// <summary>
    /// Get all soft-deleted reports (admin only)
    /// Used for data recovery and audit purposes
    /// </summary>
    public async Task<List<DeletedReportDto>> GetDeletedReportsAsync(DateTime? fromDate = null, DateTime? toDate = null)
    {
        var query = _context.MaritimeReports
            .Where(r => r.DeletedAt != null);

        if (fromDate.HasValue)
        {
            query = query.Where(r => r.DeletedAt >= fromDate.Value);
        }

        if (toDate.HasValue)
        {
            query = query.Where(r => r.DeletedAt <= toDate.Value);
        }

        var deletedReports = await query
            .OrderByDescending(r => r.DeletedAt)
            .Select(r => new DeletedReportDto
            {
                Id = r.Id,
                ReportNumber = r.ReportNumber,
                ReportDateTime = r.ReportDateTime,
                Status = r.Status,
                DeletedAt = r.DeletedAt!.Value,
                DeletedBy = r.DeletedBy!,
                DeletedReason = r.DeletedReason
            })
            .ToListAsync();

        return deletedReports;
    }

    /// <summary>
    /// Restore a soft-deleted report
    /// </summary>
    public async Task<(bool Success, string? Error)> RestoreReportAsync(Guid reportId, string restoredBy)
    {
        try
        {
            var report = await _context.MaritimeReports.FindAsync(reportId);
            
            if (report == null)
            {
                return (false, "Report not found");
            }

            if (!report.DeletedAt.HasValue)
            {
                return (false, "Report is not deleted");
            }

            // Restore
            report.DeletedAt = null;
            report.DeletedBy = null;
            report.DeletedReason = null;
            report.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Report {ReportNumber} restored by {User}",
                report.ReportNumber, restoredBy);

            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error restoring report {ReportId}", reportId);
            return (false, ex.Message);
        }
    }

    // ============================================================
    // AMENDMENTS (ISM CODE COMPLIANCE)
    // ============================================================

    public async Task<(bool Success, Guid? AmendmentId, int? AmendmentNumber, string? Error)> CreateAmendmentAsync(
        Guid reportId, CreateAmendmentDto dto, string amendedBy)
    {
        try
        {
            var report = await _context.MaritimeReports.FindAsync(reportId);
            if (report == null)
            {
                return (false, null, null, "Report not found");
            }

            // Only APPROVED or TRANSMITTED reports can be amended
            if (report.Status != "APPROVED" && report.Status != "TRANSMITTED")
            {
                return (false, null, null, 
                    $"Only APPROVED or TRANSMITTED reports can be amended. Current status: {report.Status}");
            }

            // Get next amendment number
            var maxAmendmentNumber = await _context.ReportAmendments
                .Where(a => a.OriginalReportId == reportId)
                .MaxAsync(a => (int?)a.AmendmentNumber) ?? 0;
            
            var nextNumber = maxAmendmentNumber + 1;

            // Create amendment
            var amendment = new ReportAmendment
            {
                OriginalReportId = reportId,
                AmendmentNumber = nextNumber,
                AmendmentReason = dto.AmendmentReason,
                CorrectedFields = JsonSerializer.Serialize(dto.CorrectedFields),
                AmendedReportData = dto.AmendedReportData != null 
                    ? JsonSerializer.Serialize(dto.AmendedReportData) 
                    : null,
                AmendedBy = amendedBy,
                Status = "DRAFT",
                Remarks = dto.Remarks,
                CreatedAt = DateTime.UtcNow
            };

            _context.ReportAmendments.Add(amendment);
            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Amendment #{Number} created for report {ReportNumber} by {User}",
                nextNumber, report.ReportNumber, amendedBy);

            return (true, amendment.Id, nextNumber, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating amendment for report {ReportId}", reportId);
            return (false, null, null, ex.Message);
        }
    }

    public async Task<List<ReportAmendmentDto>> GetAmendmentsAsync(Guid reportId)
    {
        // Get raw data first (without JSON deserialization in LINQ)
        var rawAmendments = await (
            from a in _context.ReportAmendments.AsNoTracking()
            join mr in _context.MaritimeReports.AsNoTracking() on a.OriginalReportId equals mr.Id
            where a.OriginalReportId == reportId
            orderby a.AmendmentNumber
            select new
            {
                a.Id,
                a.OriginalReportId,
                mr.ReportNumber,
                a.AmendmentNumber,
                a.AmendmentReason,
                a.CorrectedFields, // Raw JSON string
                a.AmendedBy,
                a.Status,
                a.MasterSignature,
                a.SignedAt,
                a.IsTransmitted,
                a.TransmittedAt,
                a.Remarks,
                a.CreatedAt
            }
        ).ToListAsync();

        // Deserialize JSON on client side
        var amendments = rawAmendments.Select(a => new ReportAmendmentDto
        {
            Id = a.Id,
            OriginalReportId = a.OriginalReportId,
            OriginalReportNumber = a.ReportNumber,
            AmendmentNumber = a.AmendmentNumber,
            AmendmentReason = a.AmendmentReason,
            CorrectedFields = JsonSerializer.Deserialize<Dictionary<string, FieldCorrection>>(a.CorrectedFields) 
                ?? new Dictionary<string, FieldCorrection>(),
            AmendedBy = a.AmendedBy,
            Status = a.Status,
            MasterSignature = a.MasterSignature,
            SignedAt = a.SignedAt,
            IsTransmitted = a.IsTransmitted,
            TransmittedAt = a.TransmittedAt,
            Remarks = a.Remarks,
            CreatedAt = a.CreatedAt
        }).ToList();

        return amendments;
    }

    public async Task<ReportAmendmentDto?> GetAmendmentAsync(Guid amendmentId)
    {
        // Get raw data first (without JSON deserialization in LINQ)
        var rawAmendment = await (
            from a in _context.ReportAmendments.AsNoTracking()
            join mr in _context.MaritimeReports.AsNoTracking() on a.OriginalReportId equals mr.Id
            where a.Id == amendmentId
            select new
            {
                a.Id,
                a.OriginalReportId,
                mr.ReportNumber,
                a.AmendmentNumber,
                a.AmendmentReason,
                a.CorrectedFields, // Raw JSON string
                a.AmendedBy,
                a.Status,
                a.MasterSignature,
                a.SignedAt,
                a.IsTransmitted,
                a.TransmittedAt,
                a.Remarks,
                a.CreatedAt
            }
        ).FirstOrDefaultAsync();

        if (rawAmendment == null)
        {
            return null;
        }

        // Deserialize JSON on client side
        var amendment = new ReportAmendmentDto
        {
            Id = rawAmendment.Id,
            OriginalReportId = rawAmendment.OriginalReportId,
            OriginalReportNumber = rawAmendment.ReportNumber,
            AmendmentNumber = rawAmendment.AmendmentNumber,
            AmendmentReason = rawAmendment.AmendmentReason,
            CorrectedFields = JsonSerializer.Deserialize<Dictionary<string, FieldCorrection>>(rawAmendment.CorrectedFields) 
                ?? new Dictionary<string, FieldCorrection>(),
            AmendedBy = rawAmendment.AmendedBy,
            Status = rawAmendment.Status,
            MasterSignature = rawAmendment.MasterSignature,
            SignedAt = rawAmendment.SignedAt,
            IsTransmitted = rawAmendment.IsTransmitted,
            TransmittedAt = rawAmendment.TransmittedAt,
            Remarks = rawAmendment.Remarks,
            CreatedAt = rawAmendment.CreatedAt
        };

        return amendment;
    }

    public async Task<(bool Success, string? Error)> ApproveAmendmentAsync(Guid amendmentId, ApproveAmendmentDto dto)
    {
        try
        {
            var amendment = await _context.ReportAmendments.FindAsync(amendmentId);
            if (amendment == null)
            {
                return (false, "Amendment not found");
            }

            if (amendment.Status != "DRAFT")
            {
                return (false, $"Cannot approve amendment with status {amendment.Status}");
            }

            amendment.Status = "APPROVED";
            amendment.MasterSignature = dto.MasterSignature;
            amendment.SignedAt = DateTime.UtcNow;
            amendment.UpdatedAt = DateTime.UtcNow;
            
            if (!string.IsNullOrEmpty(dto.ApprovalRemarks))
            {
                amendment.Remarks = (amendment.Remarks ?? "") + "\n[APPROVED] " + dto.ApprovalRemarks;
            }

            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Amendment #{Number} for report {ReportId} approved by {Master}",
                amendment.AmendmentNumber, amendment.OriginalReportId, dto.MasterSignature);

            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error approving amendment {AmendmentId}", amendmentId);
            return (false, ex.Message);
        }
    }

    public async Task<(bool Success, string? Error)> TransmitAmendmentAsync(Guid amendmentId, TransmitReportDto dto)
    {
        try
        {
            var amendment = await _context.ReportAmendments.FindAsync(amendmentId);
            if (amendment == null)
            {
                return (false, "Amendment not found");
            }

            if (amendment.Status != "APPROVED")
            {
                return (false, $"Cannot transmit amendment with status {amendment.Status}. Must be APPROVED.");
            }

            amendment.IsTransmitted = true;
            amendment.TransmittedAt = DateTime.UtcNow;
            amendment.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            // TODO: Implement actual transmission (email/VSAT)

            _logger.LogInformation(
                "Amendment #{Number} for report {ReportId} transmitted",
                amendment.AmendmentNumber, amendment.OriginalReportId);

            return (true, null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error transmitting amendment {AmendmentId}", amendmentId);
            return (false, ex.Message);
        }
    }
}


