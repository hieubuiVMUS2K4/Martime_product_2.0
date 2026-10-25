using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MaritimeEdge.Data.Migrations
{
    /// <inheritdoc />
    public partial class ApprovalEvidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "gas_test_at",
                schema: "public",
                table: "hsqe_work_permits",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "gas_test_by",
                schema: "public",
                table: "hsqe_work_permits",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "gas_test_device",
                schema: "public",
                table: "hsqe_work_permits",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "approval_documents",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    origin_node = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    module = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    record_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    current_revision = table.Column<int>(type: "integer", nullable: false),
                    current_state = table.Column<string>(type: "text", nullable: false),
                    version = table.Column<long>(type: "bigint", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_synced = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_approval_documents", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "approval_revisions",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    document_id = table.Column<Guid>(type: "uuid", nullable: false),
                    revision = table.Column<int>(type: "integer", nullable: false),
                    previous_revision_id = table.Column<Guid>(type: "uuid", nullable: true),
                    origin_node = table.Column<string>(type: "text", nullable: false),
                    snapshot_json = table.Column<string>(type: "text", nullable: false),
                    content_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    reason = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_synced = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_approval_revisions", x => x.id);
                    table.ForeignKey(
                        name: "f_k_approval_revisions_approval_documents_document_id",
                        column: x => x.document_id,
                        principalSchema: "public",
                        principalTable: "approval_documents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "approval_actions",
                schema: "public",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    document_id = table.Column<Guid>(type: "uuid", nullable: false),
                    revision_id = table.Column<Guid>(type: "uuid", nullable: false),
                    origin_node = table.Column<string>(type: "text", nullable: false),
                    actor_user_id = table.Column<long>(type: "bigint", nullable: false),
                    actor_username = table.Column<string>(type: "text", nullable: false),
                    crew_id = table.Column<string>(type: "text", nullable: true),
                    actor_name = table.Column<string>(type: "text", nullable: false),
                    actor_rank = table.Column<string>(type: "text", nullable: false),
                    authority = table.Column<string>(type: "text", nullable: false),
                    action = table.Column<string>(type: "text", nullable: false),
                    reason = table.Column<string>(type: "text", nullable: false),
                    content_hash = table.Column<string>(type: "text", nullable: false),
                    authentication_method = table.Column<string>(type: "text", nullable: false),
                    policy_version = table.Column<string>(type: "text", nullable: false),
                    idempotency_key = table.Column<string>(type: "text", nullable: false),
                    request_hash = table.Column<string>(type: "text", nullable: false),
                    response_json = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    is_synced = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("p_k_approval_actions", x => x.id);
                    table.ForeignKey(
                        name: "f_k_approval_actions_approval_documents_document_id",
                        column: x => x.document_id,
                        principalSchema: "public",
                        principalTable: "approval_documents",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "f_k_approval_actions_approval_revisions_revision_id",
                        column: x => x.revision_id,
                        principalSchema: "public",
                        principalTable: "approval_revisions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_approval_actions_document_id",
                schema: "public",
                table: "approval_actions",
                column: "document_id");

            migrationBuilder.CreateIndex(
                name: "IX_approval_actions_origin_node_actor_user_id_idempotency_key",
                schema: "public",
                table: "approval_actions",
                columns: new[] { "origin_node", "actor_user_id", "idempotency_key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_approval_actions_revision_id",
                schema: "public",
                table: "approval_actions",
                column: "revision_id");

            migrationBuilder.CreateIndex(
                name: "IX_approval_documents_origin_node_module_record_key",
                schema: "public",
                table: "approval_documents",
                columns: new[] { "origin_node", "module", "record_key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_approval_revisions_document_id_revision",
                schema: "public",
                table: "approval_revisions",
                columns: new[] { "document_id", "revision" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "approval_actions",
                schema: "public");

            migrationBuilder.DropTable(
                name: "approval_revisions",
                schema: "public");

            migrationBuilder.DropTable(
                name: "approval_documents",
                schema: "public");

            migrationBuilder.DropColumn(
                name: "gas_test_at",
                schema: "public",
                table: "hsqe_work_permits");

            migrationBuilder.DropColumn(
                name: "gas_test_by",
                schema: "public",
                table: "hsqe_work_permits");

            migrationBuilder.DropColumn(
                name: "gas_test_device",
                schema: "public",
                table: "hsqe_work_permits");
        }
    }
}
