using Microsoft.AspNetCore.Mvc;
using MaritimeEdge.Services.Logbooks;
using MaritimeEdge.DTOs.Logbooks;
using System;
using System.Threading.Tasks;

namespace MaritimeEdge.Controllers.Logbooks
{
    /// <summary>
    /// Garbage Record Book Part I API Controller
    /// MARPOL Annex V - Categories A-I (Regular Garbage)
    /// </summary>
    [ApiController]
    [Route("api/logbooks/garbage/part-i")]
    public class GarbagePartIController : ControllerBase
    {
        private readonly IGarbagePartIService _service;
        private readonly ILogger<GarbagePartIController> _logger;

        public GarbagePartIController(IGarbagePartIService service, ILogger<GarbagePartIController> logger)
        {
            _service = service;
            _logger = logger;
        }

        /// <summary>
        /// Create a new Garbage Record Part I Entry
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> CreateEntry([FromBody] CreateGarbagePartIDto dto)
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
                    message = "Garbage Part I entry created successfully"
                });
        }

        /// <summary>
        /// Get Garbage Part I Entry by ID
        /// </summary>
        [HttpGet("{id}")]
        public async Task<IActionResult> GetEntry(Guid id)
        {
            var entry = await _service.GetEntryAsync(id);

            if (entry == null)
            {
                return NotFound(new { error = "Garbage Part I entry not found" });
            }

            return Ok(entry);
        }

        /// <summary>
        /// Get all Garbage Part I Entries with pagination
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
        /// Update Garbage Part I Entry
        /// </summary>
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateEntry(Guid id, [FromBody] UpdateGarbagePartIDto dto)
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

            return Ok(new { message = "Garbage Part I entry updated successfully" });
        }

        /// <summary>
        /// Delete Garbage Part I Entry (Soft Delete)
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

            return Ok(new { message = "Garbage Part I entry deleted successfully" });
        }

        /// <summary>
        /// Sign Garbage Part I Entry (Master Signature)
        /// </summary>
        [HttpPost("{id}/sign")]
        public async Task<IActionResult> SignEntry(Guid id, [FromBody] SignGarbagePartIDto dto)
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

            return Ok(new { message = "Garbage Part I entry signed successfully" });
        }
    }
}
