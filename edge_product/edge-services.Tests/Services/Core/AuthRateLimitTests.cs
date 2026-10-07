using MaritimeEdge.Controllers.Core;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using System.Reflection;
using Xunit;

namespace MaritimeEdge.Tests.Services.Core;

public class AuthRateLimitTests
{
    private static string? Policy(MethodInfo action) =>
        (action.GetCustomAttribute<EnableRateLimitingAttribute>() ??
         typeof(AuthController).GetCustomAttribute<EnableRateLimitingAttribute>())?.PolicyName;

    [Fact]
    public void ReadingAccountsAndSessionMetadata_DoesNotConsumeLoginQuota()
    {
        var reads = typeof(AuthController).GetMethods()
            .Where(method => method.GetCustomAttribute<HttpGetAttribute>() != null).ToArray();
        Assert.NotEmpty(reads);
        foreach (var read in reads) Assert.Equal("fixed", Policy(read));
    }

    [Theory]
    [InlineData("Login")]
    [InlineData("LoginLegacy")]
    public void BothLoginEndpoints_KeepStrictBruteForceLimit(string action)
    {
        Assert.Equal("auth", Policy(typeof(AuthController).GetMethod(action)!));
    }

    [Theory]
    [InlineData("RefreshToken")]
    [InlineData("Logout")]
    [InlineData("UpdateUserRole")]
    [InlineData("ToggleUserActive")]
    public void SessionAndAccountOperations_DoNotConsumeLoginQuota(string action)
    {
        Assert.Equal("fixed", Policy(typeof(AuthController).GetMethod(action)!));
    }
}
