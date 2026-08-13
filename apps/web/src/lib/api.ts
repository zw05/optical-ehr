'use client';

import { clearRecentPatients } from './recentPatients';
import {
  applyPreferences,
  cachePreferences,
  mergePreferences,
  type UserPreferences,
} from './preferences';

/** Signed-in staff member stored in sessionStorage after login. */
export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'DOCTOR' | 'TECHNICIAN' | 'OPTICIAN' | 'RECEPTIONIST' | 'ADMIN';
}

const TOKEN_KEY = 'ehr.token';
const USER_KEY = 'ehr.user';

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

/** Returns the JWT access token from sessionStorage, or null if signed out / SSR. */
export function getToken(): string | null {
  if (!canUseSessionStorage()) return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

/** Returns the cached user profile, or null if not signed in / SSR. */
export function getSessionUser(): SessionUser | null {
  if (!canUseSessionStorage()) return null;
  const raw = sessionStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}

/**
 * Persists token + user after a successful login.
 * Optionally seeds the preferences cache from the login payload.
 */
export function setSession(token: string, user: SessionUser, preferences?: UserPreferences) {
  if (!canUseSessionStorage()) return;
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  if (preferences) {
    const merged = mergePreferences(preferences);
    cachePreferences(merged);
    applyPreferences(merged);
  }
}

/** Clears the session (sign out). */
export function clearSession() {
  if (canUseSessionStorage()) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }
  clearRecentPatients();
}

/** Thrown by `api()` when the server returns a non-2xx status. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Authenticated JSON (or PDF) fetch to the NestJS API via the Next.js `/api` proxy.
 * Attaches the bearer token, redirects to `/login` on 401, and parses error messages.
 */
export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = getToken();
  const response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 401) {
    clearSession();
    window.location.href = '/login';
    throw new ApiError(401, 'Session expired');
  }
  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      message = Array.isArray(data.message) ? data.message.join('; ') : (data.message ?? message);
    } catch {
      // keep statusText
    }
    throw new ApiError(response.status, message);
  }
  if (response.headers.get('content-type')?.includes('application/pdf')) {
    return (await response.blob()) as T;
  }
  return (await response.json()) as T;
}
