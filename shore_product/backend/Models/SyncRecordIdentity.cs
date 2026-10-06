namespace ProductApi.Models;

/// <summary>Maps a vessel-local key to its Shore key; seed IDs may be identical across vessels.</summary>
public class SyncRecordIdentity
{
    public string OriginNode { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
    public string LocalKey { get; set; } = string.Empty;
    public string ShoreKey { get; set; } = string.Empty;
}

public class SyncRecordCursor
{
    public string Key { get; set; } = string.Empty;
    public long Sequence { get; set; }
}

public class SyncStreamState
{
    public string Key { get; set; } = string.Empty;
    public Guid Epoch { get; set; }
}
