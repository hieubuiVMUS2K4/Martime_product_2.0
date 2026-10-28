using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.Security;
using ProductApi.Services;
using ProductApi.Services.CrewManagement;
using ProductApi.Services.Sync;
using Xunit;

namespace ProductApi.Tests;

public class PmsCapabilityAuthenticationTests
{
    [Theory]
    [InlineData("/api/sync/pms-capabilities")]
    [InlineData("/api/Sync/pms-capabilities")]
    public void CapabilityGetUsesSameAuthenticationBranchesAsSyncBatch(string path)
    {
        var http = new DefaultHttpContext(); http.Request.Method = "GET"; http.Request.Path = path;
        Assert.True(SyncRequestVerificationMiddleware.IsProtectedSyncRequest(http.Request));
    }

    [Fact]
    public async Task ProvisionedTokenReachesCapabilityEndpointWithVerifiedNodeIdentity()
    {
        var configuration = new ConfigurationBuilder().Build();
        var provisioning = new Mock<IVesselProvisioningService>();
        provisioning.Setup(p => p.ValidateNodeTokenAsync("test-node-token")).ReturnsAsync(new SyncNodeTracker
            { NodeId = "PMS-TEST-NODE", VesselId = Guid.NewGuid(), ImoNumber = "9654327" });
        var node = new NodeApiTokenMiddleware(provisioning.Object, configuration, NullLogger<NodeApiTokenMiddleware>.Instance);
        using var services = new ServiceCollection().BuildServiceProvider();
        var builder = new ApplicationBuilder(services);
        builder.UseWhen(ctx => SyncRequestVerificationMiddleware.IsProtectedSyncRequest(ctx.Request),
            branch => branch.Use(next => ctx => node.InvokeAsync(ctx, next)));
        builder.Run(ctx => { ctx.Response.StatusCode = ctx.Items["VerifiedSyncNodeId"] as string == "PMS-TEST-NODE" ? 200 : 401; return Task.CompletedTask; });
        var http = new DefaultHttpContext(); http.Request.Method = "GET"; http.Request.Path = "/api/sync/pms-capabilities";
        http.Request.Headers["X-Node-Api-Token"] = "test-node-token";
        await builder.Build()(http);
        Assert.Equal(200, http.Response.StatusCode);
        provisioning.Verify(p => p.ValidateNodeTokenAsync("test-node-token"), Times.Once);
    }

    [Fact]
    public async Task CapabilityRequestCannotBypassRequiredHmacSigning()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>
            { ["SyncSecurity:RequireSignedRequests"] = "true" }).Build();
        using var cache = new MemoryCache(new MemoryCacheOptions());
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql("Host=localhost;Database=unused;Username=unused").Options);
        var verification = new SyncRequestVerificationMiddleware(configuration, cache, db, Mock.Of<IAuditService>(),
            Mock.Of<IDataEncryptionService>(), NullLogger<SyncRequestVerificationMiddleware>.Instance, Mock.Of<ISyncNonceRegistryService>());
        using var services = new ServiceCollection().BuildServiceProvider();
        var builder = new ApplicationBuilder(services);
        builder.UseWhen(ctx => SyncRequestVerificationMiddleware.IsProtectedSyncRequest(ctx.Request),
            branch => branch.Use(next => ctx => verification.InvokeAsync(ctx, next)));
        var reached = false;
        builder.Run(ctx => { reached = true; return Task.CompletedTask; });
        var http = new DefaultHttpContext(); http.RequestServices = new ServiceCollection().AddLogging().BuildServiceProvider();
        http.Request.Method = "GET"; http.Request.Path = "/api/sync/pms-capabilities"; http.Response.Body = new MemoryStream();
        await builder.Build()(http);
        Assert.Equal(401, http.Response.StatusCode); Assert.False(reached);
    }
}
