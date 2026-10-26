using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ProductApi.Models;

[Table("pms_sync_datasets")]
public class PmsSyncDataset
{
    [Key, MaxLength(50)] public string OriginNode { get; set; } = "";
    public Guid VesselId { get; set; }
    public Guid DatasetId { get; set; }
    public Guid StreamId { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>Source identity and last accepted full payload, independent of Shore's remapped keys.</summary>
[Table("pms_sync_mirror_records")]
public class PmsSyncMirrorRecord
{
    [Key, MaxLength(64)] public string Key { get; set; } = "";
    [MaxLength(50)] public string OriginNode { get; set; } = "";
    public Guid VesselId { get; set; }
    public Guid DatasetId { get; set; }
    [MaxLength(60)] public string TableName { get; set; } = "";
    public Guid SourceId { get; set; }
    public Guid ShoreId { get; set; }
    public long Sequence { get; set; }
    [MaxLength(64)] public string PayloadHash { get; set; } = "";
    public string SourceJson { get; set; } = "";
}
