using System.Text.Json;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Voyage;

/// <summary>
/// BackgroundService quét SafetyAlarm và EngineEvent có IsSynced=false,
/// đóng gói thành SyncQueue entry để SyncBackgroundWorker tự động push lên Shore.
/// 
/// Đảm bảo cảnh báo cảm biến và sự kiện động cơ được đồng bộ với độ trễ ≤ 30s.
/// </summary>
public class AlertSyncEnqueuerService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<AlertSyncEnqueuerService> _logger;
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

    public AlertSyncEnqueuerService(
        IServiceProvider serviceProvider,
        ILogger<AlertSyncEnqueuerService> logger,
        IConfiguration configuration)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _configuration = configuration;

        _intervalSeconds = _configuration.GetValue("AlertSyncEnqueuer:IntervalSeconds", 10);
        _batchSize = _configuration.GetValue("AlertSyncEnqueuer:BatchSize", 50);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var enabled = _configuration.GetValue("AlertSyncEnqueuer:Enabled", true);
        if (!enabled)
        {
            _logger.LogInformation("Alert Sync Enqueuer is DISABLED in configuration");
            return;
        }

        _logger.LogInformation(
            "Alert Sync Enqueuer started. Interval: {Interval}s, BatchSize: {BatchSize}",
            _intervalSeconds, _batchSize);

        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);

        _nodeId = await ResolveNodeIdAsync();
        _logger.LogInformation("Alert Sync Enqueuer using NodeId: {NodeId}", _nodeId);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await EnqueueAlertsAsync(stoppingToken);
                await EnqueueEngineEventsAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("Alert Sync Enqueuer is shutting down");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Alert Sync Enqueuer");
            }

            await Task.Delay(TimeSpan.FromSeconds(_intervalSeconds), stoppingToken);
        }

        _logger.LogInformation("Alert Sync Enqueuer stopped");
    }

    private async Task EnqueueAlertsAsync(CancellationToken ct)
    {
        _nodeId = await ResolveNodeIdAsync();
        using var scope = _serviceProvider.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();

        var unsynced = await dbContext.SafetyAlarms
            .Where(a => !a.IsSynced && !dbContext.SyncQueue.Any(q => q.TableName == "safety_alarm" && q.RecordKey == a.Id.ToString() && q.SyncedAt == null))
            .OrderBy(a => a.Timestamp)
            .Take(_batchSize)
            .ToListAsync(ct);

        if (unsynced.Count == 0) return;

        _logger.LogInformation("Enqueuing {Count} safety alarms to SyncQueue", unsynced.Count);

        var now = DateTime.UtcNow;
        var syncQueueItems = new List<SyncQueue>();

        foreach (var alarm in unsynced)
        {
            var payload = JsonSerializer.Serialize(new
            {
                id = alarm.Id,
                timestamp = alarm.Timestamp,
                alarmType = alarm.AlarmType,
                alarmCode = alarm.AlarmCode,
                severity = alarm.Severity,
                location = alarm.Location,
                description = alarm.Description,
                isAcknowledged = alarm.IsAcknowledged,
                acknowledgedAt = alarm.AcknowledgedAt,
                acknowledgedBy = alarm.AcknowledgedBy,
                isResolved = alarm.IsResolved,
                resolvedAt = alarm.ResolvedAt,
                createdAt = alarm.CreatedAt,
                updatedAt = alarm.UpdatedAt,
                originNode = _nodeId
            }, _jsonOptions);

            alarm.OriginNode = _nodeId;

            syncQueueItems.Add(new SyncQueue
            {
                TableName = "safety_alarm",
                RecordKey = alarm.Id.ToString(),
                ActionType = SyncActionType.CREATE,
                Payload = payload,
                Priority = SyncPriority.Critical,
                CreatedAt = now,
                RetryCount = 0,
                MaxRetries = 5,
                NextRetryAt = now
            });

            alarm.UpdatedAt = now;
        }

        await dbContext.SyncQueue.AddRangeAsync(syncQueueItems, ct);
        await dbContext.SaveChangesAsync(ct);

        _logger.LogInformation("✅ Enqueued {Count} safety alarms to SyncQueue", syncQueueItems.Count);
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
            _logger.LogWarning("Alert Sync Enqueuer: VesselIMO unavailable — {Message}", ex.Message);
            return "UNKNOWN";
        }
        catch (ConfigInvalidException ex)
        {
            _logger.LogError("Alert Sync Enqueuer: VesselIMO unavailable — {Message}", ex.Message);
            return "UNKNOWN";
        }
    }

    private async Task EnqueueEngineEventsAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();

        var unsynced = await dbContext.EngineEvents
            .Where(e => !e.IsSynced && !dbContext.SyncQueue.Any(q => q.TableName == "engine_event" && q.RecordKey == e.Id.ToString() && q.SyncedAt == null))
            .OrderBy(e => e.Timestamp)
            .Take(_batchSize)
            .ToListAsync(ct);

        if (unsynced.Count == 0) return;

        _logger.LogInformation("Enqueuing {Count} engine events to SyncQueue", unsynced.Count);

        var now = DateTime.UtcNow;
        var syncQueueItems = new List<SyncQueue>();

        foreach (var evt in unsynced)
        {
            var payload = JsonSerializer.Serialize(new
            {
                id = evt.Id,
                timestamp = evt.Timestamp,
                engineId = evt.EngineId,
                eventType = evt.EventType,
                rpm = evt.Rpm,
                loadPercent = evt.LoadPercent,
                triggerSource = evt.TriggerSource,
                createdAt = evt.CreatedAt,
                originNode = _nodeId
            }, _jsonOptions);

            evt.OriginNode = _nodeId;

            syncQueueItems.Add(new SyncQueue
            {
                TableName = "engine_event",
                RecordKey = evt.Id.ToString(),
                ActionType = SyncActionType.CREATE,
                Payload = payload,
                Priority = SyncPriority.Critical,
                CreatedAt = now,
                RetryCount = 0,
                MaxRetries = 5,
                NextRetryAt = now
            });

        }

        await dbContext.SyncQueue.AddRangeAsync(syncQueueItems, ct);
        await dbContext.SaveChangesAsync(ct);

        _logger.LogInformation("✅ Enqueued {Count} engine events to SyncQueue", syncQueueItems.Count);
    }
}
