import { ApiError } from "@/lib/utils/api-error";

const TOKEN_KEY = "token";

const getToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
};

const isJwtToken = (token: string): boolean => {
  const parts = token.split(".");
  return parts.length === 3 && parts.every((part) => part.length > 0);
};

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  if (!isJwtToken(token)) return null;

  try {
    const payloadPart = token.split(".")[1];
    // JWT payload is base64url encoded. Normalize before atob.
    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const getBaseUrl = (): string => {
  const direct = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (direct) return direct;

  const local = process.env.NEXT_PUBLIC_API_URL_LOCAL?.trim();
  const prod = process.env.NEXT_PUBLIC_API_URL_PROD?.trim();

  if (typeof window === "undefined") {
    return prod || local || "";
  }

  const host = window.location.hostname.toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1";

  if (isLocalHost) {
    return local || "http://localhost:5230";
  }

  return prod || local || "";
};

export type FetchOptions = RequestInit & { skipAuth?: boolean };

type ErrorBody = { 
  success?: boolean;
  message?: string; 
  errors?: string[] | IReadOnlyList<string>;
};

interface IReadOnlyList<T> extends Array<T> {
  readonly length: number;
}

/**
 * Fetch wrapper: base URL from NEXT_PUBLIC_API_URL, JWT from sessionStorage,
 * non-2xx → typed ApiError, parsed JSON response.
 */
export async function fetchApi<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const base = getBaseUrl().replace(/\/$/, "");
  
  // Check if API URL is configured
  if (!base) {
    const error = new Error("API URL yapılandırılmamış. NEXT_PUBLIC_API_URL ortam değişkenini kontrol edin.");
    error.name = "ConfigurationError";
    throw error;
  }
  
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const { skipAuth, ...init } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) ?? {}),
  };

  if (!skipAuth) {
    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
      // Debug: Token'daki rol bilgisini kontrol et (sadece development'ta)
      if (process.env.NODE_ENV === "development") {
        const payload = decodeJwtPayload(token);
        if (payload) {
          // ASP.NET Core JWT'de rol claim'i farklı key'lerde olabilir
          const role = payload[`http://schemas.microsoft.com/ws/2008/06/identity/claims/role`] 
                    || payload[`role`] 
                    || payload[`Role`]
                    || payload[`http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role`];
          if (path.includes("/requests")) {
            console.log("🔍 Token Debug - Full payload:", payload);
            console.log("🔍 Token Debug - Role found:", role);
            console.log("🔍 Token Debug - All claim keys:", Object.keys(payload));
          }
        } else if (path.includes("/requests")) {
          console.warn("Token debug skipped: token is not a valid JWT format.");
        }
      }
    }
  }

  try {
    // Request body'yi logla (debug için)
    let requestBody: unknown = null;
    if (init.body) {
      try {
        requestBody = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
      } catch {
        requestBody = init.body;
      }
    }

    const res = await fetch(url, { ...init, headers });

    if (!res.ok) {
      // Response body'yi oku
      const contentType = res.headers.get("content-type") || "";
      let text = "";
      let body: ErrorBody | null = null;
      
      try {
        // Content-Type'a göre response'u oku
        if (contentType.includes("application/json")) {
          text = await res.text();
          if (text) {
            try {
              body = JSON.parse(text) as ErrorBody;
              // Debug: Parse edilen body'yi logla
              if (res.status === 400) {
                console.debug("Parsed error body:", body);
              }
            } catch (parseErr) {
              // JSON parse başarısız, text'i direkt kullan
              console.warn("JSON parse hatası:", parseErr, "Raw text:", text);
              text = text.trim();
            }
          } else {
            console.warn("Response body boş (text empty)");
          }
        } else {
          // JSON değilse text olarak oku
          text = await res.text();
          text = text.trim();
          if (res.status === 400) {
            console.warn("Non-JSON response for 400 error:", text);
          }
        }
      } catch (readError) {
        // Response body okunamadı
        console.error("Response body okunamadı:", readError);
      }
      
      let message = `HTTP ${res.status}`;
      let errors: string[] | undefined;
      
      // Status code'a göre varsayılan mesajlar
      const statusMessages: Record<number, string> = {
        400: "Geçersiz istek. Lütfen girdiğiniz bilgileri kontrol edin.",
        401: "Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.",
        403: "Bu işlem için yetkiniz bulunmamaktadır.",
        404: "İstenen kaynak bulunamadı.",
        500: "Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.",
        502: "Backend servisine bağlanılamıyor.",
        503: "Servis şu anda kullanılamıyor.",
      };
      
      // Varsayılan mesajı status code'a göre ayarla
      if (statusMessages[res.status]) {
        message = statusMessages[res.status];
      }
      
      // Backend'den gelen mesajı parse et
      if (body) {
        // Backend ApiResponse formatı: { success: false, message: "...", errors: [...] }
        if (body.message) {
          message = body.message;
        }
        // errors array'ini kontrol et
        if (body.errors) {
          const errorArray = Array.isArray(body.errors) ? body.errors : [];
          if (errorArray.length > 0) {
            errors = errorArray;
            // Eğer message yoksa, errors'dan oluştur
            if (!body.message || body.message === "Validation failed.") {
              message = errorArray.join(", ");
            }
          }
        }
      } else if (text) {
        // Body parse edilemedi ama text var
        message = text;
      }
      
      // 401 (Unauthorized) hatalarını sessizce handle et - token geçersiz/yok
      if (res.status === 401) {
        // Token'ı temizle
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(TOKEN_KEY);
        }
        // 401 hatalarını console'a yazdırma (normal durum - token yoksa)
      } else if (res.status === 403) {
        // 403 + text/html: genelde IIS/Plesk (ModSecurity, WebDAV kalıntısı, WAF) — API'nin JSON yetki cevabı değil
        if (contentType.includes("text/html")) {
          message =
            "Sunucu güvenlik katmanı (IIS/Plesk; çoğunlukla ModSecurity/WAF) PUT/DELETE isteğini engelliyor. Bu, uygulama rolüyle ilgili bir mesaj değildir. Plesk → Güvenlik → Web Application Firewall / ModSecurity’yi geçici kapatıp deneyin veya hosting desteğine “API için PUT/DELETE 403 HTML” diye bildirin.";
        } else if (!body || !body.message) {
          message = "Bu işlem için yetkiniz bulunmamaktadır. Lütfen yöneticinizle iletişime geçin.";
        }
        console.error(`API Error [403 Forbidden]:`, {
          url,
          method: init.method || "GET",
          message,
          errors,
          responseBody: body ? JSON.stringify(body, null, 2) : text || "(empty)",
          contentType,
          likelyHostingWaf: contentType.includes("text/html"),
        });
      } else {
        // Diğer hataları console'a yazdır (mesaj önce string olarak, böylece "Object" yerine metin görünür)
        const responseSnippet = body?.message ?? (typeof text === "string" && text.length > 0 ? text.slice(0, 300) : "(boş yanıt)");
        const errorDetails = {
          url,
          method: init.method || "GET",
          status: res.status,
          statusText: res.statusText,
          message,
          errors: errors && errors.length > 0 ? errors : undefined,
          responseBody: body ? JSON.stringify(body, null, 2) : text || "(empty)",
          responseText: text || "(empty)",
          responseTextLength: text?.length || 0,
          contentType,
          requestBody: requestBody ? JSON.stringify(requestBody, null, 2) : "(none)",
        };
        
        console.error(`API Error [${res.status}]: ${message}. Sunucu yanıtı: ${responseSnippet}`, errorDetails);
        
        // Eğer validation hatası varsa, kullanıcıya daha anlaşılır mesaj göster
        if (res.status === 400 && errors && errors.length > 0) {
          console.error("Validation Errors:", errors);
        }
      }
      
      throw new ApiError(message, errors, res.status);
    }

    // 204/205: gövde yok; DELETE gibi endpoint'lerde res.json() patlamasın
    if (res.status === 204 || res.status === 205) {
      return undefined as unknown as Promise<T>;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const raw = await res.text();
      if (!raw || !raw.trim()) {
        return undefined as unknown as Promise<T>;
      }
      try {
        return JSON.parse(raw) as T;
      } catch {
        throw new ApiError("Sunucu geçersiz JSON döndürdü.", undefined, res.status);
      }
    }
    return undefined as unknown as Promise<T>;
  } catch (error) {
    // Handle network/connection errors
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Check if it's a connection error - more specific check
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : "";
    
    // Only treat as network error if it's specifically a fetch/network failure
    // Don't treat all TypeErrors as network errors - only those related to fetch
    const isNetworkErr = 
      errorName === "TypeError" && (
        errorMessage.includes("Failed to fetch") ||
        errorMessage.includes("fetch failed") ||
        errorMessage.includes("NetworkError") ||
        errorMessage.includes("ERR_CONNECTION_REFUSED") ||
        errorMessage.includes("ERR_NETWORK") ||
        errorMessage.includes("ERR_INTERNET_DISCONNECTED")
      ) ||
      errorMessage.includes("Failed to fetch") ||
      errorMessage.includes("ERR_CONNECTION_REFUSED") ||
      errorMessage.includes("NetworkError") ||
      errorMessage.includes("Network request failed") ||
      errorMessage.includes("fetch failed") ||
      errorName === "NetworkError";
    
    if (isNetworkErr) {
      const networkError = new Error("Backend API'ye bağlanılamıyor. Lütfen backend'in çalıştığından emin olun.");
      networkError.name = "NetworkError";
      throw networkError;
    }
    throw error;
  }
}

export { getBaseUrl, getToken, TOKEN_KEY };
