using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using NikahSalon.Application.Users.CreateUser;
using NikahSalon.Application.Users.GetUserById;
using NikahSalon.Application.Users.GetUsers;
using NikahSalon.Application.Users.UpdateUser;
using NikahSalon.Domain.Enums;

namespace NikahSalon.API.Controllers;

[ApiController]
[Route("api/v1/users")]
[Authorize(Roles = "SuperAdmin,Admin")]
public sealed class UsersController : ControllerBase
{
    private readonly GetUsersQueryHandler _getUsersHandler;
    private readonly GetUserByIdQueryHandler _getUserByIdHandler;
    private readonly CreateUserCommandHandler _createHandler;
    private readonly UpdateUserCommandHandler _updateHandler;
    private readonly CreateUserCommandValidator _createValidator;
    private readonly UpdateUserCommandValidator _updateValidator;

    public UsersController(
        GetUsersQueryHandler getUsersHandler,
        GetUserByIdQueryHandler getUserByIdHandler,
        CreateUserCommandHandler createHandler,
        UpdateUserCommandHandler updateHandler,
        CreateUserCommandValidator createValidator,
        UpdateUserCommandValidator updateValidator)
    {
        _getUsersHandler = getUsersHandler;
        _getUserByIdHandler = getUserByIdHandler;
        _createHandler = createHandler;
        _updateHandler = updateHandler;
        _createValidator = createValidator;
        _updateValidator = updateValidator;
    }

    [HttpGet]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        var query = new GetUsersQuery
        {
            Page = page,
            PageSize = pageSize,
            Search = search
        };
        var result = await _getUsersHandler.HandleAsync(query, ct);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var query = new GetUserByIdQuery { Id = id };
        var user = await _getUserByIdHandler.HandleAsync(query, ct);
        if (user is null) return NotFound();
        return Ok(user);
    }

    [HttpPost]
    [EnableRateLimiting("WritePolicy")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Create([FromBody] CreateUserRequest request, CancellationToken ct)
    {
        var command = new CreateUserCommand
        {
            Email = request.Email,
            Password = request.Password,
            FullName = request.FullName,
            Role = request.Role,
            Department = request.Department
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
    }

    [HttpPut("{id:guid}")]
    [EnableRateLimiting("WritePolicy")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateUserRequest request, CancellationToken ct)
    {
        var command = new UpdateUserCommand
        {
            Id = id,
            Email = request.Email,
            FullName = request.FullName,
            Role = request.Role,
            Department = request.Department
        };
        var validation = await _updateValidator.ValidateAsync(command, ct);
        if (!validation.IsValid)
            throw new FluentValidation.ValidationException(validation.Errors);

        try
        {
            var updated = await _updateHandler.HandleAsync(command, ct);
            if (updated is null) return NotFound();
            return Ok(updated);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }
}

public sealed class CreateUserRequest
{
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    /// <summary>
    /// Editor'lar için alan/departman (Nikah=0, Nişan=1, Konser=2, Toplantı=3, Özel=4). SuperAdmin ve Viewer için null.
    /// </summary>
    public EventType? Department { get; set; }
}

public sealed class UpdateUserRequest
{
    public string? Email { get; set; }
    public string? FullName { get; set; }
    public string? Role { get; set; }
    /// <summary>
    /// Editor'lar için alan/departman (Nikah=0, Nişan=1, Konser=2, Toplantı=3, Özel=4). SuperAdmin ve Viewer için null.
    /// </summary>
    public EventType? Department { get; set; }
    public string? Phone { get; set; }
}
