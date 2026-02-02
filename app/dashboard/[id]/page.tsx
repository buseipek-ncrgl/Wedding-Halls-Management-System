"use client";

import Image from "next/image";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RequestModal } from "@/components/request-modal";
import { getHallById } from "@/lib/api/halls";
import { getSchedulesByHall, updateSchedule, createSchedule, deleteSchedule } from "@/lib/api/schedules";
import { getRequests } from "@/lib/api/requests";
import { getCenterById } from "@/lib/api/centers";
import { getAllUsers } from "@/lib/api/auth";
import type { User } from "@/lib/types";
import { formatDescription } from "@/lib/utils/format-description";
import { useUser } from "@/lib/user-context";
import { isViewer, canManageHalls, canManageSchedules, canAccessCenter } from "@/lib/utils/role";
import type { WeddingHall, Schedule, Request } from "@/lib/types";
import type { Center } from "@/lib/api/centers";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Info,
  MapPin,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Shield,
  Edit,
  Trash2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const daysOfWeek = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const TIME_SLOTS = ["09:00", "10:30", "12:00", "14:00", "15:30", "17:00"];

function todayLocal(date?: Date): string {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getDayOfWeek(dateString: string): number {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  // Pazartesi = 0, Pazar = 6
  return (date.getDay() + 6) % 7;
}

/**
 * Parse "HH:mm" or "HH:mm:ss" to minutes since midnight.
 */
function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function getEventTypeName(eventType?: number): string {
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
}

function formatTimeRange(s: Schedule): string {
  const start = s.startTime.slice(0, 5);
  const end = s.endTime.slice(0, 5);
  return `${start} - ${end}`;
}

export default function HallDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useUser();
  const canEditSchedules = canManageSchedules(user?.role);
  const isSuperAdmin = user?.role === "SuperAdmin";
  const editorDepartment = user?.department; // Editor'ın alanı (0=Nikah, 1=Nişan, 2=Konser, 3=Toplantı, 4=Özel)
  const [hall, setHall] = useState<WeddingHall | null>(null);
  const [center, setCenter] = useState<Center | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]); // Tüm schedule'ları sakla
  const [loading, setLoading] = useState(true);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>("");
  const [scheduleStatus, setScheduleStatus] = useState<"Available" | "Reserved">("Available");
  const [eventType, setEventType] = useState<number | undefined>(undefined);
  const [eventName, setEventName] = useState<string>("");
  const [eventOwner, setEventOwner] = useState<string>("");
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  const load = useCallback(async () => {
    try {
      const [h, s, requests, allUsers] = await Promise.all([
        getHallById(id),
        getSchedulesByHall(id),
        getRequests().catch(() => []), // Request'ler yüklenemezse boş array döndür
        getAllUsers().catch(() => []), // Kullanıcılar yüklenemezse boş array döndür
      ]);
      setHall(h ?? null);
      setUsers(allUsers);
      
      // Merkez bilgisini yükle (erişim kontrolü için)
      if (h?.centerId) {
        try {
          const centerData = await getCenterById(h.centerId);
          setCenter(centerData ?? null);
        } catch (e) {
          console.error("Error loading center:", e);
          setCenter(null);
        }
      }
      const allScheds = s ?? [];
      
      // Request'leri Schedule'larla eşleştir (sadece Answered olanlar)
      const answeredRequests = requests.filter((r: Request) => r.status === "Answered");
      const schedulesWithRequests = allScheds.map((schedule) => {
        if (schedule.status === "Reserved") {
          // Tarih ve saat formatını normalize et
          let reqDate = schedule.date;
          if (reqDate.includes('T')) {
            reqDate = reqDate.split('T')[0];
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
            let scheduleTime = schedule.startTime;
            if (scheduleTime.includes(':')) {
              scheduleTime = scheduleTime.slice(0, 5); // HH:mm
            }
            
            return req.weddingHallId === schedule.weddingHallId &&
                   reqEventDate === reqDate &&
                   reqTime === scheduleTime;
          });
          
          if (matchingRequest) {
            return {
              ...schedule,
              eventName: matchingRequest.eventName,
              eventOwner: matchingRequest.eventOwner,
              eventType: matchingRequest.eventType,
              requestId: matchingRequest.id,
            };
          }
        }
        return schedule;
      });
      
      setAllSchedules(schedulesWithRequests); // Tüm schedule'ları sakla (müsaitlik oranı için)
      
      // Tüm schedule'ları göster (zaman çizelgesi için)
      setSchedules(schedulesWithRequests);
    } catch (e) {
      toast.error(toUserFriendlyMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Saat aralığını hesapla (örn: "09:00" -> "09:00-10:30")
  const getTimeRange = useCallback((startTime: string): { start: string; end: string } => {
    const timeIndex = TIME_SLOTS.indexOf(startTime);
    if (timeIndex === -1 || timeIndex === TIME_SLOTS.length - 1) {
      // Son saat dilimi için varsayılan bitiş saati
      const [hours, minutes] = startTime.split(":").map(Number);
      const endDate = new Date();
      endDate.setHours(hours, minutes + 90, 0, 0); // 1.5 saat ekle
      const endHours = String(endDate.getHours()).padStart(2, "0");
      const endMinutes = String(endDate.getMinutes()).padStart(2, "0");
      return { start: startTime, end: `${endHours}:${endMinutes}` };
    }
    return { start: startTime, end: TIME_SLOTS[timeIndex + 1] };
  }, []);

  // Hall'ın merkezine erişim kontrolü
  const canAccessHallCenter = useCallback((): boolean => {
    if (isSuperAdmin) return true; // SuperAdmin her zaman erişebilir
    if (!canEditSchedules) return false; // Viewer erişemez
    
    // Editor ise: Hall'ın merkezine erişim izni olmalı
    if (!hall || !center) return false;
    
    return canAccessCenter(user?.role, user?.id, center.description);
  }, [isSuperAdmin, canEditSchedules, hall, center, user]);

  // Dialog aç ve seçilen slot bilgilerini ayarla
  const handleCellClick = useCallback((dateString: string, timeSlot: string) => {
    if (!hall) return;
    
    const schedule = getScheduleForSlot(timeSlot, dateString);
    setSelectedSchedule(schedule);
    setSelectedDate(dateString);
    setSelectedTimeSlot(timeSlot);
    
    if (canEditSchedules) {
      // Merkez erişim kontrolü
      if (!canAccessHallCenter()) {
        toast.error("Bu merkeze erişim yetkiniz bulunmamaktadır.");
        // Erişim yoksa sadece detay dialog'unu aç (eğer schedule varsa)
        if (schedule && schedule.status === "Reserved") {
          setDetailDialogOpen(true);
        }
        return;
      }
      // Editor için: Sadece kendi departmanına ait schedule'ları düzenleyebilir
      if (schedule && !isSuperAdmin && editorDepartment !== undefined && editorDepartment !== null) {
        // Schedule'ın eventType'ı Editor'ın department'ı ile eşleşmiyorsa düzenleme izni yok
        if (schedule.eventType !== undefined && schedule.eventType !== editorDepartment) {
          toast.error("Bu rezervasyonu düzenleme yetkiniz bulunmamaktadır. Sadece kendi departmanınıza ait rezervasyonları düzenleyebilirsiniz.");
          // Detay dialog'unu aç
          setDetailDialogOpen(true);
          return;
        }
      }
      // Kendine ait olmayan rezervasyonda sadece detay (takvim sayfasındaki gibi): düzenleme/silme yok
      if (schedule && schedule.status === "Reserved" && !isSuperAdmin && user?.id && schedule.createdByUserId && schedule.createdByUserId !== user.id) {
        setDetailDialogOpen(true);
        return;
      }
      
      // Editor/SuperAdmin için düzenleme dialog'u aç (veya kendi rezervasyonu)
      if (schedule) {
        // Mevcut schedule varsa bilgilerini yükle
        setScheduleStatus(schedule.status);
        setEventType(schedule.eventType);
        setEventName(schedule.eventName || "");
        setEventOwner(schedule.eventOwner || "");
      } else {
        // Yeni schedule için varsayılan değerler
        setScheduleStatus("Available");
        setEventName("");
        setEventOwner("");
        // Editor ise department'ını otomatik ayarla
        if (!isSuperAdmin && editorDepartment !== undefined && editorDepartment !== null) {
          setEventType(editorDepartment);
        } else {
          setEventType(undefined);
        }
      }
      setScheduleDialogOpen(true);
    } else if (schedule && schedule.status === "Reserved") {
      // Viewer için dolu schedule'larda detay dialog'u aç
      setDetailDialogOpen(true);
    }
  }, [canEditSchedules, hall, isSuperAdmin, editorDepartment, canAccessHallCenter, user?.id]);

  // Dialog açıldığında ve "Dolu" seçildiğinde Editor için department'ı otomatik ayarla
  useEffect(() => {
    if (scheduleDialogOpen && scheduleStatus === "Reserved" && !isSuperAdmin && editorDepartment !== undefined && editorDepartment !== null) {
      if (eventType === undefined || eventType === null) {
        setEventType(editorDepartment);
      }
    }
  }, [scheduleDialogOpen, scheduleStatus, isSuperAdmin, editorDepartment, eventType]);

  // Schedule kaydet
  const handleSaveSchedule = useCallback(async () => {
    if (!hall || !selectedDate || !selectedTimeSlot) return;

    const { start, end } = getTimeRange(selectedTimeSlot);

    // Frontend'de çakışma kontrolü (kullanıcıya daha hızlı geri bildirim için)
    const startMinutes = toMinutes(start);
    const endMinutes = toMinutes(end);
    
    const conflictingSchedule = allSchedules.find((s) => {
      if (s.weddingHallId !== hall.id || s.date !== selectedDate || s.id === selectedSchedule?.id) {
        return false;
      }
      const sStartMinutes = toMinutes(s.startTime);
      const sEndMinutes = toMinutes(s.endTime);
      // Çakışma kontrolü: startA < endB && endA > startB
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

    // Dolu schedule'lar için etkinlik bilgileri zorunlu
    if (scheduleStatus === "Reserved") {
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
      // Editor için: Mevcut schedule'ı düzenlerken departman kontrolü yap
      if (selectedSchedule && !isSuperAdmin && editorDepartment !== undefined && editorDepartment !== null) {
        // Schedule'ın eventType'ı Editor'ın department'ı ile eşleşmiyorsa düzenleme izni yok
        if (selectedSchedule.eventType !== undefined && selectedSchedule.eventType !== editorDepartment) {
          toast.error("Bu rezervasyonu düzenleme yetkiniz bulunmamaktadır. Sadece kendi departmanınıza ait rezervasyonları düzenleyebilirsiniz.");
          return;
        }
      }
      
      if (selectedSchedule) {
        // Editor için: Sadece kendi oluşturduğu schedule'ları güncelleyebilir
        // SuperAdmin tüm schedule'ları güncelleyebilir
        if (!isSuperAdmin && selectedSchedule.createdByUserId && user?.id) {
          if (selectedSchedule.createdByUserId !== user.id) {
            // Editor başkasının schedule'ını güncelleyemez
            toast.error("Bu rezervasyonu düzenleme yetkiniz bulunmamaktadır. Sadece kendi oluşturduğunuz rezervasyonları düzenleyebilirsiniz.");
            return;
          }
        }
        
        // Mevcut schedule'ı güncelle
        await updateSchedule(selectedSchedule.id, {
          weddingHallId: hall.id,
          date: selectedDate,
          startTime: start,
          endTime: end,
          status: scheduleStatus,
          eventType: scheduleStatus === "Reserved" ? (isSuperAdmin ? eventType : editorDepartment) : undefined,
          eventName: scheduleStatus === "Reserved" ? eventName : undefined,
          eventOwner: scheduleStatus === "Reserved" ? eventOwner : undefined,
        });
        toast.success("Müsaitlik güncellendi.");
      } else {
        // Yeni schedule oluştur
        await createSchedule({
          weddingHallId: hall.id,
          date: selectedDate,
          startTime: start,
          endTime: end,
          status: scheduleStatus,
          eventType: scheduleStatus === "Reserved" ? (isSuperAdmin ? eventType : editorDepartment) : undefined,
          eventName: scheduleStatus === "Reserved" ? eventName : undefined,
          eventOwner: scheduleStatus === "Reserved" ? eventOwner : undefined,
        });
        toast.success("Müsaitlik kaydı oluşturuldu.");
      }
      
      // Formu temizle
      setScheduleStatus("Available");
      setEventType(undefined);
      setEventName("");
      setEventOwner("");
      setSelectedSchedule(null);
      setScheduleDialogOpen(false);
      
      await load();
    } catch (e: any) {
      // 403 hatası için özel mesaj
      if (e?.status === 403) {
        toast.error("Bu rezervasyonu düzenleme yetkiniz bulunmamaktadır. Sadece kendi departmanınıza ait rezervasyonları düzenleyebilirsiniz.");
      } else {
        toast.error(toUserFriendlyMessage(e));
      }
    }
  }, [hall, selectedDate, selectedTimeSlot, scheduleStatus, eventType, eventName, eventOwner, selectedSchedule, isSuperAdmin, editorDepartment, getTimeRange, load]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!hall) notFound();

  const STANDARD_SLOTS_PER_DAY = TIME_SLOTS.length; // 6 saat dilimi
  
  // Bugünkü schedule'lar için ayrı istatistikler
  const today = todayLocal();
  const todaySchedules = allSchedules.filter((s) => {
    // Tarih formatını normalize et
    let sDate = s.date;
    if (sDate.includes('T')) {
      sDate = sDate.split('T')[0];
    }
    return sDate === today;
  });
  const todayBookedSlots = todaySchedules.filter((s) => s.status === "Reserved").length;
  
  // Bugün için toplam slot sayısı her zaman STANDARD_SLOTS_PER_DAY (6) olmalı
  // Çünkü her gün için 6 saat dilimi var (09:00, 10:30, 12:00, 14:00, 15:30, 17:00)
  // Müsait slot = Toplam slot (6) - Dolu slot
  const todayTotalSlots = STANDARD_SLOTS_PER_DAY;
  const todayAvailableSlots = Math.max(0, todayTotalSlots - todayBookedSlots);
  
  // Müsaitlik oranını hesapla
  // Haftalık görünüm için (7 gün x 6 slot = 42 toplam slot)
  // Schedule olmayan slotlar müsait sayılır
  const weekDaysForStats = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    return todayLocal(date);
  });
  
  let totalSlotsForWeek = 0;
  let availableSlotsForWeek = 0;
  
  weekDaysForStats.forEach((dateStr) => {
    TIME_SLOTS.forEach((timeSlot) => {
      totalSlotsForWeek++;
      const schedule = allSchedules.find(
        (s) => {
          let sDate = s.date;
          if (sDate.includes('T')) {
            sDate = sDate.split('T')[0];
          }
          return sDate === dateStr && s.startTime.startsWith(timeSlot);
        }
      );
      
      // Schedule yoksa veya status "Available" ise müsait sayılır
      if (!schedule || schedule.status === "Available") {
        availableSlotsForWeek++;
      }
    });
  });
  
  // Müsaitlik oranı: (Müsait slot / Toplam slot) * 100
  const availabilityPercentage = totalSlotsForWeek > 0
    ? Math.round((availableSlotsForWeek / totalSlotsForWeek) * 100)
    : 100; // Hiç slot yoksa %100 müsait

  // Haftalık görünüm için günleri oluştur (bugünden itibaren 7 gün)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    return {
      date: todayLocal(date),
      dayOfWeek: getDayOfWeek(todayLocal(date)),
      displayDate: date.getDate(),
      isToday: i === 0,
    };
  });

  // Her saat ve gün için schedule'ı bul
  const getScheduleForSlot = (timeSlot: string, dateString: string): Schedule | undefined => {
    return allSchedules.find(
      (s) => s.date === dateString && s.startTime.startsWith(timeSlot)
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full">
        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <Link href="/dashboard/salonlar">
            <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 md:h-10 md:w-10 bg-transparent shrink-0">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg md:text-2xl font-bold text-foreground truncate">{hall.name}</h1>
            <p className="text-xs sm:text-sm md:text-base text-muted-foreground truncate">{hall.address}</p>
          </div>
        </div>
        {canEditSchedules && (
          <Badge className="gap-1 bg-primary/10 text-primary text-xs shrink-0 self-start sm:self-center">
            <Shield className="h-3 w-3 shrink-0" />
            <span className="hidden sm:inline">Düzenleme Yetkisi</span>
            <span className="sm:hidden">Yetki</span>
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="relative aspect-video overflow-hidden rounded-lg sm:rounded-xl">
            <Image
              src={hall.imageUrl || "/placeholder.svg"}
              alt={hall.name}
              fill
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent" />
            <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 right-2 sm:right-4 flex items-center justify-between gap-2">
              <div className="flex gap-1 sm:gap-2 flex-wrap">
                <Badge className="bg-card/90 text-foreground backdrop-blur-sm text-[10px] sm:text-xs">
                  <Users className="mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                  <span className="whitespace-nowrap">{hall.capacity} Kişi</span>
                </Badge>
                <Badge className="bg-card/90 text-foreground backdrop-blur-sm text-[10px] sm:text-xs">
                  <Clock className="mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0" />
                  <span className="whitespace-nowrap">{todaySchedules.length > 0 ? todaySchedules.length : STANDARD_SLOTS_PER_DAY} Saat</span>
                </Badge>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 sm:space-y-4">
          <Card className="border-border bg-card">
            <CardContent className="p-3 sm:p-4">
              <div className="text-center">
                <div className="mb-2 text-2xl sm:text-3xl md:text-4xl font-bold text-primary">
                  %{availabilityPercentage}
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">Müsaitlik Oranı</p>
              </div>
              <div className="mt-3 sm:mt-4 h-2 sm:h-3 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${availabilityPercentage}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-2.5 sm:p-3 md:p-4 text-center">
                <CheckCircle2 className="mx-auto mb-1.5 sm:mb-2 h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 text-green-600" />
                <div className="text-xl sm:text-2xl font-bold text-green-700">
                  {todayAvailableSlots}
                </div>
                <p className="text-[10px] sm:text-xs text-green-600">Müsait (Bugün)</p>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-2.5 sm:p-3 md:p-4 text-center">
                <XCircle className="mx-auto mb-1.5 sm:mb-2 h-6 w-6 sm:h-7 sm:w-7 md:h-8 md:w-8 text-red-600" />
                <div className="text-xl sm:text-2xl font-bold text-red-700">
                  {todayBookedSlots}
                </div>
                <p className="text-[10px] sm:text-xs text-red-600">Dolu (Bugün)</p>
              </CardContent>
            </Card>
          </div>

          {isViewer(user?.role) && (
            <RequestModal hallId={hall.id} hallName={hall.name} />
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <Card className="border-border bg-card">
          <CardHeader className="px-3 sm:px-6 pb-2 sm:pb-3">
            <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base font-semibold text-foreground">
              <Info className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-primary shrink-0" />
              Salon Bilgileri
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 space-y-2 sm:space-y-3 md:space-y-4">
            <div className="flex items-start gap-2 sm:gap-3">
              <MapPin className="mt-0.5 h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] sm:text-xs md:text-sm font-medium text-muted-foreground">Adres</p>
                <p className="text-xs sm:text-sm md:text-base text-foreground break-words">{hall.address}</p>
              </div>
            </div>
            <div className="flex items-start gap-2 sm:gap-3">
              <Users className="mt-0.5 h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[10px] sm:text-xs md:text-sm font-medium text-muted-foreground">Kapasite</p>
                <p className="text-xs sm:text-sm md:text-base text-foreground">{hall.capacity} Kişi</p>
              </div>
            </div>
            <div className="border-t border-border pt-2 sm:pt-3 md:pt-4">
              <p className="text-[10px] sm:text-xs md:text-sm font-medium text-muted-foreground mb-1.5 sm:mb-2">Açıklama</p>
              <div className="text-[10px] sm:text-xs md:text-sm text-foreground break-words">
                {formatDescription(hall.description, users)}
              </div>
            </div>
          </CardContent>
        </Card>


        <Card className="border-border bg-card lg:col-span-2">
          <CardHeader className="px-3 sm:px-6 pb-2 sm:pb-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base font-semibold text-foreground">
                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-primary shrink-0" />
                <span className="truncate">Müsaitlik Zaman Çizelgesi</span>
              </CardTitle>
              {!canEditSchedules && (
                <Badge variant="outline" className="text-[9px] sm:text-[10px] md:text-xs shrink-0">
                  Sadece Görüntüleme
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-1 sm:px-3 md:px-6">
            <div className="overflow-x-auto -mx-1 sm:-mx-3 md:-mx-6 sm:mx-0 w-full max-w-full">
                <div className="inline-block min-w-full align-middle px-0 max-w-full">
                  <table className="w-full border-collapse min-w-[280px] sm:min-w-[400px] md:min-w-[500px] max-w-full table-fixed">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="sticky left-0 z-10 bg-card border-r border-border px-1 sm:px-2 md:px-3 lg:px-4 py-1 sm:py-1.5 md:py-2 lg:py-3 text-left text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-semibold text-foreground whitespace-nowrap">
                          Saat
                        </th>
                        {weekDays.map((day) => (
                          <th
                            key={day.date}
                            className="px-0.5 sm:px-1 md:px-1.5 lg:px-2 py-1 sm:py-1.5 md:py-2 lg:py-3 text-center text-[8px] sm:text-[9px] md:text-[10px] lg:text-xs xl:text-sm font-semibold text-foreground min-w-[35px] sm:min-w-[40px] md:min-w-[50px] lg:min-w-[65px]"
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
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {TIME_SLOTS.map((timeSlot) => (
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
                        {weekDays.map((day) => {
                          const schedule = getScheduleForSlot(timeSlot, day.date);
                          const isAvailable = schedule ? schedule.status === "Available" : true; // Schedule yoksa varsayılan olarak müsait
                          const eventName = schedule?.eventName;
                          const hasAccess = canEditSchedules ? canAccessHallCenter() : true;
                          
                          return (
                            <td
                              key={day.date}
                              className={cn(
                                "px-0.5 sm:px-1 py-1 sm:py-1.5 md:py-2 text-center",
                                (hasAccess && (canEditSchedules || (!isAvailable && schedule))) && "cursor-pointer hover:bg-muted/30"
                              )}
                              onClick={() => handleCellClick(day.date, timeSlot)}
                            >
                              <div
                                className={cn(
                                  "inline-flex items-center justify-center rounded-lg px-0.5 sm:px-1 md:px-1.5 py-0.5 sm:py-0.5 md:py-1 text-[7px] sm:text-[8px] md:text-[9px] lg:text-[10px] xl:text-xs font-medium transition-colors w-full max-w-full",
                                  isAvailable
                                    ? "bg-green-100 text-green-700 border border-green-200"
                                    : "bg-red-100 text-red-700 border border-red-200"
                                )}
                                title={!isAvailable && schedule ? `${eventName || "Dolu"}` : undefined}
                              >
                                {isAvailable ? (
                                  <>
                                    <span className="hidden lg:inline">Müsait</span>
                                    <span className="lg:hidden">M</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="hidden lg:inline truncate max-w-[28px] sm:max-w-[35px] md:max-w-[45px] lg:max-w-[60px]">{eventName && eventName.length > 6 ? eventName.substring(0, 5) + "..." : eventName || "Dolu"}</span>
                                    <span className="lg:hidden">D</span>
                                  </>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
          </CardContent>
        </Card>
      </div>

      {/* Schedule Düzenleme Dialog'u */}
      {canEditSchedules && (
        <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader className="px-1 sm:px-0">
              <DialogTitle className="text-base sm:text-lg">Müsaitlik Düzenle</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                {selectedDate && selectedTimeSlot && `${selectedDate} tarihinde ${selectedTimeSlot} saatinde müsaitlik durumunu ayarlayın`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2.5 sm:space-y-3 md:space-y-4 py-2 sm:py-4 px-1 sm:px-0">
              {center && hall && (
                <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2">
                  <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{center.name}</span>
                  <span className="text-muted-foreground shrink-0">–</span>
                  <span className="truncate">{hall.name}</span>
                </div>
              )}
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm">Tarih</Label>
                <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
                  {selectedDate}
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
                      if (!isSuperAdmin && editorDepartment !== undefined && editorDepartment !== null) {
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
                className="w-full sm:w-auto h-9 sm:h-10 text-sm"
                onClick={() => {
                  // Formu temizle
                  setScheduleStatus("Available");
                  setEventType(undefined);
                  setEventName("");
                  setEventOwner("");
                  setSelectedSchedule(null);
                  setScheduleDialogOpen(false);
                }}
              >
                İptal
              </Button>
              <Button className="w-full sm:w-auto h-9 sm:h-10 text-sm" onClick={handleSaveSchedule}>
                Kaydet
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Detay Dialog'u (Viewer ve diğerleri için) */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="px-1 sm:px-0">
            <DialogTitle className="text-base sm:text-lg">Rezervasyon Detayları</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {selectedSchedule && (
                <>
                  {selectedSchedule.eventName || "Rezervasyon Detayları"} - {formatTimeRange(selectedSchedule)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedSchedule && (
            <div className="space-y-2.5 sm:space-y-3 md:space-y-4 py-2 sm:py-4 px-1 sm:px-0">
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm font-semibold">Etkinlik Adı</Label>
                <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
                  {selectedSchedule.eventName || "Etkinlik Adı Yok"}
                </div>
              </div>
              {selectedSchedule.eventOwner && (
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm font-semibold">Rezervasyon Yapan</Label>
                  <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
                    {selectedSchedule.eventOwner}
                  </div>
                </div>
              )}
              {selectedSchedule.eventType !== undefined && (
                <div className="space-y-1.5 sm:space-y-2">
                  <Label className="text-xs sm:text-sm font-semibold">Etkinlik Tipi</Label>
                  <div className="rounded-md border border-border bg-muted px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm">
                    {getEventTypeName(selectedSchedule.eventType)}
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
                  {hall?.name || "Salon Adı Yok"}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex flex-col sm:flex-row gap-2 px-1 sm:px-0 pt-2 sm:pt-0 sticky bottom-0 bg-background border-t border-border -mx-6 -mb-6 px-6 pb-4 sm:border-t-0 sm:static sm:mx-0 sm:mb-0 sm:px-0 sm:pb-0">
            {/* Düzenle / Sil sadece kendi rezervasyonunda veya SuperAdmin (takvim sayfasındaki gibi) */}
            {canEditSchedules && selectedSchedule && (isSuperAdmin || selectedSchedule.createdByUserId === user?.id) && (
              <>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto h-9 sm:h-10 text-sm"
                  onClick={() => {
                    if (!selectedSchedule) return;
                    // Düzenleme için mevcut bilgileri yükle
                    setSelectedDate(selectedSchedule.date);
                    setSelectedTimeSlot(selectedSchedule.startTime.slice(0, 5));
                    setScheduleStatus(selectedSchedule.status);
                    setEventType(selectedSchedule.eventType);
                    setEventName(selectedSchedule.eventName || "");
                    setEventOwner(selectedSchedule.eventOwner || "");
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
      {canEditSchedules && (
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
                    {scheduleToDelete.eventName || "Etkinlik Adı Yok"}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                    {hall?.name || "Salon"} • {scheduleToDelete.date} • {formatTimeRange(scheduleToDelete)}
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
                    setAllSchedules((prev) => prev.filter((s) => s.id !== deletedId));
                    setSchedules((prev) => prev.filter((s) => s.id !== deletedId));
                    // Backend'den yeniden yükle
                    await load();
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
      {(() => {
        const today = todayLocal();
        const todayReservations = allSchedules
          .filter((s) => {
            let sDate = s.date;
            if (sDate.includes('T')) {
              sDate = sDate.split('T')[0];
            }
            return sDate === today && s.status === "Reserved";
          })
          .map((s) => ({
            ...s,
            eventName: s.eventName || "Etkinlik Adı Yok",
            eventOwner: s.eventOwner || "Bilinmiyor",
            eventType: s.eventType,
          }))
          .sort((a, b) => a.startTime.localeCompare(b.startTime))
          .slice(0, 5);

        if (todayReservations.length === 0) return null;

        return (
          <Card className="border-border">
            <CardHeader className="px-3 sm:px-6 pb-2 sm:pb-3">
              <CardTitle className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm md:text-base font-semibold">
                <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
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
                      <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-medium text-foreground truncate" title={reservation.eventName}>
                          {reservation.eventName}
                        </p>
                        <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                          {formatTimeRange(reservation)} • {reservation.eventOwner}
                        </p>
                      </div>
                    </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
                    <Badge variant="destructive" className="bg-red-100 text-red-700 border border-red-200 text-[10px] sm:text-xs px-2 sm:px-2.5 py-1 shrink-0 self-start sm:self-center">
                      Dolu
                    </Badge>
                    <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                      {/* Düzenle/Sil sadece kendi rezervasyonunda veya SuperAdmin (takvim gibi) */}
                      {canEditSchedules && (isSuperAdmin || reservation.createdByUserId === user?.id) && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 sm:h-9 text-xs sm:text-sm px-3 sm:px-4 flex-1 sm:flex-initial shrink-0"
                            onClick={() => {
                              setSelectedSchedule(reservation);
                              setSelectedDate(reservation.date);
                              setSelectedTimeSlot(reservation.startTime.slice(0, 5));
                              setScheduleStatus(reservation.status);
                              setEventType(reservation.eventType);
                              setEventName(reservation.eventName || "");
                              setEventOwner(reservation.eventOwner || "");
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
        );
      })()}
    </div>
  );
}
