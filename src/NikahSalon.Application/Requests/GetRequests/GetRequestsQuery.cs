using NikahSalon.Application.Common;
using NikahSalon.Domain.Enums;

namespace NikahSalon.Application.Requests.GetRequests;

public sealed class GetRequestsQuery : PagedQuery
{
    public RequestStatus? Status { get; set; }
    public string? SortBy { get; set; }
    public string? SortOrder { get; set; } = "desc"; // Default: newest first
    public Guid? CreatedByUserId { get; set; } // Filter by creator (for Viewer role)
    public IReadOnlyList<Guid>? WeddingHallIds { get; set; } // Filter by halls (for MerkezSorumlusu)
}
