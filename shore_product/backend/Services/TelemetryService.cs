using ProductApi.DTOs;

namespace ProductApi.Services
{
    public interface ITelemetryService
    {
        Task ProcessNmeaDataAsync(NmeaDataDto data);
        Task ProcessBatchDataAsync(List<SensorDataDto> batch);
        Task<VesselPositionDto?> GetLatestPositionAsync(string vesselId);
        Task<IEnumerable<VesselPositionDto>> GetVesselRouteAsync(string vesselId, DateTime? fromDate, DateTime? toDate);
        Task ProcessAlertAsync(VesselAlertDto alert);
    }

    public class TelemetryService : ITelemetryService
    {
        private readonly ILogger<TelemetryService> _logger;
        private readonly IVesselService _vesselService;
        private readonly IAlertService _alertService;

        public TelemetryService(
            ILogger<TelemetryService> logger,
            IVesselService vesselService,
            IAlertService alertService)
        {
            _logger = logger;
            _vesselService = vesselService;
            _alertService = alertService;
        }

        public async Task ProcessNmeaDataAsync(NmeaDataDto data)
        {
            try
            {
                // Parse NMEA sentence and extract position data
                var positionData = ParseNmeaData(data.NmeaSentence);
                if (positionData != null && Guid.TryParse(data.VesselId, out var vesselGuid))
                {
                    await _vesselService.AddPositionAsync(vesselGuid, positionData);
                }

                _logger.LogInformation("Processed NMEA data for vessel {VesselId}", data.VesselId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing NMEA data for vessel {VesselId}", data.VesselId);
            }
        }

        public async Task ProcessBatchDataAsync(List<SensorDataDto> batch)
        {
            try
            {
                foreach (var sensorData in batch)
                {
                    await ProcessSensorData(sensorData);
                }

                _logger.LogInformation("Processed batch of {Count} sensor readings", batch.Count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing sensor batch");
            }
        }

        public async Task<VesselPositionDto?> GetLatestPositionAsync(string vesselId)
        {
            try
            {
                if (Guid.TryParse(vesselId, out var vesselGuid))
                {
                    var positions = await _vesselService.GetVesselPositionsAsync(vesselGuid);
                    return positions.FirstOrDefault();
                }
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting latest position for vessel {VesselId}", vesselId);
                return null;
            }
        }

        public async Task<IEnumerable<VesselPositionDto>> GetVesselRouteAsync(string vesselId, DateTime? fromDate, DateTime? toDate)
        {
            try
            {
                if (Guid.TryParse(vesselId, out var vesselGuid))
                {
                    var positions = await _vesselService.GetVesselPositionsAsync(vesselGuid, fromDate);
                    
                    if (toDate.HasValue)
                    {
                        positions = positions.Where(p => p.Timestamp <= toDate.Value);
                    }
                    
                    return positions.OrderBy(p => p.Timestamp);
                }
                return Enumerable.Empty<VesselPositionDto>();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting route for vessel {VesselId}", vesselId);
                return Enumerable.Empty<VesselPositionDto>();
            }
        }

        public async Task ProcessAlertAsync(VesselAlertDto alert)
        {
            try
            {
                var vesselGuid = alert.VesselId;
                var alertDto = new CreateVesselAlertDto
                {
                    AlertType = alert.AlertType,
                    Message = alert.Message,
                    Severity = alert.Severity,
                    Data = alert.Data
                };

                await _alertService.CreateAlertAsync(vesselGuid, alertDto);
                _logger.LogInformation("Processed alert for vessel {VesselId}: {AlertType}", alert.VesselId, alert.AlertType);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing alert for vessel {VesselId}", alert.VesselId);
            }
        }

        private CreateVesselPositionDto? ParseNmeaData(string nmeaSentence)
        {
            try
            {
                // Basic NMEA parsing - in production, use a proper NMEA parser library
                var parts = nmeaSentence.Split(',');
                
                if (parts.Length < 6 || !parts[0].EndsWith("GGA") && !parts[0].EndsWith("RMC"))
                    return null;

                if (parts[0].EndsWith("GGA"))
                {
                    // $GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47
                    return ParseGGA(parts);
                }
                else if (parts[0].EndsWith("RMC"))
                {
                    // $GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A
                    return ParseRMC(parts);
                }

                return null;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse NMEA sentence: {Sentence}", nmeaSentence);
                return null;
            }
        }

        private CreateVesselPositionDto? ParseGGA(string[] parts)
        {
            if (parts.Length < 15) return null;

            try
            {
                var lat = ConvertToDecimalDegrees(parts[2], parts[3]);
                var lon = ConvertToDecimalDegrees(parts[4], parts[5]);
                
                if (!lat.HasValue || !lon.HasValue) return null;

                return new CreateVesselPositionDto
                {
                    Latitude = lat.Value,
                    Longitude = lon.Value,
                    Timestamp = DateTime.UtcNow,
                    Source = "GPS"
                };
            }
            catch
            {
                return null;
            }
        }

        private CreateVesselPositionDto? ParseRMC(string[] parts)
        {
            if (parts.Length < 12) return null;

            try
            {
                var lat = ConvertToDecimalDegrees(parts[3], parts[4]);
                var lon = ConvertToDecimalDegrees(parts[5], parts[6]);
                
                if (!lat.HasValue || !lon.HasValue) return null;

                double? speed = null;
                double? course = null;

                if (double.TryParse(parts[7], out var speedKnots))
                    speed = speedKnots;
                
                if (double.TryParse(parts[8], out var courseDegrees))
                    course = courseDegrees;

                return new CreateVesselPositionDto
                {
                    Latitude = lat.Value,
                    Longitude = lon.Value,
                    Speed = speed,
                    Course = course,
                    Timestamp = DateTime.UtcNow,
                    Source = "GPS"
                };
            }
            catch
            {
                return null;
            }
        }

        private double? ConvertToDecimalDegrees(string coordinate, string direction)
        {
            if (string.IsNullOrEmpty(coordinate) || coordinate.Length < 4)
                return null;

            try
            {
                var degrees = double.Parse(coordinate.Substring(0, coordinate.Length - 7));
                var minutes = double.Parse(coordinate.Substring(coordinate.Length - 7));
                
                var decimal_degrees = degrees + (minutes / 60.0);
                
                if (direction == "S" || direction == "W")
                    decimal_degrees = -decimal_degrees;
                
                return decimal_degrees;
            }
            catch
            {
                return null;
            }
        }

        private async Task ProcessSensorData(SensorDataDto sensorData)
        {
            // Process different sensor types
            switch (sensorData.SensorType.ToUpper())
            {
                case "ENGINE":
                    await ProcessEngineData(sensorData);
                    break;
                case "FUEL":
                    await ProcessFuelData(sensorData);
                    break;
                case "NAVIGATION":
                    ProcessNavigationData(sensorData);
                    break;
                default:
                    _logger.LogWarning("Unknown sensor type: {SensorType}", sensorData.SensorType);
                    break;
            }
        }

        private async Task ProcessEngineData(SensorDataDto sensorData)
        {
            if (Guid.TryParse(sensorData.VesselId, out var vesselGuid))
            {
                // Check for engine alerts
                if (sensorData.Parameter.ToUpper() == "TEMPERATURE" && sensorData.Value > 85) // High temperature
                {
                    await _alertService.CreateAlertAsync(vesselGuid, new CreateVesselAlertDto
                    {
                        AlertType = "ENGINE_OVERTEMP",
                        Message = $"Engine temperature high: {sensorData.Value}°C",
                        Severity = sensorData.Value > 95 ? "CRITICAL" : "WARNING"
                    });
                }
            }
        }

        private async Task ProcessFuelData(SensorDataDto sensorData)
        {
            if (Guid.TryParse(sensorData.VesselId, out var vesselGuid))
            {
                // Check for fuel level alerts
                if (sensorData.Parameter.ToUpper() == "LEVEL" && sensorData.Value < 20) // Low fuel
                {
                    await _alertService.CreateFuelAlertAsync(vesselGuid, sensorData.Value, 20);
                }
            }
        }

        private void ProcessNavigationData(SensorDataDto sensorData)
        {
            if (Guid.TryParse(sensorData.VesselId, out var vesselGuid))
            {
                // Process navigation-specific data
                if (sensorData.Parameter.ToUpper() == "POSITION")
                {
                    // Handle position updates from navigation sensors
                    _logger.LogDebug("Navigation position update for vessel {VesselId}", sensorData.VesselId);
                }
            }
        }
    }
}