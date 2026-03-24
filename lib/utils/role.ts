import type { UserRole } from "@/lib/types";

/**
 * Role-based access control helpers.
 * Use these instead of hardcoding role strings.
 */

export function isSuperAdmin(role: UserRole | null | undefined): boolean {
  return role === "SuperAdmin" || role === "Admin";
}

export function isEditor(role: UserRole | null | undefined): boolean {
  return role === "Editor";
}

export function isViewer(role: UserRole | null | undefined): boolean {
  return role === "Viewer";
}

export function isMerkezSorumlusu(role: UserRole | null | undefined): boolean {
  return role === "MerkezSorumlusu";
}

/**
 * Check if user can edit (SuperAdmin or Editor). MerkezSorumlusu is view-only.
 */
export function canEdit(role: UserRole | null | undefined): boolean {
  return role === "SuperAdmin" || role === "Admin" || role === "Editor";
}

/**
 * Check if user can manage halls (only SuperAdmin)
 */
export function canManageHalls(role: UserRole | null | undefined): boolean {
  return role === "SuperAdmin" || role === "Admin";
}

/**
 * Check if user can manage schedules (SuperAdmin or Editor)
 */
export function canManageSchedules(role: UserRole | null | undefined): boolean {
  return role === "SuperAdmin" || role === "Admin" || role === "Editor";
}

/**
 * Parse allowed Editor user IDs from center description
 */
export function parseAllowedUserIds(description: string): string[] {
  if (!description) return [];
  const editorMatch = description.match(/Erişim İzni Olan Editörler:\s*\[([^\]]+)\]/);
  if (editorMatch) {
    return editorMatch[1]
      .split(',')
      .map(id => id.trim().replace(/['"]/g, ''))
      .filter(id => id.length > 0);
  }
  return [];
}

/**
 * Parse Merkez Sorumlusu user IDs from center description
 */
export function parseMerkezSorumlusuIds(description: string): string[] {
  if (!description) return [];
  const match = description.match(/Merkez Sorumluları:\s*\[([^\]]+)\]/);
  if (match) {
    return match[1]
      .split(',')
      .map(id => id.trim().replace(/['"]/g, ''))
      .filter(id => id.length > 0);
  }
  return [];
}

/**
 * Check if user has access to a center
 * SuperAdmin and Viewer (for listing) have access; Editor/MerkezSorumlusu need to be in the center's lists
 */
export function canAccessCenter(
  userRole: UserRole | null | undefined,
  userId: string | null | undefined,
  centerDescription: string | null | undefined
): boolean {
  if (isSuperAdmin(userRole)) return true;
  if (isViewer(userRole)) return false;
  if (!userId || !centerDescription) return false;
  if (isEditor(userRole)) return parseAllowedUserIds(centerDescription).includes(userId);
  if (isMerkezSorumlusu(userRole)) return parseMerkezSorumlusuIds(centerDescription).includes(userId);
  return false;
}
