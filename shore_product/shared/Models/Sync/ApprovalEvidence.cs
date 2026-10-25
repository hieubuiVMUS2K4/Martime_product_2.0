using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Maritime.Shared.Models.Sync;

[Table("approval_documents")]
public class ApprovalDocument
{
    [Key] public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(50)] public string OriginNode { get; set; } = "";
    [MaxLength(30)] public string Module { get; set; } = "";
    [MaxLength(100)] public string RecordKey { get; set; } = "";
    public int CurrentRevision { get; set; }
    public string CurrentState { get; set; } = "Draft";
    [ConcurrencyCheck] public long Version { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsSynced { get; set; }
}

[Table("approval_revisions")]
public class ApprovalRevision
{
    [Key] public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DocumentId { get; set; }
    public int Revision { get; set; }
    public Guid? PreviousRevisionId { get; set; }
    public string OriginNode { get; set; } = "";
    public string SnapshotJson { get; set; } = "{}";
    [MaxLength(64)] public string ContentHash { get; set; } = "";
    public string Reason { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsSynced { get; set; }
}

[Table("approval_actions")]
public class ApprovalAction
{
    [Key] public Guid Id { get; set; } = Guid.NewGuid();
    public Guid DocumentId { get; set; }
    public Guid RevisionId { get; set; }
    public string OriginNode { get; set; } = "";
    public long ActorUserId { get; set; }
    public string ActorUsername { get; set; } = "";
    public string? CrewId { get; set; }
    public string ActorName { get; set; } = "";
    public string ActorRank { get; set; } = "";
    public string Authority { get; set; } = "";
    public string Action { get; set; } = "";
    public string Reason { get; set; } = "";
    public string ContentHash { get; set; } = "";
    public string AuthenticationMethod { get; set; } = "password-reauthentication";
    public string PolicyVersion { get; set; } = "edge-approval-v1";
    public string IdempotencyKey { get; set; } = "";
    public string RequestHash { get; set; } = "";
    public string ResponseJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public bool IsSynced { get; set; }
}

/// <summary>Stable property order; arrays retain their meaningful order. Secrets never belong in snapshots.</summary>
public static class ApprovalSnapshot
{
    public static string Canonicalize(object value)
    {
        var element = value is JsonElement json ? json : JsonSerializer.SerializeToElement(value);
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream)) Write(writer, element);
        return Encoding.UTF8.GetString(stream.ToArray());
    }
    private static void Write(Utf8JsonWriter writer, JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            writer.WriteStartObject();
            foreach (var property in element.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal))
            { writer.WritePropertyName(property.Name); Write(writer, property.Value); }
            writer.WriteEndObject();
        }
        else if (element.ValueKind == JsonValueKind.Array)
        { writer.WriteStartArray(); foreach (var item in element.EnumerateArray()) Write(writer, item); writer.WriteEndArray(); }
        else element.WriteTo(writer);
    }
    public static string Hash(string json) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json))).ToLowerInvariant();
    public static readonly string[] Tables = ["approval_document", "approval_revision", "approval_action"];

    public static List<(string Role, string FilePath)> FileReferences(string payload)
    {
        using var envelope = JsonDocument.Parse(payload);
        if (!envelope.RootElement.TryGetProperty("SnapshotJson", out var snapshot) && !envelope.RootElement.TryGetProperty("snapshotJson", out snapshot)) return [];
        using var doc = JsonDocument.Parse(snapshot.GetString() ?? "{}");
        if (!doc.RootElement.TryGetProperty("Files", out var files) || files.ValueKind != JsonValueKind.Array) return [];
        return files.EnumerateArray().Select((file, index) => ("evidence-" + index, file.GetProperty("filePath").GetString()!)).ToList();
    }
}
