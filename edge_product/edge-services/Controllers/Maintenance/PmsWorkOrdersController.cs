using MaritimeEdge.DTOs;
using MaritimeEdge.Data;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Services.Maintenance;
using Microsoft.AspNetCore.Mvc;

namespace MaritimeEdge.Controllers.Maintenance;

[ApiController, Route("api/pms/work-orders"), PmsReworkEndpoint]
public sealed class PmsWorkOrdersController(PmsWorkOrderReadService orders, PmsWorkOrderWorkflowService workflow, EdgeDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] PmsWorkOrderQuery query, CancellationToken token) => Ok(await orders.ListAsync(query, token));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Detail(Guid id, CancellationToken token) => Ok(await orders.DetailAsync(id, token));

    private long UserId => HttpContext.GetUserId() ?? throw new PmsRequestException(401, "Cần đăng nhập.");
    private string Device => Request.Headers["X-Device-Type"].FirstOrDefault()?.ToUpperInvariant() ?? "WEB";
    [HttpPost("from-job")]
    public async Task<IActionResult> Release(ReleasePmsWorkOrderDto dto, CancellationToken token) => Ok(await workflow.ReleaseAsync(dto, UserId, token));
    [HttpPost("{id:guid}/assignment")]
    public async Task<IActionResult> Assign(Guid id, AssignPmsWorkOrderDto dto, CancellationToken token) => Ok(await workflow.AssignAsync(id, dto, UserId, Device, token));
    [HttpPost("{id:guid}/start")]
    public async Task<IActionResult> Start(Guid id, StartPmsWorkOrderDto dto, CancellationToken token) => Ok(await workflow.StartAsync(id, dto, UserId, Device, token));
    [HttpPut("{id:guid}/progress")]
    public async Task<IActionResult> Save(Guid id, SavePmsExecutionDto dto, CancellationToken token) => Ok(await workflow.SaveAsync(id, dto, UserId, Device, token));
    [HttpPost("{id:guid}/submit")]
    public async Task<IActionResult> Submit(Guid id, SubmitPmsExecutionDto dto, CancellationToken token) => Ok(await workflow.SubmitAsync(id, dto, UserId, Device, token));
    private PmsApprovalEvidence Evidence() => HttpContext.Items["ApprovalActionId"] is Guid action && HttpContext.Items["ApprovalRevisionId"] is Guid revision &&
        HttpContext.Items["ApprovalContentHash"] is string hash ? new(action, revision, hash) : throw new PmsRequestException(428, "Cần xác nhận tài khoản trước khi duyệt/trả lại.");
    [HttpPost("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, DecidePmsWorkOrderDto dto, CancellationToken token) => Ok(await workflow.DecideAsync(id, dto, UserId, true, Evidence(), Device, token));
    [HttpPost("{id:guid}/return")]
    public async Task<IActionResult> Return(Guid id, DecidePmsWorkOrderDto dto, CancellationToken token) => Ok(await workflow.DecideAsync(id, dto, UserId, false, Evidence(), Device, token));
    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, CancelPmsWorkOrderDto dto, CancellationToken token) => Ok(await workflow.CancelAsync(id, dto, UserId, Device, token));
    [HttpGet("{id:guid}/reports/{revision:int}")]
    public async Task<IActionResult> Report(Guid id, int revision, CancellationToken token)
    {
        if (!await db.MaintenanceTasks.AnyAsync(t => t.Id == id && t.PmsProtocolVersion == 2 && !t.IsDeleted, token)) return NotFound();
        var report = await db.PmsWorkOrderReports.AsNoTracking().SingleOrDefaultAsync(r => r.WorkOrderId == id && r.Revision == revision, token);
        return report == null ? NotFound() : Ok(report);
    }
}
