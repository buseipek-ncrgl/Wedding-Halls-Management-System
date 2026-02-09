"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/user-context";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { getMessagesByRequestId } from "@/lib/api/messages";
import { getRequests } from "@/lib/api/requests";
import type { MessageDto } from "@/lib/api/messages";
import type { Request } from "@/lib/types";
import { sanitizeText } from "@/lib/utils/sanitize";
import { canEdit, isViewer as isViewerRole, isMerkezSorumlusu } from "@/lib/utils/role";

type Notification = {
  id: string;
  type: "request_approved" | "request_rejected" | "request" | "announcement" | "message";
  title: string;
  message: string;
  date: Date;
  read: boolean;
  link?: string;
};

function formatNotificationDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Az önce";
  if (diffMins < 60) return `${diffMins} dakika önce`;
  if (diffHours < 24) return `${diffHours} saat önce`;
  if (diffDays < 7) return `${diffDays} gün önce`;
  
  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getStorageKey(userId: string): string {
  return `notification-read-ids-${userId}`;
}

function getReadNotificationIds(userId: string): Set<string> {
  if (typeof window === "undefined" || !userId) return new Set();
  try {
    const stored = localStorage.getItem(getStorageKey(userId));
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function markNotificationAsRead(id: string, userId: string) {
  if (typeof window === "undefined" || !userId) return;
  try {
    const readIds = getReadNotificationIds(userId);
    readIds.add(id);
    localStorage.setItem(getStorageKey(userId), JSON.stringify(Array.from(readIds)));
  } catch {
    // Ignore storage errors
  }
}

function markAllNotificationsAsRead(ids: string[], userId: string) {
  if (typeof window === "undefined" || !userId) return;
  try {
    const readIds = getReadNotificationIds(userId);
    ids.forEach((id) => readIds.add(id));
    localStorage.setItem(getStorageKey(userId), JSON.stringify(Array.from(readIds)));
  } catch {
    // Ignore storage errors
  }
}

export function NotificationBell() {
  const router = useRouter();
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    const loadNotifications = async () => {
      if (!user?.id) return;
      try {
        setLoading(true);
        const readIds = getReadNotificationIds(user.id);
        const allNotifications: Notification[] = [];

        // Taleplerden bildirimleri al
        try {
          const requests = await getRequests();
          const isEditor = canEdit(user.role);
          const isViewer = isViewerRole(user.role);
          
          if (isEditor) {
            // Editor için: Sadece kendi departmanına ait yeni bekleyen talepler (kendi talebi olmayan)
            // Son 24 saat içinde oluşturulmuş bekleyen talepler
            const newPendingRequests = requests.filter((req) => {
              const reqDate = new Date(req.createdAt);
              const hoursDiff = (Date.now() - reqDate.getTime()) / (1000 * 60 * 60);
              
              // Kendi talebi değil ve bekleyen durumda
              if (req.status !== "Pending" || hoursDiff > 24 || req.createdByUserId === user.id) {
                return false;
              }
              
              // Editor'ın departmanı varsa, sadece o departmana ait talepleri göster
              // eventType: 0=Nikah, 1=Nişan, 2=Konser, 3=Toplantı, 4=Özel
              if (user.department !== undefined && user.department !== null) {
                return req.eventType === user.department;
              }
              
              // Departman bilgisi yoksa tüm talepleri göster (geriye dönük uyumluluk)
              return true;
            });
            
            // En yeni taleplerden bildirim oluştur
            const sortedNewRequests = newPendingRequests
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .slice(0, 10); // En fazla 10 yeni talep bildirimi
            
            for (const req of sortedNewRequests) {
              const notificationId = `new-request-${req.id}`;
              allNotifications.push({
                id: notificationId,
                type: "request",
                title: "Yeni Talep",
                message: `${req.hallName || "Bir salon"} için yeni talep oluşturuldu`,
                date: new Date(req.createdAt),
                read: readIds.has(notificationId),
                link: `/dashboard/talepler`,
              });
            }
          } else if (isMerkezSorumlusu(user.role)) {
            // Merkez Sorumlusu: API zaten kendi merkezlerinin taleplerini döndürüyor; yeni bekleyen talepleri göster
            const newPendingRequests = requests
              .filter((req) => {
                const reqDate = new Date(req.createdAt);
                const hoursDiff = (Date.now() - reqDate.getTime()) / (1000 * 60 * 60);
                return req.status === "Pending" && hoursDiff <= 24;
              })
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .slice(0, 10);
            for (const req of newPendingRequests) {
              const notificationId = `new-request-${req.id}`;
              allNotifications.push({
                id: notificationId,
                type: "request",
                title: "Yeni Talep",
                message: `${req.hallName || "Bir salon"} için yeni talep oluşturuldu`,
                date: new Date(req.createdAt),
                read: readIds.has(notificationId),
                link: `/dashboard/talepler`,
              });
            }
          } else if (isViewer && user.id) {
            // Viewer için: Kendi taleplerinin onaylandığı/reddedildiği bildirimleri
            const myRequests = requests.filter((req) => req.createdByUserId === user.id);
            
            for (const req of myRequests) {
              // Son 7 gün içinde onaylanan veya reddedilen talepler
              const reqDate = new Date(req.createdAt);
              const daysDiff = (Date.now() - reqDate.getTime()) / (1000 * 60 * 60 * 24);
              
              // Direkt request status'una bak (mesaj içeriğine bakmadan)
              if (daysDiff <= 7 && req.status !== "Pending") {
                const isApproved = req.status === "Answered";
                const isRejected = req.status === "Rejected";
                
                if (isApproved || isRejected) {
                  const notificationId = `req-${req.id}-status`;
                  allNotifications.push({
                    id: notificationId,
                    type: isApproved ? "request_approved" : "request_rejected",
                    title: isApproved ? "Talep Onaylandı" : "Talep Reddedildi",
                    message: `${req.hallName || "Salon"} için talebiniz ${isApproved ? "onaylandı" : "reddedildi"}`,
                    date: new Date(req.createdAt), // Talep oluşturulma tarihi yerine güncelleme tarihi kullanılabilir
                    read: readIds.has(notificationId),
                    link: `/dashboard/talepler`,
                  });
                }
              }
            }
          }
        } catch (e) {
          console.error("Error loading requests:", e);
        }

        // Mesajlar sayfasındaki duyuruları kontrol et (localStorage'dan)
        try {
          if (typeof window !== "undefined") {
            const stored = localStorage.getItem("mesajlar-messages");
            if (stored) {
              const messages = JSON.parse(stored) as Array<{
                channel: string;
                content: string;
                timestamp: string;
                id: string;
              }>;
              
              const announcements = messages
                .filter((m) => m.channel === "duyurular")
                .filter((m) => {
                  const msgDate = new Date(m.timestamp);
                  const daysDiff = (Date.now() - msgDate.getTime()) / (1000 * 60 * 60 * 24);
                  return daysDiff <= 7;
                })
                .map((m) => {
                  const notificationId = `announcement-${m.id}`;
                  return {
                    id: notificationId,
                    type: "announcement" as const,
                    title: "Yeni Duyuru",
                    message: sanitizeText(m.content),
                    date: new Date(m.timestamp),
                    read: readIds.has(notificationId),
                    link: `/dashboard/mesajlar?channel=duyurular`,
                  };
                });
              
              allNotifications.push(...announcements);
            }
          }
        } catch (e) {
          console.error("Error loading announcements:", e);
        }

        // Tarihe göre sırala (en yeni önce)
        allNotifications.sort((a, b) => b.date.getTime() - a.date.getTime());
        
        // Okunmamış bildirimleri filtrele (okundu olanları gösterme)
        const unreadNotifications = allNotifications.filter((n) => !n.read);
        
        // Son 20 okunmamış bildirimi al
        setNotifications(unreadNotifications.slice(0, 20));
      } catch (e) {
        console.error("Error loading notifications:", e);
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
    
    // Her 30 saniyede bir yenile
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllAsRead = () => {
    if (!user?.id) return;
    const allIds = notifications.map((n) => n.id);
    markAllNotificationsAsRead(allIds, user.id);
    // Okundu bildirimleri listeden kaldır
    setNotifications([]);
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!user?.id) return;
    markNotificationAsRead(notification.id, user.id);
    // Okundu bildirimi listeden kaldır
    setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    
    if (notification.link) {
      router.push(notification.link);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -right-1 -top-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
              variant="destructive"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <h3 className="font-semibold text-foreground">Bildirimler</h3>
              {unreadCount > 0 && (
                <p className="text-xs text-muted-foreground">
                  {unreadCount} yeni bildirim
                </p>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-destructive hover:text-destructive"
                onClick={handleMarkAllAsRead}
              >
                Tümünü Okundu İşaretle
              </Button>
            )}
          </div>

          {/* Notifications List */}
          <ScrollArea className="max-h-[400px]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Bell className="h-12 w-12 text-muted-foreground/30" />
                <p className="mt-4 text-sm text-muted-foreground">
                  Henüz bildirim yok
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => handleNotificationClick(notification)}
                    className={`w-full p-4 text-left transition-colors hover:bg-muted/50 ${
                      !notification.read ? "bg-muted/30" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                          notification.read
                            ? "bg-muted-foreground/30"
                            : "bg-destructive"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-medium ${
                            !notification.read
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {notification.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {notification.message}
                        </p>
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          {formatNotificationDate(notification.date)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-border p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-destructive hover:text-destructive"
                onClick={() => {
                  router.push("/dashboard/talepler");
                  setOpen(false);
                }}
              >
                Tüm Bildirimleri Gör
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
