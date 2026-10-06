using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Models;

namespace MaritimeEdge.Controllers.Crew;

[Route("api/[controller]")]
[ApiController]
public class CountriesController : ControllerBase
{
    private readonly EdgeDbContext _context;

    public CountriesController(EdgeDbContext context) => _context = context;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Country>>> GetCountries() =>
        await _context.Countries.AsNoTracking().Where(c => c.IsActive).OrderBy(c => c.CountryName).ToListAsync();

    [HttpGet("{id}")]
    public async Task<ActionResult<Country>> GetCountry(int id)
    {
        var country = await _context.Countries.FindAsync(id);
        return country == null ? NotFound() : country;
    }

    [HttpPost]
    public Task<ActionResult<Country>> PostCountry(Country country)
    {
        return Task.FromResult<ActionResult<Country>>(ShoreManaged());
    }

    [HttpPut("{id}")]
    public Task<IActionResult> PutCountry(int id, Country country) => Task.FromResult<IActionResult>(ShoreManaged());

    [HttpDelete("{id}")]
    public Task<IActionResult> DeleteCountry(int id) => Task.FromResult<IActionResult>(ShoreManaged());

    private ObjectResult ShoreManaged() => StatusCode(405,
        new { error = "This catalog is managed on shore. Edge access is read-only.", code = "shore_managed_catalog" });
}
