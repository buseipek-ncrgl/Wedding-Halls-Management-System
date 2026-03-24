/**
 * Centralized route config for dashboard protection.
 * Editor-only paths: Viewer cannot access; hide from sidebar for Viewer.
 */
export const EDITOR_ONLY_PATHS = ["/dashboard/ayarlar"] as const;

export function isEditorOnlyPath(pathname: string): boolean {
  return EDITOR_ONLY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

// Static export'ta dinamik route fallback problemi yasamamak icin
// detay sayfalarini sabit shell route + query param ile acariz.
export const STATIC_HALL_SHELL_ID = "1";
export const STATIC_CENTER_SHELL_ID = "00000000-0000-0000-0000-000000000001";

export function hallDetailPath(hallId: string): string {
  return `/dashboard/${STATIC_HALL_SHELL_ID}?id=${encodeURIComponent(hallId)}`;
}

export function centerDetailPath(centerId: string): string {
  return `/dashboard/salonlar/${STATIC_CENTER_SHELL_ID}?id=${encodeURIComponent(centerId)}`;
}

export function centerEditPath(centerId: string): string {
  return `/dashboard/salonlar/${STATIC_CENTER_SHELL_ID}/duzenle?id=${encodeURIComponent(centerId)}`;
}
