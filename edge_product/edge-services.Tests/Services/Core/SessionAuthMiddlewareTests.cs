using MaritimeEdge.Data;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Controllers.Core;
using MaritimeEdge.DTOs;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Moq;
using MaritimeEdge.Models;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

public class SessionAuthMiddlewareTests
{
    private static EdgeDbContext Database() => new(new DbContextOptionsBuilder<EdgeDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options) { SuppressSyncQueue = true };

    [Fact]
    public async Task NavigationRead_ResolvesCrewIdentityRatherThanSkippingAuthentication()
    {
        await using var db = Database();
        var role = new Role { RoleCode = "CREW", RoleName = "Crew" };
        db.Roles.Add(role);
        var user = new User { Username = "test-chief-officer", Role = role, PasswordHash = "test", IsActive = true };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        db.UserSessions.Add(new() { Id = Guid.NewGuid(), UserId = user.Id, AccessToken = "test-navigation-token",
            RefreshToken = "test-refresh", IsActive = true, AccessTokenExpiresAt = DateTime.UtcNow.AddHours(1),
            RefreshTokenExpiresAt = DateTime.UtcNow.AddDays(1), LoginAt = DateTime.UtcNow, LastActivityAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/telemetry/navigation/latest";
        context.Request.Method = "GET";
        context.Request.Headers.Authorization = "Bearer test-navigation-token";
        var middleware = new SessionAuthMiddleware(http => {
            Assert.Equal(user.Id, http.GetUserId());
            Assert.Equal("CREW", http.GetRoleCode());
            return Task.CompletedTask;
        }, NullLogger<SessionAuthMiddleware>.Instance);
        await middleware.InvokeAsync(context, db, cache);
        Assert.Equal(user.Id, context.GetUserId());
    }

    [Theory]
    [InlineData("/api/telemetry/navigation", "POST", true)]
    [InlineData("/api/telemetry/navigation/", "POST", true)]
    [InlineData("/api/telemetry/navigation/latest", "GET", false)]
    [InlineData("/api/telemetry/navigation/latest", "POST", false)]
    public async Task OnlySensorUpload_IsAnonymous(string path, string method, bool allowed)
    {
        await using var db = Database();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var context = new DefaultHttpContext();
        context.Request.Path = path; context.Request.Method = method;
        var reachedController = false;
        var middleware = new SessionAuthMiddleware(_ => { reachedController = true; return Task.CompletedTask; },
            NullLogger<SessionAuthMiddleware>.Instance);
        await middleware.InvokeAsync(context, db, cache);
        Assert.Equal(allowed, reachedController);
        Assert.Equal(allowed ? 200 : 401, context.Response.StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("Bearer expired-access-token")]
    public async Task Refresh_ReachesControllerWithoutValidAccessToken(string? header)
    {
        await using var db = Database();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/auth/refresh";
        context.Request.Method = "POST";
        if (header != null) context.Request.Headers.Authorization = header;
        var reachedController = false;
        var middleware = new SessionAuthMiddleware(_ => { reachedController = true; return Task.CompletedTask; },
            NullLogger<SessionAuthMiddleware>.Instance);
        await middleware.InvokeAsync(context, db, cache);
        Assert.True(reachedController);
    }

    [Theory]
    [InlineData("/api/auth/refresh", "GET")]
    [InlineData("/api/auth/refresh/other", "POST")]
    [InlineData("/api/auth/users", "GET")]
    public async Task OtherEndpoints_StillRejectMissingCredentials(string path, string method)
    {
        await using var db = Database();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var context = new DefaultHttpContext();
        context.Request.Path = path;
        context.Request.Method = method;
        var middleware = new SessionAuthMiddleware(_ => throw new Exception("Must not reach controller"),
            NullLogger<SessionAuthMiddleware>.Instance);
        await middleware.InvokeAsync(context, db, cache);
        Assert.Equal(401, context.Response.StatusCode);
    }

    [Fact]
    public async Task DatabaseFailure_ReturnsServiceUnavailableRatherThanInvalidSession()
    {
        var db = Database();
        await db.DisposeAsync();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/auth/validate";
        context.Request.Headers.Authorization = "Bearer test-token";
        var middleware = new SessionAuthMiddleware(_ => throw new Exception("Must not reach controller"),
            NullLogger<SessionAuthMiddleware>.Instance);
        await middleware.InvokeAsync(context, db, cache);
        Assert.Equal(503, context.Response.StatusCode);
    }

    [Fact]
    public async Task AuthService_DatabaseFailureDoesNotReportRevokedCredentials()
    {
        var db = Database();
        await db.DisposeAsync();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            { ["Auth:TokenSigningKey"] = new string('x', 32) }).Build();
        var service = new AuthService(db, cache, NullLogger<AuthService>.Instance,
            Mock.Of<ISystemLogService>(), configuration);
        await Assert.ThrowsAsync<AuthSessionUnavailableException>(() => service.ValidateSessionAsync("test-token"));
        await Assert.ThrowsAsync<AuthSessionUnavailableException>(() => service.RefreshTokenAsync("test-refresh", null));
    }

    [Fact]
    public async Task AuthController_ServiceFailureReturns503ForValidateAndRefresh()
    {
        await using var db = Database();
        var auth = new Mock<IAuthService>();
        auth.Setup(s => s.ValidateSessionAsync("test-token"))
            .ThrowsAsync(new AuthSessionUnavailableException(new Exception("Database unavailable")));
        auth.Setup(s => s.RefreshTokenAsync("test-refresh", It.IsAny<string?>()))
            .ThrowsAsync(new AuthSessionUnavailableException(new Exception("Database unavailable")));
        var context = new DefaultHttpContext();
        context.Request.Headers.Authorization = "Bearer test-token";
        var controller = new AuthController(auth.Object, Mock.Of<ISystemLogService>(), db,
            NullLogger<AuthController>.Instance) { ControllerContext = new ControllerContext { HttpContext = context } };
        Assert.Equal(503, Assert.IsType<ObjectResult>(await controller.ValidateSession()).StatusCode);
        Assert.Equal(503, Assert.IsType<ObjectResult>(await controller.RefreshToken(new TokenRefreshRequest
            { RefreshToken = "test-refresh" })).StatusCode);
    }
}
