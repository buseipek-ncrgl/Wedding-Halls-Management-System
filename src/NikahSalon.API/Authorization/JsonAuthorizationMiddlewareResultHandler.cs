using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using NikahSalon.API.Middleware;

namespace NikahSalon.API.Authorization;

/// <summary>
/// Varsayılan <see cref="IAuthorizationMiddlewareResultHandler"/> <c>ForbidAsync()</c> ile çoğu zaman
/// 403 + boş gövde döner; tarayıcı / frontend "response boş" görür. API için JSON açıklama döndürür.
/// </summary>
public sealed class JsonAuthorizationMiddlewareResultHandler : IAuthorizationMiddlewareResultHandler
{
    private readonly IReadOnlyList<string> _corsOrigins;

    public JsonAuthorizationMiddlewareResultHandler(IConfiguration configuration)
    {
        _corsOrigins = CorsHeadersHelper.ResolveAllowedOrigins(configuration);
    }

    public async Task HandleAsync(
        RequestDelegate next,
        HttpContext context,
        AuthorizationPolicy policy,
        PolicyAuthorizationResult authorizeResult)
    {
        if (authorizeResult.Succeeded)
        {
            await next(context);
            return;
        }

        // Yetkilendirme başarısız: CORS'u pipeline başındaki kayda ek olarak tekrar bağla (403/401 boş yanıtta başlık kaçmasın)
        CorsHeadersHelper.RegisterOnStartingIfOriginAllowed(context, _corsOrigins);

        // Oturum yok / token yok → 401 (Challenge)
        if (authorizeResult.Challenged)
        {
            CorsHeadersHelper.TryAppendForRequest(context, _corsOrigins);
            await context.ChallengeAsync();
            return;
        }

        // Giriş yapılmış ama rol/policy yetmiyor → 403 JSON (boş gövde olmasın)
        if (authorizeResult.Forbidden)
        {
            if (!context.Response.HasStarted)
            {
                CorsHeadersHelper.TryAppendForRequest(context, _corsOrigins);
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                context.Response.ContentType = "application/json; charset=utf-8";
                await context.Response.WriteAsJsonAsync(new
                {
                    success = false,
                    reason = "authorization_forbidden",
                    message =
                        "Bu endpoint için JWT içindeki rol yetersiz veya rol claim'i okunamıyor. Çıkış yapıp tekrar giriş yapın; sorun sürerse API Jwt ayarlarını (issuer/audience/secret) ve kullanıcı rolünü kontrol edin."
                });
            }
            return;
        }

        CorsHeadersHelper.TryAppendForRequest(context, _corsOrigins);
        await context.ForbidAsync();
    }
}
