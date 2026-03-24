using Microsoft.Extensions.Logging;
using NikahSalon.Application.Interfaces;

namespace NikahSalon.Application.Schedules.DeleteSchedule;

public sealed class DeleteScheduleCommandHandler
{
    private readonly IScheduleRepository _repository;
    private readonly ILogger<DeleteScheduleCommandHandler> _logger;

    public DeleteScheduleCommandHandler(
        IScheduleRepository repository,
        ILogger<DeleteScheduleCommandHandler> logger)
    {
        _repository = repository;
        _logger = logger;
    }

    public async Task<bool> HandleAsync(DeleteScheduleCommand command, CancellationToken ct = default)
    {
        _logger.LogInformation("Deleting schedule with ID: {ScheduleId}", command.Id);

        var schedule = await _repository.GetByIdAsync(command.Id, ct);
        if (schedule == null)
        {
            _logger.LogWarning("Schedule with ID {ScheduleId} not found for deletion", command.Id);
            return false;
        }

        var isSuperAdmin = string.Equals(command.CallerRole, "SuperAdmin", StringComparison.OrdinalIgnoreCase)
            || string.Equals(command.CallerRole, "Admin", StringComparison.OrdinalIgnoreCase);
        var isEditor = string.Equals(command.CallerRole, "Editor", StringComparison.OrdinalIgnoreCase);

        // SuperAdmin tum schedule'lari silebilir (yetki kontrolu bypass).
        // Editor sadece kendi alanindaki (EventType) schedule'lari silebilir.
        if (isEditor)
        {
            if (!command.CallerUserId.HasValue)
            {
                _logger.LogWarning("Editor role detected but CallerUserId is missing for schedule {ScheduleId}", command.Id);
                throw new UnauthorizedAccessException("Kullanıcı kimliği doğrulanamadı.");
            }

            var isOwner = command.CallerUserId.HasValue && schedule.CreatedByUserId == command.CallerUserId.Value;

            // Department varsa departman kurali, yoksa sadece kendi kaydini silebilsin.
            if (command.CallerDepartment.HasValue)
            {
                // Schedule'ın EventType'ı Editor'ın department'ı ile eşleşmeli
                if (schedule.EventType != command.CallerDepartment.Value)
                {
                    _logger.LogWarning("Editor user {UserId} attempted to delete schedule {ScheduleId} with EventType {ScheduleEventType} but their department is {EditorDepartment}", 
                        command.CallerUserId, command.Id, schedule.EventType, command.CallerDepartment);
                    throw new UnauthorizedAccessException("Bu schedule'ı silme yetkiniz bulunmamaktadır. Sadece kendi alanınızdaki etkinlikleri silebilirsiniz.");
                }
            }
            else if (!isOwner)
            {
                _logger.LogWarning("Editor user {UserId} attempted to delete schedule {ScheduleId} without department and not owner", command.CallerUserId, command.Id);
                throw new UnauthorizedAccessException("Bu schedule'ı silme yetkiniz bulunmamaktadır.");
            }
        }
        else if (!isSuperAdmin)
        {
            _logger.LogWarning("Unauthorized role {Role} attempted to delete schedule {ScheduleId}", command.CallerRole, command.Id);
            throw new UnauthorizedAccessException("Bu schedule'ı silme yetkiniz bulunmamaktadır.");
        }

        var deleted = await _repository.DeleteAsync(command.Id, ct);
        
        if (deleted)
        {
            _logger.LogInformation(
                "Successfully deleted schedule with ID: {ScheduleId}, HallId: {HallId}, Date: {Date}, Time: {StartTime}-{EndTime}",
                command.Id, schedule.WeddingHallId, schedule.Date, schedule.StartTime, schedule.EndTime);
        }
        else
        {
            _logger.LogError("Failed to delete schedule with ID: {ScheduleId}", command.Id);
        }

        return deleted;
    }
}
