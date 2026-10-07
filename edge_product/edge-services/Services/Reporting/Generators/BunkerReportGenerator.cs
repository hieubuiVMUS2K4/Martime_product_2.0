using AutoMapper;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using Microsoft.Extensions.Logging;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Reporting.Generators;

public class BunkerReportGenerator : ReportGeneratorBase<CreateBunkerReportDto, BunkerReport>
{
    private readonly ILogger<BunkerReportGenerator> _logger;
    private readonly IMapper _mapper;

    public BunkerReportGenerator(EdgeDbContext context, ILogger<BunkerReportGenerator> logger, IMapper mapper)
        : base(context, logger)
    {
        _logger = logger;
        _mapper = mapper;
    }

    protected override Task<ValidationResult> ValidateReportAsync(CreateBunkerReportDto dto)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(dto.FuelType)) errors.Add("Bunker type is required");
        if (dto.QuantityReceived <= 0) errors.Add("Bunker quantity must be positive");
        if (dto.Density.HasValue && (dto.Density < 0.80 || dto.Density > 1.00)) errors.Add("Bunker density invalid");
        return Task.FromResult(errors.Count > 0 ? ValidationResult.Failure(errors.ToArray()) : ValidationResult.Success());
    }

    protected override async Task<DuplicateCheckResult> CheckForDuplicatesAsync(CreateBunkerReportDto dto, ReportType reportType)
    {
        var reportDate = DateTime.UtcNow.Date;
        var exists = await Context.BunkerReports
            .AsNoTracking()
            .AnyAsync(b => b.FuelType == dto.FuelType &&
                          b.BunkerDate.Date == reportDate &&
                          b.MaritimeReport!.DeletedAt == null);
        if (exists) return DuplicateCheckResult.Failure("Bunker report for this type already exists today.");
        return DuplicateCheckResult.Success();
    }

    protected override string GetReportRemarks(CreateBunkerReportDto dto) => dto.Remarks ?? string.Empty;

    protected override async Task<(Guid MaritimeReportId, BunkerReport Report)> CreateReportInTransactionAsync(
        CreateBunkerReportDto dto, ReportType reportType, string reportNumber, string remarks, string? username)
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
        Context.BunkerReports.Add(bunkerReport);
        return (maritimeReport.Id, bunkerReport);
    }

    protected override async Task<object?> GetReportByIdAsync(Guid reportId)
    {
        var report = await Context.BunkerReports
            .AsNoTracking()
            .Include(b => b.MaritimeReport)
            .FirstOrDefaultAsync(b => b.MaritimeReportId == reportId && b.MaritimeReport!.DeletedAt == null);
        return report != null ? _mapper.Map<BunkerReportDto>(report) : null;
    }

    protected override void AddStatusHistoryAsync(object report, string fromStatus, string toStatus, string notes) { }
    protected override void CreateAmendmentAsync(object report, string changedBy, string description) { }
}
