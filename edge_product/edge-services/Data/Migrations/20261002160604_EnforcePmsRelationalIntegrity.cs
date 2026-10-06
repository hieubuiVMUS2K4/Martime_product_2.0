using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MaritimeEdge.Data.Migrations
{
    /// <inheritdoc />
    public partial class EnforcePmsRelationalIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Stop before changing indexes if legacy rows need explicit reconciliation.
            // Never delete, merge or assign a guessed parent to existing business data.
            migrationBuilder.Sql("""
                DO $$ BEGIN
                  IF EXISTS (SELECT 1 FROM public.inventory_stock s
                    LEFT JOIN public.material_item_ship m ON m.id = s.material_item_id
                    LEFT JOIN public.store_locations l ON l.id = s.store_location_id
                    WHERE m.id IS NULL OR l.id IS NULL OR s.quantity < 0 OR s.unit_cost < 0) THEN
                    RAISE EXCEPTION 'PMS preflight: inventory_stock has missing parents or negative quantities/costs';
                  END IF;
                  IF EXISTS (SELECT 1 FROM public.material_item_equipments x
                    LEFT JOIN public.equipment_assets a ON a.id = x.equipment_asset_id WHERE a.id IS NULL)
                    OR EXISTS (SELECT 1 FROM public.material_item_equipments
                      GROUP BY material_item_id, equipment_asset_id HAVING count(*) > 1) THEN
                    RAISE EXCEPTION 'PMS preflight: material_item_equipments has orphan equipment or duplicate links';
                  END IF;
                  IF EXISTS (SELECT 1 FROM public.equipment_group_members
                    GROUP BY group_id, asset_id HAVING count(*) > 1) THEN
                    RAISE EXCEPTION 'PMS preflight: equipment_group_members has duplicate membership';
                  END IF;
                  IF EXISTS (SELECT 1 FROM public.stock_receipt_items x
                    LEFT JOIN public.store_locations l ON l.id = x.store_location_id
                    WHERE x.store_location_id IS NOT NULL AND l.id IS NULL) THEN
                    RAISE EXCEPTION 'PMS preflight: stock_receipt_items has orphan locations';
                  END IF;
                  IF EXISTS (SELECT 1 FROM public.task_risk_assessments x
                    LEFT JOIN public.maintenance_tasks t ON t.task_id = x.task_id WHERE t.id IS NULL)
                    OR EXISTS (SELECT 1 FROM public.task_inspection_reports x
                      LEFT JOIN public.maintenance_tasks t ON t.task_id = x.task_id WHERE t.id IS NULL) THEN
                    RAISE EXCEPTION 'PMS preflight: maintenance forms have orphan task codes';
                  END IF;
                END $$;
                """);
            migrationBuilder.DropIndex(
                name: "IX_material_item_equipments_material_item_id",
                schema: "public",
                table: "material_item_equipments");

            migrationBuilder.DropIndex(
                name: "IX_equipment_group_members_group_id",
                schema: "public",
                table: "equipment_group_members");

            // Created by raw SQL in 20260411000000; the old snapshot did not list them.
            migrationBuilder.Sql("""
                CREATE INDEX IF NOT EXISTS "IX_task_risk_assessments_task_id"
                  ON public.task_risk_assessments(task_id);
                CREATE INDEX IF NOT EXISTS "IX_task_inspection_reports_task_id"
                  ON public.task_inspection_reports(task_id);
                """);

            migrationBuilder.CreateIndex(
                name: "IX_stock_receipt_items_store_location_id",
                schema: "public",
                table: "stock_receipt_items",
                column: "store_location_id");

            migrationBuilder.CreateIndex(
                name: "IX_material_item_equipments_equipment_asset_id",
                schema: "public",
                table: "material_item_equipments",
                column: "equipment_asset_id");

            migrationBuilder.CreateIndex(
                name: "uk_material_equipment",
                schema: "public",
                table: "material_item_equipments",
                columns: new[] { "material_item_id", "equipment_asset_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_inventory_stock_store_location_id",
                schema: "public",
                table: "inventory_stock",
                column: "store_location_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_inventory_quantity_nonnegative",
                schema: "public",
                table: "inventory_stock",
                sql: "quantity >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_inventory_unit_cost_nonnegative",
                schema: "public",
                table: "inventory_stock",
                sql: "unit_cost >= 0");

            migrationBuilder.CreateIndex(
                name: "uk_equipment_group_asset",
                schema: "public",
                table: "equipment_group_members",
                columns: new[] { "group_id", "asset_id" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_inventory_stock_material_item_ship_material_item_id",
                schema: "public",
                table: "inventory_stock",
                column: "material_item_id",
                principalSchema: "public",
                principalTable: "material_item_ship",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_inventory_stock_store_locations_store_location_id",
                schema: "public",
                table: "inventory_stock",
                column: "store_location_id",
                principalSchema: "public",
                principalTable: "store_locations",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_material_item_equipments_equipment_assets_equipment_asset_id",
                schema: "public",
                table: "material_item_equipments",
                column: "equipment_asset_id",
                principalSchema: "public",
                principalTable: "equipment_assets",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_stock_receipt_items_store_locations_store_location_id",
                schema: "public",
                table: "stock_receipt_items",
                column: "store_location_id",
                principalSchema: "public",
                principalTable: "store_locations",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_task_inspection_reports_maintenance_tasks_task_id",
                schema: "public",
                table: "task_inspection_reports",
                column: "task_id",
                principalSchema: "public",
                principalTable: "maintenance_tasks",
                principalColumn: "task_id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_task_risk_assessments_maintenance_tasks_task_id",
                schema: "public",
                table: "task_risk_assessments",
                column: "task_id",
                principalSchema: "public",
                principalTable: "maintenance_tasks",
                principalColumn: "task_id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_inventory_stock_material_item_ship_material_item_id",
                schema: "public",
                table: "inventory_stock");

            migrationBuilder.DropForeignKey(
                name: "FK_inventory_stock_store_locations_store_location_id",
                schema: "public",
                table: "inventory_stock");

            migrationBuilder.DropForeignKey(
                name: "FK_material_item_equipments_equipment_assets_equipment_asset_id",
                schema: "public",
                table: "material_item_equipments");

            migrationBuilder.DropForeignKey(
                name: "FK_stock_receipt_items_store_locations_store_location_id",
                schema: "public",
                table: "stock_receipt_items");

            migrationBuilder.DropForeignKey(
                name: "FK_task_inspection_reports_maintenance_tasks_task_id",
                schema: "public",
                table: "task_inspection_reports");

            migrationBuilder.DropForeignKey(
                name: "FK_task_risk_assessments_maintenance_tasks_task_id",
                schema: "public",
                table: "task_risk_assessments");

            // Keep the two form indexes: they belong to the earlier migration.

            migrationBuilder.DropIndex(
                name: "IX_stock_receipt_items_store_location_id",
                schema: "public",
                table: "stock_receipt_items");

            migrationBuilder.DropIndex(
                name: "IX_material_item_equipments_equipment_asset_id",
                schema: "public",
                table: "material_item_equipments");

            migrationBuilder.DropIndex(
                name: "uk_material_equipment",
                schema: "public",
                table: "material_item_equipments");

            migrationBuilder.DropIndex(
                name: "IX_inventory_stock_store_location_id",
                schema: "public",
                table: "inventory_stock");

            migrationBuilder.DropCheckConstraint(
                name: "ck_inventory_quantity_nonnegative",
                schema: "public",
                table: "inventory_stock");

            migrationBuilder.DropCheckConstraint(
                name: "ck_inventory_unit_cost_nonnegative",
                schema: "public",
                table: "inventory_stock");

            migrationBuilder.DropIndex(
                name: "uk_equipment_group_asset",
                schema: "public",
                table: "equipment_group_members");

            migrationBuilder.CreateIndex(
                name: "IX_material_item_equipments_material_item_id",
                schema: "public",
                table: "material_item_equipments",
                column: "material_item_id");

            migrationBuilder.CreateIndex(
                name: "IX_equipment_group_members_group_id",
                schema: "public",
                table: "equipment_group_members",
                column: "group_id");
        }
    }
}
