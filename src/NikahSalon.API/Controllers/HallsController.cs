using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using NikahSalon.Application.Halls.CreateHall;
using NikahSalon.Application.Halls.DeleteHall;
using NikahSalon.Application.Halls.GetHallById;
using NikahSalon.Application.Halls.GetHalls;
using NikahSalon.Application.Halls.UpdateHall;
using NikahSalon.Application.Schedules.GetSchedulesByHall;
using NikahSalon.Application.Auth.GetCurrentUser;
using NikahSalon.Domain.Enums;

namespace NikahSalon.API.Controllers;

[ApiController]
[Route("api/v1/halls")]
[Authorize]
public sealed class HallsController : ControllerBase
{
    private readonly GetHallsQueryHandler _getHallsHandler;
    private readonly GetHallByIdQueryHandler _getHallByIdHandler;
    private readonly GetSchedulesByHallQueryHandler _getSchedulesHandler;
    private readonly GetCurrentUserQueryHandler _getCurrentUserHandler;
    private readonly CreateHallCommandHandler _createHallHandler;
    private readonly UpdateHallCommandHandler _updateHallHandler;
    private readonly DeleteHallCommandHandler _deleteHallHandler;

    public HallsController(
        GetHallsQueryHandler getHallsHandler,
        GetHallByIdQueryHandler getHallByIdHandler,
        GetSchedulesByHallQueryHandler getSchedulesHandler,
        GetCurrentUserQueryHandler getCurrentUserHandler,
        CreateHallCommandHandler createHallHandler,
        UpdateHallCommandHandler updateHallHandler,
        DeleteHallCommandHandler deleteHallHandler)
    {
        _getHallsHandler = getHallsHandler;
        _getHallByIdHandler = getHallByIdHandler;
        _getSchedulesHandler = getSchedulesHandler;
        _getCurrentUserHandler = getCurrentUserHandler;
        _createHallHandler = createHallHandler;
        _updateHallHandler = updateHallHandler;
        _deleteHallHandler = deleteHallHandler;
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var roleClaim = User.FindFirstValue(ClaimTypes.Role);
        
        var query = new GetHallsQuery
        {
            CallerUserId = Guid.TryParse(userIdClaim, out var userId) ? userId : null,
            CallerRole = roleClaim
        };
        var items = await _getHallsHandler.HandleAsync(query, ct);
        return Ok(items);
    }

    [HttpPost]
    [Authorize(Roles = "SuperAdmin,Admin")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Create([FromBody] CreateHallRequest request, CancellationToken ct)
    {
        var command = new CreateHallCommand
        {
            CenterId = request.CenterId,
            Name = request.Name ?? string.Empty,
            Address = request.Address ?? string.Empty,
            Capacity = request.Capacity,
            Description = request.Description ?? string.Empty,
            ImageUrl = request.ImageUrl ?? string.Empty,
            TechnicalDetails = request.TechnicalDetails ?? string.Empty,
            TimeSlots = request.TimeSlots,
            AllowedUserIds = request.AllowedUserIds
        };
        var created = await _createHallHandler.HandleAsync(command, ct);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var query = new GetHallByIdQuery { Id = id };
        var hall = await _getHallByIdHandler.HandleAsync(query, ct);
        if (hall is null) return NotFound();
        return Ok(hall);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "SuperAdmin,Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateHallRequest request, CancellationToken ct)
    {
        var command = new UpdateHallCommand
        {
            Id = id,
            CenterId = request.CenterId,
            Name = request.Name ?? string.Empty,
            Address = request.Address ?? string.Empty,
            Capacity = request.Capacity,
            Description = request.Description ?? string.Empty,
            ImageUrl = request.ImageUrl ?? string.Empty,
            TechnicalDetails = request.TechnicalDetails ?? string.Empty,
            AllowedUserIds = request.AllowedUserIds
        };
        var updated = await _updateHallHandler.HandleAsync(command, ct);
        if (updated is null) return NotFound();
        return Ok(updated);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "SuperAdmin,Admin")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var command = new DeleteHallCommand { Id = id };
        var deleted = await _deleteHallHandler.HandleAsync(command, ct);
        if (!deleted) return NotFound();
        return NoContent();
    }

    [HttpGet("{id:guid}/schedules")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSchedules(Guid id, CancellationToken ct)
    {
        // Editor artık tüm schedule'ları görebilir (filtreleme yok)
        // Düzenleme/silme yetkisi UpdateSchedule ve DeleteSchedule handler'larında kontrol ediliyor
        var query = new GetSchedulesByHallQuery 
        { 
            HallId = id,
            CreatedByUserId = null,
            EventType = null
        };
        var items = await _getSchedulesHandler.HandleAsync(query, ct);
        return Ok(items);
    }
}

public sealed class CreateHallRequest
{
    public Guid CenterId { get; init; } // Merkez ID'si
    public string? Name { get; init; }
    public string? Address { get; init; }
    public int Capacity { get; init; }
    public string? Description { get; init; }
    public string? ImageUrl { get; init; }
    public string? TechnicalDetails { get; init; }
    public IReadOnlyList<string>? TimeSlots { get; init; }
    /// <summary>Bu salona erişim hakkı olan Editor kullanıcı ID'leri</summary>
    public IReadOnlyList<Guid>? AllowedUserIds { get; init; }
}

public sealed class UpdateHallRequest
{
    public Guid CenterId { get; init; } // Merkez ID'si
    public string? Name { get; init; }
    public string? Address { get; init; }
    public int Capacity { get; init; }
    public string? Description { get; init; }
    public string? ImageUrl { get; init; }
    public string? TechnicalDetails { get; init; }
    /// <summary>Bu salona erişim hakkı olan Editor kullanıcı ID'leri</summary>
    public IReadOnlyList<Guid>? AllowedUserIds { get; init; }
}
