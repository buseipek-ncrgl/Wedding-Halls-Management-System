using NikahSalon.Application.DTOs;
using NikahSalon.Application.Interfaces;
using NikahSalon.Domain.Enums;

namespace NikahSalon.Application.Schedules.UpdateSchedule;

public sealed class UpdateScheduleCommandHandler
{
    private readonly IScheduleRepository _repository;
    private readonly IWeddingHallRepository _hallRepository;
    private readonly IHallAccessRepository _hallAccessRepository;

    public UpdateScheduleCommandHandler(
        IScheduleRepository repository,
        IWeddingHallRepository hallRepository,
        IHallAccessRepository hallAccessRepository)
    {
        _repository = repository;
        _hallRepository = hallRepository;
        _hallAccessRepository = hallAccessRepository;
    }

    public async Task<ScheduleDto?> HandleAsync(UpdateScheduleCommand command, CancellationToken ct = default)
    {
        var existing = await _repository.GetByIdAsync(command.Id, ct);
        if (existing is null) return null;

        var isSuperAdmin = string.Equals(command.CallerRole, "SuperAdmin", StringComparison.OrdinalIgnoreCase)
            || string.Equals(command.CallerRole, "Admin", StringComparison.OrdinalIgnoreCase);

        var isEditor = string.Equals(command.CallerRole, "Editor", StringComparison.OrdinalIgnoreCase);

        if (isEditor)
        {
            if (!command.CallerUserId.HasValue)
            {
                throw new UnauthorizedAccessException("Kullanıcı kimliği doğrulanamadı.");
            }

            var isOwner = existing.CreatedByUserId == command.CallerUserId.Value;

            var sameDepartment =
                command.CallerDepartment.HasValue &&
                existing.EventType.HasValue &&
                existing.EventType.Value == command.CallerDepartment.Value;

            // Editor kendi kaydını veya kendi departmanına ait kaydı güncelleyebilir
            if (!isOwner && !sameDepartment)
            {
                throw new UnauthorizedAccessException(
                    "Bu etkinliği düzenleme yetkiniz bulunmamaktadır. Yalnızca kendi oluşturduğunuz veya kendi alanınıza ait etkinlikleri düzenleyebilirsiniz.");
            }

            // Available -> Reserved geçişinde seçilen yeni EventType,
            // editor'ün department'ı ile eşleşmeli
            if (command.CallerDepartment.HasValue &&
                existing.Status == ScheduleStatus.Available &&
                command.Status == ScheduleStatus.Reserved &&
                command.EventType.HasValue &&
                command.EventType.Value != command.CallerDepartment.Value)
            {
                throw new UnauthorizedAccessException(
                    "Bu etkinlik tipini oluşturma yetkiniz bulunmamaktadır. Sadece kendi alanınızdaki etkinlikleri oluşturabilirsiniz.");
            }

            // Reserved bir kaydı reserved olarak güncellerken,
            // yeni EventType başka bir departmana çevrilmesin
            if (command.CallerDepartment.HasValue &&
                command.Status == ScheduleStatus.Reserved &&
                command.EventType.HasValue &&
                command.EventType.Value != command.CallerDepartment.Value)
            {
                throw new UnauthorizedAccessException(
                    "Bu etkinlik tipini güncelleme yetkiniz bulunmamaktadır. Sadece kendi alanınıza ait etkinlik tiplerini kullanabilirsiniz.");
            }

            // Department yoksa sadece owner ise devam eder; yukarıda zaten kontrol edildi
        }
        else if (!isSuperAdmin)
        {
            throw new UnauthorizedAccessException("Bu etkinliği düzenleme yetkiniz bulunmamaktadır.");
        }

        var hasOverlap = await _repository.ExistsOverlapAsync(
            command.WeddingHallId,
            command.Date,
            command.StartTime,
            command.EndTime,
            command.Id,
            ct);

        if (hasOverlap)
            throw new InvalidOperationException("Bu saat aralığında aynı salon ve tarih için başka bir rezervasyon bulunmaktadır.");

        existing.WeddingHallId = command.WeddingHallId;
        existing.Date = command.Date;
        existing.StartTime = command.StartTime;
        existing.EndTime = command.EndTime;
        existing.Status = command.Status;
        existing.EventType = command.EventType;
        existing.EventName = command.EventName;
        existing.EventOwner = command.EventOwner;

        await _repository.UpdateAsync(existing, ct);

        return new ScheduleDto
        {
            Id = existing.Id,
            WeddingHallId = existing.WeddingHallId,
            Date = existing.Date,
            StartTime = existing.StartTime,
            EndTime = existing.EndTime,
            Status = existing.Status,
            CreatedByUserId = existing.CreatedByUserId,
            EventType = existing.EventType,
            EventName = existing.EventName,
            EventOwner = existing.EventOwner
        };
    }
}