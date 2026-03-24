import { fetchApi } from "./base";
import type { User } from "@/lib/types";
import { ApiError } from "@/lib/utils/api-error";

// Re-export User type for convenience
export type { User };

const AUTH = "/api/v1/auth";

export type LoginResult = {
  success: boolean;
  token?: string;
  userId?: string;
  email?: string;
  role?: string;
  message?: string;
};

type UserInfoDto = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  department?: number;
  phone?: string;
};

function toUser(d: UserInfoDto): User {
  console.log("📝 toUser - department:", d.department, "role:", d.role);
  return {
    id: d.id,
    name: d.fullName === "Super Admin" ? "Yönetici" : d.fullName,
    email: d.email,
    role: d.role as User["role"],
    department: d.department,
    phone: d.phone,
  };
}

// Mock users for development when backend is not available
const MOCK_USERS: Record<string, { password: string; id: string; name: string; role: "Viewer" | "Editor" | "SuperAdmin"; department?: number; phone?: string }> = {
  "viewer@nikahsalon.local": {
    password: "Viewer1!",
    id: "mock-viewer-1",
    name: "Viewer User",
    role: "Viewer",
  },
  "editor@nikahsalon.local": {
    password: "Editor1!",
    id: "mock-editor-1",
    name: "Editor User",
    role: "Editor",
    department: 0, // Nikah
    phone: "0555 123 45 67",
  },
  "admin@nikahsalon.local": {
    password: "Admin1!",
    id: "mock-admin-1",
    name: "Yönetici",
    role: "SuperAdmin",
    phone: "0555 999 88 77",
  },
};

async function mockLogin(email: string, password: string): Promise<LoginResult> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  const user = MOCK_USERS[email.toLowerCase()];
  if (!user || user.password !== password) {
    return {
      success: false,
      message: "Geçersiz e-posta veya şifre.",
    };
  }

  // Generate a mock JWT-like token
  const mockToken = `mock-token-${btoa(JSON.stringify({ userId: user.id, email, role: user.role }))}`;

  return {
    success: true,
    token: mockToken,
    userId: user.id,
    email: email.toLowerCase(),
    role: user.role,
  };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const result = await fetchApi<LoginResult>(`${AUTH}/login`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });
    return result;
  } catch (error) {
    // Only use mock login for actual network errors, not API errors (400, 401, etc.)
    if (
      error instanceof Error &&
      error.name === "NetworkError"
    ) {
      console.warn("Backend API not available, using mock authentication");
      return mockLogin(email, password);
    }
    // Re-throw API errors (400, 401, 500, etc.) as-is
    throw error;
  }
}

async function mockGetCurrentUser(): Promise<User> {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("token") : null;
  if (!token || !token.startsWith("mock-token-")) {
    throw new Error("Unauthorized");
  }

  try {
    const payload = JSON.parse(atob(token.replace("mock-token-", "")));
    const mockUser = MOCK_USERS[payload.email?.toLowerCase()];
    return {
      id: payload.userId,
      name: payload.role === "Viewer" ? "Viewer User" : (payload.role === "SuperAdmin" || payload.role === "Admin") ? "Yönetici" : "Editor User",
      email: payload.email,
      role: payload.role as User["role"],
      department: mockUser?.department,
      phone: mockUser?.phone,
    };
  } catch {
    throw new Error("Invalid token");
  }
}

export async function getCurrentUser(): Promise<User> {
  try {
    const d = await fetchApi<UserInfoDto>(`${AUTH}/me`);
    console.log("🔍 Backend'den gelen user data:", d);
    const user = toUser(d);
    console.log("👤 Dönüştürülmüş user:", user);
    return user;
  } catch (error: any) {
    // Backend çalışmıyorsa veya 401 hatası varsa mock kullan
    // 401 hatası token yoksa veya geçersizse oluşur, bu durumda mock'a düş
    if (
      (error instanceof Error && error.name === "NetworkError") ||
      (error?.status === 401) ||
      (error?.status === 404)
    ) {
      console.warn("Backend API not available or unauthorized, using mock user data");
      try {
        return mockGetCurrentUser();
      } catch (mockError) {
        // Mock'ta da token yoksa, boş user döndür (login sayfasına yönlendirilecek)
        throw new Error("Unauthorized");
      }
    }
    // Diğer hataları olduğu gibi throw et
    throw error;
  }
}

/** @deprecated Use getCurrentUser. Kept for backward compatibility. */
export const getMe = getCurrentUser;

// Get all users (for contacts/people page)
// Backend endpoint: GET /api/v1/auth/users?page=1&pageSize=1000 (tüm kullanıcılar için)
// veya GET /api/v1/users?page=1&pageSize=1000 (sadece SuperAdmin için)
type GetUsersResponse = {
  items: UserInfoDto[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function getAllUsers(): Promise<User[]> {
  try {
    // Önce /api/v1/auth/users endpoint'ini dene (tüm kullanıcılar erişebilir)
    try {
      const response = await fetchApi<GetUsersResponse>(`${AUTH}/users?page=1&pageSize=1000`);
      return response.items.map(toUser);
    } catch (authError) {
      // Eğer auth/users yoksa, /api/v1/users endpoint'ini dene (sadece SuperAdmin)
      const response = await fetchApi<GetUsersResponse>(`/api/v1/users?page=1&pageSize=1000`);
      return response.items.map(toUser);
    }
  } catch (error) {
    // 404, 403 veya NetworkError durumunda mock data kullan
    const isNetworkError = error instanceof Error && error.name === "NetworkError";
    const is404 = error instanceof ApiError && error.status === 404;
    const is403 = error instanceof ApiError && error.status === 403;
    
    if (isNetworkError || is404 || is403) {
      console.warn("Backend API not available, endpoint not found, or insufficient permissions. Using mock users data.");
      // Mock users listesi - gerçek kullanıcılar backend'den geldiğinde bunlar yerine kullanılacak
      const mockUsersList: User[] = [
        {
          id: "mock-admin-1",
          name: "Yönetici",
          email: "admin@nikahsalon.local",
          role: "SuperAdmin",
          phone: "0555 999 88 77",
        },
        {
          id: "mock-editor-1",
          name: "Nikah Sorumlusu",
          email: "editor@nikahsalon.local",
          role: "Editor",
          department: 0,
          phone: "0555 123 45 67",
        },
        {
          id: "mock-editor-2",
          name: "Toplantı Sorumlusu",
          email: "toplanti@nikahsalon.local",
          role: "Editor",
          department: 3,
          phone: "0555 234 56 78",
        },
        {
          id: "mock-editor-3",
          name: "Konser Sorumlusu",
          email: "konser@nikahsalon.local",
          role: "Editor",
          department: 2,
          phone: "0555 345 67 89",
        },
        {
          id: "mock-editor-4",
          name: "Nişan Sorumlusu",
          email: "nisan@nikahsalon.local",
          role: "Editor",
          department: 1,
          phone: "0555 456 78 90",
        },
      ];
      return mockUsersList;
    }
    throw error;
  }
}
