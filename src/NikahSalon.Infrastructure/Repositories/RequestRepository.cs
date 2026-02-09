using Microsoft.EntityFrameworkCore;
using NikahSalon.Application.Interfaces;
using NikahSalon.Domain.Entities;
using NikahSalon.Domain.Enums;
using NikahSalon.Infrastructure.Data;

namespace NikahSalon.Infrastructure.Repositories;

public sealed class RequestRepository : IRequestRepository
{
    private readonly AppDbContext _db;

    public RequestRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<Request?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        return await _db.Requests.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
    }

    public async Task<Request?> GetByIdForUpdateAsync(Guid id, CancellationToken ct = default)
    {
        return await _db.Requests.FirstOrDefaultAsync(x => x.Id == id, ct);
    }

    public async Task<IReadOnlyList<Request>> GetAllAsync(CancellationToken ct = default)
    {
        return await _db.Requests.AsNoTracking()
            .OrderByDescending(x => x.CreatedAt)
            .ToListAsync(ct);
    }

    public async Task<(IReadOnlyList<Request> Items, int TotalCount)> GetPagedAsync(
        int page, 
        int pageSize, 
        RequestStatus? status, 
        string? sortBy, 
        string? sortOrder,
        Guid? createdByUserId = null,
        IReadOnlyList<Guid>? weddingHallIds = null,
        CancellationToken ct = default)
    {
        var query = _db.Requests.AsNoTracking();

        // Apply status filter if provided
        if (status.HasValue)
        {
            query = query.Where(x => x.Status == status.Value);
        }

        // Apply creator filter if provided (for Viewer role)
        if (createdByUserId.HasValue)
        {
            query = query.Where(x => x.CreatedByUserId == createdByUserId.Value);
        }

        // Apply hall filter if provided (for MerkezSorumlusu - only requests for their centers' halls)
        if (weddingHallIds is { Count: > 0 })
        {
            var hallSet = weddingHallIds.ToHashSet();
            query = query.Where(x => hallSet.Contains(x.WeddingHallId));
        }

        // Get total count before pagination
        var totalCount = await query.CountAsync(ct);

        // Apply sorting
        var isDescending = string.Equals(sortOrder, "desc", StringComparison.OrdinalIgnoreCase);
        
        query = sortBy?.ToLowerInvariant() switch
        {
            "createdat" => isDescending 
                ? query.OrderByDescending(x => x.CreatedAt)
                : query.OrderBy(x => x.CreatedAt),
            "eventname" => isDescending
                ? query.OrderByDescending(x => x.EventName)
                : query.OrderBy(x => x.EventName),
            "eventdate" => isDescending
                ? query.OrderByDescending(x => x.EventDate)
                : query.OrderBy(x => x.EventDate),
            "status" => isDescending
                ? query.OrderByDescending(x => x.Status)
                : query.OrderBy(x => x.Status),
            _ => query.OrderByDescending(x => x.CreatedAt) // Default: newest first
        };

        // Apply pagination
        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return (items, totalCount);
    }

    public async Task<Request> AddAsync(Request entity, CancellationToken ct = default)
    {
        _db.Requests.Add(entity);
        await _db.SaveChangesAsync(ct);
        return entity;
    }

    public async Task UpdateAsync(Request entity, CancellationToken ct = default)
    {
        _db.Requests.Update(entity);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var entity = await _db.Requests.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (entity == null)
            return false;

        _db.Requests.Remove(entity);
        await _db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<int> GetTotalCountAsync(CancellationToken ct = default)
    {
        return await _db.Requests.CountAsync(ct);
    }

    public async Task<int> GetCountByStatusAsync(RequestStatus status, CancellationToken ct = default)
    {
        return await _db.Requests.CountAsync(x => x.Status == status, ct);
    }
}
