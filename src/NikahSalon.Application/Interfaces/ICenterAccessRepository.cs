using NikahSalon.Domain.Entities;

namespace NikahSalon.Application.Interfaces;

public interface ICenterAccessRepository
{
    Task AddRangeAsync(IEnumerable<CenterAccess> entities, CancellationToken ct = default);
    Task<IReadOnlyList<Guid>> GetAccessibleCenterIdsAsync(Guid userId, CancellationToken ct = default);
    Task RemoveByCenterIdAsync(Guid centerId, CancellationToken ct = default);
}
