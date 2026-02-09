# CenterAccesses tablosunu sqlcmd olmadan olusturur (.NET SqlClient kullanir).
# Kullanim: Backend klasorunden .\scripts\create_center_accesses_table.ps1

$ErrorActionPreference = "Stop"
$BackendRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$appsettingsPath = Join-Path $BackendRoot "src\NikahSalon.API\appsettings.Development.json"

$connectionString = "Server=(localdb)\mssqllocaldb;Database=nikahsalon;Trusted_Connection=True;TrustServerCertificate=true;"
if (Test-Path $appsettingsPath) {
    $json = Get-Content $appsettingsPath -Raw | ConvertFrom-Json
    $conn = $json.ConnectionStrings.DefaultConnection
    if ($conn) { $connectionString = $conn }
}

$sql = @"
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CenterAccesses')
BEGIN
    CREATE TABLE [dbo].[CenterAccesses] (
        [Id]          UNIQUEIDENTIFIER NOT NULL,
        [CenterId]    UNIQUEIDENTIFIER NOT NULL,
        [UserId]      UNIQUEIDENTIFIER NOT NULL,
        [CreatedAt]   DATETIMEOFFSET   NOT NULL,
        CONSTRAINT [PK_CenterAccesses] PRIMARY KEY ([Id]),
        CONSTRAINT [FK_CenterAccesses_Centers_CenterId] FOREIGN KEY ([CenterId])
            REFERENCES [dbo].[Centers] ([Id]) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX [IX_CenterAccesses_CenterId_UserId]
        ON [dbo].[CenterAccesses] ([CenterId], [UserId]);
    IF EXISTS (SELECT * FROM sys.tables WHERE name = '__EFMigrationsHistory')
        INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
        VALUES ('20260129100000_AddCenterAccessAndMerkezSorumlusu', '8.0.11');
END
"@

Add-Type -AssemblyName "System.Data"
$conn = New-Object System.Data.SqlClient.SqlConnection($connectionString)
$cmd = $conn.CreateCommand()
$cmd.CommandText = $sql
$cmd.CommandTimeout = 30
try {
    $conn.Open()
    $cmd.ExecuteNonQuery() | Out-Null
    Write-Host "CenterAccesses tablosu kontrol edildi / olusturuldu." -ForegroundColor Green
} catch {
    Write-Host "Hata: $_" -ForegroundColor Red
    exit 1
} finally {
    if ($conn.State -eq 'Open') { $conn.Close() }
}
