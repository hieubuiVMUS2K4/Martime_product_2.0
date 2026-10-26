using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

public sealed record PmsReleaseBatchResult(int Scanned, int Created, int Skipped,
    IReadOnlyList<Guid> FailedJobIds, Guid? NextCursor);

/// <summary>
/// Bounded worker core for protocol-2 periodic Jobs. Intentionally not hosted or
/// exposed as an endpoint until sync capability and reset fencing are ready.
/// Each Job has its own transaction/context: a corrupt Job cannot poison others.
/// </summary>
public sealed class PmsPeriodicReleaseSweep(IServiceScopeFactory scopes, ILogger<PmsPeriodicReleaseSweep> logger)
{
    public async Task<PmsReleaseBatchResult> RunBatchAsync(DateTime nowUtc, TimeZoneInfo vesselTimeZone,
        Guid? afterJobId = null, int batchSize = 100, CancellationToken token = default)
    {
        if (nowUtc.Kind != DateTimeKind.Utc) throw new ArgumentException("A UTC instant is required.", nameof(nowUtc));
        ArgumentNullException.ThrowIfNull(vesselTimeZone);
        if (batchSize is < 1 or > 200) throw new ArgumentOutOfRangeException(nameof(batchSize));
        List<Guid> ids;
        await using (var scope = scopes.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();
            var jobs = db.MaintenanceSchedules.AsNoTracking().Where(j =>
                j.PmsProtocolVersion == PmsJobRules.ProtocolVersion && j.JobState == PmsJobRules.Active &&
                j.IsActive && j.AutoGenerate && j.MaintenanceCategory == "PERIODIC");
            if (afterJobId.HasValue) jobs = jobs.Where(j => j.Id.CompareTo(afterJobId.Value) > 0);
            ids = await jobs.OrderBy(j => j.Id).Select(j => j.Id).Take(batchSize + 1).ToListAsync(token);
        }
        var hasMore = ids.Count > batchSize;
        if (hasMore) ids.RemoveAt(batchSize);
        var created = 0; var skipped = 0; var failed = new List<Guid>();
        foreach (var id in ids)
        {
            token.ThrowIfCancellationRequested();
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();
                var result = await new PmsWorkOrderReleaseService(db).ReleasePeriodicWithResultAsync(
                    id, nowUtc, vesselTimeZone, automatic: true, token: token);
                if (result.Created) created++; else skipped++;
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { throw; }
            catch (Exception error)
            {
                failed.Add(id);
                logger.LogWarning(error, "Could not release periodic Work Order for Job {JobId}; continuing batch", id);
            }
        }
        return new(ids.Count, created, skipped, failed, hasMore ? ids[^1] : null);
    }
}
