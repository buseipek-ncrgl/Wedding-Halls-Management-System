/** Backend-aligned: SuperAdmin/Admin = full access, Editor = limited admin, Viewer = read-only, MerkezSorumlusu = center view-only */
export type UserRole = "SuperAdmin" | "Admin" | "Editor" | "Viewer" | "MerkezSorumlusu";

/**
 * Backend WeddingHallDto. availability is mock-only (calendar-view); API uses Schedule[].
 */
export interface WeddingHall {
  id: string;
  centerId: string; // Merkez ID'si
  name: string;
  address: string;
  capacity: number;
  description: string;
  imageUrl: string;
  technicalDetails: string;
  /** Mock only. API halls use getSchedulesByHall. */
  availability?: Array<{ id: string; timeRange: string; status: "available" | "booked" }>;
}

/**
 * Backend ScheduleDto. date/startTime/endTime as strings (ISO date, HH:mm).
 * status: Available | Reserved (enum 0|1).
 */
export interface Schedule {
  id: string;
  weddingHallId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "Available" | "Reserved";
  createdByUserId?: string;
  eventType?: number;
  // Etkinlik bilgileri (Dolu schedule'lar için)
  eventName?: string;
  eventOwner?: string;
  // Request bilgileri (eğer Request'ten oluşturulduysa)
  requestId?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  phone?: string;
  /// <summary>
  /// Editor'lar için alan/departman (Nikah=0, Nişan=1, Konser=2, Toplantı=3, Özel=4). SuperAdmin ve Viewer için null.
  /// </summary>
  department?: number;
}

/** Mesajlar page – mock only; no Messages API */
export interface Message {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  userDepartment?: number; // Editor'lar için departman bilgisi
  content: string;
  timestamp: Date;
  channel: "general" | "duyurular";
}

/**
 * Backend RequestDto. status: Pending | Answered (enum 0|1).
 * eventType: 0=Nikah, 1=Nisan, 2=Konser, 3=Toplanti, 4=Ozel
 * hallName joined client-side from halls for display; not in DTO.
 */
export interface Request {
  id: string;
  weddingHallId: string;
  createdByUserId: string;
  message: string;
  status: "Pending" | "Answered" | "Rejected";
  createdAt: string;
  hallName: string;
  eventType: number;
  eventName: string;
  eventOwner: string;
  eventDate: string;
  eventTime: string;
}

/** Mesajlar – mock only; no API */
export interface RequestResponse {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  content: string;
  timestamp: Date;
}

/** Takvim: Schedules displayed as calendar slots. No Events API. */
export type EventType = "nikah" | "nisan" | "konser" | "toplanti" | "ozel";

export interface Event {
  id: string;
  title: string;
  type: EventType;
  hallId: string;
  hallName: string;
  date: string;
  timeSlot: string;
  description?: string;
  guestCount?: number;
  contactName?: string;
  contactPhone?: string;
  createdBy: string;
  createdAt: Date;
}
