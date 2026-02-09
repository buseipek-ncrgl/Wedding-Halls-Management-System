using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using NikahSalon.Domain.Entities;
using NikahSalon.Infrastructure.Identity;

namespace NikahSalon.Infrastructure.Data;

public sealed class AppDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>
{
    private static readonly ValueConverter<DateTime, DateTimeOffset> DateTimeToOffsetConverter =
        new(d => new DateTimeOffset(d.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(d, DateTimeKind.Utc) : d), dto => dto.UtcDateTime);

    private readonly DbContextOptions<AppDbContext> _options;

    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) => _options = options;

    private bool IsSqlServer => _options.Extensions.Any(e => e.GetType().Namespace?.Contains("SqlServer") == true);

    public DbSet<Center> Centers => Set<Center>();
    public DbSet<WeddingHall> WeddingHalls => Set<WeddingHall>();
    public DbSet<HallAccess> HallAccesses => Set<HallAccess>();
    public DbSet<CenterAccess> CenterAccesses => Set<CenterAccess>();
    public DbSet<Schedule> Schedules => Set<Schedule>();
    public DbSet<Request> Requests => Set<Request>();
    public DbSet<Message> Messages => Set<Message>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        builder.Entity<Center>(e =>
        {
            e.ToTable("Centers");
            e.HasKey(x => x.Id);
            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.Address).HasMaxLength(500).IsRequired();
            e.Property(x => x.Description).HasMaxLength(2000).IsRequired();
            e.Property(x => x.ImageUrl).HasColumnType("TEXT");
            e.Property(x => x.CreatedAt).IsRequired();
            if (IsSqlServer) e.Property(x => x.CreatedAt).HasConversion(DateTimeToOffsetConverter);
        });

        builder.Entity<WeddingHall>(e =>
        {
            e.ToTable("WeddingHalls");
            e.HasKey(x => x.Id);
            e.Property(x => x.CenterId).IsRequired();
            e.Property(x => x.Name).HasMaxLength(200).IsRequired();
            e.Property(x => x.Address).HasMaxLength(500).IsRequired();
            e.Property(x => x.Description).HasMaxLength(2000).IsRequired();
            // ImageUrl için TEXT tipi kullanılıyor (base64 görseller çok uzun olabilir, sınırsız uzunluk)
            e.Property(x => x.ImageUrl).HasColumnType("TEXT");
            e.Property(x => x.TechnicalDetails).HasMaxLength(5000);
            
            // Foreign key relationship
            e.HasOne(x => x.Center)
                .WithMany()
                .HasForeignKey(x => x.CenterId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<HallAccess>(e =>
        {
            e.ToTable("HallAccesses");
            e.HasKey(x => x.Id);
            e.Property(x => x.HallId).IsRequired();
            e.Property(x => x.UserId).IsRequired();
            e.Property(x => x.CreatedAt).IsRequired();
            if (IsSqlServer) e.Property(x => x.CreatedAt).HasConversion(DateTimeToOffsetConverter);
            
            // Unique constraint: Bir kullanıcı bir salona sadece bir kez erişim hakkı alabilir
            e.HasIndex(x => new { x.HallId, x.UserId }).IsUnique();
            
            // Foreign key relationship
            e.HasOne(x => x.Hall)
                .WithMany()
                .HasForeignKey(x => x.HallId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<CenterAccess>(e =>
        {
            e.ToTable("CenterAccesses");
            e.HasKey(x => x.Id);
            e.Property(x => x.CenterId).IsRequired();
            e.Property(x => x.UserId).IsRequired();
            e.Property(x => x.CreatedAt).IsRequired();
            if (IsSqlServer) e.Property(x => x.CreatedAt).HasConversion(DateTimeToOffsetConverter);
            e.HasIndex(x => new { x.CenterId, x.UserId }).IsUnique();
            e.HasOne(x => x.Center)
                .WithMany()
                .HasForeignKey(x => x.CenterId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<Schedule>(e =>
        {
            e.ToTable("Schedules");
            e.HasKey(x => x.Id);
            e.Property(x => x.Date).IsRequired();
            e.Property(x => x.StartTime).IsRequired();
            e.Property(x => x.EndTime).IsRequired();
            e.Property(x => x.CreatedByUserId).IsRequired(false);
            e.Property(x => x.EventType).IsRequired(false);
            e.Property(x => x.EventName).HasMaxLength(200).IsRequired(false);
            e.Property(x => x.EventOwner).HasMaxLength(200).IsRequired(false);
            e.HasIndex(x => new { x.WeddingHallId, x.Date });
            e.HasIndex(x => x.CreatedByUserId);
            e.HasIndex(x => x.EventType);
        });

        builder.Entity<Request>(e =>
        {
            e.ToTable("Requests");
            e.HasKey(x => x.Id);
            e.Property(x => x.Message).HasMaxLength(2000).IsRequired();
            e.Property(x => x.CreatedAt).IsRequired();
            if (IsSqlServer) e.Property(x => x.CreatedAt).HasConversion(DateTimeToOffsetConverter);
            e.Property(x => x.EventType).IsRequired();
            e.Property(x => x.EventName).HasMaxLength(200).IsRequired();
            e.Property(x => x.EventOwner).HasMaxLength(200).IsRequired();
            e.Property(x => x.EventDate).IsRequired();
            e.Property(x => x.EventTime).IsRequired();
        });

        builder.Entity<Message>(e =>
        {
            e.ToTable("Messages");
            e.HasKey(x => x.Id);
            e.Property(x => x.Content).HasMaxLength(2000).IsRequired();
            e.Property(x => x.CreatedAt).IsRequired();
            if (IsSqlServer) e.Property(x => x.CreatedAt).HasConversion(DateTimeToOffsetConverter);
            e.HasIndex(x => x.RequestId);
        });
    }
}
