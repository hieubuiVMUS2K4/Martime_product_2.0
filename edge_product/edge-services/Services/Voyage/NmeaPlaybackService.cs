using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Parsers;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace MaritimeEdge.Services.Voyage;

/// <summary>
/// Background service to playback an NMEA file line-by-line or batch-by-batch
/// simulating an active GPS/Navigation sensor feeding data into the Edge node.
/// </summary>
public class NmeaPlaybackService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<NmeaPlaybackService> _logger;
    private readonly IConfiguration _configuration;
    private readonly NmeaParser _nmeaParser;
    private string _nodeId = "UNKNOWN";

    public NmeaPlaybackService(
        IServiceProvider serviceProvider,
        ILogger<NmeaPlaybackService> logger,
        IConfiguration configuration,
        NmeaParser nmeaParser)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _configuration = configuration;
        _nmeaParser = nmeaParser;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var enabled = _configuration.GetValue<bool>("NmeaPlayback:Enabled", false);
        if (!enabled)
        {
            _logger.LogInformation("NMEA Playback Service is DISABLED. Not running.");
            return;
        }

        var filePath = _configuration.GetValue<string>("NmeaPlayback:FilePath", "");
        var intervalSeconds = _configuration.GetValue<int>("NmeaPlayback:IntervalSeconds", 1);
        var loop = _configuration.GetValue<bool>("NmeaPlayback:LoopRoute", true);

        if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
        {
            _logger.LogError("NMEA Playback Service cannot find file at paths: {FilePath}", filePath);
            return;
        }

        _logger.LogInformation("NMEA Playback Service Started. Reading coordinates from {FilePath} every {Interval}s.", filePath, intervalSeconds);
        
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); // Small warmup delay

        var allLines = await File.ReadAllLinesAsync(filePath, stoppingToken);

        if (allLines.Length == 0)
        {
            _logger.LogWarning("NMEA Playback file is empty.");
            return;
        }

        // ── RESUME LOGIC: Tìm dòng NMEA gần nhất với vị trí cuối trong DB ──
        int currentLine = await FindResumeLineAsync(allLines);

        _nodeId = await ResolveNodeIdAsync();
        _logger.LogInformation("NMEA Playback Service using NodeId: {NodeId}", _nodeId);

        if (currentLine > 0)
        {
            _logger.LogInformation("Resuming NMEA playback from line {CurrentLine}/{TotalLines} (last saved position)", 
                currentLine, allLines.Length);
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                _nodeId = await ResolveNodeIdAsync();
                if (currentLine >= allLines.Length)
                {
                    if (loop)
                    {
                        _logger.LogInformation("NMEA file reached EOF. Looping route...");
                        currentLine = 0;
                    }
                    else
                    {
                        _logger.LogInformation("NMEA file reached EOF. Stopping playback.");
                        break;
                    }
                }

                // In the generated dataset, we output 3 lines per sample (GGA, GSA, RMC)
                // Let's read the next 3 valid lines as a single batch
                var linesToProcess = allLines.Skip(currentLine).Take(3).ToList();
                
                using var scope = _serviceProvider.CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();

                bool savedAny = false;

                foreach (var line in linesToProcess)
                {
                    var parsed = _nmeaParser.ParseSentence(line);

                    if (parsed is PositionData pos)
                    {
                        pos.Timestamp = DateTime.UtcNow; // Align with real-time testing
                        pos.IsSynced = false;
                        pos.CreatedAt = DateTime.UtcNow;
                        pos.OriginNode = _nodeId; // Set IMO thực để khớp với Shore filter

                        await dbContext.PositionData.AddAsync(pos);
                        savedAny = true;
                    }
                }

                if (savedAny)
                {
                    await dbContext.SaveChangesAsync(stoppingToken);
                    _logger.LogDebug("Ingested {Count} NMEA sentences at {Time}", linesToProcess.Count, DateTime.UtcNow);
                }
                
                currentLine += 3;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing NMEA playback line: {CurrentLine}", currentLine);
            }

            await Task.Delay(TimeSpan.FromSeconds(intervalSeconds), stoppingToken);
        }

        _logger.LogInformation("NMEA Playback Service Terminated.");
    }

    /// <summary>
    /// Tìm dòng NMEA gần nhất với vị trí cuối cùng trong DB.
    /// Khi server restart, playback sẽ tiếp tục từ vị trí gần nhất thay vì reset về đầu file.
    /// </summary>
    private async Task<int> FindResumeLineAsync(string[] allLines)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();

            // Lấy vị trí cuối cùng từ DB
            var lastPosition = await dbContext.PositionData
                .OrderByDescending(p => p.Timestamp)
                .FirstOrDefaultAsync();

            if (lastPosition == null)
            {
                _logger.LogInformation("No previous position data found. Starting from beginning of NMEA file.");
                return 0;
            }

            _logger.LogInformation(
                "Last known position: {Lat:F6}, {Lon:F6} at {Time:u}. Finding matching NMEA line...",
                lastPosition.Latitude, lastPosition.Longitude, lastPosition.Timestamp);

            // Duyệt qua file NMEA để tìm dòng có vị trí gần nhất
            int bestLine = 0;
            double bestDistance = double.MaxValue;
            int currentLine = 0;

            foreach (var line in allLines)
            {
                var parsed = _nmeaParser.ParseSentence(line);
                if (parsed is PositionData pos && pos.Latitude != 0 && pos.Longitude != 0)
                {
                    // Tính khoảng cách Euclidean đơn giản (độ)
                    var dLat = pos.Latitude - lastPosition.Latitude;
                    var dLon = pos.Longitude - lastPosition.Longitude;
                    var distance = Math.Sqrt(dLat * dLat + dLon * dLon);

                    if (distance < bestDistance)
                    {
                        bestDistance = distance;
                        bestLine = currentLine;
                    }
                }
                currentLine++;
            }

            // Làm tròn xuống bội số của 3 (vì mỗi sample là 3 dòng: GGA, GSA, RMC)
            bestLine = (bestLine / 3) * 3;

            _logger.LogInformation(
                "Best matching NMEA line: {BestLine} (distance: {Distance:F6}°) — RESUMING",
                bestLine, bestDistance);

            return bestLine;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to find resume line in NMEA file. Starting from beginning.");
            return 0;
        }
    }

    /// <summary>
    /// Vessel Provisioning v3: resolves NodeId via <see cref="IEdgeRuntimeConfigService"/> instead of
    /// reading <c>_configuration["SyncSecurity:NodeId"]</c> directly. Cached once at service startup
    /// (BackgroundService is Singleton) — a service restart is needed to pick up a newly activated
    /// Managed profile. Falls back to "UNKNOWN" (does not throw) on Fail-Closed conditions.
    /// </summary>
    private async Task<string> ResolveNodeIdAsync()
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var runtimeConfigService = scope.ServiceProvider.GetRequiredService<IEdgeRuntimeConfigService>();
            var syncConfig = await runtimeConfigService.GetSyncConfigAsync();
            return string.IsNullOrWhiteSpace(syncConfig?.NodeId)
                ? "UNKNOWN"
                : syncConfig!.NodeId;
        }
        catch (ProvisioningRequiredException ex)
        {
            _logger.LogWarning("NMEA Playback Service: VesselIMO unavailable — {Message}", ex.Message);
            return "UNKNOWN";
        }
        catch (ConfigInvalidException ex)
        {
            _logger.LogError("NMEA Playback Service: VesselIMO unavailable — {Message}", ex.Message);
            return "UNKNOWN";
        }
    }
}
