using System.Net;
using System.Text;
using System.Text.Json;
using MaritimeEdge.Controllers.Core;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Security;
using MaritimeEdge.Services.Core;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace MaritimeEdge.Tests.Controllers.Core;

public class EdgeProvisioningControllerTests
{
    private static EdgeDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<EdgeDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new EdgeDbContext(options);
    }

    private static EdgeProvisioningController CreateController(
        EdgeDbContext db,
        string handshakeResponse)
    {
        var encryption = new Mock<IEdgeDataEncryptionService>();
        encryption.Setup(e => e.Decrypt(It.IsAny<string?>())).Returns((string? value) => value);

        var client = new HttpClient(new StubHttpMessageHandler(handshakeResponse));
        var factory = new Mock<IHttpClientFactory>();
        factory.Setup(f => f.CreateClient(It.IsAny<string>())).Returns(client);

        return new EdgeProvisioningController(
            db,
            encryption.Object,
            Mock.Of<IEdgeRuntimeConfigService>(),
            factory.Object,
            new EdgeVesselSwitchService(db, encryption.Object, factory.Object, NullLogger<EdgeVesselSwitchService>.Instance),
            Mock.Of<IServiceScopeFactory>(),
            NullLogger<EdgeProvisioningController>.Instance);
    }

    [Fact]
    public async Task TestConnection_ShoreReturnsDifferentVesselIdentity_MarksProfileFailed()
    {
        using var db = CreateContext();
        var vesselId = Guid.NewGuid();
        var profile = CreateProfile(vesselId);
        db.EdgeProvisioningProfiles.Add(profile);
        await db.SaveChangesAsync();

        var response = JsonSerializer.Serialize(new
        {
            accepted = true,
            nodeId = profile.NodeId,
            vesselImo = "1111111",
            shoreVesselId = vesselId
        });
        var controller = CreateController(db, response);

        var result = await controller.TestConnection(
            new EdgeProvisioningController.ProfileActionRequest { ProfileId = profile.Id });

        Assert.IsType<OkObjectResult>(result);
        Assert.Equal("failed", profile.HandshakeStatus);
        Assert.Contains("different node/vessel identity", profile.LastHandshakeError);
    }

    [Fact]
    public async Task TestConnection_ShoreReturnsMatchingVesselIdentity_MarksProfileSuccessful()
    {
        using var db = CreateContext();
        var vesselId = Guid.NewGuid();
        var profile = CreateProfile(vesselId);
        db.EdgeProvisioningProfiles.Add(profile);
        await db.SaveChangesAsync();

        var response = JsonSerializer.Serialize(new
        {
            accepted = true,
            nodeId = profile.NodeId,
            vesselImo = profile.VesselImo,
            shoreVesselId = vesselId
        });
        var controller = CreateController(db, response);

        var result = await controller.TestConnection(
            new EdgeProvisioningController.ProfileActionRequest { ProfileId = profile.Id });

        Assert.IsType<OkObjectResult>(result);
        Assert.Equal("success", profile.HandshakeStatus);
        Assert.Null(profile.LastHandshakeError);
    }

    [Fact]
    public async Task Activate_ProfileWithoutSuccessfulHandshake_ReturnsBadRequest()
    {
        using var db = CreateContext();
        var profile = CreateProfile(Guid.NewGuid());
        profile.HandshakeStatus = "never";
        db.EdgeProvisioningProfiles.Add(profile);
        await db.SaveChangesAsync();

        var controller = CreateController(db, "{}");

        var result = await controller.Activate(
            new EdgeProvisioningController.ProfileActionRequest { ProfileId = profile.Id });

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.False(profile.IsActive);
    }

    [Fact]
    public async Task Activate_NewKeyForSameVessel_LeavesOnlyOneActiveProfile_AndKeepsData()
    {
        using var db = CreateContext();
        var vesselId = Guid.NewGuid();
        var currentProfile = CreateProfile(vesselId);
        currentProfile.IsActive = true;
        currentProfile.HandshakeStatus = "success";
        currentProfile.LastHandshakeAt = DateTime.UtcNow;

        // Cùng tàu (xoay khoá): không xoá dữ liệu.
        var replacementProfile = CreateProfile(vesselId);
        replacementProfile.KeyVersion = 2;
        replacementProfile.HandshakeStatus = "success";
        replacementProfile.LastHandshakeAt = DateTime.UtcNow;

        db.EdgeProvisioningProfiles.AddRange(currentProfile, replacementProfile);
        await db.SaveChangesAsync();

        var controller = CreateController(db, "{}");
        var result = await controller.Activate(
            new EdgeProvisioningController.ProfileActionRequest { ProfileId = replacementProfile.Id });

        Assert.IsType<OkObjectResult>(result);
        Assert.Single(await db.EdgeProvisioningProfiles.Where(profile => profile.IsActive).ToListAsync());
        Assert.True(replacementProfile.IsActive);
        Assert.False(currentProfile.IsActive);
        Assert.Equal("9292929", (await db.ShipData.SingleAsync()).ImoNumber);
    }

    [Fact]
    public async Task Activate_ProfileOfAnotherVessel_WithoutConfirmation_IsRefused_AndChangesNothing()
    {
        using var db = CreateContext();
        var currentProfile = CreateProfile(Guid.NewGuid());
        currentProfile.IsActive = true;
        currentProfile.HandshakeStatus = "success";
        currentProfile.LastHandshakeAt = DateTime.UtcNow;
        var otherShip = CreateProfile(Guid.NewGuid());
        otherShip.NodeId = "edge-9393939-main";
        otherShip.VesselImo = "9393939";
        otherShip.HandshakeStatus = "success";
        otherShip.LastHandshakeAt = DateTime.UtcNow;
        db.EdgeProvisioningProfiles.AddRange(currentProfile, otherShip);
        await db.SaveChangesAsync();

        var result = await CreateController(db, "{}").Activate(
            new EdgeProvisioningController.ProfileActionRequest { ProfileId = otherShip.Id });

        Assert.IsType<ConflictObjectResult>(result);
        Assert.True(currentProfile.IsActive);
        Assert.False(otherShip.IsActive);
    }

    [Fact]
    public async Task Import_DoesNotChangeShipIdentity_UntilActivated()
    {
        using var db = CreateContext();
        db.ShipData.Add(new ShipData { Id = Guid.NewGuid(), ImoNumber = "1111111", ShipName = "MV CURRENT", CallSign = "", Flag = "", PortOfRegistry = "" });
        await db.SaveChangesAsync();
        var json = JsonSerializer.Serialize(new
        {
            schemaVersion = "1.0",
            vessel = new { imo = "2222222", name = "MV NEXT", shoreVesselId = Guid.NewGuid().ToString() },
            shoreConnection = new { baseUrl = "http://localhost:5000" },
            nodeCredentials = new { nodeId = "edge-2222222-main", nodeApiToken = "t", signingKey = "k", keyVersion = 1, protocolVersion = "2" }
        });
        var bytes = Encoding.UTF8.GetBytes(json);
        var file = new Microsoft.AspNetCore.Http.FormFile(new MemoryStream(bytes), 0, bytes.Length, "file", "edge-provisioning.json");

        var encryption = new Mock<IEdgeDataEncryptionService>();
        encryption.Setup(e => e.Encrypt(It.IsAny<string?>())).Returns((string? v) => v!);
        var controller = new EdgeProvisioningController(db, encryption.Object, Mock.Of<IEdgeRuntimeConfigService>(),
            Mock.Of<IHttpClientFactory>(), Mock.Of<IEdgeVesselSwitchService>(), Mock.Of<IServiceScopeFactory>(),
            NullLogger<EdgeProvisioningController>.Instance);

        Assert.IsType<OkObjectResult>(await controller.Import(file));
        Assert.Equal("1111111", (await db.ShipData.SingleAsync()).ImoNumber);
    }

    private static EdgeProvisioningProfile CreateProfile(Guid vesselId) => new()
    {
        NodeId = "edge-9292929-main",
        VesselImo = "9292929",
        VesselName = "MV Test",
        VesselId = vesselId,
        ShoreBaseUrl = "https://shore.example",
        NodeApiToken = "plaintext-token",
        SigningKey = "plaintext-signing-key",
        HandshakeStatus = "never"
    };

    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private readonly string _response;

        public StubHttpMessageHandler(string response)
        {
            _response = response;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_response, Encoding.UTF8, "application/json")
            });
        }
    }
}
