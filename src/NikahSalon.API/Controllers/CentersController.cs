using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NikahSalon.Application.Centers.CreateCenter;
using NikahSalon.Application.Centers.DeleteCenter;
using NikahSalon.Application.Centers.GetCenterDetail;
using NikahSalon.Application.Centers.GetCenterById;
using NikahSalon.Application.Centers.GetCenters;
using NikahSalon.Application.Centers.UpdateCenter;

namespace NikahSalon.API.Controllers;

[ApiController]
[Route("api/v1/centers")]
[Authorize]
public sealed class CentersController : ControllerBase
{
    private readonly GetCenterByIdQueryHandler _getByIdHandler;
    private readonly GetCenterDetailQueryHandler _getDetailHandler;
    private readonly GetCentersQueryHandler _getCentersHandler;
    private readonly CreateCenterCommandHandler _createHandler;
    private readonly UpdateCenterCommandHandler _updateHandler;
    private readonly DeleteCenterCommandHandler _deleteHandler;

    public CentersController(
        GetCenterByIdQueryHandler getByIdHandler,
        GetCenterDetailQueryHandler getDetailHandler,
        GetCentersQueryHandler getCentersHandler,
        CreateCenterCommandHandler createHandler,
        UpdateCenterCommandHandler updateHandler,
        DeleteCenterCommandHandler deleteHandler)
    {
        _getByIdHandler = getByIdHandler;
        _getDetailHandler = getDetailHandler;
        _getCentersHandler = getCentersHandler;
        _createHandler = createHandler;
        _updateHandler = updateHandler;
        _deleteHandler = deleteHandler;
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var roleClaim = User.FindFirstValue(ClaimTypes.Role);
        
        var query = new GetCentersQuery
        {
            CallerUserId = Guid.TryParse(userIdClaim, out var userId) ? userId : null,
            CallerRole = roleClaim
        };
        var centers = await _getCentersHandler.HandleAsync(query, ct);
        return Ok(centers);
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var roleClaim = User.FindFirstValue(ClaimTypes.Role);
        
        var query = new GetCenterByIdQuery
        {
            Id = id,
            CallerUserId = Guid.TryParse(userIdClaim, out var userId) ? userId : null,
            CallerRole = roleClaim
        };
        var center = await _getByIdHandler.HandleAsync(query, ct);
        if (center is null) return NotFound();
        return Ok(center);
    }

    [HttpGet("{id:guid}/detail")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetDetail(Guid id, CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var roleClaim = User.FindFirstValue(ClaimTypes.Role);
        
        var query = new GetCenterDetailQuery
        {
            Id = id,
            CallerUserId = Guid.TryParse(userIdClaim, out var userId) ? userId : null,
            CallerRole = roleClaim
        };
        var detail = await _getDetailHandler.HandleAsync(query, ct);
        if (detail is null) return NotFound();
        return Ok(detail);
    }

    [HttpPost]
    [Authorize(Roles = "SuperAdmin,Admin")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> Create([FromBody] CreateCenterRequest request, CancellationToken ct)
    {
        var command = new CreateCenterCommand
        {
            Name = request.Name ?? string.Empty,
            Address = request.Address ?? string.Empty,
            Description = request.Description ?? string.Empty,
            ImageUrl = request.ImageUrl ?? string.Empty
        };
        var created = await _createHandler.HandleAsync(command, ct);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = "SuperAdmin,Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCenterRequest request, CancellationToken ct)
    {
        var command = new UpdateCenterCommand
        {
            Id = id,
            Name = request.Name ?? string.Empty,
            Address = request.Address ?? string.Empty,
            Description = request.Description ?? string.Empty,
            ImageUrl = request.ImageUrl ?? string.Empty
        };
        var updated = await _updateHandler.HandleAsync(command, ct);
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
        var command = new DeleteCenterCommand { Id = id };
        var deleted = await _deleteHandler.HandleAsync(command, ct);
        if (!deleted) return NotFound();
        return NoContent();
    }
}

public sealed class CreateCenterRequest
{
    public string? Name { get; init; }
    public string? Address { get; init; }
    public string? Description { get; init; }
    public string? ImageUrl { get; init; }
}

public sealed class UpdateCenterRequest
{
    public string? Name { get; init; }
    public string? Address { get; init; }
    public string? Description { get; init; }
    public string? ImageUrl { get; init; }
}
