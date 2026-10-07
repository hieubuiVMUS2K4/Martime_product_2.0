using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace Maritime.Shared.Models.Sync;

/// <summary>File references belong to an execution snapshot, not the reusable task.</summary>
public static class MaintenanceHistorySyncFiles
{
    public static string Role(string path) => "maintenance_evidence_"
        + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(path))).ToLowerInvariant()[..24];

    public static IEnumerable<(string Role, string Path)> References(string payload)
    {
        var root = JsonNode.Parse(payload) as JsonObject;
        var snapshot = root?.FirstOrDefault(p => p.Key.Replace("_", "").Equals("ReportSnapshot", StringComparison.OrdinalIgnoreCase)).Value;
        if (snapshot is not JsonValue value || !value.TryGetValue<string>(out var json)) return [];
        var paths = new List<string>();
        Transform(JsonNode.Parse(json), path => { paths.Add(path); return path; });
        return paths.Distinct().Select(path => (Role(path), path)).ToList();
    }

    public static string? Rewrite(string? snapshot, string role, string storagePath)
    {
        if (snapshot == null) return null;
        var root = JsonNode.Parse(snapshot);
        var changed = false;
        Transform(root, path => { if (Role(path) != role) return path; changed = true; return storagePath; });
        return changed ? root!.ToJsonString() : snapshot;
    }

    private static void Transform(JsonNode? node, Func<string, string> transform)
    {
        if (node is JsonArray array)
            foreach (var item in array) Transform(item, transform);
        if (node is not JsonObject obj) return;
        foreach (var pair in obj.ToList())
        {
            var name = pair.Key.Replace("_", "");
            if (pair.Value is JsonValue value && value.TryGetValue<string>(out var text))
            {
                if (name.Equals("CompletionPhotos", StringComparison.OrdinalIgnoreCase))
                {
                    var photos = JsonNode.Parse(text) as JsonArray;
                    if (photos == null) continue;
                    var changed = false;
                    for (var i = 0; i < photos.Count; i++)
                        if (photos[i] is JsonValue photo && photo.TryGetValue<string>(out var path) && IsLocal(path))
                        { var replacement = transform(path); if (replacement != path) { photos[i] = replacement; changed = true; } }
                    if (changed) obj[pair.Key] = photos.ToJsonString();
                }
                else if ((name.Equals("PhotoUrl", StringComparison.OrdinalIgnoreCase) || name.Equals("SignatureUrl", StringComparison.OrdinalIgnoreCase)) && IsLocal(text))
                    obj[pair.Key] = transform(text);
            }
            else Transform(pair.Value, transform);
        }
    }

    private static bool IsLocal(string path) => !string.IsNullOrWhiteSpace(path)
        && !path.StartsWith("data:", StringComparison.OrdinalIgnoreCase)
        && !path.StartsWith("//", StringComparison.Ordinal)
        && (path.StartsWith('/') || !Uri.TryCreate(path, UriKind.Absolute, out _));
}
