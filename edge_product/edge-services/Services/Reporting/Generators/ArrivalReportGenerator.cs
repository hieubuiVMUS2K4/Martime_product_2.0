using AutoMapper;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Reporting.Generators;

public class ArrivalReportGenerator : ReportGeneratorBase<CreateArrivalReportDto, ArrivalReport>
{
    private readonly ILogger<ArrivalReportGenerator> _logger;
    private readonly IMapper _mapper;

    public ArrivalReportGenerator(EdgeDbContext context, ILogger<ArrivalReportGenerator> logger, IMapper mapper)
        : base(context, logger)
    {
        _logger = logger;
        _mapper = mapper;
    }

    protected override async Task<ValidationResult> ValidateReportAsync(CreateArrivalReportDto dto)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(dto.PortName)) errors.Add("Port name is required");

        if (dto.VoyageId.HasValue)
        {
            var voyage = await Context.VoyageRecords.AsNoTracking().FirstOrDefaultAsync(v => v.Id == dto.VoyageId.Value);
            if (voyage == null) errors.Add($"Voyage ID {dto.VoyageId} not found");
        }
        return errors.Count > 0 ? ValidationResult.Failure(errors.ToArray()) : ValidationResult.Success();
    }

    protected override async Task<DuplicateCheckResult> CheckForDuplicatesAsync(CreateArrivalReportDto dto, ReportType reportType)
    {
        if (dto.VoyageId.HasValue)
        {
            var exists = await Context.ArrivalReports
                .AsNoTracking()
                .AnyAsync(a => a.VoyageId == dto.VoyageId.Value && a.MaritimeReport!.DeletedAt == null);
            if (exists) return DuplicateCheckResult.Failure("Arrival report already exists for this voyage.");
        }
        return DuplicateCheckResult.Success();
    }

    protected override string GetReportRemarks(CreateArrivalReportDto dto) => dto.Remarks ?? string.Empty;

    protected override async Task<(Guid MaritimeReportId, ArrivalReport Report)> CreateReportInTransactionAsync(
        CreateArrivalReportDto dto, ReportType reportType, string reportNumber, string remarks, string? username)
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

        var arrivalReport = new ArrivalReport
        {
            MaritimeReportId = maritimeReport.Id,
            VoyageId = dto.VoyageId,
            PortName = dto.PortName,
            PortCode = dto.PortCode,
            ArrivalDateTime = dto.ArrivalDateTime,
            ArrivalLatitude = dto.ArrivalLatitude,
            ArrivalLongitude = dto.ArrivalLongitude,
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
        Context.ArrivalReports.Add(arrivalReport);
        return (maritimeReport.Id, arrivalReport);
    }

    protected override async Task<object?> GetReportByIdAsync(Guid reportId)
    {
        var report = await Context.ArrivalReports
            .AsNoTracking()
            .Include(a => a.MaritimeReport)
            .FirstOrDefaultAsync(a => a.MaritimeReportId == reportId && a.MaritimeReport!.DeletedAt == null);
        return report != null ? _mapper.Map<ArrivalReportDto>(report) : null;
    }

    protected override void AddStatusHistoryAsync(object report, string fromStatus, string toStatus, string notes) { }
    protected override void CreateAmendmentAsync(object report, string changedBy, string description) { }
}
