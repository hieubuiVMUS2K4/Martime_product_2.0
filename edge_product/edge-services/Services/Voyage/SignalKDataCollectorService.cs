using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace MaritimeEdge.Services.Voyage;

/// <summary>
/// Background service to collect real maritime data from SignalK demo server
/// SignalK is a free, open-source data format for marine use
/// Demo server: https://demo.signalk.org
/// Can be replaced with your own SignalK server when deployed on actual vessel
/// </summary>
public class SignalKDataCollectorService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<SignalKDataCollectorService> _logger;
    private readonly IConfiguration _configuration;
    private string _nodeId = "UNKNOWN";

    public SignalKDataCollectorService(
        IServiceProvider serviceProvider,
        ILogger<SignalKDataCollectorService> logger,
        IConfiguration configuration)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _configuration = configuration;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Check if SignalK collector is enabled
        var enabled = _configuration.GetValue<bool>("SignalK:Enabled", false);

        if (!enabled)
        {
            _logger.LogInformation("SignalK Data Collector is DISABLED in configuration");
            return;
        }

        var intervalSeconds = _configuration.GetValue<int>("SignalK:IntervalSeconds", 60);

        _logger.LogInformation(
            "SignalK Data Collector started - Interval: {Interval}s",
            intervalSeconds);

        // Wait a bit before starting
        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);

        _nodeId = await ResolveNodeIdAsync();
        _logger.LogInformation("SignalK Data Collector using NodeId: {NodeId}", _nodeId);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                _nodeId = await ResolveNodeIdAsync();
                using var scope = _serviceProvider.CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();
                var signalKClient = scope.ServiceProvider.GetRequiredService<ISignalKHttpClient>();

                // Collect data from SignalK
                await CollectNavigationData(dbContext, signalKClient, stoppingToken);
                await CollectEnvironmentalData(dbContext, signalKClient, stoppingToken);
                await CollectVesselData(dbContext, signalKClient, stoppingToken);

                await dbContext.SaveChangesAsync(stoppingToken);

                _logger.LogDebug("SignalK data collected successfully");
            }
            catch (HttpRequestException ex)
            {
                _logger.LogWarning(ex, "Network error collecting SignalK data. Will retry in {Interval}s", intervalSeconds);
            }
            catch (TaskCanceledException)
            {
                _logger.LogInformation("SignalK Data Collector is shutting down");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error collecting SignalK data");
            }

            await Task.Delay(TimeSpan.FromSeconds(intervalSeconds), stoppingToken);
        }

        _logger.LogInformation("SignalK Data Collector stopped");
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
            _logger.LogWarning("SignalK Data Collector: VesselIMO unavailable — {Message}", ex.Message);
            return "UNKNOWN";
        }
        catch (ConfigInvalidException ex)
        {
            _logger.LogError("SignalK Data Collector: VesselIMO unavailable — {Message}", ex.Message);
            return "UNKNOWN";
        }
    }

    /// <summary>
    /// Collect position and navigation data
    /// SignalK path: /vessels/self/navigation
    /// </summary>
    private async Task CollectNavigationData(
        EdgeDbContext dbContext, 
        ISignalKHttpClient signalKClient, 
        CancellationToken cancellationToken)
    {
        try
        {
            var navData = await signalKClient.GetAsync<SignalKNavigationResponse>(
                "vessels/self/navigation", 
                cancellationToken);

            if (navData == null) return;

            // Extract Position Data
            if (navData.Position?.Value != null)
            {
                var pos = new PositionData
                {
                    Timestamp = DateTime.UtcNow,
                    Latitude = navData.Position.Value.Latitude,
                    Longitude = navData.Position.Value.Longitude,
                    Altitude = navData.Altitude?.Value ?? 0,
                    SpeedOverGround = UnitConversionHelper.MpsToKnots(navData.SpeedOverGround?.Value ?? 0),
                    CourseOverGround = UnitConversionHelper.RadiansToDegrees(navData.CourseOverGroundTrue?.Value ?? 0),
                    FixQuality = 1,
                    SatellitesUsed = 12,
                    Hdop = 1.0,
                    Source = "SignalK",
                    IsSynced = false,
                    CreatedAt = DateTime.UtcNow,
                    OriginNode = _nodeId // Set IMO thực để khớp với Shore filter
                };

                await dbContext.PositionData.AddAsync(pos, cancellationToken);

                // Cleanup old records using helper
                await DataCleanupHelper.CleanupOldRecordsAsync(
                    dbContext.PositionData,
                    p => p.Timestamp,
                    keepCount: 1000,
                    cancellationToken);
            }

            // Extract Navigation Data
            var navigation = new NavigationData
            {
                Timestamp = DateTime.UtcNow,
                HeadingTrue = UnitConversionHelper.RadiansToDegrees(navData.HeadingTrue?.Value ?? 0),
                HeadingMagnetic = UnitConversionHelper.RadiansToDegrees(navData.HeadingMagnetic?.Value ?? 0),
                RateOfTurn = UnitConversionHelper.RadiansToDegrees(navData.RateOfTurn?.Value ?? 0) * 60, // rad/s to deg/min
                Pitch = UnitConversionHelper.RadiansToDegrees(navData.Attitude?.Pitch ?? 0),
                Roll = UnitConversionHelper.RadiansToDegrees(navData.Attitude?.Roll ?? 0),
                SpeedThroughWater = UnitConversionHelper.MpsToKnots(navData.SpeedThroughWater?.Value ?? 0),
                Depth = navData.Depth?.BelowKeel ?? navData.Depth?.BelowTransducer ?? 0,
                IsSynced = false,
                CreatedAt = DateTime.UtcNow
            };

            await dbContext.NavigationData.AddAsync(navigation, cancellationToken);

            // Cleanup using helper
            await DataCleanupHelper.CleanupOldRecordsAsync(
                dbContext.NavigationData,
                n => n.Timestamp,
                keepCount: 1000,
                cancellationToken);

            _logger.LogDebug("SignalK navigation data collected: Lat={Lat}, Lon={Lon}, SOG={SOG}kts",
                navData.Position?.Value?.Latitude.ToString("F6"),
                navData.Position?.Value?.Longitude.ToString("F6"),
                UnitConversionHelper.MpsToKnots(navData.SpeedOverGround?.Value ?? 0).ToString("F1"));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error collecting SignalK navigation data");
        }
    }

    /// <summary>
    /// Collect environmental data (weather, sea conditions)
    /// SignalK path: /vessels/self/environment
    /// </summary>
    private async Task CollectEnvironmentalData(
        EdgeDbContext dbContext, 
        ISignalKHttpClient signalKClient, 
        CancellationToken cancellationToken)
    {
        try
        {
            var envData = await signalKClient.GetAsync<SignalKEnvironmentResponse>(
                "vessels/self/environment", 
                cancellationToken);

            if (envData == null) return;

            var env = new EnvironmentalData
            {
                Timestamp = DateTime.UtcNow,
                AirTemperature = UnitConversionHelper.KelvinToCelsius(envData.Outside?.Temperature?.Value ?? 0),
                BarometricPressure = UnitConversionHelper.PascalToHPa(envData.Outside?.Pressure?.Value ?? 0),
                Humidity = UnitConversionHelper.RatioToPercentage(envData.Outside?.Humidity?.Value ?? 0),
                SeaTemperature = UnitConversionHelper.KelvinToCelsius(envData.Water?.Temperature?.Value ?? 0),
                WindSpeed = UnitConversionHelper.MpsToKnots(envData.Wind?.SpeedTrue?.Value ?? 0),
                WindDirection = UnitConversionHelper.RadiansToDegrees(envData.Wind?.DirectionTrue?.Value ?? 0),
                WaveHeight = envData.Water?.Waves?.SignificantHeight ?? 0,
                Visibility = 10.0,
                IsSynced = false,
                CreatedAt = DateTime.UtcNow
            };

            await dbContext.EnvironmentalData.AddAsync(env, cancellationToken);

            // Cleanup using helper
            await DataCleanupHelper.CleanupOldRecordsAsync(
                dbContext.EnvironmentalData,
                e => e.Timestamp,
                keepCount: 1000,
                cancellationToken);

            _logger.LogDebug("SignalK environmental data collected");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error collecting SignalK environmental data");
        }
    }

    /// <summary>
    /// Collect vessel propulsion data (engines, generators)
    /// SignalK path: /vessels/self/propulsion
    /// </summary>
    private async Task CollectVesselData(
        EdgeDbContext dbContext, 
        ISignalKHttpClient signalKClient, 
        CancellationToken cancellationToken)
    {
        try
        {
            var propulsionData = await signalKClient.GetAsync<Dictionary<string, SignalKEngine>>(
                "vessels/self/propulsion", 
                cancellationToken);

            if (propulsionData == null || !propulsionData.Any()) return;

            // Process each engine
            foreach (var (engineId, engineData) in propulsionData)
            {
                if (engineData == null) continue;

                var engine = new EngineData
                {
                    Timestamp = DateTime.UtcNow,
                    EngineId = engineId.ToUpperInvariant(),
                    Rpm = engineData.Revolutions?.Value ?? 0,
                    LoadPercent = UnitConversionHelper.RatioToPercentage(engineData.Load?.Value ?? 0),
                    CoolantTemp = UnitConversionHelper.KelvinToCelsius(engineData.CoolantTemperature?.Value ?? 0),
                    ExhaustTemp = UnitConversionHelper.KelvinToCelsius(engineData.ExhaustTemperature?.Value ?? 0),
                    LubeOilPressure = UnitConversionHelper.PascalToBar(engineData.OilPressure?.Value ?? 0),
                    LubeOilTemp = UnitConversionHelper.KelvinToCelsius(engineData.OilTemperature?.Value ?? 0),
                    FuelPressure = UnitConversionHelper.PascalToBar(engineData.FuelPressure?.Value ?? 0),
                    FuelRate = UnitConversionHelper.CubicMetersPerSecondToLitersPerHour(engineData.FuelRate?.Value ?? 0),
                    RunningHours = UnitConversionHelper.SecondsToHours(engineData.RunningHours?.Value ?? 0),
                    StartCount = 0,
                    AlarmStatus = 0,
                    IsRunning = engineData.Revolutions?.Value > 0,
                    IsSynced = false,
                    CreatedAt = DateTime.UtcNow
                };

                await dbContext.EngineData.AddAsync(engine, cancellationToken);
            }

            // Cleanup using helper
            await DataCleanupHelper.CleanupOldRecordsAsync(
                dbContext.EngineData,
                e => e.Timestamp,
                keepCount: 2000,
                cancellationToken);

            _logger.LogDebug("SignalK propulsion data collected: {Count} engines", propulsionData.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error collecting SignalK vessel data");
        }
    }
}

#region SignalK Response Models

public class SignalKNavigationResponse
{
    [JsonPropertyName("position")]
    public SignalKValue<SignalKPosition>? Position { get; set; }

    [JsonPropertyName("courseOverGroundTrue")]
    public SignalKValue<double>? CourseOverGroundTrue { get; set; }

    [JsonPropertyName("speedOverGround")]
    public SignalKValue<double>? SpeedOverGround { get; set; }

    [JsonPropertyName("speedThroughWater")]
    public SignalKValue<double>? SpeedThroughWater { get; set; }

    [JsonPropertyName("headingTrue")]
    public SignalKValue<double>? HeadingTrue { get; set; }

    [JsonPropertyName("headingMagnetic")]
    public SignalKValue<double>? HeadingMagnetic { get; set; }

    [JsonPropertyName("rateOfTurn")]
    public SignalKValue<double>? RateOfTurn { get; set; }

    [JsonPropertyName("altitude")]
    public SignalKValue<double>? Altitude { get; set; }

    [JsonPropertyName("attitude")]
    public SignalKAttitude? Attitude { get; set; }

    [JsonPropertyName("depth")]
    public SignalKDepth? Depth { get; set; }
}

public class SignalKEnvironmentResponse
{
    [JsonPropertyName("outside")]
    public SignalKOutside? Outside { get; set; }

    [JsonPropertyName("water")]
    public SignalKWater? Water { get; set; }

    [JsonPropertyName("wind")]
    public SignalKWind? Wind { get; set; }
}

public class SignalKEngine
{
    [JsonPropertyName("revolutions")]
    public SignalKValue<double>? Revolutions { get; set; }

    [JsonPropertyName("load")]
    public SignalKValue<double>? Load { get; set; }

    [JsonPropertyName("coolantTemperature")]
    public SignalKValue<double>? CoolantTemperature { get; set; }

    [JsonPropertyName("exhaustTemperature")]
    public SignalKValue<double>? ExhaustTemperature { get; set; }

    [JsonPropertyName("oilPressure")]
    public SignalKValue<double>? OilPressure { get; set; }

    [JsonPropertyName("oilTemperature")]
    public SignalKValue<double>? OilTemperature { get; set; }

    [JsonPropertyName("fuelPressure")]
    public SignalKValue<double>? FuelPressure { get; set; }

    [JsonPropertyName("fuelRate")]
    public SignalKValue<double>? FuelRate { get; set; }

    [JsonPropertyName("runningHours")]
    public SignalKValue<double>? RunningHours { get; set; }
}

public class SignalKValue<T>
{
    [JsonPropertyName("value")]
    public T? Value { get; set; }

    [JsonPropertyName("timestamp")]
    public string? Timestamp { get; set; }
}

public class SignalKPosition
{
    [JsonPropertyName("latitude")]
    public double Latitude { get; set; }

    [JsonPropertyName("longitude")]
    public double Longitude { get; set; }
}

public class SignalKAttitude
{
    [JsonPropertyName("pitch")]
    public double Pitch { get; set; }

    [JsonPropertyName("roll")]
    public double Roll { get; set; }

    [JsonPropertyName("yaw")]
    public double Yaw { get; set; }
}

public class SignalKDepth
{
    [JsonPropertyName("belowKeel")]
    public double BelowKeel { get; set; }

    [JsonPropertyName("belowTransducer")]
    public double BelowTransducer { get; set; }
}

public class SignalKOutside
{
    [JsonPropertyName("temperature")]
    public SignalKValue<double>? Temperature { get; set; }

    [JsonPropertyName("pressure")]
    public SignalKValue<double>? Pressure { get; set; }

    [JsonPropertyName("humidity")]
    public SignalKValue<double>? Humidity { get; set; }
}

public class SignalKWater
{
    [JsonPropertyName("temperature")]
    public SignalKValue<double>? Temperature { get; set; }

    [JsonPropertyName("waves")]
    public SignalKWaves? Waves { get; set; }
}

public class SignalKWaves
{
    [JsonPropertyName("significantHeight")]
    public double SignificantHeight { get; set; }
}

public class SignalKWind
{
    [JsonPropertyName("speedTrue")]
    public SignalKValue<double>? SpeedTrue { get; set; }

    [JsonPropertyName("directionTrue")]
    public SignalKValue<double>? DirectionTrue { get; set; }
}

#endregion
