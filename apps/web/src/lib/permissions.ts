'use client';

/**
 * Capability keys mirrored from the API's auth/permissions.ts. The web app uses
 * them only to decide what to show: every gated route is enforced server-side,
 * so hiding a section here is a courtesy, never the security boundary.
 */
export const Permission = {
  STORE_PROFILE_EDIT: 'store.profile.edit',
  LENS_PRICING_EDIT: 'store.lensPricing.edit',
  CONTACT_LENS_PRICING_EDIT: 'store.contactLensPricing.edit',
  FRAMES_EDIT: 'store.frames.edit',
  CODES_EDIT: 'store.codes.edit',
  PAYERS_EDIT: 'store.payers.edit',
  ACCOUNTS_MANAGE: 'store.accounts.manage',
} as const;

export type PermissionKey = (typeof Permission)[keyof typeof Permission];

export interface PermissionCatalogEntry {
  key: PermissionKey;
  label: string;
  description: string;
}

const CACHE_KEY = 'ehr.permissions';

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

/** Caches the effective permission set alongside the session. */
export function cachePermissions(permissions: string[]) {
  if (!canUseSessionStorage()) return;
  sessionStorage.setItem(CACHE_KEY, JSON.stringify(permissions));
}

export function clearPermissions() {
  if (canUseSessionStorage()) sessionStorage.removeItem(CACHE_KEY);
}

/** Reads the cached set. Empty during SSR and before the first load resolves. */
export function getPermissions(): string[] {
  if (!canUseSessionStorage()) return [];
  const raw = sessionStorage.getItem(CACHE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function hasPermission(key: PermissionKey, permissions = getPermissions()): boolean {
  return permissions.includes(key);
}
