/** Session-scoped recent-patient list for the Patients page (PHI — not localStorage). */

export interface RecentPatient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  phone: string | null;
  alerts: string | null;
  viewedAt: number;
}

const STORAGE_KEY = 'ehr.recentPatients';
const MAX_RECENT = 8;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';
}

/** Returns recently viewed patients, newest first. Empty during SSR or if unset. */
export function getRecentPatients(): RecentPatient[] {
  if (!canUseStorage()) return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentPatient[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Upserts a patient at the front of the recent list (deduped by id, capped at 8).
 * Call after a chart successfully loads.
 */
export function recordRecentPatient(patient: Omit<RecentPatient, 'viewedAt'>): void {
  if (!canUseStorage()) return;
  const entry: RecentPatient = { ...patient, viewedAt: Date.now() };
  const next = [entry, ...getRecentPatients().filter((p) => p.id !== patient.id)].slice(0, MAX_RECENT);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** Clears the recent list (call on sign-out). */
export function clearRecentPatients(): void {
  if (!canUseStorage()) return;
  sessionStorage.removeItem(STORAGE_KEY);
}
