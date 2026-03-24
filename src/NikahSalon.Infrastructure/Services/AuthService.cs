using Microsoft.AspNetCore.Identity;
using NikahSalon.Application.Common;
using NikahSalon.Application.Interfaces;
using NikahSalon.Infrastructure.Identity;

namespace NikahSalon.Infrastructure.Services;

public sealed class AuthService : IAuthService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IJwtTokenService _jwt;

    public AuthService(UserManager<ApplicationUser> userManager, IJwtTokenService jwt)
    {
        _userManager = userManager;
        _jwt = jwt;
    }

    public async Task<LoginResult> LoginAsync(string email, string password, CancellationToken ct = default)
    {
        var user = await _userManager.FindByEmailAsync(email);
        if (user is null)
            return new LoginResult { Success = false, Message = "Invalid email or password." };

        var valid = await _userManager.CheckPasswordAsync(user, password);
        if (!valid)
            return new LoginResult { Success = false, Message = "Invalid email or password." };

        var roles = await _userManager.GetRolesAsync(user);
        var role = SelectPrimaryRole(roles);

        var token = _jwt.GenerateToken(user.Id, user.Email ?? string.Empty, role);
        return new LoginResult
        {
            Success = true,
            Token = token,
            UserId = user.Id,
            Email = user.Email,
            Role = role
        };
    }

    private static string SelectPrimaryRole(IList<string> roles)
    {
        // Identity role order is not guaranteed.
        // Pick a deterministic primary role so privileged users do not get downgraded in JWT.
        if (roles.Any(r => string.Equals(r, "SuperAdmin", StringComparison.OrdinalIgnoreCase)))
            return "SuperAdmin";
        if (roles.Any(r => string.Equals(r, "Admin", StringComparison.OrdinalIgnoreCase)))
            return "Admin";
        if (roles.Any(r => string.Equals(r, "Editor", StringComparison.OrdinalIgnoreCase)))
            return "Editor";
        if (roles.Any(r => string.Equals(r, "Viewer", StringComparison.OrdinalIgnoreCase)))
            return "Viewer";

        return "Viewer";
    }
}
