namespace Maritime.Shared.DTOs.Crew;

/// <summary>
/// DTO for certificate type (master data)
/// </summary>
public class CertificateDto
{
    public int Id { get; set; }
    public string CertificateCode { get; set; } = string.Empty;
    public string CertificateName { get; set; } = string.Empty;
    public string? Category { get; set; }
    public string? IssuingAuthority { get; set; }
    public int? ValidityPeriodMonths { get; set; }
    public string? Description { get; set; }
    public bool IsMandatory { get; set; }
    public bool IsActive { get; set; }
    public bool IsRequiredForRank { get; set; }
}

/// <summary>
/// DTO for a crew member's specific certificate
/// </summary>
public class CrewCertificateDto
{
    public int Id { get; set; }
    public Guid CrewMemberId { get; set; }
    public string? CrewMemberName { get; set; }
    public Guid? VesselId { get; set; }
    public int CertificateId { get; set; }
    public string? CertificateCode { get; set; }
    public string? CertificateName { get; set; }
    public string? Category { get; set; }
    public string CertificateNumber { get; set; } = string.Empty;
    public DateTime IssueDate { get; set; }
    public DateTime ExpiryDate { get; set; }
    public string? IssuingAuthority { get; set; }
    public string? CertificateOfCompetency { get; set; }
    public int? CountryId { get; set; }
    public string? CountryName { get; set; }
    public string? DocumentFilePath { get; set; }
    public string Status { get; set; } = "VALID";
    public string? Notes { get; set; }
    public bool IsSynced { get; set; }
}

/// <summary>
/// Request DTO for adding/updating a crew certificate
/// </summary>
public class CrewCertificateRequest
{
    public Guid CrewMemberId { get; set; }
    public int CertificateId { get; set; }
    public string CertificateNumber { get; set; } = string.Empty;
    public DateTime IssueDate { get; set; }
    public DateTime ExpiryDate { get; set; }
    public string? IssuingAuthority { get; set; }
    public string? CertificateOfCompetency { get; set; }
    public int? CountryId { get; set; }
    public string? Notes { get; set; }
}

/// <summary>
/// Request DTO for creating a new certificate type
/// </summary>
public class CreateCertificateRequest
{
    public string CertificateCode { get; set; } = string.Empty;
    public string CertificateName { get; set; } = string.Empty;
    public string? Category { get; set; }
    public string? IssuingAuthority { get; set; }
    public int? ValidityPeriodMonths { get; set; }
    public string? Description { get; set; }
    public bool IsMandatory { get; set; }
    public List<int>? CountryIds { get; set; }
    public List<int>? RankIds { get; set; }
}

/// <summary>
/// DTO for identity documents (Travel, Seafarer, Employment, Health)
/// </summary>
public class CreateIdentityDocumentDto
{
    public string DocumentType { get; set; } = string.Empty;
    public string DocumentNumber { get; set; } = string.Empty;
    public DateTime? IssueDate { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public int? CountryId { get; set; }
    public string? Notes { get; set; }
    public string Category { get; set; } = "travel"; // travel, seafarer, employment, health
}
