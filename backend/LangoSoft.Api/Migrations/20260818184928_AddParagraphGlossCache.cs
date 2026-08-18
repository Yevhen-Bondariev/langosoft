using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LangoSoft.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddParagraphGlossCache : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ParagraphGlossCaches",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ParagraphId = table.Column<int>(type: "INTEGER", nullable: false),
                    TargetLanguage = table.Column<string>(type: "TEXT", nullable: false),
                    GlossJson = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ParagraphGlossCaches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ParagraphGlossCaches_Paragraphs_ParagraphId",
                        column: x => x.ParagraphId,
                        principalTable: "Paragraphs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ParagraphGlossCaches_ParagraphId_TargetLanguage",
                table: "ParagraphGlossCaches",
                columns: new[] { "ParagraphId", "TargetLanguage" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ParagraphGlossCaches");
        }
    }
}
