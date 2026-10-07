namespace MaritimeEdge.Services.Maintenance;

public sealed class MaintenanceCycleWorker(IServiceScopeFactory scopes, ILogger<MaintenanceCycleWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        do
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var changed = await scope.ServiceProvider.GetRequiredService<MaintenanceCycleUpdater>()
                    .RefreshAsync(DateTime.UtcNow, token: stoppingToken);
                if (changed > 0) logger.LogInformation("Updated {Count} existing maintenance cycles", changed);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error) { logger.LogError(error, "Could not update existing maintenance cycles"); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
