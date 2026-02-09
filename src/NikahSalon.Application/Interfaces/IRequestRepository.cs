using NikahSalon.Domain.Entities;
using NikahSalon.Domain.Enums;

namespace NikahSalon.Application.Interfaces;

public interface IRequestRepository
{
    Task<Request?> GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<Request?> GetByIdForUpdateAsync(Guid id, CancellationToken ct = default);
    Task<IReadOnlyList<Request>> GetAllAsync(CancellationToken ct = default);
    Task<(IReadOnlyList<Request> Items, int TotalCount)> GetPagedAsync(
        int page, 
        int pageSize, 
        RequestStatus? status, 
        string? sortBy, 
        string? sortOrder,
        Guid? createdByUserId = null,
        IReadOnlyList<Guid>? weddingHallIds = null,
        CancellationToken ct = default);
    Task<Request> AddAsync(Request entity, CancellationToken ct = default);
    Task UpdateAsync(Request entity, CancellationToken ct = default);
    Task<bool> DeleteAsync(Guid id, CancellationToken ct = default);
    Task<int> GetTotalCountAsync(CancellationToken ct = default);
    Task<int> GetCountByStatusAsync(RequestStatus status, CancellationToken ct = default);
}
