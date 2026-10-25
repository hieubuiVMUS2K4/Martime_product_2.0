using System.Text.Json;
using MaritimeEdge.Controllers.Maintenance;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Repositories;
using MaritimeEdge.Services.Maintenance;
using MaritimeEdge.Services.Core;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Configuration;
using Moq;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

[Collection("PMS inventory")]
public class WebWorkExecutionTests(PmsDatabaseFixture database)
{
    [PmsPostgresFact]
    public async Task DraftWriteAndSubmit_AreSerializedSoPendingApprovalCannotBeChangedByALateSave()
    {
        var id = Guid.NewGuid();
        await using (var seed = database.CreateContext())
        {
            seed.MaintenanceTasks.Add(new() { Id = id, TaskId = id.ToString(), Status = "IN_PROGRESS" });
            await seed.SaveChangesAsync();
        }
        await using var savingDb = database.CreateContext();
        await using var submittingDb = database.CreateContext();
        var reachedSave = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseSave = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var reachedSubmit = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task Run(EdgeDbContext db, bool save)
        {
            var controller = Controller(db);
            controller.Request.Method = save ? "PUT" : "POST";
            var descriptor = new ControllerActionDescriptor { ControllerName = "TaskWorkflow", ActionName = save ? "SaveProgress" : "SubmitTask" };
            var context = new ActionContext(controller.HttpContext, new(), descriptor, new ModelStateDictionary());
            var dto = new SubmitTaskDto { Notes = save ? "Saved before submission" : null };
            var executing = new ActionExecutingContext(context, [], new Dictionary<string, object?> { ["id"] = id, ["dto"] = dto }, controller);
            var runtime = Mock.Of<IEdgeRuntimeConfigService>();
            var approvals = new ApprovalService(db, new RankPermissionService(db), runtime, Mock.Of<ISyncFileStorageService>(), new ConfigurationBuilder().Build());
            var filter = new ApprovalActionFilter(db, approvals, runtime);
            await filter.OnActionExecutionAsync(executing, async () =>
            {
                if (save) { reachedSave.SetResult(); await releaseSave.Task.WaitAsync(TimeSpan.FromSeconds(20)); }
                else reachedSubmit.SetResult();
                var result = save ? await controller.SaveProgress(id, dto) : await controller.SubmitTask(id, dto);
                Assert.IsType<OkObjectResult>(result);
                return new ActionExecutedContext(context, [], controller) { Result = result };
            });
        }
        var saving = Run(savingDb, true);
        await reachedSave.Task.WaitAsync(TimeSpan.FromSeconds(20));
        var submitting = Run(submittingDb, false);
        try { await Task.Delay(100); Assert.False(reachedSubmit.Task.IsCompleted); }
        finally { releaseSave.TrySetResult(); }
        await Task.WhenAll(saving, submitting).WaitAsync(TimeSpan.FromSeconds(20));
        await using var verify = database.CreateContext();
        var stored = await verify.MaintenanceTasks.SingleAsync(t => t.Id == id);
        Assert.Equal("PENDING_APPROVAL", stored.Status);
        Assert.Equal("Saved before submission", stored.Notes);
    }

    private static TaskWorkflowController Controller(EdgeDbContext db)
    {
        var completion = new MaintenanceCompletionService(db, new MaintenanceScheduleRepository(db),
            Mock.Of<IEquipmentAssetRepository>(), NullLogger<MaintenanceCompletionService>.Instance);
        var controller = new TaskWorkflowController(db, NullLogger<TaskWorkflowController>.Instance, completion)
        { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() } };
        controller.HttpContext.Items["WorkflowActorId"] = "WEB-CREW";
        controller.Request.Headers["X-Device-Type"] = "WEB";
        return controller;
    }

    [PmsPostgresFact]
    public async Task WebExecution_SaveSubmitReturnAndApproval_KeepOnePeriodicTaskAndPostStockOnlyOnApproval()
    {
        await using var db = database.CreateContext();
        var code = Guid.NewGuid().ToString("N");
        var asset = new EquipmentAsset { AssetCode = code, AssetName = "Web engine", Category = "ENGINE", CurrentRunningHours = 100 };
        var schedule = new MaintenanceSchedule { ScheduleCode = code, ScheduleName = "Web cycle", EquipmentAssetId = asset.Id,
            MaintenanceCategory = "PERIODIC", IntervalType = "CALENDAR", IntervalDays = 30, AutoGenerate = true, IsActive = true };
        var task = new MaintenanceTask { TaskId = code, TaskDescription = "Preserve task configuration", ScheduleId = schedule.Id,
            EquipmentAssetId = asset.Id, EquipmentId = code, TaskType = "PERIODIC", AssignedTo = "WEB-CREW", Status = "DUE", RequiredPhotos = 1 };
        var category = new MaterialCategory { CategoryCode = code, Name = "Web parts" };
        db.MaterialCategories.Add(category); await db.SaveChangesAsync();
        var material = new MaterialItem { ItemCode = code, Name = "Spare", CategoryId = category.Id, OnHandQuantity = 10 };
        var location = new StoreLocation { LocationCode = code, Name = "Web store" };
        var stock = new InventoryStock { MaterialItemId = material.Id, StoreLocationId = location.Id, Quantity = 10 };
        var check = new TaskChecklistItem { TaskId = code, AssetId = asset.Id, AssetCode = code, AssetName = asset.AssetName, CheckpointDescription = "Pressure" };
        db.EquipmentAssets.Add(asset); db.MaintenanceSchedules.Add(schedule); db.MaintenanceTasks.Add(task);
        db.MaterialItems.Add(material); db.StoreLocations.Add(location); db.InventoryStocks.Add(stock); db.TaskChecklistItems.Add(check);
        await db.SaveChangesAsync();
        var controller = Controller(db);
        Assert.IsType<OkObjectResult>(await controller.StartTask(task.Id, new() { CurrentRunningHours = 100 }));
        Assert.Equal("IN_PROGRESS", task.Status);
        var draft = new SubmitTaskDto { Notes = "Web execution report", CompletedRunningHours = 120, ActualDurationMinutes = 45,
            SparePartsUsed = JsonSerializer.Serialize(new[] { new { MaterialItemId = material.Id, QuantityUsed = 2 } }) };
        Assert.IsType<OkObjectResult>(await controller.SaveProgress(task.Id, draft));
        Assert.Equal(10, stock.Quantity); Assert.Equal(100, asset.CurrentRunningHours);
        Assert.Equal("IN_PROGRESS", task.Status); Assert.Null(task.SubmittedAt);
        Assert.Equal("Preserve task configuration", task.TaskDescription); Assert.Equal("WEB-CREW", task.AssignedTo);
        Assert.IsType<BadRequestObjectResult>(await controller.SubmitTask(task.Id, draft));
        check.IsCompleted = true; await db.SaveChangesAsync();
        Assert.IsType<OkObjectResult>(await controller.SubmitTask(task.Id, draft));
        Assert.Equal("PENDING_APPROVAL", task.Status); Assert.Equal(10, stock.Quantity);
        Assert.IsType<ConflictObjectResult>(await controller.SaveProgress(task.Id, new() { Notes = "Forbidden edit" }));
        Assert.Equal(draft.Notes, task.Notes);
        controller.HttpContext.Items["WorkflowActorId"] = "REVIEWER";
        Assert.IsType<OkObjectResult>(await controller.VerifyTask(task.Id, new() { Action = "REJECT", RejectionReason = "Recheck" }));
        Assert.Equal("RECTIFY", task.Status); Assert.Equal(10, stock.Quantity);
        controller.HttpContext.Items["WorkflowActorId"] = "WEB-CREW";
        Assert.IsType<OkObjectResult>(await controller.StartTask(task.Id, new()));
        draft.Notes = "Rechecked web report";
        Assert.IsType<OkObjectResult>(await controller.SubmitTask(task.Id, draft));
        controller.HttpContext.Items["WorkflowActorId"] = "REVIEWER";
        Assert.IsType<OkObjectResult>(await controller.VerifyTask(task.Id, new() { Action = "APPROVE" }));
        Assert.Equal(8, stock.Quantity); Assert.Equal(120, asset.CurrentRunningHours);
        Assert.Equal("SCHEDULED", task.Status);
        Assert.Equal(1, await db.MaintenanceTasks.CountAsync(t => t.TaskId == code));
        var history = await db.MaintenanceHistories.SingleAsync(h => h.TaskId == task.Id);
        Assert.Contains(draft.Notes, history.ReportSnapshot!);
        Assert.All(await db.TaskStatusHistories.Where(h => h.TaskId == task.Id && h.ChangedBy == "WEB-CREW").ToListAsync(), h => Assert.Equal("WEB", h.DeviceType));
        Assert.True(await db.SyncQueue.AnyAsync(q => q.RecordKey == task.Id.ToString() && q.TableName == "maintenance_task"));
    }

    [PmsPostgresFact]
    public async Task DraftRejectsInvalidHoursAndDuration_AndCannotChangeAClosedTask()
    {
        await using var db = database.CreateContext();
        var code = Guid.NewGuid().ToString("N");
        var asset = new EquipmentAsset { AssetCode = code, AssetName = "Engine", CurrentRunningHours = 100 };
        var task = new MaintenanceTask { TaskId = code, Status = "IN_PROGRESS", EquipmentAssetId = asset.Id, Notes = "Keep" };
        db.EquipmentAssets.Add(asset); db.MaintenanceTasks.Add(task); await db.SaveChangesAsync();
        var controller = Controller(db);
        foreach (var draft in new SubmitTaskDto[] { new() { CompletedRunningHours = 99 }, new() { CompletedRunningHours = double.NaN }, new() { ActualDurationMinutes = -1 } })
            Assert.IsType<BadRequestObjectResult>(await controller.SaveProgress(task.Id, draft));
        Assert.Equal("Keep", task.Notes); Assert.Null(task.ActualRunningHours);
        foreach (var status in new[] { "SCHEDULED", "RECTIFY", "PENDING_APPROVAL", "COMPLETED", "CANCELLED" })
        {
            task.Status = status; await db.SaveChangesAsync();
            Assert.IsType<ConflictObjectResult>(await controller.SaveProgress(task.Id, new() { Notes = "Changed" }));
            Assert.Equal("Keep", task.Notes);
        }
    }

    [PmsPostgresFact]
    public async Task SubmissionDoesNotRequirePhotos_AndPreservesHistoricalEvidence()
    {
        await using var db = database.CreateContext();
        var task = new MaintenanceTask { TaskId = Guid.NewGuid().ToString("N"), Status = "IN_PROGRESS", RequiredPhotos = 2,
            CompletionPhotos = "[\"historical.jpg\"]", PhotosUploaded = 1 };
        db.MaintenanceTasks.Add(task); await db.SaveChangesAsync();
        var controller = Controller(db);
        Assert.IsType<OkObjectResult>(await controller.SaveProgress(task.Id, new() { Notes = "No new photos" }));
        Assert.IsType<OkObjectResult>(await controller.SubmitTask(task.Id, new()));
        Assert.Equal("PENDING_APPROVAL", task.Status);
        Assert.Equal("[\"historical.jpg\"]", task.CompletionPhotos);
        Assert.Equal(1, task.PhotosUploaded);
    }
}
