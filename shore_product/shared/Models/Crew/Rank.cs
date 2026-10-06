using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Maritime.Shared.Models.Crew;

/// <summary>
/// Rank — Ship ranks/positions (Captain, Chief Officer, etc.)
/// </summary>
public class Rank
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    [Required]
    [MaxLength(10)]
    public string RankCode { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string RankName { get; set; } = string.Empty;

    /// <summary>DECK, ENGINE, CATERING</summary>
    [MaxLength(20)]
    public string Department { get; set; } = "DECK";

    [MaxLength(100)]
    public string? Level { get; set; }

    /// <summary>Display sort order (lower = higher rank)</summary>
    public int SortOrder { get; set; } = 0;

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
