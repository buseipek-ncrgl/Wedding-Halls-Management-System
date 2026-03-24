using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using NikahSalon.Domain.Enums;
using NikahSalon.Application.Schedules.CreateSchedule;
using NikahSalon.Application.Schedules.DeleteSchedule;
using NikahSalon.Application.Schedules.GetScheduleById;
using NikahSalon.Application.Schedules.UpdateSchedule;
using NikahSalon.Application.Auth.GetCurrentUser;
using NikahSalon.Application.Interfaces;

namespace NikahSalon.API.Controllers;

[ApiController]
[Route("api/v1/schedules")]
[Authorize(Roles = "Editor,SuperAdmin,Admin")]
public sealed class SchedulesController : ControllerBase
{
    private readonly GetScheduleByIdQueryHandler _getByIdHandler;
    private readonly CreateScheduleCommandHandler _createHandler;
    private readonly UpdateScheduleCommandHandler _updateHandler;
    private readonly DeleteScheduleCommandHandler _deleteHandler;
    private readonly CreateScheduleCommandValidator _createValidator;
    private readonly UpdateScheduleCommandValidator _updateValidator;
    private readonly GetCurrentUserQueryHandler _getCurrentUserHandler;
    private readonly IScheduleRepository _scheduleRepository;

    public SchedulesController(
        GetScheduleByIdQueryHandler getByIdHandler,
        CreateScheduleCommandHandler createHandler,
        UpdateScheduleCommandHandler updateHandler,
        DeleteScheduleCommandHandler deleteHandler,
        CreateScheduleCommandValidator createValidator,
        UpdateScheduleCommandValidator updateValidator,
        GetCurrentUserQueryHandler getCurrentUserHandler,
        IScheduleRepository scheduleRepository)
    {
        _getByIdHandler = getByIdHandler;
        _createHandler = createHandler;
        _updateHandler = updateHandler;
        _deleteHandler = deleteHandler;
        _createValidator = createValidator;
        _updateValidator = updateValidator;
        _getCurrentUserHandler = getCurrentUserHandler;
        _scheduleRepository = scheduleRepository;
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var query = new GetScheduleByIdQuery { Id = id };
        var schedule = await _getByIdHandler.HandleAsync(query, ct);

        if (schedule is null)
            return NotFound();

        return Ok(schedule);
    }

    [HttpPost]
    [EnableRateLimiting("WritePolicy")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Create([FromBody] CreateScheduleRequest request, CancellationToken ct)
    {
        var userIdClaim = GetUserIdClaim(User);
        var roleClaim = ResolveCallerRole(User);

        Guid? createdByUserId = null;
        EventType? eventType = null;

        if (IsEditorRole(roleClaim))
        {
            if (string.IsNullOrWhiteSpace(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            {
                return StatusCode(403, new { success = false, message = "Kullanıcı kimliği doğrulanamadı." });
            }

            var userQuery = new GetCurrentUserQuery { UserId = userId };
            var user = await _getCurrentUserHandler.HandleAsync(userQuery, ct);

            if (user == null)
            {
                return StatusCode(403, new { success = false, message = "Kullanıcı bilgisi bulunamadı." });
            }

            if (!user.Department.HasValue)
            {
                return BadRequest(new { success = false, message = "Editor kullanıcısının bir alan/departman atanmamış." });
            }

            createdByUserId = user.Id;
            eventType = user.Department;
        }

        var command = new CreateScheduleCommand
        {
            WeddingHallId = request.WeddingHallId,
            Date = request.Date,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            Status = request.Status,
            CreatedByUserId = createdByUserId,
            EventType = request.EventType ?? eventType,
            EventName = request.EventName,
            EventOwner = request.EventOwner,
            CallerUserId = createdByUserId,
            CallerRole = roleClaim
        };

        var validation = await _createValidator.ValidateAsync(command, ct);
        if (!validation.IsValid)
            throw new FluentValidation.ValidationException(validation.Errors);

        try
        {
            var created = await _createHandler.HandleAsync(command, ct);
            return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { success = false, message = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    [EnableRateLimiting("WritePolicy")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateScheduleRequest request, CancellationToken ct)
    {
        var userIdClaim = GetUserIdClaim(User);
        var roleClaim = ResolveCallerRole(User);

        Guid? callerUserId = null;
        EventType? callerDepartment = null;

        if (IsEditorRole(roleClaim))
        {
            if (string.IsNullOrWhiteSpace(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            {
                return StatusCode(403, new { success = false, message = "Kullanıcı kimliği doğrulanamadı." });
            }

            callerUserId = userId;

            var userQuery = new GetCurrentUserQuery { UserId = userId };
            var user = await _getCurrentUserHandler.HandleAsync(userQuery, ct);

            if (user == null)
            {
                return StatusCode(403, new { success = false, message = "Kullanıcı bilgisi bulunamadı." });
            }

            callerDepartment = user.Department;
        }

        var command = new UpdateScheduleCommand
        {
            Id = id,
            WeddingHallId = request.WeddingHallId,
            Date = request.Date,
            StartTime = request.StartTime,
            EndTime = request.EndTime,
            Status = request.Status,
            EventType = request.EventType,
            EventName = request.EventName,
            EventOwner = request.EventOwner,
            CallerUserId = callerUserId,
            CallerRole = roleClaim,
            CallerDepartment = callerDepartment
        };

        var validation = await _updateValidator.ValidateAsync(command, ct);
        if (!validation.IsValid)
            throw new FluentValidation.ValidationException(validation.Errors);

        try
        {
            var updated = await _updateHandler.HandleAsync(command, ct);

            if (updated is null)
                return NotFound(new { success = false, message = "Schedule not found." });

            return Ok(updated);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { success = false, message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    [EnableRateLimiting("WritePolicy")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var userIdClaim = GetUserIdClaim(User);
        var roleClaim = ResolveCallerRole(User);

        Guid? callerUserId = null;
        EventType? callerDepartment = null;

        if (IsEditorRole(roleClaim))
        {
            if (string.IsNullOrWhiteSpace(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            {
                return StatusCode(403, new { success = false, message = "Kullanıcı kimliği doğrulanamadı." });
            }

            callerUserId = userId;

            var userQuery = new GetCurrentUserQuery { UserId = userId };
            var user = await _getCurrentUserHandler.HandleAsync(userQuery, ct);

            if (user == null)
            {
                return StatusCode(403, new { success = false, message = "Kullanıcı bilgisi bulunamadı." });
            }

            callerDepartment = user.Department;
        }

        var command = new DeleteScheduleCommand
        {
            Id = id,
            CallerUserId = callerUserId,
            CallerRole = roleClaim,
            CallerDepartment = callerDepartment
        };

        try
        {
            var deleted = await _deleteHandler.HandleAsync(command, ct);

            if (!deleted)
                return NotFound(new { success = false, message = "Schedule not found." });

            return NoContent();
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { success = false, message = ex.Message });
        }
    }

    [HttpDelete("all")]
    [Authorize(Roles = "SuperAdmin,Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> DeleteAll(CancellationToken ct)
    {
        try
        {
            var deletedCount = await _scheduleRepository.DeleteAllAsync(ct);
            return Ok(new { success = true, message = $"{deletedCount} schedule başarıyla silindi." });
        }
        catch (Exception ex)
        {
            return BadRequest(new { success = false, message = $"Hata: {ex.Message}" });
        }
    }

    private static bool IsEditorRole(string? role) =>
        !string.IsNullOrEmpty(role) &&
        string.Equals(role.Trim(), "Editor", StringComparison.OrdinalIgnoreCase);

    private static string? GetRoleClaim(ClaimsPrincipal user)
    {
        return user.FindFirstValue(ClaimTypes.Role)
            ?? user.FindFirstValue("role")
            ?? user.Claims.FirstOrDefault(c => c.Type.EndsWith("/role", StringComparison.OrdinalIgnoreCase))?.Value;
    }

    private static string? ResolveCallerRole(ClaimsPrincipal user)
    {
        var r = GetRoleClaim(user);
        if (!string.IsNullOrWhiteSpace(r))
            return r.Trim();

        if (user.IsInRole("SuperAdmin")) return "SuperAdmin";
        if (user.IsInRole("Admin")) return "Admin";
        if (user.IsInRole("Editor")) return "Editor";
        if (user.IsInRole("MerkezSorumlusu")) return "MerkezSorumlusu";
        if (user.IsInRole("Viewer")) return "Viewer";

        return null;
    }

    private static string? GetUserIdClaim(ClaimsPrincipal user)
    {
        return user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? user.FindFirstValue("sub");
    }
}

public sealed class CreateScheduleRequest
{
    public Guid WeddingHallId { get; set; }
    public DateOnly Date { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public ScheduleStatus Status { get; set; }

    /// <summary>
    /// Etkinlik tipi (Nikah=0, Nişan=1, Konser=2, Toplantı=3, Özel=4). Editor için otomatik doldurulur.
    /// </summary>
    public EventType? EventType { get; set; }

    /// <summary>
    /// Etkinlik adı (Dolu schedule'lar için zorunlu)
    /// </summary>
    public string? EventName { get; set; }

    /// <summary>
    /// Etkinlik sahibi/kişi adı (Dolu schedule'lar için zorunlu)
    /// </summary>
    public string? EventOwner { get; set; }
}

public sealed class UpdateScheduleRequest
{
    public Guid WeddingHallId { get; set; }
    public DateOnly Date { get; set; }
    public TimeOnly StartTime { get; set; }
    public TimeOnly EndTime { get; set; }
    public ScheduleStatus Status { get; set; }

    /// <summary>
    /// Etkinlik tipi (Nikah=0, Nişan=1, Konser=2, Toplantı=3, Özel=4)
    /// </summary>
    public EventType? EventType { get; set; }

    /// <summary>
    /// Etkinlik adı (Dolu schedule'lar için zorunlu)
    /// </summary>
    public string? EventName { get; set; }

    /// <summary>
    /// Etkinlik sahibi/kişi adı (Dolu schedule'lar için zorunlu)
    /// </summary>
    public string? EventOwner { get; set; }
}