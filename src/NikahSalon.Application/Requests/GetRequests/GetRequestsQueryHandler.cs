using NikahSalon.Application.Common;
using NikahSalon.Application.DTOs;
using NikahSalon.Application.Interfaces;

namespace NikahSalon.Application.Requests.GetRequests;

public sealed class GetRequestsQueryHandler
{
    private readonly IRequestRepository _repository;

    public GetRequestsQueryHandler(IRequestRepository repository)
    {
        _repository = repository;
    }

    public async Task<PagedResult<RequestDto>> HandleAsync(GetRequestsQuery query, CancellationToken ct = default)
    {
        // Validate pagination parameters
        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = query.PageSize < 1 ? 10 : query.PageSize;
        if (pageSize > 100) pageSize = 100; // Max page size limit

        // Validate sort parameters
        var sortBy = query.SortBy;
        var sortOrder = string.IsNullOrWhiteSpace(query.SortOrder) 
            ? "desc" 
            : query.SortOrder.ToLowerInvariant();
        
        // Validate sortBy values
        var validSortFields = new[] { "createdat", "eventname", "eventdate", "status" };
        if (!string.IsNullOrWhiteSpace(sortBy) && !validSortFields.Contains(sortBy.ToLowerInvariant()))
        {
            sortBy = null; // Use default sorting if invalid
        }

        var (items, totalCount) = await _repository.GetPagedAsync(
            page, 
            pageSize, 
            query.Status, 
            sortBy, 
            sortOrder,
            query.CreatedByUserId,
            query.WeddingHallIds,
            ct);
        
        var dtos = items.Select(r => new RequestDto
        {
            Id = r.Id,
            WeddingHallId = r.WeddingHallId,
            CreatedByUserId = r.CreatedByUserId,
            Message = r.Message,
            Status = r.Status,
            CreatedAt = r.CreatedAt,
            EventType = r.EventType,
            EventName = r.EventName,
            EventOwner = r.EventOwner,
            EventDate = r.EventDate,
            EventTime = r.EventTime
        }).ToList();

        var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

        return new PagedResult<RequestDto>
        {
            Items = dtos,
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount,
            TotalPages = totalPages
        };
    }
}
