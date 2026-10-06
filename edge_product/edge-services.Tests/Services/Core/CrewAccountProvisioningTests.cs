using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using Microsoft.EntityFrameworkCore;
using Xunit;
using Maritime.Shared.Models.Crew;

namespace MaritimeEdge.Tests.Services.Core;

public class CrewAccountProvisioningTests
{
    private static EdgeDbContext CreateContext() => new(new DbContextOptionsBuilder<EdgeDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    [Fact]
    public async Task CreatesCrewRoleAndAccountWithoutChangingExistingAccounts()
    {
        using var context = CreateContext();
        context.Roles.Add(new Role { Id = 1, RoleCode = "ADMIN", RoleName = "Administrator" });
        var crew = new CrewMember { Id = Guid.NewGuid(), CrewId = "AAA", FullName = "Test Crew",
            DateOfBirth = new DateTime(2015, 10, 12, 0, 0, 0, DateTimeKind.Utc), IsOnboard = true };
        context.CrewMembers.Add(crew);
        await context.SaveChangesAsync();

        Assert.True(await CrewAccountProvisioning.EnsureAccountAsync(context, crew));
        var user = await context.Users.SingleAsync();
        var role = await context.Roles.SingleAsync(r => r.Id == user.RoleId);
        Assert.Equal("CREW", role.RoleCode);
        Assert.NotEqual(1, role.Id);
        Assert.True(user.MustChangePassword);
        Assert.False(string.IsNullOrEmpty(user.PasswordSalt));
        Assert.True(AuthService.VerifyPassword("12102015", user.PasswordHash, user.PasswordSalt!));
        Assert.False(AuthService.VerifyPassword("wrong-password", user.PasswordHash, user.PasswordSalt!));
        var originalHash = user.PasswordHash;
        user.RoleId = 1;
        await context.SaveChangesAsync();
        Assert.False(await CrewAccountProvisioning.EnsureAccountAsync(context, crew));
        Assert.Equal(originalHash, user.PasswordHash);
        Assert.Equal(1, user.RoleId);
        Assert.Single(await context.Users.ToListAsync());
    }

    [Fact]
    public async Task BackfillCreatesOnlyApprovedOrOnboardAccountsAndIsRepeatable()
    {
        using var context = CreateContext();
        context.CrewMembers.AddRange(
            new CrewMember { Id = Guid.NewGuid(), CrewId = "APPROVED", FullName = "Approved", OnboardStatus = "Approved" },
            new CrewMember { Id = Guid.NewGuid(), CrewId = "ONBOARD", FullName = "Onboard", IsOnboard = true },
            new CrewMember { Id = Guid.NewGuid(), CrewId = "PENDING", FullName = "Pending", OnboardStatus = "PendingReview", IsOnboard = false });
        await context.SaveChangesAsync();
        Assert.Equal(2, await CrewAccountProvisioning.BackfillApprovedCrewAsync(context));
        Assert.Equal(0, await CrewAccountProvisioning.BackfillApprovedCrewAsync(context));
        Assert.False(await context.Users.AnyAsync(u => u.CrewId == "PENDING"));
        Assert.Single(await context.Roles.ToListAsync());
    }

    [Fact]
    public async Task DoesNotReactivateDisabledCrewRole()
    {
        using var context = CreateContext();
        context.Roles.Add(new Role { RoleCode = "CREW", RoleName = "Crew", IsActive = false });
        await context.SaveChangesAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CrewAccountProvisioning.EnsureAccountAsync(context,
                new CrewMember { CrewId = "NEW", FullName = "New Crew" }));
        Assert.Empty(await context.Users.ToListAsync());
        Assert.False((await context.Roles.SingleAsync()).IsActive);
    }
}
