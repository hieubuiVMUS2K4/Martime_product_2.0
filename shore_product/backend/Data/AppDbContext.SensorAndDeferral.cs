using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProductApi.Models;

namespace ProductApi.Data;

public partial class AppDbContext
{
    private static void ConfigureSensorAndDeferralMirrors(ModelBuilder builder)
    {
        ConfigureSensor(builder.Entity<NmeaRawData>(), "nmea_raw_data");
        ConfigureSensor(builder.Entity<NavigationData>(), "navigation_data");
        ConfigureSensor(builder.Entity<EnvironmentalData>(), "environmental_data");
        builder.Entity<TaskDeferralRequest>(entity =>
        {
            entity.ToTable("task_deferral_request");
            entity.HasOne<Vessel>().WithMany().HasForeignKey(e => e.VesselId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(e => e.Task).WithMany().HasForeignKey(e => e.TaskId).OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(e => e.TaskId);
            entity.HasIndex(e => new { e.VesselId, e.Status, e.RequestedAt });
        });
    }

    private static void ConfigureSensor<T>(EntityTypeBuilder<T> entity, string table) where T : class
    {
        entity.ToTable(table);
        entity.HasOne<Vessel>().WithMany().HasForeignKey("VesselId").OnDelete(DeleteBehavior.Restrict);
        entity.HasIndex("VesselId", "Timestamp");
    }
}
