using System.Text.Json;
using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Core;

public record PermissionModule(string Code, string Name, string Group, string[] Routes, string[] Actions);
public record PermissionBinding(string Controller, string Action, string[] Grants);
public record PermissionRegistryData(PermissionModule[] Modules, PermissionBinding[] Bindings);
public static class PermissionRegistry
{
    public static readonly string[] DefaultGrants = ["dashboard.access", "dashboard.view"];
    public static readonly PermissionRegistryData Data = Load();
    public static readonly HashSet<string> Codes = Data.Modules
        .SelectMany(m => m.Actions.Append("access").Select(a => m.Code + "." + a)).ToHashSet();
    private static PermissionRegistryData Load()
    {
        using var stream = typeof(PermissionRegistry).Assembly.GetManifestResourceStream("permissions.registry.json")!;
        return JsonSerializer.Deserialize<PermissionRegistryData>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    }
    public static string[]? Resolve(string controller, string action) => Data.Bindings
        .FirstOrDefault(b => b.Controller == controller && b.Action == action)?.Grants;
    public static bool Allows(ISet<string> grants, string permission)
    {
        var module = permission[..permission.LastIndexOf('.')];
        if (!grants.Contains(module + ".access") || !Codes.Contains(permission)) return false;
        var action = permission[(permission.LastIndexOf('.') + 1)..];
        if (action is "access" or "view") return true;
        var bundle = action switch {
            "create" or "delete" or "import" => new[] { "create", "delete", "import" },
            "update" or "assign" => new[] { "update", "assign" },
            _ => new[] { action }
        };
        return bundle.Any(a => Codes.Contains(module + "." + a) && grants.Contains(module + "." + a));
    }
    public static string[] ConfigurableGrants(IEnumerable<string> grants)
    {
        var source = grants.Where(Codes.Contains).ToHashSet();
        return Codes.Where(g => !DefaultGrants.Contains(g) && Allows(source, g)).ToArray();
    }
}

public record EffectivePermissions(bool IsAdmin, int? RankId, string? RankName, string[] Grants, bool IsAccountActive = true);
public sealed class RankPermissionService(EdgeDbContext db)
{
    // Resolve current database identity every request: role/rank changes take effect without relogin.
    public async Task<EffectivePermissions> GetAsync(long userId)
    {
        var user = await db.Users.AsNoTracking().Include(u => u.Role)
            .SingleOrDefaultAsync(u => u.Id == userId && u.IsActive);
        if (user == null || user.Role?.IsActive != true) return new(false, null, null, [], false);
        if (user.Role.RoleCode.Equals("ADMIN", StringComparison.OrdinalIgnoreCase))
            return new(true, null, null, PermissionRegistry.Codes.ToArray());
        if (string.IsNullOrWhiteSpace(user.CrewId)) return new(false, null, null, PermissionRegistry.DefaultGrants.ToArray());
        var crew = await db.CrewMembers.AsNoTracking().Include(c => c.Rank)
            .SingleOrDefaultAsync(c => c.CrewId == user.CrewId);
        if (crew?.Rank?.IsActive != true) return new(false, null, null, PermissionRegistry.DefaultGrants.ToArray());
        var config = await db.RankPermissionConfigs.AsNoTracking().SingleOrDefaultAsync(p => p.RankId == crew.RankId);
        return new(false, crew.RankId, crew.Rank.RankName,
            PermissionRegistry.DefaultGrants.Concat(config == null ? [] :
                PermissionRegistry.ConfigurableGrants(JsonSerializer.Deserialize<string[]>(config.GrantsJson) ?? []))
                .Distinct().ToArray());
    }
}
