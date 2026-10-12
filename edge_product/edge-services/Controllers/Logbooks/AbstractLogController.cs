using Microsoft.AspNetCore.Mvc;
using MaritimeEdge.Services.AbstractLog;
using MaritimeEdge.DTOs;

namespace MaritimeEdge.Controllers.Logbooks;

/// <summary>
/// Abstract Log (Nhật ký vắn tắt) API Controller
/// </summary>
[ApiController]
[Route("api/logbooks/abstract-log")]
public class AbstractLogController : ControllerBase
{
    private readonly IAbstractLogService _service;
    private readonly ILogger<AbstractLogController> _logger;

    public AbstractLogController(IAbstractLogService service, ILogger<AbstractLogController> logger)
    {
        _service = service;
        _logger = logger;
    }

    // ── VOYAGE-LEVEL ──

    /// <summary>List all abstract logs (optionally filter by voyageId)</summary>
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? voyageId)
    {
        var list = await _service.GetAllAsync(voyageId);
        return Ok(list);
    }

    /// <summary>Get abstract log detail with legs + daily entries</summary>
    [HttpGet("{id}")]
    public async Task<IActionResult> GetDetail(Guid id)
    {
        var result = await _service.GetDetailAsync(id);
        if (result == null) return NotFound();
        return Ok(result);
    }

    /// <summary>Create abstract log for a voyage (auto-fills from voyage data)</summary>
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAbstractLogDto dto)
    {
        try
        {
            var result = await _service.CreateAsync(dto);
            return CreatedAtAction(nameof(GetDetail), new { id = result.Id }, result);
        }
        catch (InvalidOperationException)
        {
            return BadRequest(new { error = "An internal error occurred." });
        }
    }

    /// <summary>Update abstract log summary (SUM sheet fields)</summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateAbstractLogVoyageDto dto)
    {
        var result = await _service.UpdateVoyageAsync(id, dto);
        if (result == null) return NotFound();
        return Ok(result);
    }

    /// <summary>Delete abstract log and all related data</summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var ok = await _service.DeleteAsync(id);
        if (!ok) return NotFound();
        return NoContent();
    }

    /// <summary>Auto-fill from NoonReports, EngineLogBooks, PortCalls, etc.</summary>
    [HttpPost("{id}/auto-fill")]
    public async Task<IActionResult> AutoFill(Guid id)
    {
        var result = await _service.AutoFillAsync(id);
        if (result == null) return NotFound();
        return Ok(result);
    }

    /// <summary>Recalculate aggregation (daily → leg → voyage)</summary>
    [HttpPost("{id}/recalculate")]
    public async Task<IActionResult> Recalculate(Guid id)
    {
        var result = await _service.RecalculateAsync(id);
        if (result == null) return NotFound();
        return Ok(result);
    }

    /// <summary>Export Abstract Log as Excel (.xlsx)</summary>
    [HttpGet("{id}/export/excel")]
    public async Task<IActionResult> ExportExcel(Guid id)
    {
        var bytes = await _service.ExportExcelAsync(id);
        if (bytes == null) return NotFound();
        return File(bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"AbstractLog_{id:N}.xlsx");
    }

    /// <summary>Export Abstract Log as PDF</summary>
    [HttpGet("{id}/export/pdf")]
    public async Task<IActionResult> ExportPdf(Guid id)
    {
        var bytes = await _service.ExportPdfAsync(id);
        if (bytes == null) return NotFound();
        return File(bytes, "application/pdf", $"AbstractLog_{id:N}.pdf");
    }

    // ── LEG-LEVEL ──

    /// <summary>Add a new leg to the abstract log (auto-numbered)</summary>
    [HttpPost("{id}/legs")]
    public async Task<IActionResult> CreateLeg(Guid id, [FromBody] CreateAbstractLogLegDto dto)
    {
        try
        {
            var result = await _service.CreateLegAsync(id, dto);
            return Created($"/api/logbooks/abstract-log/{id}/legs/{result.Id}", result);
        }
        catch (InvalidOperationException)
        {
            return BadRequest(new { error = "An internal error occurred." });
        }
    }

    /// <summary>Update a leg</summary>
    [HttpPut("legs/{legId}")]
    public async Task<IActionResult> UpdateLeg(Guid legId, [FromBody] UpdateAbstractLogLegDto dto)
    {
        var result = await _service.UpdateLegAsync(legId, dto);
        if (result == null) return NotFound();
        return Ok(result);
    }

    /// <summary>Delete a leg and all its daily entries, re-sequence remaining legs</summary>
    [HttpDelete("legs/{legId}")]
    public async Task<IActionResult> DeleteLeg(Guid legId)
    {
        var ok = await _service.DeleteLegAsync(legId);
        if (!ok) return NotFound();
        return NoContent();
    }

    // ── DAILY ENTRY-LEVEL ──

    /// <summary>Add a daily entry to a leg</summary>
    [HttpPost("legs/{legId}/entries")]
    public async Task<IActionResult> CreateEntry(Guid legId, [FromBody] CreateAbstractLogDailyEntryDto dto)
    {
        try
        {
            var result = await _service.CreateDailyEntryAsync(legId, dto);
            return Created($"/api/logbooks/abstract-log/entries/{result.Id}", result);
        }
        catch (InvalidOperationException)
        {
            return BadRequest(new { error = "An internal error occurred." });
        }
        catch (Microsoft.EntityFrameworkCore.DbUpdateException)
        {
            return Conflict(new { error = "A daily entry for this date already exists in this leg." });
        }
    }

    /// <summary>Update a daily entry</summary>
    [HttpPut("entries/{entryId}")]
    public async Task<IActionResult> UpdateEntry(Guid entryId, [FromBody] UpdateAbstractLogDailyEntryDto dto)
    {
        var result = await _service.UpdateDailyEntryAsync(entryId, dto);
        if (result == null) return NotFound();
        return Ok(result);
    }

    /// <summary>Delete a daily entry</summary>
    [HttpDelete("entries/{entryId}")]
    public async Task<IActionResult> DeleteEntry(Guid entryId)
    {
        var ok = await _service.DeleteDailyEntryAsync(entryId);
        if (!ok) return NotFound();
        return NoContent();
    }
}
