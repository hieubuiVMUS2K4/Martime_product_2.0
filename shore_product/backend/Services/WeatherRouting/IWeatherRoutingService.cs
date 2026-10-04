using ProductApi.DTOs.WeatherRouting;

namespace ProductApi.Services.WeatherRouting;

public interface IWeatherRoutingService
{
    Task<WeatherRoutingJobDto> CreateAndRunAsync(CreateWeatherRoutingJobRequest request, CancellationToken ct = default);
    Task<WeatherRoutingJobDto?> GetJobAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<WeatherRoutingJobListItemDto>> ListJobsAsync(int take = 50, CancellationToken ct = default);
    Task<WeatherRoutingJobDto?> ReplanAsync(Guid id, ReplanWeatherRoutingJobRequest? request = null, CancellationToken ct = default);
    Task<IReadOnlyList<WeatherRoutingRouteDto>> GetRoutesAsync(Guid jobId, CancellationToken ct = default);
}
