using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using NikahSalon.Domain.Entities;
using NikahSalon.Domain.Enums;
using NikahSalon.Infrastructure.Identity;

namespace NikahSalon.Infrastructure.Data;

public static class SeedData
{
    public const string RoleViewer = "Viewer";
    public const string RoleEditor = "Editor";
    public const string RoleSuperAdmin = "SuperAdmin";
    public const string RoleMerkezSorumlusu = "MerkezSorumlusu";

    public static async Task SeedAsync(AppDbContext db, UserManager<ApplicationUser> userManager, RoleManager<IdentityRole<Guid>> roleManager)
    {
        // Rolleri oluştur
        if (!await roleManager.RoleExistsAsync(RoleViewer))
        {
            await roleManager.CreateAsync(new IdentityRole<Guid>(RoleViewer));
        }
        if (!await roleManager.RoleExistsAsync(RoleEditor))
        {
            await roleManager.CreateAsync(new IdentityRole<Guid>(RoleEditor));
        }
        if (!await roleManager.RoleExistsAsync(RoleSuperAdmin))
        {
            await roleManager.CreateAsync(new IdentityRole<Guid>(RoleSuperAdmin));
        }
        if (!await roleManager.RoleExistsAsync(RoleMerkezSorumlusu))
        {
            await roleManager.CreateAsync(new IdentityRole<Guid>(RoleMerkezSorumlusu));
        }

        // Viewer kullanıcısını oluştur
        var viewerEmail = "viewer@nikahsalon.local";
        if (await userManager.FindByEmailAsync(viewerEmail) == null)
        {
            var viewer = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                UserName = viewerEmail,
                Email = viewerEmail,
                FullName = "Demo Viewer",
                EmailConfirmed = true
            };
            var result = await userManager.CreateAsync(viewer, "Viewer1!");
            if (result.Succeeded)
            {
                // SecurityStamp'i güncelle
                await userManager.UpdateSecurityStampAsync(viewer);
                await db.SaveChangesAsync();
                // Kullanıcıyı ID ile tekrar yükle
                var savedViewer = await userManager.FindByIdAsync(viewer.Id.ToString());
                if (savedViewer != null)
                {
                    await userManager.AddToRoleAsync(savedViewer, RoleViewer);
                }
            }
        }

        // Editor kullanıcısını oluştur veya güncelle (Nikah alanı)
        var editorEmail = "editor@nikahsalon.local";
        var existingEditor = await userManager.FindByEmailAsync(editorEmail);
        if (existingEditor == null)
        {
            var editor = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                UserName = editorEmail,
                Email = editorEmail,
                FullName = "Demo Editor",
                EmailConfirmed = true,
                Department = EventType.Nikah // Nikah alanı
            };
            var result = await userManager.CreateAsync(editor, "Editor1!");
            if (result.Succeeded)
            {
                // SecurityStamp'i güncelle
                await userManager.UpdateSecurityStampAsync(editor);
                await db.SaveChangesAsync();
                // Kullanıcıyı ID ile tekrar yükle
                var savedEditor = await userManager.FindByIdAsync(editor.Id.ToString());
                if (savedEditor != null)
                {
                    await userManager.AddToRoleAsync(savedEditor, RoleEditor);
                }
            }
        }
        else
        {
            // Mevcut Editor kullanıcısının Department'ını güncelle (eğer null ise)
            if (existingEditor.Department == null)
            {
                existingEditor.Department = EventType.Nikah;
                await userManager.UpdateAsync(existingEditor);
                await db.SaveChangesAsync();
            }
        }

        // Enes Editor kullanıcısını oluştur veya güncelle (Nişan alanı)
        var enesEmail = "enes@gmail.com";
        var existingEnes = await userManager.FindByEmailAsync(enesEmail);
        if (existingEnes == null)
        {
            var enesEditor = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                UserName = enesEmail,
                Email = enesEmail,
                FullName = "Enes Editor",
                EmailConfirmed = true,
                Department = EventType.Nisan // Nişan alanı
            };
            var result = await userManager.CreateAsync(enesEditor, "enes123");
            if (result.Succeeded)
            {
                // Veritabanı değişikliklerini kaydet
                await db.SaveChangesAsync();
                // Kullanıcıyı email ile tekrar yükle (SecurityStamp için)
                await Task.Delay(100); // Kısa bir gecikme
                var savedEnes = await userManager.FindByEmailAsync(enesEmail);
                if (savedEnes != null && savedEnes.SecurityStamp != null)
                {
                    await userManager.AddToRoleAsync(savedEnes, RoleEditor);
                }
            }
        }
        else
        {
            // Mevcut Editor kullanıcısının Department'ını güncelle (eğer null ise)
            if (existingEnes.Department == null)
            {
                existingEnes.Department = EventType.Nisan;
                await userManager.UpdateAsync(existingEnes);
                await db.SaveChangesAsync();
            }
        }

        // Konser Editor kullanıcısını oluştur veya güncelle
        var konserEmail = "konser@nikahsalon.local";
        var existingKonser = await userManager.FindByEmailAsync(konserEmail);
        if (existingKonser == null)
        {
            var konserEditor = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                UserName = konserEmail,
                Email = konserEmail,
                FullName = "Konser Editor",
                EmailConfirmed = true,
                Department = EventType.Konser // Konser alanı
            };
            var result = await userManager.CreateAsync(konserEditor, "Konser1!");
            if (result.Succeeded)
            {
                await userManager.UpdateSecurityStampAsync(konserEditor);
                await db.SaveChangesAsync();
                var savedKonser = await userManager.FindByIdAsync(konserEditor.Id.ToString());
                if (savedKonser != null)
                {
                    await userManager.AddToRoleAsync(savedKonser, RoleEditor);
                }
            }
        }
        else
        {
            // Mevcut Editor kullanıcısının Department'ını güncelle (eğer null ise)
            if (existingKonser.Department == null)
            {
                existingKonser.Department = EventType.Konser;
                await userManager.UpdateAsync(existingKonser);
                await db.SaveChangesAsync();
            }
        }

        // Toplantı Editor kullanıcısını oluştur veya güncelle
        var toplantiEmail = "toplanti@nikahsalon.local";
        var existingToplanti = await userManager.FindByEmailAsync(toplantiEmail);
        if (existingToplanti == null)
        {
            var toplantiEditor = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                UserName = toplantiEmail,
                Email = toplantiEmail,
                FullName = "Toplantı Editor",
                EmailConfirmed = true,
                Department = EventType.Toplanti // Toplantı alanı
            };
            var result = await userManager.CreateAsync(toplantiEditor, "Toplanti1!");
            if (result.Succeeded)
            {
                await userManager.UpdateSecurityStampAsync(toplantiEditor);
                await db.SaveChangesAsync();
                var savedToplanti = await userManager.FindByIdAsync(toplantiEditor.Id.ToString());
                if (savedToplanti != null)
                {
                    await userManager.AddToRoleAsync(savedToplanti, RoleEditor);
                }
            }
        }
        else
        {
            // Mevcut Editor kullanıcısının Department'ını güncelle (eğer null ise)
            if (existingToplanti.Department == null)
            {
                existingToplanti.Department = EventType.Toplanti;
                await userManager.UpdateAsync(existingToplanti);
                await db.SaveChangesAsync();
            }
        }

        // Özel Etkinlik Editor kullanıcısını oluştur veya güncelle
        var ozelEmail = "ozel@nikahsalon.local";
        var existingOzel = await userManager.FindByEmailAsync(ozelEmail);
        if (existingOzel == null)
        {
            var ozelEditor = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                UserName = ozelEmail,
                Email = ozelEmail,
                FullName = "Özel Etkinlik Editor",
                EmailConfirmed = true,
                Department = EventType.Ozel // Özel alanı
            };
            var result = await userManager.CreateAsync(ozelEditor, "Ozel1!");
            if (result.Succeeded)
            {
                await userManager.UpdateSecurityStampAsync(ozelEditor);
                await db.SaveChangesAsync();
                var savedOzel = await userManager.FindByIdAsync(ozelEditor.Id.ToString());
                if (savedOzel != null)
                {
                    await userManager.AddToRoleAsync(savedOzel, RoleEditor);
                }
            }
        }
        else
        {
            // Mevcut Editor kullanıcısının Department'ını güncelle (eğer null ise)
            if (existingOzel.Department == null)
            {
                existingOzel.Department = EventType.Ozel;
                await userManager.UpdateAsync(existingOzel);
                await db.SaveChangesAsync();
            }
        }

        // Merkez Sorumlusu - Nikah (sadece görüntüleme, Nikah merkezlerine atanır)
        var merkezNikahEmail = "merkezsorumlusu.nikah@nikahsalon.local";
        if (await userManager.FindByEmailAsync(merkezNikahEmail) == null)
        {
            var merkezNikah = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                UserName = merkezNikahEmail,
                Email = merkezNikahEmail,
                FullName = "Merkez Sorumlusu (Nikah)",
                EmailConfirmed = true
            };
            var result = await userManager.CreateAsync(merkezNikah, "MerkezNikah1!");
            if (result.Succeeded)
            {
                await userManager.UpdateSecurityStampAsync(merkezNikah);
                await db.SaveChangesAsync();
                var saved = await userManager.FindByIdAsync(merkezNikah.Id.ToString());
                if (saved != null)
                    await userManager.AddToRoleAsync(saved, RoleMerkezSorumlusu);
            }
        }

        // Merkez Sorumlusu - Toplantı (sadece görüntüleme, Toplantı merkezlerine atanır)
        var merkezToplantiEmail = "merkezsorumlusu.toplanti@nikahsalon.local";
        if (await userManager.FindByEmailAsync(merkezToplantiEmail) == null)
        {
            var merkezToplanti = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                UserName = merkezToplantiEmail,
                Email = merkezToplantiEmail,
                FullName = "Merkez Sorumlusu (Toplantı)",
                EmailConfirmed = true
            };
            var result = await userManager.CreateAsync(merkezToplanti, "MerkezToplanti1!");
            if (result.Succeeded)
            {
                await userManager.UpdateSecurityStampAsync(merkezToplanti);
                await db.SaveChangesAsync();
                var saved = await userManager.FindByIdAsync(merkezToplanti.Id.ToString());
                if (saved != null)
                    await userManager.AddToRoleAsync(saved, RoleMerkezSorumlusu);
            }
        }

        // SuperAdmin kullanıcısını oluştur
        var superAdminEmail = "admin@nikahsalon.local";
        if (await userManager.FindByEmailAsync(superAdminEmail) == null)
        {
            var superAdmin = new ApplicationUser
            {
                Id = Guid.NewGuid(),
                UserName = superAdminEmail,
                Email = superAdminEmail,
                FullName = "Yönetici",
                EmailConfirmed = true
            };
            var result = await userManager.CreateAsync(superAdmin, "Admin1!");
            if (result.Succeeded)
            {
                // SecurityStamp'i güncelle
                await userManager.UpdateSecurityStampAsync(superAdmin);
                await db.SaveChangesAsync();
                // Kullanıcıyı ID ile tekrar yükle
                var savedSuperAdmin = await userManager.FindByIdAsync(superAdmin.Id.ToString());
                if (savedSuperAdmin != null)
                {
                    await userManager.AddToRoleAsync(savedSuperAdmin, RoleSuperAdmin);
                }
            }
        }

        if (await db.WeddingHalls.AnyAsync()) return;

        var hall1 = new WeddingHall
        {
            Id = Guid.NewGuid(),
            Name = "Atatürk Nikah Salonu",
            Address = "Cumhuriyet Mah. Atatürk Cad. No:12",
            Capacity = 150,
            Description = "Modern nikah salonu.",
            ImageUrl = "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&q=80"
        };
        db.WeddingHalls.Add(hall1);

        var hall2 = new WeddingHall
        {
            Id = Guid.NewGuid(),
            Name = "Cumhuriyet Nikah Salonu",
            Address = "Yeni Mah. İstiklal Sok. No:45",
            Capacity = 100,
            Description = "Şık ve samimi atmosfer.",
            ImageUrl = "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800&q=80"
        };
        db.WeddingHalls.Add(hall2);
        await db.SaveChangesAsync();

        var s1 = new Schedule
        {
            Id = Guid.NewGuid(),
            WeddingHallId = hall1.Id,
            Date = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            StartTime = new TimeOnly(9, 0),
            EndTime = new TimeOnly(10, 0),
            Status = ScheduleStatus.Available
        };
        var s2 = new Schedule
        {
            Id = Guid.NewGuid(),
            WeddingHallId = hall1.Id,
            Date = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(1)),
            StartTime = new TimeOnly(10, 30),
            EndTime = new TimeOnly(11, 30),
            Status = ScheduleStatus.Reserved
        };
        db.Schedules.AddRange(s1, s2);
        await db.SaveChangesAsync();
    }
}
