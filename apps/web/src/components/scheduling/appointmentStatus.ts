/** Shared appointment lifecycle transitions for Schedule and Dashboard. */

export type StatusAction = { label: string; status: string };

export const NEXT_STATUS: Record<string, StatusAction[]> = {
  WAITING: [
    { label: 'Check in', status: 'CHECKED_IN' },
    { label: 'No-show', status: 'NO_SHOW' },
  ],
  SCHEDULED: [
    { label: 'Confirm', status: 'CONFIRMED' },
    { label: 'Check in', status: 'CHECKED_IN' },
    { label: 'No-show', status: 'NO_SHOW' },
  ],
  CONFIRMED: [
    { label: 'Check in', status: 'CHECKED_IN' },
    { label: 'No-show', status: 'NO_SHOW' },
  ],
  CHECKED_IN: [{ label: 'Start exam', status: 'IN_PROGRESS' }],
  IN_PROGRESS: [{ label: 'Complete', status: 'COMPLETED' }],
};

/** Patients currently in the office / waiting room (Patient Flow panel). */
export const FLOW_STATUSES = new Set(['WAITING', 'CHECKED_IN', 'IN_PROGRESS']);

export const TERMINAL_STATUSES = new Set(['CANCELLED', 'COMPLETED', 'NO_SHOW']);

/** Roles allowed to book and change appointment status (matches API). */
export const SCHEDULING_ROLES = new Set(['RECEPTIONIST', 'TECHNICIAN', 'DOCTOR', 'ADMIN']);

export function canCancelAppointment(status: string): boolean {
  return !TERMINAL_STATUSES.has(status);
}

export function actionsForStatus(status: string): StatusAction[] {
  return NEXT_STATUS[status] ?? [];
}
