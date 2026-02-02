"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MapPin, Building2, Users, Edit, Trash2, Plus, ArrowLeft, Clock, CalendarCheck, Percent } from "lucide-react";
import type { Center } from "@/lib/api/centers";
import type { WeddingHall } from "@/lib/types";
import { getCenterById } from "@/lib/api/centers";
import { getHalls } from "@/lib/api/halls";
import { getSchedulesByHall } from "@/lib/api/schedules";
import { deleteCenter } from "@/lib/api/centers";
import { deleteHall } from "@/lib/api/halls";
import { getAllUsers } from "@/lib/api/auth";
import { toUserFriendlyMessage } from "@/lib/utils/api-error";
import { formatDescription } from "@/lib/utils/format-description";
import type { User } from "@/lib/types";
import { toast } from "sonner";
import { HallCard } from "@/components/hall-card";
import { HallFormModal } from "@/components/hall-form-modal";
import { CenterFormModal } from "@/components/center-form-modal";
import { useUser } from "@/lib/user-context";
import { isSuperAdmin, canAccessCenter } from "@/lib/utils/role";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notFound } from "next/navigation";

export default function CenterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const centerId = params.id as string;
  
  const [center, setCenter] = useState<Center | null>(null);
  const [halls, setHalls] = useState<WeddingHall[]>([]);
  const [scheduleStats, setScheduleStats] = useState<{
    totalSlots: number;
    availableSlots: number;
    reservedSlots: number;
    occupancyPercent: number;
  }>({ totalSlots: 0, availableSlots: 0, reservedSlots: 0, occupancyPercent: 0 });
  const [loading, setLoading] = useState(true);
  const [centerToDelete, setCenterToDelete] = useState<Center | null>(null);
  const [hallToDelete, setHallToDelete] = useState<WeddingHall | null>(null);
  const [deletingCenter, setDeletingCenter] = useState(false);
  const [deletingHall, setDeletingHall] = useState(false);
  const [centerFormModalOpen, setCenterFormModalOpen] = useState(false);
  const [hallFormModalOpen, setHallFormModalOpen] = useState(false);
  const [editHall, setEditHall] = useState<WeddingHall | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    if (centerId) {
      loadData();
    }
  }, [centerId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [centerData, allHalls, allUsers] = await Promise.all([
        getCenterById(centerId),
        getHalls(),
        getAllUsers().catch(() => []),
      ]);
      setUsers(allUsers);

      if (!centerData) {
        notFound();
        return;
      }

      setCenter(centerData);
      const centerHalls = allHalls.filter((h) => h.centerId === centerId);
      setHalls(centerHalls);

      // Müsaitlik özeti: önümüzdeki 7 gün × günlük 6 saat slot (09:00, 10:30, 12:00, 14:00, 15:30, 17:00) × merkezdeki salon sayısı
      const SLOTS_PER_DAY = ["09:00", "10:30", "12:00", "14:00", "15:30", "17:00"];
      const DAYS_AHEAD = 7;
      const toDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };
      // API'den gelen saati HH:mm formatına çevir (09:00:00 veya 9:00 → 09:00)
      const normalizeSlot = (t: string) => {
        const part = (t || "").trim().slice(0, 8);
        const [h, m] = part.split(/[:\s]/).map((x) => parseInt(x, 10) || 0);
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      };
      let totalSlots = 0;
      let availableSlots = 0;
      let reservedSlots = 0;
      if (centerHalls.length > 0) {
        const allSchedulesByHall = await Promise.all(
          centerHalls.map((h) => getSchedulesByHall(h.id).catch(() => []))
        );
        const scheduleMap = new Map<string, { status: string }>();
        centerHalls.forEach((hall, i) => {
          const list = allSchedulesByHall[i] ?? [];
          for (const s of list) {
            const dateNorm = s.date.includes("T") ? s.date.split("T")[0] : s.date;
            const startNorm = normalizeSlot(s.startTime);
            scheduleMap.set(`${hall.id}|${dateNorm}|${startNorm}`, { status: s.status });
          }
        });
        for (let d = 0; d < DAYS_AHEAD; d++) {
          const date = new Date();
          date.setDate(date.getDate() + d);
          const dateStr = toDateStr(date);
          for (const hall of centerHalls) {
            for (const slot of SLOTS_PER_DAY) {
              totalSlots++;
              const entry = scheduleMap.get(`${hall.id}|${dateStr}|${slot}`);
              if (entry?.status === "Reserved") reservedSlots++;
              else availableSlots++;
            }
          }
        }
      }
      const occupancyPercent = totalSlots > 0 ? Math.round((reservedSlots / totalSlots) * 100) : 0;
      setScheduleStats({ totalSlots, availableSlots, reservedSlots, occupancyPercent });
    } catch (e) {
      toast.error(toUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCenter = async () => {
    if (!centerToDelete) return;
    setDeletingCenter(true);
    try {
      await deleteCenter(centerToDelete.id);
      toast.success("Merkez silindi.");
      setCenterToDelete(null);
      router.push("/dashboard/salonlar");
    } catch (e) {
      toast.error(toUserFriendlyMessage(e));
    } finally {
      setDeletingCenter(false);
    }
  };

  const handleDeleteHall = async () => {
    if (!hallToDelete) return;
    setDeletingHall(true);
    try {
      await deleteHall(hallToDelete.id);
      toast.success("Salon silindi.");
      setHallToDelete(null);
      await loadData();
    } catch (e) {
      toast.error(toUserFriendlyMessage(e));
    } finally {
      setDeletingHall(false);
    }
  };

  const handleCenterUpdated = async (_center: Center) => {
    await loadData();
    setCenterFormModalOpen(false);
  };

  const handleHallCreated = async (_hall: WeddingHall) => {
    await loadData();
    setHallFormModalOpen(false);
  };

  const handleHallUpdated = async (_hall: WeddingHall) => {
    await loadData();
    setEditHall(null);
    setHallFormModalOpen(false);
  };

  const totalCapacity = halls.reduce((sum, h) => sum + h.capacity, 0);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!center) {
    return null;
  }

  return (
    <>
      <div className="space-y-4 sm:space-y-6 w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 shrink-0"
              onClick={() => router.push("/dashboard/salonlar")}
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground flex items-center gap-1.5 sm:gap-2">
                <Building2 className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-primary shrink-0" />
                <span className="truncate">{center.name}</span>
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">Merkez detayları ve salonları</p>
            </div>
          </div>
          {isSuperAdmin(user?.role) && (
            <div className="flex gap-2 shrink-0">
              <Button
                variant="outline"
                className="h-8 sm:h-9 md:h-10 text-xs sm:text-sm px-3 sm:px-4"
                onClick={() => setCenterFormModalOpen(true)}
              >
                <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                Düzenle
              </Button>
              <Button
                variant="outline"
                className="h-8 sm:h-9 md:h-10 text-xs sm:text-sm px-3 sm:px-4"
                onClick={() => setCenterToDelete(center)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                Sil
              </Button>
            </div>
          )}
        </div>

        {/* Merkez görseli ve genel bilgiler */}
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
          <div className="relative aspect-video overflow-hidden rounded-lg border border-border">
            <Image
              src={center.imageUrl || "/placeholder.svg"}
              alt={center.name}
              fill
              className="object-cover"
            />
          </div>
          <div className="space-y-3 sm:space-y-4">
            <div>
              <Label className="text-xs sm:text-sm font-medium text-muted-foreground">Adres</Label>
              {center.address ? (
                <div className="flex items-start gap-2 mt-1">
                  <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs sm:text-sm text-foreground break-words">{center.address}</p>
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">Adres bilgisi yok</p>
              )}
            </div>
            {center.description && (
              <div>
                <Label className="text-xs sm:text-sm font-medium text-muted-foreground mb-1.5 sm:mb-2">Açıklama</Label>
                <div className="text-xs sm:text-sm">{formatDescription(center.description, users)}</div>
              </div>
            )}
          </div>
        </div>

        {/* Genel istatistikler */}
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 rounded-lg border border-border p-3 sm:p-4 bg-muted/30">
          <div className="text-center rounded-lg border border-border/50 bg-background/50 p-3 sm:p-4">
            <div className="text-xl sm:text-2xl font-bold text-foreground">{halls.length}</div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">Salon Sayısı</div>
          </div>
          <div className="text-center rounded-lg border border-border/50 bg-background/50 p-3 sm:p-4">
            <div className="text-xl sm:text-2xl font-bold text-foreground flex items-center justify-center gap-1">
              <Users className="h-4 w-4 sm:h-5 sm:w-5" />
              {totalCapacity}
            </div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">Toplam Kapasite</div>
          </div>
          <div className="text-center rounded-lg border border-border/50 bg-background/50 p-3 sm:p-4">
            <div className="text-xl sm:text-2xl font-bold text-foreground">
              {halls.length ? Math.round((totalCapacity / halls.length) * 10) / 10 : 0}
            </div>
            <div className="text-xs sm:text-sm text-muted-foreground mt-1">Ortalama Kapasite</div>
          </div>
        </div>

        {/* Müsaitlik / saat istatistikleri: önümüzdeki 7 gün, günlük 6 slot, merkezdeki tüm salonlar */}
        <div className="rounded-lg border border-border p-3 sm:p-4 bg-muted/30">
          <h3 className="text-xs sm:text-sm font-semibold text-foreground mb-1">Müsaitlik Özeti</h3>
          <p className="text-[10px] sm:text-xs text-muted-foreground mb-2 sm:mb-3">
            Önümüzdeki 7 gün, günlük 6 saat slotu (09:00, 10:30, 12:00, 14:00, 15:30, 17:00) ve merkezdeki tüm salonlar üzerinden hesaplanır.
          </p>
          <div className="grid gap-2 sm:gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-2 sm:gap-3 rounded-lg border border-border/50 bg-background/50 p-2 sm:p-3 md:p-4">
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 items-center justify-center rounded-full bg-primary/10 shrink-0">
                <Clock className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-lg md:text-xl font-bold text-foreground">{scheduleStats.totalSlots}</div>
                <div className="text-[10px] sm:text-xs text-muted-foreground">Toplam Saat / Slot</div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 rounded-lg border border-border/50 bg-background/50 p-2 sm:p-3 md:p-4">
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 items-center justify-center rounded-full bg-green-500/10 shrink-0">
                <CalendarCheck className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5 text-green-600" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-lg md:text-xl font-bold text-foreground text-green-600">
                  {scheduleStats.availableSlots}
                </div>
                <div className="text-[10px] sm:text-xs text-muted-foreground">Müsait Saat</div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 rounded-lg border border-border/50 bg-background/50 p-2 sm:p-3 md:p-4">
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 items-center justify-center rounded-full bg-amber-500/10 shrink-0">
                <CalendarCheck className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-lg md:text-xl font-bold text-foreground text-amber-600">
                  {scheduleStats.reservedSlots}
                </div>
                <div className="text-[10px] sm:text-xs text-muted-foreground">Dolu Saat</div>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 rounded-lg border border-border/50 bg-background/50 p-2 sm:p-3 md:p-4">
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 items-center justify-center rounded-full bg-blue-500/10 shrink-0">
                <Percent className="h-4 w-4 sm:h-4.5 sm:w-4.5 md:h-5 md:w-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <div className="text-base sm:text-lg md:text-xl font-bold text-foreground text-blue-600">
                  %{scheduleStats.occupancyPercent}
                </div>
                <div className="text-[10px] sm:text-xs text-muted-foreground">Doluluk Oranı</div>
              </div>
            </div>
          </div>
        </div>

        {/* Salonlar */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-foreground">Salonlar</h2>
                    {isSuperAdmin(user?.role) && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditHall(null);
                          setHallFormModalOpen(true);
                        }}
                        className="gap-1.5 sm:gap-2 h-8 sm:h-9 md:h-10 text-xs sm:text-sm px-3 sm:px-4 self-start sm:self-center"
                      >
                        <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Salon Ekle
                      </Button>
                    )}
          </div>
          {halls.length ? (
            <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {halls.map((hall) => (
                <HallCard
                  key={hall.id}
                  hall={hall}
                  onEdit={isSuperAdmin(user?.role) ? (h) => { setEditHall(h); setHallFormModalOpen(true); } : undefined}
                  onDelete={isSuperAdmin(user?.role) ? (h) => setHallToDelete(h) : undefined}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
              <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Henüz salon eklenmemiş</p>
              {isSuperAdmin(user?.role) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditHall(null);
                    setHallFormModalOpen(true);
                  }}
                  className="mt-4 gap-2"
                >
                  <Plus className="h-4 w-4" />
                  İlk Salonu Ekle
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Merkez silme onayı */}
      <Dialog open={!!centerToDelete} onOpenChange={(open) => { if (!open) setCenterToDelete(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="px-1 sm:px-0">
            <DialogTitle className="text-base sm:text-lg">Merkezi sil</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              &quot;{centerToDelete?.name}&quot; merkezini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
              {halls.length > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  Bu merkeze ait {halls.length} salon da silinecektir.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 px-1 sm:px-0 pt-2 sm:pt-0">
            <Button variant="outline" className="w-full sm:w-auto h-9 sm:h-10 text-sm" onClick={() => setCenterToDelete(null)}>
              İptal
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto h-9 sm:h-10 text-sm"
              onClick={handleDeleteCenter}
              disabled={deletingCenter}
            >
              {deletingCenter ? "Siliniyor..." : "Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Salon silme onayı */}
      <Dialog open={!!hallToDelete} onOpenChange={(open) => { if (!open) setHallToDelete(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="px-1 sm:px-0">
            <DialogTitle className="text-base sm:text-lg">Salonu sil</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              &quot;{hallToDelete?.name}&quot; salonunu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 px-1 sm:px-0 pt-2 sm:pt-0">
            <Button variant="outline" className="w-full sm:w-auto h-9 sm:h-10 text-sm" onClick={() => setHallToDelete(null)}>
              İptal
            </Button>
            <Button
              variant="destructive"
              className="w-full sm:w-auto h-9 sm:h-10 text-sm"
              onClick={handleDeleteHall}
              disabled={deletingHall}
            >
              {deletingHall ? "Siliniyor..." : "Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CenterFormModal
        open={centerFormModalOpen}
        onOpenChange={setCenterFormModalOpen}
        mode="update"
        initialCenter={center}
        onSuccess={handleCenterUpdated}
      />

      <HallFormModal
        open={hallFormModalOpen || !!editHall}
        onOpenChange={(open) => {
          if (!open) {
            setHallFormModalOpen(false);
            setEditHall(null);
          } else {
            setHallFormModalOpen(true);
          }
        }}
        mode={editHall ? "update" : "create"}
        initialHall={editHall ?? undefined}
        initialCenterId={center.id}
        onSuccess={editHall ? handleHallUpdated : handleHallCreated}
      />
    </>
  );
}
