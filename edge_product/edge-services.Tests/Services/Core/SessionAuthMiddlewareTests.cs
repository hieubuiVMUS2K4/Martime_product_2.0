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
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

public class SessionAuthMiddlewareTests
{
    private static EdgeDbContext Database() => new(new DbContextOptionsBuilder<EdgeDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options) { SuppressSyncQueue = true };

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
