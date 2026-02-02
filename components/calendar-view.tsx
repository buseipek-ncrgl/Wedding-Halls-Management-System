"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/lib/user-context";
import { isViewer } from "@/lib/utils/role";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { getHalls } from "@/lib/api/halls";
import { getCenters } from "@/lib/api/centers";
import { getSchedulesByHall } from "@/lib/api/schedules";
import { getRequests } from "@/lib/api/requests";
import type { Schedule, WeddingHall, Request } from "@/lib/types";
import type { Center } from "@/lib/api/centers";
import { toUserFriendlyMessage } from "@/lib/utils/api-error";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Users,
  MapPin,
  RefreshCw,
  Building2,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SLOTS = ["09:00", "10:30", "12:00", "14:00", "15:30", "17:00"];
const daysOfWeek = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const monthNames = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function formatDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type ScheduleWithHall = Schedule & { 
  hallName: string;
  eventName?: string;
  eventOwner?: string;
  eventType?: number;
  requestId?: string;
};

export function CalendarView() {
  const router = useRouter();
  const { user } = useUser();
  const [halls, setHalls] = useState<WeddingHall[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [selectedCenterId, setSelectedCenterId] = useState<string>("all");
  const [schedules, setSchedules] = useState<ScheduleWithHall[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [viewMode, setViewMode] = useState<"week" | "day">("day");
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState<ScheduleWithHall | null>(null);

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
      
      // Schedule'ları çek
      const all: ScheduleWithHall[] = [];
      for (const hall of h ?? []) {
        const list = await getSchedulesByHall(hall.id);
        for (const s of list ?? []) {
          // Dolu schedule'lar için Request bilgilerini ekle
          if (s.status === "Reserved") {
            // Schedule'ın kendisinde eventName varsa direkt kullan
            if (s.eventName) {
              all.push({
                ...s,
                hallName: hall.name,
                eventName: s.eventName,
                eventOwner: s.eventOwner,
                eventType: s.eventType,
              });
            } else {
              // Schedule'da eventName yoksa Request'ten eşleştir
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
                
                return req.weddingHallId === s.weddingHallId &&
                       reqEventDate === reqDate &&
                       reqTime === scheduleTime;
              });
              
              if (matchingRequest) {
                all.push({
                  ...s,
                  hallName: hall.name,
                  eventName: matchingRequest.eventName,
                  eventOwner: matchingRequest.eventOwner,
                  eventType: matchingRequest.eventType,
                  requestId: matchingRequest.id,
                });
              } else {
                // Request eşleşmesi yoksa schedule'ı olduğu gibi ekle
                all.push({ ...s, hallName: hall.name });
              }
            }
          } else {
            // Müsait schedule'lar için sadece hallName ekle
            all.push({ ...s, hallName: hall.name });
          }
        }
      }
      
      setSchedules(all);
      setRequests(answeredRequests);
    } catch (e) {
      toast.error(toUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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

  const todayStr = useMemo(() => formatDateString(new Date()), []);
  const selectedStr = selectedDate ? formatDateString(selectedDate) : null;

  // Haftalık görünüm için günleri oluştur (seçilen tarihten itibaren 7 gün)
  const weekDays = useMemo(() => {
    if (!selectedDate) return [];
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(selectedDate);
      date.setDate(date.getDate() + i);
      return {
        date: formatDateString(date),
        displayDate: date.getDate(),
        dayOfWeek: (date.getDay() + 6) % 7, // Pazartesi = 0
        isToday: formatDateString(date) === todayStr,
      };
    });
  }, [selectedDate, todayStr]);

  const schedulesForDate = useMemo(() => {
    if (!selectedStr) return [];
    return schedules.filter((s) => {
      // Tarih formatını normalize et
      let sDate = s.date;
      if (sDate.includes('T')) {
        sDate = sDate.split('T')[0];
      }
      return sDate === selectedStr;
    });
  }, [schedules, selectedStr]);

  const schedulesToday = useMemo(() => {
    return schedules.filter((s) => {
      // Tarih formatını normalize et
      let sDate = s.date;
      if (sDate.includes('T')) {
        sDate = sDate.split('T')[0];
      }
      return sDate === todayStr && s.status === "Reserved";
    });
  }, [schedules, todayStr]);

  // Bugünkü rezervasyon sayısı (sadece Reserved olanlar)
  const todayReserved = useMemo(
    () => schedulesToday.filter((s) => s.status === "Reserved").length,
    [schedulesToday]
  );

  // Müsait saat sayısı: Tüm salonlar × Tüm saatler - Reserved olanlar
  // Schedule yoksa varsayılan olarak müsait kabul et
  const todayAvailable = useMemo(() => {
    if (halls.length === 0) return 0;
    
    // Tüm salonlar için tüm saatler = toplam slot sayısı
    const totalSlots = halls.length * SLOTS.length;
    
    // Bugünkü Reserved schedule sayısı
    const reservedCount = schedulesToday.filter((s) => s.status === "Reserved").length;
    
    // Müsait saat = Toplam slot - Reserved
    return Math.max(0, totalSlots - reservedCount);
  }, [halls, schedulesToday]);

  // Toplam kapasite (filtrelenmiş salonlar için)
  const totalCapacity = useMemo(() => {
    if (!filteredHalls || filteredHalls.length === 0) return 0;
    return filteredHalls.reduce((acc, h) => acc + (h.capacity || 0), 0);
  }, [filteredHalls]);

  const getSlotStatus = useCallback(
    (hallId: string, slotTime: string, dateStr?: string): { status: "available" | "booked"; eventName?: string } => {
      // Hafta görünümü için tarih parametresi kullan
      const targetDate = dateStr || selectedStr;
      if (!targetDate) {
        return { status: "available" };
      }
      
      // Tarih formatını normalize et
      const schedulesForTargetDate = schedules.filter((s) => {
        let sDate = s.date;
        if (sDate.includes('T')) {
          sDate = sDate.split('T')[0];
        }
        return sDate === targetDate;
      });
      
      if (!schedulesForTargetDate || schedulesForTargetDate.length === 0) {
        return { status: "available" }; // Schedule yoksa varsayılan olarak müsait
      }
      
      const s = schedulesForTargetDate.find(
        (x) => {
          // Saat formatını normalize et
          let sTime = x.startTime;
          if (sTime.includes(':')) {
            sTime = sTime.slice(0, 5); // HH:mm
          }
          return x.weddingHallId === hallId && sTime === slotTime;
        }
      );
      if (!s) return { status: "available" }; // Schedule yoksa varsayılan olarak müsait
      const scheduleWithHall = s as ScheduleWithHall;
      return {
        status: s.status === "Reserved" ? "booked" : "available",
        eventName: scheduleWithHall.eventName || s.eventName
      };
    },
    [schedules, selectedStr]
  );

  // Her merkez için doluluk istatistikleri
  const centerStats = useMemo(() => {
    return hallsByCenter.map(({ center, halls: centerHalls }) => {
      const centerHallIds = centerHalls.map((h) => h.id);
      const centerSchedules = schedulesToday.filter((s) =>
        centerHallIds.includes(s.weddingHallId)
      );
      const totalSlots = centerHalls.length * SLOTS.length;
      const reservedSlots = centerSchedules.filter((s) => s.status === "Reserved").length;
      const availableSlots = totalSlots - reservedSlots;
      const occupancyPercent = totalSlots > 0 ? Math.round((reservedSlots / totalSlots) * 100) : 0;
      
      return {
        center,
        totalSlots,
        reservedSlots,
        availableSlots,
        occupancyPercent,
        halls: centerHalls,
      };
    });
  }, [hallsByCenter, schedulesToday]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;
    const days: Date[] = [];
    for (let i = startDay - 1; i >= 0; i--) {
      days.push(new Date(year, month, -i));
    }
    const lastDay = new Date(year, month + 1, 0);
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push(new Date(year, month + 1, i));
    }
    return days;
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1)
    );
  };

  const isToday = (date: Date) => {
    const t = new Date();
    return (
      date.getDate() === t.getDate() &&
      date.getMonth() === t.getMonth() &&
      date.getFullYear() === t.getFullYear()
    );
  };

  const isSelected = (date: Date) => {
    if (!selectedDate) return false;
    return (
      date.getDate() === selectedDate.getDate() &&
      date.getMonth() === selectedDate.getMonth() &&
      date.getFullYear() === selectedDate.getFullYear()
    );
  };

  const isCurrentMonth = (date: Date) =>
    date.getMonth() === currentDate.getMonth();

  const days = getDaysInMonth(currentDate);

  const todayReservations = useMemo(
    () => {
      if (!schedulesToday || schedulesToday.length === 0) return [];
      return schedulesToday
        .map((s) => {
          const scheduleWithHall = s as ScheduleWithHall;
          return {
            ...s,
            eventName: scheduleWithHall.eventName,
            eventOwner: scheduleWithHall.eventOwner,
            eventType: scheduleWithHall.eventType,
          };
        })
        .filter((s) => s.eventName) // Sadece eventName'i olanları göster
        .sort((a, b) => a.startTime.localeCompare(b.startTime))
        .slice(0, 5);
    },
    [schedulesToday]
  );

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

  function formatTimeRange(s: Schedule): string {
    const start = s.startTime.slice(0, 5);
    const end = s.endTime.slice(0, 5);
    return `${start} - ${end}`;
  }

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
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-start sm:self-center shrink-0"
          onClick={() => refresh()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Yenile
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border bg-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                <CalendarIcon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-foreground">
                  {todayReserved ?? 0}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                  Bugünkü Rezervasyon
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-green-500/10 shrink-0">
                <CalendarIcon className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-foreground">
                  {todayAvailable ?? 0}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">Müsait Saat</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-secondary shrink-0">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-foreground">
                  {totalCapacity ?? 0}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">Toplam Kapasite</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-accent/10 shrink-0">
                <MapPin className="h-5 w-5 sm:h-6 sm:w-6 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold text-foreground">
                  {filteredHalls?.length ?? 0}
                </p>
                <p className="text-xs sm:text-sm text-muted-foreground">Aktif Salon</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Merkez Filtresi */}
      {centers.length > 0 && (
        <Card className="border-border bg-card">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <Filter className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <Label htmlFor="center-filter" className="text-xs sm:text-sm font-medium text-muted-foreground mb-1 block">
                  Merkez Filtresi
                </Label>
                <Select value={selectedCenterId} onValueChange={setSelectedCenterId}>
                  <SelectTrigger id="center-filter" className="w-full">
                    <SelectValue placeholder="Tüm merkezler" />
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

      {/* Merkez Doluluk İstatistikleri */}
      {selectedCenterId === "all" && centerStats.length > 0 && (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {centerStats.map((stat) => (
            <Card key={stat.center.id} className="border-border bg-card">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                    <h3 className="text-sm sm:text-base font-semibold text-foreground truncate" title={stat.center.name}>
                      {stat.center.name}
                    </h3>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg border border-border/50 bg-background/50 p-2">
                    <div className="text-lg sm:text-xl font-bold text-green-600">{stat.availableSlots}</div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground">Müsait</div>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-background/50 p-2">
                    <div className="text-lg sm:text-xl font-bold text-red-600">{stat.reservedSlots}</div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground">Dolu</div>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-t border-border">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Doluluk:</span>
                    <span className="font-semibold text-foreground">%{stat.occupancyPercent}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${stat.occupancyPercent}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3 w-full">
        {/* Mini Calendar */}
        <Card className="border-border bg-card w-full">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-foreground">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </CardTitle>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => navigateMonth(-1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => navigateMonth(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1">
              {daysOfWeek.map((day) => (
                <div
                  key={day}
                  className="py-2 text-center text-xs font-medium text-muted-foreground"
                >
                  {day}
                </div>
              ))}
              {days.map((day, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "aspect-square rounded-lg p-1 text-sm transition-colors hover:bg-muted",
                    !isCurrentMonth(day) && "text-muted-foreground/50",
                    isToday(day) &&
                      "bg-primary text-primary-foreground hover:bg-primary/90",
                    isSelected(day) &&
                      !isToday(day) &&
                      "bg-secondary text-primary",
                    "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  )}
                >
                  {day.getDate()}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="mt-2 sm:mt-4 w-full bg-transparent text-[10px] sm:text-xs h-7 sm:h-8"
              onClick={() => {
                setSelectedDate(new Date());
                setCurrentDate(new Date());
              }}
            >
              Bugüne Git
            </Button>
            <div className="mt-2 sm:mt-4 space-y-1 sm:space-y-2">
              <p className="text-[10px] sm:text-xs font-medium text-muted-foreground">
                Renk Kodları
              </p>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                <div className="flex items-center gap-1 sm:gap-2">
                  <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-green-500 shrink-0" />
                  <span className="text-[10px] sm:text-xs text-muted-foreground">Müsait</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <div className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-red-500 shrink-0" />
                  <span className="text-[10px] sm:text-xs text-muted-foreground">Dolu</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Schedule Grid */}
        <Card className="border-border bg-card lg:col-span-2 w-full max-w-full overflow-hidden">
          <CardHeader className="pb-2 px-2 sm:px-3 md:px-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 sm:gap-2">
              <CardTitle className="text-xs sm:text-sm md:text-base font-semibold text-foreground truncate min-w-0 flex-1">
                {viewMode === "week" && selectedDate ? (
                  `Hafta - ${selectedDate.getDate()} ${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`
                ) : selectedDate ? (
                  `${selectedDate.getDate()} ${monthNames[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`
                ) : (
                  "Tarih Seçin"
                )}
              </CardTitle>
              <div className="flex gap-0.5 sm:gap-1 md:gap-2 shrink-0">
                <Button
                  variant={viewMode === "day" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 sm:h-7 md:h-8 text-[10px] sm:text-xs px-1.5 sm:px-2 md:px-3"
                  onClick={() => setViewMode("day")}
                >
                  Gün
                </Button>
                <Button
                  variant={viewMode === "week" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 sm:h-7 md:h-8 text-[10px] sm:text-xs px-1.5 sm:px-2 md:px-3"
                  onClick={() => setViewMode("week")}
                >
                  Hafta
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-1 sm:px-3 md:px-6">
            <div className="overflow-x-auto -mx-1 sm:-mx-3 md:-mx-6 sm:mx-0 w-full max-w-full">
              <div className="inline-block min-w-full align-middle px-0 max-w-full">
                <table className="w-full min-w-[300px] sm:min-w-[400px] md:min-w-[500px] max-w-full table-fixed">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-card p-0.5 sm:p-1 md:p-1.5 lg:p-2 text-left text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs font-medium text-muted-foreground min-w-[70px] sm:min-w-[80px] md:min-w-[95px] lg:min-w-[130px] w-[70px] sm:w-[80px] md:w-[95px] lg:w-[130px] whitespace-nowrap border-r border-border">
                        Salon
                      </th>
                      {viewMode === "week" && weekDays.length > 0 ? (
                        // Hafta görünümü: Günler sütunları
                        weekDays.map((day) => (
                          <th
                            key={day.date}
                            className="p-0.5 sm:p-1 md:p-1.5 text-center text-[7px] sm:text-[8px] md:text-[9px] lg:text-xs font-medium text-muted-foreground min-w-[35px] sm:min-w-[40px] md:min-w-[50px] lg:min-w-[65px]"
                          >
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={cn(
                                "text-[8px] sm:text-[9px] md:text-[10px] font-medium",
                                day.isToday && "text-primary font-bold"
                              )}>
                                {daysOfWeek[day.dayOfWeek]}
                              </span>
                              <span className={cn(
                                "text-[8px] sm:text-[9px] md:text-[10px] text-muted-foreground",
                                day.isToday && "text-primary font-bold"
                              )}>
                                {day.displayDate}
                              </span>
                            </div>
                          </th>
                        ))
                      ) : (
                        // Gün görünümü: Saatler sütunları
                        SLOTS.map((slot) => (
                          <th
                            key={slot}
                            className="p-0.5 sm:p-1 md:p-1.5 lg:p-2 text-center text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs font-medium text-muted-foreground min-w-[38px] sm:min-w-[42px] md:min-w-[50px] lg:min-w-[60px]"
                          >
                            {slot}
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCenterId === "all" ? (
                      // Tüm merkezler seçiliyse, merkezlere göre grupla
                      hallsByCenter.map(({ center, halls: centerHalls }) => (
                        <Fragment key={`center-group-${center.id}`}>
                          {/* Merkez başlık satırı */}
                          <tr className="border-t-2 border-primary bg-primary/5">
                            <td colSpan={viewMode === "week" ? weekDays.length + 1 : SLOTS.length + 1} className="p-1 sm:p-1.5 md:p-2 lg:p-3">
                              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-1.5 md:gap-2 min-w-0">
                                <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1">
                                  <Building2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 text-primary shrink-0" />
                                  <span className="text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-semibold text-foreground break-words min-w-0 flex-1 leading-tight line-clamp-2" title={center.name}>{center.name}</span>
                                </div>
                                <Badge variant="secondary" className="sm:ml-auto shrink-0 text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs px-1 sm:px-1.5 md:px-2 whitespace-nowrap self-start sm:self-center">
                                  {centerHalls.length} Sa
                                </Badge>
                              </div>
                            </td>
                          </tr>
                          {/* Bu merkeze ait salonlar */}
                          {centerHalls.map((hall) => (
                            <tr key={hall.id} className="border-t border-border">
                              <td className="sticky left-0 z-10 bg-card p-0.5 sm:p-1 md:p-1.5 lg:p-2 min-w-[70px] sm:min-w-[80px] md:min-w-[95px] lg:min-w-[130px] w-[70px] sm:w-[80px] md:w-[95px] lg:w-[130px] border-r border-border">
                                <button
                                  type="button"
                                  onClick={() => router.push(`/dashboard/${hall.id}`)}
                                  className="text-left text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs xl:text-sm font-medium text-foreground hover:text-primary break-words w-full line-clamp-2 leading-tight"
                                  title={hall.name}
                                >
                                  {hall.name}
                                </button>
                              </td>
                              {viewMode === "week" && weekDays.length > 0 ? (
                                // Hafta görünümü: Her gün için saatler
                                weekDays.map((day) => (
                                  <td key={day.date} className="p-0.5 sm:p-1 md:p-1.5 align-top">
                                    <div className="space-y-0.5 sm:space-y-1">
                                      {SLOTS.map((slot) => {
                                        const slotInfo = getSlotStatus(hall.id, slot, day.date);
                                        const isBooked = slotInfo.status === "booked";
                                        return (
                                          <div
                                            key={slot}
                                            className={cn(
                                              "flex items-center justify-center rounded-md px-0.5 py-0.5 text-[6px] sm:text-[7px] md:text-[8px] font-medium transition-colors w-full min-h-[12px] sm:min-h-[14px] md:min-h-[16px]",
                                              !isBooked &&
                                                "bg-green-100 text-green-700",
                                              isBooked &&
                                                "bg-red-100 text-red-700"
                                            )}
                                            title={
                                              !isBooked
                                                ? "Müsait"
                                                : slotInfo.eventName 
                                                  ? `${slotInfo.eventName} - Dolu`
                                                  : "Dolu"
                                            }
                                          >
                                            {isBooked && slotInfo.eventName ? (
                                              <span className="truncate max-w-[28px] sm:max-w-[35px] md:max-w-[45px]">
                                                {slotInfo.eventName.length > 2
                                                  ? slotInfo.eventName.substring(0, 1) + "..."
                                                  : slotInfo.eventName}
                                              </span>
                                            ) : isBooked ? (
                                              <span className="opacity-70 text-[6px] sm:text-[7px] md:text-[8px]">D</span>
                                            ) : (
                                              <span className="opacity-50 text-[6px] sm:text-[7px] md:text-[8px]">M</span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </td>
                                ))
                              ) : (
                                // Gün görünümü: Seçilen gün için saatler
                                selectedStr && SLOTS.map((slot) => {
                                  const slotInfo = getSlotStatus(hall.id, slot, selectedStr);
                                  const isBooked = slotInfo.status === "booked";
                                  return (
                                    <td key={slot} className="p-0.5 sm:p-1 text-center align-top">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          !isBooked &&
                                          router.push(`/dashboard/${hall.id}`)
                                        }
                                        className={cn(
                                          "mx-auto flex min-h-[22px] sm:min-h-[26px] md:min-h-[30px] lg:min-h-[38px] w-full max-w-[36px] sm:max-w-[40px] md:max-w-[48px] lg:max-w-[58px] items-center justify-center rounded-md px-0.5 sm:px-1 md:px-1.5 py-0.5 sm:py-1 md:py-1.5 text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] font-medium leading-tight transition-colors",
                                          !isBooked &&
                                            "bg-green-100 hover:bg-green-200 cursor-pointer",
                                          isBooked &&
                                            "bg-red-100 cursor-not-allowed text-red-800 hover:bg-red-200"
                                        )}
                                        title={
                                          !isBooked
                                            ? "Müsait — Detay için tıklayın"
                                            : slotInfo.eventName 
                                              ? `${slotInfo.eventName} - Dolu`
                                              : "Dolu"
                                        }
                                      >
                                        {isBooked ? (
                                          slotInfo.eventName ? (
                                            <span className="line-clamp-2 break-words text-center w-full">
                                              <span className="hidden lg:inline">
                                                {slotInfo.eventName.length > 7
                                                  ? slotInfo.eventName.substring(0, 5) + "..."
                                                  : slotInfo.eventName}
                                              </span>
                                              <span className="lg:hidden text-[7px] sm:text-[8px] leading-tight truncate">
                                                {slotInfo.eventName.length > 3
                                                  ? slotInfo.eventName.substring(0, 2) + "..."
                                                  : slotInfo.eventName}
                                              </span>
                                            </span>
                                          ) : (
                                            <span className="text-[7px] sm:text-[8px] opacity-70">D</span>
                                          )
                                        ) : (
                                          <span className="text-[7px] sm:text-[8px] text-green-700 opacity-50">M</span>
                                        )}
                                      </button>
                                    </td>
                                  );
                                })
                              )}
                            </tr>
                          ))}
                        </Fragment>
                      ))
                    ) : (
                      // Belirli bir merkez seçiliyse, sadece o merkezin salonlarını göster
                      filteredHalls.map((hall) => (
                        <tr key={hall.id} className="border-t border-border">
                          <td className="sticky left-0 z-10 bg-card p-0.5 sm:p-1 md:p-1.5 lg:p-2 min-w-[70px] sm:min-w-[80px] md:min-w-[95px] lg:min-w-[130px] w-[70px] sm:w-[80px] md:w-[95px] lg:w-[130px] border-r border-border">
                            <button
                              type="button"
                              onClick={() => router.push(`/dashboard/${hall.id}`)}
                              className="text-left text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs xl:text-sm font-medium text-foreground hover:text-primary break-words w-full line-clamp-2 leading-tight"
                              title={hall.name}
                            >
                              {hall.name}
                            </button>
                          </td>
                          {viewMode === "week" && weekDays.length > 0 ? (
                                // Hafta görünümü: Her gün için saatler
                                weekDays.map((day) => (
                                  <td key={day.date} className="p-0.5 sm:p-1 md:p-1.5 align-top">
                                    <div className="space-y-0.5 sm:space-y-1">
                                      {SLOTS.map((slot) => {
                                        const slotInfo = getSlotStatus(hall.id, slot, day.date);
                                        const isBooked = slotInfo.status === "booked";
                                        return (
                                          <div
                                            key={slot}
                                            className={cn(
                                              "flex items-center justify-center rounded-md px-0.5 py-0.5 text-[6px] sm:text-[7px] md:text-[8px] font-medium transition-colors w-full min-h-[12px] sm:min-h-[14px] md:min-h-[16px]",
                                              !isBooked &&
                                                "bg-green-100 text-green-700",
                                              isBooked &&
                                                "bg-red-100 text-red-700"
                                            )}
                                            title={
                                              !isBooked
                                                ? "Müsait"
                                                : slotInfo.eventName 
                                                  ? `${slotInfo.eventName} - Dolu`
                                                  : "Dolu"
                                            }
                                          >
                                            {isBooked && slotInfo.eventName ? (
                                              <span className="truncate max-w-[28px] sm:max-w-[35px] md:max-w-[45px]">
                                                {slotInfo.eventName.length > 2
                                                  ? slotInfo.eventName.substring(0, 1) + "..."
                                                  : slotInfo.eventName}
                                              </span>
                                            ) : isBooked ? (
                                              <span className="opacity-70 text-[6px] sm:text-[7px] md:text-[8px]">D</span>
                                            ) : (
                                              <span className="opacity-50 text-[6px] sm:text-[7px] md:text-[8px]">M</span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </td>
                                ))
                          ) : (
                            // Gün görünümü: Seçilen gün için saatler
                            selectedStr && SLOTS.map((slot) => {
                              const slotInfo = getSlotStatus(hall.id, slot, selectedStr);
                              const isBooked = slotInfo.status === "booked";
                              return (
                                <td key={slot} className="p-0.5 sm:p-1 text-center align-top">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      !isBooked &&
                                      router.push(`/dashboard/${hall.id}`)
                                    }
                                    className={cn(
                                      "mx-auto flex min-h-[22px] sm:min-h-[26px] md:min-h-[30px] lg:min-h-[38px] w-full max-w-[36px] sm:max-w-[40px] md:max-w-[48px] lg:max-w-[58px] items-center justify-center rounded-md px-0.5 sm:px-1 md:px-1.5 py-0.5 sm:py-1 md:py-1.5 text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] font-medium leading-tight transition-colors",
                                      !isBooked &&
                                        "bg-green-100 hover:bg-green-200 cursor-pointer",
                                      isBooked &&
                                        "bg-red-100 cursor-not-allowed text-red-800 hover:bg-red-200"
                                    )}
                                    title={
                                      !isBooked
                                        ? "Müsait — Detay için tıklayın"
                                        : slotInfo.eventName 
                                          ? `${slotInfo.eventName} - Dolu`
                                          : "Dolu"
                                    }
                                  >
                                    {isBooked ? (
                                      slotInfo.eventName ? (
                                        <span className="line-clamp-2 break-words text-center w-full">
                                          <span className="hidden lg:inline">
                                            {slotInfo.eventName.length > 7
                                              ? slotInfo.eventName.substring(0, 5) + "..."
                                              : slotInfo.eventName}
                                          </span>
                                          <span className="lg:hidden text-[7px] sm:text-[8px] leading-tight truncate">
                                            {slotInfo.eventName.length > 3
                                              ? slotInfo.eventName.substring(0, 2) + "..."
                                              : slotInfo.eventName}
                                          </span>
                                        </span>
                                      ) : (
                                        <span className="text-[7px] sm:text-[8px] opacity-70">D</span>
                                      )
                                    ) : (
                                      <span className="text-[7px] sm:text-[8px] text-green-700 opacity-50">M</span>
                                    )}
                                  </button>
                                </td>
                              );
                            })
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Today's Reservations */}
      <Card className="border-border bg-card">
        <CardHeader className="px-3 sm:px-6 pb-2 sm:pb-3">
          <CardTitle className="text-sm sm:text-base font-semibold text-foreground">
            Bugünkü Rezervasyonlar
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <div className="space-y-2 sm:space-y-3">
            {todayReservations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/30 py-6 sm:py-8 text-center">
                <CalendarIcon className="mx-auto h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground/50" />
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
                  Bugün için rezervasyon yok
                </p>
              </div>
            ) : (
              todayReservations.map((r, index) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 rounded-lg border border-border bg-muted/50 p-2 sm:p-3"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-red-100 shrink-0">
                      <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-medium text-foreground truncate" title={(r as ScheduleWithHall).eventName}>
                        {(r as ScheduleWithHall).eventName}
                      </p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                        {formatTimeRange(r)} • {r.hallName}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
                    <Badge
                      variant="secondary"
                      className="bg-red-100 text-red-700 text-[10px] sm:text-xs px-2 sm:px-2.5 py-1 shrink-0 self-start sm:self-center"
                    >
                      Dolu
                    </Badge>
                    {!isViewer(user?.role) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 sm:h-9 text-xs sm:text-sm px-3 sm:px-4 w-full sm:w-auto shrink-0"
                        onClick={() => {
                          setSelectedReservation(r as ScheduleWithHall);
                          setDetailDialogOpen(true);
                        }}
                      >
                        Detay
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detay Dialog'u */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rezervasyon Detayları</DialogTitle>
            <DialogDescription>
              {selectedReservation && (
                <>
                  {selectedReservation.eventName || "Rezervasyon Detayları"} - {formatTimeRange(selectedReservation)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedReservation && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Etkinlik Adı</Label>
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                  {selectedReservation.eventName || "Etkinlik Adı Yok"}
                </div>
              </div>
              {selectedReservation.eventOwner && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Rezervasyon Yapan</Label>
                  <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                    {selectedReservation.eventOwner}
                  </div>
                </div>
              )}
              {selectedReservation.eventType !== undefined && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Etkinlik Tipi</Label>
                  <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                    {getEventTypeName(selectedReservation.eventType)}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Tarih</Label>
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                  {selectedReservation.date.split('T')[0]}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Saat Aralığı</Label>
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                  {formatTimeRange(selectedReservation)}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Salon</Label>
                <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm">
                  {selectedReservation.hallName}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Kapat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
