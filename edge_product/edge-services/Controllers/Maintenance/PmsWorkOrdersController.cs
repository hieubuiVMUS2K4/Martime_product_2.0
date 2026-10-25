using MaritimeEdge.DTOs;
using MaritimeEdge.Data;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Services.Maintenance;
using Microsoft.AspNetCore.Mvc;

namespace MaritimeEdge.Controllers.Maintenance;

[ApiController, Route("api/pms/work-orders"), PmsReworkEndpoint]
public sealed class PmsWorkOrdersController(PmsWorkOrderReadService orders, PmsWorkOrderWorkflowService workflow, EdgeDbContext db,
    IEdgeRuntimeConfigService runtime, IConfiguration? configuration = null) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] PmsWorkOrderQuery query, CancellationToken token) => Ok(await orders.ListAsync(query, token));

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Detail(Guid id, CancellationToken token) => Ok(await orders.DetailAsync(id, token));

    private long UserId => HttpContext.GetUserId() ?? throw new PmsRequestException(401, "Cần đăng nhập.");
    private string Device => Request.Headers["X-Device-Type"].FirstOrDefault()?.ToUpperInvariant() ?? "WEB";
    [HttpGet("settings")]
    public IActionResult Settings()
    {
        var zone = configuration?["Pms:VesselTimeZone"];
        if (string.IsNullOrWhiteSpace(zone)) throw new PmsRequestException(503, "Chưa cấu hình múi giờ tàu cho PMS.");
        try { var resolved = TimeZoneInfo.FindSystemTimeZoneById(zone); return Ok(new { vesselTimeZone = TimeZoneInfo.TryConvertWindowsIdToIanaId(resolved.Id, out var iana) ? iana : resolved.Id, automaticReleaseEnabled = false }); }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException)
        { throw new PmsRequestException(503, "Múi giờ tàu không hợp lệ."); }
    }
    [HttpPost("ad-hoc")]
    public async Task<IActionResult> CreateAdHoc(CreatePmsAdHocOrderDto dto, CancellationToken token)
    {
        string node;
        try { node = (await runtime.GetSyncConfigAsync()).NodeId; }
        catch (Exception e) when (e is ProvisioningRequiredException or ConfigInvalidException)
        { throw new PmsRequestException(503, "Chưa có cấu hình danh tính tàu hợp lệ để tạo WO."); }
        return Ok(await workflow.CreateAdHocAsync(dto, UserId, node, Device, token));
    }
    [HttpPut("{id:guid}/draft")]
    public async Task<IActionResult> UpdateDraft(Guid id, UpdatePmsAdHocDraftDto dto, CancellationToken token) =>
        Ok(await workflow.UpdateAdHocDraftAsync(id, dto, UserId, Device, token));
    [HttpPost("{id:guid}/issue")]
    public async Task<IActionResult> IssueDraft(Guid id, IssuePmsAdHocDraftDto dto, CancellationToken token) =>
        Ok(await workflow.IssueAdHocDraftAsync(id, dto, UserId, Device, token));
    [HttpDelete("{id:guid}/draft")]
    public async Task<IActionResult> DeleteDraft(Guid id, [FromQuery] int expectedVersion, CancellationToken token) =>
        Ok(await workflow.DeleteAdHocDraftAsync(id, expectedVersion, UserId, Device, token));
    [HttpGet("references")]
    public async Task<IActionResult> References(CancellationToken token) => Ok(await db.CrewMembers.AsNoTracking()
        .Where(c => c.Rank != null && c.Rank.IsActive && (c.IsOnboard || c.OnboardStatus == "Approved"))
        .OrderBy(c => c.FullName).Select(c => new { c.Id, c.CrewId, c.FullName, c.RankId, c.Department }).ToListAsync(token));
    [HttpGet("material-options")]
    public async Task<IActionResult> MaterialOptions([FromQuery] PmsMaterialOptionQuery query, CancellationToken token)
    {
        if (query.Page < 1 || query.Page > 100000 || query.PageSize is < 1 or > 200) throw new PmsRequestException(400, "Phân trang không hợp lệ.");
        var source = db.MaterialItems.AsNoTracking().AsQueryable();
        if (!string.IsNullOrEmpty(query.SelectedIds))
        {
            var keys = query.SelectedIds.Split(',');
            if (keys.Length > 200 || keys.Any(k => !Guid.TryParse(k, out _))) throw new PmsRequestException(400, "Danh sách vật tư không hợp lệ.");
            var ids = keys.Select(Guid.Parse).Distinct().ToArray(); source = source.Where(m => ids.Contains(m.Id));
        }
        if (!string.IsNullOrWhiteSpace(query.Search)) { var term = query.Search.Trim().ToLower(); source = source.Where(m => m.ItemCode.ToLower().Contains(term) || m.Name.ToLower().Contains(term)); }
        var total = await source.CountAsync(token);
        var items = await source.OrderBy(m => m.Name).ThenBy(m => m.Id).Skip((query.Page - 1) * query.PageSize).Take(query.PageSize)
            .Select(m => new { m.Id, m.ItemCode, m.Name, m.Unit, onHand = db.InventoryStocks.Where(s => s.MaterialItemId == m.Id).Sum(s => (decimal?)s.Quantity) ?? 0m }).ToListAsync(token);
        return Ok(new { items, total, query.Page, query.PageSize });
    }
    [HttpGet("equipment-tree")]
    public async Task<IActionResult> EquipmentTree(CancellationToken token) => Ok(await db.EquipmentAssets.AsNoTracking()
        .Where(a => a.IsActive).OrderBy(a => a.AssetName).ThenBy(a => a.Id)
        .Select(a => new { a.Id, a.AssetCode, a.AssetName, a.Category, a.ParentId, a.IsActive, a.Status }).ToListAsync(token));
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
