using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace Maritime.Shared.Models.Crew;

/// <summary>
/// Certificate Types — Master data for maritime certificate types
/// (STCW, Medical, Safety Training, etc.)
/// </summary>
public class Certificate
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    [Required]
    [MaxLength(50)]
    public string CertificateCode { get; set; } = string.Empty;

    [Required]
    [MaxLength(200)]
    public string CertificateName { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? Category { get; set; } // COMPETENCY, MEDICAL, PROFICIENCY, SAFETY

    [MaxLength(200)]
    public string? IssuingAuthority { get; set; }

    public int? ValidityPeriodMonths { get; set; }

    public string? Description { get; set; }

    public bool IsMandatory { get; set; } = false;

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    [JsonIgnore]
    public List<CrewCertificate> CrewCertificates { get; set; } = new();

    [JsonIgnore]
    public List<CountryCertificate> CountryCertificates { get; set; } = new();
}
