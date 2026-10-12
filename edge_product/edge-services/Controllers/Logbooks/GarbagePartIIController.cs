using Microsoft.AspNetCore.Mvc;
using MaritimeEdge.Services.Logbooks;
using MaritimeEdge.DTOs.Logbooks;
using System;
using System.Threading.Tasks;

namespace MaritimeEdge.Controllers.Logbooks
{
    /// <summary>
    /// Garbage Record Book Part II API Controller
    /// MARPOL Annex V - Categories J-K (Cargo Residues)
    /// </summary>
    [ApiController]
    [Route("api/logbooks/garbage/part-ii")]
    public class GarbagePartIIController : ControllerBase
    {
        private readonly IGarbagePartIIService _service;
        private readonly ILogger<GarbagePartIIController> _logger;

        public GarbagePartIIController(IGarbagePartIIService service, ILogger<GarbagePartIIController> logger)
        {
            _service = service;
            _logger = logger;
        }

        /// <summary>
        /// Create a new Garbage Record Part II Entry
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> CreateEntry([FromBody] CreateGarbagePartIIDto dto)
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
                    message = "Garbage Part II entry created successfully"
                });
        }

        /// <summary>
        /// Get Garbage Part II Entry by ID
        /// </summary>
        [HttpGet("{id}")]
        public async Task<IActionResult> GetEntry(Guid id)
        {
            var entry = await _service.GetEntryAsync(id);

            if (entry == null)
            {
                return NotFound(new { error = "Garbage Part II entry not found" });
            }

            return Ok(entry);
        }

        /// <summary>
        /// Get all Garbage Part II Entries with pagination
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
        /// Update Garbage Part II Entry
        /// </summary>
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateEntry(Guid id, [FromBody] UpdateGarbagePartIIDto dto)
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

            return Ok(new { message = "Garbage Part II entry updated successfully" });
        }

        /// <summary>
        /// Delete Garbage Part II Entry (Soft Delete)
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

            return Ok(new { message = "Garbage Part II entry deleted successfully" });
        }

        /// <summary>
        /// Sign Garbage Part II Entry (Master Signature)
        /// </summary>
        [HttpPost("{id}/sign")]
        public async Task<IActionResult> SignEntry(Guid id, [FromBody] SignGarbagePartIIDto dto)
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

            return Ok(new { message = "Garbage Part II entry signed successfully" });
        }
    }
}
