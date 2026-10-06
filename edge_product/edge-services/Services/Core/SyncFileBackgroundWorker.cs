using Microsoft.Extensions.Hosting;
using Maritime.Shared.Models.Sync;

namespace MaritimeEdge.Services.Core;

/// <summary>File work yields after bounded chunks; metadata and heartbeat have an independent worker.</summary>
public class SyncFileBackgroundWorker(IServiceScopeFactory scopes, IConfiguration configuration, ILogger<SyncFileBackgroundWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = 60;
            try
            {
                using var scope = scopes.CreateScope();
                var sync = scope.ServiceProvider.GetRequiredService<ISyncService>();
                var network = await sync.GetCurrentNetworkStatusAsync();
                delay = Math.Max(5, configuration.GetValue($"Sync:FileCycleIntervalsSeconds:{network}", SyncLinkPolicy.For(network).PollSeconds));
                await sync.ExecuteFileTransfersAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex) { logger.LogWarning(ex, "File transfer cycle deferred; metadata worker remains active"); }
            try { await Task.Delay(TimeSpan.FromSeconds(delay), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
