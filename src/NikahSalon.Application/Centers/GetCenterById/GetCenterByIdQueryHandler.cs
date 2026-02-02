using System.Linq;
using NikahSalon.Application.DTOs;
using NikahSalon.Application.Interfaces;

namespace NikahSalon.Application.Centers.GetCenterById;

public sealed class GetCenterByIdQueryHandler
{
    private readonly ICenterRepository _repository;
    private readonly IWeddingHallRepository _hallRepository;
    private readonly IHallAccessRepository _hallAccessRepository;

    public GetCenterByIdQueryHandler(
        ICenterRepository repository,
        IWeddingHallRepository hallRepository,
        IHallAccessRepository hallAccessRepository)
    {
        _repository = repository;
        _hallRepository = hallRepository;
        _hallAccessRepository = hallAccessRepository;
    }

    public async Task<CenterDto?> HandleAsync(GetCenterByIdQuery query, CancellationToken ct = default)
    {
        var center = await _repository.GetByIdAsync(query.Id, ct);
        if (center is null) return null;

        // SuperAdmin ve Viewer tüm merkezleri görebilir
        if (query.CallerRole == "SuperAdmin" || query.CallerRole == "Viewer")
        {
            return new CenterDto
            {
                Id = center.Id,
                Name = center.Name,
                Address = center.Address,
                Description = center.Description,
                ImageUrl = center.ImageUrl,
                CreatedAt = center.CreatedAt
            };
        }

        // Editor ise sadece erişimi olan merkezleri görebilir
        if (query.CallerRole == "Editor" && query.CallerUserId.HasValue)
        {
            var accessibleHallIds = await _hallAccessRepository.GetAccessibleHallIdsAsync(query.CallerUserId.Value, ct);
            var accessibleSet = accessibleHallIds.ToHashSet();
            
            // Bu merkeze ait salonları kontrol et
            var centerHalls = await _hallRepository.GetByCenterIdAsync(center.Id, ct);
            var hasAccess = centerHalls.Any(h => accessibleSet.Contains(h.Id));
            
            if (!hasAccess)
            {
                // Erişim yoksa null döndür
                return null;
            }
        }
        else
        {
            // Diğer roller için erişim yok
            return null;
        }

        return new CenterDto
        {
            Id = center.Id,
            Name = center.Name,
            Address = center.Address,
            Description = center.Description,
            ImageUrl = center.ImageUrl,
            CreatedAt = center.CreatedAt
        };
    }
}
