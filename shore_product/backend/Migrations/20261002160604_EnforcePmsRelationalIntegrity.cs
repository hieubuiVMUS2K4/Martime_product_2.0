using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace productapi.Migrations
{
    /// <inheritdoc />
    public partial class EnforcePmsRelationalIntegrity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$ BEGIN
                  IF EXISTS (SELECT 1 FROM inventory_stocks s
                    LEFT JOIN material_item_ship m ON m."Id" = s."MaterialItemId"
                    LEFT JOIN store_locations l ON l."Id" = s."StoreLocationId"
                    WHERE m."Id" IS NULL OR l."Id" IS NULL OR s."Quantity" < 0 OR s."UnitCost" < 0) THEN
                    RAISE EXCEPTION 'PMS preflight: inventory_stocks has missing parents or negative quantities/costs';
                  END IF;
                  IF EXISTS (SELECT 1 FROM material_item_equipments x
                    LEFT JOIN equipment_assets a ON a."Id" = x."EquipmentAssetId" WHERE a."Id" IS NULL) THEN
                    RAISE EXCEPTION 'PMS preflight: material_item_equipments has orphan equipment';
                  END IF;
                  IF EXISTS (SELECT 1 FROM stock_receipt_items x
                    LEFT JOIN store_locations l ON l."Id" = x."StoreLocationId"
                    WHERE x."StoreLocationId" IS NOT NULL AND l."Id" IS NULL) THEN
                    RAISE EXCEPTION 'PMS preflight: stock_receipt_items has orphan locations';
                  END IF;
                END $$;
                """);
            migrationBuilder.CreateIndex(
                name: "IX_stock_receipt_items_StoreLocationId",
                table: "stock_receipt_items",
                column: "StoreLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_material_item_equipments_EquipmentAssetId",
                table: "material_item_equipments",
                column: "EquipmentAssetId");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_stocks_StoreLocationId",
                table: "inventory_stocks",
                column: "StoreLocationId");

            migrationBuilder.AddCheckConstraint(
                name: "ck_inventory_quantity_nonnegative",
                table: "inventory_stocks",
                sql: "\"Quantity\" >= 0");

            migrationBuilder.AddCheckConstraint(
                name: "ck_inventory_unit_cost_nonnegative",
                table: "inventory_stocks",
                sql: "\"UnitCost\" >= 0");

            migrationBuilder.AddForeignKey(
                name: "FK_inventory_stocks_material_item_ship_MaterialItemId",
                table: "inventory_stocks",
                column: "MaterialItemId",
                principalTable: "material_item_ship",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_inventory_stocks_store_locations_StoreLocationId",
                table: "inventory_stocks",
                column: "StoreLocationId",
                principalTable: "store_locations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_material_item_equipments_equipment_assets_EquipmentAssetId",
                table: "material_item_equipments",
                column: "EquipmentAssetId",
                principalTable: "equipment_assets",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_stock_receipt_items_store_locations_StoreLocationId",
                table: "stock_receipt_items",
                column: "StoreLocationId",
                principalTable: "store_locations",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_inventory_stocks_material_item_ship_MaterialItemId",
                table: "inventory_stocks");

            migrationBuilder.DropForeignKey(
                name: "FK_inventory_stocks_store_locations_StoreLocationId",
                table: "inventory_stocks");

            migrationBuilder.DropForeignKey(
                name: "FK_material_item_equipments_equipment_assets_EquipmentAssetId",
                table: "material_item_equipments");

            migrationBuilder.DropForeignKey(
                name: "FK_stock_receipt_items_store_locations_StoreLocationId",
                table: "stock_receipt_items");

            migrationBuilder.DropIndex(
                name: "IX_stock_receipt_items_StoreLocationId",
                table: "stock_receipt_items");

            migrationBuilder.DropIndex(
                name: "IX_material_item_equipments_EquipmentAssetId",
                table: "material_item_equipments");

            migrationBuilder.DropIndex(
                name: "IX_inventory_stocks_StoreLocationId",
                table: "inventory_stocks");

            migrationBuilder.DropCheckConstraint(
                name: "ck_inventory_quantity_nonnegative",
                table: "inventory_stocks");

            migrationBuilder.DropCheckConstraint(
                name: "ck_inventory_unit_cost_nonnegative",
                table: "inventory_stocks");
        }
    }
}
