using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace MaritimeEdge.Data;

/// <summary>Build migration metadata without starting collectors or connecting to a database.</summary>
public sealed class EdgeDbContextDesignTimeFactory : IDesignTimeDbContextFactory<EdgeDbContext>
{
    public EdgeDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("Database__ConnectionString")
            ?? "Host=localhost;Database=maritime_edge;Username=edge_user";
        return new EdgeDbContext(new DbContextOptionsBuilder<EdgeDbContext>()
            .UseNpgsql(connection).Options);
    }
}
