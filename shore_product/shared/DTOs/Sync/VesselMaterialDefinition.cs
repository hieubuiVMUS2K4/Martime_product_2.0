namespace Maritime.Shared.DTOs.Sync;

// Shore owns definitions; Edge owns quantities and stock movements.
public sealed class VesselMaterialDefinition
{
    public Guid Id { get; set; }
    public Guid VesselId { get; set; }
    public Guid CatalogId { get; set; }
    public string MaterialItemCode { get; set; } = "";
    public string ItemCode { get; set; } = "";
    public string Name { get; set; } = "";
    public string Unit { get; set; } = "PCS";
    public string? Specification { get; set; }
    public string? Manufacturer { get; set; }
    public string? PartNumber { get; set; }
    public string? Supplier { get; set; }
    public string? Notes { get; set; }
    public decimal? UnitCost { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime UpdatedAt { get; set; }
    public List<VesselMaterialEquipmentLink>? EquipmentLinks { get; set; }
}

public sealed class VesselMaterialEquipmentLink
{
    public Guid Id { get; set; }
    public Guid EquipmentAssetId { get; set; }
    public string? Notes { get; set; }
}
