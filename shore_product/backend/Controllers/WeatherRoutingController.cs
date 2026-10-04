using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ProductApi.DTOs.WeatherRouting;
using ProductApi.Services.WeatherRouting;

namespace ProductApi.Controllers;

/// <summary>
/// Đề 4 Phase 1 — Shore weather routing (A* vs baseline, MOCK Cam Ranh hazard).
/// </summary>
[ApiController]
[Route("api/weather-routing")]
[Authorize]
[Produces("application/json")]
public class WeatherRoutingController : ControllerBase
{
    private readonly IWeatherRoutingService _service;
    private readonly IVoyageLegPlanService _legPlanService;
    private readonly ILogger<WeatherRoutingController> _logger;

    public WeatherRoutingController(
        IWeatherRoutingService service,
        IVoyageLegPlanService legPlanService,
        ILogger<WeatherRoutingController> logger)
    {
        _service = service;
        _legPlanService = legPlanService;
        _logger = logger;
    }

    /// <summary>POST /api/weather-routing/jobs — create + run sync.</summary>
    [HttpPost("jobs")]
    public async Task<ActionResult<WeatherRoutingJobDto>> CreateJob(
        [FromBody] CreateWeatherRoutingJobRequest? request,
        CancellationToken ct)
    {
        request ??= new CreateWeatherRoutingJobRequest();
        var job = await _service.CreateAndRunAsync(request, ct);
        return CreatedAtAction(nameof(GetJob), new { id = job.Id }, job);
    }

    /// <summary>GET /api/weather-routing/jobs/{id}</summary>
    [HttpGet("jobs/{id:guid}")]
    public async Task<ActionResult<WeatherRoutingJobDto>> GetJob(Guid id, CancellationToken ct)
    {
        var job = await _service.GetJobAsync(id, ct);
        return job is null ? NotFound(new { error = "Job not found" }) : Ok(job);
    }

    /// <summary>GET /api/weather-routing/jobs</summary>
    [HttpGet("jobs")]
    public async Task<ActionResult<IReadOnlyList<WeatherRoutingJobListItemDto>>> ListJobs(
        [FromQuery] int take = 50,
        CancellationToken ct = default)
    {
        var list = await _service.ListJobsAsync(take, ct);
        return Ok(list);
    }

    /// <summary>POST /api/weather-routing/jobs/{id}/replan — bumps version and re-runs A*.</summary>
    [HttpPost("jobs/{id:guid}/replan")]
    public async Task<ActionResult<WeatherRoutingJobDto>> Replan(
        Guid id,
        [FromBody] ReplanWeatherRoutingJobRequest? request,
        CancellationToken ct)
    {
        var job = await _service.ReplanAsync(id, request, ct);
        return job is null ? NotFound(new { error = "Job not found" }) : Ok(job);
    }

    /// <summary>GET /api/weather-routing/jobs/{id}/routes</summary>
    [HttpGet("jobs/{id:guid}/routes")]
    public async Task<ActionResult<IReadOnlyList<WeatherRoutingRouteDto>>> GetRoutes(Guid id, CancellationToken ct)
    {
        var existing = await _service.GetJobAsync(id, ct);
        if (existing is null)
            return NotFound(new { error = "Job not found" });

        var routes = await _service.GetRoutesAsync(id, ct);
        return Ok(routes);
    }

    /// <summary>
    /// GET /api/weather-routing/jobs/{id}/plan — kế hoạch n chặng (bunkering plan) của job.
    /// </summary>
    [HttpGet("jobs/{id:guid}/plan")]
    public async Task<ActionResult<VoyageLegPlanDto>> GetPlan(Guid id, CancellationToken ct)
    {
        var job = await _service.GetJobAsync(id, ct);
        if (job is null)
            return NotFound(new { error = "Job not found" });

        var plan = job.Plan ?? await _legPlanService.GetForJobAsync(id, ct);
        return plan is null ? NotFound(new { error = "Job has no leg plan" }) : Ok(plan);
    }

    /// <summary>
    /// POST /api/weather-routing/plan-legs — lập kế hoạch n chặng cho một hành trình.
    /// Chọn cảng tiếp nhiên liệu sao cho khi cập cảng nhiên liệu còn lại ≈ mức dự trữ (20%).
    /// </summary>
    [HttpPost("plan-legs")]
    public async Task<ActionResult<VoyageLegPlanDto>> PlanLegs(
        [FromBody] PlanVoyageLegsRequest? request,
        CancellationToken ct)
    {
        request ??= new PlanVoyageLegsRequest();
        try
        {
            var plan = await _legPlanService.PlanAsync(request, null, ct);
            return Ok(plan);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>GET /api/weather-routing/ports — danh sách cảng có toạ độ (ứng viên tiếp nhiên liệu).</summary>
    [HttpGet("ports")]
    public async Task<ActionResult<IReadOnlyList<object>>> ListPorts(CancellationToken ct)
    {
        var ports = await _legPlanService.ListBunkerPortsAsync(ct);
        return Ok(ports);
    }

    /// <summary>
    /// GET /api/weather-routing/hazards — các vùng thiên tai ở toạ độ CỨNG (DemoHazardGenerator.FixedZones).
    ///
    /// KHÔNG nhận tham số. Không cảng đi, không cảng đến, không seed, không số lượng.
    /// Thiên tai không được ràng buộc hay dính líu gì tới cảng.
    /// </summary>
    [HttpGet("hazards")]
    public ActionResult<HazardZoneSetDto> GetHazards()
    {
        var zones = _legPlanService.GetHazardZones();

        return Ok(new HazardZoneSetDto
        {
            Seed = 0,
            Count = zones.Count,
            Zones = zones.Select(z => z.ToDto()).ToList(),
            Legend = HazardCatalog.All.Select(t => (object)new
            {
                hazardType = t.Type,
                label = t.Label,
                icon = t.Icon,
                color = t.Color,
                radiusRangeNm = $"{t.MinNm:F0}-{t.MaxNm:F0}"
            }).ToList()
        });
    }

    /// <summary>GET /api/weather-routing/vessels/{vesselId}/fuel-profile</summary>
    [HttpGet("vessels/{vesselId:guid}/fuel-profile")]
    public async Task<ActionResult<object>> GetFuelProfile(Guid vesselId, CancellationToken ct)
    {
        var profile = await _legPlanService.GetFuelProfileSummaryAsync(vesselId, ct);
        return profile is null ? NotFound(new { error = "Vessel has no fuel profile" }) : Ok(profile);
    }

    /// <summary>
    /// GET /api/weather-routing/vessels — danh sách tàu kèm hồ sơ nhiên liệu
    /// (sức chứa, tiêu thụ/NM, tốc độ, công suất, SFOC, tầm hoạt động...).
    /// </summary>
    [HttpGet("vessels")]
    public async Task<ActionResult<IReadOnlyList<object>>> ListVessels(CancellationToken ct)
    {
        var vessels = await _legPlanService.ListVesselsAsync(ct);
        return Ok(vessels);
    }
}
