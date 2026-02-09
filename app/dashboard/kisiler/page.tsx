"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/lib/user-context";
import { getAllUsers } from "@/lib/api/auth";
import type { User } from "@/lib/types";
import { Phone, Mail, User as UserIcon, Building2, Users } from "lucide-react";
import { toast } from "sonner";
import { toUserFriendlyMessage } from "@/lib/utils/api-error";

const departmentNames: Record<number, string> = {
  0: "Nikah",
  1: "Nişan",
  2: "Konser",
  3: "Toplantı",
  4: "Özel",
};

const departmentColors: Record<number, string> = {
  0: "bg-blue-100 text-blue-700 border-blue-200",
  1: "bg-pink-100 text-pink-700 border-pink-200",
  2: "bg-purple-100 text-purple-700 border-purple-200",
  3: "bg-green-100 text-green-700 border-green-200",
  4: "bg-orange-100 text-orange-700 border-orange-200",
};

export default function KisilerPage() {
  const { user: currentUser } = useUser();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const allUsers = await getAllUsers();
      // Editor, MerkezSorumlusu ve SuperAdmin'leri göster (Viewer'ları hariç tut)
      const filteredUsers = allUsers.filter(
        (u) => u.role === "Editor" || u.role === "SuperAdmin" || u.role === "MerkezSorumlusu"
      );
      setUsers(filteredUsers);
    } catch (error) {
      // AbortError'ı sessizce handle et (kullanıcıya gösterme)
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      toast.error(toUserFriendlyMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let focusTimeout: NodeJS.Timeout | null = null;
    
    const loadUsersSafe = async () => {
      if (!isMounted) return;
      await loadUsers();
    };
    
    loadUsersSafe();
    
    // Sayfa görünür olduğunda (focus) verileri yenile - debounce ile
    const handleFocus = () => {
      if (focusTimeout) {
        clearTimeout(focusTimeout);
      }
      focusTimeout = setTimeout(() => {
        if (isMounted) {
          loadUsersSafe();
        }
      }, 300); // 300ms debounce
    };
    
    window.addEventListener('focus', handleFocus);
    return () => {
      isMounted = false;
      if (focusTimeout) {
        clearTimeout(focusTimeout);
      }
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadUsers]);

  const filteredUsers = users.filter((user) => {
    const query = searchQuery.toLowerCase();
    return (
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      (user.phone && user.phone.includes(query)) ||
      (user.department !== undefined &&
        departmentNames[user.department]?.toLowerCase().includes(query))
    );
  });

  // Departmanlara göre grupla (MerkezSorumlusu ayrı grupta)
  const usersByDepartment = filteredUsers.reduce(
    (acc, user) => {
      if (user.role === "MerkezSorumlusu") {
        const deptName = "Merkez Sorumluları";
        if (!acc[deptName]) acc[deptName] = [];
        acc[deptName].push(user);
        return acc;
      }
      const dept = user.department !== undefined && user.department !== null 
        ? user.department 
        : -1;
      const deptName =
        dept === -1 || !departmentNames[dept]
          ? "Yönetim"
          : departmentNames[dept];
      if (!acc[deptName]) acc[deptName] = [];
      acc[deptName].push(user);
      return acc;
    },
    {} as Record<string, User[]>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      <div className="w-full">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Yönetim</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Nikah salonları ve etkinlikleri yöneten kişilerin iletişim bilgileri
        </p>
      </div>

      {/* Arama */}
      <div className="w-full">
        <Input
          placeholder="İsim, e-posta veya departman ile ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full"
        />
      </div>

      {/* Departmanlara göre gruplanmış kişiler */}
      {Object.keys(usersByDepartment).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {searchQuery ? "Arama sonucu bulunamadı" : "Kişi bulunamadı"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(usersByDepartment)
            .sort(([a], [b]) => {
              if (a === "Yönetim") return -1;
              if (b === "Yönetim") return 1;
              if (a === "Merkez Sorumluları") return -1;
              if (b === "Merkez Sorumluları") return 1;
              return a.localeCompare(b);
            })
            .map(([departmentName, departmentUsers]) => (
              <Card key={departmentName} className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Building2 className="h-5 w-5 text-primary" />
                    {departmentName}
                    <Badge variant="secondary" className="ml-auto">
                      {departmentUsers.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {departmentUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <UserIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="mb-2">
                            <p className="font-medium text-foreground truncate mb-1">
                              {user.name}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {user.role === "SuperAdmin" ? (
                                <Badge variant="default" className="text-[10px]">
                                  Yönetici
                                </Badge>
                              ) : user.role === "MerkezSorumlusu" ? (
                                <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200">
                                  Merkez Sorumlusu
                                </Badge>
                              ) : user.department !== undefined && user.department !== null && departmentNames[user.department] ? (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${departmentColors[user.department]}`}
                                >
                                  {departmentNames[user.department]} Sorumlusu
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  Editor
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3 shrink-0" />
                              <a
                                href={`mailto:${user.email}`}
                                className="truncate hover:text-primary transition-colors"
                                title={user.email}
                              >
                                {user.email}
                              </a>
                            </div>
                            {user.phone ? (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Phone className="h-3 w-3 shrink-0" />
                                <a
                                  href={`tel:${user.phone.replace(/\s/g, "")}`}
                                  className="hover:text-primary transition-colors"
                                >
                                  {user.phone}
                                </a>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground/50">
                                <Phone className="h-3 w-3 shrink-0" />
                                <span>Telefon yok</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
