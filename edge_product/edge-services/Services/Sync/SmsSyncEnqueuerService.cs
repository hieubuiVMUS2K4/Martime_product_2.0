using System.Text.Json;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Sync;

/// <summary>
/// Background service on Edge to enqueue unsynced SMS data:
/// 1. SmsFilledRecord (Edge operational data -> Shore)
/// 2. SmsProcedureAcknowledge (Edge crew acknowledgements -> Shore)
/// </summary>
public class SmsSyncEnqueuerService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<SmsSyncEnqueuerService> _logger;
    private readonly IConfiguration _configuration;
    private readonly int _intervalSeconds;
    private readonly int _batchSize;


    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
    };

    public SmsSyncEnqueuerService(
        IServiceProvider serviceProvider,
        ILogger<SmsSyncEnqueuerService> logger,
        IConfiguration configuration)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _configuration = configuration;
        _intervalSeconds = configuration.GetValue("SmsSyncEnqueuer:IntervalSeconds", 10);
        _batchSize = configuration.GetValue("SmsSyncEnqueuer:BatchSize", 50);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var enabled = _configuration.GetValue("SmsSyncEnqueuer:Enabled", true);
        if (!enabled)
        {
            _logger.LogInformation("SmsSyncEnqueuerService is DISABLED in configuration");
            return;
        }

        _logger.LogInformation("SmsSyncEnqueuerService started. Interval: {Interval}s, BatchSize: {BatchSize}",
            _intervalSeconds, _batchSize);

        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await EnqueueUnsyncedSmsDataAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("SmsSyncEnqueuerService is shutting down");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in SmsSyncEnqueuerService execution cycle");
            }

            await Task.Delay(TimeSpan.FromSeconds(_intervalSeconds), stoppingToken);
        }

        _logger.LogInformation("SmsSyncEnqueuerService stopped");
    }

    private async Task EnqueueUnsyncedSmsDataAsync(CancellationToken ct)
    {
        using var scope = _serviceProvider.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();
        dbContext.SuppressSyncQueue = true;
        var runtime = scope.ServiceProvider.GetRequiredService<MaritimeEdge.Services.Core.IEdgeRuntimeConfigService>();
        string nodeId;
        try { nodeId = (await runtime.GetSyncConfigAsync())?.NodeId ?? "UNKNOWN"; }
        catch (Exception ex) when (ex is MaritimeEdge.Services.Core.ProvisioningRequiredException or MaritimeEdge.Services.Core.ConfigInvalidException) { nodeId = "UNKNOWN"; }
        var now = DateTime.UtcNow;
        var syncQueueItems = new List<SyncQueue>();

        // 1. Process unsynced SmsFilledRecords
        var unsyncedRecords = await dbContext.SmsFilledRecords
            .Where(r => !r.IsSynced && !dbContext.SyncQueue.Any(q => (q.TableName == "sms_filled_records" || q.TableName == "sms_filled_record") && q.RecordKey == r.Id.ToString() && q.SyncedAt == null))
            .OrderBy(r => r.CreatedAt)
            .Take(_batchSize)
            .ToListAsync(ct);

        if (unsyncedRecords.Count > 0)
        {
            _logger.LogInformation("Enqueuing {Count} SmsFilledRecord items to SyncQueue", unsyncedRecords.Count);
            foreach (var record in unsyncedRecords)
            {
                record.OriginNode = nodeId;
                var payload = JsonSerializer.Serialize(record, JsonOptions);

                syncQueueItems.Add(new SyncQueue
                {
                    TableName = "sms_filled_records",
                    RecordKey = record.Id.ToString(),
                    ActionType = SyncActionType.SNAPSHOT,
                    Payload = payload,
                    Priority = SyncPriority.Operational,
                    CreatedAt = now,
                    RetryCount = 0,
                    MaxRetries = 5,
                    NextRetryAt = now
                });


            }
        }

        // 2. Process unsynced SmsProcedureAcknowledgements
        var unsyncedAcks = await dbContext.SmsProcedureAcknowledgements
            .Where(a => !a.IsSynced && !dbContext.SyncQueue.Any(q => (q.TableName == "sms_procedure_acknowledgements" || q.TableName == "sms_procedure_acknowledge") && q.RecordKey == a.Id.ToString() && q.SyncedAt == null))
            .OrderBy(a => a.AcknowledgedAt)
            .Take(_batchSize)
            .ToListAsync(ct);

        if (unsyncedAcks.Count > 0)
        {
            _logger.LogInformation("Enqueuing {Count} SmsProcedureAcknowledge items to SyncQueue", unsyncedAcks.Count);
            foreach (var ack in unsyncedAcks)
            {
                ack.OriginNode = nodeId;
                var payload = JsonSerializer.Serialize(ack, JsonOptions);

                syncQueueItems.Add(new SyncQueue
                {
                    TableName = "sms_procedure_acknowledgements",
                    RecordKey = ack.Id.ToString(),
                    ActionType = SyncActionType.CREATE,
                    Payload = payload,
                    Priority = SyncPriority.Operational,
                    CreatedAt = now,
                    RetryCount = 0,
                    MaxRetries = 5,
                    NextRetryAt = now
                });


            }
        }

        if (syncQueueItems.Count > 0)
        {
            await dbContext.SyncQueue.AddRangeAsync(syncQueueItems, ct);
            await dbContext.SaveChangesAsync(ct);
            _logger.LogInformation("✅ Enqueued {Count} SMS sync items to SyncQueue", syncQueueItems.Count);
        }
    }
}
