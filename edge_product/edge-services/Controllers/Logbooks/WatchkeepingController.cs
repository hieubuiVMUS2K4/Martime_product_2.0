using Microsoft.AspNetCore.Mvc;
using MaritimeEdge.Services.Logbooks;
using MaritimeEdge.DTOs.Logbooks;
using Microsoft.AspNetCore.Authorization;

namespace MaritimeEdge.Controllers.Logbooks
{
    /// <summary>
    /// Watchkeeping Logbook API Controller
    /// SOLAS Chapter V Compliant
    /// </summary>
    [ApiController]
    [Route("api/logbooks/watchkeeping")]
    public class WatchkeepingController : ControllerBase
    {
        private readonly IWatchkeepingService _service;
        private readonly ILogger<WatchkeepingController> _logger;

        public WatchkeepingController(IWatchkeepingService service, ILogger<WatchkeepingController> logger)
        {
            _service = service;
            _logger = logger;
        }

        /// <summary>
        /// Create a new Watchkeeping Log Entry
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> CreateEntry([FromBody] CreateWatchkeepingLogDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var username = User.Identity?.Name;
            var result = await _service.CreateEntryAsync(dto, username);

            if (!result.Success)
            {
                return BadRequest(new { error = result.Error });
            }

            return CreatedAtAction(
                nameof(GetEntry),
                new { id = result.Id },
                new
                {
                    id = result.Id,
                    message = "Watchkeeping log entry created successfully"
                });
        }

        /// <summary>
        /// Get Watchkeeping Log Entry by ID
        /// </summary>
        [HttpGet("{id}")]
        public async Task<IActionResult> GetEntry(Guid id)
        {
            var entry = await _service.GetEntryAsync(id);

            if (entry == null)
            {
                return NotFound(new { error = "Watchkeeping log entry not found" });
            }

            return Ok(entry);
        }

        /// <summary>
        /// Get all Watchkeeping Log Entries with pagination
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetEntries(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20,
            [FromQuery] DateTime? fromDate = null,
            [FromQuery] DateTime? toDate = null,
            [FromQuery] string? searchTerm = null)
        {
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 20;
            if (pageSize > 100) pageSize = 100;

            var pagination = new LogbookPaginationDto
            {
                Page = page,
                PageSize = pageSize,
                FromDate = fromDate,
                ToDate = toDate,
                SearchTerm = searchTerm
            };

            var result = await _service.GetEntriesAsync(pagination);
            return Ok(result);
        }

        /// <summary>
        /// Update Watchkeeping Log Entry
        /// </summary>
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateEntry(Guid id, [FromBody] UpdateWatchkeepingLogDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var username = User.Identity?.Name;
            var result = await _service.UpdateEntryAsync(id, dto, username);

            if (!result.Success)
            {
                return BadRequest(new { error = result.Error });
            }

            return Ok(new { message = "Watchkeeping log entry updated successfully" });
        }

        /// <summary>
        /// Delete Watchkeeping Log Entry (Soft Delete)
        /// </summary>
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteEntry(Guid id)
        {
            var username = User.Identity?.Name;
            var result = await _service.DeleteEntryAsync(id, username);

            if (!result.Success)
            {
                return BadRequest(new { error = result.Error });
            }

            return Ok(new { message = "Watchkeeping log entry deleted successfully" });
        }

        /// <summary>
        /// Sign Watchkeeping Log Entry (Master Signature)
        /// </summary>
        [HttpPost("{id}/sign")]
        public async Task<IActionResult> SignEntry(Guid id, [FromBody] SignWatchkeepingLogDto dto)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var username = ((MaritimeEdge.Services.Core.ApprovalActor)HttpContext.Items["ApprovalActor"]!).Username;
            var result = await _service.SignEntryAsync(id, dto, username);

            if (!result.Success)
            {
                return BadRequest(new { error = result.Error });
            }

            return Ok(new { message = "Watchkeeping log entry signed successfully" });
        }
    }
}
