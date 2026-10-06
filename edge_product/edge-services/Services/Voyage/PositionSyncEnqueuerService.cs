using System.Text.Json;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Voyage;

/// <summary>
/// BackgroundService quét bảng position_data có IsSynced=false,
/// đóng gói thành SyncQueue entry để SyncBackgroundWorker tự động push lên Shore.
/// 
/// Đây là "bridge" giữa Data Layer (PositionData) và Sync Layer (SyncQueue).
/// Không can thiệp vào code hiện có, chỉ thêm service mới.
/// </summary>
public class PositionSyncEnqueuerService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<PositionSyncEnqueuerService> _logger;
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

    public PositionSyncEnqueuerService(
        IServiceProvider serviceProvider,
        ILogger<PositionSyncEnqueuerService> logger,
        IConfiguration configuration)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _configuration = configuration;

        _intervalSeconds = _configuration.GetValue("PositionSyncEnqueuer:IntervalSeconds", 30);
        _batchSize = _configuration.GetValue("PositionSyncEnqueuer:BatchSize", 100);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var enabled = _configuration.GetValue("PositionSyncEnqueuer:Enabled", true);
        if (!enabled)
        {
            _logger.LogInformation("Position Sync Enqueuer is DISABLED in configuration");
            return;
        }

        _logger.LogInformation(
            "Position Sync Enqueuer started. Interval: {Interval}s, BatchSize: {BatchSize}",
            _intervalSeconds, _batchSize);

        // Warmup delay
        await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

        _nodeId = await ResolveNodeIdAsync();
        _logger.LogInformation("Position Sync Enqueuer using NodeId: {NodeId}", _nodeId);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await EnqueuePositionsAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("Position Sync Enqueuer is shutting down");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Position Sync Enqueuer");
            }

            await Task.Delay(TimeSpan.FromSeconds(_intervalSeconds), stoppingToken);
        }

        _logger.LogInformation("Position Sync Enqueuer stopped");
    }

    /// <summary>
    /// Quét PositionData có IsSynced=false, đóng gói thành SyncQueue items,
    /// đánh dấu IsSynced=true
    /// </summary>
    private async Task EnqueuePositionsAsync(CancellationToken ct)
    {
        _nodeId = await ResolveNodeIdAsync();
        using var scope = _serviceProvider.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();

        // Lấy các position chưa sync
        var unsynced = await dbContext.PositionData
            .Where(p => !p.IsSynced && !dbContext.SyncQueue.Any(q => q.TableName == "position_data" && q.RecordKey == p.Id.ToString() && q.SyncedAt == null))
            .OrderBy(p => p.Timestamp)
            .Take(_batchSize)
            .ToListAsync(ct);

        if (unsynced.Count == 0)
        {
            _logger.LogDebug("No unsynced position data to enqueue");
            return;
        }

        _logger.LogInformation("Enqueuing {Count} position records to SyncQueue", unsynced.Count);

        var now = DateTime.UtcNow;
        var syncQueueItems = new List<SyncQueue>();

        foreach (var pos in unsynced)
        {
            // Serialize PositionData thành JSON payload
            // QUAN TRỌNG: Ghi đè originNode bằng IMO thật của tàu
            // để khớp với Shore filter (VesselTelemetryController lọc theo IMO).
            // NodeId chỉ dùng cho provisioning/sync identity, không dùng cho telemetry.
            var payload = JsonSerializer.Serialize(new
            {
                id = pos.Id,
                timestamp = pos.Timestamp,
                latitude = pos.Latitude,
                longitude = pos.Longitude,
                altitude = pos.Altitude,
                speedOverGround = pos.SpeedOverGround,
                courseOverGround = pos.CourseOverGround,
                magneticVariation = pos.MagneticVariation,
                fixQuality = pos.FixQuality,
                satellitesUsed = pos.SatellitesUsed,
                hdop = pos.Hdop,
                source = pos.Source,
                createdAt = pos.CreatedAt,
                updatedAt = pos.UpdatedAt,
                originNode = _nodeId
            }, _jsonOptions);

            // Cập nhật luôn OriginNode trong DB bằng IMO thật để đồng bộ về sau
            pos.OriginNode = _nodeId;

            syncQueueItems.Add(new SyncQueue
            {
                TableName = "position_data",
                RecordKey = pos.Id.ToString(),
                ActionType = SyncActionType.CREATE,
                Payload = payload,
                Priority = SyncPriority.Operational,
                CreatedAt = now,
                RetryCount = 0,
                MaxRetries = 5,
                NextRetryAt = now
            });

            // Đánh dấu đã enqueue

            pos.UpdatedAt = now;
        }

        // Batch insert SyncQueue + update IsSynced trong cùng transaction
        await dbContext.SyncQueue.AddRangeAsync(syncQueueItems, ct);
        await dbContext.SaveChangesAsync(ct);

        _logger.LogInformation(
            "✅ Enqueued {Count} position records to SyncQueue for sync to Shore",
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
            _logger.LogWarning("Position Sync Enqueuer: VesselIMO unavailable — {Message}", ex.Message);
            return "UNKNOWN";
        }
        catch (ConfigInvalidException ex)
        {
            _logger.LogError("Position Sync Enqueuer: VesselIMO unavailable — {Message}", ex.Message);
            return "UNKNOWN";
        }
    }
}
