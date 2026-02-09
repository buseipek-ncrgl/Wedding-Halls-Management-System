using System.Linq;
using System.Text.RegularExpressions;
using NikahSalon.Application.DTOs;
using NikahSalon.Application.Interfaces;

namespace NikahSalon.Application.Centers.GetCenters;

public sealed class GetCentersQueryHandler
{
    private readonly ICenterRepository _repository;
    private readonly IWeddingHallRepository _hallRepository;
    private readonly IHallAccessRepository _hallAccessRepository;
    private readonly ICenterAccessRepository _centerAccessRepository;

    public GetCentersQueryHandler(
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
        
        // MerkezSorumlusu sadece atandığı merkezleri görebilir (sadece görüntüleme)
        if (query.CallerRole == "MerkezSorumlusu" && query.CallerUserId.HasValue)
        {
            var accessibleCenterIds = await _centerAccessRepository.GetAccessibleCenterIdsAsync(query.CallerUserId.Value, ct);
            var accessibleSet = accessibleCenterIds.ToHashSet();
            return centers
                .Where(c => accessibleSet.Contains(c.Id))
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
        
        // Editor ise sadece erişimi olan merkezleri görebilir
        // (merkezdeki salonlardan en az birine erişimi varsa VEYA merkezin editörleri listesinde ise)
        if (query.CallerRole == "Editor" && query.CallerUserId.HasValue)
        {
            var accessibleHallIds = await _hallAccessRepository.GetAccessibleHallIdsAsync(query.CallerUserId.Value, ct);
            var accessibleSet = accessibleHallIds.ToHashSet();
            
            var allHalls = await _hallRepository.GetAllAsync(ct);
            var accessibleCenterIdsFromHalls = allHalls
                .Where(h => accessibleSet.Contains(h.Id))
                .Select(h => h.CenterId)
                .Distinct()
                .ToHashSet();
            
            // Merkezin description'ından editörleri parse et ve eğer bu editör merkezin editörleri listesindeyse merkezi göster
            var accessibleCenterIdsFromDescription = new HashSet<Guid>();
            foreach (var center in centers)
            {
                var allowedUserIds = ParseAllowedUserIds(center.Description);
                if (allowedUserIds.Contains(query.CallerUserId.Value))
                {
                    accessibleCenterIdsFromDescription.Add(center.Id);
                }
            }
            
            // İki kaynaktan gelen merkez ID'lerini birleştir
            var allAccessibleCenterIds = accessibleCenterIdsFromHalls.Union(accessibleCenterIdsFromDescription).ToHashSet();
            
            return centers
                .Where(c => allAccessibleCenterIds.Contains(c.Id))
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
