using System.Linq;
using NikahSalon.Application.DTOs;
using NikahSalon.Application.Interfaces;

namespace NikahSalon.Application.Centers.GetCenters;

public sealed class GetCentersQueryHandler
{
    private readonly ICenterRepository _repository;
    private readonly IWeddingHallRepository _hallRepository;
    private readonly IHallAccessRepository _hallAccessRepository;

    public GetCentersQueryHandler(
        ICenterRepository repository,
        IWeddingHallRepository hallRepository,
        IHallAccessRepository hallAccessRepository)
    {
        _repository = repository;
        _hallRepository = hallRepository;
        _hallAccessRepository = hallAccessRepository;
    }

    public async Task<IReadOnlyList<CenterDto>> HandleAsync(GetCentersQuery query, CancellationToken ct = default)
    {
        var centers = await _repository.GetAllAsync(ct);
        
        // SuperAdmin ve Viewer tüm merkezleri görebilir
        if (query.CallerRole == "SuperAdmin" || query.CallerRole == "Viewer")
        {
            return centers.Select(c => new CenterDto
            {
                Id = c.Id,
                Name = c.Name,
                Address = c.Address,
                Description = c.Description,
                ImageUrl = c.ImageUrl,
                CreatedAt = c.CreatedAt
            }).ToList();
        }
        
        // Editor ise sadece erişimi olan merkezleri görebilir
        // (merkezdeki salonlardan en az birine erişimi varsa)
        if (query.CallerRole == "Editor" && query.CallerUserId.HasValue)
        {
            var accessibleHallIds = await _hallAccessRepository.GetAccessibleHallIdsAsync(query.CallerUserId.Value, ct);
            var accessibleSet = accessibleHallIds.ToHashSet();
            
            // Tüm salonları al ve merkez ID'lerini topla
            var allHalls = await _hallRepository.GetAllAsync(ct);
            var accessibleCenterIds = allHalls
                .Where(h => accessibleSet.Contains(h.Id))
                .Select(h => h.CenterId)
                .Distinct()
                .ToHashSet();
            
            // Sadece erişimi olan merkezleri döndür
            return centers
                .Where(c => accessibleCenterIds.Contains(c.Id))
                .Select(c => new CenterDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    Address = c.Address,
                    Description = c.Description,
                    ImageUrl = c.ImageUrl,
                    CreatedAt = c.CreatedAt
                }).ToList();
        }
        
        // Diğer roller için boş liste döndür
        return Array.Empty<CenterDto>();
    }
}
