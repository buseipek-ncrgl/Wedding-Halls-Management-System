using NikahSalon.Application.DTOs;
using NikahSalon.Application.Interfaces;
using NikahSalon.Domain.Entities;
using System.Text.RegularExpressions;

namespace NikahSalon.Application.Centers.UpdateCenter;

public sealed class UpdateCenterCommandHandler
{
    private readonly ICenterRepository _repository;
    private readonly IWeddingHallRepository _hallRepository;
    private readonly IHallAccessRepository _hallAccessRepository;
    private readonly ICenterAccessRepository _centerAccessRepository;

    public UpdateCenterCommandHandler(
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

    public async Task<CenterDto?> HandleAsync(UpdateCenterCommand command, CancellationToken ct = default)
    {
        var existing = await _repository.GetByIdAsync(command.Id, ct);
        if (existing is null) return null;

        var oldAllowedUserIds = ParseAllowedUserIds(existing.Description);
        var newAllowedUserIds = ParseAllowedUserIds(command.Description);
        var oldMerkezSorumlusuIds = ParseMerkezSorumlusuIds(existing.Description);
        var newMerkezSorumlusuIds = ParseMerkezSorumlusuIds(command.Description);

        existing.Name = command.Name;
        existing.Address = command.Address;
        existing.Description = command.Description;
        existing.ImageUrl = command.ImageUrl;
        await _repository.UpdateAsync(existing, ct);

        // Erişim izinleri değiştiyse HallAccesses kayıtlarını güncelle
        var hasChanged = !oldAllowedUserIds.SequenceEqual(newAllowedUserIds);
        if (hasChanged)
        {
            // Merkeze ait tüm salonları al (sadece bu merkeze ait salonlar)
            var halls = await _hallRepository.GetByCenterIdAsync(command.Id, ct);

            // Güvenlik kontrolü: Sadece bu merkeze ait salonlar için işlem yap
            // (CenterId kontrolü ile ekstra güvenlik sağlıyoruz)
            var validHalls = halls.Where(h => h.CenterId == command.Id).ToList();

            // Sadece bu merkeze ait salonlar için eski erişimleri sil
            foreach (var hall in validHalls)
            {
                // Sadece bu salonun erişimlerini sil (hall.Id ile benzersiz ID kullanılıyor)
                await _hallAccessRepository.RemoveByHallIdAsync(hall.Id, ct);
            }

            // Yeni erişimleri oluştur (sadece bu merkeze ait salonlar için)
            if (newAllowedUserIds.Count > 0 && validHalls.Count > 0)
            {
                var accesses = new List<HallAccess>();
                foreach (var hall in validHalls)
                {
                    // Ekstra güvenlik: CenterId kontrolü
                    if (hall.CenterId != command.Id)
                        continue;

                    foreach (var userId in newAllowedUserIds)
                    {
                        accesses.Add(new HallAccess
                        {
                            Id = Guid.NewGuid(),
                            HallId = hall.Id, // Sadece bu merkeze ait salonların benzersiz ID'si
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
        }

        // Merkez Sorumluları erişimini güncelle
        var merkezSorumlusuChanged = !oldMerkezSorumlusuIds.SequenceEqual(newMerkezSorumlusuIds);
        if (merkezSorumlusuChanged)
        {
            await _centerAccessRepository.RemoveByCenterIdAsync(command.Id, ct);
            if (newMerkezSorumlusuIds.Count > 0)
            {
                var centerAccesses = newMerkezSorumlusuIds.Select(userId => new CenterAccess
                {
                    Id = Guid.NewGuid(),
                    CenterId = command.Id,
                    UserId = userId,
                    CreatedAt = DateTime.UtcNow
                }).ToList();
                await _centerAccessRepository.AddRangeAsync(centerAccesses, ct);
            }
        }

        return new CenterDto
        {
            Id = existing.Id,
            Name = existing.Name,
            Address = existing.Address,
            Description = existing.Description,
            ImageUrl = existing.ImageUrl,
            CreatedAt = existing.CreatedAt
        };
    }
}
