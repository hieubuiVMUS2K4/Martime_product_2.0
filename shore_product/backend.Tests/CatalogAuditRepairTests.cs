using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProductApi.Controllers.Pms;
using ProductApi.Data;
using ProductApi.Models;
using Xunit;

namespace ProductApi.Tests;

public partial class SyncReliabilityTests
{
    [ShorePostgresFact]
    public async Task EquipmentGroups_CanListAndLinkAssets_WithoutDuplicateMembers()
    {
        await using var db = await Database();
        try
        {
            var asset = new EquipmentAsset { AssetCode = "TEST-01", AssetName = "Test engine", Category = "ENGINE" };
            db.EquipmentAssets.Add(asset);
            await db.SaveChangesAsync();
            var api = new EquipmentGroupsController(db);
            Assert.IsType<CreatedAtActionResult>(await api.Create(new EquipmentGroup
                { GroupCode = "TEST-GROUP", GroupName = "Test group" }));
            var group = await db.EquipmentGroups.SingleAsync();
            Assert.IsType<ConflictObjectResult>(await api.Create(new EquipmentGroup
                { GroupCode = "TEST-GROUP", GroupName = "Duplicate" }));
            Assert.IsType<NoContentResult>(await api.AddAsset(group.Id, asset.Id));
            Assert.IsType<NoContentResult>(await api.AddAsset(group.Id, asset.Id));
            Assert.Equal(1, await db.EquipmentGroupMembers.CountAsync());
            var list = Assert.IsType<OkObjectResult>(await api.GetAll());
            Assert.Equal(1, JsonSerializer.SerializeToElement(list.Value)[0].GetProperty("MemberCount").GetInt32());
            var members = Assert.IsType<OkObjectResult>(await api.GetMembers(group.Id));
            Assert.Equal(asset.Id, JsonSerializer.SerializeToElement(members.Value)[0].GetProperty("Id").GetGuid());
            Assert.IsType<NoContentResult>(await api.Delete(group.Id));
            Assert.False(group.IsActive);
            Assert.Equal(1, await db.EquipmentGroupMembers.CountAsync());
            Assert.IsType<NotFoundResult>(await api.AddAsset(group.Id, asset.Id));
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }

    [ShorePostgresFact]
    public async Task SmsSeed_RepairsPartialCatalog_WithoutOverwritingCompanyPolicy()
    {
        await using var db = await Database();
        try
        {
            db.IsmElements.Add(new IsmElement { Id = 1, ChapterName = "Company topic" });
            var existing = new SmsProcedure
            {
                ProcedureCode = "SOP-01-01", IsmElementId = 1, Title = "Company policy",
                Content = "Approved company content", Version = "Rev 7"
            };
            db.SmsProcedures.Add(existing);
            await db.SaveChangesAsync();
            await SmsSeedData.SeedAsync(db);
            var count = await db.SmsProcedures.CountAsync();
            var forms = await db.SmsFormTemplates.CountAsync();
            Assert.Equal(16, await db.IsmElements.CountAsync());
            Assert.Equal(existing.Id, (await db.SmsFormTemplates.SingleAsync(f => f.FormCode == "BM-01")).SmsProcedureId);
            await SmsSeedData.SeedAsync(db);
            Assert.Equal(count, await db.SmsProcedures.CountAsync());
            Assert.Equal(forms, await db.SmsFormTemplates.CountAsync());
            Assert.Equal("Approved company content", existing.Content);
            Assert.Equal("Rev 7", existing.Version);
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }
}
