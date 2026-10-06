using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.DTOs;
using ProductApi.Models;
using ProductApi.Services.Sync;
using Maritime.Shared.Models.Sync;

namespace ProductApi.Services.Voyage;

public class VoyageService : IVoyageService
{
    private readonly AppDbContext _context;
    private readonly ILogger<VoyageService> _logger;

    public VoyageService(AppDbContext context, ILogger<VoyageService> logger, ISyncOutboxService syncOutbox)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<FleetDashboardDto> GetFleetDashboardAsync()
    {
        var activeStatuses = new[] { "UNDERWAY", "READY", "APPROVED" };
        var completedStatuses = new[] { "COMPLETED", "ARRIVED" };

        // Compute summary aggregates in the database instead of loading all voyages
        var summary = await _context.VoyageRecords
            .AsNoTracking()
            .GroupBy(v => 1)
            .Select(g => new FleetSummary
            {
                TotalVoyages = g.Count(),
                ActiveVoyages = g.Count(v => activeStatuses.Contains(v.VoyageStatus)),
                CompletedVoyages = g.Count(v => completedStatuses.Contains(v.VoyageStatus)),
                PlanningVoyages = g.Count(v => v.VoyageStatus == "PLANNING"),
                UniqueVessels = g.Select(v => v.VesselIMO).Where(x => x != null).Distinct().Count(),
                UniqueNodes = g.Select(v => v.OriginNode).Distinct().Count(),
                TotalPlannedDistance = g.Sum(v => v.PlannedDistance ?? 0),
                TotalActualDistance = g.Sum(v => v.DistanceTraveled ?? 0),
                TotalPlannedFuel = g.Sum(v => v.PlannedFuelConsumption ?? 0),
                TotalActualFuel = g.Sum(v => v.FuelConsumed ?? 0),
            })
            .FirstOrDefaultAsync() ?? new FleetSummary();

        // Vessel summaries: only load the fields needed for grouping
        var vesselSummaries = await _context.VoyageRecords
            .AsNoTracking()
            .GroupBy(v => new { v.VesselIMO, v.VesselName, v.OriginNode })
            .Select(g => new VesselVoyageSummary
            {
                VesselName = g.Key.VesselName ?? "Unknown",
                VesselIMO = g.Key.VesselIMO ?? "",
                OriginNode = g.Key.OriginNode ?? "",
                VoyageCount = g.Count(),
                ActiveCount = g.Count(v => activeStatuses.Contains(v.VoyageStatus)),
                CurrentVoyageNumber = g
                    .Where(v => activeStatuses.Contains(v.VoyageStatus))
                    .OrderByDescending(v => v.CommencedAt ?? v.CreatedAt)
                    .Select(v => v.VoyageNumber)
                    .FirstOrDefault(),
                CurrentStatus = g
                    .Where(v => activeStatuses.Contains(v.VoyageStatus))
                    .OrderByDescending(v => v.CommencedAt ?? v.CreatedAt)
                    .Select(v => v.VoyageStatus)
                    .FirstOrDefault(),
                LastSyncAt = g.Max(v => v.UpdatedAt),
            })
            .OrderByDescending(x => x.ActiveCount)
            .ThenBy(x => x.VesselName)
            .ToListAsync();

        var statusBreakdown = await _context.VoyageRecords
            .AsNoTracking()
            .GroupBy(v => v.VoyageStatus)
            .Select(g => new StatusBreakdown { Status = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .ToListAsync();

        var staleThreshold = DateTime.UtcNow.AddHours(-24);
        var syncHealth = await _context.VoyageRecords
            .AsNoTracking()
            .GroupBy(v => new { v.OriginNode, v.VesselName })
            .Select(g => new SyncHealthItem
            {
                OriginNode = g.Key.OriginNode ?? "",
                VesselName = g.Key.VesselName ?? "",
                TotalVoyages = g.Count(),
                LastSyncAt = g.Max(v => v.UpdatedAt),
                StaleVoyageCount = g.Count(v =>
                    activeStatuses.Contains(v.VoyageStatus) && v.UpdatedAt < staleThreshold),
            })
            .ToListAsync();

        // Compute health status in-memory (simple string logic)
        foreach (var item in syncHealth)
        {
            item.HealthStatus = item.StaleVoyageCount > 0 ? "WARNING"
                : item.LastSyncAt < staleThreshold ? "STALE" : "HEALTHY";
        }
        syncHealth = syncHealth
            .OrderBy(x => x.HealthStatus == "HEALTHY" ? 2 : x.HealthStatus == "WARNING" ? 0 : 1)
            .ToList();

        var financialOverview = await _context.VoyageRecords
            .AsNoTracking()
            .GroupBy(v => 1)
            .Select(g => new FinancialOverview
            {
                TotalEstimatedCost = g.Sum(v => v.TotalEstimatedCost ?? 0),
                TotalEstimatedRevenue = g.Sum(v => v.TotalEstimatedRevenue ?? 0),
                TotalActualCost = g.Sum(v => v.TotalActualCost ?? 0),
                TotalActualRevenue = g.Sum(v => v.TotalActualRevenue ?? 0),
                TotalOutstanding = g.Sum(v => v.OutstandingBalance ?? 0),
                EstimatedMargin = g.Sum(v => v.EstimatedProfitMargin ?? 0),
                ActualMargin = g.Sum(v => v.ActualProfitMargin ?? 0),
            })
            .FirstOrDefaultAsync() ?? new FinancialOverview();

        return new FleetDashboardDto
        {
            Summary = summary,
            VesselSummaries = vesselSummaries,
            StatusBreakdown = statusBreakdown,
            SyncHealth = syncHealth,
            FinancialOverview = financialOverview,
        };
    }

    public async Task<VoyageTimelineDto> GetVoyageTimelineAsync(Guid voyageId, string? source = null, int? limit = null)
    {
        var voyage = await _context.VoyageRecords
            .AsNoTracking()
            .Where(v => v.Id == voyageId)
            .Select(v => new { v.VoyageNumber })
            .FirstOrDefaultAsync();

        if (voyage == null)
            return new VoyageTimelineDto { VoyageId = voyageId };

        var events = new List<TimelineEvent>();

        // Status changes
        if (source == null || source == "status")
        {
            var statusEvents = await _context.VoyageStatusHistories
                .AsNoTracking()
                .Where(x => x.VoyageId == voyageId)
                .OrderByDescending(x => x.ChangedAt)
                .Select(x => new TimelineEvent
                {
                    Id = x.Id,
                    Source = "STATUS",
                    EventType = $"{x.FromStatus} → {x.ToStatus}",
                    EventTime = x.ChangedAt,
                    Description = x.Notes ?? $"Trạng thái chuyển từ {x.FromStatus} sang {x.ToStatus}",
                    ChangedBy = x.ChangedBy,
                })
                .ToListAsync();
            events.AddRange(statusEvents);
        }

        // Port calls
        if (source == null || source == "port_call")
        {
            var portCalls = await _context.PortCalls
                .AsNoTracking()
                .Where(x => x.VoyageId == voyageId)
                .ToListAsync();

            var portCallEvents = portCalls.Select(x => new TimelineEvent
            {
                Id = x.Id,
                Source = "PORT_CALL",
                EventType = "ARRIVAL",
                EventTime = x.ArrivalTime ?? x.CreatedAt,
                PortName = x.PortName,
                PortCode = x.PortCode,
                Description = $"Arrived at {x.PortName} ({x.PortCode}), Berth: {x.BerthNumber ?? "N/A"}",
                Metrics = new Dictionary<string, object?>
                {
                    ["draftFore"] = x.DraftFore,
                    ["draftAft"] = x.DraftAft,
                }
            }).ToList();
            events.AddRange(portCallEvents);
        }

        // Log entries
        if (source == null || source == "log")
        {
            var logRaw = await _context.VoyageLogEntries
                .AsNoTracking()
                .Where(x => x.VoyageId == voyageId)
                .OrderByDescending(x => x.EventDateTime)
                .Take(200)
                .ToListAsync();

            var logEvents = logRaw.Select(x => new TimelineEvent
            {
                Id = x.Id,
                Source = "LOG",
                EventType = x.EventType ?? "LOG_ENTRY",
                EventTime = x.EventDateTime,
                PortName = x.PortName,
                PortCode = x.PortLocode,
                Description = x.Remarks,
                Metrics = new Dictionary<string, object?>
                {
                    ["distance"] = x.DistanceFromLast,
                    ["speed"] = x.SpeedOverGround,
                    ["course"] = x.CourseOverGround,
                }
            }).ToList();
            events.AddRange(logEvents);
        }

        // Cargo operations
        if (source == null || source == "cargo")
        {
            var cargoRaw = await _context.CargoOperations
                .AsNoTracking()
                .Where(x => x.VoyageId == voyageId)
                .ToListAsync();

            var cargoEvents = cargoRaw.Select(x => new TimelineEvent
            {
                Id = x.Id,
                Source = "CARGO",
                EventType = x.OperationType ?? "CARGO_OP",
                EventTime = x.LoadedAt ?? x.DischargedAt ?? x.CreatedAt,
                PortName = x.OperationType == "LOADING" ? x.LoadingPort : x.DischargePort,
                Description = $"{x.OperationType}: {x.CargoType} - {x.Quantity} {x.Unit}",
                Metrics = new Dictionary<string, object?>
                {
                    ["quantity"] = x.Quantity,
                    ["cargoType"] = x.CargoType,
                }
            }).ToList();
            events.AddRange(cargoEvents);
        }

        // Crew assignments
        if (source == null || source == "crew")
        {
            var crewEvents = await _context.VoyageCrewAssignments
                .AsNoTracking()
                .Where(x => x.VoyageId == voyageId)
                .Select(x => new TimelineEvent
                {
                    Id = x.Id,
                    Source = "CREW",
                    EventType = "ASSIGNMENT",
                    EventTime = x.EmbarkDate ?? x.CreatedAt,
                    PortName = x.EmbarkPortName,
                    PortCode = x.EmbarkPortCode,
                    Description = $"Crew embark: Role {x.Role} at {x.EmbarkPortName}",
                })
                .ToListAsync();
            events.AddRange(crewEvents);
        }

        events = events.OrderByDescending(e => e.EventTime).ToList();

        if (limit.HasValue && limit.Value > 0)
            events = events.Take(limit.Value).ToList();

        return new VoyageTimelineDto
        {
            VoyageId = voyageId,
            VoyageNumber = voyage.VoyageNumber,
            Events = events,
            TotalEvents = events.Count,
        };
    }

    public async Task<VoyagePerformanceDto> GetVoyagePerformanceAsync(Guid voyageId)
    {
        var voyage = await _context.VoyageRecords
            .AsNoTracking()
            .Include(v => v.PlanLegs)
            .Include(v => v.PortCalls)
            .Include(v => v.LogEntries)
            .Include(v => v.CargoOperations)
            .Include(v => v.CostEstimates)
            .Include(v => v.Disbursements)
            .FirstOrDefaultAsync(v => v.Id == voyageId);

        if (voyage == null)
            return new VoyagePerformanceDto { VoyageId = voyageId };

        var durationHrs = voyage.PlannedDurationHours;
        double? actualDuration = null;
        if (voyage.CommencedAt.HasValue)
        {
            var end = voyage.CompletedAt ?? voyage.ArrivedAt ?? DateTime.UtcNow;
            actualDuration = (end - voyage.CommencedAt.Value).TotalHours;
        }

        var distDim = BuildDimension("Distance", "NM", voyage.PlannedDistance, voyage.DistanceTraveled);
        var durDim = BuildDimension("Duration", "hrs", durationHrs, actualDuration);
        var spdDim = BuildDimension("Avg Speed", "kn", voyage.PlannedAverageSpeed, voyage.AverageSpeed);
        var fuelDim = BuildDimension("Fuel", "MT", voyage.PlannedFuelConsumption, voyage.FuelConsumed);

        var scores = new[] { distDim, durDim, spdDim, fuelDim }
            .Where(d => d.VariancePercent.HasValue)
            .Select(d => Math.Max(0, 100 - Math.Abs(d.VariancePercent!.Value)))
            .ToList();

        var overallScore = scores.Count > 0 ? scores.Average() : 0;
        var rating = overallScore >= 90 ? "EXCELLENT" :
                     overallScore >= 75 ? "GOOD" :
                     overallScore >= 50 ? "FAIR" : "POOR";

        var legPerformances = voyage.PlanLegs
            .OrderBy(l => l.Sequence)
            .Select(leg =>
            {
                var legPortCalls = voyage.PortCalls.Count(pc =>
                    pc.PortCode == leg.FromPortCode || pc.PortCode == leg.ToPortCode);
                var legLogEntries = voyage.LogEntries.Count(le => le.VoyagePlanLegId == leg.Id);

                return new LegPerformance
                {
                    Sequence = leg.Sequence,
                    LegType = leg.LegType ?? "PASSAGE",
                    FromPort = leg.FromPortName ?? leg.FromPortCode,
                    ToPort = leg.ToPortName ?? leg.ToPortCode,
                    PlannedDistance = leg.PlannedDistance,
                    PlannedDuration = leg.PlannedDurationHours,
                    PlannedSpeed = leg.PlannedAverageSpeed,
                    PlannedFuel = leg.PlannedFuelConsumption,
                    EventCount = legLogEntries,
                    PortCallCount = legPortCalls,
                };
            })
            .ToList();

        double? fuelEfficiency = null;
        if (voyage.DistanceTraveled > 0 && voyage.FuelConsumed > 0)
            fuelEfficiency = voyage.DistanceTraveled / voyage.FuelConsumed;

        var costByCategory = voyage.CostEstimates
            .GroupBy(c => c.CostCategory ?? "Other")
            .Select(g =>
            {
                var est = g.Sum(x => x.EstimatedAmount);
                var actualCat = voyage.Disbursements
                    .Where(d => d.CostCategory == g.Key)
                    .Sum(d => d.AmountUsd);
                return new CostCategoryBreakdown
                {
                    Category = g.Key,
                    Estimated = est,
                    Actual = actualCat,
                    Variance = actualCat - est,
                };
            })
            .ToList();

        return new VoyagePerformanceDto
        {
            VoyageId = voyageId,
            VoyageNumber = voyage.VoyageNumber,
            Overview = new PerformanceOverview
            {
                Distance = distDim,
                Duration = durDim,
                Speed = spdDim,
                Fuel = fuelDim,
                OverallScore = Math.Round(overallScore, 1),
                Rating = rating,
            },
            LegPerformances = legPerformances,
            FuelAnalysis = new FuelAnalysis
            {
                PlannedTotal = voyage.PlannedFuelConsumption,
                ActualTotal = voyage.FuelConsumed,
                Variance = (voyage.FuelConsumed ?? 0) - (voyage.PlannedFuelConsumption ?? 0),
                VariancePercent = voyage.PlannedFuelConsumption > 0
                    ? Math.Round(((voyage.FuelConsumed ?? 0) - voyage.PlannedFuelConsumption.Value) / voyage.PlannedFuelConsumption.Value * 100, 1)
                    : null,
                EfficiencyNmPerMt = fuelEfficiency.HasValue ? Math.Round(fuelEfficiency.Value, 2) : null,
            },
            FinancialPerformance = new FinancialPerformance
            {
                EstimatedCost = voyage.TotalEstimatedCost,
                ActualCost = voyage.TotalActualCost,
                CostVariance = (voyage.TotalActualCost ?? 0) - (voyage.TotalEstimatedCost ?? 0),
                EstimatedRevenue = voyage.TotalEstimatedRevenue,
                ActualRevenue = voyage.TotalActualRevenue,
                RevenueVariance = (voyage.TotalActualRevenue ?? 0) - (voyage.TotalEstimatedRevenue ?? 0),
                EstimatedMargin = voyage.EstimatedProfitMargin,
                ActualMargin = voyage.ActualProfitMargin,
                MarginVariance = (voyage.ActualProfitMargin ?? 0) - (voyage.EstimatedProfitMargin ?? 0),
                CostBreakdown = costByCategory,
            },
        };
    }

    public async Task<VoyageReviewDto?> GetVoyageReviewAsync(Guid voyageId)
    {
        var review = await _context.Set<VoyageReview>()
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.VoyageId == voyageId);

        if (review == null) return null;

        return MapReview(review);
    }

    public async Task<VoyageReviewDto> UpsertVoyageReviewAsync(Guid voyageId, CreateVoyageReviewRequest request)
    {
        var voyageExists = await _context.VoyageRecords.AnyAsync(v => v.Id == voyageId);
        if (!voyageExists)
            throw new KeyNotFoundException($"Voyage {voyageId} not found");

        var existing = await _context.Set<VoyageReview>()
            .AsTracking()
            .FirstOrDefaultAsync(r => r.VoyageId == voyageId);

        if (existing != null)
        {
            existing.ReviewStatus = request.ReviewStatus;
            existing.ReviewedBy = request.ReviewedBy;
            existing.ReviewedAt = DateTime.UtcNow;
            existing.Notes = request.Notes;
            existing.Tags = request.Tags.Count > 0 ? string.Join(",", request.Tags) : null;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            existing = new VoyageReview
            {
                VoyageId = voyageId,
                ReviewStatus = request.ReviewStatus,
                ReviewedBy = request.ReviewedBy,
                ReviewedAt = DateTime.UtcNow,
                Notes = request.Notes,
                Tags = request.Tags.Count > 0 ? string.Join(",", request.Tags) : null,
            };
            _context.Set<VoyageReview>().Add(existing);
        }

        await _context.SaveChangesAsync();
        _logger.LogInformation("Voyage review upserted for {VoyageId}, status={Status}", voyageId, existing.ReviewStatus);
        return MapReview(existing);
    }

    private static PerformanceDimension BuildDimension(string label, string unit, double? planned, double? actual)
    {
        double? variance = null;
        double? variancePct = null;
        var rating = "N/A";

        if (planned.HasValue && actual.HasValue)
        {
            variance = actual.Value - planned.Value;
            variancePct = planned.Value != 0
                ? Math.Round(variance.Value / planned.Value * 100, 1)
                : null;

            var absPct = Math.Abs(variancePct ?? 0);
            rating = absPct <= 5 ? "ON_TARGET" : variance < 0 ? "BETTER" : "WORSE";

            // For fuel and cost, less is better (negative variance = BETTER)
            if (label is "Fuel" or "Duration" && variance < 0)
                rating = "BETTER";
            else if (label is "Fuel" or "Duration" && variance > 0 && absPct > 5)
                rating = "WORSE";
        }

        return new PerformanceDimension
        {
            Label = label,
            Unit = unit,
            Planned = planned.HasValue ? Math.Round(planned.Value, 1) : null,
            Actual = actual.HasValue ? Math.Round(actual.Value, 1) : null,
            Variance = variance.HasValue ? Math.Round(variance.Value, 1) : null,
            VariancePercent = variancePct,
            Rating = rating,
        };
    }

    private static VoyageReviewDto MapReview(VoyageReview review) => new()
    {
        Id = review.Id,
        VoyageId = review.VoyageId,
        ReviewStatus = review.ReviewStatus,
        ReviewedBy = review.ReviewedBy,
        ReviewedAt = review.ReviewedAt,
        Notes = review.Notes,
        Tags = review.Tags?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new(),
        CreatedAt = review.CreatedAt,
        UpdatedAt = review.UpdatedAt,
    };

    // ============================================================
    // VOYAGE CRUD
    // ============================================================

    public async Task<Guid> CreateVoyageAsync(CreateVoyageRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.VoyageNumber))
            throw new ArgumentException("VoyageNumber is required");

        var voyage = new VoyageRecord
        {
            VoyageNumber = request.VoyageNumber.Trim(),
            VesselIMO = request.VesselIMO?.Trim(),
            VesselName = request.VesselName?.Trim(),
            VesselFlag = request.VesselFlag?.Trim(),
            CallSign = request.CallSign?.Trim(),
            CharterType = request.CharterType?.Trim(),
            DeparturePort = request.DeparturePort?.Trim(),
            DeparturePortCode = request.DeparturePortCode?.Trim(),
            DepartureTime = request.DepartureTime,
            ArrivalPort = request.ArrivalPort?.Trim(),
            ArrivalPortCode = request.ArrivalPortCode?.Trim(),
            ArrivalTime = request.ArrivalTime,
            PreviousPortCode = request.PreviousPortCode?.Trim(),
            PreviousPortName = request.PreviousPortName?.Trim(),
            CargoType = request.CargoType?.Trim(),
            CargoWeight = request.CargoWeight,
            PlannedDistance = request.PlannedDistance,
            PlannedDurationHours = request.PlannedDurationHours,
            PlannedAverageSpeed = request.PlannedAverageSpeed,
            PlannedFuelConsumption = request.PlannedFuelConsumption,
            VoyageInstructions = request.VoyageInstructions,
            VoyageStatus = request.VoyageStatus ?? "PLANNING",
            OriginNode = "SHORE",
            IsSynced = false,
            SyncVersion = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        };

        // Plan Legs
        foreach (var leg in request.PlanLegs)
        {
            voyage.PlanLegs.Add(new VoyagePlanLeg
            {
                VoyageId = voyage.Id,
                Sequence = leg.Sequence,
                LegType = leg.LegType,
                FromPortCode = leg.FromPortCode,
                FromPortName = leg.FromPortName,
                ToPortCode = leg.ToPortCode,
                ToPortName = leg.ToPortName,
                PlannedDepartureTime = leg.PlannedDepartureTime,
                PlannedArrivalTime = leg.PlannedArrivalTime,
                PlannedDistance = leg.PlannedDistance,
                PlannedDurationHours = leg.PlannedDurationHours,
                PlannedAverageSpeed = leg.PlannedAverageSpeed,
                CargoActivity = leg.CargoActivity,
                CrewChangePlanned = leg.CrewChangePlanned,
                BunkerSupplyPlanned = leg.BunkerSupplyPlanned,
                PlannedFuelConsumption = leg.PlannedFuelConsumption,
                WeatherRoutingNotes = leg.WeatherRoutingNotes,
                Notes = leg.Notes,
                OriginNode = "SHORE",
            });
        }

        // Port Calls
        foreach (var pc in request.PortCalls)
        {
            voyage.PortCalls.Add(new PortCall
            {
                VoyageId = voyage.Id,
                Sequence = pc.Sequence,
                CallType = pc.CallType,
                PortCode = pc.PortCode,
                PortName = pc.PortName,
                Country = pc.Country,
                ArrivalTime = pc.ArrivalTime,
                DepartureTime = pc.DepartureTime,
                BerthNumber = pc.BerthNumber,
                Remarks = pc.Remarks,
                OriginNode = "SHORE",
            });
        }

        // Cargo Plans
        foreach (var cp in request.CargoPlans)
        {
            voyage.CargoPlans.Add(new VoyageCargoPlan
            {
                VoyageId = voyage.Id,
                PlanLegId = cp.PlanLegId,
                Sequence = cp.Sequence,
                OperationType = cp.OperationType,
                CargoType = cp.CargoType,
                CargoDescription = cp.CargoDescription,
                PlannedQuantity = cp.PlannedQuantity,
                Unit = cp.Unit,
                PortCode = cp.PortCode,
                PortName = cp.PortName,
                ShipperName = cp.ShipperName,
                ConsigneeName = cp.ConsigneeName,
                SpecialRequirements = cp.SpecialRequirements,
                Notes = cp.Notes,
                OriginNode = "SHORE",
            });
        }

        // Bunker Plans
        foreach (var bp in request.BunkerPlans)
        {
            voyage.BunkerPlans.Add(new VoyageBunkerPlan
            {
                VoyageId = voyage.Id,
                PlanLegId = bp.PlanLegId,
                Sequence = bp.Sequence,
                FuelType = bp.FuelType,
                PlannedQuantity = bp.PlannedQuantity,
                OperationType = bp.OperationType,
                PortCode = bp.PortCode,
                PortName = bp.PortName,
                EstimatedCostUsd = bp.EstimatedCostUsd,
                SupplierName = bp.SupplierName,
                Notes = bp.Notes,
                OriginNode = "SHORE",
            });
        }

        // Crew Change Plans
        foreach (var ccp in request.CrewChangePlans)
        {
            voyage.CrewChangePlans.Add(new VoyageCrewChangePlan
            {
                VoyageId = voyage.Id,
                PlanLegId = ccp.PlanLegId,
                Sequence = ccp.Sequence,
                CrewMemberId = ccp.CrewMemberId,
                RankId = ccp.RankId,
                ChangeType = ccp.ChangeType,
                PortCode = ccp.PortCode,
                PortName = ccp.PortName,
                PlannedDate = ccp.PlannedDate,
                ReplacementReason = ccp.ReplacementReason,
                Notes = ccp.Notes,
                OriginNode = "SHORE",
            });
        }

        // Cost Estimates
        foreach (var ce in request.CostEstimates)
        {
            voyage.CostEstimates.Add(new VoyageCostEstimate
            {
                VoyageId = voyage.Id,
                Sequence = ce.Sequence,
                CostCategory = ce.CostCategory,
                Description = ce.Description,
                EstimatedAmount = ce.EstimatedAmount,
                Currency = ce.Currency,
                Notes = ce.Notes,
                OriginNode = "SHORE",
            });
        }

        // Revenue Estimates
        foreach (var re in request.RevenueEstimates)
        {
            voyage.RevenueEstimates.Add(new VoyageRevenueEstimate
            {
                VoyageId = voyage.Id,
                Sequence = re.Sequence,
                RevenueCategory = re.RevenueCategory,
                Description = re.Description,
                EstimatedAmount = re.EstimatedAmount,
                Currency = re.Currency,
                Notes = re.Notes,
                OriginNode = "SHORE",
            });
        }

        // Expense Requests
        foreach (var er in request.ExpenseRequests)
        {
            voyage.ExpenseRequests.Add(new VoyageExpenseRequest
            {
                VoyageId = voyage.Id,
                RequestNumber = er.RequestNumber ?? $"EXP-{voyage.ExpenseRequests.Count + 1:D4}",
                CostCategory = er.CostCategory,
                AllocationScope = er.AllocationScope,
                Description = er.Description,
                RequestedAmount = er.RequestedAmount,
                Currency = er.Currency,
                ExchangeRate = er.ExchangeRate,
                RequestedAmountUsd = er.RequestedAmount * er.ExchangeRate,
                VendorName = er.VendorName,
                VendorReference = er.VendorReference,
                PortCode = er.PortCode,
                PortName = er.PortName,
                Status = er.Status,
                RequestedBy = er.RequestedBy,
                RequestedAt = er.RequestedAt,
                ApprovedBy = er.ApprovedBy,
                ApprovedAt = er.ApprovedAt,
                ApprovedAmount = er.ApprovedAmount,
                ApprovedAmountUsd = er.ApprovedAmount.HasValue ? er.ApprovedAmount.Value * er.ExchangeRate : null,
                ApprovalNotes = er.ApprovalNotes,
                Notes = er.Notes,
                SupportingDocuments = er.SupportingDocuments,
                OriginNode = "SHORE",
            });
        }

        // Advance Payments
        foreach (var ap in request.AdvancePayments)
        {
            voyage.AdvancePayments.Add(new VoyageAdvancePayment
            {
                VoyageId = voyage.Id,
                AdvanceNumber = ap.AdvanceNumber ?? $"ADV-{voyage.AdvancePayments.Count + 1:D4}",
                AdvanceType = ap.AdvanceType,
                Description = ap.Description,
                Amount = ap.Amount,
                Currency = ap.Currency,
                ExchangeRate = ap.ExchangeRate,
                AmountUsd = ap.Amount * ap.ExchangeRate,
                RecipientName = ap.RecipientName,
                PortCode = ap.PortCode,
                PortName = ap.PortName,
                Status = ap.Status,
                PaidAt = ap.PaidAt,
                PaidBy = ap.PaidBy,
                PaymentReference = ap.PaymentReference,
                SettledAmount = ap.SettledAmount,
                UnsettledBalance = (ap.Amount * ap.ExchangeRate) - ap.SettledAmount,
                Notes = ap.Notes,
                OriginNode = "SHORE",
            });
        }

        // Disbursements
        foreach (var d in request.Disbursements)
        {
            voyage.Disbursements.Add(new VoyageDisbursement
            {
                VoyageId = voyage.Id,
                ExpenseRequestId = d.ExpenseRequestId,
                AdvancePaymentId = d.AdvancePaymentId,
                DisbursementNumber = d.DisbursementNumber ?? $"DIS-{voyage.Disbursements.Count + 1:D4}",
                CostCategory = d.CostCategory,
                AllocationScope = d.AllocationScope,
                Description = d.Description,
                Amount = d.Amount,
                Currency = d.Currency,
                ExchangeRate = d.ExchangeRate,
                AmountUsd = d.Amount * d.ExchangeRate,
                VendorName = d.VendorName,
                InvoiceNumber = d.InvoiceNumber,
                InvoiceDate = d.InvoiceDate,
                DueDate = d.DueDate,
                PortCode = d.PortCode,
                PortName = d.PortName,
                Status = d.Status,
                VerifiedBy = d.VerifiedBy,
                VerifiedAt = d.VerifiedAt,
                PaidAt = d.PaidAt,
                PaymentReference = d.PaymentReference,
                Notes = d.Notes,
                SupportingDocuments = d.SupportingDocuments,
                OriginNode = "SHORE",
            });
        }

        // Actual Revenues
        foreach (var ar in request.ActualRevenues)
        {
            voyage.ActualRevenues.Add(new VoyageActualRevenue
            {
                VoyageId = voyage.Id,
                RevenueNumber = ar.RevenueNumber ?? $"REV-{voyage.ActualRevenues.Count + 1:D4}",
                RevenueCategory = ar.RevenueCategory,
                Description = ar.Description,
                Amount = ar.Amount,
                Currency = ar.Currency,
                ExchangeRate = ar.ExchangeRate,
                AmountUsd = ar.Amount * ar.ExchangeRate,
                PayerName = ar.PayerName,
                InvoiceNumber = ar.InvoiceNumber,
                InvoiceDate = ar.InvoiceDate,
                Status = ar.Status,
                ReceivedAt = ar.ReceivedAt,
                PaymentReference = ar.PaymentReference,
                Notes = ar.Notes,
                OriginNode = "SHORE",
            });
        }

        // Settlements
        foreach (var s in request.Settlements)
        {
            voyage.Settlements.Add(new VoyageSettlement
            {
                VoyageId = voyage.Id,
                SettlementNumber = s.SettlementNumber ?? $"STL-{voyage.Settlements.Count + 1:D4}",
                Status = s.Status,
                TotalExpenseApproved = s.TotalExpenseApproved,
                TotalAdvanced = s.TotalAdvanced,
                TotalDisbursed = s.TotalDisbursed,
                TotalRevenue = s.TotalRevenue,
                NetResult = s.NetResult,
                AdvanceBalance = s.AdvanceBalance,
                FinalSettlementAmount = s.FinalSettlementAmount,
                Summary = s.Summary,
                PreparedBy = s.PreparedBy,
                PreparedAt = s.PreparedAt,
                ReviewedBy = s.ReviewedBy,
                ReviewedAt = s.ReviewedAt,
                ApprovedBy = s.ApprovedBy,
                ApprovedAt = s.ApprovedAt,
                ApprovalNotes = s.ApprovalNotes,
                Notes = s.Notes,
                OriginNode = "SHORE",
            });
        }

        // Recalculate financial totals
        RecalculateFinancials(voyage);

        // Status history
        voyage.StatusHistory.Add(new VoyageStatusHistory
        {
            VoyageId = voyage.Id,
            FromStatus = null,
            ToStatus = voyage.VoyageStatus,
            ChangedBy = "SHORE_USER",
            Notes = "Voyage created from shore",
            OriginNode = "SHORE",
        });

        _context.VoyageRecords.Add(voyage);
        await _context.SaveChangesAsync();

        // Scoped events are captured atomically by SaveChanges.

        _logger.LogInformation("Created voyage {VoyageNumber} ({VoyageId}) from shore", voyage.VoyageNumber, voyage.Id);
        return voyage.Id;
    }

    public async Task UpdateVoyageAsync(Guid voyageId, UpdateVoyageRequest request)
    {
        var voyage = await _context.VoyageRecords
            .AsTracking()
            .Include(v => v.PlanLegs)
            .Include(v => v.PortCalls)
            .Include(v => v.CargoPlans)
            .Include(v => v.BunkerPlans)
            .Include(v => v.CrewChangePlans)
            .Include(v => v.CostEstimates)
            .Include(v => v.RevenueEstimates)
            .Include(v => v.ExpenseRequests)
            .Include(v => v.AdvancePayments)
            .Include(v => v.Disbursements)
            .Include(v => v.ActualRevenues)
            .Include(v => v.Settlements)
            .FirstOrDefaultAsync(v => v.Id == voyageId)
            ?? throw new KeyNotFoundException($"Voyage {voyageId} not found");

        var oldStatus = voyage.VoyageStatus;
        VoyageStatusHistory? createdStatusHistory = null;

        // Update fields
        if (request.VoyageNumber != null) voyage.VoyageNumber = request.VoyageNumber.Trim();
        if (request.VesselIMO != null) voyage.VesselIMO = request.VesselIMO.Trim();
        if (request.VesselName != null) voyage.VesselName = request.VesselName.Trim();
        if (request.VesselFlag != null) voyage.VesselFlag = request.VesselFlag.Trim();
        if (request.CallSign != null) voyage.CallSign = request.CallSign.Trim();
        if (request.CharterType != null) voyage.CharterType = request.CharterType.Trim();
        if (request.DeparturePort != null) voyage.DeparturePort = request.DeparturePort.Trim();
        if (request.DeparturePortCode != null) voyage.DeparturePortCode = request.DeparturePortCode.Trim();
        if (request.DepartureTime != null) voyage.DepartureTime = request.DepartureTime;
        if (request.ArrivalPort != null) voyage.ArrivalPort = request.ArrivalPort.Trim();
        if (request.ArrivalPortCode != null) voyage.ArrivalPortCode = request.ArrivalPortCode.Trim();
        if (request.ArrivalTime != null) voyage.ArrivalTime = request.ArrivalTime;
        if (request.PreviousPortCode != null) voyage.PreviousPortCode = request.PreviousPortCode.Trim();
        if (request.PreviousPortName != null) voyage.PreviousPortName = request.PreviousPortName.Trim();
        if (request.CargoType != null) voyage.CargoType = request.CargoType.Trim();
        if (request.CargoWeight != null) voyage.CargoWeight = request.CargoWeight;
        if (request.PlannedDistance != null) voyage.PlannedDistance = request.PlannedDistance;
        if (request.PlannedDurationHours != null) voyage.PlannedDurationHours = request.PlannedDurationHours;
        if (request.PlannedAverageSpeed != null) voyage.PlannedAverageSpeed = request.PlannedAverageSpeed;
        if (request.PlannedFuelConsumption != null) voyage.PlannedFuelConsumption = request.PlannedFuelConsumption;
        if (request.VoyageInstructions != null) voyage.VoyageInstructions = request.VoyageInstructions;
        if (request.FinancialStatus != null) voyage.FinancialStatus = request.FinancialStatus;

        // Status transition
        if (request.VoyageStatus != null && request.VoyageStatus != oldStatus)
        {
            voyage.VoyageStatus = request.VoyageStatus;
            SetStatusTimestamp(voyage, request.VoyageStatus);

            createdStatusHistory = new VoyageStatusHistory
            {
                VoyageId = voyage.Id,
                FromStatus = oldStatus,
                ToStatus = request.VoyageStatus,
                ChangedBy = "SHORE_USER",
                Notes = "Status updated from shore",
                OriginNode = "SHORE",
            };
            _context.Set<VoyageStatusHistory>().Add(createdStatusHistory);
        }

        // Replace plan legs if provided
        if (request.PlanLegs != null)
        {
            _context.Set<VoyagePlanLeg>().RemoveRange(voyage.PlanLegs);
            voyage.PlanLegs.Clear();
            foreach (var leg in request.PlanLegs)
            {
                var newLeg = new VoyagePlanLeg
                {
                    VoyageId = voyage.Id,
                    Sequence = leg.Sequence,
                    LegType = leg.LegType,
                    FromPortCode = leg.FromPortCode,
                    FromPortName = leg.FromPortName,
                    ToPortCode = leg.ToPortCode,
                    ToPortName = leg.ToPortName,
                    PlannedDepartureTime = leg.PlannedDepartureTime,
                    PlannedArrivalTime = leg.PlannedArrivalTime,
                    PlannedDistance = leg.PlannedDistance,
                    PlannedDurationHours = leg.PlannedDurationHours,
                    PlannedAverageSpeed = leg.PlannedAverageSpeed,
                    CargoActivity = leg.CargoActivity,
                    CrewChangePlanned = leg.CrewChangePlanned,
                    BunkerSupplyPlanned = leg.BunkerSupplyPlanned,
                    PlannedFuelConsumption = leg.PlannedFuelConsumption,
                    WeatherRoutingNotes = leg.WeatherRoutingNotes,
                    Notes = leg.Notes,
                    OriginNode = "SHORE",
                };
                voyage.PlanLegs.Add(newLeg);
            }
        }

        // Replace port calls if provided
        if (request.PortCalls != null)
        {
            _context.Set<PortCall>().RemoveRange(voyage.PortCalls);
            voyage.PortCalls.Clear();
            foreach (var pc in request.PortCalls)
            {
                voyage.PortCalls.Add(new PortCall
                {
                    VoyageId = voyage.Id,
                    Sequence = pc.Sequence,
                    CallType = pc.CallType,
                    PortCode = pc.PortCode,
                    PortName = pc.PortName,
                    Country = pc.Country,
                    ArrivalTime = pc.ArrivalTime,
                    DepartureTime = pc.DepartureTime,
                    BerthNumber = pc.BerthNumber,
                    Remarks = pc.Remarks,
                    OriginNode = "SHORE",
                });
            }
        }

        // Replace cargo plans if provided
        if (request.CargoPlans != null)
        {
            _context.Set<VoyageCargoPlan>().RemoveRange(voyage.CargoPlans);
            voyage.CargoPlans.Clear();
            foreach (var cp in request.CargoPlans)
            {
                voyage.CargoPlans.Add(new VoyageCargoPlan
                {
                    VoyageId = voyage.Id,
                    PlanLegId = cp.PlanLegId,
                    Sequence = cp.Sequence,
                    OperationType = cp.OperationType,
                    CargoType = cp.CargoType,
                    CargoDescription = cp.CargoDescription,
                    PlannedQuantity = cp.PlannedQuantity,
                    Unit = cp.Unit,
                    PortCode = cp.PortCode,
                    PortName = cp.PortName,
                    ShipperName = cp.ShipperName,
                    ConsigneeName = cp.ConsigneeName,
                    SpecialRequirements = cp.SpecialRequirements,
                    Notes = cp.Notes,
                    OriginNode = "SHORE",
                });
            }
        }

        // Replace bunker plans if provided
        if (request.BunkerPlans != null)
        {
            _context.Set<VoyageBunkerPlan>().RemoveRange(voyage.BunkerPlans);
            voyage.BunkerPlans.Clear();
            foreach (var bp in request.BunkerPlans)
            {
                voyage.BunkerPlans.Add(new VoyageBunkerPlan
                {
                    VoyageId = voyage.Id,
                    PlanLegId = bp.PlanLegId,
                    Sequence = bp.Sequence,
                    FuelType = bp.FuelType,
                    PlannedQuantity = bp.PlannedQuantity,
                    OperationType = bp.OperationType,
                    PortCode = bp.PortCode,
                    PortName = bp.PortName,
                    EstimatedCostUsd = bp.EstimatedCostUsd,
                    SupplierName = bp.SupplierName,
                    Notes = bp.Notes,
                    OriginNode = "SHORE",
                });
            }
        }

        // Replace crew change plans if provided
        if (request.CrewChangePlans != null)
        {
            _context.Set<VoyageCrewChangePlan>().RemoveRange(voyage.CrewChangePlans);
            voyage.CrewChangePlans.Clear();
            foreach (var ccp in request.CrewChangePlans)
            {
                voyage.CrewChangePlans.Add(new VoyageCrewChangePlan
                {
                    VoyageId = voyage.Id,
                    PlanLegId = ccp.PlanLegId,
                    Sequence = ccp.Sequence,
                    CrewMemberId = ccp.CrewMemberId,
                    RankId = ccp.RankId,
                    ChangeType = ccp.ChangeType,
                    PortCode = ccp.PortCode,
                    PortName = ccp.PortName,
                    PlannedDate = ccp.PlannedDate,
                    ReplacementReason = ccp.ReplacementReason,
                    Notes = ccp.Notes,
                    OriginNode = "SHORE",
                });
            }
        }

        // Replace cost estimates if provided
        if (request.CostEstimates != null)
        {
            _context.Set<VoyageCostEstimate>().RemoveRange(voyage.CostEstimates);
            voyage.CostEstimates.Clear();
            foreach (var ce in request.CostEstimates)
            {
                voyage.CostEstimates.Add(new VoyageCostEstimate
                {
                    VoyageId = voyage.Id,
                    Sequence = ce.Sequence,
                    CostCategory = ce.CostCategory,
                    Description = ce.Description,
                    EstimatedAmount = ce.EstimatedAmount,
                    Currency = ce.Currency,
                    Notes = ce.Notes,
                    OriginNode = "SHORE",
                });
            }
        }

        // Replace revenue estimates if provided
        if (request.RevenueEstimates != null)
        {
            _context.Set<VoyageRevenueEstimate>().RemoveRange(voyage.RevenueEstimates);
            voyage.RevenueEstimates.Clear();
            foreach (var re in request.RevenueEstimates)
            {
                voyage.RevenueEstimates.Add(new VoyageRevenueEstimate
                {
                    VoyageId = voyage.Id,
                    Sequence = re.Sequence,
                    RevenueCategory = re.RevenueCategory,
                    Description = re.Description,
                    EstimatedAmount = re.EstimatedAmount,
                    Currency = re.Currency,
                    Notes = re.Notes,
                    OriginNode = "SHORE",
                });
            }
        }

        // Replace expense requests if provided
        if (request.ExpenseRequests != null)
        {
            _context.Set<VoyageExpenseRequest>().RemoveRange(voyage.ExpenseRequests);
            voyage.ExpenseRequests.Clear();
            foreach (var er in request.ExpenseRequests)
            {
                voyage.ExpenseRequests.Add(new VoyageExpenseRequest
                {
                    VoyageId = voyage.Id,
                    RequestNumber = er.RequestNumber ?? $"EXP-{voyage.ExpenseRequests.Count + 1:D4}",
                    CostCategory = er.CostCategory,
                    AllocationScope = er.AllocationScope,
                    Description = er.Description,
                    RequestedAmount = er.RequestedAmount,
                    Currency = er.Currency,
                    ExchangeRate = er.ExchangeRate,
                    RequestedAmountUsd = er.RequestedAmount * er.ExchangeRate,
                    VendorName = er.VendorName,
                    VendorReference = er.VendorReference,
                    PortCode = er.PortCode,
                    PortName = er.PortName,
                    Status = er.Status,
                    RequestedBy = er.RequestedBy,
                    RequestedAt = er.RequestedAt,
                    ApprovedBy = er.ApprovedBy,
                    ApprovedAt = er.ApprovedAt,
                    ApprovedAmount = er.ApprovedAmount,
                    ApprovedAmountUsd = er.ApprovedAmount.HasValue ? er.ApprovedAmount.Value * er.ExchangeRate : null,
                    ApprovalNotes = er.ApprovalNotes,
                    Notes = er.Notes,
                    SupportingDocuments = er.SupportingDocuments,
                    OriginNode = "SHORE",
                });
            }
        }

        // Replace advance payments if provided
        if (request.AdvancePayments != null)
        {
            _context.Set<VoyageAdvancePayment>().RemoveRange(voyage.AdvancePayments);
            voyage.AdvancePayments.Clear();
            foreach (var ap in request.AdvancePayments)
            {
                voyage.AdvancePayments.Add(new VoyageAdvancePayment
                {
                    VoyageId = voyage.Id,
                    AdvanceNumber = ap.AdvanceNumber ?? $"ADV-{voyage.AdvancePayments.Count + 1:D4}",
                    AdvanceType = ap.AdvanceType,
                    Description = ap.Description,
                    Amount = ap.Amount,
                    Currency = ap.Currency,
                    ExchangeRate = ap.ExchangeRate,
                    AmountUsd = ap.Amount * ap.ExchangeRate,
                    RecipientName = ap.RecipientName,
                    PortCode = ap.PortCode,
                    PortName = ap.PortName,
                    Status = ap.Status,
                    PaidAt = ap.PaidAt,
                    PaidBy = ap.PaidBy,
                    PaymentReference = ap.PaymentReference,
                    SettledAmount = ap.SettledAmount,
                    UnsettledBalance = (ap.Amount * ap.ExchangeRate) - ap.SettledAmount,
                    Notes = ap.Notes,
                    OriginNode = "SHORE",
                });
            }
        }

        // Replace disbursements if provided
        if (request.Disbursements != null)
        {
            _context.Set<VoyageDisbursement>().RemoveRange(voyage.Disbursements);
            voyage.Disbursements.Clear();
            foreach (var d in request.Disbursements)
            {
                voyage.Disbursements.Add(new VoyageDisbursement
                {
                    VoyageId = voyage.Id,
                    ExpenseRequestId = d.ExpenseRequestId,
                    AdvancePaymentId = d.AdvancePaymentId,
                    DisbursementNumber = d.DisbursementNumber ?? $"DIS-{voyage.Disbursements.Count + 1:D4}",
                    CostCategory = d.CostCategory,
                    AllocationScope = d.AllocationScope,
                    Description = d.Description,
                    Amount = d.Amount,
                    Currency = d.Currency,
                    ExchangeRate = d.ExchangeRate,
                    AmountUsd = d.Amount * d.ExchangeRate,
                    VendorName = d.VendorName,
                    InvoiceNumber = d.InvoiceNumber,
                    InvoiceDate = d.InvoiceDate,
                    DueDate = d.DueDate,
                    PortCode = d.PortCode,
                    PortName = d.PortName,
                    Status = d.Status,
                    VerifiedBy = d.VerifiedBy,
                    VerifiedAt = d.VerifiedAt,
                    PaidAt = d.PaidAt,
                    PaymentReference = d.PaymentReference,
                    Notes = d.Notes,
                    SupportingDocuments = d.SupportingDocuments,
                    OriginNode = "SHORE",
                });
            }
        }

        // Replace actual revenues if provided
        if (request.ActualRevenues != null)
        {
            _context.Set<VoyageActualRevenue>().RemoveRange(voyage.ActualRevenues);
            voyage.ActualRevenues.Clear();
            foreach (var ar in request.ActualRevenues)
            {
                voyage.ActualRevenues.Add(new VoyageActualRevenue
                {
                    VoyageId = voyage.Id,
                    RevenueNumber = ar.RevenueNumber ?? $"REV-{voyage.ActualRevenues.Count + 1:D4}",
                    RevenueCategory = ar.RevenueCategory,
                    Description = ar.Description,
                    Amount = ar.Amount,
                    Currency = ar.Currency,
                    ExchangeRate = ar.ExchangeRate,
                    AmountUsd = ar.Amount * ar.ExchangeRate,
                    PayerName = ar.PayerName,
                    InvoiceNumber = ar.InvoiceNumber,
                    InvoiceDate = ar.InvoiceDate,
                    Status = ar.Status,
                    ReceivedAt = ar.ReceivedAt,
                    PaymentReference = ar.PaymentReference,
                    Notes = ar.Notes,
                    OriginNode = "SHORE",
                });
            }
        }

        // Replace settlements if provided
        if (request.Settlements != null)
        {
            _context.Set<VoyageSettlement>().RemoveRange(voyage.Settlements);
            voyage.Settlements.Clear();
            foreach (var s in request.Settlements)
            {
                voyage.Settlements.Add(new VoyageSettlement
                {
                    VoyageId = voyage.Id,
                    SettlementNumber = s.SettlementNumber ?? $"STL-{voyage.Settlements.Count + 1:D4}",
                    Status = s.Status,
                    TotalExpenseApproved = s.TotalExpenseApproved,
                    TotalAdvanced = s.TotalAdvanced,
                    TotalDisbursed = s.TotalDisbursed,
                    TotalRevenue = s.TotalRevenue,
                    NetResult = s.NetResult,
                    AdvanceBalance = s.AdvanceBalance,
                    FinalSettlementAmount = s.FinalSettlementAmount,
                    Summary = s.Summary,
                    PreparedBy = s.PreparedBy,
                    PreparedAt = s.PreparedAt,
                    ReviewedBy = s.ReviewedBy,
                    ReviewedAt = s.ReviewedAt,
                    ApprovedBy = s.ApprovedBy,
                    ApprovedAt = s.ApprovedAt,
                    ApprovalNotes = s.ApprovalNotes,
                    Notes = s.Notes,
                    OriginNode = "SHORE",
                });
            }
        }

        RecalculateFinancials(voyage);
        voyage.UpdatedAt = DateTime.UtcNow;
        voyage.SyncVersion = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // Replacement children already have application-generated GUIDs. Explicitly mark them
        // Added so EF does not infer Modified and attempt to UPDATE rows that do not exist.
        if (request.PlanLegs != null) _context.Set<VoyagePlanLeg>().AddRange(voyage.PlanLegs);
        if (request.PortCalls != null) _context.Set<PortCall>().AddRange(voyage.PortCalls);
        if (request.CargoPlans != null) _context.Set<VoyageCargoPlan>().AddRange(voyage.CargoPlans);
        if (request.BunkerPlans != null) _context.Set<VoyageBunkerPlan>().AddRange(voyage.BunkerPlans);
        if (request.CrewChangePlans != null) _context.Set<VoyageCrewChangePlan>().AddRange(voyage.CrewChangePlans);
        if (request.CostEstimates != null) _context.Set<VoyageCostEstimate>().AddRange(voyage.CostEstimates);
        if (request.RevenueEstimates != null) _context.Set<VoyageRevenueEstimate>().AddRange(voyage.RevenueEstimates);
        if (request.ExpenseRequests != null) _context.Set<VoyageExpenseRequest>().AddRange(voyage.ExpenseRequests);
        if (request.AdvancePayments != null) _context.Set<VoyageAdvancePayment>().AddRange(voyage.AdvancePayments);
        if (request.Disbursements != null) _context.Set<VoyageDisbursement>().AddRange(voyage.Disbursements);
        if (request.ActualRevenues != null) _context.Set<VoyageActualRevenue>().AddRange(voyage.ActualRevenues);
        if (request.Settlements != null) _context.Set<VoyageSettlement>().AddRange(voyage.Settlements);

        await _context.SaveChangesAsync();

        // Scoped events are captured atomically by SaveChanges.

        _logger.LogInformation("Updated voyage {VoyageNumber} ({VoyageId}) from shore", voyage.VoyageNumber, voyage.Id);
    }

    public async Task DeleteVoyageAsync(Guid voyageId)
    {
        var voyage = await _context.VoyageRecords
            .AsTracking()
            .Include(v => v.PlanLegs)
            .Include(v => v.PortCalls)
            .Include(v => v.StatusHistory)
            .Include(v => v.CrewAssignments)
            .Include(v => v.LogEntries)
            .Include(v => v.CargoOperations)
            .Include(v => v.CargoPlans)
            .Include(v => v.BunkerPlans)
            .Include(v => v.CrewChangePlans)
            .Include(v => v.CostEstimates)
            .Include(v => v.RevenueEstimates)
            .Include(v => v.ExpenseRequests)
            .Include(v => v.AdvancePayments)
            .Include(v => v.Disbursements)
            .Include(v => v.ActualRevenues)
            .Include(v => v.Settlements)
            .FirstOrDefaultAsync(v => v.Id == voyageId)
            ?? throw new KeyNotFoundException($"Voyage {voyageId} not found");


        // Remove all child entities
        _context.Set<VoyagePlanLeg>().RemoveRange(voyage.PlanLegs);
        _context.Set<PortCall>().RemoveRange(voyage.PortCalls);
        _context.Set<VoyageStatusHistory>().RemoveRange(voyage.StatusHistory);
        _context.Set<VoyageCrewAssignment>().RemoveRange(voyage.CrewAssignments);
        _context.Set<VoyageLogEntry>().RemoveRange(voyage.LogEntries);
        _context.Set<CargoOperation>().RemoveRange(voyage.CargoOperations);
        _context.Set<VoyageCargoPlan>().RemoveRange(voyage.CargoPlans);
        _context.Set<VoyageBunkerPlan>().RemoveRange(voyage.BunkerPlans);
        _context.Set<VoyageCrewChangePlan>().RemoveRange(voyage.CrewChangePlans);
        _context.Set<VoyageCostEstimate>().RemoveRange(voyage.CostEstimates);
        _context.Set<VoyageRevenueEstimate>().RemoveRange(voyage.RevenueEstimates);
        _context.Set<VoyageExpenseRequest>().RemoveRange(voyage.ExpenseRequests);
        _context.Set<VoyageAdvancePayment>().RemoveRange(voyage.AdvancePayments);
        _context.Set<VoyageDisbursement>().RemoveRange(voyage.Disbursements);
        _context.Set<VoyageActualRevenue>().RemoveRange(voyage.ActualRevenues);
        _context.Set<VoyageSettlement>().RemoveRange(voyage.Settlements);

        // Remove review if exists
        var review = await _context.Set<VoyageReview>().FirstOrDefaultAsync(r => r.VoyageId == voyageId);
        if (review != null) _context.Set<VoyageReview>().Remove(review);

        _context.VoyageRecords.Remove(voyage);
        await _context.SaveChangesAsync();

        // Scoped events are captured atomically by SaveChanges.

        _logger.LogInformation("Deleted voyage {VoyageNumber} ({VoyageId}) from shore", voyage.VoyageNumber, voyageId);
    }

    private static void RecalculateFinancials(VoyageRecord voyage)
    {
        voyage.TotalEstimatedCost = voyage.CostEstimates.Sum(c => c.EstimatedAmount);
        voyage.TotalEstimatedRevenue = voyage.RevenueEstimates.Sum(r => r.EstimatedAmount);
        voyage.EstimatedProfitMargin = voyage.TotalEstimatedRevenue - voyage.TotalEstimatedCost;

        voyage.TotalActualCost = voyage.Disbursements.Sum(d => d.AmountUsd);
        voyage.TotalActualRevenue = voyage.ActualRevenues.Sum(r => r.AmountUsd);
        voyage.ActualProfitMargin = voyage.TotalActualRevenue - voyage.TotalActualCost;
        voyage.TotalAdvanced = voyage.AdvancePayments
            .Where(a => a.Status is "PAID" or "SETTLED").Sum(a => a.AmountUsd);
        voyage.TotalDisbursed = voyage.Disbursements
            .Where(d => d.Status == "PAID").Sum(d => d.AmountUsd);
        voyage.OutstandingBalance = voyage.TotalAdvanced - voyage.TotalDisbursed;
    }

    private static void SetStatusTimestamp(VoyageRecord voyage, string status)
    {
        var now = DateTime.UtcNow;
        switch (status)
        {
            case "APPROVED": voyage.ApprovedAt = now; break;
            case "READY": voyage.ReadyAt = now; break;
            case "UNDERWAY": voyage.CommencedAt = now; break;
            case "ARRIVED": voyage.ArrivedAt = now; break;
            case "COMPLETED": voyage.CompletedAt = now; break;
            case "CANCELLED": voyage.CancelledAt = now; break;
        }
    }
}
