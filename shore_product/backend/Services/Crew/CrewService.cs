using Microsoft.EntityFrameworkCore;
using Maritime.Shared.DTOs.Crew;
using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Documents;
using Maritime.Shared.Models.Sync;
using Maritime.Shared.DTOs.CrewManagement;
using ProductApi.Data;
using ProductApi.Services.CrewManagement;
using ProductApi.Services.Sync;

namespace ProductApi.Services.Crew;

/// <summary>
/// Crew management service for Shore side.
/// Handles CRUD operations with multi-ship support.
/// Broadcasts changes to SyncOutbox for edge nodes to pull.
/// </summary>
public class CrewService : ICrewService
{
    private static DateTime? ToUtc(DateTime? dt)
    {
        if (dt == null) return null;
        return dt.Value.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(dt.Value, DateTimeKind.Utc)
            : dt.Value.ToUniversalTime();
    }

    private readonly AppDbContext _context;
    private readonly ILogger<CrewService> _logger;
    private readonly ISyncOutboxService? _syncOutbox;
    private readonly IOnboardingService? _onboardingService;

    public CrewService(AppDbContext context, ILogger<CrewService> logger, ISyncOutboxService? syncOutbox = null, IOnboardingService? onboardingService = null)
    {
        _context = context;
        _logger = logger;
        _syncOutbox = syncOutbox;
        _onboardingService = onboardingService;
    }

    // ============================================================
    // CREW MEMBER CRUD
    // ============================================================

    public async Task<(List<CrewMemberDto> Data, int TotalCount, int TotalPages)> GetAllCrewAsync(
        int page = 1, int pageSize = 50,
        string? search = null, bool? isOnboard = null,
        Guid? shipId = null, bool? poolOnly = null,
        string? rankName = null, string? department = null, string? vesselName = null)
    {
        if (page < 1) page = 1;
        if (pageSize < 1) pageSize = 50;
        if (pageSize > 200) pageSize = 200;

        var query = _context.CrewMembers
            .AsNoTracking()
            .Include(c => c.Rank)
            .Include(c => c.Country)
            .AsQueryable();

        // Search
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.ToLower();
            query = query.Where(c =>
                c.FullName.ToLower().Contains(s) ||
                c.CrewId.ToLower().Contains(s) ||
                (c.Rank != null && (c.Rank.RankName.ToLower().Contains(s) || c.Rank.RankCode.ToLower().Contains(s))));
        }

        // Filters
        if (isOnboard.HasValue)
            query = query.Where(c => c.IsOnboard == isOnboard.Value);

        if (shipId.HasValue)
            query = query.Where(c => c.VesselId == shipId.Value);

        if (poolOnly == true)
            query = query.Where(c => c.VesselId == null && !c.IsOnboard);

        if (!string.IsNullOrWhiteSpace(rankName))
        {
            var rn = rankName.ToLower();
            query = query.Where(c => c.Rank != null && c.Rank.RankName.ToLower().Contains(rn));
        }

        if (!string.IsNullOrWhiteSpace(department))
        {
            var dept = department.ToLower();
            query = query.Where(c => c.Department != null && c.Department.ToLower().Contains(dept));
        }

        if (!string.IsNullOrWhiteSpace(vesselName))
        {
            var vn = vesselName.ToLower();
            query = query.Where(c => c.VesselId.HasValue &&
                _context.Vessels.Any(v => v.Id == c.VesselId.Value && v.Name.ToLower().Contains(vn)));
        }

        var totalCount = await query.CountAsync();
        var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

        var crew = await query
            .OrderBy(c => c.FullName)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        // Resolve vessel names for assigned crew
        var vesselIds = crew.Where(c => c.VesselId.HasValue).Select(c => c.VesselId!.Value).Distinct().ToList();
        var vesselNames = vesselIds.Count > 0
            ? await _context.Vessels.AsNoTracking()
                .Where(v => vesselIds.Contains(v.Id))
                .ToDictionaryAsync(v => v.Id, v => v.Name)
            : new Dictionary<Guid, string>();

        var dtos = crew.Select(c => MapToDto(c, vesselNames.GetValueOrDefault(c.VesselId ?? Guid.Empty))).ToList();
        return (dtos, totalCount, totalPages);
    }

    public async Task<(int Total, int Onboard, int Pool, int PendingReview)> GetCrewStatsAsync()
    {
        var total = await _context.CrewMembers.AsNoTracking().CountAsync();
        var onboard = await _context.CrewMembers.AsNoTracking().CountAsync(c => c.IsOnboard);
        var pendingReview = await _context.CrewMembers.AsNoTracking().CountAsync(c => c.OnboardStatus == "PendingReview");
        return (total, onboard, total - onboard - pendingReview, pendingReview);
    }

    public async Task<CrewMemberDto?> GetCrewByIdAsync(Guid id)
    {
        var crew = await _context.CrewMembers
            .AsNoTracking()
            .Include(c => c.Rank)
            .Include(c => c.Country)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (crew == null) return null;
        var vesselName = crew.VesselId.HasValue
            ? await _context.Vessels.AsNoTracking().Where(v => v.Id == crew.VesselId.Value).Select(v => v.Name).FirstOrDefaultAsync()
            : null;
        return MapToDto(crew, vesselName);
    }

    public async Task<CrewDetailDto?> GetCrewDetailAsync(Guid id)
    {
        var crew = await _context.CrewMembers
            .AsNoTracking()
            .Include(c => c.Rank)
            .Include(c => c.Country)
            .Include(c => c.Certificates).ThenInclude(cc => cc.Certificate)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (crew == null) return null;

        var vesselName = crew.VesselId.HasValue
            ? await _context.Vessels.AsNoTracking().Where(v => v.Id == crew.VesselId.Value).Select(v => v.Name).FirstOrDefaultAsync()
            : null;
        var dto = MapToDetailDto(crew, vesselName);

        // Load passport info from travel documents
        var passport = await _context.TravelDocuments
            .AsNoTracking()
            .Where(d => d.CrewMemberId == id && d.DocumentType == "passport")
            .OrderByDescending(d => d.ExpiryDate)
            .FirstOrDefaultAsync();

        if (passport != null)
        {
            dto.PassportNumber = passport.DocumentNumber;
            dto.PassportExpiry = passport.ExpiryDate;
        }

        // Load seaman book
        var seamanBook = await _context.SeafarerDocuments
            .AsNoTracking()
            .Where(d => d.CrewMemberId == id && d.DocumentType == "seaman_book")
            .OrderByDescending(d => d.ExpiryDate)
            .FirstOrDefaultAsync();

        if (seamanBook != null)
            dto.SeamanBookNumber = seamanBook.DocumentNumber;

        return dto;
    }

    public async Task<CrewMemberDto> CreateCrewAsync(CreateCrewRequest request)
    {
        // Validate required fields
        if (string.IsNullOrWhiteSpace(request.FullName))
            throw new ArgumentException("FullName is required", nameof(request));
        if (string.IsNullOrWhiteSpace(request.CrewId))
            throw new ArgumentException("CrewId is required", nameof(request));

        // Check duplicate CrewId
        var exists = await _context.CrewMembers
            .AnyAsync(c => c.CrewId == request.CrewId);
        if (exists)
            throw new InvalidOperationException($"Crew member with ID '{request.CrewId}' already exists");

        try
        {
            var crew = new CrewMember
            {
                Id = Guid.NewGuid(),
                CrewId = request.CrewId,
                FullName = request.FullName,
                RankId = request.RankId,
                Department = request.Department,
                CountryId = request.CountryId,
                DateOfBirth = ToUtc(request.DateOfBirth),
                JoinDate = ToUtc(request.JoinDate),
                EmbarkDate = ToUtc(request.EmbarkDate),
                ContractEnd = ToUtc(request.ContractEnd),
                IsOnboard = request.IsOnboard,
                VesselId = request.VesselId,
                EmergencyContact = request.EmergencyContact,
                EmailAddress = request.EmailAddress,
                PhoneNumber = request.PhoneNumber,
                Address = request.Address,
                PlaceOfBirth = request.PlaceOfBirth,
                IdCardNumber = request.IdCardNumber,
                MaritalStatus = request.MaritalStatus,
                Height = request.Height,
                Weight = request.Weight,
                BloodGroup = request.BloodGroup,
                ClothingSize = request.ClothingSize,
                ShoeSize = request.ShoeSize,
                CateringSize = request.CateringSize,
                IsSmoker = request.IsSmoker,
                IsCovidVaccinated = request.IsCovidVaccinated,
                NextOfKinName = request.NextOfKinName,
                NextOfKinRelation = request.NextOfKinRelation,
                NextOfKinPhone = request.NextOfKinPhone,
                NextOfKinAddress = request.NextOfKinAddress,
                EducationInstitution = request.EducationInstitution,
                EducationCourse = request.EducationCourse,
                EducationPeriodYears = request.EducationPeriodYears,
                EducationGraduationYear = request.EducationGraduationYear,
                Notes = request.Notes,
                OriginNode = "SHORE",
                IsSynced = false,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            _context.CrewMembers.Add(crew);
            await _context.SaveChangesAsync();

            // Reload with Rank navigation
            await _context.Entry(crew).Reference(c => c.Rank).LoadAsync();

            // Broadcast to sync outbox for edge nodes
            if (_syncOutbox != null)
            {
                try
                {
                    await _syncOutbox.BroadcastAsync("crew_member", crew.Id.ToString(), SyncActionType.CREATE, crew);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to broadcast crew creation to sync outbox for {CrewId}. Data saved but sync pending.", crew.CrewId);
                }
            }

            _logger.LogInformation("Created crew member {CrewId} - {Name}", crew.CrewId, crew.FullName);

            // Auto-create onboarding case for new crew member
            if (_onboardingService != null)
            {
                try
                {
                    await _onboardingService.CreateCaseAsync(new CreateOnboardingCaseRequest
                    {
                        CrewMemberId = crew.Id,
                    }, "System (Auto-Onboarding)");
                    _logger.LogInformation("Auto-created onboarding case for crew {CrewId}", crew.CrewId);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to auto-create onboarding case for crew {CrewId}. Crew saved but onboarding must be started manually.", crew.CrewId);
                }
            }

            return MapToDto(crew);
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "Database error creating crew member {CrewId}", request.CrewId);
            throw new InvalidOperationException($"Failed to create crew member: {ex.InnerException?.Message ?? ex.Message}", ex);
        }
    }

    public async Task<CrewMemberDto?> UpdateCrewAsync(Guid id, UpdateCrewRequest request)
    {
        var crew = await _context.CrewMembers
            .AsTracking()
            .Include(c => c.Rank)
            .Include(c => c.Country)
            .FirstOrDefaultAsync(c => c.Id == id);

        if (crew == null) return null;

        // Apply non-null updates
        if (request.FullName != null) crew.FullName = request.FullName;
        if (request.RankId.HasValue) crew.RankId = request.RankId;
        if (request.Department != null) crew.Department = request.Department;
        if (request.CountryId.HasValue) crew.CountryId = request.CountryId;
        if (request.DateOfBirth.HasValue) crew.DateOfBirth = ToUtc(request.DateOfBirth);
        if (request.JoinDate.HasValue) crew.JoinDate = ToUtc(request.JoinDate);
        if (request.EmbarkDate.HasValue) crew.EmbarkDate = ToUtc(request.EmbarkDate);
        if (request.DisembarkDate.HasValue) crew.DisembarkDate = ToUtc(request.DisembarkDate);
        if (request.ContractEnd.HasValue) crew.ContractEnd = ToUtc(request.ContractEnd);
        // IsOnboard is NOT updated here — managed by dedicated onboard/disembark endpoints
        if (request.VesselId.HasValue) crew.VesselId = request.VesselId;
        if (request.EmergencyContact != null) crew.EmergencyContact = request.EmergencyContact;
        if (request.EmailAddress != null) crew.EmailAddress = request.EmailAddress;
        if (request.PhoneNumber != null) crew.PhoneNumber = request.PhoneNumber;
        if (request.Address != null) crew.Address = request.Address;
        if (request.PlaceOfBirth != null) crew.PlaceOfBirth = request.PlaceOfBirth;
        if (request.IdCardNumber != null) crew.IdCardNumber = request.IdCardNumber;
        if (request.MaritalStatus != null) crew.MaritalStatus = request.MaritalStatus;
        if (request.Height.HasValue) crew.Height = request.Height;
        if (request.Weight.HasValue) crew.Weight = request.Weight;
        if (request.BloodGroup != null) crew.BloodGroup = request.BloodGroup;
        if (request.ClothingSize != null) crew.ClothingSize = request.ClothingSize;
        if (request.ShoeSize != null) crew.ShoeSize = request.ShoeSize;
        if (request.CateringSize != null) crew.CateringSize = request.CateringSize;
        if (request.IsSmoker.HasValue) crew.IsSmoker = request.IsSmoker;
        if (request.IsCovidVaccinated.HasValue) crew.IsCovidVaccinated = request.IsCovidVaccinated;
        if (request.NextOfKinName != null) crew.NextOfKinName = request.NextOfKinName;
        if (request.NextOfKinRelation != null) crew.NextOfKinRelation = request.NextOfKinRelation;
        if (request.NextOfKinPhone != null) crew.NextOfKinPhone = request.NextOfKinPhone;
        if (request.NextOfKinAddress != null) crew.NextOfKinAddress = request.NextOfKinAddress;
        if (request.EducationInstitution != null) crew.EducationInstitution = request.EducationInstitution;
        if (request.EducationCourse != null) crew.EducationCourse = request.EducationCourse;
        if (request.EducationPeriodYears.HasValue) crew.EducationPeriodYears = request.EducationPeriodYears;
        if (request.EducationGraduationYear.HasValue) crew.EducationGraduationYear = request.EducationGraduationYear;
        if (request.Notes != null) crew.Notes = request.Notes;

        crew.UpdatedAt = DateTime.UtcNow;
        crew.IsSynced = false; // Mark for sync

        await _context.SaveChangesAsync();

        // Upsert seaman book number into SeafarerDocuments
        if (!string.IsNullOrWhiteSpace(request.SeamanBookNumber))
        {
            var existingSeamanBook = await _context.SeafarerDocuments
                .AsTracking()
                .Where(d => d.CrewMemberId == id && d.DocumentType == "seaman_book")
                .FirstOrDefaultAsync();

            if (existingSeamanBook != null)
            {
                existingSeamanBook.DocumentNumber = request.SeamanBookNumber;
                existingSeamanBook.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                _context.SeafarerDocuments.Add(new SeafarerDocument
                {
                    CrewMemberId = id,
                    DocumentType = "seaman_book",
                    DocumentNumber = request.SeamanBookNumber,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
            }

            await _context.SaveChangesAsync();
        }

        // Broadcast update to edge nodes
        if (_syncOutbox != null)
        {
            try
            {
                await _syncOutbox.BroadcastAsync("crew_member", crew.Id.ToString(), SyncActionType.UPDATE, crew);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to broadcast crew update to sync outbox for {CrewId}. Data saved but sync pending.", crew.CrewId);
            }
        }

        _logger.LogInformation("Updated crew member {CrewId}", crew.CrewId);
        return MapToDto(crew);
    }

    public async Task<bool> DeleteCrewAsync(Guid id)
    {
        var crew = await _context.CrewMembers.FindAsync(id);
        if (crew == null) return false;

        _context.CrewMembers.Remove(crew);
        await _context.SaveChangesAsync();

        // Broadcast deletion to edge nodes
        if (_syncOutbox != null)
        {
            try
            {
                await _syncOutbox.BroadcastAsync("crew_member", crew.Id.ToString(), SyncActionType.DELETE, new { crew.Id });
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to broadcast crew deletion to sync outbox for {CrewId}. Data deleted but sync pending.", crew.CrewId);
            }
        }

        _logger.LogInformation("Deleted crew member {CrewId}", crew.CrewId);
        return true;
    }

    // ============================================================
    // VESSEL ASSIGNMENT
    // ============================================================

    public async Task<CrewMemberDto?> AssignToVesselAsync(Guid crewId, Guid vesselId)
    {
        var crew = await _context.CrewMembers
            .AsTracking()
            .Include(c => c.Rank)
            .Include(c => c.Country)
            .FirstOrDefaultAsync(c => c.Id == crewId);
        if (crew == null) return null;

        var vessel = await _context.Vessels.AsNoTracking().FirstOrDefaultAsync(v => v.Id == vesselId);
        if (vessel == null) throw new ArgumentException($"Vessel with ID '{vesselId}' not found");

        crew.VesselId = vesselId;
        crew.IsOnboard = false;
        crew.EmbarkDate = DateTime.UtcNow;
        crew.DisembarkDate = null;
        crew.PoolStatus = "Assigned";
        crew.OnboardStatus = "PendingReview";
        crew.UpdatedAt = DateTime.UtcNow;
        crew.IsSynced = false;

        // Mở kỳ phục vụ trong sổ thuyền viên ngay khi gán lên tàu
        var logbookEntry = await OpenSeamanBookEntryAsync(crew, vessel);

        await _context.SaveChangesAsync();

        if (_syncOutbox != null)
        {
            try
            {
                // Target sync to the specific vessel's edge node using its IMO
                var targetNode = vessel.IMO;
                if (crew.Country != null)
                    await _syncOutbox.EnqueueAsync(targetNode, "country", crew.Country.Id.ToString(), SyncActionType.SNAPSHOT, crew.Country);
                if (crew.Rank != null)
                    await _syncOutbox.EnqueueAsync(targetNode, "rank", crew.Rank.Id.ToString(), SyncActionType.SNAPSHOT, crew.Rank);

                // Sync crew member to the specific vessel
                await _syncOutbox.EnqueueAsync(targetNode, "crew_member", crew.Id.ToString(), SyncActionType.UPDATE, crew);

                // TOÀN BỘ sổ thuyền viên, không chỉ kỳ vừa mở.
                // Chỉ đẩy mỗi mục mới thì tàu mất sạch lịch sử đi biển trước đó của người này —
                // nhất là khi họ từng phục vụ rồi rời tàu, nay quay lại. Sổ là giấy tờ pháp lý,
                // dưới tàu phải xem được đầy đủ. Làm giống cách đã đẩy chứng chỉ và giấy tờ.
                var logbookEntries = await _context.CrewLogbookEntries.AsNoTracking()
                    .Where(e => e.CrewMemberId == crewId)
                    .ToListAsync();
                foreach (var e in logbookEntries)
                    await _syncOutbox.EnqueueAsync(targetNode, "crew_logbook_entry", e.Id.ToString(), SyncActionType.SNAPSHOT, e);

                // Also sync all certificates for this crew member
                var crewCerts = await _context.CrewCertificates.AsNoTracking()
                    .Include(cc => cc.Certificate)
                    .Include(cc => cc.Country)
                    .Where(cc => cc.CrewMemberId == crewId)
                    .ToListAsync();
                foreach (var cc in crewCerts)
                {
                    if (cc.Certificate != null)
                        await _syncOutbox.EnqueueAsync(targetNode, "certificate", cc.Certificate.Id.ToString(), SyncActionType.SNAPSHOT, cc.Certificate);
                    if (cc.Country != null)
                        await _syncOutbox.EnqueueAsync(targetNode, "country", cc.Country.Id.ToString(), SyncActionType.SNAPSHOT, cc.Country);
                    await _syncOutbox.EnqueueAsync(targetNode, "crew_certificate", cc.Id.ToString(), SyncActionType.SNAPSHOT, cc);
                }

                // Sync all documents for this crew member
                var travelDocs = await _context.TravelDocuments.AsNoTracking().Where(d => d.CrewMemberId == crewId).ToListAsync();
                foreach (var d in travelDocs)
                    await _syncOutbox.EnqueueAsync(targetNode, "travel_document", d.Id.ToString(), SyncActionType.SNAPSHOT, d);

                var seafarerDocs = await _context.SeafarerDocuments.AsNoTracking().Where(d => d.CrewMemberId == crewId).ToListAsync();
                foreach (var d in seafarerDocs)
                    await _syncOutbox.EnqueueAsync(targetNode, "seafarer_document", d.Id.ToString(), SyncActionType.SNAPSHOT, d);

                var employmentDocs = await _context.EmploymentDocuments.AsNoTracking().Where(d => d.CrewMemberId == crewId).ToListAsync();
                foreach (var d in employmentDocs)
                    await _syncOutbox.EnqueueAsync(targetNode, "employment_document", d.Id.ToString(), SyncActionType.SNAPSHOT, d);

                var healthDocs = await _context.HealthDocuments.AsNoTracking().Where(d => d.CrewMemberId == crewId).ToListAsync();
                foreach (var d in healthDocs)
                    await _syncOutbox.EnqueueAsync(targetNode, "health_document", d.Id.ToString(), SyncActionType.SNAPSHOT, d);
            }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to sync crew assign data for {CrewId} to vessel {IMO}", crew.CrewId, vessel.IMO); }
        }

        _logger.LogInformation("Assigned crew {CrewId} to vessel {VesselName} with PendingReview status", crew.CrewId, vessel.Name);
        return MapToDto(crew, vessel.Name);
    }

    /// <summary>
    /// Mở (hoặc dùng lại) kỳ phục vụ đang mở của thuyền viên trên con tàu này.
    ///
    /// Idempotent theo cặp (thuyền viên, tàu) + kỳ chưa đóng: gán đi gán lại, hoặc gán từ bờ rồi
    /// sau đó phân công vào một chuyến dưới tàu, đều chỉ ra ĐÚNG MỘT mục sổ. Phía tàu
    /// (SyncSeamanBookEntryAsync) sẽ nhận lại chính mục này và gắn thêm AssignmentId/VoyageId.
    ///
    /// Thông số tàu được chụp lại tại thời điểm gán — sổ thuyền viên là giấy tờ pháp lý nên
    /// mục ghi hôm nay phải giữ nguyên tên/cờ tàu của hôm nay.
    /// </summary>
    private async Task<CrewLogbookEntry> OpenSeamanBookEntryAsync(CrewMember crew, ProductApi.Models.Vessel vessel)
    {
        var entry = await _context.CrewLogbookEntries
            .AsTracking()
            .FirstOrDefaultAsync(e => e.CrewMemberId == crew.Id
                                   && e.VesselId == vessel.Id
                                   && e.EntryType == "SEA_SERVICE"
                                   && e.RecordStatus != "CLOSED");

        var isNew = entry == null;
        if (isNew)
        {
            entry = new CrewLogbookEntry
            {
                CrewMemberId = crew.Id,
                EntryType = "SEA_SERVICE",
                EntryOrigin = "SHORE",
                EntrySource = "AUTO",
                CreatedAt = DateTime.UtcNow,
            };
        }

        entry!.VesselId = vessel.Id;
        entry.VesselName = vessel.Name;
        entry.ImoNumber = vessel.IMO;
        entry.CallSign = vessel.CallSign;
        entry.VesselFlag = vessel.Flag;
        entry.VesselType = vessel.VesselType;
        entry.GrossTonnage = vessel.GrossTonnage > 0 ? Convert.ToDecimal(vessel.GrossTonnage) : null;
        entry.Deadweight = vessel.DeadWeight > 0 ? Convert.ToDecimal(vessel.DeadWeight) : null;
        entry.YearBuilt = vessel.BuildDate != default ? vessel.BuildDate.Year : null;

        entry.RankId = crew.RankId;
        if (crew.RankId.HasValue)
        {
            entry.RankAtTime = await _context.Set<Rank>()
                .Where(r => r.Id == crew.RankId.Value)
                .Select(r => r.RankName)
                .FirstOrDefaultAsync() ?? entry.RankAtTime;
        }

        entry.SignOnDate = crew.EmbarkDate ?? DateTime.UtcNow;
        entry.EntryDate = entry.SignOnDate.Value;
        entry.RecordStatus = "DRAFT";
        entry.Status = "Draft";

        if (isNew)
        {
            entry.Title = string.IsNullOrWhiteSpace(vessel.Name) ? "Kỳ phục vụ" : $"Tàu {vessel.Name}";
            entry.Description = $"Kỳ phục vụ mở khi gán lên tàu {vessel.Name}";
        }

        entry.UpdatedAt = DateTime.UtcNow;
        entry.IsSynced = false;
        entry.OriginNode = "SHORE";

        if (isNew) await _context.CrewLogbookEntries.AddAsync(entry);

        _logger.LogInformation(
            "Sổ thuyền viên: {Action} kỳ phục vụ cho {CrewId} trên tàu {Vessel}",
            isNew ? "mở" : "cập nhật", crew.CrewId, vessel.Name);

        return entry;
    }

    public async Task<CrewMemberDto?> UnassignFromVesselAsync(Guid crewId)
    {
        var crew = await _context.CrewMembers
            .AsTracking()
            .Include(c => c.Rank)
            .Include(c => c.Country)
            .FirstOrDefaultAsync(c => c.Id == crewId);
        if (crew == null) return null;

        // Get the vessel IMO before clearing VesselId for targeted sync
        string? targetNode = null;
        if (crew.VesselId.HasValue)
        {
            var vessel = await _context.Vessels.AsNoTracking().FirstOrDefaultAsync(v => v.Id == crew.VesselId.Value);
            targetNode = vessel?.IMO;
        }

        crew.VesselId = null;
        crew.IsOnboard = false;
        crew.DisembarkDate = DateTime.UtcNow;
        crew.PoolStatus = "Available";
        crew.OnboardStatus = null;
        crew.UpdatedAt = DateTime.UtcNow;
        crew.IsSynced = false;

        await _context.SaveChangesAsync();

        if (_syncOutbox != null && !string.IsNullOrEmpty(targetNode))
        {
            try { await _syncOutbox.EnqueueAsync(targetNode, "crew_member", crew.Id.ToString(), SyncActionType.UPDATE, crew); }
            catch (Exception ex) { _logger.LogWarning(ex, "Failed to sync crew unassign for {CrewId} to vessel {IMO}", crew.CrewId, targetNode); }
        }

        _logger.LogInformation("Unassigned crew {CrewId} from vessel", crew.CrewId);
        return MapToDto(crew);
    }

    /// <summary>
    /// Cho thuyền viên xuống tàu từ bờ.
    ///
    /// Khác với Unassign (chỉ gỡ khỏi tàu), việc này ĐÓNG kỳ phục vụ trong sổ thuyền viên:
    /// điền ngày + cảng rời tàu, lý do, hạnh kiểm. Kỳ đã đóng là một mục lý lịch đi biển
    /// hoàn chỉnh, không bao giờ được mở lại — lần lên tàu sau mở một kỳ MỚI.
    ///
    /// Bờ quyết định có hiệu lực ngay, không qua phê duyệt (đường từ tàu thì phải chờ, GĐ 5).
    /// </summary>
    public async Task<CrewMemberDto?> SignOffFromVesselAsync(
        Guid crewId,
        DateTime? signOffDate,
        string? portCode,
        string? portName,
        string? reason,
        string? signedOffBy,
        string? conduct,
        string? remarks)
    {
        var crew = await _context.CrewMembers
            .AsTracking()
            .Include(c => c.Rank)
            .Include(c => c.Country)
            .FirstOrDefaultAsync(c => c.Id == crewId);
        if (crew == null) return null;

        if (!crew.VesselId.HasValue)
            throw new InvalidOperationException("Thuyền viên hiện không thuộc tàu nào.");

        var vesselId = crew.VesselId.Value;
        var vessel = await _context.Vessels.AsNoTracking().FirstOrDefaultAsync(v => v.Id == vesselId);
        var targetNode = vessel?.IMO;

        var effectiveDate = signOffDate ?? DateTime.UtcNow;
        if (effectiveDate.Kind != DateTimeKind.Utc)
            effectiveDate = DateTime.SpecifyKind(effectiveDate, DateTimeKind.Utc);

        // ── Đóng kỳ phục vụ đang mở ─────────────────────────────
        var entry = await _context.CrewLogbookEntries
            .AsTracking()
            .Where(e => e.CrewMemberId == crewId
                     && e.VesselId == vesselId
                     && e.EntryType == "SEA_SERVICE"
                     && e.RecordStatus != "CLOSED")
            .OrderByDescending(e => e.SignOnDate ?? e.CreatedAt)
            .FirstOrDefaultAsync();

        if (entry != null)
        {
            if (entry.SignOnDate.HasValue && effectiveDate < entry.SignOnDate.Value)
                throw new InvalidOperationException("Ngày rời tàu không thể trước ngày lên tàu.");

            entry.SignOffDate = effectiveDate;
            entry.SignOffPortCode = portCode;
            entry.SignOffPortName = portName;
            entry.SignOffReason = reason;
            entry.SignOffBy = signedOffBy;
            if (!string.IsNullOrWhiteSpace(conduct)) entry.Conduct = conduct;
            if (!string.IsNullOrWhiteSpace(remarks)) entry.Notes = remarks;
            entry.RecordStatus = "CLOSED";
            entry.Status = "Approved";
            entry.UpdatedAt = DateTime.UtcNow;
            entry.IsSynced = false;
        }
        else
        {
            // Không có kỳ đang mở — vẫn cho xuống tàu, nhưng ghi log để truy được.
            // Thường gặp với dữ liệu cũ tạo trước khi có sổ thuyền viên.
            _logger.LogWarning(
                "Cho {CrewId} xuống tàu nhưng không tìm thấy kỳ phục vụ đang mở trên tàu {VesselId}",
                crew.CrewId, vesselId);
        }

        // ── Trả thuyền viên về danh bạ chung ────────────────────
        crew.VesselId = null;
        crew.IsOnboard = false;
        crew.DisembarkDate = effectiveDate;
        crew.PoolStatus = "Available";
        crew.OnboardStatus = null;
        crew.UpdatedAt = DateTime.UtcNow;
        crew.IsSynced = false;

        await _context.SaveChangesAsync();

        if (_syncOutbox != null && !string.IsNullOrEmpty(targetNode))
        {
            try
            {
                await _syncOutbox.EnqueueAsync(targetNode, "crew_member", crew.Id.ToString(), SyncActionType.UPDATE, crew);
                if (entry != null)
                    await _syncOutbox.EnqueueAsync(targetNode, "crew_logbook_entry", entry.Id.ToString(), SyncActionType.SNAPSHOT, entry);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Không đẩy được lệnh xuống tàu của {CrewId} tới tàu {IMO}", crew.CrewId, targetNode);
            }
        }

        _logger.LogInformation(
            "Cho {CrewId} xuống tàu {Vessel} ngày {Date}, lý do: {Reason}",
            crew.CrewId, vessel?.Name, effectiveDate, reason ?? "(không ghi)");

        return MapToDto(crew);
    }

    // ============================================================
    // CREW DOCUMENTS
    // ============================================================

    public async Task<List<DocumentDto>> GetCrewDocumentsAsync(Guid crewId, string category)
    {
        if (string.IsNullOrWhiteSpace(category))
            throw new ArgumentNullException(nameof(category));

        return category.ToLower() switch
        {
            "travel" => (await _context.TravelDocuments
                .AsNoTracking()
                .Include(d => d.Country)
                .Where(d => d.CrewMemberId == crewId)
                .OrderByDescending(d => d.ExpiryDate)
                .ToListAsync())
                .Select(d => new DocumentDto
                {
                    Id = d.Id, CrewMemberId = d.CrewMemberId, DocumentType = d.DocumentType,
                    DocumentNumber = d.DocumentNumber, IssueDate = d.IssueDate, ExpiryDate = d.ExpiryDate,
                    CountryId = d.CountryId, CountryName = d.Country?.CountryName,
                    FileUrl = d.FileUrl, Notes = d.Notes, Category = "travel",
                    CreatedAt = d.CreatedAt, UpdatedAt = d.UpdatedAt
                }).ToList(),

            "seafarer" => (await _context.SeafarerDocuments
                .AsNoTracking()
                .Include(d => d.Country)
                .Where(d => d.CrewMemberId == crewId)
                .OrderByDescending(d => d.ExpiryDate)
                .ToListAsync())
                .Select(d => new DocumentDto
                {
                    Id = d.Id, CrewMemberId = d.CrewMemberId, DocumentType = d.DocumentType,
                    DocumentNumber = d.DocumentNumber, IssueDate = d.IssueDate, ExpiryDate = d.ExpiryDate,
                    CountryId = d.CountryId, CountryName = d.Country?.CountryName,
                    FileUrl = d.FileUrl, Notes = d.Notes, Category = "seafarer",
                    CreatedAt = d.CreatedAt, UpdatedAt = d.UpdatedAt
                }).ToList(),

            "employment" => (await _context.EmploymentDocuments
                .AsNoTracking()
                .Include(d => d.Country)
                .Where(d => d.CrewMemberId == crewId)
                .OrderByDescending(d => d.ExpiryDate)
                .ToListAsync())
                .Select(d => new DocumentDto
                {
                    Id = d.Id, CrewMemberId = d.CrewMemberId, DocumentType = d.DocumentType,
                    DocumentNumber = d.DocumentNumber, IssueDate = d.IssueDate, ExpiryDate = d.ExpiryDate,
                    CountryId = d.CountryId, CountryName = d.Country?.CountryName,
                    FileUrl = d.FileUrl, Notes = d.Notes, Category = "employment",
                    CreatedAt = d.CreatedAt, UpdatedAt = d.UpdatedAt
                }).ToList(),

            "health" => (await _context.HealthDocuments
                .AsNoTracking()
                .Where(d => d.CrewMemberId == crewId)
                .OrderByDescending(d => d.ExpiryDate)
                .ToListAsync())
                .Select(d => new DocumentDto
                {
                    Id = d.Id, CrewMemberId = d.CrewMemberId, DocumentType = d.DocumentType,
                    DocumentNumber = d.DocumentNumber, IssueDate = d.IssueDate, ExpiryDate = d.ExpiryDate,
                    FileUrl = d.FileUrl, Notes = d.Notes, Category = "health",
                    CreatedAt = d.CreatedAt, UpdatedAt = d.UpdatedAt
                }).ToList(),

            _ => new List<DocumentDto>()
        };
    }

    public async Task<DocumentDto> AddCrewDocumentAsync(Guid crewId, CreateIdentityDocumentDto request)
    {
        var crewExists = await _context.CrewMembers.AnyAsync(c => c.Id == crewId);
        if (!crewExists)
            throw new ArgumentException($"Crew member {crewId} not found");

        var now = DateTime.UtcNow;
        DocumentDto result;

        switch ((request.Category ?? "travel").ToLower())
        {
            case "travel":
                var travel = new TravelDocument
                {
                    CrewMemberId = crewId, DocumentType = request.DocumentType,
                    DocumentNumber = request.DocumentNumber, IssueDate = ToUtc(request.IssueDate),
                    ExpiryDate = ToUtc(request.ExpiryDate), CountryId = request.CountryId,
                    Notes = request.Notes, CreatedAt = now, UpdatedAt = now
                };
                _context.TravelDocuments.Add(travel);
                await _context.SaveChangesAsync();
                result = new DocumentDto
                {
                    Id = travel.Id, CrewMemberId = crewId, DocumentType = travel.DocumentType,
                    DocumentNumber = travel.DocumentNumber, IssueDate = travel.IssueDate,
                    ExpiryDate = travel.ExpiryDate, CountryId = travel.CountryId,
                    Notes = travel.Notes, Category = "travel", CreatedAt = travel.CreatedAt, UpdatedAt = travel.UpdatedAt
                };
                if (_syncOutbox != null)
                {
                    try { await _syncOutbox.BroadcastAsync("travel_document", travel.Id.ToString(), SyncActionType.CREATE, travel); }
                    catch (Exception ex) { _logger.LogWarning(ex, "Failed to broadcast travel_document sync for {Id}", travel.Id); }
                }
                break;

            case "seafarer":
                var seafarer = new SeafarerDocument
                {
                    CrewMemberId = crewId, DocumentType = request.DocumentType,
                    DocumentNumber = request.DocumentNumber, IssueDate = ToUtc(request.IssueDate),
                    ExpiryDate = ToUtc(request.ExpiryDate), CountryId = request.CountryId,
                    Notes = request.Notes, CreatedAt = now, UpdatedAt = now
                };
                _context.SeafarerDocuments.Add(seafarer);
                await _context.SaveChangesAsync();
                result = new DocumentDto
                {
                    Id = seafarer.Id, CrewMemberId = crewId, DocumentType = seafarer.DocumentType,
                    DocumentNumber = seafarer.DocumentNumber, IssueDate = seafarer.IssueDate,
                    ExpiryDate = seafarer.ExpiryDate, CountryId = seafarer.CountryId,
                    Notes = seafarer.Notes, Category = "seafarer", CreatedAt = seafarer.CreatedAt, UpdatedAt = seafarer.UpdatedAt
                };
                if (_syncOutbox != null)
                {
                    try { await _syncOutbox.BroadcastAsync("seafarer_document", seafarer.Id.ToString(), SyncActionType.CREATE, seafarer); }
                    catch (Exception ex) { _logger.LogWarning(ex, "Failed to broadcast seafarer_document sync for {Id}", seafarer.Id); }
                }
                break;

            case "employment":
                var employment = new EmploymentDocument
                {
                    CrewMemberId = crewId, DocumentType = request.DocumentType,
                    DocumentNumber = request.DocumentNumber, IssueDate = ToUtc(request.IssueDate),
                    ExpiryDate = ToUtc(request.ExpiryDate), CountryId = request.CountryId,
                    Notes = request.Notes, CreatedAt = now, UpdatedAt = now
                };
                _context.EmploymentDocuments.Add(employment);
                await _context.SaveChangesAsync();
                result = new DocumentDto
                {
                    Id = employment.Id, CrewMemberId = crewId, DocumentType = employment.DocumentType,
                    DocumentNumber = employment.DocumentNumber, IssueDate = employment.IssueDate,
                    ExpiryDate = employment.ExpiryDate, CountryId = employment.CountryId,
                    Notes = employment.Notes, Category = "employment", CreatedAt = employment.CreatedAt, UpdatedAt = employment.UpdatedAt
                };
                if (_syncOutbox != null)
                {
                    try { await _syncOutbox.BroadcastAsync("employment_document", employment.Id.ToString(), SyncActionType.CREATE, employment); }
                    catch (Exception ex) { _logger.LogWarning(ex, "Failed to broadcast employment_document sync for {Id}", employment.Id); }
                }
                break;

            case "health":
                var health = new HealthDocument
                {
                    CrewMemberId = crewId, DocumentType = request.DocumentType,
                    DocumentNumber = request.DocumentNumber, IssueDate = ToUtc(request.IssueDate),
                    ExpiryDate = ToUtc(request.ExpiryDate),
                    Notes = request.Notes, CreatedAt = now, UpdatedAt = now
                };
                _context.HealthDocuments.Add(health);
                await _context.SaveChangesAsync();
                result = new DocumentDto
                {
                    Id = health.Id, CrewMemberId = crewId, DocumentType = health.DocumentType,
                    DocumentNumber = health.DocumentNumber, IssueDate = health.IssueDate,
                    ExpiryDate = health.ExpiryDate,
                    Notes = health.Notes, Category = "health", CreatedAt = health.CreatedAt, UpdatedAt = health.UpdatedAt
                };
                if (_syncOutbox != null)
                {
                    try { await _syncOutbox.BroadcastAsync("health_document", health.Id.ToString(), SyncActionType.CREATE, health); }
                    catch (Exception ex) { _logger.LogWarning(ex, "Failed to broadcast health_document sync for {Id}", health.Id); }
                }
                break;

            default:
                throw new ArgumentException($"Unknown document category: {request.Category}");
        }

        return result;
    }

    /// <summary>
    /// Cập nhật thông tin một tài liệu đã có. Chỉ sửa phần dữ liệu nhập tay; đường dẫn file
    /// đính kèm giữ nguyên (file có luồng riêng qua PUT .../file).
    /// Trả null khi không tìm thấy để controller phân biệt được 404 với lỗi thật.
    /// </summary>
    public async Task<DocumentDto?> UpdateCrewDocumentAsync(Guid crewId, Guid documentId, CreateIdentityDocumentDto request)
    {
        var now = DateTime.UtcNow;

        switch ((request.Category ?? "travel").ToLower())
        {
            case "travel":
            {
                var doc = await _context.TravelDocuments.AsTracking()
                    .FirstOrDefaultAsync(d => d.Id == documentId && d.CrewMemberId == crewId);
                if (doc == null) return null;

                doc.DocumentType = request.DocumentType;
                doc.DocumentNumber = request.DocumentNumber;
                doc.IssueDate = ToUtc(request.IssueDate);
                doc.ExpiryDate = ToUtc(request.ExpiryDate);
                doc.CountryId = request.CountryId;
                doc.Notes = request.Notes;
                doc.UpdatedAt = now;
                await _context.SaveChangesAsync();

                if (_syncOutbox != null)
                {
                    try { await _syncOutbox.BroadcastAsync("travel_document", doc.Id.ToString(), SyncActionType.UPDATE, doc); }
                    catch (Exception ex) { _logger.LogWarning(ex, "Failed to broadcast travel_document sync for {Id}", doc.Id); }
                }

                return new DocumentDto
                {
                    Id = doc.Id, CrewMemberId = crewId, DocumentType = doc.DocumentType,
                    DocumentNumber = doc.DocumentNumber, IssueDate = doc.IssueDate,
                    ExpiryDate = doc.ExpiryDate, CountryId = doc.CountryId,
                    Notes = doc.Notes, Category = "travel", CreatedAt = doc.CreatedAt, UpdatedAt = doc.UpdatedAt
                };
            }

            case "seafarer":
            {
                var doc = await _context.SeafarerDocuments.AsTracking()
                    .FirstOrDefaultAsync(d => d.Id == documentId && d.CrewMemberId == crewId);
                if (doc == null) return null;

                doc.DocumentType = request.DocumentType;
                doc.DocumentNumber = request.DocumentNumber;
                doc.IssueDate = ToUtc(request.IssueDate);
                doc.ExpiryDate = ToUtc(request.ExpiryDate);
                doc.CountryId = request.CountryId;
                doc.Notes = request.Notes;
                doc.UpdatedAt = now;
                await _context.SaveChangesAsync();

                if (_syncOutbox != null)
                {
                    try { await _syncOutbox.BroadcastAsync("seafarer_document", doc.Id.ToString(), SyncActionType.UPDATE, doc); }
                    catch (Exception ex) { _logger.LogWarning(ex, "Failed to broadcast seafarer_document sync for {Id}", doc.Id); }
                }

                return new DocumentDto
                {
                    Id = doc.Id, CrewMemberId = crewId, DocumentType = doc.DocumentType,
                    DocumentNumber = doc.DocumentNumber, IssueDate = doc.IssueDate,
                    ExpiryDate = doc.ExpiryDate, CountryId = doc.CountryId,
                    Notes = doc.Notes, Category = "seafarer", CreatedAt = doc.CreatedAt, UpdatedAt = doc.UpdatedAt
                };
            }

            case "employment":
            {
                var doc = await _context.EmploymentDocuments.AsTracking()
                    .FirstOrDefaultAsync(d => d.Id == documentId && d.CrewMemberId == crewId);
                if (doc == null) return null;

                doc.DocumentType = request.DocumentType;
                doc.DocumentNumber = request.DocumentNumber;
                doc.IssueDate = ToUtc(request.IssueDate);
                doc.ExpiryDate = ToUtc(request.ExpiryDate);
                doc.CountryId = request.CountryId;
                doc.Notes = request.Notes;
                doc.UpdatedAt = now;
                await _context.SaveChangesAsync();

                if (_syncOutbox != null)
                {
                    try { await _syncOutbox.BroadcastAsync("employment_document", doc.Id.ToString(), SyncActionType.UPDATE, doc); }
                    catch (Exception ex) { _logger.LogWarning(ex, "Failed to broadcast employment_document sync for {Id}", doc.Id); }
                }

                return new DocumentDto
                {
                    Id = doc.Id, CrewMemberId = crewId, DocumentType = doc.DocumentType,
                    DocumentNumber = doc.DocumentNumber, IssueDate = doc.IssueDate,
                    ExpiryDate = doc.ExpiryDate, CountryId = doc.CountryId,
                    Notes = doc.Notes, Category = "employment", CreatedAt = doc.CreatedAt, UpdatedAt = doc.UpdatedAt
                };
            }

            case "health":
            {
                // HealthDocument không có CountryId — bỏ qua trường này thay vì cố gán.
                var doc = await _context.HealthDocuments.AsTracking()
                    .FirstOrDefaultAsync(d => d.Id == documentId && d.CrewMemberId == crewId);
                if (doc == null) return null;

                doc.DocumentType = request.DocumentType;
                doc.DocumentNumber = request.DocumentNumber;
                doc.IssueDate = ToUtc(request.IssueDate);
                doc.ExpiryDate = ToUtc(request.ExpiryDate);
                doc.Notes = request.Notes;
                doc.UpdatedAt = now;
                await _context.SaveChangesAsync();

                if (_syncOutbox != null)
                {
                    try { await _syncOutbox.BroadcastAsync("health_document", doc.Id.ToString(), SyncActionType.UPDATE, doc); }
                    catch (Exception ex) { _logger.LogWarning(ex, "Failed to broadcast health_document sync for {Id}", doc.Id); }
                }

                return new DocumentDto
                {
                    Id = doc.Id, CrewMemberId = crewId, DocumentType = doc.DocumentType,
                    DocumentNumber = doc.DocumentNumber, IssueDate = doc.IssueDate,
                    ExpiryDate = doc.ExpiryDate,
                    Notes = doc.Notes, Category = "health", CreatedAt = doc.CreatedAt, UpdatedAt = doc.UpdatedAt
                };
            }

            default:
                throw new ArgumentException($"Unknown document category: {request.Category}");
        }
    }

    public async Task<bool> DeleteCrewDocumentAsync(Guid crewId, Guid documentId, string category)
    {
        switch ((category ?? string.Empty).ToLower())
        {
            case "travel":
                var t = await _context.TravelDocuments.AsTracking().FirstOrDefaultAsync(d => d.Id == documentId && d.CrewMemberId == crewId);
                if (t == null) return false;
                _context.TravelDocuments.Remove(t);
                await _context.SaveChangesAsync();
                if (_syncOutbox != null)
                {
                    try { await _syncOutbox.BroadcastAsync("travel_document", documentId.ToString(), SyncActionType.DELETE, new { Id = documentId }); }
                    catch (Exception ex) { _logger.LogWarning(ex, "Failed to broadcast travel_document delete sync for {Id}", documentId); }
                }
                return true;
            case "seafarer":
                var s = await _context.SeafarerDocuments.AsTracking().FirstOrDefaultAsync(d => d.Id == documentId && d.CrewMemberId == crewId);
                if (s == null) return false;
                _context.SeafarerDocuments.Remove(s);
                await _context.SaveChangesAsync();
                if (_syncOutbox != null)
                {
                    try { await _syncOutbox.BroadcastAsync("seafarer_document", documentId.ToString(), SyncActionType.DELETE, new { Id = documentId }); }
                    catch (Exception ex) { _logger.LogWarning(ex, "Failed to broadcast seafarer_document delete sync for {Id}", documentId); }
                }
                return true;
            case "employment":
                var e = await _context.EmploymentDocuments.AsTracking().FirstOrDefaultAsync(d => d.Id == documentId && d.CrewMemberId == crewId);
                if (e == null) return false;
                _context.EmploymentDocuments.Remove(e);
                await _context.SaveChangesAsync();
                if (_syncOutbox != null)
                {
                    try { await _syncOutbox.BroadcastAsync("employment_document", documentId.ToString(), SyncActionType.DELETE, new { Id = documentId }); }
                    catch (Exception ex) { _logger.LogWarning(ex, "Failed to broadcast employment_document delete sync for {Id}", documentId); }
                }
                return true;
            case "health":
                var h = await _context.HealthDocuments.AsTracking().FirstOrDefaultAsync(d => d.Id == documentId && d.CrewMemberId == crewId);
                if (h == null) return false;
                _context.HealthDocuments.Remove(h);
                await _context.SaveChangesAsync();
                if (_syncOutbox != null)
                {
                    try { await _syncOutbox.BroadcastAsync("health_document", documentId.ToString(), SyncActionType.DELETE, new { Id = documentId }); }
                    catch (Exception ex) { _logger.LogWarning(ex, "Failed to broadcast health_document delete sync for {Id}", documentId); }
                }
                return true;
            default:
                return false;
        }
    }

    // ============================================================
    // SERVICE RECORDS
    // ============================================================

    public async Task<List<ServiceRecordDto>> GetServiceRecordsAsync(Guid crewId)
    {
        return await _context.ServiceRecords
            .AsNoTracking()
            .Where(sr => sr.CrewMemberId == crewId)
            .OrderByDescending(sr => sr.BoardingDate)
            .Select(sr => MapToServiceRecordDto(sr))
            .ToListAsync();
    }

    public async Task<ServiceRecordDto> AddServiceRecordAsync(Guid crewId, CreateServiceRecordRequest request)
    {
        var record = new ServiceRecord
        {
            Id = Guid.NewGuid(),
            CrewMemberId = crewId,
            VesselName = request.VesselName,
            VesselFlag = request.VesselFlag,
            VesselType = request.VesselType,
            VesselGrt = request.VesselGrt,
            VesselDwt = request.VesselDwt,
            VesselYearBuilt = request.VesselYearBuilt,
            TradeArea = request.TradeArea,
            MainEngineType = request.MainEngineType,
            MainEnginePowerKw = request.MainEnginePowerKw,
            MainEngineMaker = request.MainEngineMaker,
            BoilerType = request.BoilerType,
            HasExhaustGasScrubber = request.HasExhaustGasScrubber,
            Ecdis = request.Ecdis,
            RankAtTime = request.RankAtTime,
            BoardingDate = request.BoardingDate,
            DisembarkDate = request.DisembarkDate,
            BoardingPortCode = request.BoardingPortCode,
            BoardingPortName = request.BoardingPortName,
            DisembarkPortCode = request.DisembarkPortCode,
            DisembarkPortName = request.DisembarkPortName,
            Notes = request.Notes,
            OriginNode = "SHORE",
            IsSynced = false,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _context.ServiceRecords.Add(record);
        await _context.SaveChangesAsync();

        return MapToServiceRecordDto(record);
    }

    public async Task<ServiceRecordDto?> UpdateServiceRecordAsync(Guid recordId, CreateServiceRecordRequest request)
    {
        var record = await _context.ServiceRecords.FindAsync(recordId);
        if (record == null) return null;

        record.VesselName = request.VesselName;
        record.VesselFlag = request.VesselFlag;
        record.VesselType = request.VesselType;
        record.VesselGrt = request.VesselGrt;
        record.VesselDwt = request.VesselDwt;
        record.VesselYearBuilt = request.VesselYearBuilt;
        record.TradeArea = request.TradeArea;
        record.MainEngineType = request.MainEngineType;
        record.MainEnginePowerKw = request.MainEnginePowerKw;
        record.MainEngineMaker = request.MainEngineMaker;
        record.BoilerType = request.BoilerType;
        record.HasExhaustGasScrubber = request.HasExhaustGasScrubber;
        record.Ecdis = request.Ecdis;
        record.RankAtTime = request.RankAtTime;
        record.BoardingDate = request.BoardingDate;
        record.DisembarkDate = request.DisembarkDate;
        record.BoardingPortCode = request.BoardingPortCode;
        record.BoardingPortName = request.BoardingPortName;
        record.DisembarkPortCode = request.DisembarkPortCode;
        record.DisembarkPortName = request.DisembarkPortName;
        record.Notes = request.Notes;
        record.UpdatedAt = DateTime.UtcNow;
        record.IsSynced = false;

        await _context.SaveChangesAsync();
        return MapToServiceRecordDto(record);
    }

    public async Task<bool> DeleteServiceRecordAsync(Guid recordId)
    {
        var record = await _context.ServiceRecords.FindAsync(recordId);
        if (record == null) return false;

        _context.ServiceRecords.Remove(record);
        await _context.SaveChangesAsync();
        return true;
    }

    // ============================================================
    // MAPPING HELPERS
    // ============================================================

    private static CrewMemberDto MapToDto(CrewMember crew, string? vesselName = null)
    {
        var nameParts = (crew.FullName ?? "").Split(' ', 2);
        var firstName = nameParts.Length > 0 ? nameParts[0] : "";
        var lastName = nameParts.Length > 1 ? nameParts[1] : "";

        return new CrewMemberDto
        {
            Id = crew.Id,
            CrewId = crew.CrewId,
            FirstName = firstName,
            LastName = lastName,
            FullName = crew.FullName ?? string.Empty,
            Rank = crew.Rank != null ? new RankDto
            {
                Id = crew.Rank.Id,
                RankCode = crew.Rank.RankCode,
                RankName = crew.Rank.RankName,
                IsActive = crew.Rank.IsActive
            } : null,
            RankId = crew.RankId,
            RankName = crew.Rank?.RankName,
            RankCode = crew.Rank?.RankCode,
            IsOnboard = crew.IsOnboard,
            VesselId = crew.VesselId,
            VesselName = vesselName,
            Department = crew.Department,
            CountryId = crew.CountryId,
            CountryName = crew.Country?.CountryName,
            EmailAddress = crew.EmailAddress,
            PhoneNumber = crew.PhoneNumber,
            EmbarkDate = crew.EmbarkDate,
            DisembarkDate = crew.DisembarkDate,
            ContractEnd = crew.ContractEnd,
            JoinDate = crew.JoinDate,
            CertificateNumber = crew.CertificateNumber,
            CertificateIssue = crew.CertificateIssue,
            CertificateExpiry = crew.CertificateExpiry,
            MedicalIssue = crew.MedicalIssue,
            MedicalExpiry = crew.MedicalExpiry,
            DateOfBirth = crew.DateOfBirth,
            PhotoUrl = crew.PhotoUrl,
            AvatarUrl = crew.PhotoUrl,
            PlaceOfBirth = crew.PlaceOfBirth,
            IdCardNumber = crew.IdCardNumber,
            MaritalStatus = crew.MaritalStatus,
            Height = crew.Height,
            Weight = crew.Weight,
            BloodGroup = crew.BloodGroup,
            ClothingSize = crew.ClothingSize,
            ShoeSize = crew.ShoeSize,
            CateringSize = crew.CateringSize,
            IsSmoker = crew.IsSmoker,
            IsCovidVaccinated = crew.IsCovidVaccinated,
            EmergencyContact = crew.EmergencyContact,
            Address = crew.Address,
            NextOfKinName = crew.NextOfKinName,
            NextOfKinRelation = crew.NextOfKinRelation,
            NextOfKinPhone = crew.NextOfKinPhone,
            NextOfKinAddress = crew.NextOfKinAddress,
            EducationInstitution = crew.EducationInstitution,
            EducationCourse = crew.EducationCourse,
            EducationPeriodYears = crew.EducationPeriodYears,
            EducationGraduationYear = crew.EducationGraduationYear,
            Notes = crew.Notes,
            IsSynced = crew.IsSynced,
            CreatedAt = crew.CreatedAt,
            UpdatedAt = crew.UpdatedAt,
            OnboardStatus = crew.OnboardStatus,
            OnboardStatusChangedAt = crew.OnboardStatusChangedAt,
            OnboardStatusChangedBy = crew.OnboardStatusChangedBy,
            ReviewChecklist = crew.ReviewChecklist,
            ReviewNotes = crew.ReviewNotes,
            EdgeChanges = crew.EdgeChanges,
            EdgeChangesViewed = crew.EdgeChangesViewed
        };
    }

    private static CrewDetailDto MapToDetailDto(CrewMember crew, string? vesselName = null)
    {
        var baseDto = MapToDto(crew, vesselName);
        return new CrewDetailDto
        {
            Id = baseDto.Id, CrewId = baseDto.CrewId, FirstName = baseDto.FirstName,
            LastName = baseDto.LastName, FullName = baseDto.FullName, Rank = baseDto.Rank,
            RankId = baseDto.RankId, IsOnboard = baseDto.IsOnboard, Department = baseDto.Department,
            // Chép đủ tên chức danh và tàu như MapToDto; thiếu thì trang hồ sơ thấy "đang trên tàu" mà không biết tàu nào.
            RankName = baseDto.RankName, RankCode = baseDto.RankCode, RankGroup = baseDto.RankGroup,
            VesselId = baseDto.VesselId, VesselName = baseDto.VesselName,
            CountryId = baseDto.CountryId, CountryName = baseDto.CountryName, EmailAddress = baseDto.EmailAddress, PhoneNumber = baseDto.PhoneNumber,
            EmbarkDate = baseDto.EmbarkDate, DisembarkDate = baseDto.DisembarkDate,
            ContractEnd = baseDto.ContractEnd, JoinDate = baseDto.JoinDate,
            CertificateNumber = baseDto.CertificateNumber, CertificateIssue = baseDto.CertificateIssue,
            CertificateExpiry = baseDto.CertificateExpiry, MedicalIssue = baseDto.MedicalIssue,
            MedicalExpiry = baseDto.MedicalExpiry, DateOfBirth = baseDto.DateOfBirth,
            PhotoUrl = baseDto.PhotoUrl, AvatarUrl = baseDto.AvatarUrl, PlaceOfBirth = baseDto.PlaceOfBirth,
            IdCardNumber = baseDto.IdCardNumber, MaritalStatus = baseDto.MaritalStatus,
            Height = baseDto.Height, Weight = baseDto.Weight, BloodGroup = baseDto.BloodGroup,
            ClothingSize = baseDto.ClothingSize, ShoeSize = baseDto.ShoeSize,
            CateringSize = baseDto.CateringSize, IsSmoker = baseDto.IsSmoker,
            IsCovidVaccinated = baseDto.IsCovidVaccinated, EmergencyContact = baseDto.EmergencyContact,
            Address = baseDto.Address, NextOfKinName = baseDto.NextOfKinName,
            NextOfKinRelation = baseDto.NextOfKinRelation, NextOfKinPhone = baseDto.NextOfKinPhone,
            NextOfKinAddress = baseDto.NextOfKinAddress,
            EducationInstitution = baseDto.EducationInstitution, EducationCourse = baseDto.EducationCourse,
            EducationPeriodYears = baseDto.EducationPeriodYears,
            EducationGraduationYear = baseDto.EducationGraduationYear,
            Notes = baseDto.Notes, IsSynced = baseDto.IsSynced,
            CreatedAt = baseDto.CreatedAt, UpdatedAt = baseDto.UpdatedAt,
            OnboardStatus = baseDto.OnboardStatus,
            OnboardStatusChangedAt = baseDto.OnboardStatusChangedAt,
            OnboardStatusChangedBy = baseDto.OnboardStatusChangedBy,
            ReviewChecklist = baseDto.ReviewChecklist,
            ReviewNotes = baseDto.ReviewNotes,
            EdgeChanges = baseDto.EdgeChanges,
            EdgeChangesViewed = baseDto.EdgeChangesViewed
        };
    }

    private static ServiceRecordDto MapToServiceRecordDto(ServiceRecord sr) => new()
    {
        Id = sr.Id, CrewMemberId = sr.CrewMemberId, VesselName = sr.VesselName,
        VesselFlag = sr.VesselFlag, VesselType = sr.VesselType,
        VesselGrt = sr.VesselGrt, VesselDwt = sr.VesselDwt,
        VesselYearBuilt = sr.VesselYearBuilt, TradeArea = sr.TradeArea,
        MainEngineType = sr.MainEngineType, MainEnginePowerKw = sr.MainEnginePowerKw,
        MainEngineMaker = sr.MainEngineMaker, BoilerType = sr.BoilerType,
        HasExhaustGasScrubber = sr.HasExhaustGasScrubber, Ecdis = sr.Ecdis,
        RankAtTime = sr.RankAtTime, BoardingDate = sr.BoardingDate,
        DisembarkDate = sr.DisembarkDate, BoardingPortCode = sr.BoardingPortCode,
        BoardingPortName = sr.BoardingPortName, DisembarkPortCode = sr.DisembarkPortCode,
        DisembarkPortName = sr.DisembarkPortName, Notes = sr.Notes,
        IsSynced = sr.IsSynced, CreatedAt = sr.CreatedAt, UpdatedAt = sr.UpdatedAt
    };
}
