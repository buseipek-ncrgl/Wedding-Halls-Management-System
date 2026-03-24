namespace NikahSalon.API.Middleware;

/// <summary>
/// Middleware to add security HTTP headers to all responses.
/// </summary>
public sealed class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        // Yanıt gönderilmeden hemen önce ekle (pipeline başında Append bazen CORS/403 ile etkileşimde sorun çıkarabiliyor)
        context.Response.OnStarting(() =>
        {
            var h = context.Response.Headers;
            h["X-Content-Type-Options"] = "nosniff";
            h["X-Frame-Options"] = "DENY";
            h["Referrer-Policy"] = "no-referrer";
            h["X-XSS-Protection"] = "0";
            h["Content-Security-Policy"] = "default-src 'self'";
            return Task.CompletedTask;
        });

        await _next(context);
    }
}
