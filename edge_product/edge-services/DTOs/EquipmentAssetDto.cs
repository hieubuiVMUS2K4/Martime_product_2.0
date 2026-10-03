using System.ComponentModel.DataAnnotations;

namespace MaritimeEdge.DTOs;

/// <summary>
/// DTO for Equipment Asset
/// </summary>
public class EquipmentAssetDto
{
    public string? DefaultExecutorRole { get; set; }
    public string? ApproverRole { get; set; }
    public bool IsSynced { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string OriginNode { get; set; } = string.Empty;
    public Guid? Id { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string AssetCode { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(200)]
    public string AssetName { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(50)]
    public string Category { get; set; } = string.Empty;
    
    [MaxLength(200)]
    public string? Manufacturer { get; set; }
    
    [MaxLength(100)]
    public string? Model { get; set; }
    
    [MaxLength(100)]
    public string? SerialNumber { get; set; }
    
    public DateTime? InstallationDate { get; set; }
    
    public double? CurrentRunningHours { get; set; }
    
    public DateTime? LastRunningHoursUpdate { get; set; }
    
    public Guid? EquipmentGroupId { get; set; }

    [MaxLength(50)]
    public string? PicCrewId { get; set; }
    public string? PicCrewName { get; set; }
    
    [MaxLength(100)]
    public string? Location { get; set; }
    
    [MaxLength(20)]
    public string Criticality { get; set; } = "NORMAL";
    
    [MaxLength(50)]
    public string Status { get; set; } = "ACTIVE";
    
    public string? TechnicalSpecs { get; set; }
    
    public string? Notes { get; set; }
    
    public bool IsActive { get; set; } = true;

    /// <summary>Parent asset ID for hierarchy tree (null = root node)</summary>
    public Guid? ParentId { get; set; }
}

/// <summary>
/// DTO for creating equipment asset
/// </summary>
public class CreateEquipmentAssetDto
{
    [Required]
    [MaxLength(50)]
    public string AssetCode { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(200)]
    public string AssetName { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(50)]
    public string Category { get; set; } = string.Empty;
    
    [MaxLength(200)]
    public string? Manufacturer { get; set; }
    
    [MaxLength(100)]
    public string? Model { get; set; }
    
    [MaxLength(100)]
    public string? SerialNumber { get; set; }
    
    public DateTime? InstallationDate { get; set; }
    
    public Guid? EquipmentGroupId { get; set; }

    [MaxLength(50)]
    public string? PicCrewId { get; set; }

    /// <summary>Parent asset ID for hierarchy tree (null = root node)</summary>
    public Guid? ParentId { get; set; }
    
    [MaxLength(100)]
    public string? Location { get; set; }
    
    [MaxLength(20)]
    public string Criticality { get; set; } = "NORMAL";
    
    [MaxLength(50)]
    public string Status { get; set; } = "ACTIVE";
    
    public string? TechnicalSpecs { get; set; }
    
    public string? Notes { get; set; }
}

/// <summary>
/// DTO for updating equipment asset
/// </summary>
public class UpdateEquipmentAssetDto
{
    [Required]
    [MaxLength(200)]
    public string AssetName { get; set; } = string.Empty;
    
    [MaxLength(200)]
    public string? Manufacturer { get; set; }
    
    [MaxLength(100)]
    public string? Model { get; set; }
    
    [MaxLength(100)]
    public string? SerialNumber { get; set; }
    
    public Guid? EquipmentGroupId { get; set; }

    [MaxLength(50)]
    public string? PicCrewId { get; set; }

    /// <summary>Parent asset ID for hierarchy tree (null = root node)</summary>
    public Guid? ParentId { get; set; }
    
    [MaxLength(100)]
    public string? Location { get; set; }
    
    [MaxLength(20)]
    public string Criticality { get; set; } = "NORMAL";
    
    [MaxLength(50)]
    public string Status { get; set; } = "ACTIVE";
    
    public double? CurrentRunningHours { get; set; }
    
    public string? TechnicalSpecs { get; set; }
    
    public string? Notes { get; set; }
    
    public bool IsActive { get; set; } = true;
}

/// <summary>
/// DTO for bulk import from Excel
/// </summary>
public class ImportEquipmentAssetDto
{
    [Required]
    public string AssetCode { get; set; } = string.Empty;
    
    [Required]
    public string AssetName { get; set; } = string.Empty;
    
    [Required]
    public string Category { get; set; } = string.Empty;
    
    public string? Manufacturer { get; set; }
    public string? Model { get; set; }
    public string? SerialNumber { get; set; }
    public string? Location { get; set; }
    public string Criticality { get; set; } = "NORMAL";
    public string? EquipmentGroupCode { get; set; }
    public string? ParentAssetCode { get; set; }
}
