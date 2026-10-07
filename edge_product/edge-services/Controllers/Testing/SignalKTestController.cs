using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using MaritimeEdge.Services.Voyage;

namespace MaritimeEdge.Controllers.Testing;

/// <summary>
/// Test controller to directly fetch and display SignalK data
/// Use this to verify SignalK connectivity and data format
/// </summary>
[ApiController]
[Route("api/signalk-test")]
public class SignalKTestController : ControllerBase
{
    private readonly ILogger<SignalKTestController> _logger;
    private readonly ISignalKHttpClient _signalKClient;

    public SignalKTestController(
        ILogger<SignalKTestController> logger,
        ISignalKHttpClient signalKClient)
    {
        _logger = logger;
        _signalKClient = signalKClient;
    }

    /// <summary>
    /// Get complete vessel data from SignalK server
    /// </summary>
    /// <returns>Full JSON response from SignalK</returns>
    [HttpGet("vessel")]
    public async Task<IActionResult> GetVesselData()
    {
        try
        {
            var json = await _signalKClient.GetRawAsync("vessels/self");
            
            if (string.IsNullOrEmpty(json))
            {
                return StatusCode(503, new { error = "SignalK server returned no data" });
            }

            var data = JsonSerializer.Deserialize<object>(json);

            return Ok(new
            {
                source = "SignalK",
                timestamp = DateTime.UtcNow,
                data = data
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching SignalK data");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get navigation data (position, speed, course)
    /// </summary>
    [HttpGet("navigation")]
    public async Task<IActionResult> GetNavigationData()
    {
        try
        {
            var json = await _signalKClient.GetRawAsync("vessels/self/navigation");
            
            if (string.IsNullOrEmpty(json))
            {
                return StatusCode(404, new { error = "Navigation data not available" });
            }

            var data = JsonSerializer.Deserialize<object>(json);

            return Ok(new
            {
                endpoint = "navigation",
                timestamp = DateTime.UtcNow,
                data = data
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching navigation data");
            return StatusCode(500, new { error = "An internal error occurred." });
        }
    }

    /// <summary>
    /// Get environmental data (weather, sea conditions)
    /// </summary>
    [HttpGet("environment")]
    public async Task<IActionResult> GetEnvironmentData()
    {
        try
        {
            var json = await _signalKClient.GetRawAsync("vessels/self/environment");
            
            if (string.IsNullOrEmpty(json))
            {
                return StatusCode(404, new { error = "Environment data not available" });
            }

            var data = JsonSerializer.Deserialize<object>(json);

            return Ok(new
            {
                endpoint = "environment",
                timestamp = DateTime.UtcNow,
                data = data
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching environment data");
            return StatusCode(500, new { error = "An internal error occurred." });
        }
    }

    /// <summary>
    /// Get propulsion data (engines, generators)
    /// </summary>
    [HttpGet("propulsion")]
    public async Task<IActionResult> GetPropulsionData()
    {
        try
        {
            var json = await _signalKClient.GetRawAsync("vessels/self/propulsion");
            
            if (string.IsNullOrEmpty(json))
            {
                return StatusCode(404, new { error = "Propulsion data not available" });
            }

            var data = JsonSerializer.Deserialize<object>(json);

            return Ok(new
            {
                endpoint = "propulsion",
                timestamp = DateTime.UtcNow,
                data = data
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching propulsion data");
            return StatusCode(500, new { error = "An internal error occurred." });
        }
    }

    /// <summary>
    /// Get electrical systems data
    /// </summary>
    [HttpGet("electrical")]
    public async Task<IActionResult> GetElectricalData()
    {
        try
        {
            var json = await _signalKClient.GetRawAsync("vessels/self/electrical");
            
            if (string.IsNullOrEmpty(json))
            {
                return StatusCode(404, new { error = "Electrical data not available" });
            }

            var data = JsonSerializer.Deserialize<object>(json);

            return Ok(new
            {
                endpoint = "electrical",
                timestamp = DateTime.UtcNow,
                data = data
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching electrical data");
            return StatusCode(500, new { error = "An internal error occurred." });
        }
    }

    /// <summary>
    /// Health check - verify SignalK server is accessible
    /// </summary>
    [HttpGet("health")]
    public async Task<IActionResult> HealthCheck()
    {
        try
        {
            var isHealthy = await _signalKClient.HealthCheckAsync();
            
            return Ok(new
            {
                status = isHealthy ? "healthy" : "unhealthy",
                timestamp = DateTime.UtcNow,
                message = isHealthy 
                    ? "SignalK server is accessible" 
                    : "SignalK server is not responding"
            });
        }
        catch (Exception)
        {
            return Ok(new
            {
                status = "unhealthy",
                error = "An internal error occurred.",
                timestamp = DateTime.UtcNow
            });
        }
    }
}
