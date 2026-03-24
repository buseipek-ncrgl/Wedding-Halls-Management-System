using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using NikahSalon.Application.Dashboard.GetDashboardStats;
using NikahSalon.Application.Dashboard.GetRequestsSummary;
using NikahSalon.Application.Dashboard.GetSchedulesSummary;

namespace NikahSalon.API.Controllers;

[ApiController]
[Route("api/v1/dashboard")]
[Authorize(Roles = "Editor,Viewer,SuperAdmin,Admin,MerkezSorumlusu")]
public sealed class DashboardController : ControllerBase
{
    private readonly GetDashboardStatsQueryHandler _statsHandler;
    private readonly GetRequestsSummaryQueryHandler _requestsSummaryHandler;
    private readonly GetSchedulesSummaryQueryHandler _schedulesSummaryHandler;

    public DashboardController(
        GetDashboardStatsQueryHandler statsHandler,
        GetRequestsSummaryQueryHandler requestsSummaryHandler,
        GetSchedulesSummaryQueryHandler schedulesSummaryHandler)
    {
        _statsHandler = statsHandler;
        _requestsSummaryHandler = requestsSummaryHandler;
        _schedulesSummaryHandler = schedulesSummaryHandler;
    }

    [HttpGet("stats")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetStats(CancellationToken ct)
    {
        var query = new GetDashboardStatsQuery();
        var result = await _statsHandler.HandleAsync(query, ct);
        return Ok(result);
    }

    [HttpGet("requests-summary")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRequestsSummary(CancellationToken ct)
    {
        var query = new GetRequestsSummaryQuery();
        var result = await _requestsSummaryHandler.HandleAsync(query, ct);
        return Ok(result);
    }

    [HttpGet("schedules-summary")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSchedulesSummary(CancellationToken ct)
    {
        var query = new GetSchedulesSummaryQuery();
        var result = await _schedulesSummaryHandler.HandleAsync(query, ct);
        return Ok(result);
    }
}
