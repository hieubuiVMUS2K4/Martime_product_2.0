using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using AutoMapper;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
// Crew DTOs are now globally available via shared library re-exports
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace MaritimeEdge.Controllers.Crew;

[ApiController]
[Route("api/crew")]
public class CrewController : ControllerBase
{
    private readonly EdgeDbContext _context;
    private readonly ILogger<CrewController> _logger;
    private readonly IMapper _mapper;

    public CrewController(EdgeDbContext context, ILogger<CrewController> logger, IMapper mapper)
    {
        _context = context;
        _logger = logger;
        _mapper = mapper;
    }

    [HttpGet]
    public async Task<IActionResult> GetAllCrew(
        [FromQuery] int page = 1, 
        [FromQuery] int pageSize = 50,
        [FromQuery] string? search = null,
        [FromQuery] bool? isOnboard = null)
    {
        try
        {
            // Validate pagination parameters
            if (page < 1) page = 1;
            if (pageSize < 1) pageSize = 50;
            if (pageSize > 100) pageSize = 100; // Max 100 items per page

            var query = _context.CrewMembers
                .AsNoTracking()
                .Include(c => c.Rank)
                .Include(c => c.Country)
                .AsQueryable();

            // Apply filters
            if (!string.IsNullOrWhiteSpace(search))
            {
                query = query.Where(c => 
                    c.FullName.Contains(search) || 
                    c.CrewId.Contains(search) ||
                    (c.Rank != null && (c.Rank.RankName.Contains(search) || c.Rank.RankCode.Contains(search))));
            }

            if (isOnboard.HasValue)
            {
                query = query.Where(c => c.IsOnboard == isOnboard.Value);
            }

            // Get total count
            var totalCount = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

            // Get paginated data - use DTO projection to avoid over-fetching
            var crew = await query
                .OrderBy(c => c.FullName)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var crewDtos = crew.Select(c => _mapper.Map<CrewMemberDto>(c)).ToList();

            return Ok(new
            {
                data = crewDtos,
                pagination = new
                {
                    currentPage = page,
                    pageSize = pageSize,
                    totalCount = totalCount,
                    totalPages = totalPages,
                    hasNextPage = page < totalPages,
                    hasPreviousPage = page > 1
                }
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting all crew");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("onboard")]
    public async Task<IActionResult> GetOnboardCrew()
    {
        try
        {
            var crew = await _context.CrewMembers
                .AsNoTracking()
                .Include(c => c.Rank)
                .Include(c => c.Country)
                .Where(c => c.IsOnboard)
                .OrderBy(c => c.FullName)
                .ToListAsync();

            var crewDtos = crew.Select(c => _mapper.Map<CrewMemberDto>(c)).ToList();
            return Ok(crewDtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting onboard crew");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetCrewById(Guid id)
    {
        try
        {
            var crew = await _context.CrewMembers
                .AsNoTracking()
                .Include(c => c.Rank)
                .Include(c => c.Country)
                .FirstOrDefaultAsync(c => c.Id == id);
            if (crew == null)
            {
                return NotFound(new { message = "Crew member not found" });
            }

            var dto = _mapper.Map<CrewDetailDto>(crew);

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
            {
                dto.SeamanBookNumber = seamanBook.DocumentNumber;
            }

            return Ok(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting crew member");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("{id}/service-records")]
    public async Task<IActionResult> GetServiceRecords(Guid id)
    {
        try
        {
            var crewExists = await _context.CrewMembers
                .AsNoTracking()
                .AnyAsync(c => c.Id == id);

            if (!crewExists)
                return NotFound(new { message = "Crew member not found" });

            var records = await _context.ServiceRecords
                .AsNoTracking()
                .Where(r => r.CrewMemberId == id)
                .OrderByDescending(r => r.BoardingDate)
                .ToListAsync();

            var response = records.Select(r => new
            {
                id = r.Id,
                crewMemberId = r.CrewMemberId,
                vesselName = r.VesselName,
                vesselFlag = r.VesselFlag,
                vesselType = r.VesselType,
                vesselGrt = r.VesselGrt,
                vesselDwt = r.VesselDwt,
                vesselYearBuilt = r.VesselYearBuilt,
                tradeArea = r.TradeArea,
                mainEngineType = r.MainEngineType,
                mainEnginePowerKw = r.MainEnginePowerKw,
                mainEngineMaker = r.MainEngineMaker,
                boilerType = r.BoilerType,
                hasExhaustGasScrubber = r.HasExhaustGasScrubber,
                ecdis = r.Ecdis,
                rankAtTime = r.RankAtTime,
                boardingDate = r.BoardingDate,
                disembarkDate = r.DisembarkDate,
                boardingPort = r.BoardingPortName ?? r.BoardingPortCode,
                disembarkPort = r.DisembarkPortName ?? r.DisembarkPortCode,
                totalServiceDays = r.DisembarkDate.HasValue
                    ? Math.Max(1, (int)Math.Ceiling((r.DisembarkDate.Value.Date - r.BoardingDate.Date).TotalDays))
                    : (int?)null,
                isSynced = r.IsSynced,
                createdAt = r.CreatedAt,
                updatedAt = r.UpdatedAt,
                originNode = r.OriginNode,
            });

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting service records for crew {CrewId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("me")]
    public async Task<IActionResult> GetMyProfile([FromQuery] string? crewId = null)
    {
        try
        {
            // Try to extract crewId from Authorization header token
            string? userCrewId = crewId;
            
            if (string.IsNullOrWhiteSpace(userCrewId) && Request.Headers.ContainsKey("Authorization"))
            {
                // Extract token from "Bearer {token}"
                var authHeader = Request.Headers["Authorization"].ToString();
                if (authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    var token = authHeader.Substring("Bearer ".Length).Trim();
                    
                    // Token format: access_{userId}_{crewId}_{timestamp}_{random}
                    var parts = token.Split('_');
                    if (parts.Length >= 3)
                    {
                        userCrewId = parts[2]; // crewId is at index 2
                        _logger.LogInformation("Extracted crew ID from token: {CrewId}", userCrewId);
                    }
                    else
                    {
                        _logger.LogWarning("Token format invalid, expected at least 3 parts but got {Count}", parts.Length);
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(userCrewId))
            {
                // Return error instead of fallback
                _logger.LogWarning("No crew ID found in request or token");
                return BadRequest(new { error = "Crew ID not found. Please provide crewId parameter or valid authorization token." });
            }

            var crew = await _context.CrewMembers
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.CrewId == userCrewId);

            if (crew == null)
            {
                _logger.LogWarning("Crew member not found for ID: {CrewId}", userCrewId);
                return NotFound(new { error = "Crew member not found", crewId = userCrewId });
            }

            _logger.LogInformation("Profile retrieved for: {CrewId} - {FullName}", crew.CrewId, crew.FullName);
            return Ok(crew);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting crew profile");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("me/certificates")]
    public async Task<IActionResult> GetMyCertificates([FromQuery] string? crewId = null)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(crewId))
            {
                return BadRequest(new { error = "Crew ID is required" });
            }

            var crew = await _context.CrewMembers
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.CrewId == crewId);

            if (crew == null)
            {
                return NotFound(new { message = "Crew member not found" });
            }

            // TODO: Update to use new certificate system (certificates and crew_certificates tables)
            var certificates = new List<object>();

            // Old certificate fields removed - need to query crew_certificates table instead
            // if (!string.IsNullOrWhiteSpace(crew.CertificateNumber))
            // {
            //     certificates.Add(new
            //     {
            //         type = "STCW",
            //         number = crew.CertificateNumber,
            //         issueDate = crew.CertificateIssue,
            //         expiryDate = crew.CertificateExpiry,
            //         status = GetCertificateStatus(crew.CertificateExpiry)
            //     });
            // }

            // if (crew.MedicalExpiry.HasValue)
            // {
            //     certificates.Add(new
            //     {
            //         type = "Medical",
            //         number = "Medical Certificate",
            //         issueDate = crew.MedicalIssue,
            //         expiryDate = crew.MedicalExpiry,
            //         status = GetCertificateStatus(crew.MedicalExpiry)
            //     });
            // }

            // Document fields removed - will be managed in separate documents table
            // if (!string.IsNullOrWhiteSpace(crew.PassportNumber))
            // {
            //     certificates.Add(new
            //     {
            //         type = "Passport",
            //         number = crew.PassportNumber,
            //         issueDate = (DateTime?)null,
            //         expiryDate = crew.PassportExpiry,
            //         status = GetCertificateStatus(crew.PassportExpiry)
            //     });
            // }

            // if (!string.IsNullOrWhiteSpace(crew.VisaNumber))
            // {
            //     certificates.Add(new
            //     {
            //         type = "Visa",
            //         number = crew.VisaNumber,
            //         issueDate = (DateTime?)null,
            //         expiryDate = crew.VisaExpiry,
            //         status = GetCertificateStatus(crew.VisaExpiry)
            //     });
            // }

            return Ok(certificates);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting certificates");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    private string GetCertificateStatus(DateTime? expiryDate)
    {
        if (!expiryDate.HasValue) return "unknown";
        
        var now = DateTime.UtcNow;
        var daysUntilExpiry = (expiryDate.Value - now).TotalDays;

        if (daysUntilExpiry < 0) return "expired";
        if (daysUntilExpiry < 30) return "expiring_soon";
        return "valid";
    }

    [HttpPost]
    public async Task<IActionResult> AddCrew([FromBody] CrewMember crew)
    {
        try
        {
            // Validation
            if (string.IsNullOrWhiteSpace(crew.CrewId))
            {
                return BadRequest(new { error = "Crew ID is required" });
            }
            
            if (string.IsNullOrWhiteSpace(crew.FullName))
            {
                return BadRequest(new { error = "Full name is required" });
            }
            
            if (!crew.RankId.HasValue)
            {
                return BadRequest(new { error = "Rank is required" });
            }

            // Check duplicate Crew ID
            var existingCrew = await _context.CrewMembers
                .FirstOrDefaultAsync(c => c.CrewId == crew.CrewId);
            
            if (existingCrew != null)
            {
                return Conflict(new { error = $"Crew ID '{crew.CrewId}' already exists" });
            }

            // Normalize all DateTime fields to UTC
            crew.CreatedAt = DateTime.UtcNow;
            crew.UpdatedAt = DateTime.UtcNow;
            crew.IsSynced = false;
            
            // Normalize nullable DateTime fields
            if (crew.DateOfBirth.HasValue)
                crew.DateOfBirth = DateTime.SpecifyKind(crew.DateOfBirth.Value, DateTimeKind.Utc);
            // Certificate fields removed - use crew_certificates table instead
            // if (crew.CertificateIssue.HasValue)
            //     crew.CertificateIssue = DateTime.SpecifyKind(crew.CertificateIssue.Value, DateTimeKind.Utc);
            // if (crew.CertificateExpiry.HasValue)
            //     crew.CertificateExpiry = DateTime.SpecifyKind(crew.CertificateExpiry.Value, DateTimeKind.Utc);
            // if (crew.MedicalIssue.HasValue)
            //     crew.MedicalIssue = DateTime.SpecifyKind(crew.MedicalIssue.Value, DateTimeKind.Utc);
            // if (crew.MedicalExpiry.HasValue)
            //     crew.MedicalExpiry = DateTime.SpecifyKind(crew.MedicalExpiry.Value, DateTimeKind.Utc);
            // Document fields removed
            // if (crew.PassportExpiry.HasValue)
            //     crew.PassportExpiry = DateTime.SpecifyKind(crew.PassportExpiry.Value, DateTimeKind.Utc);
            // if (crew.VisaExpiry.HasValue)
            //     crew.VisaExpiry = DateTime.SpecifyKind(crew.VisaExpiry.Value, DateTimeKind.Utc);
            if (crew.JoinDate.HasValue)
                crew.JoinDate = DateTime.SpecifyKind(crew.JoinDate.Value, DateTimeKind.Utc);
            if (crew.EmbarkDate.HasValue)
                crew.EmbarkDate = DateTime.SpecifyKind(crew.EmbarkDate.Value, DateTimeKind.Utc);
            if (crew.DisembarkDate.HasValue)
                crew.DisembarkDate = DateTime.SpecifyKind(crew.DisembarkDate.Value, DateTimeKind.Utc);
            if (crew.ContractEnd.HasValue)
                crew.ContractEnd = DateTime.SpecifyKind(crew.ContractEnd.Value, DateTimeKind.Utc);
            
            _context.CrewMembers.Add(crew);
            await _context.SaveChangesAsync();

            // Auto-create User for this crew member
            await CreateUserForCrewMemberAsync(crew);

            _logger.LogInformation("Created new crew member: {CrewId} - {FullName}", crew.CrewId, crew.FullName);

            return CreatedAtAction(nameof(GetCrewById), new { id = crew.Id }, crew);
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "Database error adding crew member");
            return StatusCode(500, new { error = "Database error" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding crew member");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Auto-create User account for a crew member
    /// </summary>
    private async Task CreateUserForCrewMemberAsync(CrewMember crew)
    {
        // Let failures reach the caller instead of reporting successful provisioning.
        var created = await MaritimeEdge.Services.Core.CrewAccountProvisioning.EnsureAccountAsync(_context, crew);
        if (created)
            _logger.LogInformation("Auto-created CREW account for {CrewId}", crew.CrewId);
    }

    /// <summary>
    /// Hash password using SHA256
    /// </summary>
    private static string HashPassword(string password)
    {
        using var sha256 = SHA256.Create();
        var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
        return Convert.ToBase64String(hashedBytes);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateCrew(Guid id, [FromBody] CrewMember crew)
    {
        try
        {
            var existing = await _context.CrewMembers.FindAsync(id);
            if (existing == null)
            {
                return NotFound(new { error = "Crew member not found", id });
            }

            // Validation
            if (string.IsNullOrWhiteSpace(crew.FullName))
            {
                return BadRequest(new { error = "Full name is required" });
            }
            
            if (!crew.RankId.HasValue)
            {
                return BadRequest(new { error = "Rank is required" });
            }

            // Check duplicate Crew ID (if changed)
            if (!string.IsNullOrWhiteSpace(crew.CrewId) && crew.CrewId != existing.CrewId)
            {
                var duplicate = await _context.CrewMembers
                    .FirstOrDefaultAsync(c => c.CrewId == crew.CrewId && c.Id != id);
                
                if (duplicate != null)
                {
                    return Conflict(new { error = $"Crew ID '{crew.CrewId}' already exists" });
                }
                existing.CrewId = crew.CrewId;
            }

            // Track changes BEFORE overwriting — compare old existing vs incoming crew
            var changes = new List<object>();
            var now = DateTime.UtcNow.ToString("o");
            void TrackStr(string field, string? oldVal, string? newVal)
            {
                if (newVal != null && oldVal != newVal)
                    changes.Add(new { field, oldValue = oldVal ?? "", newValue = newVal, changedAt = now });
            }
            void TrackDate(string field, DateTime? oldVal, DateTime? newVal)
            {
                if (newVal.HasValue && oldVal != newVal)
                    changes.Add(new { field, oldValue = oldVal?.ToString("o") ?? "", newValue = newVal.Value.ToString("o"), changedAt = now });
            }
            void TrackNum(string field, decimal? oldVal, decimal? newVal)
            {
                if (newVal.HasValue && oldVal != newVal)
                    changes.Add(new { field, oldValue = oldVal?.ToString() ?? "", newValue = newVal.Value.ToString(), changedAt = now });
            }
            void TrackInt(string field, int? oldVal, int? newVal)
            {
                if (newVal.HasValue && oldVal != newVal)
                    changes.Add(new { field, oldValue = oldVal?.ToString() ?? "", newValue = newVal.Value.ToString(), changedAt = now });
            }

            // Personal info
            TrackStr("fullName", existing.FullName, crew.FullName);
            TrackStr("phoneNumber", existing.PhoneNumber, crew.PhoneNumber);
            TrackStr("emailAddress", existing.EmailAddress, crew.EmailAddress);
            TrackStr("department", existing.Department, crew.Department);
            TrackStr("address", existing.Address, crew.Address);
            TrackStr("placeOfBirth", existing.PlaceOfBirth, crew.PlaceOfBirth);
            TrackStr("idCardNumber", existing.IdCardNumber, crew.IdCardNumber);
            TrackStr("maritalStatus", existing.MaritalStatus, crew.MaritalStatus);
            TrackStr("notes", existing.Notes, crew.Notes);
            TrackDate("dateOfBirth", existing.DateOfBirth, crew.DateOfBirth);
            if (crew.RankId.HasValue && existing.RankId != crew.RankId)
                changes.Add(new { field = "rankId", oldValue = existing.RankId?.ToString() ?? "", newValue = crew.RankId.Value.ToString(), changedAt = now });
            if (crew.CountryId.HasValue && existing.CountryId != crew.CountryId)
                changes.Add(new { field = "countryId", oldValue = existing.CountryId?.ToString() ?? "", newValue = crew.CountryId.Value.ToString(), changedAt = now });

            // Physical details
            TrackNum("height", existing.Height, crew.Height);
            TrackNum("weight", existing.Weight, crew.Weight);
            TrackStr("bloodGroup", existing.BloodGroup, crew.BloodGroup);
            TrackStr("clothingSize", existing.ClothingSize, crew.ClothingSize);
            TrackStr("shoeSize", existing.ShoeSize, crew.ShoeSize);
            TrackStr("cateringSize", existing.CateringSize, crew.CateringSize);
            if (crew.IsSmoker.HasValue && existing.IsSmoker != crew.IsSmoker)
                changes.Add(new { field = "isSmoker", oldValue = existing.IsSmoker?.ToString() ?? "", newValue = crew.IsSmoker.Value.ToString(), changedAt = now });
            if (crew.IsCovidVaccinated.HasValue && existing.IsCovidVaccinated != crew.IsCovidVaccinated)
                changes.Add(new { field = "isCovidVaccinated", oldValue = existing.IsCovidVaccinated?.ToString() ?? "", newValue = crew.IsCovidVaccinated.Value.ToString(), changedAt = now });

            // Employment dates
            TrackDate("joinDate", existing.JoinDate, crew.JoinDate);
            TrackDate("embarkDate", existing.EmbarkDate, crew.EmbarkDate);
            TrackDate("disembarkDate", existing.DisembarkDate, crew.DisembarkDate);
            TrackDate("contractEnd", existing.ContractEnd, crew.ContractEnd);
            // IsOnboard is NOT tracked here — managed by dedicated onboard/disembark endpoints

            // Next of kin
            TrackStr("nextOfKinName", existing.NextOfKinName, crew.NextOfKinName);
            TrackStr("nextOfKinRelation", existing.NextOfKinRelation, crew.NextOfKinRelation);
            TrackStr("nextOfKinPhone", existing.NextOfKinPhone, crew.NextOfKinPhone);
            TrackStr("nextOfKinAddress", existing.NextOfKinAddress, crew.NextOfKinAddress);

            // Education
            TrackStr("educationInstitution", existing.EducationInstitution, crew.EducationInstitution);
            TrackStr("educationCourse", existing.EducationCourse, crew.EducationCourse);
            TrackInt("educationPeriodYears", existing.EducationPeriodYears, crew.EducationPeriodYears);
            TrackInt("educationGraduationYear", existing.EducationGraduationYear, crew.EducationGraduationYear);

            // NOW apply updates
            existing.FullName = crew.FullName;
            existing.RankId = crew.RankId;
            if (crew.CountryId.HasValue) existing.CountryId = crew.CountryId;
            if (crew.DateOfBirth.HasValue) existing.DateOfBirth = crew.DateOfBirth;
            if (crew.JoinDate.HasValue) existing.JoinDate = crew.JoinDate;
            if (crew.EmbarkDate.HasValue) existing.EmbarkDate = crew.EmbarkDate;
            if (crew.ContractEnd.HasValue) existing.ContractEnd = crew.ContractEnd;
            if (crew.DisembarkDate.HasValue) existing.DisembarkDate = crew.DisembarkDate;
            // IsOnboard is NOT updated here — managed by dedicated onboard/disembark endpoints
            if (crew.EmergencyContact != null) existing.EmergencyContact = crew.EmergencyContact;
            if (crew.EmailAddress != null) existing.EmailAddress = crew.EmailAddress;
            if (crew.PhoneNumber != null) existing.PhoneNumber = crew.PhoneNumber;
            if (crew.Address != null) existing.Address = crew.Address;
            if (crew.Department != null) existing.Department = crew.Department;
            if (crew.Notes != null) existing.Notes = crew.Notes;
            if (crew.PhotoUrl != null) existing.PhotoUrl = crew.PhotoUrl;
            if (crew.PlaceOfBirth != null) existing.PlaceOfBirth = crew.PlaceOfBirth;
            if (crew.IdCardNumber != null) existing.IdCardNumber = crew.IdCardNumber;
            if (crew.MaritalStatus != null) existing.MaritalStatus = crew.MaritalStatus;
            if (crew.Height.HasValue) existing.Height = crew.Height;
            if (crew.Weight.HasValue) existing.Weight = crew.Weight;
            if (crew.BloodGroup != null) existing.BloodGroup = crew.BloodGroup;
            if (crew.ClothingSize != null) existing.ClothingSize = crew.ClothingSize;
            if (crew.ShoeSize != null) existing.ShoeSize = crew.ShoeSize;
            if (crew.CateringSize != null) existing.CateringSize = crew.CateringSize;
            if (crew.IsSmoker.HasValue) existing.IsSmoker = crew.IsSmoker;
            if (crew.IsCovidVaccinated.HasValue) existing.IsCovidVaccinated = crew.IsCovidVaccinated;
            if (crew.NextOfKinName != null) existing.NextOfKinName = crew.NextOfKinName;
            if (crew.NextOfKinRelation != null) existing.NextOfKinRelation = crew.NextOfKinRelation;
            if (crew.NextOfKinPhone != null) existing.NextOfKinPhone = crew.NextOfKinPhone;
            if (crew.NextOfKinAddress != null) existing.NextOfKinAddress = crew.NextOfKinAddress;
            if (crew.EducationInstitution != null) existing.EducationInstitution = crew.EducationInstitution;
            if (crew.EducationCourse != null) existing.EducationCourse = crew.EducationCourse;
            if (crew.EducationPeriodYears.HasValue) existing.EducationPeriodYears = crew.EducationPeriodYears;
            if (crew.EducationGraduationYear.HasValue) existing.EducationGraduationYear = crew.EducationGraduationYear;

            // Persist edge changes — REPLACE (not accumulate) with only the latest batch of changes.
            // Accumulating leads to stale diffs piling up across multiple syncs.
            if (changes.Count > 0)
            {
                existing.EdgeChanges = System.Text.Json.JsonSerializer.Serialize(changes);
                existing.EdgeChangesViewed = false;
            }
            
            existing.IsSynced = false; // Mark as need sync
            existing.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            // Upsert seaman book number into SeafarerDocuments if provided
            if (!string.IsNullOrWhiteSpace(crew.SeamanBookNumber))
            {
                var existingSeamanBook = await _context.SeafarerDocuments
                    .Where(d => d.CrewMemberId == id && d.DocumentType == "seaman_book")
                    .FirstOrDefaultAsync();

                if (existingSeamanBook != null)
                {
                    existingSeamanBook.DocumentNumber = crew.SeamanBookNumber;
                    existingSeamanBook.UpdatedAt = DateTime.UtcNow;
                }
                else
                {
                    _context.SeafarerDocuments.Add(new SeafarerDocument
                    {
                        CrewMemberId = id,
                        DocumentType = "seaman_book",
                        DocumentNumber = crew.SeamanBookNumber,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    });
                }

                await _context.SaveChangesAsync();
            }

            // Enqueue crew_member update to SyncQueue so changes sync to Shore
            var syncPayload = System.Text.Json.JsonSerializer.Serialize(existing, new System.Text.Json.JsonSerializerOptions
            {
                WriteIndented = false,
                DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
                ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles
            });
            _context.SyncQueue.Add(new SyncQueue
            {
                TableName = "crew_member",
                RecordKey = id.ToString(),
                ActionType = SyncActionType.UPDATE,
                Payload = syncPayload,
                Priority = SyncPriority.Operational,
                CreatedAt = DateTime.UtcNow,
                RetryCount = 0,
                MaxRetries = 5
            });
            await _context.SaveChangesAsync();

            // Reload with Rank navigation property for complete response
            await _context.Entry(existing).Reference(c => c.Rank).LoadAsync();

            _logger.LogInformation("Updated crew member: {Id} - {FullName}", id, crew.FullName);

            return Ok(MapToCrewMemberDto(existing));
        }
        catch (DbUpdateConcurrencyException ex)
        {
            _logger.LogError(ex, "Concurrency error updating crew member {Id}", id);
            return Conflict(new { error = "The crew member was modified by another user. Please refresh and try again." });
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "Database error updating crew member {Id}", id);
            return StatusCode(500, new { error = "Database error" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating crew member {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteCrew(Guid id)
    {
        try
        {
            var crew = await _context.CrewMembers.FindAsync(id);
            if (crew == null)
            {
                return NotFound(new { error = "Crew member not found", id });
            }

            _context.CrewMembers.Remove(crew);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Deleted crew member: {Id} - {CrewId} - {FullName}", id, crew.CrewId, crew.FullName);

            return Ok(new { 
                message = "Crew member deleted successfully", 
                id,
                crewId = crew.CrewId,
                fullName = crew.FullName
            });
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "Database error deleting crew member {Id}", id);
            return StatusCode(500, new { error = "Database error" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting crew member {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// PUT /api/crew/{id}/avatar - Upload avatar photo for crew member
    /// </summary>
    [HttpPut("{id}/avatar")]
    public async Task<IActionResult> UploadCrewAvatar(Guid id, [FromForm] IFormFile file)
    {
        try
        {
            if (file == null || file.Length == 0)
            {
                return BadRequest(new { error = "File is required" });
            }

            // Validate file type
            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif" };
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!allowedExtensions.Contains(extension))
            {
                return BadRequest(new { error = "Only image files (jpg, jpeg, png, gif) are allowed" });
            }

            // Validate file size (max 5MB)
            if (file.Length > 5 * 1024 * 1024)
            {
                return BadRequest(new { error = "File size must not exceed 5MB" });
            }

            var crewMember = await _context.CrewMembers.FindAsync(id);
            if (crewMember == null)
            {
                return NotFound(new { error = "Crew member not found", id });
            }

            // Save file to uploads/crew/avatars folder
            var uploadsRoot = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "crew", "avatars");
            Directory.CreateDirectory(uploadsRoot);

            var fileName = $"{id}{extension}";
            var filePath = Path.Combine(uploadsRoot, fileName);

            // Delete old file if exists
            if (!string.IsNullOrEmpty(crewMember.PhotoUrl))
            {
                var oldFilePath = Path.Combine(Directory.GetCurrentDirectory(), crewMember.PhotoUrl.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
                if (System.IO.File.Exists(oldFilePath))
                {
                    System.IO.File.Delete(oldFilePath);
                }
            }

            // Save new file
            await using var stream = new FileStream(filePath, FileMode.Create);
            await file.CopyToAsync(stream);

            // Update database
            crewMember.PhotoUrl = $"/uploads/crew/avatars/{fileName}";
            crewMember.UpdatedAt = DateTime.UtcNow;
            crewMember.IsSynced = false;
            await _context.SaveChangesAsync();

            // Enqueue crew_member update to SyncQueue so avatar syncs to Shore
            var syncPayload = System.Text.Json.JsonSerializer.Serialize(crewMember, new System.Text.Json.JsonSerializerOptions
            {
                WriteIndented = false,
                DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
                ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles
            });
            _context.SyncQueue.Add(new SyncQueue
            {
                TableName = "crew_member",
                RecordKey = id.ToString(),
                ActionType = SyncActionType.UPDATE,
                Payload = syncPayload,
                Priority = SyncPriority.Operational,
                CreatedAt = DateTime.UtcNow,
                RetryCount = 0,
                MaxRetries = 5
            });
            await _context.SaveChangesAsync();

            _logger.LogInformation("Uploaded avatar for crew member: {Id} - {FullName}, enqueued sync", id, crewMember.FullName);

            return Ok(new { 
                message = "Avatar uploaded successfully", 
                photoUrl = crewMember.PhotoUrl,
                crewMember
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading avatar for crew member {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    // TODO: Update to use new certificate system
    // [HttpGet("expiring-certificates")]
    // public async Task<IActionResult> GetExpiringCertificates([FromQuery] int days = 90)
    // {
    //     try
    //     {
    //         var expiryDate = DateTime.UtcNow.AddDays(days);
    //         var crew = await _context.CrewMembers
    //             .AsNoTracking()
    //             .Where(c => c.IsOnboard && 
    //                        (c.CertificateExpiry <= expiryDate || c.MedicalExpiry <= expiryDate))
    //             .ToListAsync();

    //         return Ok(crew);
    //     }
    //     catch (Exception ex)
    //     {
    //         _logger.LogError(ex, "Error getting expiring certificates");
    //         return StatusCode(500, new { error = "Internal server error" });
    //     }
    // }

    /// <summary>
    /// Sync users for all existing crew members that don't have accounts
    /// POST /api/crew/sync-users
    /// </summary>
    [HttpPost("sync-users")]
    public async Task<IActionResult> SyncUsersForAllCrew()
    {
        try
        {
            // Get all crew members
            var allCrew = await _context.CrewMembers.ToListAsync();
            
            // Get existing usernames
            var existingUsernames = await _context.Users
                .Select(u => u.Username)
                .ToListAsync();

            var created = 0;
            var skipped = 0;
            var errors = new List<string>();

            foreach (var crew in allCrew)
            {
                // Skip if user already exists
                if (existingUsernames.Contains(crew.CrewId))
                {
                    skipped++;
                    continue;
                }

                try
                {
                    await CreateUserForCrewMemberAsync(crew);
                    created++;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error syncing user for crew {CrewId}", crew.CrewId);
                    errors.Add($"{crew.CrewId}: Failed to create user");
                }
            }

            _logger.LogInformation("Sync users completed: Created={Created}, Skipped={Skipped}, Errors={ErrorCount}", 
                created, skipped, errors.Count);

            return Ok(new
            {
                message = "Sync completed",
                totalCrew = allCrew.Count,
                created,
                skipped,
                errorCount = errors.Count,
                errors = errors.Take(10) // Return first 10 errors
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error syncing users for crew");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get crew members without user accounts
    /// GET /api/crew/without-users
    /// </summary>
    [HttpGet("without-users")]
    public async Task<IActionResult> GetCrewWithoutUsers()
    {
        try
        {
            var existingUserCrewIds = await _context.Users
                .Where(u => u.CrewId != null)
                .Select(u => u.CrewId!)
                .ToListAsync();

            var crewWithoutUsers = await _context.CrewMembers
                .AsNoTracking()
                .Where(c => !existingUserCrewIds.Contains(c.CrewId))
                .Include(c => c.Rank)
                .Select(c => new
                {
                    c.Id,
                    c.CrewId,
                    c.FullName,
                    RankName = c.Rank != null ? c.Rank.RankName : null,
                    c.Department,
                    c.IsOnboard,
                    HasDateOfBirth = c.DateOfBirth != null
                })
                .ToListAsync();

            return Ok(new
            {
                count = crewWithoutUsers.Count,
                data = crewWithoutUsers
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting crew without users");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Create identity document (travel / seafarer / employment) for a crew member
    /// POST /api/crew/{id}/identity-documents
    /// </summary>
    [HttpPost("{id}/identity-documents")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> CreateIdentityDocument(Guid id, [FromForm] CreateIdentityDocumentDto dto)
    {
        try
        {
            var crewMember = await _context.CrewMembers.FirstOrDefaultAsync(c => c.Id == id);
            if (crewMember == null)
            {
                return NotFound(new { message = "Crew member not found" });
            }

            if (string.IsNullOrWhiteSpace(dto.TargetTable))
            {
                return BadRequest(new { error = "targetTable is required" });
            }

            if (string.IsNullOrWhiteSpace(dto.DocumentType))
            {
                return BadRequest(new { error = "documentType is required" });
            }

            if (string.IsNullOrWhiteSpace(dto.DocumentNumber))
            {
                return BadRequest(new { error = "documentNumber is required" });
            }

            var normalizedTarget = dto.TargetTable.Trim().ToLowerInvariant();
            
            string? fileUrl = null;
            if (dto.File != null && dto.File.Length > 0)
            {
                fileUrl = await SaveIdentityDocumentFileAsync(id, dto.DocumentType, dto.File, normalizedTarget);
            }
            switch (normalizedTarget)
            {
                case "travel_documents":
                {
                    var entity = new TravelDocument
                    {
                        CrewMember = crewMember,
                        DocumentType = dto.DocumentType.Trim(),
                        DocumentNumber = dto.DocumentNumber.Trim(),
                        IssueDate = dto.IssueDate,
                        ExpiryDate = dto.ExpiryDate,
                        CountryId = dto.CountryId,
                        Notes = dto.Notes,
                        FileUrl = fileUrl,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };

                    _context.TravelDocuments.Add(entity);
                    await _context.SaveChangesAsync();
                    await EnqueueIdentityDocumentSyncAsync("travel_document", entity.Id.ToString(), SyncActionType.CREATE, entity);
                    return Ok(entity);
                }

                case "seafarer_documents":
                {
                    var entity = new SeafarerDocument
                    {
                        CrewMember = crewMember,
                        DocumentType = dto.DocumentType.Trim(),
                        DocumentNumber = dto.DocumentNumber.Trim(),
                        IssueDate = dto.IssueDate,
                        ExpiryDate = dto.ExpiryDate,
                        CountryId = dto.CountryId,
                        Notes = dto.Notes,
                        FileUrl = fileUrl,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };

                    _context.SeafarerDocuments.Add(entity);
                    await _context.SaveChangesAsync();
                    await EnqueueIdentityDocumentSyncAsync("seafarer_document", entity.Id.ToString(), SyncActionType.CREATE, entity);
                    return Ok(entity);
                }

                case "employment_documents":
                {
                    var entity = new EmploymentDocument
                    {
                        CrewMember = crewMember,
                        DocumentType = dto.DocumentType.Trim(),
                        DocumentNumber = dto.DocumentNumber.Trim(),
                        IssueDate = dto.IssueDate,
                        ExpiryDate = dto.ExpiryDate,
                        CountryId = dto.CountryId,
                        Notes = dto.Notes,
                        FileUrl = fileUrl,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };

                    _context.EmploymentDocuments.Add(entity);
                    await _context.SaveChangesAsync();
                    await EnqueueIdentityDocumentSyncAsync("employment_document", entity.Id.ToString(), SyncActionType.CREATE, entity);
                    return Ok(entity);
                }

                case "health_documents":
                {
                    var entity = new HealthDocument
                    {
                        CrewMember = crewMember,
                        DocumentType = dto.DocumentType.Trim(),
                        DocumentNumber = dto.DocumentNumber.Trim(),
                        IssueDate = dto.IssueDate,
                        ExpiryDate = dto.ExpiryDate,
                        Notes = dto.Notes,
                        FileUrl = fileUrl,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };

                    _context.HealthDocuments.Add(entity);
                    await _context.SaveChangesAsync();
                    await EnqueueIdentityDocumentSyncAsync("health_document", entity.Id.ToString(), SyncActionType.CREATE, entity);
                    return Ok(entity);
                }

                default:
                    return BadRequest(new { error = "targetTable must be one of: travel_documents, seafarer_documents, employment_documents, health_documents" });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating identity document for crew {CrewId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Cập nhật THÔNG TIN một tài liệu đã có (không đụng tới file đính kèm — file có
    /// endpoint riêng ở .../file ngay bên dưới).
    /// PUT /api/crew/identity-documents/{documentId}
    /// Khoa theo documentId nhu endpoint sua chung chi va endpoint upload file tai lieu.
    /// </summary>
    [HttpPut("identity-documents/{documentId}")]
    public async Task<IActionResult> UpdateIdentityDocument(Guid documentId, [FromBody] CreateIdentityDocumentDto dto)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(dto.TargetTable))
                return BadRequest(new { error = "targetTable is required" });
            if (string.IsNullOrWhiteSpace(dto.DocumentType))
                return BadRequest(new { error = "documentType is required" });
            if (string.IsNullOrWhiteSpace(dto.DocumentNumber))
                return BadRequest(new { error = "documentNumber is required" });

            var now = DateTime.UtcNow;

            switch (dto.TargetTable.Trim().ToLowerInvariant())
            {
                case "travel_documents":
                {
                    var e = await _context.TravelDocuments.FirstOrDefaultAsync(d => d.Id == documentId);
                    if (e == null) return NotFound(new { error = "Document not found" });
                    e.DocumentType = dto.DocumentType.Trim();
                    e.DocumentNumber = dto.DocumentNumber.Trim();
                    e.IssueDate = dto.IssueDate; e.ExpiryDate = dto.ExpiryDate;
                    e.CountryId = dto.CountryId; e.Notes = dto.Notes; e.UpdatedAt = now;
                    await _context.SaveChangesAsync();
                    await EnqueueIdentityDocumentSyncAsync("travel_document", e.Id.ToString(), SyncActionType.UPDATE, e);
                    return Ok(e);
                }

                case "seafarer_documents":
                {
                    var e = await _context.SeafarerDocuments.FirstOrDefaultAsync(d => d.Id == documentId);
                    if (e == null) return NotFound(new { error = "Document not found" });
                    e.DocumentType = dto.DocumentType.Trim();
                    e.DocumentNumber = dto.DocumentNumber.Trim();
                    e.IssueDate = dto.IssueDate; e.ExpiryDate = dto.ExpiryDate;
                    e.CountryId = dto.CountryId; e.Notes = dto.Notes; e.UpdatedAt = now;
                    await _context.SaveChangesAsync();
                    await EnqueueIdentityDocumentSyncAsync("seafarer_document", e.Id.ToString(), SyncActionType.UPDATE, e);
                    return Ok(e);
                }

                case "employment_documents":
                {
                    var e = await _context.EmploymentDocuments.FirstOrDefaultAsync(d => d.Id == documentId);
                    if (e == null) return NotFound(new { error = "Document not found" });
                    e.DocumentType = dto.DocumentType.Trim();
                    e.DocumentNumber = dto.DocumentNumber.Trim();
                    e.IssueDate = dto.IssueDate; e.ExpiryDate = dto.ExpiryDate;
                    e.CountryId = dto.CountryId; e.Notes = dto.Notes; e.UpdatedAt = now;
                    await _context.SaveChangesAsync();
                    await EnqueueIdentityDocumentSyncAsync("employment_document", e.Id.ToString(), SyncActionType.UPDATE, e);
                    return Ok(e);
                }

                case "health_documents":
                {
                    // HealthDocument không có CountryId — bỏ qua trường này thay vì cố gán.
                    var e = await _context.HealthDocuments.FirstOrDefaultAsync(d => d.Id == documentId);
                    if (e == null) return NotFound(new { error = "Document not found" });
                    e.DocumentType = dto.DocumentType.Trim();
                    e.DocumentNumber = dto.DocumentNumber.Trim();
                    e.IssueDate = dto.IssueDate; e.ExpiryDate = dto.ExpiryDate;
                    e.Notes = dto.Notes; e.UpdatedAt = now;
                    await _context.SaveChangesAsync();
                    await EnqueueIdentityDocumentSyncAsync("health_document", e.Id.ToString(), SyncActionType.UPDATE, e);
                    return Ok(e);
                }

                default:
                    return BadRequest(new { error = "targetTable must be one of: travel_documents, seafarer_documents, employment_documents, health_documents" });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating identity document {DocId}", documentId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Update file for an existing identity document
    /// PUT /api/crew/identity-documents/{documentId}/file
    /// </summary>
    [HttpPut("identity-documents/{documentId}/file")]
    public async Task<IActionResult> UpdateIdentityDocumentFile(Guid documentId, [FromForm] UpdateDocumentFileDto dto)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(dto.TargetTable))
            {
                return BadRequest(new { error = "targetTable is required" });
            }

            if (dto.File == null || dto.File.Length == 0)
            {
                return BadRequest(new { error = "file is required" });
            }

            var normalizedTarget = dto.TargetTable.Trim().ToLowerInvariant();
            
            object? document = null;
            string? oldFileUrl = null;

            switch (normalizedTarget)
            {
                case "travel_documents":
                    {
                        var entity = await _context.TravelDocuments
                            .Include(d => d.CrewMember)
                            .FirstOrDefaultAsync(d => d.Id == documentId);
                        if (entity == null) return NotFound(new { error = "Document not found" });
                        
                        oldFileUrl = entity.FileUrl;
                        var fileUrl = await SaveIdentityDocumentFileAsync(entity.CrewMember.Id, entity.DocumentType, dto.File, normalizedTarget);
                        entity.FileUrl = fileUrl;
                        entity.UpdatedAt = DateTime.UtcNow;
                        document = entity;
                        break;
                    }

                case "seafarer_documents":
                    {
                        var entity = await _context.SeafarerDocuments
                            .Include(d => d.CrewMember)
                            .FirstOrDefaultAsync(d => d.Id == documentId);
                        if (entity == null) return NotFound(new { error = "Document not found" });
                        
                        oldFileUrl = entity.FileUrl;
                        var fileUrl = await SaveIdentityDocumentFileAsync(entity.CrewMember.Id, entity.DocumentType, dto.File, normalizedTarget);
                        entity.FileUrl = fileUrl;
                        entity.UpdatedAt = DateTime.UtcNow;
                        document = entity;
                        break;
                    }

                case "employment_documents":
                    {
                        var entity = await _context.EmploymentDocuments
                            .Include(d => d.CrewMember)
                            .FirstOrDefaultAsync(d => d.Id == documentId);
                        if (entity == null) return NotFound(new { error = "Document not found" });
                        
                        oldFileUrl = entity.FileUrl;
                        var fileUrl = await SaveIdentityDocumentFileAsync(entity.CrewMember.Id, entity.DocumentType, dto.File, normalizedTarget);
                        entity.FileUrl = fileUrl;
                        entity.UpdatedAt = DateTime.UtcNow;
                        document = entity;
                        break;
                    }

                case "health_documents":
                    {
                        var entity = await _context.HealthDocuments
                            .Include(d => d.CrewMember)
                            .FirstOrDefaultAsync(d => d.Id == documentId);
                        if (entity == null) return NotFound(new { error = "Document not found" });
                        
                        oldFileUrl = entity.FileUrl;
                        var fileUrl = await SaveIdentityDocumentFileAsync(entity.CrewMember.Id, entity.DocumentType, dto.File, normalizedTarget);
                        entity.FileUrl = fileUrl;
                        entity.UpdatedAt = DateTime.UtcNow;
                        document = entity;
                        break;
                    }

                default:
                    return BadRequest(new { error = "targetTable must be one of: travel_documents, seafarer_documents, employment_documents, health_documents" });
            }

            await _context.SaveChangesAsync();

            var syncTableName = normalizedTarget switch
            {
                "travel_documents" => "travel_document",
                "seafarer_documents" => "seafarer_document",
                "employment_documents" => "employment_document",
                "health_documents" => "health_document",
                _ => string.Empty
            };

            if (!string.IsNullOrWhiteSpace(syncTableName) && document != null)
            {
                await EnqueueIdentityDocumentSyncAsync(syncTableName, documentId.ToString(), SyncActionType.UPDATE, document);
            }

            // Delete old file if exists
            if (!string.IsNullOrWhiteSpace(oldFileUrl))
            {
                try
                {
                    var oldFilePath = Path.Combine(Directory.GetCurrentDirectory(), oldFileUrl.TrimStart('/').Replace("/", Path.DirectorySeparatorChar.ToString()));
                    if (System.IO.File.Exists(oldFilePath))
                    {
                        System.IO.File.Delete(oldFilePath);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to delete old file: {OldFileUrl}", oldFileUrl);
                }
            }

            return Ok(document);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating file for document {DocumentId}", documentId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get travel documents for a crew member
    /// GET /api/crew/{id}/travel-documents
    /// </summary>
    [HttpGet("{id}/travel-documents")]
    public async Task<IActionResult> GetTravelDocuments(Guid id)
    {
        try
        {
            var documents = await _context.TravelDocuments
                .AsNoTracking()
                .Where(d => d.CrewMember.Id == id)
                .Include(d => d.Country)
                .OrderBy(d => d.DocumentType)
                .ToListAsync();

            return Ok(documents);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting travel documents for crew {CrewId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get seafarer documents for a crew member
    /// GET /api/crew/{id}/seafarer-documents
    /// </summary>
    [HttpGet("{id}/seafarer-documents")]
    public async Task<IActionResult> GetSeafarerDocuments(Guid id)
    {
        try
        {
            var documents = await _context.SeafarerDocuments
                .AsNoTracking()
                .Where(d => d.CrewMember.Id == id)
                .Include(d => d.Country)
                .OrderBy(d => d.DocumentType)
                .ToListAsync();

            return Ok(documents);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting seafarer documents for crew {CrewId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get employment documents for a crew member
    /// GET /api/crew/{id}/employment-documents
    /// </summary>
    [HttpGet("{id}/employment-documents")]
    public async Task<IActionResult> GetEmploymentDocuments(Guid id)
    {
        try
        {
            var documents = await _context.EmploymentDocuments
                .AsNoTracking()
                .Where(d => d.CrewMember.Id == id)
                .Include(d => d.Country)
                .OrderBy(d => d.DocumentType)
                .ToListAsync();

            return Ok(documents);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting employment documents for crew {CrewId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get health documents for a crew member
    /// GET /api/crew/{id}/health-documents
    /// </summary>
    [HttpGet("{id}/health-documents")]
    public async Task<IActionResult> GetHealthDocuments(Guid id)
    {
        try
        {
            var documents = await _context.HealthDocuments
                .AsNoTracking()
                .Where(d => d.CrewMember.Id == id)
                .OrderBy(d => d.DocumentType)
                .ToListAsync();

            return Ok(documents);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting health documents for crew {CrewId}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    private async Task EnqueueIdentityDocumentSyncAsync(string tableName, string recordKey, SyncActionType actionType, object payload)
    {
        var serializedPayload = System.Text.Json.JsonSerializer.Serialize(BuildIdentityDocumentSyncPayload(payload), new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = false,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
            ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles
        });

        _context.SyncQueue.Add(new SyncQueue
        {
            TableName = tableName,
            RecordKey = recordKey,
            ActionType = actionType,
            Payload = serializedPayload,
            Priority = SyncPriority.Operational,
            CreatedAt = DateTime.UtcNow,
            RetryCount = 0,
            MaxRetries = 5
        });

        await _context.SaveChangesAsync();
    }

    private static Dictionary<string, object?> BuildIdentityDocumentSyncPayload(object payload)
    {
        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        foreach (var property in payload.GetType().GetProperties())
        {
            if (!property.CanRead || property.GetIndexParameters().Length > 0)
            {
                continue;
            }

            if (string.Equals(property.Name, "CrewMember", StringComparison.OrdinalIgnoreCase))
            {
                var crewMember = property.GetValue(payload);
                if (crewMember == null)
                {
                    continue;
                }

                var crewId = crewMember.GetType().GetProperty("CrewId")?.GetValue(crewMember) as string;
                if (!string.IsNullOrWhiteSpace(crewId))
                {
                    result["CrewId"] = crewId;
                }

                var crewFullName = crewMember.GetType().GetProperty("FullName")?.GetValue(crewMember) as string;
                if (!string.IsNullOrWhiteSpace(crewFullName))
                {
                    result["CrewFullName"] = crewFullName;
                }

                var crewIdCardNumber = crewMember.GetType().GetProperty("IdCardNumber")?.GetValue(crewMember) as string;
                if (!string.IsNullOrWhiteSpace(crewIdCardNumber))
                {
                    result["CrewIdCardNumber"] = crewIdCardNumber;
                }

                var crewDateOfBirth = crewMember.GetType().GetProperty("DateOfBirth")?.GetValue(crewMember);
                if (crewDateOfBirth != null)
                {
                    result["CrewDateOfBirth"] = crewDateOfBirth;
                }

                var crewMemberId = crewMember.GetType().GetProperty("Id")?.GetValue(crewMember);
                if (crewMemberId != null && !result.ContainsKey("CrewMemberId"))
                {
                    result["CrewMemberId"] = crewMemberId;
                }

                continue;
            }

            var value = property.GetValue(payload);
            if (value == null)
            {
                continue;
            }

            if (property.PropertyType != typeof(string) && !property.PropertyType.IsValueType)
            {
                continue;
            }

            result[property.Name] = value;
        }

        return result;
    }

    private async Task<string> SaveIdentityDocumentFileAsync(Guid crewMemberId, string documentType, IFormFile file, string targetTable)
    {
        // Extract document category from targetTable (e.g., "travel_documents" -> "travel_documents")
        var documentCategory = targetTable.Trim().ToLowerInvariant();
        
        var uploadsRoot = Path.Combine(Directory.GetCurrentDirectory(), "uploads", "crew", "documents", documentCategory);
        Directory.CreateDirectory(uploadsRoot);

        var extension = Path.GetExtension(file.FileName);
        var sanitizedDocumentType = SanitizeFileNamePart(documentType);
        var baseFileName = $"{crewMemberId}_{sanitizedDocumentType}";
        var finalFileName = $"{baseFileName}{extension}";
        var finalPhysicalPath = Path.Combine(uploadsRoot, finalFileName);

        if (System.IO.File.Exists(finalPhysicalPath))
        {
            finalFileName = $"{baseFileName}_{DateTime.UtcNow:yyyyMMddHHmmssfff}{extension}";
            finalPhysicalPath = Path.Combine(uploadsRoot, finalFileName);
        }

        await using var stream = new FileStream(finalPhysicalPath, FileMode.Create);
        await file.CopyToAsync(stream);

        return $"/uploads/crew/documents/{documentCategory}/{finalFileName}";
    }

    private static string SanitizeFileNamePart(string input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return "document";
        }

        var cleaned = Regex.Replace(input.Trim().ToLowerInvariant(), "[^a-z0-9_-]+", "_");
        cleaned = Regex.Replace(cleaned, "_+", "_").Trim('_');
        return string.IsNullOrWhiteSpace(cleaned) ? "document" : cleaned;
    }

    public class CreateIdentityDocumentDto
    {
        public string TargetTable { get; set; } = string.Empty;
        public string DocumentType { get; set; } = string.Empty;
        public string DocumentNumber { get; set; } = string.Empty;
        public DateTime? IssueDate { get; set; }
        public DateTime? ExpiryDate { get; set; }
        public int? CountryId { get; set; }
        public string? Notes { get; set; }
        public IFormFile? File { get; set; }
    }

    public class UpdateDocumentFileDto
    {
        public string TargetTable { get; set; } = string.Empty;
        public IFormFile File { get; set; } = null!;
    }
    
    /// <summary>
    /// Map CrewMember entity to CrewMemberDto
    /// </summary>
    private CrewMemberDto MapToCrewMemberDto(CrewMember crew)
    {
        // Parse first name and last name from full name
        var nameParts = crew.FullName.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var firstName = nameParts.Length > 0 ? nameParts[0] : crew.FullName;
        var lastName = nameParts.Length > 1 ? string.Join(" ", nameParts.Skip(1)) : "";
        
        // Determine rank group for frontend filtering
        // Officers, Deck, Engine, Galley
        string? rankGroup = null;
        if (crew.Rank?.RankName?.Contains("Officer", StringComparison.OrdinalIgnoreCase) == true)
        {
            rankGroup = "Officers";
        }
        else if (crew.Department?.Equals("Deck", StringComparison.OrdinalIgnoreCase) == true)
        {
            rankGroup = "Deck";
        }
        else if (crew.Department?.Equals("Engine", StringComparison.OrdinalIgnoreCase) == true)
        {
            rankGroup = "Engine";
        }
        else if (crew.Department?.Contains("Catering", StringComparison.OrdinalIgnoreCase) == true ||
                 crew.Department?.Contains("Galley", StringComparison.OrdinalIgnoreCase) == true)
        {
            rankGroup = "Galley";
        }
        
        return new CrewMemberDto
        {
            Id = crew.Id,
            CrewId = crew.CrewId,
            FirstName = firstName,
            LastName = lastName,
            FullName = crew.FullName,
            Rank = crew.Rank != null ? new RankDto
            {
                Id = crew.Rank.Id,
                RankCode = crew.Rank.RankCode,
                RankName = crew.Rank.RankName,
                IsActive = crew.Rank.IsActive
            } : null,
            RankId = crew.RankId,
            RankGroup = rankGroup,
            IsOnboard = crew.IsOnboard,
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

            // Personal / BIO-DATA fields
            DateOfBirth = crew.DateOfBirth,
            PhotoUrl = crew.PhotoUrl,
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

            // Contact & Emergency
            EmergencyContact = crew.EmergencyContact,
            Address = crew.Address,

            // Next of Kin
            NextOfKinName = crew.NextOfKinName,
            NextOfKinRelation = crew.NextOfKinRelation,
            NextOfKinPhone = crew.NextOfKinPhone,
            NextOfKinAddress = crew.NextOfKinAddress,

            // Education
            EducationInstitution = crew.EducationInstitution,
            EducationCourse = crew.EducationCourse,
            EducationPeriodYears = crew.EducationPeriodYears,
            EducationGraduationYear = crew.EducationGraduationYear,

            // Additional
            Notes = crew.Notes,
            IsSynced = crew.IsSynced,
            CreatedAt = crew.CreatedAt,
            UpdatedAt = crew.UpdatedAt,

            // Onboard Review
            OnboardStatus = crew.OnboardStatus,
            OnboardStatusChangedAt = crew.OnboardStatusChangedAt,
            OnboardStatusChangedBy = crew.OnboardStatusChangedBy,
            ReviewChecklist = crew.ReviewChecklist,
            ReviewNotes = crew.ReviewNotes,
            EdgeChanges = crew.EdgeChanges,
            EdgeChangesViewed = crew.EdgeChangesViewed,
        };
    }

    // ============================================================
    // PENDING CREW REVIEW (Shore → Edge onboarding workflow)
    // ============================================================

    /// <summary>
    /// GET /api/crew/pending - List all crew members with PendingReview status
    /// </summary>
    [HttpGet("pending")]
    public async Task<IActionResult> GetPendingCrew()
    {
        try
        {
            var crew = await _context.CrewMembers
                .AsNoTracking()
                .Include(c => c.Rank)
                .Include(c => c.Country)
                .Where(c => c.OnboardStatus == "PendingReview" || c.OnboardStatus == "OnHold")
                .OrderByDescending(c => c.UpdatedAt)
                .ToListAsync();

            var crewDtos = crew.Select(MapToCrewMemberDto).ToList();
            return Ok(crewDtos);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting pending crew");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// POST /api/crew/{id}/approve - Captain approves a pending crew member
    /// </summary>
    [HttpPost("{id}/approve")]
    public async Task<IActionResult> ApproveCrew(Guid id, [FromBody] ApproveCrewRequest? request = null)
    {
        try
        {
            var crew = await _context.CrewMembers
                .Include(c => c.Rank)
                .Include(c => c.Country)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (crew == null)
                return NotFound(new { error = "Crew member not found" });

            if (crew.OnboardStatus != "PendingReview" && crew.OnboardStatus != "OnHold")
                return BadRequest(new { error = $"Crew member is not in PendingReview or OnHold status (current: {crew.OnboardStatus})" });

            // Approval and account creation must succeed together.
            await using var transaction = await _context.Database.BeginTransactionAsync();

            // Extract approver from auth header
            string approver = "Captain";
            if (Request.Headers.ContainsKey("Authorization"))
            {
                var authHeader = Request.Headers["Authorization"].ToString();
                if (authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    var token = authHeader.Substring("Bearer ".Length).Trim();
                    var parts = token.Split('_');
                    if (parts.Length >= 3) approver = parts[2];
                }
            }

            crew.OnboardStatus = "Approved";
            crew.OnboardStatusChangedAt = DateTime.UtcNow;
            crew.OnboardStatusChangedBy = approver;
            crew.IsOnboard = true;
            crew.EmbarkDate ??= DateTime.UtcNow;
            crew.IsSynced = false;
            crew.UpdatedAt = DateTime.UtcNow;

            if (!string.IsNullOrWhiteSpace(request?.ReviewChecklist))
                crew.ReviewChecklist = request.ReviewChecklist;

            await _context.SaveChangesAsync();

            // Auto-create User account if not exists
            await CreateUserForCrewMemberAsync(crew);
            await transaction.CommitAsync();

            _logger.LogInformation("Approved crew member: {CrewId} - {FullName} by {Approver}", 
                crew.CrewId, crew.FullName, approver);

            return Ok(new
            {
                message = $"Crew member {crew.FullName} approved and moved to onboard",
                crew = MapToCrewMemberDto(crew)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error approving crew member {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// POST /api/crew/{id}/hold - Put crew on hold, report missing sections to shore
    /// </summary>
    [HttpPost("{id}/hold")]
    public async Task<IActionResult> HoldCrew(Guid id, [FromBody] HoldCrewRequest request)
    {
        try
        {
            var crew = await _context.CrewMembers
                .Include(c => c.Rank)
                .Include(c => c.Country)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (crew == null)
                return NotFound(new { error = "Crew member not found" });

            if (crew.OnboardStatus != "PendingReview" && crew.OnboardStatus != "OnHold")
                return BadRequest(new { error = $"Crew member is not in PendingReview or OnHold status (current: {crew.OnboardStatus})" });

            // Extract user from auth header
            string reviewer = "Captain";
            if (Request.Headers.ContainsKey("Authorization"))
            {
                var authHeader = Request.Headers["Authorization"].ToString();
                if (authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    var token = authHeader.Substring("Bearer ".Length).Trim();
                    var parts = token.Split('_');
                    if (parts.Length >= 3) reviewer = parts[2];
                }
            }

            crew.OnboardStatus = "OnHold";
            crew.OnboardStatusChangedAt = DateTime.UtcNow;
            crew.OnboardStatusChangedBy = reviewer;
            crew.IsOnboard = false;
            crew.IsSynced = false;
            crew.UpdatedAt = DateTime.UtcNow;

            if (!string.IsNullOrWhiteSpace(request.ReviewChecklist))
                crew.ReviewChecklist = request.ReviewChecklist;
            if (!string.IsNullOrWhiteSpace(request.ReviewNotes))
                crew.ReviewNotes = request.ReviewNotes;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Put crew on hold: {CrewId} - {FullName} by {Reviewer}. Notes: {Notes}", 
                crew.CrewId, crew.FullName, reviewer, request.ReviewNotes ?? "N/A");

            return Ok(new
            {
                message = $"Crew member {crew.FullName} put on hold. Shore will be notified of missing information.",
                crew = MapToCrewMemberDto(crew)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error holding crew member {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// POST /api/crew/{id}/reject - Captain rejects a pending crew member
    /// </summary>
    [HttpPost("{id}/reject")]
    public async Task<IActionResult> RejectCrew(Guid id, [FromBody] RejectCrewRequest? request = null)
    {
        try
        {
            var crew = await _context.CrewMembers
                .Include(c => c.Rank)
                .Include(c => c.Country)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (crew == null)
                return NotFound(new { error = "Crew member not found" });

            if (crew.OnboardStatus != "PendingReview")
                return BadRequest(new { error = $"Crew member is not in PendingReview status (current: {crew.OnboardStatus})" });

            // Extract rejector from auth header
            string rejector = "Captain";
            if (Request.Headers.ContainsKey("Authorization"))
            {
                var authHeader = Request.Headers["Authorization"].ToString();
                if (authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    var token = authHeader.Substring("Bearer ".Length).Trim();
                    var parts = token.Split('_');
                    if (parts.Length >= 3) rejector = parts[2];
                }
            }

            crew.OnboardStatus = "Rejected";
            crew.OnboardStatusChangedAt = DateTime.UtcNow;
            crew.OnboardStatusChangedBy = rejector;
            crew.IsOnboard = false;
            crew.IsSynced = false;
            crew.UpdatedAt = DateTime.UtcNow;

            if (!string.IsNullOrWhiteSpace(request?.Reason))
                crew.Notes = $"[Rejected] {request.Reason}" + (string.IsNullOrWhiteSpace(crew.Notes) ? "" : $"\n{crew.Notes}");

            await _context.SaveChangesAsync();

            _logger.LogInformation("Rejected crew member: {CrewId} - {FullName} by {Rejector}. Reason: {Reason}", 
                crew.CrewId, crew.FullName, rejector, request?.Reason ?? "N/A");

            return Ok(new
            {
                message = $"Crew member {crew.FullName} rejected",
                crew = MapToCrewMemberDto(crew)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error rejecting crew member {Id}", id);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }
}

public class ApproveCrewRequest
{
    public string? ReviewChecklist { get; set; }
}

public class HoldCrewRequest
{
    public string? ReviewChecklist { get; set; }
    public string? ReviewNotes { get; set; }
}

public class RejectCrewRequest
{
    public string? Reason { get; set; }
}
