namespace NikahSalon.Domain.Entities;

/// <summary>
/// Hangi merkez sorumlularının hangi merkezlere (sadece görüntüleme) erişebileceğini belirler.
/// </summary>
public class CenterAccess
{
    public Guid Id { get; set; }
    public Guid CenterId { get; set; }
    public Guid UserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Center? Center { get; set; }
}
