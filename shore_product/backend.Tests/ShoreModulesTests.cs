using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;
using ProductApi.Controllers;
using ProductApi.Data;
using Xunit;

namespace ProductApi.Tests;

public class ShoreModulesTests
{
    private static AppDbContext Database()
    {
        var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("SHORE_PMS_TEST_CONNECTION_STRING"));
        if (connection.Database?.StartsWith("codex_pms_tests_", StringComparison.Ordinal) != true) throw new InvalidOperationException("Isolated database required");
        connection.Database += "_modules_" + Guid.NewGuid().ToString("N")[..8];
        return new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection.ConnectionString).Options);
    }
    private static ShoreModulesController Controller(AppDbContext db) => new(db) {
        ControllerContext = new() { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, "test-admin")], "Test")) } }
    };
    private static JsonElement Body(IActionResult result) => JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(result).Value);

    [ShorePostgresFact]
    public async Task DefaultsAndChanges_ArePersistedAcrossContexts_WithAuditAndVersion()
    {
        await using var db = Database(); await db.Database.EnsureCreatedAsync();
        try {
            var controller = Controller(db);
            Assert.Empty(Body(await controller.Get()).GetProperty("disabledModules").EnumerateArray());
            Assert.Equal(0, Body(await controller.Get()).GetProperty("version").GetInt32());
            var changed = Body(await controller.Update(new(0, ["pms", "pms", "approval-evidence"])));
            Assert.Equal(1, changed.GetProperty("version").GetInt32());
            Assert.Equal(2, changed.GetProperty("disabledModules").GetArrayLength());
            Assert.Equal("test-admin", changed.GetProperty("updatedBy").GetString());
            await using var reopened = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(db.Database.GetConnectionString()).Options);
            Assert.Equal(2, Body(await Controller(reopened).Get()).GetProperty("disabledModules").GetArrayLength());
            Assert.IsType<ConflictObjectResult>(await controller.Update(new(0, [])));
            Assert.Equal(1, Body(await controller.Get()).GetProperty("version").GetInt32());
            Assert.Empty(Body(await controller.Update(new(1, []))).GetProperty("disabledModules").EnumerateArray());
        } finally { await db.Database.EnsureDeletedAsync(); }
    }

    [ShorePostgresFact]
    public async Task UnknownKeys_AreRejectedWithoutChangingSettings()
    {
        await using var db = Database(); await db.Database.EnsureCreatedAsync();
        try {
            var controller = Controller(db);
            Assert.IsType<BadRequestObjectResult>(await controller.Update(new(0, ["not-a-module"])));
            Assert.False(await db.ShoreModuleSettings.AnyAsync());
        } finally { await db.Database.EnsureDeletedAsync(); }
    }

    [Fact]
    public void SavingSettings_RequiresAdministratorAndReadRequiresAuthentication()
    {
        Assert.Contains(typeof(ShoreModulesController).GetCustomAttributes(typeof(AuthorizeAttribute), true), _ => true);
        var auth = Assert.Single(typeof(ShoreModulesController).GetMethod(nameof(ShoreModulesController.Update))!.GetCustomAttributes(typeof(AuthorizeAttribute), true).Cast<AuthorizeAttribute>());
        Assert.Equal("Admin,SystemAdmin", auth.Roles);
        Assert.Equal(11, ShoreModulesController.ModuleKeys.Distinct().Count());
    }

    [ShorePostgresFact]
    public async Task Migration_CreatesSettingsOnExistingDatabase()
    {
        await using var db = Database(); await db.Database.EnsureCreatedAsync();
        try {
            await db.Database.ExecuteSqlRawAsync("DROP TABLE shore_module_settings");
            var migration = new ProductApi.Migrations.AddShoreModuleSettings();
            var sql = db.GetService<IMigrationsSqlGenerator>().Generate(migration.UpOperations, db.Model);
            foreach (var command in sql) await db.Database.ExecuteSqlRawAsync(command.CommandText);
            Assert.Equal(1, Body(await Controller(db).Update(new(0, ["sms"]))).GetProperty("version").GetInt32());
        } finally { await db.Database.EnsureDeletedAsync(); }
    }
}
