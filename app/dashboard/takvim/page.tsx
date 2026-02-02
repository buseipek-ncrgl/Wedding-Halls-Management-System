"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getHalls } from "@/lib/api/halls";
import { getCenters } from "@/lib/api/centers";
import { getSchedulesByHall, createSchedule, updateSchedule, deleteSchedule, type UpdateScheduleData } from "@/lib/api/schedules";
import { getRequests } from "@/lib/api/requests";
import type { Schedule, WeddingHall, Request } from "@/lib/types";
import type { Center } from "@/lib/api/centers";
import { useUser } from "@/lib/user-context";
import { canManageSchedules, isViewer as isViewerRole, canAccessCenter } from "@/lib/utils/role";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  RefreshCw,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Edit,
  Trash2,
  Building2,
  Filter,
} from "lucide-react";
import { toUserFriendlyMessage } from "@/lib/utils/api-error";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const daysOfWeek = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const monthNames = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

// Müsaitlik saatleri
const TIME_SLOTS = ["09:00", "10:30", "12:00", "14:00", "15:30", "17:00"];

function formatDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTimeRange(s: Schedule): string {
  const start = s.startTime.slice(0, 5);
  const end = s.endTime.slice(0, 5);
  return `${start} - ${end}`;
}

/**
 * Parse "HH:mm" or "HH:mm:ss" to minutes since midnight.
 */
function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

type ScheduleWithHall = Schedule & { 
  hallName: string;
  eventName?: string;
  eventOwner?: string;
  eventType?: number;
  requestId?: string;
};

export default function TakvimPage() {
  const { user } = useUser();
  const canEdit = canManageSchedules(user?.role);
  const isSuperAdmin = user?.role === "SuperAdmin";
  const editorDepartment = user?.department; // Editor'ın alanı (0=Nikah, 1=Nişan, 2=Konser, 3=Toplantı, 4=Özel)
  
  // Debug: Editor department'ını logla
  useEffect(() => {
    if (user && !isSuperAdmin) {
      console.log("👤 User Department:", user.department, "Role:", user.role);
    }
  }, [user, isSuperAdmin]);
  const [halls, setHalls] = useState<WeddingHall[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [selectedCenterId, setSelectedCenterId] = useState<string>("all");
  const [schedules, setSchedules] = useState<ScheduleWithHall[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleWithHall | null>(null);
  const [scheduleToDelete, setScheduleToDelete] = useState<ScheduleWithHall | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>("");
  const [selectedHallForSchedule, setSelectedHallForSchedule] = useState<string>("");
  const [scheduleStatus, setScheduleStatus] = useState<"Available" | "Reserved">("Reserved");
  const [eventType, setEventType] = useState<number | undefined>(undefined);
  const [eventName, setEventName] = useState<string>("");
  const [eventOwner, setEventOwner] = useState<string>("");

  // Dialog açıldığında ve "Dolu" seçildiğinde Editor için department'ı otomatik ayarla
  useEffect(() => {
    if (scheduleDialogOpen && scheduleStatus === "Reserved" && !isSuperAdmin && editorDepartment !== undefined && editorDepartment !== null) {
      // Eğer eventType henüz set edilmemişse, editorDepartment'ı kullan
      if (eventType === undefined || eventType === null) {
        console.log("useEffect: Editor department otomatik ayarlanıyor:", editorDepartment);
        setEventType(editorDepartment);
      }
    }
  }, [scheduleDialogOpen, scheduleStatus, isSuperAdmin, editorDepartment, eventType]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [h, centersData, requests] = await Promise.all([
        getHalls(),
        getCenters().catch(() => []),
        getRequests().catch(() => []), // Request'ler yüklenemezse boş array döndür
      ]);
      setHalls(h ?? []);
      setCenters(centersData ?? []);
      
      // Request'leri çek (sadece Answered olanlar)
      const answeredRequests = requests.filter((r: Request) => r.status === "Answered");
      console.log(`[Takvim] Answered requests: ${answeredRequests.length}`);
      
      const all: ScheduleWithHall[] = [];
      let matchedCount = 0;
      for (const hall of h ?? []) {
        const list = await getSchedulesByHall(hall.id);
        for (const s of list ?? []) {
          // Dolu schedule'lar için Request bilgilerini ekle
          if (s.status === "Reserved") {
            // Tarih ve saat formatını normalize et
            let reqDate = s.date;
            if (reqDate.includes('T')) {
              reqDate = reqDate.split('T')[0];
            }
            
            // Saat formatını normalize et
            let scheduleTime = s.startTime;
            if (scheduleTime.includes(':')) {
              scheduleTime = scheduleTime.slice(0, 5); // HH:mm
            }
            
            // Eşleşen Request'i bul
            const matchingRequest = answeredRequests.find((req: Request) => {
              let reqEventDate = req.eventDate;
              if (reqEventDate.includes('T')) {
                reqEventDate = reqEventDate.split('T')[0];
              }
              
              // Saat formatını normalize et
              let reqTime = req.eventTime;
              if (reqTime.includes(':')) {
                reqTime = reqTime.slice(0, 5); // HH:mm
              }
              
              const matches = req.weddingHallId === s.weddingHallId &&
                             reqEventDate === reqDate &&
                             reqTime === scheduleTime;
              
              if (matches) {
                console.log(`[Takvim] Matched request:`, {
                  scheduleId: s.id,
                  requestId: req.id,
                  eventName: req.eventName,
                  hallId: req.weddingHallId,
                  date: reqEventDate,
                  time: reqTime,
                });
              }
              
              return matches;
            });
            
            if (matchingRequest) {
              matchedCount++;
              all.push({
                ...s,
                hallName: hall.name,
                eventName: matchingRequest.eventName,
                eventOwner: matchingRequest.eventOwner,
                eventType: matchingRequest.eventType,
                requestId: matchingRequest.id,
              });
            } else {
              console.log(`[Takvim] No matching request for schedule:`, {
                scheduleId: s.id,
                hallId: s.weddingHallId,
                date: reqDate,
                time: scheduleTime,
              });
              all.push({ ...s, hallName: hall.name });
            }
          } else {
            all.push({ ...s, hallName: hall.name });
          }
        }
      }
      console.log(`[Takvim] Total schedules: ${all.length}, Matched with requests: ${matchedCount}`);
      setSchedules(all);
    } catch (e) {
      toast.error(toUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: Date[] = [];
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;
    for (let i = startDay - 1; i >= 0; i--) {
      days.push(new Date(year, month, -i));
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }
    return days;
  };

  const navigateMonth = (delta: number) => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + delta, 1)
    );
  };

  const isToday = (d: Date) => {
    const t = new Date();
    return (
      d.getDate() === t.getDate() &&
      d.getMonth() === t.getMonth() &&
      d.getFullYear() === t.getFullYear()
    );
  };

  const isSelected = (d: Date) =>
    selectedDate &&
    d.getDate() === selectedDate.getDate() &&
    d.getMonth() === selectedDate.getMonth() &&
    d.getFullYear() === selectedDate.getFullYear();

  const isCurrentMonth = (d: Date) =>
    d.getMonth() === currentDate.getMonth();

  // Filtrelenmiş salonlar (merkeze göre)
  const filteredHalls = useMemo(() => {
    if (selectedCenterId === "all") return halls;
    return halls.filter((h) => h.centerId === selectedCenterId);
  }, [halls, selectedCenterId]);

  // Merkeze göre gruplanmış salonlar
  const hallsByCenter = useMemo(() => {
    if (selectedCenterId !== "all") {
      // Belirli bir merkez seçiliyse, sadece o merkezin salonlarını göster
      const center = centers.find((c) => c.id === selectedCenterId);
      if (!center) return [];
      return [{
        center,
        halls: filteredHalls,
      }];
    }
    // Tüm merkezler için grupla
    return centers.map((center) => ({
      center,
      halls: halls.filter((h) => h.centerId === center.id),
    })).filter((g) => g.halls.length > 0);
  }, [centers, halls, filteredHalls, selectedCenterId]);

  const selectedDateStr = formatDateString(selectedDate);
  const selectedDateSchedules = useMemo(() => {
    // Tarih formatını normalize et
    return schedules.filter((s) => {
      let sDate = s.date;
      if (sDate.includes('T')) {
        sDate = sDate.split('T')[0];
      }
      return sDate === selectedDateStr;
    }).sort((a, b) =>
      `${a.startTime} ${a.hallName}`.localeCompare(`${b.startTime} ${b.hallName}`)
    );
  }, [schedules, selectedDateStr]);

  // Saat bazlı müsaitlik durumu hesaplama
  const hourlyAvailability = useMemo(() => {
    const result: Record<string, Record<string, { available: boolean; schedule?: ScheduleWithHall }>> = {};
    
    // Her saat için
    TIME_SLOTS.forEach((timeSlot) => {
      result[timeSlot] = {};
      
      // Her salon için
      halls.forEach((hall) => {
        // Bu tarih ve saat için schedule bul
        // Saat formatını normalize et (HH:mm)
        const schedule = schedules.find(
          (s) => {
            // Tarih formatını normalize et
            let sDate = s.date;
            if (sDate.includes('T')) {
              sDate = sDate.split('T')[0];
            }
            
            // Saat formatını normalize et
            let sTime = s.startTime;
            if (sTime.includes(':')) {
              sTime = sTime.slice(0, 5); // HH:mm
            }
            
            // Salon ID'sine göre eşleştirme yap (isim yerine)
            return sDate === selectedDateStr &&
                   s.weddingHallId === hall.id &&
                   sTime === timeSlot;
          }
        );
        
        if (schedule) {
          // Salon ID'sine göre indeksle (isim yerine)
          result[timeSlot][hall.id] = {
            available: schedule.status === "Available",
            schedule: schedule as ScheduleWithHall, // Event bilgileri zaten schedule'da var
          };
        } else {
          // Schedule yoksa varsayılan olarak müsait kabul et
          result[timeSlot][hall.id] = {
            available: true,
          };
        }
      });
    });
    
    return result;
  }, [schedules, selectedDateStr, halls]);

  // Seçilen tarih için saat bazlı istatistikler (hourlyAvailability'dan hesapla)
  const availabilityStats = useMemo(() => {
    let totalSlots = 0;
    let availableSlots = 0;
    let reservedSlots = 0;
    
    // Her saat için
    TIME_SLOTS.forEach((timeSlot) => {
      const slotData = hourlyAvailability[timeSlot];
      
      // Filtrelenmiş salonlar için
      filteredHalls.forEach((hall) => {
        // Salon ID'sine göre kontrol et (isim yerine)
        const availability = slotData?.[hall.id];
        // Tüm salonlar için slot say (schedule yoksa bile müsait kabul et)
        totalSlots++;
        if (availability?.available ?? true) {
          availableSlots++;
        } else {
          reservedSlots++;
        }
      });
    });
    
    const occupancyRate = totalSlots > 0 ? Math.round((reservedSlots / totalSlots) * 100) : 0;
    const availabilityRate = totalSlots > 0 ? Math.round((availableSlots / totalSlots) * 100) : 0;
    
    return {
      available: availableSlots,
      reserved: reservedSlots,
      total: totalSlots,
      occupancyRate,
      availabilityRate,
    };
  }, [hourlyAvailability, filteredHalls]);

  const days = getDaysInMonth(currentDate);

  const getEventsForDate = (d: Date) => {
    const ds = formatDateString(d);
    return schedules.filter((s) => s.date === ds);
  };

  // Bugünkü rezervasyonlar (merkez filtresine göre)
  const todayStr = formatDateString(new Date());
  const todayReservations = useMemo(() => {
    // Filtrelenmiş salonların ID'lerini al
    const filteredHallIds = new Set(filteredHalls.map((h) => h.id));
    
    return schedules
      .filter((s) => {
        // Tarih formatını normalize et
        let sDate = s.date;
        if (sDate.includes('T')) {
          sDate = sDate.split('T')[0];
        }
        // Tarih kontrolü ve durum kontrolü
        const isToday = sDate === todayStr && s.status === "Reserved";
        // Merkez filtresine göre salon kontrolü
        const isInFilteredHalls = filteredHallIds.has(s.weddingHallId);
        return isToday && isInFilteredHalls;
      })
      .map((s) => ({
        ...s,
        eventName: (s as ScheduleWithHall).eventName || "Etkinlik Adı Yok",
        eventOwner: (s as ScheduleWithHall).eventOwner || "Bilinmiyor",
        eventType: (s as ScheduleWithHall).eventType,
      }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(0, 5);
  }, [schedules, todayStr, filteredHalls]);

  const getEventTypeName = (eventType?: number): string => {
    switch (eventType) {
      case 0:
        return "Nikah";
      case 1:
        return "Nişan";
      case 2:
        return "Konser";
      case 3:
        return "Toplantı";
      case 4:
        return "Özel Etkinlik";
      default:
        return "Etkinlik";
    }
  };

  // Hall'ın merkezine erişim kontrolü
  const canAccessHallCenter = (hallId: string): boolean => {
    if (isSuperAdmin) return true; // SuperAdmin her zaman erişebilir
    if (!canEdit) return false; // Viewer erişemez
    
    // Editor ise: Hall'ın merkezine erişim izni olmalı
    const hall = halls.find((h) => h.id === hallId);
    if (!hall) return false;
    
    const center = centers.find((c) => c.id === hall.centerId);
    if (!center) return false;
    
    return canAccessCenter(user?.role, user?.id, center.description);
  };

  // Editor için: Schedule'ı düzenleyebilir mi kontrolü (sadece kendi alanındaki schedule'ları düzenleyebilir)
  const canEditSchedule = (schedule: ScheduleWithHall): boolean => {
    if (isSuperAdmin) return true; // SuperAdmin tüm schedule'ları düzenleyebilir
    if (!canEdit) return false; // Viewer düzenleyemez
    
    // Editor ise: Hall'ın merkezine erişim izni olmalı VE Schedule'ın eventType'ı Editor'ın department'ı ile eşleşmeli
    if (!canAccessHallCenter(schedule.weddingHallId)) {
      return false; // Merkeze erişim izni yoksa düzenleyemez
    }
    
    // Editor ise: Schedule'ın eventType'ı Editor'ın department'ı ile eşleşmeli
    if (editorDepartment !== undefined && editorDepartment !== null) {
      return schedule.eventType === editorDepartment;
    }
    
    return false; // Editor'ın department'ı yoksa düzenleyemez
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between w-full">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Takvim</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Salon müsaitliklerini görüntüleyin
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-start sm:self-center shrink-0"
          onClick={() => refresh()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Yenile
        </Button>
      </div>

      {/* Merkez Filtresi */}
      {centers.length > 0 && (
        <Card className="border-border">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Filter className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <Label htmlFor="center-filter" className="text-xs sm:text-sm font-medium text-muted-foreground mb-1 block">
                  Merkez Filtresi
                </Label>
                <Select value={selectedCenterId} onValueChange={setSelectedCenterId}>
                  <SelectTrigger id="center-filter" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm Merkezler</SelectItem>
                    {centers.map((center) => (
                      <SelectItem key={center.id} value={center.id}>
                        {center.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Card className="border-border">
            <CardHeader className="pb-2 px-3 sm:px-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs sm:text-sm md:text-base font-semibold">
                  {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </CardTitle>
                <div className="flex gap-0.5 sm:gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 sm:h-8 sm:w-8"
                    onClick={() => navigateMonth(-1)}
                  >
                    <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 sm:h-8 sm:w-8"
                    onClick={() => navigateMonth(1)}
                  >
                    <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <div className="mb-1 grid grid-cols-7 gap-0.5 sm:gap-1">
                {daysOfWeek.map((day) => (
                  <div
                    key={day}
                    className="py-1 sm:py-1.5 md:py-2 text-center text-[9px] sm:text-[10px] md:text-xs font-medium text-muted-foreground"
                  >
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                {days.map((day, i) => {
                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        "relative aspect-square rounded-lg p-0.5 sm:p-1 text-xs sm:text-sm transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1",
                        !isCurrentMonth(day) && "text-muted-foreground/40",
                        isToday(day) && "bg-primary text-primary-foreground hover:bg-primary/90",
                        isSelected(day) && !isToday(day) && "bg-secondary text-primary ring-1 sm:ring-2 ring-primary"
                      )}
                    >
                      <span className="text-[9px] sm:text-[10px] md:text-sm">{day.getDate()}</span>
                    </button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 sm:mt-4 w-full bg-transparent text-xs sm:text-sm"
                onClick={() => {
                  setSelectedDate(new Date());
                  setCurrentDate(new Date());
                }}
              >
                Bugüne Git
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-7 space-y-3 sm:space-y-4">
          {/* Seçilen Tarih İçin Doluluk Oranı Kartı */}
          {availabilityStats.total > 0 && (
            <div className="grid gap-2 sm:gap-3 md:gap-4 grid-cols-1 sm:grid-cols-3">
              <Card className="border-border bg-card">
                <CardContent className="p-3 sm:p-4">
                  <div className="text-center">
                    <div className="mb-2 text-xl sm:text-2xl md:text-3xl font-bold text-primary">
                      %{availabilityStats.availabilityRate}
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">Müsaitlik Oranı</p>
                    <div className="mt-2 h-1.5 sm:h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${availabilityStats.availabilityRate}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-green-200 bg-green-50">
                <CardContent className="p-2.5 sm:p-3 md:p-4 text-center">
                  <CheckCircle2 className="mx-auto mb-1.5 sm:mb-2 h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-green-600" />
                  <div className="text-lg sm:text-xl md:text-2xl font-bold text-green-700">
                    {availabilityStats.available}
                  </div>
                  <p className="text-[10px] sm:text-xs text-green-600">Müsait</p>
                </CardContent>
              </Card>
              
              <Card className="border-red-200 bg-red-50">
                <CardContent className="p-2.5 sm:p-3 md:p-4 text-center">
                  <XCircle className="mx-auto mb-1.5 sm:mb-2 h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-red-600" />
                  <div className="text-lg sm:text-xl md:text-2xl font-bold text-red-700">
                    {availabilityStats.reserved}
                  </div>
                  <p className="text-[10px] sm:text-xs text-red-600">Dolu</p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card className="border-border">
            <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
              <div className="flex flex-col gap-2 sm:gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-sm sm:text-base font-semibold">
                  <CalendarIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span>{selectedDate.getDate()} {monthNames[selectedDate.getMonth()]}</span>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-1 sm:px-3 md:px-6">
              {filteredHalls.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 sm:py-12 text-center px-4">
                  <div className="mb-2 sm:mb-3 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-muted">
                    <CalendarIcon className="h-5 w-5 sm:h-6 sm:w-6 text-muted-foreground" />
                  </div>
                  <p className="text-xs sm:text-sm font-medium text-foreground">
                    {selectedCenterId === "all" ? "Salon Bulunamadı" : "Bu merkezde salon bulunamadı"}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-1 sm:-mx-3 md:-mx-6 sm:mx-0 w-full max-w-full">
                  <div className="inline-block min-w-full align-middle px-0 max-w-full">
                    <table className="w-full border-collapse min-w-[300px] sm:min-w-[450px] md:min-w-[550px] max-w-full table-fixed">
                      <thead>
                        {selectedCenterId === "all" ? (
                          // Tüm merkezler seçiliyse, merkezlere göre grupla
                          <>
                            {/* Merkez başlık satırı */}
                            <tr className="border-b border-border bg-primary/5">
                              <th className="sticky left-0 z-30 bg-primary/5 border-r border-border px-1 sm:px-2 md:px-3 lg:px-4 py-1 sm:py-1.5 md:py-2 lg:py-3 text-left text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-semibold text-foreground">
                              </th>
                              {hallsByCenter.map(({ center, halls: centerHalls }) => (
                                <th
                                  key={`center-header-${center.id}`}
                                  colSpan={centerHalls.length}
                                  className="px-1 sm:px-1.5 md:px-2 lg:px-3 py-1 sm:py-1.5 md:py-2 lg:py-3 text-center text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs font-semibold text-foreground border-l-2 border-primary min-w-[80px] sm:min-w-[100px] md:min-w-[120px] lg:min-w-[150px]"
                                >
                                  <div className="flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 md:gap-1.5 min-w-0" title={center.name}>
                                    <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
                                      <Building2 className="h-2.5 w-2.5 sm:h-3 sm:w-3 md:h-3.5 md:w-3.5 shrink-0" />
                                      <span className="break-words text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs leading-tight text-center line-clamp-2">{center.name}</span>
                                    </div>
                                    <Badge variant="secondary" className="text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] px-1 sm:px-1.5 shrink-0 whitespace-nowrap mt-0.5 sm:mt-0">
                                      {centerHalls.length} Sa
                                    </Badge>
                                  </div>
                                </th>
                              ))}
                            </tr>
                            {/* Salon başlık satırı */}
                            <tr className="border-b border-border">
                              <th className="sticky left-0 z-30 bg-card border-r border-border px-1 sm:px-2 md:px-3 lg:px-4 py-1 sm:py-1.5 md:py-2 lg:py-3 text-left text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-semibold text-foreground whitespace-nowrap">
                                Saat
                              </th>
                              {hallsByCenter.flatMap(({ halls: centerHalls }) =>
                                centerHalls.map((hall) => (
                                  <th
                                    key={hall.id}
                                    className="px-0.5 sm:px-1 md:px-1.5 lg:px-2 xl:px-4 py-1 sm:py-1.5 md:py-2 lg:py-3 text-center text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs xl:text-sm font-semibold text-foreground min-w-[65px] sm:min-w-[75px] md:min-w-[90px] lg:min-w-[115px] xl:min-w-[140px]"
                                  >
                                    <span className="break-words whitespace-normal line-clamp-2 leading-tight block" title={hall.name}>{hall.name}</span>
                                  </th>
                                ))
                              )}
                            </tr>
                          </>
                        ) : (
                          // Belirli bir merkez seçiliyse, sadece o merkezin salonlarını göster
                          <tr className="border-b border-border">
                            <th className="sticky left-0 z-30 bg-card border-r border-border px-1 sm:px-2 md:px-3 lg:px-4 py-1 sm:py-1.5 md:py-2 lg:py-3 text-left text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-semibold text-foreground whitespace-nowrap">
                              Saat
                            </th>
                            {filteredHalls.map((hall) => (
                              <th
                                key={hall.id}
                                className="px-0.5 sm:px-1 md:px-1.5 lg:px-2 xl:px-4 py-1 sm:py-1.5 md:py-2 lg:py-3 text-center text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs xl:text-sm font-semibold text-foreground min-w-[65px] sm:min-w-[75px] md:min-w-[90px] lg:min-w-[115px] xl:min-w-[140px]"
                              >
                                <span className="break-words whitespace-normal line-clamp-2 leading-tight block" title={hall.name}>{hall.name}</span>
                              </th>
                            ))}
                          </tr>
                        )}
                      </thead>
                      <tbody>
                        {TIME_SLOTS.map((timeSlot) => {
                        const hasAnySchedule = filteredHalls.some(
                          (hall) => hourlyAvailability[timeSlot]?.[hall.id]?.schedule
                        );
                        
                        return (
                          <tr
                            key={timeSlot}
                            className="border-b border-border hover:bg-muted/50 transition-colors"
                          >
                            <td className="sticky left-0 z-10 bg-card border-r border-border px-1 sm:px-2 md:px-3 lg:px-4 py-1 sm:py-1.5 md:py-2 lg:py-3 text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs xl:text-sm font-medium text-foreground whitespace-nowrap">
                              <div className="flex items-center gap-0.5 sm:gap-1 md:gap-1.5 lg:gap-2">
                                <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 md:h-3.5 md:w-3.5 lg:h-4 lg:w-4 text-muted-foreground shrink-0" />
                                <span>{timeSlot}</span>
                              </div>
                            </td>
                            {selectedCenterId === "all" ? (
                              // Tüm merkezler seçiliyse, merkezlere göre grupla
                              hallsByCenter.flatMap(({ halls: centerHalls }) =>
                                centerHalls.map((hall) => {
                                  // Salon ID'sine göre kontrol et (isim yerine)
                                  const availability = hourlyAvailability[timeSlot]?.[hall.id];
                                  
                                  // Schedule yoksa varsayılan olarak müsait göster
                                  const isAvailable = availability?.available ?? true;
                                  const schedule = availability?.schedule;
                                  
                                  const scheduleWithHall = schedule as ScheduleWithHall | undefined;
                                  
                                  const handleCellClick = () => {
                                    // Merkez erişim kontrolü
                                    const hasAccess = canAccessHallCenter(hall.id);
                                    
                                    if (hasAccess && isAvailable) {
                                      // Editor/SuperAdmin için müsait kısımlara tıklayınca düzenleme dialog'u aç
                                      setSelectedTimeSlot(timeSlot);
                                      setSelectedHallForSchedule(hall.id);
                                      // Mevcut schedule varsa bilgilerini yükle
                                      if (scheduleWithHall) {
                                        setScheduleStatus(scheduleWithHall.status);
                                        setEventType(scheduleWithHall.eventType);
                                        setEventName(scheduleWithHall.eventName || "");
                                        setEventOwner(scheduleWithHall.eventOwner || "");
                                      } else {
                                        // Yeni schedule için varsayılan değerler
                                        setScheduleStatus("Reserved");
                                        setEventName("");
                                        setEventOwner("");
                                        // Editor ise department'ını otomatik ayarla
                                        if (!isSuperAdmin && editorDepartment !== undefined && editorDepartment !== null) {
                                          console.log("Setting eventType to editorDepartment:", editorDepartment);
                                          setEventType(editorDepartment);
                                        } else {
                                          setEventType(undefined);
                                        }
                                      }
                                      setScheduleDialogOpen(true);
                                    } else if (!isAvailable && scheduleWithHall) {
                                      // Dolu kısımlara tıklayınca detay dialog'u aç (düzenleme/silme butonları dialog içinde)
                                      setSelectedSchedule(scheduleWithHall);
                                      setDetailDialogOpen(true);
                                    } else if (!hasAccess && isAvailable) {
                                      // Erişim izni yoksa uyarı göster
                                      toast.error("Bu merkeze erişim yetkiniz bulunmamaktadır.");
                                    }
                                  };
                                  
                                  // Etkinlik adını al (varsa)
                                  const eventName = scheduleWithHall?.eventName;
                                  const displayText = isAvailable ? "Müsait" : (eventName || "Dolu");
                                  
                                  return (
                                    <td
                                      key={hall.id}
                                      className={cn(
                                        "px-0.5 sm:px-1 py-1 sm:py-1.5 md:py-2 text-center",
                                        (canAccessHallCenter(hall.id) && isAvailable) || (!isAvailable && scheduleWithHall) ? "cursor-pointer hover:bg-muted/30" : ""
                                      )}
                                      onClick={handleCellClick}
                                    >
                                      <div
                                        className={cn(
                                          "inline-flex items-center justify-center rounded-lg px-0.5 sm:px-1 md:px-1.5 py-0.5 sm:py-0.5 md:py-1 text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] xl:text-xs font-medium transition-colors w-full max-w-full",
                                          isAvailable
                                            ? "bg-green-100 text-green-700 border border-green-200"
                                            : "bg-red-100 text-red-700 border border-red-200"
                                        )}
                                        title={!isAvailable && scheduleWithHall ? `${eventName || "Dolu"}` : undefined}
                                      >
                                        {isAvailable ? (
                                          <>
                                            <CheckCircle2 className="mr-0.5 h-2 w-2 sm:h-2 sm:w-2 md:h-2.5 md:w-2.5 lg:h-3 lg:w-3 shrink-0" />
                                            <span className="hidden lg:inline truncate">{displayText}</span>
                                            <span className="lg:hidden">M</span>
                                          </>
                                        ) : (
                                          <>
                                            <XCircle className="mr-0.5 h-2 w-2 sm:h-2 sm:w-2 md:h-2.5 md:w-2.5 lg:h-3 lg:w-3 shrink-0" />
                                            <span className="truncate max-w-[28px] sm:max-w-[35px] md:max-w-[45px] lg:max-w-[60px] xl:max-w-[80px]" title={eventName || "Dolu"}>
                                              <span className="hidden lg:inline">{eventName && eventName.length > 6 ? eventName.substring(0, 5) + "..." : eventName || displayText}</span>
                                              <span className="lg:hidden">D</span>
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  );
                                })
                              )
                            ) : (
                              // Belirli bir merkez seçiliyse, sadece o merkezin salonlarını göster
                              filteredHalls.map((hall) => {
                                // Salon ID'sine göre kontrol et (isim yerine)
                                const availability = hourlyAvailability[timeSlot]?.[hall.id];
                                
                                // Schedule yoksa varsayılan olarak müsait göster
                                const isAvailable = availability?.available ?? true;
                                const schedule = availability?.schedule;
                                
                                const scheduleWithHall = schedule as ScheduleWithHall | undefined;
                                
                                const handleCellClick = () => {
                                  if (canEdit && isAvailable) {
                                    // Editor/SuperAdmin için müsait kısımlara tıklayınca düzenleme dialog'u aç
                                    setSelectedTimeSlot(timeSlot);
                                    setSelectedHallForSchedule(hall.id);
                                    // Mevcut schedule varsa bilgilerini yükle
                                    if (scheduleWithHall) {
                                      setScheduleStatus(scheduleWithHall.status);
                                      setEventType(scheduleWithHall.eventType);
                                      setEventName(scheduleWithHall.eventName || "");
                                      setEventOwner(scheduleWithHall.eventOwner || "");
                                    } else {
                                      // Yeni schedule için varsayılan değerler
                                      setScheduleStatus("Reserved");
                                      setEventName("");
                                      setEventOwner("");
                                      // Editor ise department'ını otomatik ayarla
                                      if (!isSuperAdmin && editorDepartment !== undefined && editorDepartment !== null) {
                                        console.log("Setting eventType to editorDepartment:", editorDepartment);
                                        setEventType(editorDepartment);
                                      } else {
                                        setEventType(undefined);
                                      }
                                    }
                                    setScheduleDialogOpen(true);
                                  } else if (!isAvailable && scheduleWithHall) {
                                    // Dolu kısımlara tıklayınca detay dialog'u aç (düzenleme/silme butonları dialog içinde)
                                    setSelectedSchedule(scheduleWithHall);
                                    setDetailDialogOpen(true);
                                  }
                                };
                                
                                // Etkinlik adını al (varsa)
                                const eventName = scheduleWithHall?.eventName;
                                const displayText = isAvailable ? "Müsait" : (eventName || "Dolu");
                                
                                return (
                                  <td
                                    key={hall.id}
                                      className={cn(
                                        "px-0.5 sm:px-1 py-1 sm:py-1.5 md:py-2 text-center",
                                        (canAccessHallCenter(hall.id) && isAvailable) || (!isAvailable && scheduleWithHall) ? "cursor-pointer hover:bg-muted/30" : ""
                                      )}
                                    onClick={handleCellClick}
                                  >
                                    <div
                                      className={cn(
                                        "inline-flex items-center justify-center rounded-lg px-0.5 sm:px-1 md:px-1.5 py-0.5 sm:py-0.5 md:py-1 text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] xl:text-xs font-medium transition-colors w-full max-w-full",
                                        isAvailable
                                          ? "bg-green-100 text-green-700 border border-green-200"
                                          : "bg-red-100 text-red-700 border border-red-200"
                                      )}
                                      title={!isAvailable && scheduleWithHall ? `${eventName || "Dolu"}` : undefined}
                                    >
                                      {isAvailable ? (
                                        <>
                                          <CheckCircle2 className="mr-0.5 h-2 w-2 sm:h-2 sm:w-2 md:h-2.5 md:w-2.5 lg:h-3 lg:w-3 shrink-0" />
                                          <span className="hidden lg:inline truncate">{displayText}</span>
                                          <span className="lg:hidden">M</span>
                                        </>
                                      ) : (
                                        <>
                                          <XCircle className="mr-0.5 h-2 w-2 sm:h-2 sm:w-2 md:h-2.5 md:w-2.5 lg:h-3 lg:w-3 shrink-0" />
                                          <span className="truncate max-w-[28px] sm:max-w-[35px] md:max-w-[45px] lg:max-w-[60px] xl:max-w-[80px]" title={eventName || "Dolu"}>
                                            <span className="hidden lg:inline">{eventName && eventName.length > 6 ? eventName.substring(0, 5) + "..." : eventName || displayText}</span>
                                            <span className="lg:hidden">D</span>
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                );
                              })
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                  
                  {availabilityStats.total === 0 && filteredHalls.length > 0 && (
                    <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
                      <p className="text-xs text-green-800 text-center">
                        Bu tarihte henüz müsaitlik kaydı oluşturulmamış. Tüm salonlar varsayılan olarak müsait gösterilmektedir.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Schedule Düzenleme Dialog'u (Editor ve SuperAdmin için) */}
      {canEdit && (
        <Dialog open={scheduleDialogOpen} onOpenChange={(open) => {
          setScheduleDialogOpen(open);
          // Form kapanırken state'i temizle
          if (!open) {
            setEventType(undefined);
            setEventName("");
            setEventOwner("");
            setSelectedTimeSlot("");
            setSelectedHallForSchedule("");
          }
        }}>
          <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader className="px-1 sm:px-0">
              <DialogTitle className="text-base sm:text-lg">Müsaitlik Düzenle</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                {selectedDateStr} tarihinde {selectedTimeSlot} saatinde müsaitlik durumunu ayarlayın
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2.5 sm:space-y-3 md:space-y-4 py-2 sm:py-4 px-1 sm:px-0">
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm">Salon</Label>
                {selectedHallForSchedule ? (() => {
                  const selectedHall = halls.find((h) => h.id === selectedHallForSchedule);
                  const center = selectedHall ? centers.find((c) => c.id === selectedHall.centerId) : null;
                  return (
                    <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2">
                      <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate">{center?.name ?? "—"}</span>
                      <span className="text-muted-foreground shrink-0">–</span>
                      <span className="truncate">{selectedHall?.name ?? "—"}</span>
                    </div>
                  );
                })() : (
                  <Select value={selectedHallForSchedule} onValueChange={setSelectedHallForSchedule}>
                    <SelectTrigger className="h-8 sm:h-10 text-xs sm:text-sm">
                      <SelectValue placeholder="Salon seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {halls.map((hall) => (
                        <SelectItem key={hall.id} value={hall.id}>
                          {hall.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm">Tarih</Label>
                <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
                  {selectedDateStr}
                </div>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm">Saat</Label>
                <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
                  {selectedTimeSlot}
                </div>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm">Durum</Label>
                <Select
                  value={scheduleStatus}
                  onValueChange={(value: "Available" | "Reserved") => {
                    setScheduleStatus(value);
                    // Müsait seçilirse etkinlik bilgilerini temizle
                    if (value === "Available") {
                      setEventType(undefined);
                      setEventName("");
                      setEventOwner("");
                    } else {
                      // Dolu seçilirse Editor için department'ını otomatik ayarla
                      if (!isSuperAdmin && editorDepartment !== undefined) {
                        setEventType(editorDepartment);
                      }
                    }
                  }}
                >
                  <SelectTrigger className="h-8 sm:h-10 text-xs sm:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Available">Müsait</SelectItem>
                    <SelectItem value="Reserved">Dolu</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Dolu seçildiğinde etkinlik bilgileri */}
              {scheduleStatus === "Reserved" && (
                <>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-xs sm:text-sm">Etkinlik Tipi *</Label>
                    {isSuperAdmin ? (
                      <Select
                        value={eventType?.toString() ?? ""}
                        onValueChange={(value) => setEventType(parseInt(value))}
                      >
                        <SelectTrigger className="h-8 sm:h-10 text-xs sm:text-sm">
                          <SelectValue placeholder="Etkinlik tipi seçin" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Nikah</SelectItem>
                          <SelectItem value="1">Nişan</SelectItem>
                          <SelectItem value="2">Konser</SelectItem>
                          <SelectItem value="3">Toplantı</SelectItem>
                          <SelectItem value="4">Özel</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
                        {editorDepartment === 0 && "Nikah"}
                        {editorDepartment === 1 && "Nişan"}
                        {editorDepartment === 2 && "Konser"}
                        {editorDepartment === 3 && "Toplantı"}
                        {editorDepartment === 4 && "Özel"}
                        {(editorDepartment === undefined || editorDepartment === null) && "Belirtilmemiş"}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-xs sm:text-sm">Etkinlik Adı *</Label>
                    <Input
                      className="text-xs sm:text-sm h-8 sm:h-10"
                      placeholder="Örn: Düğün Töreni"
                      value={eventName}
                      onChange={(e) => setEventName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-xs sm:text-sm">Etkinlik Sahibi/Kişi Adı *</Label>
                    <Input
                      className="text-xs sm:text-sm h-8 sm:h-10"
                      placeholder="Örn: Ahmet Yılmaz"
                      value={eventOwner}
                      onChange={(e) => setEventOwner(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2 px-1 sm:px-0 pt-2 sm:pt-0">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => {
                  // Formu temizle
                  setEventType(undefined);
                  setEventName("");
                  setEventOwner("");
                  setScheduleDialogOpen(false);
                }}
              >
                İptal
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={async () => {
                  if (!selectedHallForSchedule || !selectedTimeSlot) {
                    toast.error("Lütfen salon seçin");
                    return;
                  }

                  // Erişim kontrolü - form açılmadan önce (burada tekrar kontrol ediyoruz çünkü form açıldıktan sonra salon değişmiş olabilir)
                  if (!canAccessHallCenter(selectedHallForSchedule)) {
                    toast.error("Bu merkeze erişim yetkiniz bulunmamaktadır.");
                    setScheduleDialogOpen(false);
                    return;
                  }

                  // Dolu schedule'lar için etkinlik bilgileri zorunlu
                  if (scheduleStatus === "Reserved") {
                    // EventType: SuperAdmin için seçilmiş olmalı, Editor için department otomatik
                    const finalEventType = isSuperAdmin ? eventType : editorDepartment;
                    if (finalEventType === undefined && finalEventType !== 0) {
                      toast.error("Lütfen etkinlik tipi seçin");
                      return;
                    }
                    if (!eventName.trim()) {
                      toast.error("Lütfen etkinlik adı girin");
                      return;
                    }
                    if (!eventOwner.trim()) {
                      toast.error("Lütfen etkinlik sahibi adı girin");
                      return;
                    }
                  }

                  try {
                    const hall = halls.find((h) => h.id === selectedHallForSchedule);
                    if (!hall) {
                      toast.error("Salon bulunamadı");
                      return;
                    }

                    // Saat aralığını hesapla (örn: 09:00 -> 09:00-10:30)
                    const timeIndex = TIME_SLOTS.indexOf(selectedTimeSlot);
                    const endTime = timeIndex < TIME_SLOTS.length - 1 
                      ? TIME_SLOTS[timeIndex + 1] 
                      : "18:00";

                    // Frontend'de çakışma kontrolü (kullanıcıya daha hızlı geri bildirim için)
                    const startTimeStr = `${selectedTimeSlot}:00`;
                    const endTimeStr = `${endTime}:00`;
                    
                    const conflictingSchedule = schedules.find((s) => {
                      if (s.weddingHallId !== selectedHallForSchedule || s.date !== selectedDateStr) {
                        return false;
                      }
                      // Mevcut schedule'ı güncelliyorsak onu hariç tut
                      const existingSchedule = schedules.find(
                        (s) =>
                          s.weddingHallId === selectedHallForSchedule &&
                          s.date === selectedDateStr &&
                          s.startTime.startsWith(selectedTimeSlot)
                      );
                      if (existingSchedule && s.id === existingSchedule.id) {
                        return false;
                      }
                      // Çakışma kontrolü
                      const startMinutes = toMinutes(startTimeStr);
                      const endMinutes = toMinutes(endTimeStr);
                      const sStartMinutes = toMinutes(s.startTime);
                      const sEndMinutes = toMinutes(s.endTime);
                      return startMinutes < sEndMinutes && endMinutes > sStartMinutes;
                    });

                    if (conflictingSchedule) {
                      const conflictType = conflictingSchedule.eventType !== undefined 
                        ? getEventTypeName(conflictingSchedule.eventType) 
                        : "Etkinlik";
                      toast.error(
                        `Bu saat aralığında zaten bir ${conflictType} rezervasyonu var. ` +
                        `(${conflictingSchedule.eventName || "Etkinlik"})`
                      );
                      return;
                    }

                    // EventType: SuperAdmin için seçilen değer, Editor için department
                    const finalEventType = scheduleStatus === "Reserved" 
                      ? (isSuperAdmin ? eventType : editorDepartment)
                      : undefined;

                    const scheduleData: UpdateScheduleData = {
                      weddingHallId: selectedHallForSchedule,
                      date: selectedDateStr,
                      startTime: startTimeStr,
                      endTime: endTimeStr,
                      status: scheduleStatus,
                      eventType: finalEventType,
                      eventName: scheduleStatus === "Reserved" ? eventName.trim() : undefined,
                      eventOwner: scheduleStatus === "Reserved" ? eventOwner.trim() : undefined,
                    };

                    // Mevcut schedule var mı kontrol et
                    const existingSchedule = schedules.find(
                      (s) =>
                        s.weddingHallId === selectedHallForSchedule &&
                        s.date === selectedDateStr &&
                        s.startTime.startsWith(selectedTimeSlot)
                    );

                    if (existingSchedule) {
                      // Mevcut schedule'ı güncelle
                      const existingScheduleWithHall = existingSchedule as ScheduleWithHall;
                      
                      // Eğer schedule "Reserved" durumundaysa ve eventType varsa, Editor için eventType kontrolü yap
                      if (existingScheduleWithHall.status === "Reserved" && existingScheduleWithHall.eventType !== undefined && existingScheduleWithHall.eventType !== null) {
                        // Editor için: Sadece kendi alanındaki schedule'ları güncelleyebilir
                        // SuperAdmin tüm schedule'ları güncelleyebilir
                        if (!canEditSchedule(existingScheduleWithHall)) {
                          // Editor'ın kendi alanında değilse hata ver
                          toast.error("Bu etkinliği düzenleme yetkiniz bulunmamaktadır. Sadece kendi alanınızdaki etkinlikleri düzenleyebilirsiniz.");
                          setScheduleDialogOpen(false);
                          return;
                        }
                      } else {
                        // "Available" schedule'lar veya eventType olmayan schedule'lar için sadece merkez erişim kontrolü yap
                        if (!canAccessHallCenter(selectedHallForSchedule)) {
                          toast.error("Bu merkeze erişim yetkiniz bulunmamaktadır.");
                          setScheduleDialogOpen(false);
                          return;
                        }
                      }
                      
                      // Düzenleme yetkisi varsa güncelle
                      await updateSchedule(existingSchedule.id, scheduleData);
                      toast.success("Müsaitlik güncellendi");
                    } else {
                      // Yeni oluştur - sadece merkez erişim kontrolü yapıldı (1099. satırda)
                      await createSchedule(scheduleData);
                      toast.success("Müsaitlik oluşturuldu");
                    }

                    // Formu temizle
                    setEventType(undefined);
                    setEventName("");
                    setEventOwner("");
                    await refresh();
                    setScheduleDialogOpen(false);
                  } catch (e) {
                    toast.error(toUserFriendlyMessage(e));
                  }
                }}
              >
                Kaydet
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Detay Dialog'u */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="px-1 sm:px-0">
            <DialogTitle className="text-base sm:text-lg">Rezervasyon Detayları</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {selectedSchedule && (
                <>
                  {(selectedSchedule as ScheduleWithHall).eventName || "Rezervasyon Detayları"} - {formatTimeRange(selectedSchedule)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedSchedule && (
            <div className="space-y-2.5 sm:space-y-3 md:space-y-4 py-2 sm:py-4 px-1 sm:px-0">
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm font-semibold">Etkinlik Adı</Label>
                <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
                  {(selectedSchedule as ScheduleWithHall).eventName || "Etkinlik Adı Yok"}
                </div>
              </div>
              {(selectedSchedule as ScheduleWithHall).eventOwner && (
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm font-semibold">Rezervasyon Yapan</Label>
                  <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
                    {(selectedSchedule as ScheduleWithHall).eventOwner}
                  </div>
                </div>
              )}
              {(selectedSchedule as ScheduleWithHall).eventType !== undefined && (
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm font-semibold">Etkinlik Tipi</Label>
                  <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
                    {getEventTypeName((selectedSchedule as ScheduleWithHall).eventType)}
                  </div>
                </div>
              )}
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm font-semibold">Tarih</Label>
                <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
                  {selectedSchedule.date}
                </div>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm font-semibold">Saat Aralığı</Label>
                <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
                  {formatTimeRange(selectedSchedule)}
                </div>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm font-semibold">Salon</Label>
                <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
                  {selectedSchedule.hallName}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex flex-col sm:flex-row gap-2 px-1 sm:px-0 pt-2 sm:pt-0 sticky bottom-0 bg-background border-t border-border -mx-6 -mb-6 px-6 pb-4 sm:border-t-0 sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:pb-0">
            {selectedSchedule && canEditSchedule(selectedSchedule as ScheduleWithHall) && (
              <>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto h-9 sm:h-10 text-sm"
                  onClick={() => {
                    if (!selectedSchedule) return;
                    
                    // Erişim kontrolü - form açılmadan önce
                    const scheduleWithHall = selectedSchedule as ScheduleWithHall;
                    if (!canEditSchedule(scheduleWithHall)) {
                      toast.error("Bu rezervasyonu düzenleme yetkiniz bulunmamaktadır. Sadece kendi departmanınıza ait rezervasyonları düzenleyebilirsiniz.");
                      return;
                    }
                    
                    // Merkez erişim kontrolü
                    if (!canAccessHallCenter(selectedSchedule.weddingHallId)) {
                      toast.error("Bu merkeze erişim yetkiniz bulunmamaktadır.");
                      return;
                    }
                    
                    // Düzenleme için mevcut bilgileri yükle
                    setSelectedTimeSlot(selectedSchedule.startTime.slice(0, 5));
                    setSelectedHallForSchedule(selectedSchedule.weddingHallId);
                    setScheduleStatus(selectedSchedule.status);
                    setEventType(scheduleWithHall.eventType);
                    setEventName(scheduleWithHall.eventName || "");
                    setEventOwner(scheduleWithHall.eventOwner || "");
                    setDetailDialogOpen(false);
                    setScheduleDialogOpen(true);
                  }}
                >
                  <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                  Düzenle
                </Button>
                <Button
                  variant="destructive"
                  className="w-full sm:w-auto h-9 sm:h-10 text-sm"
                  onClick={() => {
                    if (!selectedSchedule) return;
                    setScheduleToDelete(selectedSchedule);
                    setDetailDialogOpen(false);
                    setDeleteDialogOpen(true);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                  Sil
                </Button>
              </>
            )}
            <Button variant="outline" className="w-full sm:w-auto h-9 sm:h-10 text-sm" onClick={() => setDetailDialogOpen(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Silme Onay Dialog'u */}
      {canEdit && (
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader className="px-1 sm:px-0">
              <DialogTitle className="text-base sm:text-lg">Rezervasyonu Sil</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                Bu rezervasyonu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
              </DialogDescription>
            </DialogHeader>
            {scheduleToDelete && (
              <div className="space-y-2 py-2 sm:py-4 px-1 sm:px-0">
                <div className="rounded-md border border-border bg-muted p-2 sm:p-3">
                  <p className="text-xs sm:text-sm font-medium">
                    {(scheduleToDelete as ScheduleWithHall).eventName || "Etkinlik Adı Yok"}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                    {scheduleToDelete.hallName} • {scheduleToDelete.date} • {formatTimeRange(scheduleToDelete)}
                  </p>
                </div>
              </div>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2 px-1 sm:px-0 pt-2 sm:pt-0">
              <Button variant="outline" className="w-full sm:w-auto h-9 sm:h-10 text-sm" onClick={() => {
                setDeleteDialogOpen(false);
                setScheduleToDelete(null);
              }}>
                İptal
              </Button>
              <Button
                variant="destructive"
                className="w-full sm:w-auto h-9 sm:h-10 text-sm"
                onClick={async () => {
                  if (!scheduleToDelete) return;
                  try {
                    await deleteSchedule(scheduleToDelete.id);
                    toast.success("Rezervasyon silindi");
                    setDeleteDialogOpen(false);
                    const deletedId = scheduleToDelete.id;
                    setScheduleToDelete(null);
                    // Silinen schedule'ı state'den de kaldır (hemen güncelleme için)
                    setSchedules((prev) => prev.filter((s) => s.id !== deletedId));
                    // Backend'den yeniden yükle
                    await refresh();
                  } catch (e) {
                    toast.error(toUserFriendlyMessage(e));
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                Sil
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Bugünkü Rezervasyonlar */}
      {todayReservations.length > 0 && (
        <Card className="border-border">
          <CardHeader className="px-3 sm:px-6 pb-2 sm:pb-3">
            <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base font-semibold">
              <CalendarIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Bugünkü Rezervasyonlar
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <div className="space-y-2 sm:space-y-3">
              {todayReservations.map((reservation) => (
                <div
                  key={reservation.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 rounded-lg border border-border bg-card p-2 sm:p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <CalendarIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-medium text-foreground truncate" title={reservation.eventName || "Etkinlik Adı Yok"}>
                        {reservation.eventName || "Etkinlik Adı Yok"}
                      </p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                        {formatTimeRange(reservation)} • {reservation.hallName}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
                    <Badge variant="destructive" className="bg-red-100 text-red-700 border border-red-200 text-[10px] sm:text-xs px-2 sm:px-2.5 py-1 shrink-0 self-start sm:self-center">
                      Dolu
                    </Badge>
                    <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                      {canEditSchedule(reservation as ScheduleWithHall) && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 sm:h-9 text-xs sm:text-sm px-3 sm:px-4 flex-1 sm:flex-initial shrink-0"
                            onClick={() => {
                              const reservationWithHall = reservation as ScheduleWithHall;
                              
                              // Erişim kontrolü - form açılmadan önce
                              if (!canEditSchedule(reservationWithHall)) {
                                toast.error("Bu rezervasyonu düzenleme yetkiniz bulunmamaktadır. Sadece kendi departmanınıza ait rezervasyonları düzenleyebilirsiniz.");
                                return;
                              }
                              
                              // Merkez erişim kontrolü
                              if (!canAccessHallCenter(reservation.weddingHallId)) {
                                toast.error("Bu merkeze erişim yetkiniz bulunmamaktadır.");
                                return;
                              }
                              
                              setSelectedSchedule(reservation);
                              setSelectedTimeSlot(reservation.startTime.slice(0, 5));
                              setSelectedHallForSchedule(reservation.weddingHallId);
                              setScheduleStatus(reservation.status);
                              setEventType(reservationWithHall.eventType);
                              setEventName(reservationWithHall.eventName || "");
                              setEventOwner(reservationWithHall.eventOwner || "");
                              setDetailDialogOpen(false);
                              setScheduleDialogOpen(true);
                            }}
                          >
                            <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                            Düzenle
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-8 sm:h-9 text-xs sm:text-sm px-3 sm:px-4 flex-1 sm:flex-initial shrink-0"
                            onClick={() => {
                              setScheduleToDelete(reservation);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                            Sil
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 sm:h-9 text-xs sm:text-sm px-3 sm:px-4 flex-1 sm:flex-initial shrink-0"
                        onClick={() => {
                          setSelectedSchedule(reservation);
                          setDetailDialogOpen(true);
                        }}
                      >
                        Detay
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
