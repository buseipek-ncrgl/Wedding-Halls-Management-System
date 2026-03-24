using System.Net;
using System.Text.Json;
using FluentValidation;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using NikahSalon.API.Models;

namespace NikahSalon.API.Middleware;

public sealed class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;
    private readonly IWebHostEnvironment _environment;
    private readonly IReadOnlyList<string> _corsOrigins;

    public ExceptionHandlingMiddleware(
        RequestDelegate next,
        ILogger<ExceptionHandlingMiddleware> logger,
        IWebHostEnvironment environment,
        IConfiguration configuration)
    {
        _next = next;
        _logger = logger;
        _environment = environment;
        _corsOrigins = CorsHeadersHelper.ResolveAllowedOrigins(configuration);
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception: {Message}", ex.Message);
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception ex)
    {
        HttpStatusCode statusCode;
        string message;
        IReadOnlyList<string> errors;

        switch (ex)
        {
            case ValidationException v:
                statusCode = HttpStatusCode.BadRequest;
                message = "Validation failed.";
                errors = v.Errors.Select(e => e.ErrorMessage).ToList();
                break;
            case InvalidOperationException i:
                statusCode = HttpStatusCode.BadRequest;
                message = i.Message;
                errors = Array.Empty<string>();
                break;
            case KeyNotFoundException:
                statusCode = HttpStatusCode.NotFound;
                message = ex.Message;
                errors = Array.Empty<string>();
                break;
            case UnauthorizedAccessException:
                statusCode = HttpStatusCode.Unauthorized;
                message = ex.Message;
                errors = Array.Empty<string>();
                break;
            case DbUpdateException dbEx:
                statusCode = HttpStatusCode.InternalServerError;
                message = _environment.IsDevelopment()
                    ? $"Veritabanı hatası: {dbEx.InnerException?.Message ?? dbEx.Message}"
                    : "Veritabanı güncellenemedi. Lütfen migration'ları çalıştırdığınızdan emin olun.";
                errors = _environment.IsDevelopment() && dbEx.InnerException != null
                    ? new[] { dbEx.InnerException.Message }
                    : Array.Empty<string>();
                break;
            default:
                statusCode = HttpStatusCode.InternalServerError;
                // Development ortamında gerçek exception mesajını göster
                if (_environment.IsDevelopment())
                {
                    message = $"An unexpected error occurred: {ex.Message}";
                    var errorList = new List<string> { ex.Message };
                    if (ex.InnerException != null)
                    {
                        errorList.Add($"Inner exception: {ex.InnerException.Message}");
                    }
                    errors = errorList;
                }
                else
                {
                    message = "An unexpected error occurred.";
                    errors = Array.Empty<string>();
                }
                break;
        }

        // Response zaten yazılmışsa tekrar yazma
        if (context.Response.HasStarted)
        {
            return;
        }

        // CORS: hata gövdesi yazılmadan önce (aksi halde tarayıcı "Failed to fetch" gösterir)
        CorsHeadersHelper.TryAppendForRequest(context, _corsOrigins);

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = (int)statusCode;

        var response = new ApiResponse
        {
            Success = false,
            Message = message,
            Errors = errors
        };

        try
        {
            var json = JsonSerializer.Serialize(response, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
            await context.Response.WriteAsync(json);
        }
        catch (Exception writeEx)
        {
            _logger.LogError(writeEx, "Failed to write error response");
        }
    }
}
