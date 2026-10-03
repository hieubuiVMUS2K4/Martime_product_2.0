namespace MaritimeEdge.DTOs;

public class ImportMaintenanceRow : CreateMaintenanceScheduleDto
{
    public int RowNumber { get; set; }
    public string AssetCode { get; set; } = string.Empty;
    public string? Review { get; set; }
    public int? HoursMinimum { get; set; }
    public int? HoursMaximum { get; set; }
}

public class ImportMaintenanceRequest
{
    public List<ImportMaintenanceRow> Rows { get; set; } = new();
    public bool ValidateOnly { get; set; }
}
