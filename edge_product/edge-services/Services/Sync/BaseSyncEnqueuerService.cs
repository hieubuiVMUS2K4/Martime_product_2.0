using System.Text.Json;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Maritime.Shared.Interfaces;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Sync;

/// <summary>
/// Base class for sync enqueuer services to eliminate code duplication across
/// AlertSyncEnqueuerService, PositionSyncEnqueuerService, EngineSyncEnqueuerService.
/// 
/// Extracted common pattern:
/// 1. Get unsynced records in batches
/// 2. Serialize to JSON payload
/// 3. Create SyncQueue items
/// 4. Keep entities pending until Shore confirms receipt
/// 5. Save changes
/// </summary>
public abstract class BaseSyncEnqueuerService<TEntity> : BackgroundService 
    where TEntity : class, ISyncableEntity
{
    protected readonly IServiceProvider ServiceProvider;
    protected readonly ILogger Logger;
    protected readonly IConfiguration Configuration;

    protected int IntervalSeconds { get; private set; }
    protected int BatchSize { get; private set; }
    protected abstract string ConfigPrefix { get; } // e.g., "AlertSyncEnqueuer", "PositionSyncEnqueuer"
    protected abstract string EntityTableName { get; } // e.g., "safety_alarm", "engine_event"

    protected static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    protected BaseSyncEnqueuerService(
        IServiceProvider serviceProvider,
        ILogger logger,
        IConfiguration configuration)
    {
        ServiceProvider = serviceProvider;
        Logger = logger;
        Configuration = configuration;

        IntervalSeconds = Configuration.GetValue($"{ConfigPrefix}:IntervalSeconds", 10);
        BatchSize = Configuration.GetValue($"{ConfigPrefix}:BatchSize", 50);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var enabled = Configuration.GetValue($"{ConfigPrefix}:Enabled", true);
        if (!enabled)
        {
            Logger.LogInformation("{ServiceName} is DISABLED in configuration", GetType().Name);
            return;
        }

        Logger.LogInformation(
            "{ServiceName} started. Interval: {Interval}s, BatchSize: {BatchSize}",
            GetType().Name, IntervalSeconds, BatchSize);

        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await EnqueueUnsyncedAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                Logger.LogInformation("{ServiceName} is shutting down", GetType().Name);
                break;
            }
            catch (Exception ex)
            {
                Logger.LogError(ex, "Error in {ServiceName}", GetType().Name);
            }

            await Task.Delay(TimeSpan.FromSeconds(IntervalSeconds), stoppingToken);
        }

        Logger.LogInformation("{ServiceName} stopped", GetType().Name);
    }

    /// <summary>
    /// Main enqueue logic - get unsynced records, serialize, create SyncQueue items
    /// </summary>
    protected async Task EnqueueUnsyncedAsync(CancellationToken ct)
    {
        using var scope = ServiceProvider.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();

        dbContext.SuppressSyncQueue = true;
        var unsynced = await GetUnsyncedRecordsAsync(dbContext, ct);
        if (unsynced.Count == 0) return;

        var runtimeConfigService = scope.ServiceProvider.GetRequiredService<IEdgeRuntimeConfigService>();
        var nodeId = await ResolveNodeIdAsync(runtimeConfigService);

        Logger.LogInformation("Enqueuing {Count} {EntityType} records to SyncQueue", 
            unsynced.Count, EntityTableName);

        var now = DateTime.UtcNow;
        var syncQueueItems = new List<SyncQueue>();

        foreach (var entity in unsynced)
        {
            // Subclass implements payload serialization
            var payload = SerializeEntity(entity);

            syncQueueItems.Add(new SyncQueue
            {
                TableName = EntityTableName,
                RecordKey = GetEntityId(entity).ToString(),
                ActionType = SyncActionType.CREATE,
                Payload = payload,
                Priority = SyncPriority.Critical,
                CreatedAt = now,
                RetryCount = 0,
                MaxRetries = 5,
                NextRetryAt = now
            });

            entity.OriginNode = nodeId;
        }

        await dbContext.SyncQueue.AddRangeAsync(syncQueueItems, ct);
        await dbContext.SaveChangesAsync(ct);

        Logger.LogInformation("✅ Enqueued {Count} {EntityType} records to SyncQueue", 
            syncQueueItems.Count, EntityTableName);
    }

    /// <summary>
    /// Vessel Provisioning v3: resolves the current NodeId via <see cref="IEdgeRuntimeConfigService"/>
    /// (Managed profile or Legacy config fallback) instead of caching a stale value from
    /// <c>_configuration["SyncSecurity:NodeId"]</c> at service construction time. Falls back to
    /// "UNKNOWN" (does NOT throw) on Fail-Closed conditions so record enqueueing is never blocked —
    /// items are still queued locally and will simply carry an "UNKNOWN" origin until sync is
    /// configured; the sync loop itself (SyncService) is the one that enforces Fail-Closed for
    /// actually transmitting data to Shore.
    /// </summary>
    private async Task<string> ResolveNodeIdAsync(IEdgeRuntimeConfigService runtimeConfigService)
    {
        try
        {
            var syncConfig = await runtimeConfigService.GetSyncConfigAsync();
            return syncConfig?.NodeId ?? "UNKNOWN";
        }
        catch (ProvisioningRequiredException ex)
        {
            Logger.LogWarning("{ServiceName}: NodeId unavailable — {Message}", GetType().Name, ex.Message);
            return "UNKNOWN";
        }
        catch (ConfigInvalidException ex)
        {
            Logger.LogError("{ServiceName}: NodeId unavailable — {Message}", GetType().Name, ex.Message);
            return "UNKNOWN";
        }
    }

    /// <summary>
    /// Get unsynced records from database - implement in subclass
    /// Default: Get from DbSet<TEntity> where IsSynced = false
    /// </summary>
    protected virtual async Task<List<TEntity>> GetUnsyncedRecordsAsync(EdgeDbContext dbContext, CancellationToken ct)
    {
        var set = dbContext.Set<TEntity>();
        
        return await set
            .Where(e => !e.IsSynced && !dbContext.SyncQueue.Any(q => q.TableName == EntityTableName && q.RecordKey == EF.Property<object>(e, "Id").ToString() && q.SyncedAt == null))
            .OrderBy(e => e.CreatedAt)
            .Take(BatchSize)
            .ToListAsync(ct);
    }

    /// <summary>
    /// Serialize entity to JSON payload - implement in subclass
    /// Each entity type has different fields to serialize
    /// </summary>
    protected abstract string SerializeEntity(TEntity entity);

    /// <summary>
    /// Get entity ID - uses reflection to get the Id property
    /// Works for any entity type with an Id property
    /// </summary>
    protected virtual object GetEntityId(TEntity entity)
    {
        var idProperty = typeof(TEntity).GetProperty("Id");
        if (idProperty == null)
            throw new InvalidOperationException($"Entity type {typeof(TEntity).Name} does not have an Id property");
        
        return idProperty.GetValue(entity) ?? throw new InvalidOperationException("Entity ID is null");
    }
}
