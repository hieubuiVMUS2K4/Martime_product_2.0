using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

public class AdminAccountSeedTests
{
    private static EdgeDbContext Database() => new(new DbContextOptionsBuilder<EdgeDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options) { SuppressSyncQueue = true };

    [Fact]
    public async Task Seed_CreatesAdminWithHashedPasswordAndReusesExistingRole()
    {
        await using var db = Database();
        var role = new Role { RoleCode = "ADMIN", RoleName = "Existing admin" };
        db.Roles.Add(role);
        await db.SaveChangesAsync();
        Assert.True(await AdminAccountSeed.SeedAsync(db));
        var user = await db.Users.SingleAsync();
        Assert.Equal(role.Id, user.RoleId);
        Assert.Equal("admin", user.Username);
        Assert.Null(user.CrewId);
        Assert.True(user.IsActive);
        Assert.True(user.MustChangePassword);
        Assert.True(AuthService.VerifyPassword("Admin@2026", user.PasswordHash, user.PasswordSalt!));
        Assert.Single(await db.Roles.ToListAsync());
    }

    [Fact]
    public async Task Seed_RepeatedStartupPreservesPasswordAndAccountState()
    {
        await using var db = Database();
        Assert.True(await AdminAccountSeed.SeedAsync(db));
        var user = await db.Users.SingleAsync();
        var (hash, salt) = AuthService.HashPassword("Changed-password-2026!");
        user.PasswordHash = hash;
        user.PasswordSalt = salt;
        user.Username = "ADMIN";
        user.IsActive = false;
        user.MustChangePassword = false;
        await db.SaveChangesAsync();
        Assert.False(await AdminAccountSeed.SeedAsync(db));
        Assert.Equal(hash, user.PasswordHash);
        Assert.Equal(salt, user.PasswordSalt);
        Assert.False(user.IsActive);
        Assert.False(user.MustChangePassword);
        Assert.Single(await db.Users.ToListAsync());
        Assert.Single(await db.Roles.ToListAsync());
    }
}
