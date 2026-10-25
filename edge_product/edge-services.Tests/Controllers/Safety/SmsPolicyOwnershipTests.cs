using System.Text;
using System.Text.Json;
using MaritimeEdge.Controllers.Safety;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace MaritimeEdge.Tests.Controllers.Safety;

public class SmsPolicyOwnershipTests
{
    private static EdgeDbContext CreateContext() => new(
        new DbContextOptionsBuilder<EdgeDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options)
        { SuppressSyncQueue = true };

    private static SmsController Controller(EdgeDbContext db) => new(
        db, NullLogger<SmsController>.Instance, new ConfigurationBuilder().Build());

    private static async Task<SmsProcedure> SeedPolicy(EdgeDbContext db)
    {
        var policy = new SmsProcedure
        {
            IsmElementId = 1, ProcedureCode = "POLICY-01", Title = "Shore policy",
            Content = "Issued by shore", FilePath = "/uploads/sms/shore-policy.pdf",
            Version = "Rev 1.0", OriginNode = "SHORE", IsSynced = true
        };
        db.IsmElements.Add(new IsmElement { Id = 1, ChapterName = "Policy" });
        policy.FormTemplates.Add(new SmsFormTemplate
        {
            FormCode = "FORM-01", Title = "Shore template", OriginNode = "SHORE"
        });
        db.SmsProcedures.Add(policy);
        await db.SaveChangesAsync();
        return policy;
    }

    [Theory]
    [InlineData("import")]
    [InlineData("create")]
    [InlineData("version")]
    [InlineData("delete")]
    [InlineData("create-template")]
    [InlineData("assign-template")]
    [InlineData("delete-template")]
    public async Task EdgePolicyMutation_IsForbidden_AndPreservesShoreDocument(string operation)
    {
        await using var db = CreateContext();
        var policy = await SeedPolicy(db);
        var templateId = policy.FormTemplates.Single().Id;
        var controller = Controller(db);
        using var fileContent = new MemoryStream(Encoding.UTF8.GetBytes("Edge replacement"));
        var result = operation switch
        {
            "import" => await controller.ImportDocx(new FormFile(fileContent, 0, fileContent.Length, "file", "replacement.pdf")),
            "create" => await controller.CreateProcedure(new CreateProcedureRequest { IsmElementId = 1, Title = "Edge policy" }),
            "version" => await controller.BumpProcedureVersion(new BumpVersionRequest
                { ProcedureId = policy.Id, NewVersion = "Rev 2.0", NewContent = "Edge replacement" }),
            "delete" => await controller.DeleteProcedure(policy.Id),
            "create-template" => await controller.CreateFormTemplate(new CreateFormTemplateRequest
                { SmsProcedureId = policy.Id, FormCode = "EDGE-FORM", Title = "Edge template" }),
            "assign-template" => await controller.AssignTemplates(policy.Id, [templateId]),
            "delete-template" => await controller.DeleteFormTemplate(templateId),
            _ => throw new ArgumentOutOfRangeException(nameof(operation))
        };

        var forbidden = Assert.IsType<ObjectResult>(result);
        Assert.Equal(StatusCodes.Status403Forbidden, forbidden.StatusCode);
        var response = JsonSerializer.SerializeToElement(forbidden.Value);
        Assert.Equal("SMS_POLICY_SHORE_ONLY", response.GetProperty("code").GetString());
        Assert.Equal(0, fileContent.Position);
        db.ChangeTracker.Clear();
        var stored = Assert.Single(await db.SmsProcedures.ToListAsync());
        Assert.Equal("Rev 1.0", stored.Version);
        Assert.Equal("Issued by shore", stored.Content);
        Assert.Equal("/uploads/sms/shore-policy.pdf", stored.FilePath);
        Assert.Single(await db.SmsFormTemplates.ToListAsync());
        Assert.Empty(await db.SyncQueue.ToListAsync());
    }

    [Fact]
    public async Task EdgeCanReadShorePolicy_WithItsDownloadPathAndTemplates()
    {
        await using var db = CreateContext();
        var policy = await SeedPolicy(db);
        var controller = Controller(db);

        Assert.IsType<OkObjectResult>(await controller.GetSmsTree(null));
        var detail = Assert.IsType<OkObjectResult>(await controller.GetProcedure(policy.Id));
        var response = JsonSerializer.SerializeToElement(detail.Value);
        Assert.Equal(policy.FilePath, response.GetProperty("FilePath").GetString());
        Assert.Equal("Issued by shore", response.GetProperty("Content").GetString());
        Assert.Single(response.GetProperty("FormTemplates").EnumerateArray());
        Assert.IsType<OkObjectResult>(await controller.GetFormTemplate(policy.FormTemplates.Single().Id));
    }
}
