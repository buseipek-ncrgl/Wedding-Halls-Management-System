using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace NikahSalon.Infrastructure.Migrations
{
    public partial class AddCenterAccessAndMerkezSorumlusu : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var isSqlServer = string.Equals(Environment.GetEnvironmentVariable("DatabaseProvider"), "SqlServer", StringComparison.OrdinalIgnoreCase);
            var guidType = isSqlServer ? "uniqueidentifier" : "uuid";
            var dateTimeType = isSqlServer ? "datetimeoffset" : "timestamp with time zone";

            migrationBuilder.CreateTable(
                name: "CenterAccesses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: guidType, nullable: false),
                    CenterId = table.Column<Guid>(type: guidType, nullable: false),
                    UserId = table.Column<Guid>(type: guidType, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: dateTimeType, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CenterAccesses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CenterAccesses_Centers_CenterId",
                        column: x => x.CenterId,
                        principalTable: "Centers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CenterAccesses_CenterId_UserId",
                table: "CenterAccesses",
                columns: new[] { "CenterId", "UserId" },
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "CenterAccesses");
        }
    }
}
