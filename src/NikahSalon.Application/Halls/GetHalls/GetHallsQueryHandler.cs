using System.Linq;
using NikahSalon.Application.Common;
using NikahSalon.Application.DTOs;
using NikahSalon.Application.Interfaces;

namespace NikahSalon.Application.Halls.GetHalls;

public sealed class GetHallsQueryHandler
{
    private readonly IWeddingHallRepository _repository;
    private readonly IHallAccessRepository _hallAccessRepository;

    public GetHallsQueryHandler(
        IWeddingHallRepository repository,
        IHallAccessRepository hallAccessRepository)
    {
        _repository = repository;
        _hallAccessRepository = hallAccessRepository;
    }

    public async Task<PagedResult<WeddingHallDto>> HandleAsync(GetHallsQuery query, CancellationToken ct = default)
    {
        // Validate pagination parameters
        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = query.PageSize < 1 ? 10 : query.PageSize;
        if (pageSize > 100) pageSize = 100; // Max page size limit

        // SuperAdmin ve Viewer tüm salonları görebilir, Editor sadece erişimi olan salonları görebilir
        IReadOnlyList<Guid>? accessibleHallIds = null;
        if (query.CallerRole == "Editor" && query.CallerUserId.HasValue)
        {
            accessibleHallIds = await _hallAccessRepository.GetAccessibleHallIdsAsync(query.CallerUserId.Value, ct);
        }

        var (halls, totalCount) = await _repository.GetPagedAsync(page, pageSize, query.Search, ct);
        
        // Editor ise sadece erişimi olan salonları filtrele (SuperAdmin ve Viewer için filtreleme yok)
        var filteredHalls = halls;
        if (query.CallerRole == "Editor" && accessibleHallIds != null)
        {
            var accessibleSet = accessibleHallIds.ToHashSet();
            filteredHalls = halls.Where(h => accessibleSet.Contains(h.Id)).ToList();
            totalCount = filteredHalls.Count; // Filtreleme sonrası toplam sayı
        }
        
        var items = filteredHalls.Select(h => new WeddingHallDto
        {
            Id = h.Id,
            CenterId = h.CenterId,
            Name = h.Name,
            Address = h.Address,
            Capacity = h.Capacity,
            Description = h.Description,
            ImageUrl = h.ImageUrl,
            TechnicalDetails = h.TechnicalDetails
        }).ToList();

        var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

        return new PagedResult<WeddingHallDto>
        {
            Items = items,
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount,
            TotalPages = totalPages
        };
    }
}
