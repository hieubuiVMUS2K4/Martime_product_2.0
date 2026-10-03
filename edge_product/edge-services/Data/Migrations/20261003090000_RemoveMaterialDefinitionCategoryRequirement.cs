using MaritimeEdge.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace MaritimeEdge.Data.Migrations;

[DbContext(typeof(EdgeDbContext))]
[Migration("20261003090000_RemoveMaterialDefinitionCategoryRequirement")]
public class RemoveMaterialDefinitionCategoryRequirement : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Preserve legacy classification data; remove only the two definition dependencies.
        migrationBuilder.Sql("""
            DO $$ DECLARE constraint_row record;
            BEGIN
              FOR constraint_row IN
                SELECT conrelid::regclass AS table_name, conname
                FROM pg_constraint
                WHERE contype = 'f' AND confrelid = 'public.material_categories'::regclass
                  AND conrelid IN ('public.material_items'::regclass, 'public.material_item_ship'::regclass)
              LOOP
                EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', constraint_row.table_name, constraint_row.conname);
              END LOOP;
            END $$;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
        => throw new NotSupportedException("New material definitions have no category; reverting requires explicit data conversion.");
}
