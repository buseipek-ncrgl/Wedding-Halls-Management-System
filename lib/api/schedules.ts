import { fetchApi } from "./base";
import type { Schedule } from "@/lib/types";

const HALLS = "/api/v1/halls";
const SCHEDULES = "/api/v1/schedules";

type ScheduleDto = {
  id: string;
  weddingHallId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: number;
  createdByUserId?: string;
  eventType?: number;
  eventName?: string;
  eventOwner?: string;
};

function normalizeTimeOnly(value: string): string {
  const t = (value ?? "").trim();
  if (!t) return "00:00:00";
  if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  // Fallback: API'ye en azindan parse edilebilir bir format gonder.
  return t.length >= 8 ? t.slice(0, 8) : `${t}:00`;
}

function toSchedule(d: ScheduleDto): Schedule {
  return {
    id: d.id,
    weddingHallId: d.weddingHallId,
    date: d.date,
    startTime: d.startTime,
    endTime: d.endTime,
    status: d.status === 1 ? "Reserved" : "Available",
    createdByUserId: d.createdByUserId,
    eventType: d.eventType,
    eventName: d.eventName,
    eventOwner: d.eventOwner,
  };
}

export type UpdateScheduleData = {
  weddingHallId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "Available" | "Reserved";
  eventType?: number;
  eventName?: string;
  eventOwner?: string;
};

export async function getSchedulesByHall(hallId: string): Promise<Schedule[]> {
  const list = await fetchApi<ScheduleDto[]>(`${HALLS}/${hallId}/schedules`);
  return (list ?? []).map(toSchedule);
}

export async function createSchedule(data: UpdateScheduleData): Promise<Schedule> {
  const body: any = {
    weddingHallId: data.weddingHallId,
    date: data.date,
    startTime: normalizeTimeOnly(data.startTime),
    endTime: normalizeTimeOnly(data.endTime),
    status: data.status === "Available" ? 0 : 1,
  };
  
  // Sadece Reserved durumunda event bilgilerini ekle
  if (data.status === "Reserved") {
    if (data.eventType !== undefined && data.eventType !== null) {
      body.eventType = data.eventType;
    }
    if (data.eventName) {
      body.eventName = data.eventName;
    }
    if (data.eventOwner) {
      body.eventOwner = data.eventOwner;
    }
  }
  
  console.log("createSchedule - Request body:", JSON.stringify(body, null, 2));
  
  const d = await fetchApi<ScheduleDto>(SCHEDULES, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return toSchedule(d);
}

export async function updateSchedule(id: string, data: UpdateScheduleData): Promise<Schedule> {
  const body = {
    weddingHallId: data.weddingHallId,
    date: data.date,
    startTime: normalizeTimeOnly(data.startTime),
    endTime: normalizeTimeOnly(data.endTime),
    status: data.status === "Available" ? 0 : 1,
    eventType: data.eventType,
    eventName: data.eventName,
    eventOwner: data.eventOwner,
  };
  const d = await fetchApi<ScheduleDto>(`${SCHEDULES}/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return toSchedule(d);
}

export async function deleteSchedule(id: string): Promise<void> {
  await fetchApi<void>(`${SCHEDULES}/${id}`, {
    method: "DELETE",
  });
}
