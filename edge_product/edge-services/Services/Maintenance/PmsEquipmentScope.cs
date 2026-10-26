using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

public static class PmsEquipmentScope
{
    public static async Task<Guid[]> DescendantsAsync(EdgeDbContext db, Guid root, CancellationToken token = default)
    {
        if (db.Database.IsNpgsql())
            return await db.Database.SqlQuery<Guid>($"""
                WITH RECURSIVE subtree(id) AS (
                  SELECT id FROM equipment_assets WHERE id={root}
                  UNION
                  SELECT child.id FROM equipment_assets child JOIN subtree parent ON child.parent_id=parent.id
                ) SELECT id AS "Value" FROM subtree
                """).ToArrayAsync(token);
        var links = await db.EquipmentAssets.AsNoTracking().Select(a => new { a.Id, a.ParentId }).ToListAsync(token);
        if (!links.Any(a => a.Id == root)) return [];
        var result = new HashSet<Guid> { root }; var queue = new Queue<Guid>(); queue.Enqueue(root);
        while (queue.TryDequeue(out var parent)) foreach (var child in links.Where(a => a.ParentId == parent))
            if (result.Add(child.Id)) queue.Enqueue(child.Id);
        return result.ToArray();
    }
}
