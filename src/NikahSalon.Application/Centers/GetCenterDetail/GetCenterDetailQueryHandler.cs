using System.Linq;
using NikahSalon.Application.Interfaces;
using NikahSalon.Domain.Enums;

namespace NikahSalon.Application.Centers.GetCenterDetail;

public sealed class GetCenterDetailQueryHandler
{
    private readonly ICenterRepository _centerRepository;
    private readonly IWeddingHallRepository _hallRepository;
    private readonly IScheduleRepository _scheduleRepository;
    private readonly IHallAccessRepository _hallAccessRepository;

    public GetCenterDetailQueryHandler(
        ICenterRepository centerRepository,
        IWeddingHallRepository hallRepository,
        IScheduleRepository scheduleRepository,
        IHallAccessRepository hallAccessRepository)
    {
        _centerRepository = centerRepository;
        _hallRepository = hallRepository;
        _scheduleRepository = scheduleRepository;
        _hallAccessRepository = hallAccessRepository;
    }

    public async Task<CenterDetailDto?> HandleAsync(GetCenterDetailQuery query, CancellationToken ct = default)
    {
        var center = await _centerRepository.GetByIdAsync(query.Id, ct);
        if (center is null) return null;

        // Bu merkeze ait salonları getir
        var centerHallsList = (await _hallRepository.GetByCenterIdAsync(center.Id, ct)).ToList();
        
        // SuperAdmin ve Viewer tüm salonları görebilir, Editor sadece erişimi olan salonları görebilir
        if (query.CallerRole == "Editor" && query.CallerUserId.HasValue)
        {
            // Editor ise sadece erişimi olan salonları görebilir
            var accessibleHallIds = await _hallAccessRepository.GetAccessibleHallIdsAsync(query.CallerUserId.Value, ct);
            var accessibleSet = accessibleHallIds.ToHashSet();
            
            // Bu merkeze erişimi var mı kontrol et
            var hasAccess = centerHallsList.Any(h => accessibleSet.Contains(h.Id));
            if (!hasAccess)
            {
                // Erişim yoksa null döndür
                return null;
            }
            
            // Sadece erişimi olan salonları filtrele
            centerHallsList = centerHallsList.Where(h => accessibleSet.Contains(h.Id)).ToList();
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
}
