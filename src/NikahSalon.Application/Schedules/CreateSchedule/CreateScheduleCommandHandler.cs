using Microsoft.Extensions.Logging;
using NikahSalon.Application.DTOs;
using NikahSalon.Application.Interfaces;
using NikahSalon.Domain.Entities;
using NikahSalon.Domain.Enums;

namespace NikahSalon.Application.Schedules.CreateSchedule;

public sealed class CreateScheduleCommandHandler
{
    private readonly IScheduleRepository _scheduleRepository;
    private readonly IWeddingHallRepository _hallRepository;
    private readonly IHallAccessRepository _hallAccessRepository;
    private readonly ILogger<CreateScheduleCommandHandler> _logger;

    public CreateScheduleCommandHandler(
        IScheduleRepository scheduleRepository,
        IWeddingHallRepository hallRepository,
        IHallAccessRepository hallAccessRepository,
        ILogger<CreateScheduleCommandHandler> logger)
    {
        _scheduleRepository = scheduleRepository;
        _hallRepository = hallRepository;
        _hallAccessRepository = hallAccessRepository;
        _logger = logger;
    }

    public async Task<ScheduleDto> HandleAsync(CreateScheduleCommand command, CancellationToken ct = default)
    {
        _logger.LogInformation(
            "Creating schedule for HallId: {HallId}, Date: {Date}, Time: {StartTime}-{EndTime}, Status: {Status}",
            command.WeddingHallId, command.Date, command.StartTime, command.EndTime, command.Status);

        // Verify hall exists
        var hall = await _hallRepository.GetByIdAsync(command.WeddingHallId, ct);
        if (hall == null)
        {
            _logger.LogWarning("Hall with ID {HallId} not found", command.WeddingHallId);
            throw new InvalidOperationException($"Wedding hall with ID {command.WeddingHallId} not found.");
        }

        // Editor için erişim kontrolü: Editor sadece erişim hakkı olan salonlara rezervasyon yapabilir
        // SuperAdmin tüm salonlara rezervasyon yapabilir
        if (string.Equals(command.CallerRole, "Editor", StringComparison.OrdinalIgnoreCase) && command.CallerUserId.HasValue)
        {
            var hasAccess = await _hallAccessRepository.HasAccessAsync(command.WeddingHallId, command.CallerUserId.Value, ct);
            if (!hasAccess)
            {
                _logger.LogWarning("Editor user {UserId} attempted to create schedule for hall {HallId} without access", 
                    command.CallerUserId, command.WeddingHallId);
                throw new UnauthorizedAccessException("Bu salona rezervasyon yapma yetkiniz bulunmamaktadır.");
            }
        }

        // Check for overlapping schedules
        var hasOverlap = await _scheduleRepository.ExistsOverlapAsync(
            command.WeddingHallId,
            command.Date,
            command.StartTime,
            command.EndTime,
            null, // No existing schedule to exclude
            ct);

        if (hasOverlap)
        {
            _logger.LogWarning(
                "Schedule overlap detected for HallId: {HallId}, Date: {Date}, Time: {StartTime}-{EndTime}",
                command.WeddingHallId, command.Date, command.StartTime, command.EndTime);
            throw new InvalidOperationException("Bu saat aralığında aynı salon ve tarih için başka bir rezervasyon bulunmaktadır.");
        }

        var schedule = new Schedule
        {
            Id = Guid.NewGuid(),
            WeddingHallId = command.WeddingHallId,
            Date = command.Date,
            StartTime = command.StartTime,
            EndTime = command.EndTime,
            Status = command.Status,
            CreatedByUserId = command.CreatedByUserId,
            EventType = command.EventType,
            EventName = command.EventName,
            EventOwner = command.EventOwner
        };

        var created = await _scheduleRepository.AddAsync(schedule, ct);

        _logger.LogInformation(
            "Successfully created schedule with ID: {ScheduleId}, HallId: {HallId}, Date: {Date}",
            created.Id, created.WeddingHallId, created.Date);

        return new ScheduleDto
        {
            Id = created.Id,
            WeddingHallId = created.WeddingHallId,
            Date = created.Date,
            StartTime = created.StartTime,
            EndTime = created.EndTime,
            Status = created.Status,
            CreatedByUserId = created.CreatedByUserId,
            EventType = created.EventType,
            EventName = created.EventName,
            EventOwner = created.EventOwner
        };
    }
}
