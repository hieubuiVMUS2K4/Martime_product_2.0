using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using ProductApi.Data;

namespace ProductApi.Services.Sync
{
    public class SyncQueuePurgeService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<SyncQueuePurgeService> _logger;
        private static readonly TimeSpan CheckInterval = TimeSpan.FromHours(24);
        private const int RetentionDays = 30;

        public SyncQueuePurgeService(IServiceProvider serviceProvider, ILogger<SyncQueuePurgeService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("SyncQueuePurgeService starting. Retention period: {RetentionDays} days.", RetentionDays);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await PurgeOldSyncRecordsAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error occurred during sync queue purge operation.");
                }

                await Task.Delay(CheckInterval, stoppingToken);
            }
        }

        private async Task PurgeOldSyncRecordsAsync(CancellationToken cancellationToken)
        {
            using var scope = _serviceProvider.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var cutoffDate = DateTime.UtcNow.AddDays(-RetentionDays);

            _logger.LogInformation("Executing database cleanup for sync records older than {CutoffDate}...", cutoffDate);

            // Execute interpolated SQL for high efficiency deletion
            // Note: Using ExecuteSqlInterpolatedAsync so CancellationToken is not treated as a SQL parameter.
            // SyncIdempotencyRecord has ProcessedAt (not CreatedAt), and SyncLog has ProcessedAt (not Timestamp).
            // Table names use snake_case convention configured in AppDbContext.
            // Idempotency receipts are safety state, not disposable diagnostic logs.
            var deletedIdempotency = 0;

            var deletedLogs = await dbContext.Database.ExecuteSqlInterpolatedAsync(
                $@"DELETE FROM sync_logs WHERE ""ProcessedAt"" < {cutoffDate}",
                cancellationToken);

            _logger.LogInformation("Purged {DeletedIdempotency} idempotency records and {DeletedLogs} sync logs.",
                deletedIdempotency, deletedLogs);
        }
    }
}
