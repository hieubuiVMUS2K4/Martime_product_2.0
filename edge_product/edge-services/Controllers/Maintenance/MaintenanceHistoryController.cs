using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using MaritimeEdge.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Controllers.Maintenance;

[ApiController]
[Route("api/maintenance/tasks/{taskId:guid}/history")]
public class MaintenanceHistoryController(EdgeDbContext db) : ControllerBase
{
    [HttpGet("/api/maintenance/history")]
    public async Task<IActionResult> GetAllExecutions()
    {
        // History must survive the current task moving back to DUE for another cycle.
        var executions = await (from h in db.MaintenanceHistories.AsNoTracking()
            join t in db.MaintenanceTasks.AsNoTracking() on h.TaskId equals t.Id
            orderby h.ExecutedAt descending
            select new { History = h, Task = t }).Take(1000).ToListAsync();
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web) { ReferenceHandler = ReferenceHandler.IgnoreCycles };
        var data = new List<JsonObject>();
        foreach (var entry in executions)
        {
            var report = entry.History.ReportSnapshot == null ? null : JsonNode.Parse(entry.History.ReportSnapshot);
            var item = (report?["task"]?.DeepClone() ?? JsonSerializer.SerializeToNode(entry.Task, options))!.AsObject();
            item["id"] = entry.History.Id.ToString();
            item["originalTaskId"] = entry.Task.Id.ToString();
            item["completedAt"] = entry.History.ExecutedAt;
            item["status"] = "COMPLETED";
            item["notes"] = entry.History.Notes;
            item["sparePartsUsed"] = entry.History.SparePartsUsed;
            data.Add(item);
        }
        var legacy = await db.MaintenanceTasks.AsNoTracking().Where(t => !t.IsDeleted && t.Status == "COMPLETED" &&
            !db.MaintenanceHistories.Any(h => h.TaskId == t.Id)).Take(1000).ToListAsync();
        data.AddRange(legacy.Select(t => JsonSerializer.SerializeToNode(t, options)!.AsObject()));
        return Ok(new { data });
    }

    [HttpGet]
    public async Task<IActionResult> GetHistory(Guid taskId, int page = 1, int pageSize = 10)
    {
        var task = await db.MaintenanceTasks.AsNoTracking().FirstOrDefaultAsync(t => t.Id == taskId);
        if (task == null) return NotFound();
        var relatedIds = db.MaintenanceTasks.Where(t => t.Id == task.Id ||
            (task.ScheduleId.HasValue && t.ScheduleId == task.ScheduleId &&
             t.EquipmentAssetId == task.EquipmentAssetId && t.EquipmentGroupId == task.EquipmentGroupId)).Select(t => t.Id);
        var query = db.MaintenanceHistories.AsNoTracking().Where(h => relatedIds.Contains(h.TaskId));
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 50);
        var total = await query.CountAsync();
        var items = await query.OrderByDescending(h => h.ExecutedAt).ThenByDescending(h => h.CreatedAt)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(h => new { h.Id, h.ExecutedAt, h.ExecutedRunningHours, h.CompletedBy,
                CompletedByName = db.CrewMembers.Where(c => c.CrewId == h.CompletedBy).Select(c => c.FullName).FirstOrDefault(),
                h.ActualDurationHours, h.Notes, HasReport = h.ReportSnapshot != null }).ToListAsync();
        return Ok(new { items, total, page, pageSize });
    }

    [HttpGet("{historyId:guid}")]
    public async Task<IActionResult> GetReport(Guid taskId, Guid historyId)
    {
        var task = await db.MaintenanceTasks.AsNoTracking().FirstOrDefaultAsync(t => t.Id == taskId);
        if (task == null) return NotFound();
        var relatedIds = db.MaintenanceTasks.Where(t => t.Id == task.Id ||
            (task.ScheduleId.HasValue && t.ScheduleId == task.ScheduleId &&
             t.EquipmentAssetId == task.EquipmentAssetId && t.EquipmentGroupId == task.EquipmentGroupId)).Select(t => t.Id);
        var history = await db.MaintenanceHistories.AsNoTracking()
            .FirstOrDefaultAsync(h => h.Id == historyId && relatedIds.Contains(h.TaskId));
        if (history == null) return NotFound();
        return Ok(new { history.Id, history.ExecutedAt, history.CompletedBy, history.Notes, history.SparePartsUsed,
            Report = history.ReportSnapshot == null ? (JsonElement?)null : JsonSerializer.Deserialize<JsonElement>(history.ReportSnapshot) });
    }
}
