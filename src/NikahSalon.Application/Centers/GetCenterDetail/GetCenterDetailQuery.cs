namespace NikahSalon.Application.Centers.GetCenterDetail;

public sealed class GetCenterDetailQuery
{
    public Guid Id { get; init; }
    public Guid? CallerUserId { get; set; }
    public string? CallerRole { get; set; }
}
