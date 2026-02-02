using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using NikahSalon.Application.Common;
using NikahSalon.Application.Interfaces;
using NikahSalon.Domain.Enums;
using NikahSalon.Infrastructure.Data;
using NikahSalon.Infrastructure.Identity;

namespace NikahSalon.Infrastructure.Repositories;

public sealed class UserRepository : IUserRepository
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly RoleManager<IdentityRole<Guid>> _roleManager;
    private readonly AppDbContext _db;

    public UserRepository(
        UserManager<ApplicationUser> userManager,
        RoleManager<IdentityRole<Guid>> roleManager,
        AppDbContext db)
    {
        _userManager = userManager;
        _roleManager = roleManager;
        _db = db;
    }

    public async Task<UserInfo?> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null) return null;
        var roles = await _userManager.GetRolesAsync(user);
        var role = roles.FirstOrDefault() ?? "Viewer";
        return new UserInfo
        {
            Id = user.Id,
            Email = user.Email ?? string.Empty,
            FullName = user.FullName,
            Role = role,
            Department = user.Department,
            Phone = user.Phone
        };
    }

    public async Task<UserInfo?> GetByEmailAsync(string email, CancellationToken ct = default)
    {
        var user = await _userManager.FindByEmailAsync(email);
        if (user is null) return null;
        var roles = await _userManager.GetRolesAsync(user);
        var role = roles.FirstOrDefault() ?? "Viewer";
        return new UserInfo
        {
            Id = user.Id,
            Email = user.Email ?? string.Empty,
            FullName = user.FullName,
            Role = role,
            Department = user.Department,
            Phone = user.Phone
        };
    }

    public async Task<(IReadOnlyList<UserInfo> Items, int TotalCount)> GetPagedAsync(int page, int pageSize, string? search, CancellationToken ct = default)
    {
        var query = _userManager.Users.AsQueryable();

        // Apply search filter if provided
        if (!string.IsNullOrWhiteSpace(search))
        {
            var searchLower = search.ToLowerInvariant();
            query = query.Where(x => 
                (x.Email != null && x.Email.ToLower().Contains(searchLower)) ||
                x.FullName.ToLower().Contains(searchLower));
        }

        // Get total count before pagination
        var totalCount = await query.CountAsync(ct);

        // Apply pagination and ordering
        var users = await query
            .OrderBy(x => x.FullName)
            .ThenBy(x => x.Email)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        var userInfos = new List<UserInfo>();
        foreach (var user in users)
        {
            var roles = await _userManager.GetRolesAsync(user);
            var role = roles.FirstOrDefault() ?? "Viewer";
            userInfos.Add(new UserInfo
            {
                Id = user.Id,
                Email = user.Email ?? string.Empty,
                FullName = user.FullName,
                Role = role,
                Department = user.Department,
                Phone = user.Phone
            });
        }

        return (userInfos, totalCount);
    }

    public async Task<UserInfo> CreateAsync(string email, string password, string fullName, string role, EventType? department, CancellationToken ct = default)
    {
        // Check if user already exists
        var existingUser = await _userManager.FindByEmailAsync(email);
        if (existingUser != null)
            throw new InvalidOperationException($"User with email {email} already exists.");

        // Verify role exists
        if (!await _roleManager.RoleExistsAsync(role))
            throw new InvalidOperationException($"Role {role} does not exist.");

        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            UserName = email,
            Email = email,
            FullName = fullName,
            EmailConfirmed = true,
            Department = department
        };

        var result = await _userManager.CreateAsync(user, password);
        if (!result.Succeeded)
        {
            var errors = string.Join(", ", result.Errors.Select(e => e.Description));
            throw new InvalidOperationException($"Failed to create user: {errors}");
        }

        // Add user to role
        await _userManager.AddToRoleAsync(user, role);

        return new UserInfo
        {
            Id = user.Id,
            Email = user.Email ?? string.Empty,
            FullName = user.FullName,
            Role = role,
            Department = user.Department,
            Phone = user.Phone
        };
    }

    public async Task<UserInfo?> UpdateAsync(Guid id, string? email, string? fullName, string? role, EventType? department, string? phone, CancellationToken ct = default)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user == null)
            return null;

        // Update email if provided
        if (!string.IsNullOrWhiteSpace(email) && email != user.Email)
        {
            var existingUser = await _userManager.FindByEmailAsync(email);
            if (existingUser != null && existingUser.Id != user.Id)
                throw new InvalidOperationException($"User with email {email} already exists.");

            user.Email = email;
            user.UserName = email;
        }

        // Update full name if provided
        if (!string.IsNullOrWhiteSpace(fullName))
        {
            user.FullName = fullName;
        }

        // Update phone if provided (including null to clear)
        if (phone != null)
        {
            user.Phone = string.IsNullOrWhiteSpace(phone) ? null : phone;
        }

        // Update department only if explicitly provided (HasValue)
        // If department is null, keep the existing value (don't clear it)
        if (department.HasValue)
        {
            user.Department = department.Value;
        }
        // If department is null, we don't update it - preserve existing value

        var updateResult = await _userManager.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            var errors = string.Join(", ", updateResult.Errors.Select(e => e.Description));
            throw new InvalidOperationException($"Failed to update user: {errors}");
        }

        // Update role if provided
        if (!string.IsNullOrWhiteSpace(role))
        {
            // Verify role exists
            if (!await _roleManager.RoleExistsAsync(role))
                throw new InvalidOperationException($"Role {role} does not exist.");

            // Remove user from all roles
            var currentRoles = await _userManager.GetRolesAsync(user);
            if (currentRoles.Any())
            {
                await _userManager.RemoveFromRolesAsync(user, currentRoles);
            }

            // Add user to new role
            await _userManager.AddToRoleAsync(user, role);
        }

        // Get updated user info
        var roles = await _userManager.GetRolesAsync(user);
        var finalRole = roles.FirstOrDefault() ?? "Viewer";

        return new UserInfo
        {
            Id = user.Id,
            Email = user.Email ?? string.Empty,
            FullName = user.FullName,
            Role = finalRole,
            Department = user.Department,
            Phone = user.Phone
        };
    }
}
