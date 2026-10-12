using AutoMapper;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Reporting.Generators;

/// <summary>
/// Noon Report Generator - Implements ReportGeneratorBase template pattern
/// Consolidates noon report creation logic: Validate → CheckDuplicates → GenerateNumber → CreateInTransaction → Save
/// Enforces IMO/SOLAS compliance and prevents duplicate reports per voyage per day
/// </summary>
public class NoonReportGenerator : ReportGeneratorBase<CreateNoonReportDto, NoonReport>
{
    private readonly ILogger<NoonReportGenerator> _logger;
    private readonly IMapper _mapper;

    public NoonReportGenerator(
        EdgeDbContext context,
        ILogger<NoonReportGenerator> logger,
        IMapper mapper)
        : base(context, logger)
    {
        _logger = logger;
        _mapper = mapper;
    }

    /// <summary>
    /// Validate noon report data per SOLAS Chapter V requirements
    /// </summary>
    protected override async Task<ValidationResult> ValidateReportAsync(CreateNoonReportDto dto)
    {
        var errors = new List<string>();
        var warnings = new List<string>();

        // Position validation
        if (dto.Latitude.HasValue && (dto.Latitude < -90 || dto.Latitude > 90))
            errors.Add("Latitude must be between -90 and 90 degrees");
        if (dto.Longitude.HasValue && (dto.Longitude < -180 || dto.Longitude > 180))
            errors.Add("Longitude must be between -180 and 180 degrees");

        // Fuel consumption validation
        if (dto.FuelOilConsumed.HasValue && dto.FuelOilConsumed < 0)
            errors.Add("Fuel oil consumption cannot be negative");
        if (dto.DieselOilConsumed.HasValue && dto.DieselOilConsumed < 0)
            errors.Add("Diesel oil consumption cannot be negative");

        // Distance validation
        if (dto.DistanceTraveled.HasValue && dto.DistanceTraveled < 0)
            errors.Add("Distance traveled cannot be negative");
        if (dto.DistanceTraveled.HasValue && dto.DistanceTraveled > 700)
            warnings.Add("Distance traveled exceeds 700 NM for 24h period - verify data");

        // Fuel consumption sanity check (assuming max 50 MT/day for most vessels)
        if (dto.FuelOilConsumed.HasValue && dto.FuelOilConsumed > 200)
            warnings.Add("Fuel oil consumption exceeds 200 MT - verify data");

        // Voyage validation if linked
        if (dto.VoyageId.HasValue)
        {
            var voyage = await Context.VoyageRecords
                .AsNoTracking()
                .FirstOrDefaultAsync(v => v.Id == dto.VoyageId.Value);

            if (voyage == null)
                errors.Add($"Voyage ID {dto.VoyageId} not found");
            else if (voyage.VoyageStatus == "COMPLETED")
                errors.Add("Cannot report on completed voyage");
        }

        return errors.Count > 0
            ? ValidationResult.Failure(errors.ToArray())
            : ValidationResult.Success(warnings.Count > 0 ? warnings : null);
    }

    /// <summary>
    /// Check for duplicate noon reports - only one per voyage per calendar day
    /// </summary>
    protected override async Task<DuplicateCheckResult> CheckForDuplicatesAsync(CreateNoonReportDto dto, ReportType reportType)
    {
        var reportDate = dto.ReportDate.Date;

        var existingReport = await Context.NoonReports
            .AsNoTracking()
            .Where(n => n.ReportDate.Date == reportDate &&
                       (dto.VoyageId == null || n.MaritimeReport!.VoyageId == dto.VoyageId))
            .FirstOrDefaultAsync();

        if (existingReport != null)
            return DuplicateCheckResult.Failure(
                $"Noon report already exists for {reportDate:yyyy-MM-dd}. Only one noon report per day is permitted.");

        return DuplicateCheckResult.Success();
    }

    protected override string GetReportRemarks(CreateNoonReportDto dto)
    {
        return dto.GeneralRemarks ?? string.Empty;
    }

    /// <summary>
    /// Create noon report and maritime report wrapper in single transaction
    /// </summary>
    protected override async Task<(Guid MaritimeReportId, NoonReport Report)> CreateReportInTransactionAsync(
        CreateNoonReportDto dto,
        ReportType reportType,
        string reportNumber,
        string remarks,
        string? username)
    {
        // Create maritime report wrapper
        var maritimeReport = new MaritimeReport
        {
            ReportNumber = reportNumber,
            ReportTypeId = reportType.Id,
            ReportDateTime = DateTime.UtcNow,
            VoyageId = dto.VoyageId,
            Status = "DRAFT",
            PreparedBy = username ?? "SYSTEM",
            ReportData = System.Text.Json.JsonSerializer.Serialize(dto),
            Remarks = remarks,
            IsTransmitted = false,
            IsSynced = false,
            CreatedAt = DateTime.UtcNow
        };

        Context.MaritimeReports.Add(maritimeReport);
        await Context.SaveChangesAsync();

        // Create noon report entity
        var noonReport = new NoonReport
        {
            MaritimeReportId = maritimeReport.Id,
            ReportDate = dto.ReportDate,
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
            
            // Fuel
            FuelOilConsumed = dto.FuelOilConsumed,
            DieselOilConsumed = dto.DieselOilConsumed,
            LubOilConsumed = dto.LubOilConsumed,
            FreshWaterConsumed = dto.FreshWaterConsumed,
            FuelOilROB = dto.FuelOilROB,
            DieselOilROB = dto.DieselOilROB,
            LubOilROB = dto.LubOilROB,
            FreshWaterROB = dto.FreshWaterROB,
            
            // Engine
            MainEngineRPM = dto.MainEngineRPM,
            MainEnginePower = dto.MainEnginePower,
            MainEngineRunningHours = dto.MainEngineRunningHours,
            AuxEngineRunningHours = dto.AuxEngineRunningHours,
            
            // Cargo & Crew
            CargoOnBoard = dto.CargoOnBoard,
            CargoDescription = dto.CargoDescription,
            PassengersOnBoard = dto.PassengersOnBoard,
            
            // Remarks
            OperationalRemarks = dto.OperationalRemarks,
            MachineryRemarks = dto.MachineryRemarks,
            CargoRemarks = dto.CargoRemarks,
            MaintenanceRemarks = dto.MaintenanceRemarks,
            SafetyDrillsConducted = dto.SafetyDrillsConducted,
            SafetyIncidents = dto.SafetyIncidents,
            
            CreatedAt = DateTime.UtcNow
        };

        Context.NoonReports.Add(noonReport);

        _logger.LogInformation("Noon report entity created: {ReportNumber}", reportNumber);
        
        return (maritimeReport.Id, noonReport);
    }

    /// <summary>
    /// Retrieve created noon report as DTO
    /// </summary>
    protected override async Task<object?> GetReportByIdAsync(Guid reportId)
    {
        var noonReport = await Context.NoonReports
            .AsNoTracking()
            .Include(n => n.MaritimeReport)
            .FirstOrDefaultAsync(n => n.MaritimeReportId == reportId && n.MaritimeReport!.DeletedAt == null);

        if (noonReport == null) return null;

        return _mapper.Map<NoonReportDto>(noonReport);
    }

    protected override void AddStatusHistoryAsync(object report, string fromStatus, string toStatus, string notes)
    {
        // Optional: implement if status history tracking is needed
        // Can be empty for now
    }

    protected override void CreateAmendmentAsync(object report, string changedBy, string description)
    {
        // Optional: implement if amendment tracking is needed
        // Can be empty for now
    }
}
