using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProductApi.Migrations
{
    /// <inheritdoc />
    public partial class ApprovalEvidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "approval_documents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginNode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Module = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    RecordKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    CurrentRevision = table.Column<int>(type: "integer", nullable: false),
                    CurrentState = table.Column<string>(type: "text", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsSynced = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_approval_documents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "approval_revisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Revision = table.Column<int>(type: "integer", nullable: false),
                    PreviousRevisionId = table.Column<Guid>(type: "uuid", nullable: true),
                    OriginNode = table.Column<string>(type: "text", nullable: false),
                    SnapshotJson = table.Column<string>(type: "text", nullable: false),
                    ContentHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsSynced = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_approval_revisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_approval_revisions_approval_documents_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "approval_documents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "approval_actions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    RevisionId = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginNode = table.Column<string>(type: "text", nullable: false),
                    ActorUserId = table.Column<long>(type: "bigint", nullable: false),
                    ActorUsername = table.Column<string>(type: "text", nullable: false),
                    CrewId = table.Column<string>(type: "text", nullable: true),
                    ActorName = table.Column<string>(type: "text", nullable: false),
                    ActorRank = table.Column<string>(type: "text", nullable: false),
                    Authority = table.Column<string>(type: "text", nullable: false),
                    Action = table.Column<string>(type: "text", nullable: false),
                    Reason = table.Column<string>(type: "text", nullable: false),
                    ContentHash = table.Column<string>(type: "text", nullable: false),
                    AuthenticationMethod = table.Column<string>(type: "text", nullable: false),
                    PolicyVersion = table.Column<string>(type: "text", nullable: false),
                    IdempotencyKey = table.Column<string>(type: "text", nullable: false),
                    RequestHash = table.Column<string>(type: "text", nullable: false),
                    ResponseJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsSynced = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_approval_actions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_approval_actions_approval_documents_DocumentId",
                        column: x => x.DocumentId,
                        principalTable: "approval_documents",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_approval_actions_approval_revisions_RevisionId",
                        column: x => x.RevisionId,
                        principalTable: "approval_revisions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_approval_actions_DocumentId",
                table: "approval_actions",
                column: "DocumentId");

            migrationBuilder.CreateIndex(
                name: "IX_approval_actions_OriginNode_ActorUserId_IdempotencyKey",
                table: "approval_actions",
                columns: new[] { "OriginNode", "ActorUserId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_approval_actions_RevisionId",
                table: "approval_actions",
                column: "RevisionId");

            migrationBuilder.CreateIndex(
                name: "IX_approval_documents_OriginNode_Module_RecordKey",
                table: "approval_documents",
                columns: new[] { "OriginNode", "Module", "RecordKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_approval_revisions_DocumentId_Revision",
                table: "approval_revisions",
                columns: new[] { "DocumentId", "Revision" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "approval_actions");

            migrationBuilder.DropTable(
                name: "approval_revisions");

            migrationBuilder.DropTable(
                name: "approval_documents");
        }
    }
}
