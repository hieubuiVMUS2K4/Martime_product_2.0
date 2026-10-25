using Microsoft.AspNetCore.Mvc;
using MaritimeEdge.Services.Logbooks;
using MaritimeEdge.DTOs.Logbooks;
using Microsoft.AspNetCore.Authorization;

namespace MaritimeEdge.Controllers.Logbooks
{
    /// <summary>
    /// Deck Logbook API Controller
    /// SOLAS Chapter V Compliant
    /// </summary>
    [ApiController]
    [Route("api/logbooks/deck")]
    public class DeckLogbookController : ControllerBase
    {
        private readonly IDeckLogbookService _service;
        private readonly ILogger<DeckLogbookController> _logger;

        public DeckLogbookController(IDeckLogbookService service, ILogger<DeckLogbookController> logger)
        {
            _service = service;
            _logger = logger;
        }

        /// <summary>
        /// Create a new Deck Log Entry
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> CreateEntry([FromBody] CreateDeckLogEntryDto dto)
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
                    message = "Deck log entry created successfully"
                });
        }

        /// <summary>
        /// Get Deck Log Entry by ID
        /// </summary>
        [HttpGet("{id}")]
        public async Task<IActionResult> GetEntry(Guid id)
        {
            var entry = await _service.GetEntryAsync(id);

            if (entry == null)
            {
                return NotFound(new { error = "Deck log entry not found" });
            }

            return Ok(entry);
        }

        /// <summary>
        /// Get all Deck Log Entries with pagination
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
        /// Update Deck Log Entry
        /// </summary>
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateEntry(Guid id, [FromBody] UpdateDeckLogEntryDto dto)
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

            return Ok(new { message = "Deck log entry updated successfully" });
        }

        /// <summary>
        /// Delete Deck Log Entry (Soft Delete)
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

            return Ok(new { message = "Deck log entry deleted successfully" });
        }

        /// <summary>
        /// Sign Deck Log Entry (Master Signature)
        /// </summary>
        [HttpPost("{id}/sign")]
        public async Task<IActionResult> SignEntry(Guid id, [FromBody] SignDeckLogDto dto)
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

            return Ok(new { message = "Deck log entry signed successfully" });
        }
    }
}
