using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LangoSoft.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddParagraphArchaismCache : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Language",
                table: "Books",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "ParagraphArchaismCaches",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ParagraphId = table.Column<int>(type: "INTEGER", nullable: false),
                    ArchaismsJson = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ParagraphArchaismCaches", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ParagraphArchaismCaches_Paragraphs_ParagraphId",
                        column: x => x.ParagraphId,
                        principalTable: "Paragraphs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ParagraphArchaismCaches_ParagraphId",
                table: "ParagraphArchaismCaches",
                column: "ParagraphId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ParagraphArchaismCaches");

            migrationBuilder.DropColumn(
                name: "Language",
                table: "Books");
        }
    }
}
