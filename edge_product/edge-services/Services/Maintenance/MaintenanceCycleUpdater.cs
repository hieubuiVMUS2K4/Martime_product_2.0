using MaritimeEdge.Constants;
using MaritimeEdge.Data;
using MaritimeEdge.Services.Inventory;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

/// <summary>Updates existing periodic tasks only. Does not generate tasks or edit configuration.</summary>
public sealed class MaintenanceCycleUpdater(EdgeDbContext db)
{
    public async Task<int> RefreshAsync(DateTime now, Guid? assetId = null, CancellationToken token = default)
    {
        // Share the approval lock so a background tick cannot reset a partially saved report.
        await using var transaction = db.Database.CurrentTransaction == null ? await InventoryWriteScope.BeginAsync(db) : null;
        var tasks = await db.MaintenanceTasks.Where(t => !t.IsDeleted && t.ScheduleId.HasValue &&
            (t.Status == "COMPLETED" || t.Status == "SCHEDULED" || t.Status == "UPCOMING" || t.Status == "DUE" || t.Status == "OVERDUE") &&
            db.MaintenanceSchedules.Any(s => s.Id == t.ScheduleId && s.MaintenanceCategory == "PERIODIC" && s.IsActive && s.AutoGenerate &&
                (!assetId.HasValue || s.EquipmentAssetId == assetId || db.EquipmentGroupMembers.Any(m => m.GroupId == s.EquipmentGroupId && m.AssetId == assetId))))
            .ToListAsync(token);
        if (tasks.Count == 0)
        {
            if (transaction != null) await transaction.CommitAsync(token);
            return 0;
        }
        var scheduleIds = tasks.Select(t => t.ScheduleId!.Value).Distinct().ToArray();
        var schedules = await db.MaintenanceSchedules.AsNoTracking().Where(s => scheduleIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, token);
        var assetIds = tasks.Where(t => t.EquipmentAssetId.HasValue).Select(t => t.EquipmentAssetId!.Value)
            .Concat(schedules.Values.Where(s => s.EquipmentAssetId.HasValue).Select(s => s.EquipmentAssetId!.Value)).Distinct().ToArray();
        var hours = await db.EquipmentAssets.AsNoTracking().Where(a => assetIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, a => a.CurrentRunningHours, token);
        var groupIds = tasks.Where(t => t.EquipmentGroupId.HasValue).Select(t => t.EquipmentGroupId!.Value)
            .Concat(schedules.Values.Where(s => s.EquipmentGroupId.HasValue).Select(s => s.EquipmentGroupId!.Value)).Distinct().ToArray();
        var groupHours = await db.EquipmentGroupMembers.Where(m => groupIds.Contains(m.GroupId)).GroupBy(m => m.GroupId)
            .Select(g => new { Id = g.Key, Hours = g.Max(m => m.Asset.CurrentRunningHours) }).ToDictionaryAsync(g => g.Id, g => g.Hours, token);
        var changed = 0;
        foreach (var task in tasks)
        {
            token.ThrowIfCancellationRequested();
            if (!schedules.TryGetValue(task.ScheduleId!.Value, out var schedule) ||
                (!MaintenanceCalendar.HasInterval(schedule) && !(schedule.IntervalHours > 0))) continue;
            double? current = null;
            var trackingAsset = task.EquipmentAssetId ?? schedule.EquipmentAssetId;
            var trackingGroup = task.EquipmentGroupId ?? schedule.EquipmentGroupId;
            if (trackingAsset.HasValue) hours.TryGetValue(trackingAsset.Value, out current);
            else if (trackingGroup.HasValue) groupHours.TryGetValue(trackingGroup.Value, out current);
            if (await PeriodicTaskCycle.ReopenIfDueAsync(db, task, schedule, current, now, prepareNextCycle: true)) changed++;
        }
        if (changed > 0) await db.SaveChangesAsync(token);
        if (transaction != null) await transaction.CommitAsync(token);
        return changed;
    }
}
