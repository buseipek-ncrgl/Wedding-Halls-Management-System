using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;

namespace NikahSalon.API.Middleware;

/// <summary>
/// Rate limit / exception middleware yanıt yazdığında UseCors bazen başlık ekleyemez (HasStarted).
/// Tarayıcıda bu "Failed to fetch" ve frontend'de "Backend API'ye bağlanılamıyor" gibi görünür.
/// </summary>
public static class CorsHeadersHelper
{
    /// <summary>
    /// Plesk / sunucuda <c>Cors:Origins</c> boş kalırsa veya yanlış dosya deploy edilirse
    /// tarayıcıda CORS başlığı hiç gitmez. Canlı SPA origin'i yedek olarak her zaman eklenir.
    /// </summary>
    public static IReadOnlyList<string> ResolveAllowedOrigins(IConfiguration configuration)
    {
        var origins = configuration.GetSection("Cors:Origins").Get<string[]>();
        List<string> list;
        if (origins is { Length: > 0 })
        {
            list = [.. origins.Select(static o => o.Trim())];
        }
        else
        {
            var envOrigins = configuration["CORS_ORIGINS"];
            if (!string.IsNullOrEmpty(envOrigins))
            {
                list = [.. envOrigins.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)];
            }
            else
            {
                list = ["http://localhost:3000", "http://127.0.0.1:3000"];
            }
        }

        const string prodSpa = "https://sehitkamilnikahsalonu.maind.com.tr";
        if (!list.Exists(static o => string.Equals(o, prodSpa, StringComparison.OrdinalIgnoreCase)))
            list.Add(prodSpa);

        return list;
    }

    public static void TryAppendForRequest(HttpContext context, IReadOnlyList<string> allowedOrigins)
    {
        if (context.Response.HasStarted)
            return;

        var origin = context.Request.Headers.Origin.FirstOrDefault();
        if (string.IsNullOrEmpty(origin))
            return;

        foreach (var o in allowedOrigins)
        {
            if (string.Equals(o.Trim(), origin, StringComparison.OrdinalIgnoreCase))
            {
                var h = context.Response.Headers;
                h["Access-Control-Allow-Origin"] = origin;
                h["Access-Control-Allow-Headers"] = "authorization,content-type";
                h["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
                h["Vary"] = "Origin";
                return;
            }
        }
    }

    /// <summary>
    /// 403/401 gibi erken yazılmış yanıtlarda UseCors bazen başlık ekleyemez.
    /// OnStarting, header'lar istemciye gitmeden hemen önce çalışır — tarayıcı CORS hatası vermez.
    /// </summary>
    public static void RegisterOnStartingIfOriginAllowed(HttpContext context, IReadOnlyList<string> allowedOrigins)
    {
        var origin = context.Request.Headers.Origin.FirstOrDefault();
        if (string.IsNullOrEmpty(origin))
            return;

        foreach (var o in allowedOrigins)
        {
            if (!string.Equals(o.Trim(), origin, StringComparison.OrdinalIgnoreCase))
                continue;

            context.Response.OnStarting(() =>
            {
                var h = context.Response.Headers;
                // UseCors veya başka middleware aynı başlığı eklemiş olsa bile tek değer kalsın
                h["Access-Control-Allow-Origin"] = origin;
                h["Access-Control-Allow-Headers"] = "authorization,content-type";
                h["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
                h["Vary"] = "Origin";
                return Task.CompletedTask;
            });
            return;
        }
    }
}
