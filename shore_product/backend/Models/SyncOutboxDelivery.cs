namespace ProductApi.Models;

/// <summary>Broadcast delivery is independently acknowledged by each vessel.</summary>
public class SyncOutboxDelivery
{
    public long OutboxId { get; set; }
    public string NodeId { get; set; } = string.Empty;
    public DateTime AppliedAtUtc { get; set; }
}
