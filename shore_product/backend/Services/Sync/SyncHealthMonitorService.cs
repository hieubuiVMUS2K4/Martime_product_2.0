using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;

namespace ProductApi.Services.Sync;

/// <summary>
/// Background service that monitors sync health across all connected ships.
/// 
/// Responsibilities:
/// - Detect offline nodes (no heartbeat within threshold)
/// - Update pending outbox counts per node
/// - Clean up stale outbox items (delivered or expired)
/// - Generate sync table statistics snapshots
/// - Reconcile unsynced crew/cert records
/// - Clean up old idempotency records
/// 
/// Runs every 5 minutes (configurable).
/// </summary>
public class SyncHealthMonitorService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<SyncHealthMonitorService> _logger;
    private readonly IConfiguration _configuration;

    public SyncHealthMonitorService(
        IServiceProvider serviceProvider,
        ILogger<SyncHealthMonitorService> logger,
        IConfiguration configuration)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _configuration = configuration;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Sync Health Monitor started.");

        try
        {
            // Startup delay
            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await RunHealthCheckAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in Sync Health Monitor cycle");
                }

                var intervalMinutes = _configuration.GetValue("Sync:HealthCheckIntervalMinutes", 5);
                await Task.Delay(TimeSpan.FromMinutes(intervalMinutes), stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Host is stopping.
        }
    }

    private async Task RunHealthCheckAsync(CancellationToken token)
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // 1. Detect offline nodes
        await DetectOfflineNodesAsync(context, token);

        // 2. Update pending outbox counts
        await UpdatePendingCountsAsync(context, token);

        // 3. Clean up old delivered outbox items (keep 30 days)
        await CleanupDeliveredOutboxAsync(context, token);

        // 4. Clean up old idempotency records (keep 7 days)
        await CleanupIdempotencyRecordsAsync(context, token);

        // 5. Reconcile unsynced data (queue for outbox)
        await ReconcileUnsyncedAsync(context, token);

        // 6. Refresh table stats snapshot
        await RefreshTableStatsAsync(context, token);
    }

    private async Task DetectOfflineNodesAsync(AppDbContext context, CancellationToken token)
    {
        var offlineThresholdMinutes = _configuration.GetValue("Sync:OfflineThresholdMinutes", 30);
        var threshold = DateTime.UtcNow.AddMinutes(-offlineThresholdMinutes);

        // AsTracking: DbContext mặc định NoTracking — thiếu dòng này thì IsOnline = false không bao giờ được lưu,
        // tàu đã mất liên lạc nhiều tháng vẫn hiện "trực tuyến".
        var nodes = await context.SyncNodeTrackers
            .AsTracking()
            .Where(n => n.IsOnline)
            .Where(n => n.LastHeartbeatAt == null || n.LastHeartbeatAt < threshold)
            .ToListAsync(token);

        foreach (var node in nodes)
        {
            node.IsOnline = false;
            node.UpdatedAt = DateTime.UtcNow;
            _logger.LogWarning("Node {NodeId} ({ShipName}) marked OFFLINE — no heartbeat since {LastBeat}",
                node.NodeId, node.ShipName, node.LastHeartbeatAt);
        }

        if (nodes.Count > 0)
            await context.SaveChangesAsync(token);
    }

    private async Task UpdatePendingCountsAsync(AppDbContext context, CancellationToken token)
    {
        var nodes = await context.SyncNodeTrackers.AsTracking().ToListAsync(token);
        if (nodes.Count == 0) return;

        var nodeIds = nodes.Select(n => n.NodeId).ToList();

        // Single query: count pending outbox items per target node
        var pendingCounts = await context.SyncOutbox
            .Where(o => o.DeliveredAt == null)
            .Where(o => nodeIds.Contains(o.TargetNode) || o.TargetNode == "*")
            .GroupBy(o => o.TargetNode)
            .Select(g => new { TargetNode = g.Key, Count = g.Count() })
            .ToListAsync(token);

        var broadcastCount = pendingCounts
            .Where(p => p.TargetNode == "*")
            .Sum(p => p.Count);
        var perNodeCounts = pendingCounts
            .Where(p => p.TargetNode != "*")
            .ToDictionary(p => p.TargetNode, p => p.Count);

        foreach (var node in nodes)
        {
            node.PendingOutboxCount = perNodeCounts.GetValueOrDefault(node.NodeId, 0) + broadcastCount;
        }

        await context.SaveChangesAsync(token);
    }

    private async Task CleanupDeliveredOutboxAsync(AppDbContext context, CancellationToken token)
    {
        var retentionDays = _configuration.GetValue("Sync:OutboxRetentionDays", 30);
        var cutoff = DateTime.UtcNow.AddDays(-retentionDays);

        var staleItems = await context.SyncOutbox
            .Where(o => o.DeliveredAt != null && o.DeliveredAt < cutoff)
            .Take(500) // Batch delete to avoid locking
            .ToListAsync(token);

        if (staleItems.Count > 0)
        {
            context.SyncOutbox.RemoveRange(staleItems);
            await context.SaveChangesAsync(token);
            _logger.LogInformation("Cleaned up {Count} delivered outbox items older than {Days} days",
                staleItems.Count, retentionDays);
        }
    }

    private async Task CleanupIdempotencyRecordsAsync(AppDbContext context, CancellationToken token)
    {
        var retentionDays = _configuration.GetValue("Sync:IdempotencyRetentionDays", 7);
        var cutoff = DateTime.UtcNow.AddDays(-retentionDays);

        var staleRecords = await context.SyncIdempotencyRecords
            .Where(r => r.ProcessedAt < cutoff)
            .Take(1000)
            .ToListAsync(token);

        if (staleRecords.Count > 0)
        {
            context.SyncIdempotencyRecords.RemoveRange(staleRecords);
            await context.SaveChangesAsync(token);
            _logger.LogDebug("Cleaned up {Count} idempotency records", staleRecords.Count);
        }
    }

    private async Task ReconcileUnsyncedAsync(AppDbContext context, CancellationToken token)
    {
        // Find crew records that should be synced but aren't in outbox
        var unsyncedCrew = await context.CrewMembers
            .Where(c => !c.IsSynced && c.OriginNode == "SHORE")
            .CountAsync(token);

        var unsyncedCerts = await context.CrewCertificates
            .Where(c => !c.IsSynced && c.OriginNode == "SHORE")
            .CountAsync(token);

        if (unsyncedCrew > 0 || unsyncedCerts > 0)
        {
            _logger.LogWarning("Found unsynced records: {Crew} crew, {Certs} certificates. " +
                "Use ICrewSyncOrchestrator.ReconcileUnsyncedDataAsync() to queue them.",
                unsyncedCrew, unsyncedCerts);
        }
    }

    private async Task RefreshTableStatsAsync(AppDbContext context, CancellationToken token)
    {
        // Compute stats from sync_logs grouped by node+table
        var freshStats = await context.SyncLogs
            .GroupBy(l => new { l.OriginNode, l.TableName })
            .Select(g => new
            {
                NodeId = g.Key.OriginNode,
                TableName = g.Key.TableName,
                TotalSynced = g.LongCount(l => l.Status == "SUCCESS"),
                TotalConflicts = g.LongCount(l => l.Status == "CONFLICT"),
                TotalFailed = g.LongCount(l => l.Status == "FAILED"),
                LastSyncAt = g.Max(l => l.ProcessedAt),
            })
            .ToListAsync(token);

        if (freshStats.Count == 0) return;

        // Upsert: load existing stats and update in-place instead of delete+re-insert
        var existingStats = await context.SyncTableStats.ToListAsync(token);
        var existingMap = existingStats.ToDictionary(s => $"{s.NodeId}:{s.TableName}");

        foreach (var stat in freshStats)
        {
            var key = $"{stat.NodeId}:{stat.TableName}";
            if (existingMap.TryGetValue(key, out var existing))
            {
                existing.TotalSynced = stat.TotalSynced;
                existing.TotalConflicts = stat.TotalConflicts;
                existing.TotalFailed = stat.TotalFailed;
                existing.LastSyncAt = stat.LastSyncAt;
                existing.SnapshotAt = DateTime.UtcNow;
            }
            else
            {
                await context.SyncTableStats.AddAsync(new SyncTableStats
                {
                    NodeId = stat.NodeId,
                    TableName = stat.TableName,
                    TotalSynced = stat.TotalSynced,
                    TotalConflicts = stat.TotalConflicts,
                    TotalFailed = stat.TotalFailed,
                    LastSyncAt = stat.LastSyncAt,
                    SnapshotAt = DateTime.UtcNow
                }, token);
            }
        }

        await context.SaveChangesAsync(token);

        _logger.LogDebug("Refreshed {Count} table stat entries", freshStats.Count);
    }
}
