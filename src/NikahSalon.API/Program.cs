using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using Microsoft.Extensions.FileProviders;
using NikahSalon.API.Authorization;
using NikahSalon.API.Middleware;
using NikahSalon.Application;
using NikahSalon.Infrastructure;
using NikahSalon.Infrastructure.Data;
using NikahSalon.Infrastructure.Identity;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

// Tek kaynak: CorsHeadersHelper (CORS middleware + 403 handler + OnStarting ile aynı liste)
var corsOrigins = CorsHeadersHelper.ResolveAllowedOrigins(builder.Configuration).ToArray();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(corsOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

var key = builder.Configuration["Jwt:SecretKey"]
    ?? builder.Configuration["JWT_SECRET_KEY"]
    ?? throw new InvalidOperationException("Jwt:SecretKey or JWT_SECRET_KEY must be configured.");

var issuer = builder.Configuration["Jwt:Issuer"]
    ?? builder.Configuration["JWT_ISSUER"]
    ?? "NikahSalon";

var audience = builder.Configuration["Jwt:Audience"]
    ?? builder.Configuration["JWT_AUDIENCE"]
    ?? "NikahSalon";

// JWT -> ClaimsPrincipal: varsayılan inbound claim map bazen rol claim'ini bozar;
// [Authorize(Roles = "Editor,...")] 403 + boş gövde verir. Bkz. JwtBearer MapInboundClaims.
JwtSecurityTokenHandler.DefaultInboundClaimTypeMap.Clear();
JwtSecurityTokenHandler.DefaultOutboundClaimTypeMap.Clear();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            ValidateIssuer = true,
            ValidIssuer = issuer,
            ValidateAudience = true,
            ValidAudience = audience,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero,
            NameClaimType = ClaimTypes.NameIdentifier,
            // Token'da hem "role" hem uzun şema URL'i olabilir; ikisini de rol say
            RoleClaimType = ClaimTypes.Role
        };
        // Kısa "role" claim'i (Clear sonrası) da IsInRole ile uyumlu olsun
        o.Events = new JwtBearerEvents
        {
            OnTokenValidated = context =>
            {
                var identity = context.Principal?.Identity as ClaimsIdentity;
                if (identity == null) return Task.CompletedTask;
                var shortRole = identity.FindFirst("role")?.Value;
                if (!string.IsNullOrEmpty(shortRole) && identity.FindFirst(ClaimTypes.Role) == null)
                    identity.AddClaim(new Claim(ClaimTypes.Role, shortRole));
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();
// [Authorize] 403'te varsayılan boş gövde yerine JSON (response "hep boş" sorunu)
builder.Services.AddSingleton<IAuthorizationMiddlewareResultHandler, JsonAuthorizationMiddlewareResultHandler>();

builder.Services.AddRateLimiter(options =>
{
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 100,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 10
            }));

    options.AddPolicy("LoginPolicy", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 2
            }));

    options.AddPolicy("WritePolicy", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window = TimeSpan.FromMinutes(1),
                QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                QueueLimit = 20
            }));

    options.OnRejected = async (context, cancellationToken) =>
    {
        var http = context.HttpContext;
        CorsHeadersHelper.TryAppendForRequest(http, corsOrigins);
        http.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await http.Response.WriteAsJsonAsync(new
        {
            success = false,
            message = "Too many requests. Please try again later.",
            errors = Array.Empty<string>()
        }, cancellationToken);
    };
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Example: \"Authorization: Bearer {token}\"",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

var startupLogger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
startupLogger.LogInformation("CORS allowed origins: {Origins}", string.Join(", ", corsOrigins));

// CORS mümkün olduğunca erken (hata / rate-limit yanıtlarında da başlık zinciri için)
app.UseCors();

// 403/401 ve boş gövdelerde bile Access-Control-Allow-Origin gitsin (Chrome CORS paneli)
app.Use(async (context, next) =>
{
    CorsHeadersHelper.RegisterOnStartingIfOriginAllowed(context, corsOrigins);
    await next();
});

app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseMiddleware<ExceptionHandlingMiddleware>();

// Swagger'ı varsayılan olarak sadece development'ta aç.
// İstenirse appsettings üzerinden Swagger:Enabled=true ile production'da da açılabilir.
var swaggerEnabled = app.Environment.IsDevelopment()
    || builder.Configuration.GetValue<bool>("Swagger:Enabled");

if (swaggerEnabled)
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseStatusCodePages(async statusCodeContext =>
{
    var http = statusCodeContext.HttpContext;
    var response = http.Response;
    var request = http.Request;

    CorsHeadersHelper.TryAppendForRequest(http, corsOrigins);

    // Controller'a ulasmadan donen 401/403 yanitlarini gorunur hale getir.
    if ((response.StatusCode == StatusCodes.Status401Unauthorized ||
         response.StatusCode == StatusCodes.Status403Forbidden) &&
        string.IsNullOrEmpty(response.ContentType))
    {
        response.ContentType = "application/json";
        await response.WriteAsJsonAsync(new
        {
            success = false,
            statusCode = response.StatusCode,
            path = request.Path.Value,
            message = response.StatusCode == StatusCodes.Status401Unauthorized
                ? "Unauthorized: token gecersiz veya eksik."
                : "Forbidden: bu endpoint icin rol/yetki uygun degil."
        });
    }
});

// Ana test endpoint
app.MapGet("/", () => Results.Ok("NikahSalon API çalışıyor."));

// Controller endpointleri
app.MapControllers();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.EnsureCreatedAsync();

    var userManager = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
    var roleManager = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole<Guid>>>();

    try
    {
        await SeedData.SeedAsync(db, userManager, roleManager);
    }
    catch (Exception ex)
    {
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
        logger.LogWarning(ex, "Seed data hatası: {Message}", ex.Message);
    }
}

app.Run();