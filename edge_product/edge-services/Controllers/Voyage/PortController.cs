using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.DTOs;

namespace MaritimeEdge.Controllers.Voyage;

[ApiController]
[Route("api/ports")]
public class PortController : ControllerBase
{
    private readonly EdgeDbContext _context;
    private readonly ILogger<PortController> _logger;

    public PortController(EdgeDbContext context, ILogger<PortController> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Search/list ports with filtering (UN/LOCODE standard)
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetPorts([FromQuery] PortSearchQuery query)
    {
        try
        {
            var q = _context.Ports.AsNoTracking().AsQueryable();

            if (query.IsActive.HasValue)
                q = q.Where(p => p.IsActive == query.IsActive.Value);
            else
                q = q.Where(p => p.IsActive); // Default: only active

            if (!string.IsNullOrWhiteSpace(query.CountryCode))
                q = q.Where(p => p.CountryCode == query.CountryCode.ToUpper());

            if (!string.IsNullOrWhiteSpace(query.Search))
            {
                var search = query.Search.ToLower();
                q = q.Where(p => 
                    p.PortCode.ToLower().Contains(search) ||
                    p.PortName.ToLower().Contains(search) ||
                    (p.Country != null && p.Country.ToLower().Contains(search)));
            }

            var total = await q.CountAsync();
            
            var ports = await q
                .OrderBy(p => p.Country)
                .ThenBy(p => p.PortName)
                .Skip((query.Page - 1) * query.PageSize)
                .Take(query.PageSize)
                .Select(p => new PortDto
                {
                    Id = p.Id,
                    PortCode = p.PortCode,
                    PortName = p.PortName,
                    Country = p.Country,
                    CountryCode = p.CountryCode,
                    Latitude = p.Latitude,
                    Longitude = p.Longitude,
                    TimeZone = p.TimeZone,
                    IsActive = p.IsActive
                })
                .ToListAsync();

            return Ok(new 
            {
                data = ports, 
                pagination = new 
                {
                    currentPage = query.Page,
                    pageSize = query.PageSize,
                    totalCount = total,
                    totalPages = (int)Math.Ceiling((double)total / query.PageSize),
                    hasNextPage = query.Page * query.PageSize < total,
                    hasPreviousPage = query.Page > 1
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error searching ports");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get port by UN/LOCODE
    /// </summary>
    [HttpGet("by-code/{portCode}")]
    public async Task<IActionResult> GetByCode(string portCode)
    {
        var port = await _context.Ports
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.PortCode == portCode.ToUpper());
        
        if (port == null) return NotFound(new { message = $"Port {portCode} not found" });
        return Ok(port);
    }

    /// <summary>
    /// Get port by ID
    /// </summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetById(int id)
    {
        var port = await _context.Ports.FindAsync(id);
        if (port == null) return NotFound();
        return Ok(port);
    }

    // ==========================================
    // TẠO / SỬA / XOÁ CẢNG (LOCKED AT EDGE)
    // Danh mục cảng do Văn phòng Bờ (Shore Master) quản lý và phát xuống tàu qua đồng bộ.
    // ==========================================
    [HttpPost]
    public IActionResult Create()
    {
        return BadRequest(new { message = "Chức năng thêm cảng đã bị khóa tại nút Tàu (Edge). Danh mục cảng do Văn phòng Bờ (Shore Master) quản lý." });
    }

    [HttpPut("{id:int}")]
    public IActionResult Update(int id)
    {
        return BadRequest(new { message = "Chức năng sửa cảng đã bị khóa tại nút Tàu (Edge). Danh mục cảng do Văn phòng Bờ (Shore Master) quản lý." });
    }

    [HttpDelete("{id:int}")]
    public IActionResult Delete(int id)
    {
        return BadRequest(new { message = "Chức năng ngừng sử dụng cảng đã bị khóa tại nút Tàu (Edge). Danh mục cảng do Văn phòng Bờ (Shore Master) quản lý." });
    }

    /// <summary>
    /// Get distinct countries from port master data
    /// </summary>
    [HttpGet("countries")]
    public async Task<IActionResult> GetCountries()
    {
        var countries = await _context.Ports
            .AsNoTracking()
            .Where(p => p.IsActive && p.CountryCode != null)
            .Select(p => p.CountryCode!)
            .Distinct()
            .OrderBy(c => c)
            .ToListAsync();

        return Ok(countries);
    }

}
