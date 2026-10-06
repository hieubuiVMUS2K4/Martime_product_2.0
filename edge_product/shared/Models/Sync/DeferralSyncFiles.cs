using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Maritime.Shared.Models.Sync;

/// <summary>Stable file roles prevent late uploads from replacing newer deferral evidence.</summary>
public static class DeferralSyncFiles
{
    public static string Role(string path, bool letter = false) =>
        (letter ? "class_permission_letter_" : "deferral_attachment_")
        + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(path))).ToLowerInvariant()[..24];

    public static IEnumerable<(string Role, string Path)> References(string payload)
    {
        using var document = JsonDocument.Parse(payload);
        var result = new List<(string, string)>();
        foreach (var property in document.RootElement.EnumerateObject())
        {
            var name = property.Name.Replace("_", "");
            if (name.Equals("ClassPermissionLetter", StringComparison.OrdinalIgnoreCase)
                && property.Value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(property.Value.GetString()))
            {
                var path = property.Value.GetString()!;
                result.Add((Role(path, true), path));
            }
            if (name.Equals("Attachments", StringComparison.OrdinalIgnoreCase) && property.Value.ValueKind == JsonValueKind.String)
                foreach (var path in JsonSerializer.Deserialize<List<string>>(property.Value.GetString()!) ?? [])
                    if (!string.IsNullOrWhiteSpace(path)) result.Add((Role(path), path));
        }
        return result.Distinct();
    }

    public static string? RewriteAttachments(string? attachments, string role, string storagePath)
    {
        if (attachments == null) return null;
        var paths = JsonSerializer.Deserialize<List<string>>(attachments) ?? [];
        var changed = false;
        for (var i = 0; i < paths.Count; i++)
            if (!string.IsNullOrWhiteSpace(paths[i]) && Role(paths[i]) == role)
            { paths[i] = storagePath; changed = true; }
        return changed ? JsonSerializer.Serialize(paths) : attachments;
    }

    public static string? RewriteLetter(string? letter, string role, string storagePath) =>
        !string.IsNullOrWhiteSpace(letter) && Role(letter, true) == role ? storagePath : letter;
}
