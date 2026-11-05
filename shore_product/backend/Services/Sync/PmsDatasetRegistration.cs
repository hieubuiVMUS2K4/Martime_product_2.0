using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;

namespace ProductApi.Services.Sync;

public static class PmsDatasetRegistration
{
    public static async Task<PmsSyncDataset> InitializeAsync(AppDbContext db, string origin, Guid datasetId, Guid streamId,
        CancellationToken token = default)
    {
        if (datasetId == Guid.Empty || streamId == Guid.Empty) throw new InvalidOperationException("pms_invalid_identity");
        await using var transaction = await db.Database.BeginTransactionAsync(token);
        if (db.Database.IsNpgsql())
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({origin},0))", token);
        var vessel = await VesselSyncIdentity.ResolveVesselIdAsync(db, origin)
            ?? throw new InvalidOperationException("pms_unregistered_node");
        if (db.Database.IsNpgsql())
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({vessel.ToString()},0))", token);
        var existing = await db.PmsSyncDatasets.SingleOrDefaultAsync(d => d.OriginNode == origin, token);
        if (existing != null)
        {
            if (!existing.IsActive || existing.VesselId != vessel || existing.DatasetId != datasetId || existing.StreamId != streamId)
                throw new InvalidOperationException("pms_dataset_mismatch");
            return existing;
        }
        if (await db.PmsSyncMirrorRecords.AnyAsync(r => r.OriginNode == origin || r.VesselId == vessel, token) ||
            await db.MaintenanceSchedules.AnyAsync(j => j.VesselId == vessel, token) ||
            await db.MaintenanceTasks.AnyAsync(t => t.VesselId == vessel, token) ||
            await db.PmsSyncDatasets.AnyAsync(d => d.VesselId == vessel, token))
            throw new InvalidOperationException("pms_existing_data_requires_review");
        var dataset = new PmsSyncDataset { OriginNode = origin, VesselId = vessel, DatasetId = datasetId, StreamId = streamId, IsActive = true };
        db.PmsSyncDatasets.Add(dataset);
        await db.SaveChangesAsync(token);
        await transaction.CommitAsync(token);
        return dataset;
    }
}
