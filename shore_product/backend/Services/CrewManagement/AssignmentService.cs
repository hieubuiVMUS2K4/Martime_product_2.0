using Microsoft.EntityFrameworkCore;
using Maritime.Shared.DTOs.CrewManagement;
using Maritime.Shared.Models.CrewManagement;
using Maritime.Shared.Models.Sync;
using ProductApi.Data;
using ProductApi.Services.Sync;

namespace ProductApi.Services.CrewManagement;

public class AssignmentService : IAssignmentService
{
    private readonly AppDbContext _db;
    private readonly IComplianceService _complianceService;
    private readonly ITravelService _travelService;
    private readonly ISyncOutboxService _syncOutbox;

    public AssignmentService(AppDbContext db, IComplianceService complianceService, ITravelService travelService, ISyncOutboxService syncOutbox)
    {
        _db = db;
        _complianceService = complianceService;
        _travelService = travelService;
        _syncOutbox = syncOutbox;
    }

    // ================================================================
    // MANNING STANDARDS
    // ================================================================

    public async Task<List<VesselManningStandardDto>> GetManningStandardsAsync(Guid? vesselId = null)
    {
        var query = _db.VesselManningStandards
            .Include(s => s.Positions).ThenInclude(p => p.Rank)
            .AsQueryable();

        if (vesselId.HasValue)
            query = query.Where(s => s.VesselId == vesselId.Value);

        var standards = await query.OrderBy(s => s.Name).ToListAsync();

        return standards.Select(s => MapStandardDto(s)).ToList();
    }

    public async Task<VesselManningStandardDto?> GetManningStandardAsync(Guid id)
    {
        var s = await _db.VesselManningStandards
            .Include(x => x.Positions).ThenInclude(p => p.Rank)
            .FirstOrDefaultAsync(x => x.Id == id);

        return s == null ? null : MapStandardDto(s);
    }

    public async Task<VesselManningStandardDto> CreateManningStandardAsync(CreateManningStandardRequest request, string createdBy)
    {
        var entity = new VesselManningStandard
        {
            Id = Guid.NewGuid(),
            VesselId = request.VesselId,
            Name = request.Name,
            Description = request.Description,
            DocumentReference = request.DocumentReference,
            EffectiveFrom = request.EffectiveFrom,
            EffectiveTo = request.EffectiveTo,
            CreatedBy = createdBy,
        };

        _db.VesselManningStandards.Add(entity);
        await _db.SaveChangesAsync();

        return MapStandardDto(entity);
    }

    public async Task<bool> DeleteManningStandardAsync(Guid id)
    {
        var entity = await _db.VesselManningStandards.FindAsync(id);
        if (entity == null) return false;
        _db.VesselManningStandards.Remove(entity);
        await _db.SaveChangesAsync();
        return true;
    }

    // ================================================================
    // MANNING POSITIONS
    // ================================================================

    public async Task<ManningPositionDto> CreatePositionAsync(CreateManningPositionRequest request)
    {
        var entity = new ManningPosition
        {
            Id = Guid.NewGuid(),
            ManningStandardId = request.ManningStandardId,
            RankId = request.RankId,
            RequiredCount = request.RequiredCount,
            AllowEquivalent = request.AllowEquivalent,
            Notes = request.Notes,
            SortOrder = request.SortOrder,
        };

        _db.ManningPositions.Add(entity);
        await _db.SaveChangesAsync();

        await _db.Entry(entity).Reference(e => e.Rank).LoadAsync();
        return MapPositionDto(entity, 0);
    }

    public async Task<bool> DeletePositionAsync(Guid id)
    {
        var entity = await _db.ManningPositions.FindAsync(id);
        if (entity == null) return false;
        _db.ManningPositions.Remove(entity);
        await _db.SaveChangesAsync();
        return true;
    }

    // ================================================================
    // ASSIGNMENTS
    // ================================================================

    public async Task<List<CrewAssignmentDto>> GetAssignmentsAsync(Guid? vesselId = null, Guid? crewMemberId = null, string? status = null)
    {
        var query = _db.CrewAssignments
            .Include(a => a.CrewMember)
            .Include(a => a.Rank)
            .Include(a => a.Conflicts)
            .Include(a => a.Comments)
            .AsQueryable();

        if (vesselId.HasValue)
            query = query.Where(a => a.VesselId == vesselId.Value);
        if (crewMemberId.HasValue)
            query = query.Where(a => a.CrewMemberId == crewMemberId.Value);
        if (!string.IsNullOrEmpty(status))
            query = query.Where(a => a.Status == status);

        var assignments = await query.OrderByDescending(a => a.CreatedAt).ToListAsync();
        var vesselIds = assignments.Select(a => a.VesselId).Distinct().ToList();
        var vessels = await _db.Vessels.Where(v => vesselIds.Contains(v.Id))
            .ToDictionaryAsync(v => v.Id, v => v.Name);

        return assignments.Select(a => MapAssignmentDto(a, vessels)).ToList();
    }

    public async Task<CrewAssignmentDto?> GetAssignmentAsync(Guid id)
    {
        var a = await _db.CrewAssignments
            .Include(x => x.CrewMember)
            .Include(x => x.Rank)
            .Include(x => x.Conflicts)
            .Include(x => x.Comments)
            .FirstOrDefaultAsync(x => x.Id == id);

        if (a == null) return null;

        var vessel = await _db.Vessels.FindAsync(a.VesselId);
        var vessels = new Dictionary<Guid, string>();
        if (vessel != null) vessels[vessel.Id] = vessel.Name;

        return MapAssignmentDto(a, vessels);
    }

    public async Task<CrewAssignmentDto> CreateAssignmentAsync(CreateAssignmentRequest request, string createdBy)
    {
        var entity = new CrewAssignment
        {
            Id = Guid.NewGuid(),
            CrewMemberId = request.CrewMemberId,
            VesselId = request.VesselId,
            RankId = request.RankId,
            ManningPositionId = request.ManningPositionId,
            PlannedStartDate = request.PlannedStartDate,
            PlannedEndDate = request.PlannedEndDate,
            JoinPortCode = request.JoinPortCode,
            JoinPortName = request.JoinPortName,
            LeavePortCode = request.LeavePortCode,
            LeavePortName = request.LeavePortName,
            IsEquivalentRank = request.IsEquivalentRank,
            OriginalRankId = request.OriginalRankId,
            EquivalentRankJustification = request.EquivalentRankJustification,
            Notes = request.Notes,
            CreatedBy = createdBy,
        };

        // Run compliance check
        try
        {
            var eval = await _complianceService.EvaluateCrewAsync(request.CrewMemberId, request.VesselId, EvaluationStage.PreConfirm);
            entity.ComplianceResult = eval.OverallResult;
            entity.ComplianceEvaluatedAt = DateTime.UtcNow;
        }
        catch
        {
            // Compliance engine may not have rules yet — non-fatal
        }

        _db.CrewAssignments.Add(entity);

        // Initial status history
        _db.AssignmentStatusHistory.Add(new AssignmentStatusHistory
        {
            Id = Guid.NewGuid(),
            AssignmentId = entity.Id,
            FromStatus = "",
            ToStatus = AssignmentStatus.Draft,
            ChangedBy = createdBy,
            Reason = "Assignment created",
        });

        await _db.SaveChangesAsync();

        // Detect conflicts
        await DetectAndSaveConflictsAsync(entity);

        // Sync assignment to Edge
        await _syncOutbox.EnqueueForVesselAsync(entity.VesselId, "crew_assignment", entity.Id.ToString(),
            SyncActionType.CREATE, entity);

        return (await GetAssignmentAsync(entity.Id))!;
    }

    public async Task<CrewAssignmentDto?> UpdateAssignmentAsync(Guid id, UpdateAssignmentRequest request, string updatedBy)
    {
        var entity = await _db.CrewAssignments.FindAsync(id);
        if (entity == null) return null;

        if (request.PlannedStartDate.HasValue) entity.PlannedStartDate = request.PlannedStartDate;
        if (request.PlannedEndDate.HasValue) entity.PlannedEndDate = request.PlannedEndDate;
        if (request.JoinPortCode != null) entity.JoinPortCode = request.JoinPortCode;
        if (request.JoinPortName != null) entity.JoinPortName = request.JoinPortName;
        if (request.LeavePortCode != null) entity.LeavePortCode = request.LeavePortCode;
        if (request.LeavePortName != null) entity.LeavePortName = request.LeavePortName;
        if (request.Notes != null) entity.Notes = request.Notes;
        entity.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        // Re-detect conflicts after date changes
        await DetectAndSaveConflictsAsync(entity);

        return await GetAssignmentAsync(id);
    }

    public async Task<CrewAssignmentDto?> ChangeStatusAsync(Guid id, ChangeAssignmentStatusRequest request, string changedBy)
    {
        var entity = await _db.CrewAssignments.FindAsync(id);
        if (entity == null) return null;

        var oldStatus = entity.Status;
        entity.Status = request.NewStatus;
        entity.StatusChangedAt = DateTime.UtcNow;
        entity.StatusChangedBy = changedBy;
        entity.UpdatedAt = DateTime.UtcNow;

        // Track actual dates
        if (request.NewStatus == AssignmentStatus.OnBoarded && !entity.ActualStartDate.HasValue)
            entity.ActualStartDate = DateTime.UtcNow;
        if (request.NewStatus == AssignmentStatus.Completed && !entity.ActualEndDate.HasValue)
            entity.ActualEndDate = DateTime.UtcNow;

        _db.AssignmentStatusHistory.Add(new AssignmentStatusHistory
        {
            Id = Guid.NewGuid(),
            AssignmentId = id,
            FromStatus = oldStatus,
            ToStatus = request.NewStatus,
            ChangedBy = changedBy,
            Reason = request.Reason,
        });

        await _db.SaveChangesAsync();

        // Sync status change to Edge
        var updated = await _db.CrewAssignments.FindAsync(id);
        if (updated != null)
        {
            await _syncOutbox.EnqueueForVesselAsync(updated.VesselId, "crew_assignment", id.ToString(),
                SyncActionType.UPDATE, updated);
        }

        return await GetAssignmentAsync(id);
    }

    public async Task<bool> DeleteAssignmentAsync(Guid id)
    {
        var entity = await _db.CrewAssignments.FindAsync(id);
        if (entity == null) return false;
        _db.CrewAssignments.Remove(entity);
        await _db.SaveChangesAsync();
        return true;
    }

    // ================================================================
    // CONFLICT DETECTION
    // ================================================================

    public async Task<List<AssignmentConflictDto>> DetectConflictsAsync(Guid assignmentId)
    {
        var assignment = await _db.CrewAssignments
            .Include(a => a.CrewMember)
            .FirstOrDefaultAsync(a => a.Id == assignmentId);

        if (assignment == null) return [];

        await DetectAndSaveConflictsAsync(assignment);

        return await _db.AssignmentConflicts
            .Where(c => c.AssignmentId == assignmentId && !c.IsResolved)
            .Select(c => new AssignmentConflictDto
            {
                Id = c.Id,
                AssignmentId = c.AssignmentId,
                ConflictType = c.ConflictType,
                Severity = c.Severity,
                Description = c.Description,
                RelatedEntityId = c.RelatedEntityId,
                RelatedEntityType = c.RelatedEntityType,
                IsResolved = c.IsResolved,
                DetectedAt = c.DetectedAt,
            }).ToListAsync();
    }

    private async Task DetectAndSaveConflictsAsync(CrewAssignment assignment)
    {
        // Clear old unresolved conflicts
        var oldConflicts = await _db.AssignmentConflicts
            .Where(c => c.AssignmentId == assignment.Id && !c.IsResolved)
            .ToListAsync();
        _db.AssignmentConflicts.RemoveRange(oldConflicts);

        var conflicts = new List<AssignmentConflict>();

        // 1. Date overlap with other active assignments for same crew
        if (assignment.PlannedStartDate.HasValue && assignment.PlannedEndDate.HasValue)
        {
            var overlapping = await _db.CrewAssignments
                .Where(a => a.Id != assignment.Id
                    && a.CrewMemberId == assignment.CrewMemberId
                    && AssignmentStatus.Active.Contains(a.Status)
                    && a.PlannedStartDate < assignment.PlannedEndDate
                    && a.PlannedEndDate > assignment.PlannedStartDate)
                .ToListAsync();

            foreach (var oa in overlapping)
            {
                conflicts.Add(new AssignmentConflict
                {
                    Id = Guid.NewGuid(),
                    AssignmentId = assignment.Id,
                    ConflictType = ConflictType.DateOverlap,
                    Severity = ConflictSeverity.Blocker,
                    Description = $"Date overlap with another assignment ({oa.PlannedStartDate:dd/MM/yyyy} - {oa.PlannedEndDate:dd/MM/yyyy})",
                    RelatedEntityId = oa.Id,
                    RelatedEntityType = "CrewAssignment",
                });
            }
        }

        // 2. Crew unavailable (not Active, pool not Available/Assigned)
        var crew = assignment.CrewMember ?? await _db.CrewMembers.FindAsync(assignment.CrewMemberId);
        if (crew != null)
        {
            if (crew.Status != CrewStatus.Active)
            {
                conflicts.Add(new AssignmentConflict
                {
                    Id = Guid.NewGuid(),
                    AssignmentId = assignment.Id,
                    ConflictType = ConflictType.CrewUnavailable,
                    Severity = ConflictSeverity.Blocker,
                    Description = $"Crew status is '{crew.Status}', expected 'Active'",
                });
            }

            if (crew.PoolStatus != null && crew.PoolStatus != PoolStatus.Available && crew.PoolStatus != PoolStatus.Assigned)
            {
                conflicts.Add(new AssignmentConflict
                {
                    Id = Guid.NewGuid(),
                    AssignmentId = assignment.Id,
                    ConflictType = ConflictType.CrewUnavailable,
                    Severity = ConflictSeverity.Warning,
                    Description = $"Crew pool status is '{crew.PoolStatus}'",
                });
            }

            // 3. Rank mismatch
            if (crew.RankId.HasValue && crew.RankId.Value != assignment.RankId && !assignment.IsEquivalentRank)
            {
                conflicts.Add(new AssignmentConflict
                {
                    Id = Guid.NewGuid(),
                    AssignmentId = assignment.Id,
                    ConflictType = ConflictType.RankMismatch,
                    Severity = ConflictSeverity.Warning,
                    Description = $"Crew rank ({crew.RankId}) does not match assignment rank ({assignment.RankId})",
                });
            }
        }

        // 4. Compliance blocker
        if (assignment.ComplianceResult == EligibilityResult.NotEligible)
        {
            conflicts.Add(new AssignmentConflict
            {
                Id = Guid.NewGuid(),
                AssignmentId = assignment.Id,
                ConflictType = ConflictType.ComplianceBlocker,
                Severity = ConflictSeverity.Blocker,
                Description = "Crew does not meet compliance requirements for this vessel",
            });
        }

        if (conflicts.Count > 0)
        {
            _db.AssignmentConflicts.AddRange(conflicts);
        }

        await _db.SaveChangesAsync();
    }

    // ================================================================
    // CONFIRMATIONS
    // ================================================================

    public async Task<AssignmentConfirmationDto> SendConfirmationAsync(SendConfirmationRequest request, string sentBy)
    {
        var entity = new AssignmentConfirmation
        {
            Id = Guid.NewGuid(),
            AssignmentId = request.AssignmentId,
            Notes = request.Notes,
            SentBy = sentBy,
        };

        _db.AssignmentConfirmations.Add(entity);

        // Update assignment status to PendingCrewConfirmation
        var assignment = await _db.CrewAssignments.FindAsync(request.AssignmentId);
        if (assignment != null && (assignment.Status == AssignmentStatus.Draft || assignment.Status == AssignmentStatus.Proposed))
        {
            var oldStatus = assignment.Status;
            assignment.Status = AssignmentStatus.PendingCrewConfirmation;
            assignment.StatusChangedAt = DateTime.UtcNow;
            assignment.StatusChangedBy = sentBy;
            assignment.UpdatedAt = DateTime.UtcNow;

            _db.AssignmentStatusHistory.Add(new AssignmentStatusHistory
            {
                Id = Guid.NewGuid(),
                AssignmentId = assignment.Id,
                FromStatus = oldStatus,
                ToStatus = AssignmentStatus.PendingCrewConfirmation,
                ChangedBy = sentBy,
                Reason = "Confirmation sent to crew",
            });
        }

        await _db.SaveChangesAsync();

        return MapConfirmationDto(entity);
    }

    public async Task<AssignmentConfirmationDto?> RespondConfirmationAsync(Guid confirmationId, RespondConfirmationRequest request, string respondedBy)
    {
        var entity = await _db.AssignmentConfirmations
            .AsTracking()
            .Include(c => c.Assignment)
            .FirstOrDefaultAsync(c => c.Id == confirmationId);

        if (entity == null) return null;

        entity.Response = request.Response;
        entity.RespondedAt = DateTime.UtcNow;
        entity.RespondedBy = respondedBy;
        entity.DeclineReason = request.DeclineReason;
        entity.Notes = request.Notes ?? entity.Notes;

        // Update assignment status based on response
        if (entity.Assignment != null)
        {
            // Re-check compliance before confirming
            if (request.Response == "Confirmed")
            {
                try
                {
                    var eval = await _complianceService.EvaluateCrewAsync(
                        entity.Assignment.CrewMemberId, entity.Assignment.VesselId, EvaluationStage.PreConfirm);
                    entity.Assignment.ComplianceResult = eval.OverallResult;
                    entity.Assignment.ComplianceEvaluatedAt = DateTime.UtcNow;

                    if (eval.OverallResult == EligibilityResult.NotEligible)
                    {
                        throw new InvalidOperationException(
                            "Cannot confirm: crew does not meet compliance requirements. "
                            + string.Join("; ", eval.Items
                                .Where(i => i.Severity == "Blocker" && i.Result == "NotMet")
                                .Select(i => i.UiMessage ?? i.RuleTitle)));
                    }
                }
                catch (InvalidOperationException)
                {
                    throw; // Re-throw compliance blocker
                }
                catch
                {
                    // Compliance engine may not have rules yet — non-fatal
                }
            }

            var oldStatus = entity.Assignment.Status;
            var newStatus = request.Response == "Confirmed"
                ? AssignmentStatus.Confirmed
                : AssignmentStatus.Declined;

            entity.Assignment.Status = newStatus;
            entity.Assignment.StatusChangedAt = DateTime.UtcNow;
            entity.Assignment.StatusChangedBy = respondedBy;
            entity.Assignment.UpdatedAt = DateTime.UtcNow;

            // Update crew pool status
            if (request.Response == "Confirmed")
            {
                var crew = await _db.CrewMembers.FindAsync(entity.Assignment.CrewMemberId);
                if (crew != null)
                {
                    crew.PoolStatus = PoolStatus.Assigned;
                    crew.UpdatedAt = DateTime.UtcNow;
                }
            }

            _db.AssignmentStatusHistory.Add(new AssignmentStatusHistory
            {
                Id = Guid.NewGuid(),
                AssignmentId = entity.AssignmentId,
                FromStatus = oldStatus,
                ToStatus = newStatus,
                ChangedBy = respondedBy,
                Reason = request.Response == "Confirmed"
                    ? "Crew confirmed assignment"
                    : $"Crew declined: {request.DeclineReason}",
            });
        }

        await _db.SaveChangesAsync();

        // Auto-generate travel request when assignment is confirmed
        if (request.Response == "Confirmed" && entity.Assignment != null)
        {
            try
            {
                await _travelService.AutoGenerateFromAssignmentAsync(entity.AssignmentId);
            }
            catch
            {
                // Travel auto-generation is best-effort, log but don't block confirmation
            }

            // Sync confirmed assignment to Edge
            await _syncOutbox.EnqueueForVesselAsync(entity.Assignment.VesselId, "crew_assignment", entity.AssignmentId.ToString(),
                SyncActionType.UPDATE, entity.Assignment);
        }

        return MapConfirmationDto(entity);
    }

    // ================================================================
    // COMMENTS
    // ================================================================

    public async Task<List<AssignmentCommentDto>> GetCommentsAsync(Guid assignmentId)
    {
        return await _db.AssignmentComments
            .Where(c => c.AssignmentId == assignmentId)
            .OrderBy(c => c.PostedAt)
            .Select(c => new AssignmentCommentDto
            {
                Id = c.Id,
                AssignmentId = c.AssignmentId,
                Author = c.Author,
                AuthorRole = c.AuthorRole,
                Content = c.Content,
                PostedAt = c.PostedAt,
            }).ToListAsync();
    }

    public async Task<AssignmentCommentDto> AddCommentAsync(Guid assignmentId, CreateCommentRequest request, string author)
    {
        var entity = new AssignmentComment
        {
            Id = Guid.NewGuid(),
            AssignmentId = assignmentId,
            Author = author,
            Content = request.Content,
        };

        _db.AssignmentComments.Add(entity);
        await _db.SaveChangesAsync();

        return new AssignmentCommentDto
        {
            Id = entity.Id,
            AssignmentId = entity.AssignmentId,
            Author = entity.Author,
            Content = entity.Content,
            PostedAt = entity.PostedAt,
        };
    }

    // ================================================================
    // STATUS HISTORY
    // ================================================================

    public async Task<List<AssignmentStatusHistoryDto>> GetStatusHistoryAsync(Guid assignmentId)
    {
        return await _db.AssignmentStatusHistory
            .Where(h => h.AssignmentId == assignmentId)
            .OrderByDescending(h => h.ChangedAt)
            .Select(h => new AssignmentStatusHistoryDto
            {
                Id = h.Id,
                FromStatus = h.FromStatus,
                ToStatus = h.ToStatus,
                ChangedBy = h.ChangedBy,
                Reason = h.Reason,
                ChangedAt = h.ChangedAt,
            }).ToListAsync();
    }

    // ================================================================
    // PLANNING BOARD
    // ================================================================

    public async Task<VesselPlanningBoardDto> GetPlanningBoardAsync(Guid vesselId)
    {
        var vessel = await _db.Vessels.FindAsync(vesselId);
        if (vessel == null)
            return new VesselPlanningBoardDto { VesselId = vesselId };

        var standard = await _db.VesselManningStandards
            .Include(s => s.Positions).ThenInclude(p => p.Rank)
            .Where(s => s.VesselId == vesselId && s.IsActive)
            .FirstOrDefaultAsync();

        var activeAssignments = await _db.CrewAssignments
            .Include(a => a.CrewMember)
            .Include(a => a.Rank)
            .Include(a => a.Conflicts)
            .Include(a => a.Comments)
            .Where(a => a.VesselId == vesselId && AssignmentStatus.Active.Contains(a.Status))
            .OrderBy(a => a.RankId).ThenBy(a => a.PlannedStartDate)
            .ToListAsync();

        var vessels = new Dictionary<Guid, string> { [vessel.Id] = vessel.Name };
        var assignmentDtos = activeAssignments.Select(a => MapAssignmentDto(a, vessels)).ToList();

        var standardDto = standard != null ? MapStandardDto(standard, activeAssignments) : null;

        var totalPositions = standard?.Positions.Where(p => p.IsActive).Sum(p => p.RequiredCount) ?? 0;
        var filledPositions = activeAssignments.Count(a =>
            a.Status != AssignmentStatus.Cancelled && a.Status != AssignmentStatus.Declined);

        return new VesselPlanningBoardDto
        {
            VesselId = vesselId,
            VesselName = vessel.Name,
            VesselType = vessel.VesselType,
            Flag = vessel.Flag,
            ManningStandard = standardDto,
            ActiveAssignments = assignmentDtos,
            ShortageCount = Math.Max(0, totalPositions - filledPositions),
            TotalPositions = totalPositions,
            FilledPositions = filledPositions,
        };
    }

    public async Task<List<CandidateDto>> SearchCandidatesAsync(CandidateSearchRequest request)
    {
        var query = _db.CrewMembers
            .Include(c => c.Rank)
            .Include(c => c.Country)
            .Where(c => c.Status == CrewStatus.Active);

        // Filter by rank or equivalent ranks
        if (request.IncludeEquivalentRanks)
        {
            // Include crew with matching rank or equivalent
            query = query.Where(c => c.RankId == request.RankId || c.RankId != null);
        }
        else
        {
            query = query.Where(c => c.RankId == request.RankId);
        }

        var candidates = await query.OrderBy(c => c.FullName).Take(100).ToListAsync();

        var result = new List<CandidateDto>();
        foreach (var crew in candidates)
        {
            var conflicts = new List<AssignmentConflictDto>();

            // Check date overlap with existing assignments
            if (request.StartDate.HasValue && request.EndDate.HasValue)
            {
                var overlapping = await _db.CrewAssignments
                    .AnyAsync(a => a.CrewMemberId == crew.Id
                        && AssignmentStatus.Active.Contains(a.Status)
                        && a.PlannedStartDate < request.EndDate
                        && a.PlannedEndDate > request.StartDate);

                if (overlapping)
                {
                    conflicts.Add(new AssignmentConflictDto
                    {
                        Id = Guid.NewGuid(),
                        ConflictType = ConflictType.DateOverlap,
                        Severity = ConflictSeverity.Blocker,
                        Description = "Has overlapping assignment in requested period",
                        DetectedAt = DateTime.UtcNow,
                    });
                }
            }

            // Check pool status
            if (crew.PoolStatus != PoolStatus.Available)
            {
                conflicts.Add(new AssignmentConflictDto
                {
                    Id = Guid.NewGuid(),
                    ConflictType = ConflictType.CrewUnavailable,
                    Severity = crew.PoolStatus == PoolStatus.Assigned ? ConflictSeverity.Warning : ConflictSeverity.Blocker,
                    Description = $"Pool status: {crew.PoolStatus}",
                    DetectedAt = DateTime.UtcNow,
                });
            }

            // Get compliance snapshot if available
            string? complianceResult = null;
            var snapshot = await _db.ComplianceSnapshots
                .Where(s => s.CrewMemberId == crew.Id && s.VesselId == request.VesselId)
                .OrderByDescending(s => s.EvaluatedAt)
                .FirstOrDefaultAsync();
            if (snapshot != null)
                complianceResult = snapshot.OverallResult;

            result.Add(new CandidateDto
            {
                CrewMemberId = crew.Id,
                CrewName = crew.FullName,
                CrewCode = crew.CrewId,
                RankId = crew.RankId ?? 0,
                RankName = crew.Rank?.RankName,
                Nationality = crew.Country?.CountryName,
                PoolStatus = crew.PoolStatus ?? "Unknown",
                ComplianceResult = complianceResult,
                AvailableFrom = crew.DisembarkDate,
                LastDisembark = crew.DisembarkDate,
                IsEquivalentRank = crew.RankId != request.RankId,
                PotentialConflicts = conflicts,
            });
        }

        // Sort: fewest conflicts first, then available first
        return result
            .OrderBy(c => c.PotentialConflicts.Count(x => x.Severity == ConflictSeverity.Blocker))
            .ThenBy(c => c.PoolStatus == PoolStatus.Available ? 0 : 1)
            .ThenBy(c => c.CrewName)
            .ToList();
    }

    // ================================================================
    // MAPPING HELPERS
    // ================================================================

    private VesselManningStandardDto MapStandardDto(VesselManningStandard s, List<CrewAssignment>? assignments = null)
    {
        var activePositions = s.Positions.Where(p => p.IsActive).ToList();
        var totalRequired = activePositions.Sum(p => p.RequiredCount);
        var filledCount = 0;

        var positionDtos = activePositions.Select(p =>
        {
            var filled = assignments?.Count(a =>
                a.RankId == p.RankId
                && AssignmentStatus.Active.Contains(a.Status)) ?? 0;
            filledCount += Math.Min(filled, p.RequiredCount);
            return MapPositionDto(p, filled);
        }).ToList();

        return new VesselManningStandardDto
        {
            Id = s.Id,
            VesselId = s.VesselId,
            Name = s.Name,
            Description = s.Description,
            DocumentReference = s.DocumentReference,
            IsActive = s.IsActive,
            EffectiveFrom = s.EffectiveFrom,
            EffectiveTo = s.EffectiveTo,
            PositionCount = activePositions.Count,
            TotalRequired = totalRequired,
            FilledCount = filledCount,
            Positions = positionDtos,
        };
    }

    private static ManningPositionDto MapPositionDto(ManningPosition p, int filled)
    {
        var fillStatus = filled >= p.RequiredCount
            ? PositionFillStatus.Filled
            : filled > 0 ? PositionFillStatus.Proposed : PositionFillStatus.Open;

        return new ManningPositionDto
        {
            Id = p.Id,
            RankId = p.RankId,
            RankName = p.Rank?.RankName,
            Department = p.Rank?.Department,
            RequiredCount = p.RequiredCount,
            AllowEquivalent = p.AllowEquivalent,
            Notes = p.Notes,
            SortOrder = p.SortOrder,
            FillStatus = fillStatus,
            CurrentlyFilled = filled,
        };
    }

    private static CrewAssignmentDto MapAssignmentDto(CrewAssignment a, Dictionary<Guid, string> vessels)
    {
        return new CrewAssignmentDto
        {
            Id = a.Id,
            CrewMemberId = a.CrewMemberId,
            CrewName = a.CrewMember?.FullName,
            CrewCode = a.CrewMember?.CrewId,
            VesselId = a.VesselId,
            VesselName = vessels.GetValueOrDefault(a.VesselId),
            RankId = a.RankId,
            RankName = a.Rank?.RankName,
            ManningPositionId = a.ManningPositionId,
            Status = a.Status,
            StatusChangedAt = a.StatusChangedAt,
            PlannedStartDate = a.PlannedStartDate,
            PlannedEndDate = a.PlannedEndDate,
            ActualStartDate = a.ActualStartDate,
            ActualEndDate = a.ActualEndDate,
            JoinPortCode = a.JoinPortCode,
            JoinPortName = a.JoinPortName,
            LeavePortCode = a.LeavePortCode,
            LeavePortName = a.LeavePortName,
            IsEquivalentRank = a.IsEquivalentRank,
            OriginalRankId = a.OriginalRankId,
            EquivalentRankJustification = a.EquivalentRankJustification,
            ComplianceResult = a.ComplianceResult,
            ComplianceEvaluatedAt = a.ComplianceEvaluatedAt,
            Notes = a.Notes,
            CreatedAt = a.CreatedAt,
            UpdatedAt = a.UpdatedAt,
            ConflictCount = a.Conflicts?.Count ?? 0,
            BlockerCount = a.Conflicts?.Count(c => c.Severity == ConflictSeverity.Blocker && !c.IsResolved) ?? 0,
            CommentCount = a.Comments?.Count ?? 0,
        };
    }

    private static AssignmentConfirmationDto MapConfirmationDto(AssignmentConfirmation c)
    {
        return new AssignmentConfirmationDto
        {
            Id = c.Id,
            AssignmentId = c.AssignmentId,
            Response = c.Response,
            RespondedAt = c.RespondedAt,
            RespondedBy = c.RespondedBy,
            DeclineReason = c.DeclineReason,
            Notes = c.Notes,
            SentAt = c.SentAt,
            SentBy = c.SentBy,
        };
    }
}
