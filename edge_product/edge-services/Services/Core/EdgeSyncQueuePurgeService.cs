using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MaritimeEdge.Data;

namespace MaritimeEdge.Services.Core
{
    public class EdgeSyncQueuePurgeService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<EdgeSyncQueuePurgeService> _logger;
        private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(24);
        private const int RetentionDays = 30;

        public EdgeSyncQueuePurgeService(IServiceProvider serviceProvider, ILogger<EdgeSyncQueuePurgeService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("EdgeSyncQueuePurgeService starting. Retention period: {RetentionDays} days.", RetentionDays);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await PurgeProcessedSyncItemsAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred during edge sync queue purge operation.");
                }

                await Task.Delay(CheckInterval, stoppingToken);
            }
        }

        private async Task PurgeProcessedSyncItemsAsync(CancellationToken cancellationToken)
        {
            using var scope = _serviceProvider.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();

            var cutoffDate = DateTime.UtcNow.AddDays(-RetentionDays);

            _logger.LogInformation("Purging processed sync queue items on edge older than {CutoffDate}...", cutoffDate);

            // sync_queue is mapped to snake_case in EdgeDbContext and the dump schema.
            // A queue item is considered processed when synced_at is set.
            var deletedQueue = await dbContext.Database.ExecuteSqlRawAsync(
                @"DELETE FROM sync_queue WHERE synced_at IS NOT NULL AND synced_at < {0}",
                new object[] { cutoffDate },
                cancellationToken);

            _logger.LogInformation("Edge cleanup completed: purged {DeletedQueue} synced items from SyncQueue.", deletedQueue);
        }
    }
}

