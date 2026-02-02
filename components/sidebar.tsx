"use client";

import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/user-context";
import { isSuperAdmin, isEditor as isEditorRole, canManageHalls } from "@/lib/utils/role";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Calendar,
  Home,
  LogOut,
  Settings,
  User,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  FileText,
  Shield,
  Plus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Navigation items with role-based visibility.
 * Editor-only items are automatically hidden for Viewer via role filtering.
 * Align with lib/dashboard-routes EDITOR_ONLY_PATHS.
 */
const navItems = [
  // { href: "/dashboard", label: "Ana Sayfa", icon: Home, roles: ["SuperAdmin", "Editor", "Viewer"] as const },
  // { href: "/dashboard/takvim", label: "Takvim", icon: Calendar, roles: ["SuperAdmin", "Editor", "Viewer"] as const },
  { href: "/dashboard/salonlar", label: "Salonlar", icon: Building2, roles: ["SuperAdmin", "Editor", "Viewer"] as const },
  // { href: "/dashboard/talep-et", label: "Talep Et", icon: Plus, roles: ["Viewer"] as const },
  // { href: "/dashboard/mesajlar", label: "Mesajlar", icon: MessageSquare, roles: ["SuperAdmin", "Editor", "Viewer"] as const },
  // { href: "/dashboard/talepler", label: "Talepler", icon: FileText, roles: ["SuperAdmin", "Editor", "Viewer"] as const },
  // { href: "/dashboard/kisiler", label: "Yönetim", icon: Users, roles: ["SuperAdmin", "Editor", "Viewer"] as const },
  { href: "/dashboard/ayarlar", label: "Ayarlar", icon: Settings, roles: ["SuperAdmin", "Editor", "Viewer"] as const },
];

interface SidebarProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isMobile?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export function Sidebar({ open, onOpenChange, isMobile = false, onCollapsedChange }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const { user, isEditor, logout } = useUser();

  const handleCollapseToggle = () => {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    if (onCollapsedChange) {
      onCollapsedChange(newCollapsed);
    }
  };

  const filteredNavItems = user
    ? navItems.filter((item) => item.roles.includes(user.role))
    : [];

  const handleNavClick = (href: string) => {
    router.push(href);
    if (isMobile && onOpenChange) {
      onOpenChange(false);
    }
  };

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center justify-between border-b border-border px-4">
        <div
          className="flex cursor-pointer items-center gap-3"
          onClick={() => handleNavClick("/dashboard/salonlar")}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          {(!collapsed || isMobile) && (
            <span className="text-sm font-semibold text-foreground">
              Nikah Salonları
            </span>
          )}
        </div>
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleCollapseToggle}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {filteredNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Button
              key={item.href}
              variant={isActive ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start gap-3",
                isActive && "bg-secondary text-primary font-medium",
                collapsed && !isMobile && "justify-center px-2"
              )}
              onClick={() => handleNavClick(item.href)}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {(!collapsed || isMobile) && <span>{item.label}</span>}
            </Button>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div
          className={cn(
            "mb-2 flex items-center gap-3 rounded-lg bg-muted p-3",
            collapsed && !isMobile && "justify-center p-2"
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            {isSuperAdmin(user?.role) ? (
              <Shield className="h-4 w-4 text-primary" />
            ) : isEditorRole(user?.role) ? (
              <Shield className="h-4 w-4 text-primary" />
            ) : (
              <User className="h-4 w-4 text-primary" />
            )}
          </div>
          {(!collapsed || isMobile) && user && (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-foreground">
                  {user.name === "Super Admin" ? "Yönetici" : user.name}
                </p>
                <Badge
                  variant={isSuperAdmin(user.role) ? "default" : isEditorRole(user.role) ? "default" : "outline"}
                  className="text-[10px]"
                >
                  {isSuperAdmin(user.role) ? "Yönetici" : isEditorRole(user.role) ? "Editör" : "Viewer"}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-3 text-muted-foreground hover:text-destructive",
            collapsed && !isMobile && "justify-center px-2"
          )}
          onClick={() => {
            logout();
            if (isMobile && onOpenChange) {
              onOpenChange(false);
            }
          }}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {(!collapsed || isMobile) && <span>Çıkış Yap</span>}
        </Button>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-64 p-0 sm:max-w-sm">
          <SheetHeader className="sr-only">
            <SheetTitle>Menü</SheetTitle>
          </SheetHeader>
          <div className="flex h-full flex-col">
            {sidebarContent}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 hidden h-screen flex-col border-r border-border bg-card transition-all duration-300",
        // Sadece lg (1024px) ve üzeri ekranlarda göster
        "lg:flex",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {sidebarContent}
    </aside>
  );
}
