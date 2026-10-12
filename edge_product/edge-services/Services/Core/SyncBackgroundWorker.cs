using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;

namespace MaritimeEdge.Services.Core;

public class SyncBackgroundWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<SyncBackgroundWorker> _logger;
    private readonly IConfiguration _configuration;

    public SyncBackgroundWorker(
        IServiceProvider serviceProvider, 
        ILogger<SyncBackgroundWorker> logger,
        IConfiguration configuration)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _configuration = configuration;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Sync Background Worker started.");

        var pullInterval = TimeSpan.FromSeconds(_configuration.GetValue("Sync:SyncInterval", 300));
        var heartbeatInterval = TimeSpan.FromSeconds(_configuration.GetValue("Sync:HeartbeatInterval", 60));
        var configDefaultPushInterval = TimeSpan.FromSeconds(_configuration.GetValue("Sync:HighPriorityInterval", 60));
        var defaultPushInterval = configDefaultPushInterval;
        var lastPull = DateTime.MinValue;
        var lastHeartbeat = DateTime.MinValue;

        while (!stoppingToken.IsCancellationRequested)
        {
            var pushInterval = defaultPushInterval;
            try
            {
                using (var scope = _serviceProvider.CreateScope())
                {
                    var syncService = scope.ServiceProvider.GetRequiredService<ISyncService>();
                    var runtimeConfigService = scope.ServiceProvider.GetRequiredService<IEdgeRuntimeConfigService>();

                    try
                    {
                        var syncConfig = await runtimeConfigService.GetSyncConfigAsync();
                        defaultPushInterval = TimeSpan.FromSeconds(Math.Max(1, syncConfig.SyncIntervalSec));
                    }
                    catch (Exception ex) when (ex is ProvisioningRequiredException or ConfigInvalidException)
                    {
                        var message = ex is ProvisioningRequiredException
                            ? "Sync paused until an EdgeProvisioningProfile is imported and activated."
                            : "Sync paused because the active provisioning configuration is invalid.";

                        _logger.LogWarning(ex, "{Message}", message);
                        defaultPushInterval = configDefaultPushInterval;
                        await Task.Delay(defaultPushInterval, stoppingToken);
                        continue;
                    }

                    var network = await syncService.GetCurrentNetworkStatusAsync();
                    var networkPushIntervalSeconds = _configuration.GetValue<double?>(
                        $"Sync:NetworkPushIntervalsSeconds:{network}");
                    pushInterval = networkPushIntervalSeconds.HasValue
                        ? TimeSpan.FromSeconds(Math.Max(1, networkPushIntervalSeconds.Value))
                        : TimeSpan.FromSeconds(Math.Max(defaultPushInterval.TotalSeconds, Maritime.Shared.Models.Sync.SyncLinkPolicy.For(network).PollSeconds));

                    if (DateTime.UtcNow - lastHeartbeat >= heartbeatInterval)
                    {
                        try { await syncService.SendHeartbeatAsync(stoppingToken); }
                        catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                        { _logger.LogWarning(ex, "Heartbeat failed; continuing durable delivery cycle"); }
                        lastHeartbeat = DateTime.UtcNow;
                    }

                    // Push: Edge → Shore (every push interval)
                    await syncService.ExecuteSyncAsync(stoppingToken);

                    // Vừa đổi tàu mà lúc đó bờ không trả lời: xin bờ gửi lại toàn bộ rồi kéo ngay.
                    var vesselSwitch = scope.ServiceProvider.GetRequiredService<IEdgeVesselSwitchService>();
                    if (await vesselSwitch.HasPendingFullSyncAsync(stoppingToken) &&
                        await vesselSwitch.CompletePendingFullSyncAsync(stoppingToken))
                        lastPull = DateTime.MinValue;

                    // Pull: Shore → Edge (every pull interval)
                    if (DateTime.UtcNow - lastPull >= pullInterval)
                    {
                        await syncService.PullFromShoreAsync(stoppingToken);
                        lastPull = DateTime.UtcNow;
                    }
                }

                await Task.Delay(pushInterval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error occurred during sync execution.");

                try
                {
                    await Task.Delay(defaultPushInterval, stoppingToken);
                }
                catch (TaskCanceledException)
                {
                    break;
                }
            }
        }

        _logger.LogInformation("Sync Background Worker stopping.");
    }
}
