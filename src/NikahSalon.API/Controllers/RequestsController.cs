using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using NikahSalon.Application.Messages.CreateMessage;
using NikahSalon.Application.Messages.DeleteMessage;
using NikahSalon.Application.Messages.GetMessagesByRequestId;
using NikahSalon.Application.Requests.AnswerRequest;
using NikahSalon.Application.Requests.ApproveRequest;
using NikahSalon.Application.Requests.CreateRequest;
using NikahSalon.Application.Requests.DeleteRequest;
using NikahSalon.Application.Requests.GetRequestById;
using NikahSalon.Application.Requests.GetRequests;
using NikahSalon.Application.Requests.RejectRequest;
using NikahSalon.Application.Requests.UpdateRequest;
using NikahSalon.Application.Interfaces;

namespace NikahSalon.API.Controllers;

[ApiController]
[Route("api/v1/requests")]
[Authorize]
public sealed class RequestsController : ControllerBase
{
    private readonly CreateRequestCommandHandler _createHandler;
    private readonly GetRequestsQueryHandler _getRequestsHandler;
    private readonly GetRequestByIdQueryHandler _getRequestByIdHandler;
    private readonly AnswerRequestCommandHandler _answerHandler;
    private readonly ApproveRequestCommandHandler _approveHandler;
    private readonly RejectRequestCommandHandler _rejectHandler;
    private readonly DeleteRequestCommandHandler _deleteHandler;
    private readonly CreateRequestCommandValidator _createValidator;
    private readonly UpdateRequestCommandHandler _updateHandler;
    private readonly UpdateRequestCommandValidator _updateValidator;
    private readonly CreateMessageCommandHandler _createMessageHandler;
    private readonly DeleteMessageCommandHandler _deleteMessageHandler;
    private readonly GetMessagesByRequestIdQueryHandler _getMessagesHandler;
    private readonly CreateMessageCommandValidator _createMessageValidator;
    private readonly ICenterAccessRepository _centerAccessRepository;
    private readonly IWeddingHallRepository _hallRepository;

    public RequestsController(
        CreateRequestCommandHandler createHandler,
        GetRequestsQueryHandler getRequestsHandler,
        GetRequestByIdQueryHandler getRequestByIdHandler,
        AnswerRequestCommandHandler answerHandler,
        ApproveRequestCommandHandler approveHandler,
        RejectRequestCommandHandler rejectHandler,
        DeleteRequestCommandHandler deleteHandler,
        CreateRequestCommandValidator createValidator,
        UpdateRequestCommandHandler updateHandler,
        UpdateRequestCommandValidator updateValidator,
        CreateMessageCommandHandler createMessageHandler,
        DeleteMessageCommandHandler deleteMessageHandler,
        GetMessagesByRequestIdQueryHandler getMessagesHandler,
        CreateMessageCommandValidator createMessageValidator,
        ICenterAccessRepository centerAccessRepository,
        IWeddingHallRepository hallRepository)
    {
        _createHandler = createHandler;
        _getRequestsHandler = getRequestsHandler;
        _getRequestByIdHandler = getRequestByIdHandler;
        _answerHandler = answerHandler;
        _approveHandler = approveHandler;
        _rejectHandler = rejectHandler;
        _deleteHandler = deleteHandler;
        _createValidator = createValidator;
        _updateHandler = updateHandler;
        _updateValidator = updateValidator;
        _createMessageHandler = createMessageHandler;
        _deleteMessageHandler = deleteMessageHandler;
        _getMessagesHandler = getMessagesHandler;
        _createMessageValidator = createMessageValidator;
        _centerAccessRepository = centerAccessRepository;
        _hallRepository = hallRepository;
    }

    [HttpPost]
    [Authorize(Roles = "Viewer,Editor,SuperAdmin")]
    [EnableRateLimiting("WritePolicy")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Create([FromBody] CreateRequestRequest request, CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            return Unauthorized();

        if (!DateOnly.TryParse(request.EventDate, out var eventDate))
            return BadRequest(new { success = false, message = "Invalid EventDate format." });
        if (!TimeOnly.TryParse(request.EventTime, out var eventTime))
            return BadRequest(new { success = false, message = "Invalid EventTime format." });
        if (!Enum.IsDefined(typeof(NikahSalon.Domain.Enums.EventType), request.EventType))
            return BadRequest(new { success = false, message = "Invalid EventType." });

        var command = new CreateRequestCommand
        {
            WeddingHallId = request.WeddingHallId,
            CreatedByUserId = userId,
            Message = request.Message,
            EventType = (NikahSalon.Domain.Enums.EventType)request.EventType,
            EventName = request.EventName,
            EventOwner = request.EventOwner,
            EventDate = eventDate,
            EventTime = eventTime
        };
        var validation = await _createValidator.ValidateAsync(command, ct);
        if (!validation.IsValid)
            throw new FluentValidation.ValidationException(validation.Errors);

        var created = await _createHandler.HandleAsync(command, ct);
        return Created($"/api/v1/requests/{created.Id}", created);
    }

    [HttpGet]
    [Authorize(Roles = "Editor,Viewer,SuperAdmin,MerkezSorumlusu")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] int? status = null,
        [FromQuery] string? sortBy = null,
        [FromQuery] string? sortOrder = "desc",
        CancellationToken ct = default)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var roleClaim = User.FindFirstValue(ClaimTypes.Role);
        
        // Debug: Rol bilgisini logla (development'ta)
        if (HttpContext.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment())
        {
            var logger = HttpContext.RequestServices.GetRequiredService<ILogger<RequestsController>>();
            logger.LogInformation("GetAll - User Role: {Role}, UserId: {UserId}", roleClaim, userIdClaim);
        }
        
        // Viewer can only see their own requests (SuperAdmin and Editor can see all)
        Guid? createdByUserId = null;
        IReadOnlyList<Guid>? weddingHallIds = null;
        if (roleClaim == "Viewer" && !string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var viewerId))
        {
            createdByUserId = viewerId;
        }
        // MerkezSorumlusu: only requests for halls in their assigned centers
        else if (roleClaim == "MerkezSorumlusu" && !string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var msUserId))
        {
            var centerIds = await _centerAccessRepository.GetAccessibleCenterIdsAsync(msUserId, ct);
            var allHallIds = new List<Guid>();
            foreach (var cid in centerIds)
            {
                var halls = await _hallRepository.GetByCenterIdAsync(cid, ct);
                allHallIds.AddRange(halls.Select(h => h.Id));
            }
            weddingHallIds = allHallIds;
        }

        var query = new GetRequestsQuery
        {
            Page = page,
            PageSize = pageSize,
            Status = status.HasValue ? (NikahSalon.Domain.Enums.RequestStatus?)status.Value : null,
            SortBy = sortBy,
            SortOrder = sortOrder,
            CreatedByUserId = createdByUserId,
            WeddingHallIds = weddingHallIds
        };
        var result = await _getRequestsHandler.HandleAsync(query, ct);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var roleClaim = User.FindFirstValue(ClaimTypes.Role);
        
        var query = new GetRequestByIdQuery { Id = id };
        var request = await _getRequestByIdHandler.HandleAsync(query, ct);
        if (request is null) return NotFound();
        
        // Viewer can only see their own requests (SuperAdmin and Editor can see all)
        if (roleClaim == "Viewer" && !string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var userId))
        {
            if (request.CreatedByUserId != userId)
                return Forbid();
        }
        // MerkezSorumlusu can only see requests for halls in their assigned centers
        else if (roleClaim == "MerkezSorumlusu" && !string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var msUserId))
        {
            var centerIds = await _centerAccessRepository.GetAccessibleCenterIdsAsync(msUserId, ct);
            var allowedHallIds = new HashSet<Guid>();
            foreach (var cid in centerIds)
            {
                var halls = await _hallRepository.GetByCenterIdAsync(cid, ct);
                foreach (var h in halls) allowedHallIds.Add(h.Id);
            }
            if (!allowedHallIds.Contains(request.WeddingHallId))
                return Forbid();
        }
        
        return Ok(request);
    }

    [HttpPut("{id:guid}/answer")]
    [Authorize(Roles = "Editor")]
    [EnableRateLimiting("WritePolicy")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Answer(Guid id, CancellationToken ct)
    {
        var command = new AnswerRequestCommand { Id = id };
        try
        {
            var result = await _answerHandler.HandleAsync(command, ct);
            if (result is null) return NotFound();
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpPut("{id:guid}/approve")]
    [Authorize(Roles = "Editor,SuperAdmin")]
    [EnableRateLimiting("WritePolicy")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var roleClaim = User.FindFirstValue(ClaimTypes.Role);
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var editorId))
            return Unauthorized();

        var command = new ApproveRequestCommand 
        { 
            Id = id,
            CallerRole = roleClaim ?? "Editor"
        };
        try
        {
            var result = await _approveHandler.HandleAsync(command, ct);
            if (result is null) return NotFound();
            
            // Send notification message to request creator
            try
            {
                var notificationMessage = new CreateMessageCommand
                {
                    RequestId = id,
                    SenderUserId = editorId,
                    Content = $"✅ Talebiniz onaylandı! {result.EventName} etkinliği için {result.EventDate:dd.MM.yyyy} tarihinde {result.EventTime:HH:mm} saatinde rezervasyon yapıldı."
                };
                await _createMessageHandler.HandleAsync(notificationMessage, ct);
            }
            catch
            {
                // Ignore notification errors - don't fail the approval
            }
            
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpPut("{id:guid}/reject")]
    [Authorize(Roles = "Editor,SuperAdmin")]
    [EnableRateLimiting("WritePolicy")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectRequestRequest request, CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var editorId))
            return Unauthorized();

        var roleClaim = User.FindFirstValue(ClaimTypes.Role);
        var command = new RejectRequestCommand 
        { 
            Id = id,
            Reason = request.Reason ?? string.Empty,
            CallerRole = roleClaim ?? "Editor"
        };
        try
        {
            var result = await _rejectHandler.HandleAsync(command, ct);
            if (result is null) return NotFound();
            
            // Send notification message to request creator
            try
            {
                var reasonText = !string.IsNullOrWhiteSpace(request.Reason) 
                    ? $" Sebep: {request.Reason}" 
                    : "";
                var notificationMessage = new CreateMessageCommand
                {
                    RequestId = id,
                    SenderUserId = editorId,
                    Content = $"❌ Talebiniz reddedildi.{reasonText}"
                };
                await _createMessageHandler.HandleAsync(notificationMessage, ct);
            }
            catch
            {
                // Ignore notification errors - don't fail the rejection
            }
            
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpPut("{id:guid}/update")]
    [Authorize(Roles = "Viewer,Editor,SuperAdmin")]
    [EnableRateLimiting("WritePolicy")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateRequestRequest request, CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            return Unauthorized();

        var roleClaim = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;

        if (!DateOnly.TryParse(request.EventDate, out var eventDate))
            return BadRequest(new { success = false, message = "Invalid EventDate format." });
        if (!TimeOnly.TryParse(request.EventTime, out var eventTime))
            return BadRequest(new { success = false, message = "Invalid EventTime format." });
        if (!Enum.IsDefined(typeof(NikahSalon.Domain.Enums.EventType), request.EventType))
            return BadRequest(new { success = false, message = "Invalid EventType." });

        var command = new UpdateRequestCommand
        {
            Id = id,
            CallerUserId = userId,
            CallerRole = roleClaim,
            WeddingHallId = request.WeddingHallId,
            Message = request.Message ?? string.Empty,
            EventType = (NikahSalon.Domain.Enums.EventType)request.EventType,
            EventName = request.EventName,
            EventOwner = request.EventOwner,
            EventDate = eventDate,
            EventTime = eventTime
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
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpPost("{id:guid}/messages")]
    [EnableRateLimiting("WritePolicy")]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> CreateMessage(Guid id, [FromBody] CreateMessageRequest request, CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            return Unauthorized();

        var command = new CreateMessageCommand
        {
            RequestId = id,
            SenderUserId = userId,
            Content = request.Content
        };
        var validation = await _createMessageValidator.ValidateAsync(command, ct);
        if (!validation.IsValid)
            throw new FluentValidation.ValidationException(validation.Errors);

        try
        {
            var created = await _createMessageHandler.HandleAsync(command, ct);
            return Created($"/api/v1/requests/{id}/messages/{created.Id}", created);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
    }

    [HttpGet("{id:guid}/messages")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetMessages(Guid id, CancellationToken ct)
    {
        var query = new GetMessagesByRequestIdQuery { RequestId = id };
        var items = await _getMessagesHandler.HandleAsync(query, ct);
        return Ok(items);
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Roles = "Editor,Viewer,SuperAdmin")]
    [EnableRateLimiting("WritePolicy")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var roleClaim = User.FindFirstValue(ClaimTypes.Role);

        // Viewer can delete only their own Pending requests
        if (roleClaim == "Viewer")
        {
            if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
                return Unauthorized();

            var req = await _getRequestByIdHandler.HandleAsync(new GetRequestByIdQuery { Id = id }, ct);
            if (req is null) return NotFound(new { success = false, message = "Request not found." });

            if (req.CreatedByUserId != userId)
                return Forbid();

            if (req.Status != NikahSalon.Domain.Enums.RequestStatus.Pending)
                return BadRequest(new { success = false, message = "Sadece bekleyen talepler silinebilir." });
        }

        var command = new DeleteRequestCommand { Id = id };
        var deleted = await _deleteHandler.HandleAsync(command, ct);
        
        if (!deleted)
            return NotFound(new { success = false, message = "Request not found." });

        return NoContent();
    }

    [HttpDelete("{id:guid}/messages/{messageId:guid}")]
    [EnableRateLimiting("WritePolicy")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> DeleteMessage(Guid id, Guid messageId, CancellationToken ct)
    {
        var command = new DeleteMessageCommand 
        { 
            Id = messageId,
            RequestId = id
        };
        var deleted = await _deleteMessageHandler.HandleAsync(command, ct);
        
        if (!deleted)
            return NotFound(new { success = false, message = "Message not found or does not belong to the specified request." });

        return NoContent();
    }
}

public sealed class CreateRequestRequest
{
    public Guid WeddingHallId { get; set; }
    public string Message { get; set; } = string.Empty;
    public int EventType { get; set; }
    public string EventName { get; set; } = string.Empty;
    public string EventOwner { get; set; } = string.Empty;
    public string EventDate { get; set; } = string.Empty;
    public string EventTime { get; set; } = string.Empty;
}

public sealed class CreateMessageRequest
{
    public string Content { get; set; } = string.Empty;
}

public sealed class RejectRequestRequest
{
    public string? Reason { get; set; }
}

public sealed class UpdateRequestRequest
{
    public Guid WeddingHallId { get; set; }
    public string? Message { get; set; }
    public int EventType { get; set; }
    public string EventName { get; set; } = string.Empty;
    public string EventOwner { get; set; } = string.Empty;
    public string EventDate { get; set; } = string.Empty;
    public string EventTime { get; set; } = string.Empty;
}
