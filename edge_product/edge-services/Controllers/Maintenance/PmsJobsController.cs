using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Maintenance;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Controllers.Maintenance;

[ApiController, Route("api/pms/jobs"), PmsReworkEndpoint]
public sealed class PmsJobsController(PmsJobService jobs, EdgeDbContext db, IEdgeRuntimeConfigService runtime) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] PmsJobQuery query, CancellationToken token) => Ok(await jobs.ListAsync(query, token));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Detail(Guid id, CancellationToken token) => Ok(await jobs.DetailAsync(id, token));

    [HttpPost("import")]
    public async Task<IActionResult> Import([FromBody] ImportPmsJobsDto dto, CancellationToken token)
    {
        var actor = HttpContext.GetUserId() ?? throw new PmsRequestException(401, "Cần đăng nhập.");
        var node = await NodeAsync();
        var result = await jobs.ImportAsync(dto, actor, node, token);
        return dto.ValidateOnly || result.Valid ? Ok(result) : BadRequest(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] SavePmsJobDto dto, CancellationToken token)
    {
        var actor = HttpContext.GetUserId() ?? throw new PmsRequestException(401, "Cần đăng nhập.");
        var node = await NodeAsync();
        if (string.IsNullOrWhiteSpace(node)) throw new PmsRequestException(503, "Chưa xác định danh tính tàu.");
        var id = await jobs.SaveAsync(null, dto, actor, node, token);
        return Created($"/api/pms/jobs/{id}", new { id, detail = await jobs.DetailAsync(id, token), workOrderCreated = false });
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] SavePmsJobDto dto, CancellationToken token)
    {
        var actor = HttpContext.GetUserId() ?? throw new PmsRequestException(401, "Cần đăng nhập.");
        // Existing origin is preserved; an update cannot claim to be a different node.
        await jobs.SaveAsync(id, dto, actor, "", token);
        return Ok(new { id, detail = await jobs.DetailAsync(id, token), workOrderCreated = false });
    }

    [HttpGet("references")]
    public async Task<IActionResult> References(CancellationToken token)
    {
        // Only selector fields; Job permissions must not expose the full crew profile/account APIs.
        var crew = await db.CrewMembers.AsNoTracking().Where(c => c.IsOnboard || c.OnboardStatus == "Approved")
            .OrderBy(c => c.FullName).Select(c => new { c.Id, c.CrewId, c.FullName, c.RankId, c.Department }).ToListAsync(token);
        var ranks = await db.Ranks.AsNoTracking().Where(r => r.IsActive).OrderBy(r => r.SortOrder)
            .ThenBy(r => r.RankName).Select(r => new { r.Id, r.RankCode, r.RankName, r.Department }).ToListAsync(token);
        return Ok(new { crew, ranks });
    }

    [HttpPost("{id:guid}/state")]
    public async Task<IActionResult> ChangeState(Guid id, [FromBody] ChangePmsJobStateDto dto, CancellationToken token)
    {
        await jobs.ChangeStateAsync(id, dto, HttpContext.GetUserId() ?? throw new PmsRequestException(401, "Cần đăng nhập."), token);
        return Ok(await jobs.DetailAsync(id, token));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, [FromQuery] int expectedVersion, CancellationToken token)
    {
        await jobs.DeleteAsync(id, expectedVersion, HttpContext.GetUserId() ?? throw new PmsRequestException(401, "Cần đăng nhập."), token);
        return NoContent();
    }

    [HttpGet("{id:guid}/history")]
    public async Task<IActionResult> History(Guid id, [FromQuery] PmsHistoryQuery? query = null, CancellationToken token = default)
    {
        var result = await new PmsJobHistoryService(db).ListAsync(id, query ?? new(), token);
        return Ok(new { items = result.Items, total = result.Total, page = result.Page, pageSize = result.PageSize });
    }

    [HttpGet("{id:guid}/completed-reports/{reportId:guid}")]
    public async Task<IActionResult> CompletedReport(Guid id, Guid reportId, CancellationToken token)
    {
        if (!await db.MaintenanceSchedules.AnyAsync(j => j.Id == id && j.PmsProtocolVersion == 2, token)) return NotFound();
        var report = await db.PmsWorkOrderReports.AsNoTracking().SingleOrDefaultAsync(r => r.Id == reportId && r.JobId == id && r.Decision == "APPROVED", token);
        return report == null ? NotFound() : Ok(report);
    }

    [HttpGet("{id:guid}/history/{historyId:guid}")]
    public async Task<IActionResult> Report(Guid id, Guid historyId, CancellationToken token)
    {
        if (!await db.MaintenanceSchedules.AnyAsync(j => j.Id == id && j.PmsProtocolVersion == 2, token)) return NotFound();
        var history = await db.MaintenanceHistories.AsNoTracking().SingleOrDefaultAsync(h => h.Id == historyId && h.ScheduleId == id, token);
        if (history == null) return NotFound();
        return Ok(new { history.Id, history.TaskId, sourceExecutedAt = history.ExecutedAt, isLegacy = true,
            timeSource = "LEGACY_EXECUTED_AT", history.CompletedBy, history.ReportSnapshot, history.Notes, history.SparePartsUsed });
    }

    private async Task<string> NodeAsync()
    {
        try
        {
            var node = (await runtime.GetSyncConfigAsync()).NodeId;
            return !string.IsNullOrWhiteSpace(node) ? node : throw new PmsRequestException(503, "Chưa xác định danh tính tàu.");
        }
        catch (Exception e) when (e is ProvisioningRequiredException or ConfigInvalidException)
        { throw new PmsRequestException(503, "Chưa có cấu hình danh tính tàu hợp lệ để ghi Job."); }
    }
}
