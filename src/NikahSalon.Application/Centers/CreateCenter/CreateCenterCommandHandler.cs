using NikahSalon.Application.DTOs;
using NikahSalon.Application.Interfaces;
using NikahSalon.Domain.Entities;
using System.Text.RegularExpressions;

namespace NikahSalon.Application.Centers.CreateCenter;

public sealed class CreateCenterCommandHandler
{
    private readonly ICenterRepository _repository;
    private readonly IWeddingHallRepository _hallRepository;
    private readonly IHallAccessRepository _hallAccessRepository;
    private readonly ICenterAccessRepository _centerAccessRepository;

    public CreateCenterCommandHandler(
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

    private static List<Guid> ParseAllowedUserIds(string description)
    {
        if (string.IsNullOrWhiteSpace(description))
            return new List<Guid>();

        // "Erişim İzni Olan Editörler: [id1,id2,id3]" formatını parse et
        var match = Regex.Match(description, @"Erişim İzni Olan Editörler:\s*\[([^\]]+)\]");
        if (!match.Success)
            return new List<Guid>();

        var idsString = match.Groups[1].Value;
        var ids = idsString.Split(',')
            .Select(id => id.Trim())
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Where(id => Guid.TryParse(id, out _))
            .Select(Guid.Parse)
            .ToList();

        return ids;
    }

    private static List<Guid> ParseMerkezSorumlusuIds(string description)
    {
        if (string.IsNullOrWhiteSpace(description))
            return new List<Guid>();

        var match = Regex.Match(description, @"Merkez Sorumluları:\s*\[([^\]]+)\]");
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

    public async Task<CenterDto> HandleAsync(CreateCenterCommand command, CancellationToken ct = default)
    {
        var center = new Center
        {
            Id = Guid.NewGuid(),
            Name = command.Name,
            Address = command.Address,
            Description = command.Description,
            ImageUrl = command.ImageUrl,
            CreatedAt = DateTime.UtcNow
        };
        var created = await _repository.AddAsync(center, ct);

        // Merkeze erişim izni olan editörler için HallAccesses kayıtları oluştur
        var allowedUserIds = ParseAllowedUserIds(command.Description);
        if (allowedUserIds.Count > 0)
        {
            // Merkeze ait tüm salonları al
            var halls = await _hallRepository.GetByCenterIdAsync(created.Id, ct);
            
            // Her salon için her editör için HallAccess kaydı oluştur
            var accesses = new List<HallAccess>();
            foreach (var hall in halls)
            {
                foreach (var userId in allowedUserIds)
                {
                    accesses.Add(new HallAccess
                    {
                        Id = Guid.NewGuid(),
                        HallId = hall.Id,
                        UserId = userId,
                        CreatedAt = DateTime.UtcNow
                    });
                }
            }

            if (accesses.Count > 0)
            {
                await _hallAccessRepository.AddRangeAsync(accesses, ct);
            }
        }

        // Merkez Sorumluları için CenterAccess kayıtları (sadece görüntüleme)
        var merkezSorumlusuIds = ParseMerkezSorumlusuIds(command.Description);
        if (merkezSorumlusuIds.Count > 0)
        {
            var centerAccesses = merkezSorumlusuIds.Select(userId => new CenterAccess
            {
                Id = Guid.NewGuid(),
                CenterId = created.Id,
                UserId = userId,
                CreatedAt = DateTime.UtcNow
            }).ToList();
            await _centerAccessRepository.AddRangeAsync(centerAccesses, ct);
        }

        return new CenterDto
        {
            Id = created.Id,
            Name = created.Name,
            Address = created.Address,
            Description = created.Description,
            ImageUrl = created.ImageUrl,
            CreatedAt = created.CreatedAt
        };
    }
}
