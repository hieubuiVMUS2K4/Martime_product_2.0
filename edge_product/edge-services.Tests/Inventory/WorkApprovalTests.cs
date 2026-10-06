using MaritimeEdge.Controllers.Maintenance;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Repositories;
using MaritimeEdge.Services.Maintenance;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace MaritimeEdge.Tests.Inventory;

public class WorkApprovalTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ReviewOtherPerformersTask_RecordsReviewerWithoutOverwritingPerformer(bool bulk)
    {
        await using var db = new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options) { SuppressSyncQueue = true };
        var task = new MaintenanceTask { TaskId = "REVIEW-OTHER-CREW", Status = "PENDING_APPROVAL",
            AssignedTo = "PERFORMER", StartedBy = "PERFORMER", SubmittedBy = "PERFORMER" };
        db.MaintenanceTasks.Add(task); await db.SaveChangesAsync();
        var completion = new MaintenanceCompletionService(db, new MaintenanceScheduleRepository(db),
            Mock.Of<IEquipmentAssetRepository>(), NullLogger<MaintenanceCompletionService>.Instance);
        var http = new DefaultHttpContext(); http.Items["WorkflowActorId"] = "admin";
        var controller = new TaskWorkflowController(db, NullLogger<TaskWorkflowController>.Instance, completion)
            { ControllerContext = new ControllerContext { HttpContext = http } };
        var result = bulk
            ? await controller.BulkVerifyTasks(new BulkVerifyTaskDto { TaskIds = [task.Id], Action = "APPROVE" })
            : await controller.VerifyTask(task.Id, new VerifyTaskDto { Action = "APPROVE" });
        Assert.IsType<OkObjectResult>(result);
        Assert.Equal("COMPLETED", task.Status);
        Assert.Equal("admin", task.VerifiedBy);
        Assert.Equal("admin", task.ApprovedBy);
        Assert.Equal("PERFORMER", task.CompletedBy);
        Assert.Equal("PERFORMER", task.AssignedTo);
    }
}
