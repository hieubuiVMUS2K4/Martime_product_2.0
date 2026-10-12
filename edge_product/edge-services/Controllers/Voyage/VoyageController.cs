using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.DTOs;
using MaritimeEdge.Constants;
using MaritimeEdge.Services.Voyage;

namespace MaritimeEdge.Controllers.Voyage;

[ApiController]
[Route("api")]
public class VoyageController : ControllerBase
{
    private readonly EdgeDbContext _context;
    private readonly IVoyageManagementService _voyageService;
    private readonly ILogger<VoyageController> _logger;

    public VoyageController(
        EdgeDbContext context, 
        IVoyageManagementService voyageService,
        ILogger<VoyageController> logger)
    {
        _context = context;
        _voyageService = voyageService;
        _logger = logger;
    }

    // ========== VOYAGE CRUD ==========

    [HttpGet("voyages/current")]
    public async Task<IActionResult> GetCurrentVoyage()
    {
        try
        {
            var voyage = await _context.VoyageRecords
                .AsNoTracking()
                .Where(v => VoyageStatus.CurrentVoyageStatuses.Contains(v.VoyageStatus))
                .OrderByDescending(v => v.DepartureTime)
                .FirstOrDefaultAsync();

            if (voyage == null)
            {
                return NotFound(new { message = "No active voyage" });
            }

            return Ok(voyage);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting current voyage");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("voyages")]
    public async Task<IActionResult> GetAllVoyages([FromQuery] int page = 1, [FromQuery] int pageSize = 50)
    {
        try
        {
            pageSize = Math.Clamp(pageSize, 1, 200);
            page = Math.Max(1, page);

            var query = _context.VoyageRecords
                .AsNoTracking()
                .OrderByDescending(v => v.DepartureTime);

            var totalCount = await query.CountAsync();
            var voyages = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(v => new {
                    v.Id, v.VoyageNumber, v.VesselName, v.VesselIMO,
                    v.DeparturePort, v.DeparturePortCode, v.DepartureTime,
                    v.ArrivalPort, v.ArrivalPortCode, v.ArrivalTime,
                    v.VoyageStatus, v.CargoType, v.CargoWeight,
                    v.CreatedAt, v.UpdatedAt
                })
                .ToListAsync();

            Response.Headers["X-Total-Count"] = totalCount.ToString();
            return Ok(voyages);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting voyages");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get voyage detail with port calls, crew assignments, and counts
    /// </summary>
    [HttpGet("voyages/{id:guid}")]
    public async Task<IActionResult> GetVoyageDetail(Guid id)
    {
        try
        {
            var detail = await _voyageService.GetVoyageDetailAsync(id);
            if (detail == null) return NotFound(new { message = "Voyage not found" });
            return Ok(detail);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting voyage detail {VoyageId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Create a new voyage (auto-fills vessel info from config)
    /// </summary>
    [HttpPost("voyages")]
    public async Task<IActionResult> CreateVoyage([FromBody] CreateVoyageDto dto)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(dto.VoyageNumber))
                return BadRequest(new { error = "VoyageNumber is required" });

            var exists = await _context.VoyageRecords
                .AnyAsync(v => v.VoyageNumber == dto.VoyageNumber);
            if (exists)
                return Conflict(new { error = $"Voyage {dto.VoyageNumber} already exists" });

            var voyage = await _voyageService.CreateVoyageAsync(dto);
            return CreatedAtAction(nameof(GetVoyageDetail), new { id = voyage.Id }, voyage);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating voyage");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Update voyage fields
    /// </summary>
    [HttpPut("voyages/{id:guid}")]
    public async Task<IActionResult> UpdateVoyage(Guid id, [FromBody] UpdateVoyageDto dto)
    {
        try
        {
            var voyage = await _voyageService.UpdateVoyageAsync(id, dto);
            if (voyage == null) return NotFound(new { message = "Voyage not found" });
            return Ok(voyage);
        }
        catch (InvalidOperationException)
        {
            return BadRequest(new { error = "An internal error occurred." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating voyage {VoyageId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Delete a voyage (cascades port calls & crew assignments)
    /// </summary>
    [HttpDelete("voyages/{id:guid}")]
    public async Task<IActionResult> DeleteVoyage(Guid id)
    {
        try
        {
            var result = await _voyageService.DeleteVoyageAsync(id);
            if (!result) return NotFound(new { message = "Voyage not found" });
            return NoContent();
        }
        catch (InvalidOperationException)
        {
            return BadRequest(new { error = "An internal error occurred." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting voyage {VoyageId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ========== PORT CALLS ==========

    /// <summary>
    /// Get port calls for a voyage (ordered by sequence)
    /// </summary>
    [HttpGet("voyages/{voyageId:guid}/port-calls")]
    public async Task<IActionResult> GetPortCalls(Guid voyageId)
    {
        try
        {
            var portCalls = await _voyageService.GetPortCallsAsync(voyageId);
            return Ok(portCalls);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting port calls for voyage {VoyageId}", voyageId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Add a port call to a voyage
    /// </summary>
    [HttpPost("voyages/{voyageId:guid}/port-calls")]
    public async Task<IActionResult> CreatePortCall(Guid voyageId, [FromBody] CreatePortCallDto dto)
    {
        try
        {
            dto.VoyageId = voyageId;
            var portCall = await _voyageService.CreatePortCallAsync(dto);
            return CreatedAtAction(nameof(GetPortCalls), new { voyageId }, portCall);
        }
        catch (InvalidOperationException)
        {
            return BadRequest(new { error = "An internal error occurred." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating port call");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Update a port call
    /// </summary>
    [HttpPut("port-calls/{id:guid}")]
    public async Task<IActionResult> UpdatePortCall(Guid id, [FromBody] UpdatePortCallDto dto)
    {
        try
        {
            var portCall = await _voyageService.UpdatePortCallAsync(id, dto);
            if (portCall == null) return NotFound(new { message = "Port call not found" });
            return Ok(portCall);
        }
        catch (InvalidOperationException)
        {
            return BadRequest(new { error = "An internal error occurred." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating port call {PortCallId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Delete a port call
    /// </summary>
    [HttpDelete("port-calls/{id:guid}")]
    public async Task<IActionResult> DeletePortCall(Guid id)
    {
        try
        {
            var result = await _voyageService.DeletePortCallAsync(id);
            if (!result) return NotFound(new { message = "Port call not found" });
            return NoContent();
        }
        catch (InvalidOperationException)
        {
            return BadRequest(new { error = "An internal error occurred." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting port call {PortCallId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ========== CREW ASSIGNMENTS ==========

    /// <summary>
    /// Get crew assigned to a voyage
    /// </summary>
    [HttpGet("voyages/{voyageId:guid}/crew")]
    public async Task<IActionResult> GetCrewAssignments(Guid voyageId)
    {
        try
        {
            var assignments = await _voyageService.GetCrewAssignmentsAsync(voyageId);
            return Ok(assignments);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting crew for voyage {VoyageId}", voyageId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Assign a crew member to a voyage
    /// </summary>
    [HttpPost("voyages/{voyageId:guid}/crew")]
    public async Task<IActionResult> AssignCrew(Guid voyageId, [FromBody] CreateVoyageCrewAssignmentDto dto)
    {
        try
        {
            dto.VoyageId = voyageId;
            var assignment = await _voyageService.AssignCrewAsync(dto);
            return CreatedAtAction(nameof(GetCrewAssignments), new { voyageId }, assignment);
        }
        catch (InvalidOperationException)
        {
            return Conflict(new { error = "An internal error occurred." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error assigning crew to voyage");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Bulk assign multiple crew to a voyage
    /// </summary>
    [HttpPost("voyages/{voyageId:guid}/crew/bulk")]
    public async Task<IActionResult> BulkAssignCrew(Guid voyageId, [FromBody] BulkAssignCrewDto dto)
    {
        try
        {
            dto.VoyageId = voyageId;
            var assignments = await _voyageService.BulkAssignCrewAsync(dto);
            return Ok(assignments);
        }
        catch (InvalidOperationException)
        {
            return BadRequest(new { error = "An internal error occurred." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error bulk assigning crew to voyage");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Update a crew assignment (embark/disembark, status, etc.)
    /// </summary>
    [HttpPut("crew-assignments/{id:guid}")]
    public async Task<IActionResult> UpdateCrewAssignment(Guid id, [FromBody] UpdateVoyageCrewAssignmentDto dto)
    {
        try
        {
            var assignment = await _voyageService.UpdateCrewAssignmentAsync(id, dto);
            if (assignment == null) return NotFound(new { message = "Assignment not found" });
            return Ok(assignment);
        }
        catch (InvalidOperationException)
        {
            return BadRequest(new { error = "An internal error occurred." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating crew assignment {AssignmentId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Remove crew from a voyage
    /// </summary>
    [HttpDelete("crew-assignments/{id:guid}")]
    public async Task<IActionResult> RemoveCrewAssignment(Guid id)
    {
        try
        {
            var result = await _voyageService.RemoveCrewAssignmentAsync(id);
            if (!result) return NotFound(new { message = "Assignment not found" });
            return NoContent();
        }
        catch (InvalidOperationException)
        {
            return BadRequest(new { error = "An internal error occurred." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error removing crew assignment {AssignmentId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get voyage history for a specific crew member
    /// </summary>
    [HttpGet("crew/{crewMemberId:guid}/voyages")]
    public async Task<IActionResult> GetCrewVoyageHistory(Guid crewMemberId)
    {
        try
        {
            var history = await _voyageService.GetCrewVoyageHistoryAsync(crewMemberId);
            return Ok(history);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting voyage history for crew {CrewId}", crewMemberId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ========== FAL FORM 5 ==========

    /// <summary>
    /// Generate FAL Form 5 (Crew List) for a voyage - IMO FAL Convention
    /// </summary>
    [HttpGet("voyages/{voyageId:guid}/fal-form5")]
    public async Task<IActionResult> GetFalForm5(Guid voyageId)
    {
        try
        {
            var form = await _voyageService.GenerateFalForm5Async(voyageId);
            if (form == null) return NotFound(new { message = "Voyage not found" });
            return Ok(form);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating FAL Form 5 for voyage {VoyageId}", voyageId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ========== CARGO OPERATIONS (CRUD) ==========

    [HttpGet("cargo")]
    public async Task<IActionResult> GetCargoOperations([FromQuery] Guid? voyageId = null)
    {
        try
        {
            var query = _context.CargoOperations.AsNoTracking().AsQueryable();

            if (voyageId.HasValue)
            {
                query = query.Where(c => c.VoyageId == voyageId);
            }

            var cargo = await query
                .OrderByDescending(c => c.CreatedAt)
                .Take(100)
                .ToListAsync();

            return Ok(cargo);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting cargo operations");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("cargo/{id:guid}")]
    public async Task<IActionResult> GetCargoOperation(Guid id)
    {
        try
        {
            var cargo = await _context.CargoOperations.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id);
            if (cargo == null) return NotFound(new { message = "Cargo operation not found" });
            return Ok(cargo);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting cargo operation {CargoId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpPost("cargo")]
    public async Task<IActionResult> CreateCargoOperation([FromBody] CreateCargoOperationDto dto)
    {
        try
        {
            // Validate voyage exists if voyageId provided
            if (dto.VoyageId.HasValue)
            {
                var voyage = await _context.VoyageRecords.FindAsync(dto.VoyageId.Value);
                if (voyage == null) return NotFound(new { error = "Voyage not found" });
                if (VoyageStatus.ReadOnlyStatuses.Contains(voyage.VoyageStatus))
                    return BadRequest(new { error = $"Cannot add cargo to a {voyage.VoyageStatus} voyage" });
            }

            // Auto-generate OperationId
            var count = await _context.CargoOperations.CountAsync() + 1;
            var operationId = $"COP-{count:D5}";

            var cargo = new CargoOperation
            {
                OperationId = operationId,
                VoyageId = dto.VoyageId,
                OperationType = dto.OperationType,
                CargoType = dto.CargoType,
                CargoDescription = dto.CargoDescription,
                Quantity = dto.Quantity,
                Unit = dto.Unit,
                LoadingPort = dto.LoadingPort,
                DischargePort = dto.DischargePort,
                LoadedAt = dto.LoadedAt,
                DischargedAt = dto.DischargedAt,
                Shipper = dto.Shipper,
                Consignee = dto.Consignee,
                BillOfLading = dto.BillOfLading,
                SealNumbers = dto.SealNumbers,
                SpecialRequirements = dto.SpecialRequirements,
                Status = "PLANNED"
            };

            _context.CargoOperations.Add(cargo);
            await _context.SaveChangesAsync();
            _logger.LogInformation("Created cargo operation {OperationId} for voyage {VoyageId}", operationId, dto.VoyageId);
            return CreatedAtAction(nameof(GetCargoOperation), new { id = cargo.Id }, cargo);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating cargo operation");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpPut("cargo/{id:guid}")]
    public async Task<IActionResult> UpdateCargoOperation(Guid id, [FromBody] UpdateCargoOperationDto dto)
    {
        try
        {
            var cargo = await _context.CargoOperations.FindAsync(id);
            if (cargo == null) return NotFound(new { message = "Cargo operation not found" });

            // Validate voyage status
            if (cargo.VoyageId.HasValue)
            {
                var voyage = await _context.VoyageRecords.FindAsync(cargo.VoyageId.Value);
                if (voyage != null && VoyageStatus.ReadOnlyStatuses.Contains(voyage.VoyageStatus))
                    return BadRequest(new { error = $"Cannot modify cargo on a {voyage.VoyageStatus} voyage" });
            }

            if (dto.OperationType != null) cargo.OperationType = dto.OperationType;
            if (dto.CargoType != null) cargo.CargoType = dto.CargoType;
            if (dto.CargoDescription != null) cargo.CargoDescription = dto.CargoDescription;
            if (dto.Quantity.HasValue) cargo.Quantity = dto.Quantity.Value;
            if (dto.Unit != null) cargo.Unit = dto.Unit;
            if (dto.LoadingPort != null) cargo.LoadingPort = dto.LoadingPort;
            if (dto.DischargePort != null) cargo.DischargePort = dto.DischargePort;
            if (dto.LoadedAt.HasValue) cargo.LoadedAt = dto.LoadedAt;
            if (dto.DischargedAt.HasValue) cargo.DischargedAt = dto.DischargedAt;
            if (dto.Shipper != null) cargo.Shipper = dto.Shipper;
            if (dto.Consignee != null) cargo.Consignee = dto.Consignee;
            if (dto.BillOfLading != null) cargo.BillOfLading = dto.BillOfLading;
            if (dto.SealNumbers != null) cargo.SealNumbers = dto.SealNumbers;
            if (dto.SpecialRequirements != null) cargo.SpecialRequirements = dto.SpecialRequirements;
            if (dto.Status != null) cargo.Status = dto.Status;

            cargo.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return Ok(cargo);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating cargo operation {CargoId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpDelete("cargo/{id:guid}")]
    public async Task<IActionResult> DeleteCargoOperation(Guid id)
    {
        try
        {
            var cargo = await _context.CargoOperations.FindAsync(id);
            if (cargo == null) return NotFound(new { message = "Cargo operation not found" });

            // Validate voyage status
            if (cargo.VoyageId.HasValue)
            {
                var voyage = await _context.VoyageRecords.FindAsync(cargo.VoyageId.Value);
                if (voyage != null && VoyageStatus.ReadOnlyStatuses.Contains(voyage.VoyageStatus))
                    return BadRequest(new { error = $"Cannot delete cargo from a {voyage.VoyageStatus} voyage" });
            }

            _context.CargoOperations.Remove(cargo);
            await _context.SaveChangesAsync();
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting cargo operation {CargoId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // ========== VOYAGE NUMBER AUTO-GENERATE ==========

    [HttpGet("voyages/next-number")]
    public async Task<IActionResult> GetNextVoyageNumber()
    {
        try
        {
            var year = DateTime.UtcNow.Year;
            var prefix = $"VN-{year}-";

            // Find the highest existing number with this year's prefix
            var latestVoyage = await _context.VoyageRecords
                .AsNoTracking()
                .Where(v => v.VoyageNumber.StartsWith(prefix))
                .OrderByDescending(v => v.VoyageNumber)
                .FirstOrDefaultAsync();

            int nextSeq = 1;
            if (latestVoyage != null)
            {
                var numPart = latestVoyage.VoyageNumber.Replace(prefix, "");
                if (int.TryParse(numPart, out int parsed))
                    nextSeq = parsed + 1;
            }

            return Ok(new { voyageNumber = $"{prefix}{nextSeq:D3}" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating next voyage number");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }
}
