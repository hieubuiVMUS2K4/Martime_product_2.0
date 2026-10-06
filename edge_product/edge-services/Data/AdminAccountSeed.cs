using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Data;

public static class AdminAccountSeed
{
    public static async Task<bool> SeedAsync(EdgeDbContext context)
    {
        // Serialize startup seeds across PostgreSQL instances; never reset an existing account.
        await using var transaction = context.Database.IsRelational()
            ? await context.Database.BeginTransactionAsync()
            : null;
        if (context.Database.IsNpgsql())
            await context.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(2026100603, 1)");

        if (await context.Users.AnyAsync(u => u.Username.ToLower() == "admin"))
        {
            if (transaction != null) await transaction.CommitAsync();
            return false;
        }

        var role = await context.Roles.SingleOrDefaultAsync(r => r.RoleCode.ToUpper() == "ADMIN");
        if (role == null)
        {
            role = new Role { RoleCode = "ADMIN", RoleName = "Administrator", IsActive = true };
            context.Roles.Add(role);
        }
        else if (!role.IsActive)
        {
            throw new InvalidOperationException("Cannot seed admin account: ADMIN role is inactive.");
        }

        var (hash, salt) = AuthService.HashPassword("Admin@2026");
        context.Users.Add(new User
        {
            Username = "admin",
            PasswordHash = hash,
            PasswordSalt = salt,
            Role = role,
            IsActive = true,
            MustChangePassword = true,
            CreatedAt = DateTime.UtcNow
        });
        await context.SaveChangesAsync();
        if (transaction != null) await transaction.CommitAsync();
        return true;
    }
}
