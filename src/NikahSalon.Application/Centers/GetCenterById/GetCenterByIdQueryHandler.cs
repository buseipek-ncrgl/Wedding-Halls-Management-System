using System.Linq;
using System.Text.RegularExpressions;
using NikahSalon.Application.DTOs;
using NikahSalon.Application.Interfaces;

namespace NikahSalon.Application.Centers.GetCenterById;

public sealed class GetCenterByIdQueryHandler
{
    private readonly ICenterRepository _repository;
    private readonly IWeddingHallRepository _hallRepository;
    private readonly IHallAccessRepository _hallAccessRepository;
    private readonly ICenterAccessRepository _centerAccessRepository;

    public GetCenterByIdQueryHandler(
        ICenterRepository repository,
        IWeddingHallRepository hallRepository,
        IHallAccessRepository hallAccessRepository,
        ICenterAccessRepository centerAccessRepository)
    {
        _repository = repository;
        _hallRepository = hallRepository;
        _hallAccessRepository = hallAccessRepository;
        _centerAccessRepository = centerAccessRepository;
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

        // MerkezSorumlusu sadece atandığı merkezleri görebilir
        if (query.CallerRole == "MerkezSorumlusu" && query.CallerUserId.HasValue)
        {
            var accessibleCenterIds = await _centerAccessRepository.GetAccessibleCenterIdsAsync(query.CallerUserId.Value, ct);
            if (!accessibleCenterIds.Contains(center.Id))
                return null;
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
        // (merkezdeki salonlardan en az birine erişimi varsa VEYA merkezin editörleri listesinde ise)
        if (query.CallerRole == "Editor" && query.CallerUserId.HasValue)
        {
            var accessibleHallIds = await _hallAccessRepository.GetAccessibleHallIdsAsync(query.CallerUserId.Value, ct);
            var accessibleSet = accessibleHallIds.ToHashSet();
            
            var centerHalls = await _hallRepository.GetByCenterIdAsync(center.Id, ct);
            var hasAccessFromHalls = centerHalls.Any(h => accessibleSet.Contains(h.Id));
            
            // Merkezin description'ından editörleri kontrol et
            var allowedUserIds = ParseAllowedUserIds(center.Description);
            var hasAccessFromDescription = allowedUserIds.Contains(query.CallerUserId.Value);
            
            if (!hasAccessFromHalls && !hasAccessFromDescription)
                return null;
        }
        else
        {
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

    private static List<Guid> ParseAllowedUserIds(string description)
    {
        if (string.IsNullOrWhiteSpace(description))
            return new List<Guid>();

        var match = Regex.Match(description, @"Erişim İzni Olan Editörler:\s*\[([^\]]+)\]");
        if (!match.Success)
            return new List<Guid>();

        var idsString = match.Groups[1].Value;
        return idsString.Split(',')
            .Select(id => id.Trim())
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Where(id => Guid.TryParse(id, out _))
            .Select(Guid.Parse)
            .ToList();
    }
}
