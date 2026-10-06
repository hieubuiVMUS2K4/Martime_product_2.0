using System.Text.Json;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Voyage;

/// <summary>
/// BackgroundService quét bảng engine_data có IsSynced=false,
/// đóng gói thành SyncQueue entry để SyncBackgroundWorker tự động push lên Shore.
/// 
/// Đây là "bridge" giữa Data Layer (EngineData) và Sync Layer (SyncQueue).
/// Không can thiệp vào code hiện có, chỉ thêm service mới.
/// </summary>
public class EngineSyncEnqueuerService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<EngineSyncEnqueuerService> _logger;
    private readonly IConfiguration _configuration;

    private readonly int _intervalSeconds;
    private readonly int _batchSize;
    private string _nodeId = "UNKNOWN";

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    public EngineSyncEnqueuerService(
        IServiceProvider serviceProvider,
        ILogger<EngineSyncEnqueuerService> logger,
        IConfiguration configuration)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _configuration = configuration;

        _intervalSeconds = _configuration.GetValue("EngineSyncEnqueuer:IntervalSeconds", 30);
        _batchSize = _configuration.GetValue("EngineSyncEnqueuer:BatchSize", 100);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var enabled = _configuration.GetValue("EngineSyncEnqueuer:Enabled", true);
        if (!enabled)
        {
            _logger.LogInformation("Engine Sync Enqueuer is DISABLED in configuration");
            return;
        }

        _logger.LogInformation(
            "Engine Sync Enqueuer started. Interval: {Interval}s, BatchSize: {BatchSize}",
            _intervalSeconds, _batchSize);

        // Warmup delay
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        _nodeId = await ResolveNodeIdAsync();
        _logger.LogInformation("Engine Sync Enqueuer using NodeId: {NodeId}", _nodeId);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await EnqueueEngineDataAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("Engine Sync Enqueuer is shutting down");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Engine Sync Enqueuer");
            }

            await Task.Delay(TimeSpan.FromSeconds(_intervalSeconds), stoppingToken);
        }

        _logger.LogInformation("Engine Sync Enqueuer stopped");
    }

    /// <summary>
    /// Quét EngineData có IsSynced=false, đóng gói thành SyncQueue items,
    /// đánh dấu IsSynced=true
    /// </summary>
    private async Task EnqueueEngineDataAsync(CancellationToken ct)
    {
        _nodeId = await ResolveNodeIdAsync();
        using var scope = _serviceProvider.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();

        // Lấy các engine data chưa sync
        var unsynced = await dbContext.EngineData
            .Where(e => !e.IsSynced && !dbContext.SyncQueue.Any(q => q.TableName == "engine_data" && q.RecordKey == e.Id.ToString() && q.SyncedAt == null))
            .OrderBy(e => e.Timestamp)
            .Take(_batchSize)
            .ToListAsync(ct);

        if (unsynced.Count == 0)
        {
            _logger.LogDebug("No unsynced engine data to enqueue");
            return;
        }

        _logger.LogInformation("Enqueuing {Count} engine records to SyncQueue", unsynced.Count);

        var now = DateTime.UtcNow;
        var syncQueueItems = new List<SyncQueue>();

        foreach (var engine in unsynced)
        {
            // Serialize EngineData thành JSON payload
            var payload = JsonSerializer.Serialize(new
            {
                id = engine.Id,
                timestamp = engine.Timestamp,
                engineId = engine.EngineId,
                rpm = engine.Rpm,
                loadPercent = engine.LoadPercent,
                coolantTemp = engine.CoolantTemp,
                exhaustTemp = engine.ExhaustTemp,
                lubeOilPressure = engine.LubeOilPressure,
                lubeOilTemp = engine.LubeOilTemp,
                fuelPressure = engine.FuelPressure,
                fuelRate = engine.FuelRate,
                runningHours = engine.RunningHours,
                startCount = engine.StartCount,
                alarmStatus = engine.AlarmStatus,
                isRunning = engine.IsRunning,
                createdAt = engine.CreatedAt,
                updatedAt = engine.UpdatedAt,
                originNode = _nodeId
            }, _jsonOptions);

            // Cập nhật luôn OriginNode trong DB để đồng bộ về sau
            engine.OriginNode = _nodeId;

            syncQueueItems.Add(new SyncQueue
            {
                TableName = "engine_data",
                RecordKey = engine.Id.ToString(),
                ActionType = SyncActionType.CREATE,
                Payload = payload,
                Priority = SyncPriority.Operational,
                CreatedAt = now,
                RetryCount = 0,
                MaxRetries = 5,
                NextRetryAt = now
            });

            // Đánh dấu đã enqueue

            engine.UpdatedAt = now;
        }

        // Batch insert SyncQueue + update IsSynced trong cùng transaction
        await dbContext.SyncQueue.AddRangeAsync(syncQueueItems, ct);
        await dbContext.SaveChangesAsync(ct);

        _logger.LogInformation(
            "✅ Enqueued {Count} engine records to SyncQueue for sync to Shore",
            syncQueueItems.Count);
    }

    /// <summary>
    /// Vessel Provisioning v3: resolves NodeId via <see cref="IEdgeRuntimeConfigService"/> instead of
    /// reading <c>_configuration["SyncSecurity:NodeId"]</c> directly. Cached once at service startup
    /// (BackgroundService is Singleton) — a service restart is needed to pick up a newly activated
    /// Managed profile, which is acceptable since profile activation is an admin action, not a
    /// per-request concern. Falls back to "UNKNOWN" (does not throw) on Fail-Closed conditions.
    /// </summary>
    private async Task<string> ResolveNodeIdAsync()
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var runtimeConfigService = scope.ServiceProvider.GetRequiredService<IEdgeRuntimeConfigService>();
            var syncConfig = await runtimeConfigService.GetSyncConfigAsync();
            return string.IsNullOrWhiteSpace(syncConfig?.NodeId)
                ? "UNKNOWN"
                : syncConfig!.NodeId;
        }
        catch (ProvisioningRequiredException ex)
        {
            _logger.LogWarning("Engine Sync Enqueuer: VesselIMO unavailable — {Message}", ex.Message);
            return "UNKNOWN";
        }
        catch (ConfigInvalidException ex)
        {
            _logger.LogError("Engine Sync Enqueuer: VesselIMO unavailable — {Message}", ex.Message);
            return "UNKNOWN";
        }
    }
}
