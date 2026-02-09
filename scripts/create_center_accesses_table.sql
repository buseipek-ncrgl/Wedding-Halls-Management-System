-- CenterAccesses tablosu (Merkez Sorumluları için)
-- Hata: "Invalid object name 'CenterAccesses'" alıyorsanız bu script'i SQL Server'da çalıştırın.
-- Kullanım: sqlcmd -S "(localdb)\mssqllocaldb" -d nikahsalon -i scripts\create_center_accesses_table.sql
-- veya SSMS'te bu dosyayı açıp F5 ile çalıştırın.

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

    PRINT 'CenterAccesses tablosu olusturuldu.';

    -- EF migration olarak isaretle (dotnet ef database update tekrar bu migration''i calistirmasin)
    IF EXISTS (SELECT * FROM sys.tables WHERE name = '__EFMigrationsHistory')
    INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES ('20260129100000_AddCenterAccessAndMerkezSorumlusu', '8.0.11');
END
ELSE
    PRINT 'CenterAccesses tablosu zaten mevcut.';
GO
