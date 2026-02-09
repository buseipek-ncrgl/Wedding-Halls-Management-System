using System.Linq;
using System.Text.RegularExpressions;
using NikahSalon.Application.Interfaces;
using NikahSalon.Domain.Enums;

namespace NikahSalon.Application.Centers.GetCenterDetail;

public sealed class GetCenterDetailQueryHandler
{
    private readonly ICenterRepository _centerRepository;
    private readonly IWeddingHallRepository _hallRepository;
    private readonly IScheduleRepository _scheduleRepository;
    private readonly IHallAccessRepository _hallAccessRepository;
    private readonly ICenterAccessRepository _centerAccessRepository;

    public GetCenterDetailQueryHandler(
        ICenterRepository centerRepository,
        IWeddingHallRepository hallRepository,
        IScheduleRepository scheduleRepository,
        IHallAccessRepository hallAccessRepository,
        ICenterAccessRepository centerAccessRepository)
    {
        _centerRepository = centerRepository;
        _hallRepository = hallRepository;
        _scheduleRepository = scheduleRepository;
        _hallAccessRepository = hallAccessRepository;
        _centerAccessRepository = centerAccessRepository;
    }

    public async Task<CenterDetailDto?> HandleAsync(GetCenterDetailQuery query, CancellationToken ct = default)
    {
        var center = await _centerRepository.GetByIdAsync(query.Id, ct);
        if (center is null) return null;

        // Bu merkeze ait salonları getir
        var centerHallsList = (await _hallRepository.GetByCenterIdAsync(center.Id, ct)).ToList();
        
        // MerkezSorumlusu sadece atandığı merkezleri görebilir (tüm salonları görüntüleme)
        if (query.CallerRole == "MerkezSorumlusu" && query.CallerUserId.HasValue)
        {
            var accessibleCenterIds = await _centerAccessRepository.GetAccessibleCenterIdsAsync(query.CallerUserId.Value, ct);
            if (!accessibleCenterIds.Contains(center.Id))
                return null;
            // Tüm salonları göster (düzenleme yok)
        }
        // SuperAdmin ve Viewer tüm salonları görebilir, Editor sadece erişimi olan salonları görebilir
        else if (query.CallerRole == "Editor" && query.CallerUserId.HasValue)
        {
            var accessibleHallIds = await _hallAccessRepository.GetAccessibleHallIdsAsync(query.CallerUserId.Value, ct);
            var accessibleSet = accessibleHallIds.ToHashSet();
            
            // Merkezin description'ından editörleri kontrol et
            var allowedUserIds = ParseAllowedUserIds(center.Description);
            var hasAccessFromDescription = allowedUserIds.Contains(query.CallerUserId.Value);
            
            var hasAccessFromHalls = centerHallsList.Any(h => accessibleSet.Contains(h.Id));
            
            // Eğer merkezin editörleri listesinde değilse ve salonlara erişimi yoksa merkezi gösterme
            if (!hasAccessFromHalls && !hasAccessFromDescription)
                return null;
            
            // Eğer merkezin editörleri listesindeyse tüm salonları göster, değilse sadece erişimi olan salonları göster
            if (!hasAccessFromDescription)
            {
                centerHallsList = centerHallsList.Where(h => accessibleSet.Contains(h.Id)).ToList();
            }
        }
        // SuperAdmin ve Viewer için tüm salonları göster (filtreleme yok)

        // Her salon için schedule'ları getir
        var hallsWithSchedules = new List<HallWithSchedulesDto>();
        foreach (var hall in centerHallsList)
        {
            var schedules = await _scheduleRepository.GetByHallIdAsync(hall.Id, ct);
            hallsWithSchedules.Add(new HallWithSchedulesDto
            {
                Id = hall.Id,
                Name = hall.Name,
                Address = hall.Address,
                Capacity = hall.Capacity,
                Description = hall.Description,
                ImageUrl = hall.ImageUrl,
                TechnicalDetails = hall.TechnicalDetails,
                Schedules = schedules.Select(s => new CenterScheduleDto
                {
                    Id = s.Id,
                    Date = s.Date,
                    StartTime = s.StartTime,
                    EndTime = s.EndTime,
                    Status = s.Status == ScheduleStatus.Available ? 0 : 1,
                    EventType = s.EventType.HasValue ? (int)s.EventType.Value : null,
                    EventName = s.EventName,
                    EventOwner = s.EventOwner
                }).ToList()
            });
        }

        return new CenterDetailDto
        {
            Id = center.Id,
            Name = center.Name,
            Address = center.Address,
            Description = center.Description,
            ImageUrl = center.ImageUrl,
            CreatedAt = center.CreatedAt,
            Halls = hallsWithSchedules
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
