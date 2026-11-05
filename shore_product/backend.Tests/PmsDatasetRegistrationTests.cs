using Microsoft.EntityFrameworkCore;
using ProductApi.Models;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

public partial class SyncReliabilityTests
{
    [ShorePostgresFact]
    public async Task PmsRegistrationIsIdempotentAndRejectsAnotherEpochOrStream()
    {
        await using var db = await Database();
        try
        {
            var vessel = await BindNode(db, "INIT-NODE");
            var epoch = Guid.NewGuid();
            var stream = Guid.NewGuid();
            var initialized = await PmsDatasetRegistration.InitializeAsync(db, "INIT-NODE", epoch, stream);
            Assert.Equal(vessel, initialized.VesselId);
            Assert.True(initialized.IsActive);
            await PmsDatasetRegistration.InitializeAsync(db, "INIT-NODE", epoch, stream);
            Assert.Single(await db.PmsSyncDatasets.ToListAsync());
            await Assert.ThrowsAsync<InvalidOperationException>(() => PmsDatasetRegistration.InitializeAsync(db, "INIT-NODE", Guid.NewGuid(), stream));
            await Assert.ThrowsAsync<InvalidOperationException>(() => PmsDatasetRegistration.InitializeAsync(db, "INIT-NODE", epoch, Guid.NewGuid()));
            Assert.Equal(epoch, (await db.PmsSyncDatasets.SingleAsync()).DatasetId);
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [ShorePostgresFact]
    public async Task PmsRegistrationRejectsUnregisteredNodesAndExistingOperationalData()
    {
        await using var db = await Database();
        try
        {
            await Assert.ThrowsAsync<InvalidOperationException>(() => PmsDatasetRegistration.InitializeAsync(db, "UNKNOWN", Guid.NewGuid(), Guid.NewGuid()));
            var vessel = await BindNode(db, "INIT-EXISTING");
            db.MaintenanceSchedules.Add(new MaintenanceSchedule { VesselId = vessel, ScheduleCode = "LEGACY", ScheduleName = "Existing" });
            await db.SaveChangesAsync();
            await Assert.ThrowsAsync<InvalidOperationException>(() => PmsDatasetRegistration.InitializeAsync(db, "INIT-EXISTING", Guid.NewGuid(), Guid.NewGuid()));
            Assert.Empty(await db.PmsSyncDatasets.ToListAsync());
            Assert.Single(await db.MaintenanceSchedules.ToListAsync());
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }
}
