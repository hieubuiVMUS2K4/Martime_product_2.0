namespace Maritime.Shared.DTOs.Crew;

/// <summary>
/// DTO for crew member in lists and selections.
/// Matches frontend CrewMember interface on both edge and shore.
/// </summary>
public class CrewMemberDto
{
    public Guid Id { get; set; }
    public string CrewId { get; set; } = string.Empty;
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public RankDto? Rank { get; set; }
    public int? RankId { get; set; }
    public string? RankName { get; set; }
    public string? RankCode { get; set; }
    public string? RankGroup { get; set; }
    public bool IsOnboard { get; set; }
    public Guid? VesselId { get; set; }
    public string? VesselName { get; set; }
    public string? Department { get; set; }
    public int? CountryId { get; set; }
    public string? CountryName { get; set; }
    public string? EmailAddress { get; set; }
    public string? PhoneNumber { get; set; }
    public DateTime? EmbarkDate { get; set; }
    public DateTime? DisembarkDate { get; set; }
    public DateTime? ContractEnd { get; set; }
    public DateTime? JoinDate { get; set; }
    public string? CertificateNumber { get; set; }
    public DateTime? CertificateIssue { get; set; }
    public DateTime? CertificateExpiry { get; set; }
    public DateTime? MedicalIssue { get; set; }
    public DateTime? MedicalExpiry { get; set; }

    // Personal
    public DateTime? DateOfBirth { get; set; }
    public string? PhotoUrl { get; set; }
    public string? AvatarUrl { get; set; }
    public string? PlaceOfBirth { get; set; }
    public string? IdCardNumber { get; set; }
    public string? MaritalStatus { get; set; }
    public int? Height { get; set; }
    public decimal? Weight { get; set; }
    public string? BloodGroup { get; set; }
    public string? ClothingSize { get; set; }
    public string? ShoeSize { get; set; }
    public string? CateringSize { get; set; }
    public bool? IsSmoker { get; set; }
    public bool? IsCovidVaccinated { get; set; }

    // Contact
    public string? EmergencyContact { get; set; }
    public string? Address { get; set; }

    // Next of Kin
    public string? NextOfKinName { get; set; }
    public string? NextOfKinRelation { get; set; }
    public string? NextOfKinPhone { get; set; }
    public string? NextOfKinAddress { get; set; }

    // Education
    public string? EducationInstitution { get; set; }
    public string? EducationCourse { get; set; }
    public int? EducationPeriodYears { get; set; }
    public int? EducationGraduationYear { get; set; }

    // Metadata
    public string? Notes { get; set; }
    public bool IsSynced { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Onboard Review
    public string? OnboardStatus { get; set; }
    public DateTime? OnboardStatusChangedAt { get; set; }
    public string? OnboardStatusChangedBy { get; set; }
    public string? ReviewChecklist { get; set; }
    public string? ReviewNotes { get; set; }
    public string? EdgeChanges { get; set; }
    public bool EdgeChangesViewed { get; set; }
}

/// <summary>
/// Rank DTO matching frontend Rank interface
/// </summary>
public class RankDto
{
    public int Id { get; set; }
    public string RankCode { get; set; } = string.Empty;
    public string RankName { get; set; } = string.Empty;
    public bool IsActive { get; set; }
}

/// <summary>
/// Detailed crew member DTO for single record view.
/// Extends CrewMemberDto with document-specific fields.
/// </summary>
public class CrewDetailDto : CrewMemberDto
{
    public string? PassportNumber { get; set; }
    public DateTime? PassportExpiry { get; set; }
    public string? SeamanBookNumber { get; set; }
}

/// <summary>
/// DTO for creating a new crew member
/// </summary>
public class CreateCrewRequest
{
    public string CrewId { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public int? RankId { get; set; }
    public string? Department { get; set; }
    public int? CountryId { get; set; }
    public DateTime? DateOfBirth { get; set; }
    public DateTime? JoinDate { get; set; }
    public DateTime? EmbarkDate { get; set; }
    public DateTime? ContractEnd { get; set; }
    public bool IsOnboard { get; set; } = false;
    public Guid? VesselId { get; set; }
    public string? EmergencyContact { get; set; }
    public string? EmailAddress { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Address { get; set; }
    public string? PlaceOfBirth { get; set; }
    public string? IdCardNumber { get; set; }
    public string? MaritalStatus { get; set; }
    public int? Height { get; set; }
    public decimal? Weight { get; set; }
    public string? BloodGroup { get; set; }
    public string? ClothingSize { get; set; }
    public string? ShoeSize { get; set; }
    public string? CateringSize { get; set; }
    public bool? IsSmoker { get; set; }
    public bool? IsCovidVaccinated { get; set; }
    public string? NextOfKinName { get; set; }
    public string? NextOfKinRelation { get; set; }
    public string? NextOfKinPhone { get; set; }
    public string? NextOfKinAddress { get; set; }
    public string? EducationInstitution { get; set; }
    public string? EducationCourse { get; set; }
    public int? EducationPeriodYears { get; set; }
    public int? EducationGraduationYear { get; set; }
    public string? Notes { get; set; }
}

/// <summary>
/// DTO for updating an existing crew member (all fields optional)
/// </summary>
public class UpdateCrewRequest
{
    public string? FullName { get; set; }
    public int? RankId { get; set; }
    public string? Department { get; set; }
    public int? CountryId { get; set; }
    public DateTime? DateOfBirth { get; set; }
    public DateTime? JoinDate { get; set; }
    public DateTime? EmbarkDate { get; set; }
    public DateTime? DisembarkDate { get; set; }
    public DateTime? ContractEnd { get; set; }
    public bool? IsOnboard { get; set; }
    public Guid? VesselId { get; set; }
    public string? EmergencyContact { get; set; }
    public string? EmailAddress { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Address { get; set; }
    public string? PlaceOfBirth { get; set; }
    public string? IdCardNumber { get; set; }
    public string? MaritalStatus { get; set; }
    public int? Height { get; set; }
    public decimal? Weight { get; set; }
    public string? BloodGroup { get; set; }
    public string? ClothingSize { get; set; }
    public string? ShoeSize { get; set; }
    public string? CateringSize { get; set; }
    public bool? IsSmoker { get; set; }
    public bool? IsCovidVaccinated { get; set; }
    public string? NextOfKinName { get; set; }
    public string? NextOfKinRelation { get; set; }
    public string? NextOfKinPhone { get; set; }
    public string? NextOfKinAddress { get; set; }
    public string? EducationInstitution { get; set; }
    public string? EducationCourse { get; set; }
    public int? EducationPeriodYears { get; set; }
    public int? EducationGraduationYear { get; set; }
    public string? Notes { get; set; }
    /// <summary>Seaman book number — lưu ở crew_member_documents (Category seafarer, type: seaman_book)</summary>
    public string? SeamanBookNumber { get; set; }
}
