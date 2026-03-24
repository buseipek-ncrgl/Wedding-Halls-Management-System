import { weddingHalls } from "@/lib/data";
import { getHalls } from "@/lib/api/halls";
import { getCenters } from "@/lib/api/centers";
import type { Center } from "@/lib/api/centers";
import type { WeddingHall } from "@/lib/types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const BUILD_EMAIL = process.env.API_BUILD_EMAIL ?? process.env.BUILD_EMAIL ?? "";
const BUILD_PASSWORD = process.env.API_BUILD_PASSWORD ?? process.env.BUILD_PASSWORD ?? "";

async function loginForBuild(): Promise<string | null> {
  if (!API_BASE_URL || !BUILD_EMAIL || !BUILD_PASSWORD) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: BUILD_EMAIL, password: BUILD_PASSWORD }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
}

async function fetchCentersWithAuth(token: string): Promise<Center[] | null> {
  if (!API_BASE_URL || !token) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/centers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Center[];
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

type HallsListResponse =
  | WeddingHall[]
  | {
      items?: WeddingHall[];
      Items?: WeddingHall[];
      totalCount?: number;
      TotalCount?: number;
    };

function toHallsArray(data: HallsListResponse): WeddingHall[] {
  if (Array.isArray(data)) return data;
  return data.Items ?? data.items ?? [];
}

async function fetchHallsWithAuth(token: string): Promise<WeddingHall[] | null> {
  if (!API_BASE_URL || !token) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/api/v1/halls?page=1&pageSize=1000`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as HallsListResponse;
    return toHallsArray(data);
  } catch {
    return null;
  }
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .map((v) => (v == null ? undefined : String(v)))
        .filter((v): v is string => Boolean(v) && v.trim().length > 0),
    ),
  );
}

/**
 * next export için dinamik route parametrelerini üretir.
 * Not: Backend'e erişilemezse veya auth gerektirirse, mock data'dan türetilen fallback id'ler döner.
 */
export async function getHallIdsForExport(): Promise<string[]> {
  try {
    const halls = await getHalls();
    const ids = uniqueStrings(halls.map((h) => h.id));
    if (ids.length > 0) return ids;
  } catch {
    // ignore - fallback below
  }

  // Halls endpoint auth gerektiriyorsa build-time service account ile dene.
  try {
    const token = await loginForBuild();
    if (token) {
      const hallsAuth = await fetchHallsWithAuth(token);
      const ids = uniqueStrings(hallsAuth?.map((h) => h.id));
      if (ids.length > 0) return ids;
    }
  } catch {
    // ignore - fallback below
  }

  return uniqueStrings(weddingHalls.map((h) => h.id));
}

/**
 * next export için center id'lerini üretir.
 * Eğer backend'den centers listesi alınamazsa, fallback olarak halls'tan centerId çıkarır.
 */
export async function getCenterIdsForExport(): Promise<string[]> {
  try {
    const centers = await getCenters();
    const ids = uniqueStrings(centers.map((c) => c.id));
    if (ids.length > 0) return ids;
  } catch {
    // ignore - fallback below
  }

  // Centers endpoint auth gerektiriyorsa, build-time service account token ile tekrar dene.
  try {
    const token = await loginForBuild();
    if (token) {
      const centersAuth = await fetchCentersWithAuth(token);
      const ids = uniqueStrings(centersAuth?.map((c) => c.id));
      if (ids.length > 0) return ids;

      // Centers listesi yetkisiz/boşsa, halls listesinden centerId türet.
      const hallsAuth = await fetchHallsWithAuth(token);
      const centerIdsFromHalls = uniqueStrings(hallsAuth?.map((h) => h.centerId));
      if (centerIdsFromHalls.length > 0) return centerIdsFromHalls;
    }
  } catch {
    // ignore - fallback below
  }

  return uniqueStrings(weddingHalls.map((h) => h.centerId));
}

