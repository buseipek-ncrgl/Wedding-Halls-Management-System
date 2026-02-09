using NikahSalon.Application.DTOs;
using NikahSalon.Application.Interfaces;
using NikahSalon.Domain.Entities;
using System.Text.RegularExpressions;

namespace NikahSalon.Application.Halls.UpdateHall;

public sealed class UpdateHallCommandHandler
{
    private readonly IWeddingHallRepository _repository;
    private readonly IHallAccessRepository _hallAccessRepo;
    private readonly ICenterRepository _centerRepo;

    public UpdateHallCommandHandler(
        IWeddingHallRepository repository,
        IHallAccessRepository hallAccessRepo,
        ICenterRepository centerRepo)
    {
        _repository = repository;
        _hallAccessRepo = hallAccessRepo;
        _centerRepo = centerRepo;
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

    public async Task<WeddingHallDto?> HandleAsync(UpdateHallCommand command, CancellationToken ct = default)
    {
        var existing = await _repository.GetByIdAsync(command.Id, ct);
        if (existing is null) return null;
        existing.CenterId = command.CenterId;
        existing.Name = command.Name;
        existing.Address = command.Address;
        existing.Capacity = command.Capacity;
        existing.Description = command.Description;
        existing.ImageUrl = command.ImageUrl;
        existing.TechnicalDetails = command.TechnicalDetails;
        await _repository.UpdateAsync(existing, ct);

        // Erişim izinlerini güncelle
        // Önce mevcut erişimleri sil
        await _hallAccessRepo.RemoveByHallIdAsync(command.Id, ct);
        
        // Tüm erişim izinlerini topla (hem command'dan hem de merkezden)
        var allAllowedUserIds = new HashSet<Guid>();
        
        // Command'dan gelen erişim izinleri
        if (command.AllowedUserIds is { Count: > 0 })
        {
            foreach (var userId in command.AllowedUserIds)
            {
                allAllowedUserIds.Add(userId);
            }
        }

        // Merkeze erişim izni olan editörler için de erişim izni ver
        if (command.CenterId != Guid.Empty)
        {
            var center = await _centerRepo.GetByIdAsync(command.CenterId, ct);
            if (center != null)
            {
                var centerAllowedUserIds = ParseAllowedUserIds(center.Description);
                foreach (var userId in centerAllowedUserIds)
                {
                    allAllowedUserIds.Add(userId);
                }
            }
        }
        
        // Yeni erişim izinlerini ekle
        if (allAllowedUserIds.Count > 0)
        {
            var accesses = allAllowedUserIds.Select(userId => new HallAccess
            {
                Id = Guid.NewGuid(),
                HallId = command.Id,
                UserId = userId,
                CreatedAt = DateTime.UtcNow
            }).ToList();
            
            await _hallAccessRepo.AddRangeAsync(accesses, ct);
        }
        return new WeddingHallDto
        {
            Id = existing.Id,
            CenterId = existing.CenterId,
            Name = existing.Name,
            Address = existing.Address,
            Capacity = existing.Capacity,
            Description = existing.Description,
            ImageUrl = existing.ImageUrl,
            TechnicalDetails = existing.TechnicalDetails
        };
    }
}
