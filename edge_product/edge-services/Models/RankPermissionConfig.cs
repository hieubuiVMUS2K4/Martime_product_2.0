using System.ComponentModel.DataAnnotations;

namespace MaritimeEdge.Models;

public class RankPermissionConfig
{
    [Key] public int RankId { get; set; }
    public string GrantsJson { get; set; } = "[]";
    public long Version { get; set; } = 1;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public long UpdatedBy { get; set; }
}
