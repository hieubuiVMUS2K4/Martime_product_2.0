using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace MaritimeEdge.Services.Core;

public static class CrewAccountProvisioning
{
    public static async Task<Role> EnsureCrewRoleAsync(EdgeDbContext context)
    {
        var role = await context.Roles.SingleOrDefaultAsync(r => r.RoleCode == "CREW");
        if (role != null)
        {
            if (!role.IsActive)
                throw new InvalidOperationException("CREW role is disabled; cannot provision crew accounts.");
            return role;
        }

        role = new Role { RoleCode = "CREW", RoleName = "Crew", Description = "Default crew account role" };
        context.Roles.Add(role);
        await context.SaveChangesAsync();
        return role;
    }

    public static async Task<bool> EnsureAccountAsync(EdgeDbContext context, CrewMember crew)
    {
        if (await context.Users.AnyAsync(u => u.Username == crew.CrewId || u.CrewId == crew.CrewId))
            return false;

        var role = await EnsureCrewRoleAsync(context);
        var password = crew.DateOfBirth.HasValue
            ? crew.DateOfBirth.Value.ToString("ddMMyyyy")
            : Convert.ToBase64String(RandomNumberGenerator.GetBytes(6));
        var (hash, salt) = AuthService.HashPassword(password);
        context.Users.Add(new User
        {
            Username = crew.CrewId,
            CrewId = crew.CrewId,
            RoleId = role.Id,
            PasswordHash = hash,
            PasswordSalt = salt,
            IsActive = true,
            MustChangePassword = true
        });
        await context.SaveChangesAsync();
        return true;
    }

    public static async Task<int> BackfillApprovedCrewAsync(EdgeDbContext context)
    {
        await EnsureCrewRoleAsync(context);
        var missing = await context.CrewMembers
            .Where(c => (c.IsOnboard || c.OnboardStatus == "Approved")
                && !context.Users.Any(u => u.Username == c.CrewId || u.CrewId == c.CrewId))
            .ToListAsync();
        var created = 0;
        foreach (var crew in missing)
            if (await EnsureAccountAsync(context, crew)) created++;
        return created;
    }
}
