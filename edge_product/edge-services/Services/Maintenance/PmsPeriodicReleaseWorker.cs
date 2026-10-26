using MaritimeEdge.Data;

namespace MaritimeEdge.Services.Maintenance;

/// <summary>Protocol-2 only. The persisted dataset handshake gates every sweep.</summary>
public sealed class PmsPeriodicReleaseWorker(IServiceScopeFactory scopes, PmsPeriodicReleaseSweep sweep,
    IConfiguration configuration, ILogger<PmsPeriodicReleaseWorker> logger) : BackgroundService
{
    public async Task<int> RunCycleAsync(DateTime nowUtc, CancellationToken token = default)
    {
        Guid? cursor = null; var created = 0;
        do
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();
            if (!await PmsReworkRuntime.CanAutoReleaseAsync(db, configuration, token)) return created;
            var zoneId = configuration["Pms:VesselTimeZone"];
            if (string.IsNullOrWhiteSpace(zoneId)) throw new InvalidOperationException("PMS vessel time zone must be configured.");
            var zone = TimeZoneInfo.FindSystemTimeZoneById(zoneId);
            var result = await sweep.RunBatchAsync(nowUtc, zone, cursor, token: token);
            created += result.Created; cursor = result.NextCursor;
        } while (cursor.HasValue);
        return created;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        try
        {
            do
            {
                try
                {
                    var created = await RunCycleAsync(DateTime.UtcNow, stoppingToken);
                    if (created > 0) logger.LogInformation("Released {Count} periodic Work Orders", created);
                }
                catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
                catch (Exception error) { logger.LogError(error, "Could not run periodic Work Order release sweep"); }
            } while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}
