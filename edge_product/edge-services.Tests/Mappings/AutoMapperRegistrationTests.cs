using AutoMapper;
using MaritimeEdge.DTOs;
using MaritimeEdge.Extensions;
using MaritimeEdge.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace MaritimeEdge.Tests.Mappings;

public class AutoMapperRegistrationTests
{
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void RegisteredMapper_MapsPositionReport_WithOrWithoutParent(bool hasParent)
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());
        services.AddAutoMapperProfiles();
        using var provider = services.BuildServiceProvider();
        var mapper = provider.GetRequiredService<IMapper>();

        var voyageId = Guid.NewGuid();
        var createdAt = new DateTime(2026, 1, 2, 12, 0, 0, DateTimeKind.Utc);
        var parent = new MaritimeReport
        {
            ReportNumber = "RPT-20260102-0001",
            Status = "SUBMITTED",
            VoyageId = voyageId,
            PreparedBy = "Captain",
            IsTransmitted = true,
            CreatedAt = createdAt
        };
        var report = new PositionReport
        {
            MaritimeReportId = parent.Id,
            Latitude = 10.75,
            Longitude = 106.7,
            ReportDateTime = createdAt,
            CreatedAt = createdAt.AddMinutes(1),
            MaritimeReport = hasParent ? parent : null
        };

        var dto = mapper.Map<PositionReportDto>(report);

        Assert.Equal(report.Id, dto.Id);
        Assert.Equal(parent.Id, dto.MaritimeReportId);
        Assert.Equal(report.Latitude, dto.Latitude);
        Assert.Equal(report.Longitude, dto.Longitude);
        Assert.Equal(report.ReportDateTime, dto.ReportDateTime);
        Assert.Equal(hasParent ? parent.ReportNumber : string.Empty, dto.ReportNumber);
        Assert.Equal(hasParent ? parent.Status : string.Empty, dto.Status);
        Assert.Equal(hasParent ? (Guid?)voyageId : null, dto.VoyageId);
        Assert.Equal(hasParent ? parent.PreparedBy : null, dto.PreparedBy);
        Assert.Equal(hasParent, dto.IsTransmitted);
        Assert.Equal(hasParent ? parent.CreatedAt : report.CreatedAt, dto.CreatedAt);
    }
}
