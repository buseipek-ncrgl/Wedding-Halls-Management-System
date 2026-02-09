using Microsoft.EntityFrameworkCore;
using NikahSalon.Application.Interfaces;
using NikahSalon.Domain.Entities;
using NikahSalon.Infrastructure.Data;

namespace NikahSalon.Infrastructure.Repositories;

public sealed class CenterAccessRepository : ICenterAccessRepository
{
    private readonly AppDbContext _db;

    public CenterAccessRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task AddRangeAsync(IEnumerable<CenterAccess> entities, CancellationToken ct = default)
    {
        _db.CenterAccesses.AddRange(entities);
        await _db.SaveChangesAsync(ct);
    }

    public async Task<IReadOnlyList<Guid>> GetAccessibleCenterIdsAsync(Guid userId, CancellationToken ct = default)
    {
        return await _db.CenterAccesses
            .AsNoTracking()
            .Where(x => x.UserId == userId)
            .Select(x => x.CenterId)
            .ToListAsync(ct);
    }

    public async Task RemoveByCenterIdAsync(Guid centerId, CancellationToken ct = default)
    {
        var accesses = await _db.CenterAccesses
            .Where(x => x.CenterId == centerId)
            .ToListAsync(ct);

        if (accesses.Any())
        {
            _db.CenterAccesses.RemoveRange(accesses);
            await _db.SaveChangesAsync(ct);
        }
    }
}
