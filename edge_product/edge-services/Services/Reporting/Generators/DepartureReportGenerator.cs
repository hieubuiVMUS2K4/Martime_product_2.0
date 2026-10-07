using AutoMapper;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Reporting.Generators;

public class DepartureReportGenerator : ReportGeneratorBase<CreateDepartureReportDto, DepartureReport>
{
    private readonly ILogger<DepartureReportGenerator> _logger;
    private readonly IMapper _mapper;

    public DepartureReportGenerator(EdgeDbContext context, ILogger<DepartureReportGenerator> logger, IMapper mapper)
        : base(context, logger)
    {
        _logger = logger;
        _mapper = mapper;
    }

    protected override async Task<ValidationResult> ValidateReportAsync(CreateDepartureReportDto dto)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(dto.PortName)) errors.Add("Port name is required");
        if (dto.VoyageId.HasValue)
        {
            var voyage = await Context.VoyageRecords.AsNoTracking().FirstOrDefaultAsync(v => v.Id == dto.VoyageId.Value);
            if (voyage == null) errors.Add($"Voyage ID {dto.VoyageId} not found");
            else if (voyage.VoyageStatus == "COMPLETED") errors.Add("Cannot depart from completed voyage");
        }
        return errors.Count > 0 ? ValidationResult.Failure(errors.ToArray()) : ValidationResult.Success();
    }

    protected override async Task<DuplicateCheckResult> CheckForDuplicatesAsync(CreateDepartureReportDto dto, ReportType reportType)
    {
        if (dto.VoyageId.HasValue)
        {
            var exists = await Context.DepartureReports
                .AsNoTracking()
                .AnyAsync(d => d.VoyageId == dto.VoyageId.Value && d.MaritimeReport!.DeletedAt == null);
            if (exists) return DuplicateCheckResult.Failure("Departure report already exists for this voyage.");
        }
        return DuplicateCheckResult.Success();
    }

    protected override string GetReportRemarks(CreateDepartureReportDto dto) => dto.Remarks ?? string.Empty;

    protected override async Task<(Guid MaritimeReportId, DepartureReport Report)> CreateReportInTransactionAsync(
        CreateDepartureReportDto dto, ReportType reportType, string reportNumber, string remarks, string? username)
    {
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

        var departureReport = new DepartureReport
        {
            MaritimeReportId = maritimeReport.Id,
            VoyageId = dto.VoyageId,
            PortName = dto.PortName,
            PortCode = dto.PortCode,
            DepartureDateTime = dto.DepartureDateTime,
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
            Remarks = dto.Remarks,
            CreatedAt = DateTime.UtcNow
        };
        Context.DepartureReports.Add(departureReport);
        return (maritimeReport.Id, departureReport);
    }

    protected override async Task<object?> GetReportByIdAsync(Guid reportId)
    {
        var report = await Context.DepartureReports
            .AsNoTracking()
            .Include(d => d.MaritimeReport)
            .FirstOrDefaultAsync(d => d.MaritimeReportId == reportId && d.MaritimeReport!.DeletedAt == null);
        return report != null ? _mapper.Map<DepartureReportDto>(report) : null;
    }

    protected override void AddStatusHistoryAsync(object report, string fromStatus, string toStatus, string notes) { }
    protected override void CreateAmendmentAsync(object report, string changedBy, string description) { }
}
