namespace NikahSalon.Application.Centers.GetCenterById;

public sealed class GetCenterByIdQuery
{
    public Guid Id { get; init; }
    public Guid? CallerUserId { get; set; }
    public string? CallerRole { get; set; }
}
