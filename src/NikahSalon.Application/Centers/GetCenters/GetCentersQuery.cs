namespace NikahSalon.Application.Centers.GetCenters;

public sealed class GetCentersQuery
{
    public Guid? CallerUserId { get; set; }
    public string? CallerRole { get; set; }
}
