/** Shared appointment lifecycle transitions for Schedule and Dashboard. */

export type StatusAction = {
  label: string;
  status: string;
  /** Clinical work — hidden from the front desk (see CLINICAL_FLOW_ROLES). */
  clinical?: boolean;
};

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
  CHECKED_IN: [{ label: 'Start exam', status: 'IN_PROGRESS', clinical: true }],
  IN_PROGRESS: [{ label: 'Complete', status: 'COMPLETED', clinical: true }],
};

/** Patients currently in the office / waiting room (Patient Flow panel). */
export const FLOW_STATUSES = new Set(['WAITING', 'CHECKED_IN', 'IN_PROGRESS']);

export const TERMINAL_STATUSES = new Set(['CANCELLED', 'COMPLETED', 'NO_SHOW']);

/** Roles allowed to book and change appointment status (matches API). */
export const SCHEDULING_ROLES = new Set(['RECEPTIONIST', 'TECHNICIAN', 'DOCTOR', 'ADMIN']);

/**
 * Roles allowed to start and finish an exam. The front desk checks patients in
 * and out of the waiting room but does not run the visit itself, so it never
 * sees these actions. Mirrors the API guard in SchedulingService.setStatus.
 */
export const CLINICAL_FLOW_ROLES = new Set(['TECHNICIAN', 'DOCTOR', 'ADMIN']);

export function canCancelAppointment(status: string): boolean {
  return !TERMINAL_STATUSES.has(status);
}

export function actionsForStatus(status: string, role: string | undefined): StatusAction[] {
  const canDoClinical = CLINICAL_FLOW_ROLES.has(role ?? '');
  return (NEXT_STATUS[status] ?? []).filter((a) => !a.clinical || canDoClinical);
}
