using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Services.Maintenance;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Controllers.Maintenance;

[ApiController, Route("api/pms/counters"), PmsReworkEndpoint]
public sealed class PmsCountersController(EdgeDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] PmsCounterQuery query, CancellationToken token)
    {
        PmsJobService.ValidatePage(query.Page, query.PageSize);
        var source = db.EquipmentAssets.AsNoTracking().Where(a => a.IsActive && a.Category != "SYSTEM");
        if (query.EquipmentAssetId.HasValue) source = source.Where(a => a.Id == query.EquipmentAssetId);
        if (!string.IsNullOrWhiteSpace(query.Code)) { var term = query.Code.Trim().ToLower(); source = source.Where(a => a.AssetCode.ToLower().Contains(term)); }
        if (!string.IsNullOrWhiteSpace(query.Name)) { var term = query.Name.Trim().ToLower(); source = source.Where(a => a.AssetName.ToLower().Contains(term)); }
        var total = await source.CountAsync(token);
        var items = await source.OrderBy(a => a.AssetName).ThenBy(a => a.Id).Skip((query.Page - 1) * query.PageSize).Take(query.PageSize)
            .Select(a => new { a.Id, a.AssetCode, a.AssetName, a.CurrentRunningHours, a.LastRunningHoursUpdate }).ToListAsync(token);
        return Ok(new { items, total, query.Page, query.PageSize });
    }
}
