using AutoMapper;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Reporting.Generators;

public class PositionReportGenerator : ReportGeneratorBase<CreatePositionReportDto, PositionReport>
{
    private readonly ILogger<PositionReportGenerator> _logger;
    private readonly IMapper _mapper;

    public PositionReportGenerator(EdgeDbContext context, ILogger<PositionReportGenerator> logger, IMapper mapper)
        : base(context, logger)
    {
        _logger = logger;
        _mapper = mapper;
    }

    protected override Task<ValidationResult> ValidateReportAsync(CreatePositionReportDto dto)
    {
        var errors = new List<string>();
        if (dto.Latitude < -90 || dto.Latitude > 90) errors.Add("Invalid latitude");
        if (dto.Longitude < -180 || dto.Longitude > 180) errors.Add("Invalid longitude");
        return Task.FromResult(errors.Count > 0 ? ValidationResult.Failure(errors.ToArray()) : ValidationResult.Success());
    }

    protected override Task<DuplicateCheckResult> CheckForDuplicatesAsync(CreatePositionReportDto dto, ReportType reportType)
    {
        return Task.FromResult(DuplicateCheckResult.Success()); // Allow continuous tracking
    }

    protected override string GetReportRemarks(CreatePositionReportDto dto) => dto.Remarks ?? string.Empty;

    protected override async Task<(Guid MaritimeReportId, PositionReport Report)> CreateReportInTransactionAsync(
        CreatePositionReportDto dto, ReportType reportType, string reportNumber, string remarks, string? username)
    {
        var maritimeReport = new MaritimeReport
        {
            ReportNumber = reportNumber,
            ReportTypeId = reportType.Id,
            ReportDateTime = DateTime.UtcNow,
            VoyageId = dto.VoyageId,
            Status = "SUBMITTED",
            PreparedBy = username ?? "SYSTEM",
            ReportData = System.Text.Json.JsonSerializer.Serialize(dto),
            Remarks = remarks,
            IsTransmitted = false,
            IsSynced = false,
            CreatedAt = DateTime.UtcNow
        };
        Context.MaritimeReports.Add(maritimeReport);
        await Context.SaveChangesAsync();

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
            CreatedAt = DateTime.UtcNow
        };
        Context.PositionReports.Add(positionReport);
        return (maritimeReport.Id, positionReport);
    }

    protected override async Task<object?> GetReportByIdAsync(Guid reportId)
    {
        var report = await Context.PositionReports
            .AsNoTracking()
            .Include(p => p.MaritimeReport)
            .FirstOrDefaultAsync(p => p.MaritimeReportId == reportId && p.MaritimeReport!.DeletedAt == null);
        return report != null ? _mapper.Map<PositionReportDto>(report) : null;
    }

    protected override void AddStatusHistoryAsync(object report, string fromStatus, string toStatus, string notes) { }
    protected override void CreateAmendmentAsync(object report, string changedBy, string description) { }
}
