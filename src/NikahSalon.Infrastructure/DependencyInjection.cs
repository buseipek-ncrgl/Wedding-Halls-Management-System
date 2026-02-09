using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NikahSalon.Application.Interfaces;
using NikahSalon.Infrastructure.Data;
using NikahSalon.Infrastructure.Identity;
using NikahSalon.Infrastructure.Repositories;
using NikahSalon.Infrastructure.Services;

namespace NikahSalon.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var conn = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(conn))
        {
            conn = configuration["CONNECTION_STRING"];
        }
        if (string.IsNullOrWhiteSpace(conn))
        {
            throw new InvalidOperationException("ConnectionStrings:DefaultConnection or CONNECTION_STRING must be set.");
        }

        var provider = configuration["DatabaseProvider"] ?? "Postgres";
        var useSqlServer = string.Equals(provider, "SqlServer", StringComparison.OrdinalIgnoreCase);

        services.AddDbContext<AppDbContext>(o =>
        {
            if (useSqlServer)
                o.UseSqlServer(conn);
            else
                o.UseNpgsql(conn);
        });

        services.AddIdentityCore<ApplicationUser>(o =>
        {
            o.Password.RequireDigit = true;
            o.Password.RequireLowercase = true;
            o.Password.RequireUppercase = true;
            o.Password.RequireNonAlphanumeric = false;
            o.Password.RequiredLength = 6;
        })
            .AddRoles<IdentityRole<Guid>>()
            .AddEntityFrameworkStores<AppDbContext>()
            .AddRoleManager<RoleManager<IdentityRole<Guid>>>();

        services.AddScoped<ICenterRepository, CenterRepository>();
        services.AddScoped<IWeddingHallRepository, WeddingHallRepository>();
        services.AddScoped<IHallAccessRepository, HallAccessRepository>();
        services.AddScoped<ICenterAccessRepository, CenterAccessRepository>();
        services.AddScoped<IScheduleRepository, ScheduleRepository>();
        services.AddScoped<IRequestRepository, RequestRepository>();
        services.AddScoped<IMessageRepository, MessageRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddSingleton<IJwtTokenService, JwtTokenService>();

        return services;
    }
}
