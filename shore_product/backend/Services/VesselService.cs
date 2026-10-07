using ProductApi.Data;
using ProductApi.Models;
using ProductApi.DTOs;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Maritime.Shared.Models.Sync;
using ProductApi.Services.Sync;

namespace ProductApi.Services
{
    public interface IVesselService
    {
        Task<IEnumerable<VesselDto>> GetAllVesselsAsync();
        Task<VesselDto?> GetVesselByIdAsync(Guid id);
        Task<VesselDto?> GetVesselByIMOAsync(string imo);
        Task<VesselDto> CreateVesselAsync(CreateVesselDto vesselDto);
        Task<VesselDto?> UpdateVesselAsync(Guid id, UpdateVesselDto vesselDto);
        Task<VesselDto?> UpdateCommercialDataAsync(Guid id, UpdateCommercialDataDto commercialDto);
        /// <summary>Toàn bộ thông số tàu (khóa camelCase) cho màn "Thông số tàu".</summary>
        Task<Dictionary<string, object?>?> GetParticularsAsync(Guid id);
        /// <summary>Sửa thông số tàu (mọi trường) và đẩy các trường đổi xuống tàu. ArgumentException khi dữ liệu sai.</summary>
        Task<Dictionary<string, object?>?> UpdateParticularsAsync(Guid id, JsonElement payload);
        Task<bool> DeleteVesselAsync(Guid id);
        Task<VesselPositionDto> AddPositionAsync(Guid vesselId, CreateVesselPositionDto positionDto);
        Task<IEnumerable<VesselPositionDto>> GetVesselPositionsAsync(Guid vesselId, DateTime? fromDate = null);
        Task<FuelConsumptionDto> AddFuelRecordAsync(Guid vesselId, CreateFuelConsumptionDto fuelDto);
        Task<IEnumerable<FuelConsumptionDto>> GetVesselFuelRecordsAsync(Guid vesselId, DateTime? fromDate = null);
    }

    public class VesselService : IVesselService
    {
        private readonly AppDbContext _context;
        private readonly ILogger<VesselService> _logger;
        private readonly ISyncOutboxService _outbox;

        public VesselService(AppDbContext context, ILogger<VesselService> logger, ISyncOutboxService outbox)
        {
            _context = context;
            _logger = logger;
            _outbox = outbox;
        }

        public async Task<Dictionary<string, object?>?> GetParticularsAsync(Guid id)
        {
            var vessel = await _context.Vessels.AsNoTracking().FirstOrDefaultAsync(v => v.Id == id);
            return vessel == null ? null : VesselParticulars.Read(vessel);
        }

        public async Task<Dictionary<string, object?>?> UpdateParticularsAsync(Guid id, JsonElement payload)
        {
            await using var tx = await _context.Database.BeginTransactionAsync();
            var vessel = await _context.Vessels.AsTracking().FirstOrDefaultAsync(v => v.Id == id);
            if (vessel == null) return null;

            var changes = VesselParticulars.Apply(vessel, payload);
            if (changes.Count == 0)
            {
                await tx.RollbackAsync();
                return VesselParticulars.Read(vessel);
            }

            vessel.UpdatedAt = DateTime.UtcNow;
            vessel.LastShoreSyncAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            // Bờ → tàu: chỉ gửi các trường vừa đổi, tàu áp lên ShipData của nó.
            var patch = VesselParticulars.BuildEdgePatch(vessel, changes);
            if (patch.Count > 0)
                await _outbox.EnqueueAsync(vessel.IMO, VesselParticulars.SyncTable, vessel.Id.ToString(), SyncActionType.UPDATE, patch);

            await tx.CommitAsync();
            _logger.LogInformation("Vessel particulars updated on shore: id={VesselId}, imo={IMO}, fields=[{Fields}], queuedToEdge={Queued}",
                vessel.Id, vessel.IMO, string.Join(", ", changes.Keys), patch.Count > 0);
            return VesselParticulars.Read(vessel);
        }

        public async Task<IEnumerable<VesselDto>> GetAllVesselsAsync()
        {
            var vessels = await _context.Vessels
                .AsNoTracking()
                .Where(v => v.IsActive)
                .Include(v => v.Positions.OrderByDescending(p => p.Timestamp).Take(1))
                .AsSplitQuery()
                .ToListAsync();

            var imos = vessels
                .Select(v => v.IMO)
                .Where(imo => !string.IsNullOrWhiteSpace(imo))
                .ToList();

            var criticalAlertCounts = await _context.SafetyAlarms
                .AsNoTracking()
                .Where(a => imos.Contains(a.OriginNode)
                    && a.Severity == "CRITICAL"
                    && !a.IsResolved)
                .GroupBy(a => new { a.OriginNode, a.Timestamp, a.AlarmType })
                .Select(g => g.Key)
                .GroupBy(a => a.OriginNode)
                .Select(g => new { OriginNode = g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.OriginNode, x => x.Count);

            var provisioningNodes = await _context.SyncNodeTrackers
                .AsNoTracking()
                .Where(n => n.ImoNumber != null && imos.Contains(n.ImoNumber))
                .Select(n => new
                {
                    n.ImoNumber,
                    n.ProvisioningStatus,
                    SortAt = n.LastHandshakeAt ?? n.LastConfigDownloadedAt ?? n.ProvisionedAt ?? n.UpdatedAt
                })
                .ToListAsync();

            var provisioningStatuses = provisioningNodes
                .GroupBy(n => n.ImoNumber!)
                .ToDictionary(
                    g => g.Key,
                    g => g.OrderByDescending(n => n.SortAt).Select(n => n.ProvisioningStatus).FirstOrDefault());

            return vessels.Select(v =>
            {
                var dto = MapToDto(v);
                dto.UnacknowledgedAlerts = criticalAlertCounts.TryGetValue(v.IMO, out var count) ? count : 0;
                dto.ProvisioningStatus = provisioningStatuses.TryGetValue(v.IMO, out var status) ? status : "Unknown";
                return dto;
            });
        }

        public async Task<VesselDto?> GetVesselByIdAsync(Guid id)
        {
            var vessel = await _context.Vessels
                .AsNoTracking()
                .Include(v => v.Positions.OrderByDescending(p => p.Timestamp).Take(100))
                .Include(v => v.FuelRecords.OrderByDescending(f => f.ReportDate).Take(100))
                .Include(v => v.PortCalls.OrderByDescending(p => p.ArrivalTime).Take(50))
                .Include(v => v.Alerts.Where(a => !a.IsAcknowledged))
                .AsSplitQuery()
                .FirstOrDefaultAsync(v => v.Id == id && v.IsActive);

            return vessel != null ? MapToDto(vessel) : null;
        }

        public async Task<VesselDto?> GetVesselByIMOAsync(string imo)
        {
            var vessel = await _context.Vessels
                .AsNoTracking()
                .Include(v => v.Positions.OrderByDescending(p => p.Timestamp).Take(1))
                .FirstOrDefaultAsync(v => v.IMO == imo && v.IsActive);

            return vessel != null ? MapToDto(vessel) : null;
        }

        public async Task<VesselDto> CreateVesselAsync(CreateVesselDto vesselDto)
        {
            var vessel = new Vessel
            {
                Id = Guid.NewGuid(),
                IMO = vesselDto.IMO,
                Name = vesselDto.Name,
                CallSign = vesselDto.CallSign,
                VesselType = vesselDto.VesselType,
                GrossTonnage = vesselDto.GrossTonnage,
                DeadWeight = vesselDto.DeadWeight,
                BuildDate = NormalizeUtc(vesselDto.BuildDate),
                Flag = vesselDto.Flag,
                IsActive = true
            };

            _context.Vessels.Add(vessel);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Created new vessel: {IMO} - {Name}", vessel.IMO, vessel.Name);
            return MapToDto(vessel);
        }

        public async Task<VesselDto?> UpdateVesselAsync(Guid id, UpdateVesselDto vesselDto)
        {
            var vessel = await _context.Vessels
                .AsTracking()
                .FirstOrDefaultAsync(v => v.Id == id);
            if (vessel == null)
            {
                _logger.LogWarning("Basic vessel update skipped: vessel not found id={VesselId}", id);
                return null;
            }

            var previousCallSign = vessel.CallSign;

            vessel.Name = vesselDto.Name;
            vessel.CallSign = vesselDto.CallSign.Trim();
            vessel.VesselType = vesselDto.VesselType.Trim();
            vessel.GrossTonnage = vesselDto.GrossTonnage;
            vessel.DeadWeight = vesselDto.DeadWeight;
            if (vesselDto.BuildDate.HasValue)
            {
                vessel.BuildDate = NormalizeUtc(vesselDto.BuildDate.Value);
            }
            vessel.Flag = vesselDto.Flag.Trim();
            vessel.IsActive = vesselDto.IsActive;

            var changedRows = await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Basic vessel update saved: id={VesselId}, imo={IMO}, callSignBefore={CallSignBefore}, callSignAfter={CallSignAfter}, changedRows={ChangedRows}",
                vessel.Id,
                vessel.IMO,
                previousCallSign,
                vessel.CallSign,
                changedRows);
            return MapToDto(vessel);
        }

        public async Task<VesselDto?> UpdateCommercialDataAsync(Guid id, UpdateCommercialDataDto commercialDto)
        {
            var vessel = await _context.Vessels
                .AsTracking()
                .FirstOrDefaultAsync(v => v.Id == id);
            if (vessel == null)
            {
                _logger.LogWarning("Commercial vessel update skipped: vessel not found id={VesselId}", id);
                return null;
            }

            var previousCallSign = vessel.CallSign;

            // Fleet list edit form also posts to PUT /vessels/{id}.
            if (!string.IsNullOrWhiteSpace(commercialDto.Name))
                vessel.Name = commercialDto.Name.Trim();
            if (!string.IsNullOrWhiteSpace(commercialDto.CallSign))
                vessel.CallSign = commercialDto.CallSign.Trim();
            if (!string.IsNullOrWhiteSpace(commercialDto.VesselType))
                vessel.VesselType = commercialDto.VesselType.Trim();
            if (commercialDto.GrossTonnage.HasValue)
                vessel.GrossTonnage = commercialDto.GrossTonnage.Value;
            if (commercialDto.DeadWeight.HasValue)
                vessel.DeadWeight = commercialDto.DeadWeight.Value;
            if (commercialDto.BuildDate.HasValue)
                vessel.BuildDate = NormalizeUtc(commercialDto.BuildDate.Value);
            if (!string.IsNullOrWhiteSpace(commercialDto.Flag))
                vessel.Flag = commercialDto.Flag.Trim();
            if (commercialDto.IsActive.HasValue)
                vessel.IsActive = commercialDto.IsActive.Value;

            if (IsBasicOnlyUpdate(commercialDto))
            {
                vessel.LastShoreSyncAt = DateTime.UtcNow;
                vessel.UpdatedAt = DateTime.UtcNow;
                var changedRows = await _context.SaveChangesAsync();
                _logger.LogInformation(
                    "Basic-only vessel update saved through commercial route: id={VesselId}, imo={IMO}, callSignBefore={CallSignBefore}, callSignAfter={CallSignAfter}, changedRows={ChangedRows}",
                    vessel.Id,
                    vessel.IMO,
                    previousCallSign,
                    vessel.CallSign,
                    changedRows);
                return MapToDto(vessel);
            }

            // Update Shipowner fields (Shore Master)
            vessel.ShipownerName = commercialDto.ShipownerName;
            vessel.ShipownerStreet = commercialDto.ShipownerStreet;
            vessel.ShipownerCountry = commercialDto.ShipownerCountry;
            vessel.ShipownerZip = commercialDto.ShipownerZip;
            vessel.ShipownerCity = commercialDto.ShipownerCity;
            vessel.ShipownerPhone = commercialDto.ShipownerPhone;
            vessel.ShipownerFax = commercialDto.ShipownerFax;
            vessel.ShipownerEmail = commercialDto.ShipownerEmail;
            vessel.ShipownerContactPerson = commercialDto.ShipownerContactPerson;

            vessel.ManagingOwnerName = commercialDto.ManagingOwnerName;
            vessel.ManagingOwnerEmail = commercialDto.ManagingOwnerEmail;
            vessel.ManagingOwnerContactPerson = commercialDto.ManagingOwnerContactPerson;

            vessel.OperatorName = commercialDto.OperatorName;
            vessel.OperatorEmail = commercialDto.OperatorEmail;
            vessel.OperatorContactPerson = commercialDto.OperatorContactPerson;

            vessel.CsoFirstName = commercialDto.CsoFirstName;
            vessel.CsoLastName = commercialDto.CsoLastName;
            vessel.CsoEmail = commercialDto.CsoEmail;
            vessel.CsoPhone24h = commercialDto.CsoPhone24h;

            vessel.DpaFirstName = commercialDto.DpaFirstName;
            vessel.DpaLastName = commercialDto.DpaLastName;
            vessel.DpaEmail = commercialDto.DpaEmail;
            vessel.DpaPhone24h = commercialDto.DpaPhone24h;

            // Update Charterer fields (Shore Master)
            vessel.ChartererName = commercialDto.ChartererName;
            vessel.ChartererStreet = commercialDto.ChartererStreet;
            vessel.ChartererCountry = commercialDto.ChartererCountry;
            vessel.ChartererZip = commercialDto.ChartererZip;
            vessel.ChartererCity = commercialDto.ChartererCity;
            vessel.ChartererPhone = commercialDto.ChartererPhone;
            vessel.ChartererEmail = commercialDto.ChartererEmail;
            vessel.ChartererContactPerson = commercialDto.ChartererContactPerson;

            vessel.BareboatChartererName = commercialDto.BareboatChartererName;
            vessel.BareboatChartererEmail = commercialDto.BareboatChartererEmail;
            vessel.BareboatChartererContactPerson = commercialDto.BareboatChartererContactPerson;

            // Update Insurance fields (Shore Master)
            vessel.PiClubName = commercialDto.PiClubName;
            vessel.PiClubStreet = commercialDto.PiClubStreet;
            vessel.PiClubCountry = commercialDto.PiClubCountry;
            vessel.PiClubZip = commercialDto.PiClubZip;
            vessel.PiClubCity = commercialDto.PiClubCity;
            vessel.PiClubPhone = commercialDto.PiClubPhone;
            vessel.PiClubEmail = commercialDto.PiClubEmail;
            vessel.PiClubContactPerson = commercialDto.PiClubContactPerson;

            vessel.HmClubName = commercialDto.HmClubName;
            vessel.HmClubEmail = commercialDto.HmClubEmail;
            vessel.HmClubContactPerson = commercialDto.HmClubContactPerson;

            // Update sync metadata
            vessel.LastShoreSyncAt = DateTime.UtcNow;
            vessel.UpdatedAt = DateTime.UtcNow;

            var commercialChangedRows = await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Commercial vessel update saved: id={VesselId}, imo={IMO}, callSignBefore={CallSignBefore}, callSignAfter={CallSignAfter}, changedRows={ChangedRows}",
                vessel.Id,
                vessel.IMO,
                previousCallSign,
                vessel.CallSign,
                commercialChangedRows);

            // TODO: Enqueue to SyncOutbox for Shore → Edge replication
            // await EnqueueCommercialDataToSyncOutbox(vessel);

            return MapToDto(vessel);
        }

        private static bool IsBasicOnlyUpdate(UpdateCommercialDataDto dto)
        {
            var hasBasicFields =
                dto.Name != null ||
                dto.CallSign != null ||
                dto.VesselType != null ||
                dto.GrossTonnage.HasValue ||
                dto.DeadWeight.HasValue ||
                dto.BuildDate.HasValue ||
                dto.Flag != null ||
                dto.IsActive.HasValue;

            if (!hasBasicFields)
            {
                return false;
            }

            return typeof(UpdateCommercialDataDto)
                .GetProperties()
                .Where(property => !BasicVesselUpdateFields.Contains(property.Name))
                .All(property => property.GetValue(dto) == null);
        }

        private static readonly HashSet<string> BasicVesselUpdateFields = new()
        {
            nameof(UpdateCommercialDataDto.Name),
            nameof(UpdateCommercialDataDto.CallSign),
            nameof(UpdateCommercialDataDto.VesselType),
            nameof(UpdateCommercialDataDto.GrossTonnage),
            nameof(UpdateCommercialDataDto.DeadWeight),
            nameof(UpdateCommercialDataDto.BuildDate),
            nameof(UpdateCommercialDataDto.Flag),
            nameof(UpdateCommercialDataDto.IsActive)
        };

        private static DateTime NormalizeUtc(DateTime value)
        {
            return value.Kind switch
            {
                DateTimeKind.Utc => value,
                DateTimeKind.Local => value.ToUniversalTime(),
                _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
            };
        }

        public async Task<bool> DeleteVesselAsync(Guid id)
        {
            var vessel = await _context.Vessels
                .AsTracking()
                .FirstOrDefaultAsync(v => v.Id == id);
            if (vessel == null) return false;

            vessel.IsActive = false;
            await _context.SaveChangesAsync();

            _logger.LogInformation("Deactivated vessel: {IMO} - {Name}", vessel.IMO, vessel.Name);
            return true;
        }

        public async Task<VesselPositionDto> AddPositionAsync(Guid vesselId, CreateVesselPositionDto positionDto)
        {
            var position = new VesselPosition
            {
                Id = Guid.NewGuid(),
                VesselId = vesselId,
                Latitude = positionDto.Latitude,
                Longitude = positionDto.Longitude,
                Speed = positionDto.Speed,
                Course = positionDto.Course,
                Timestamp = positionDto.Timestamp ?? DateTime.UtcNow,
                Source = positionDto.Source ?? "GPS"
            };

            _context.VesselPositions.Add(position);
            await _context.SaveChangesAsync();

            return new VesselPositionDto
            {
                Id = position.Id,
                VesselId = position.VesselId,
                Latitude = position.Latitude,
                Longitude = position.Longitude,
                Speed = position.Speed,
                Course = position.Course,
                Timestamp = position.Timestamp,
                Source = position.Source
            };
        }

        public async Task<IEnumerable<VesselPositionDto>> GetVesselPositionsAsync(Guid vesselId, DateTime? fromDate = null)
        {
            var query = _context.VesselPositions
                .AsNoTracking()
                .Where(vp => vp.VesselId == vesselId);

            if (fromDate.HasValue)
            {
                query = query.Where(vp => vp.Timestamp >= fromDate.Value);
            }

            var positions = await query
                .OrderByDescending(vp => vp.Timestamp)
                .Take(1000) // Limit to last 1000 positions
                .ToListAsync();

            return positions.Select(p => new VesselPositionDto
            {
                Id = p.Id,
                VesselId = p.VesselId,
                Latitude = p.Latitude,
                Longitude = p.Longitude,
                Speed = p.Speed,
                Course = p.Course,
                Timestamp = p.Timestamp,
                Source = p.Source
            });
        }

        public async Task<FuelConsumptionDto> AddFuelRecordAsync(Guid vesselId, CreateFuelConsumptionDto fuelDto)
        {
            var fuelRecord = new FuelConsumption
            {
                Id = Guid.NewGuid(),
                VesselId = vesselId,
                ReportDate = fuelDto.ReportDate,
                FuelConsumed = fuelDto.FuelConsumed,
                FuelType = fuelDto.FuelType,
                DistanceTraveled = fuelDto.DistanceTraveled,
                AverageSpeed = fuelDto.AverageSpeed,
                FuelEfficiency = fuelDto.FuelConsumed / Math.Max(fuelDto.DistanceTraveled, 0.1)
            };

            _context.FuelConsumptions.Add(fuelRecord);
            await _context.SaveChangesAsync();

            return new FuelConsumptionDto
            {
                Id = fuelRecord.Id,
                VesselId = fuelRecord.VesselId,
                ReportDate = fuelRecord.ReportDate,
                FuelConsumed = fuelRecord.FuelConsumed,
                FuelType = fuelRecord.FuelType,
                DistanceTraveled = fuelRecord.DistanceTraveled,
                AverageSpeed = fuelRecord.AverageSpeed,
                FuelEfficiency = fuelRecord.FuelEfficiency
            };
        }

        public async Task<IEnumerable<FuelConsumptionDto>> GetVesselFuelRecordsAsync(Guid vesselId, DateTime? fromDate = null)
        {
            var query = _context.FuelConsumptions
                .AsNoTracking()
                .Where(fc => fc.VesselId == vesselId);

            if (fromDate.HasValue)
            {
                query = query.Where(fc => fc.ReportDate >= fromDate.Value);
            }

            var fuelRecords = await query
                .OrderByDescending(fc => fc.ReportDate)
                .Take(500) // Limit results
                .ToListAsync();

            return fuelRecords.Select(f => new FuelConsumptionDto
            {
                Id = f.Id,
                VesselId = f.VesselId,
                ReportDate = f.ReportDate,
                FuelConsumed = f.FuelConsumed,
                FuelType = f.FuelType,
                DistanceTraveled = f.DistanceTraveled,
                AverageSpeed = f.AverageSpeed,
                FuelEfficiency = f.FuelEfficiency
            });
        }

        private static VesselDto MapToDto(Vessel vessel)
        {
            return new VesselDto
            {
                Id = vessel.Id,
                IMO = vessel.IMO,
                Name = vessel.Name,
                CallSign = vessel.CallSign,
                VesselType = vessel.VesselType,
                GrossTonnage = vessel.GrossTonnage,
                DeadWeight = vessel.DeadWeight,
                BuildDate = vessel.BuildDate,
                Flag = vessel.Flag,
                IsActive = vessel.IsActive,
                LastPosition = vessel.Positions?.FirstOrDefault() != null 
                    ? new VesselPositionDto
                    {
                        Id = vessel.Positions.First().Id,
                        VesselId = vessel.Positions.First().VesselId,
                        Latitude = vessel.Positions.First().Latitude,
                        Longitude = vessel.Positions.First().Longitude,
                        Speed = vessel.Positions.First().Speed,
                        Course = vessel.Positions.First().Course,
                        Timestamp = vessel.Positions.First().Timestamp,
                        Source = vessel.Positions.First().Source
                    } : null,
                UnacknowledgedAlerts = vessel.Alerts?.Count(a => !a.IsAcknowledged) ?? 0,
                ProvisioningStatus = "Unknown",

                // Extended Basic Data
                OfficialNumber = vessel.OfficialNumber,
                PortOfRegistry = vessel.PortOfRegistry,
                PreviousName = vessel.PreviousName,
                PreviousFlag = vessel.PreviousFlag,
                MmsiNumber = vessel.MmsiNumber,
                ClassNotation = vessel.ClassNotation,
                ClassRegisterNumber = vessel.ClassRegisterNumber,
                ShipyardCountry = vessel.ShipyardCountry,
                ShipyardName = vessel.ShipyardName,
                YardNo = vessel.YardNo,
                CompanyImoNumber = vessel.CompanyImoNumber,
                SuezCanalIdNumber = vessel.SuezCanalIdNumber,
                KeelLaidDate = vessel.KeelLaidDate,
                YearBuilt = vessel.YearBuilt,
                DateOfRegistry = vessel.DateOfRegistry,
                OwnerImoNumber = vessel.OwnerImoNumber,
                PanamaCanalIdNumber = vessel.PanamaCanalIdNumber,
                MaxPersonsAllowedOB = vessel.MaxPersonsAllowedOB,
                ServiceSpeedKts = vessel.ServiceSpeedKts,
                VrpNumber = vessel.VrpNumber,
                VrpType = vessel.VrpType,
                NoOfCrewSafeManning = vessel.NoOfCrewSafeManning,
                MaxPassengersAllowedOB = vessel.MaxPassengersAllowedOB,

                // Dimensions
                Loa = vessel.Loa,
                Lbp = vessel.Lbp,
                BreadthMoulded = vessel.BreadthMoulded,
                DepthMoulded = vessel.DepthMoulded,
                DraftMoulded = vessel.DraftMoulded,
                DraftScantling = vessel.DraftScantling,
                DraftFullBallast = vessel.DraftFullBallast,
                HMaxAirdraft = vessel.HMaxAirdraft,
                LightShip = vessel.LightShip,
                BlockCoefficient = vessel.BlockCoefficient,
                TpcAtSummerDraft = vessel.TpcAtSummerDraft,
                GrossTonnageInternational = vessel.GrossTonnageInternational,
                GrossTonnageSuezCanal = vessel.GrossTonnageSuezCanal,
                GrossTonnagePanamaCanal = vessel.GrossTonnagePanamaCanal,
                NettTonnageInternational = vessel.NettTonnageInternational,

                // Machinery
                AnchorChainPort = vessel.AnchorChainPort,
                AnchorChainStarboard = vessel.AnchorChainStarboard,
                AnchorChainStern = vessel.AnchorChainStern,
                HarbourGeneratorMaker = vessel.HarbourGeneratorMaker,
                HarbourGeneratorMaxPowerKW = vessel.HarbourGeneratorMaxPowerKW,
                AzimuthEngFwdCount = vessel.AzimuthEngFwdCount,
                AzimuthEngFwdMaxPowerKW = vessel.AzimuthEngFwdMaxPowerKW,

                // Shipowner
                ShipownerName = vessel.ShipownerName,
                ShipownerStreet = vessel.ShipownerStreet,
                ShipownerCountry = vessel.ShipownerCountry,
                ShipownerZip = vessel.ShipownerZip,
                ShipownerCity = vessel.ShipownerCity,
                ShipownerPhone = vessel.ShipownerPhone,
                ShipownerFax = vessel.ShipownerFax,
                ShipownerEmail = vessel.ShipownerEmail,
                ShipownerContactPerson = vessel.ShipownerContactPerson,
                ManagingOwnerName = vessel.ManagingOwnerName,
                ManagingOwnerEmail = vessel.ManagingOwnerEmail,
                ManagingOwnerContactPerson = vessel.ManagingOwnerContactPerson,
                OperatorName = vessel.OperatorName,
                OperatorEmail = vessel.OperatorEmail,
                OperatorContactPerson = vessel.OperatorContactPerson,
                CsoFirstName = vessel.CsoFirstName,
                CsoLastName = vessel.CsoLastName,
                CsoEmail = vessel.CsoEmail,
                CsoPhone24h = vessel.CsoPhone24h,
                DpaFirstName = vessel.DpaFirstName,
                DpaLastName = vessel.DpaLastName,
                DpaEmail = vessel.DpaEmail,
                DpaPhone24h = vessel.DpaPhone24h,

                // Charterer
                ChartererName = vessel.ChartererName,
                ChartererStreet = vessel.ChartererStreet,
                ChartererCountry = vessel.ChartererCountry,
                ChartererZip = vessel.ChartererZip,
                ChartererCity = vessel.ChartererCity,
                ChartererPhone = vessel.ChartererPhone,
                ChartererEmail = vessel.ChartererEmail,
                ChartererContactPerson = vessel.ChartererContactPerson,
                BareboatChartererName = vessel.BareboatChartererName,
                BareboatChartererEmail = vessel.BareboatChartererEmail,
                BareboatChartererContactPerson = vessel.BareboatChartererContactPerson,

                // Class / Flag State
                ClassSocietyName = vessel.ClassSocietyName,
                ClassSocietyCountry = vessel.ClassSocietyCountry,
                ClassSocietyEmail = vessel.ClassSocietyEmail,
                ClassSocietyContactPerson = vessel.ClassSocietyContactPerson,
                FlagStateName = vessel.FlagStateName,
                FlagStateCountry = vessel.FlagStateCountry,
                FlagStateEmail = vessel.FlagStateEmail,
                FlagStateContactPerson = vessel.FlagStateContactPerson,

                // Insurance
                PiClubName = vessel.PiClubName,
                PiClubStreet = vessel.PiClubStreet,
                PiClubCountry = vessel.PiClubCountry,
                PiClubZip = vessel.PiClubZip,
                PiClubCity = vessel.PiClubCity,
                PiClubPhone = vessel.PiClubPhone,
                PiClubEmail = vessel.PiClubEmail,
                PiClubContactPerson = vessel.PiClubContactPerson,
                HmClubName = vessel.HmClubName,
                HmClubEmail = vessel.HmClubEmail,
                HmClubContactPerson = vessel.HmClubContactPerson,

                // Radio Communication
                InmarsatPhone1 = vessel.InmarsatPhone1,
                InmarsatPhone2 = vessel.InmarsatPhone2,
                InmarsatFax1 = vessel.InmarsatFax1,
                EmailAddress1 = vessel.EmailAddress1,
                EmailAddress2 = vessel.EmailAddress2,
                GsmPhone = vessel.GsmPhone,
                SeaAreaA1 = vessel.SeaAreaA1,
                SeaAreaA2 = vessel.SeaAreaA2,
                SeaAreaA3 = vessel.SeaAreaA3,
                SeaAreaA4 = vessel.SeaAreaA4,
                Ais = vessel.Ais,
                Navtex = vessel.Navtex,
                EpirbNumber = vessel.EpirbNumber,
                EpirbMaker = vessel.EpirbMaker,

                // Tanks & Cargo
                HfoCbm = vessel.HfoCbm,
                MdoCbm = vessel.MdoCbm,
                LubOilCbm = vessel.LubOilCbm,
                FreshWaterCbm = vessel.FreshWaterCbm,
                BallastWaterCbm = vessel.BallastWaterCbm,
                NoOfBallastTanks = vessel.NoOfBallastTanks,
                TeuTotal = vessel.TeuTotal,
                TeuOnDeck = vessel.TeuOnDeck,
                TeuUnderDeck = vessel.TeuUnderDeck,
                GrainCbm = vessel.GrainCbm,
                BalesCbm = vessel.BalesCbm,
                NoOfCargoHolds = vessel.NoOfCargoHolds,
                NoOfHatches = vessel.NoOfHatches,

                // Sync Metadata
                LastEdgeSyncAt = vessel.LastEdgeSyncAt,
                LastShoreSyncAt = vessel.LastShoreSyncAt
            };
        }
    }
}
