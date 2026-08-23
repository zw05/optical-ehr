/**
 * Shapes and labels for the Ortho-K program board.
 *
 * The schedule arithmetic deliberately lives only on the server
 * (`apps/api/src/ortho-k/milestones.ts`): every board response already carries
 * each milestone's due date and state, so duplicating the offsets and grace
 * windows here would only create two versions of "overdue" that could drift
 * apart. This module holds presentation — names, order, and formatting.
 */

export const ORTHO_K_MILESTONES = [
  'DAY_1',
  'DAY_2',
  'WEEK_1',
  'MONTH_1',
  'MONTH_3',
  'MONTH_6',
  'ANNUAL',
  'INTERIM',
] as const;

export type OrthoKMilestone = (typeof ORTHO_K_MILESTONES)[number];

/** Milestones a follow-up can be logged against, in the order staff work through them. */
export const LOGGABLE_MILESTONES: OrthoKMilestone[] = [
  'DAY_1',
  'DAY_2',
  'WEEK_1',
  'MONTH_1',
  'MONTH_3',
  'MONTH_6',
  'ANNUAL',
  'INTERIM',
];

export const MILESTONE_LABELS: Record<OrthoKMilestone, string> = {
  DAY_1: 'Day 1',
  DAY_2: 'Day 2',
  WEEK_1: '1 week',
  MONTH_1: '1 month',
  MONTH_3: '3 months',
  MONTH_6: '6 months',
  ANNUAL: 'Annual review',
  INTERIM: 'Interim visit',
};

/** Chip captions on the milestone strip. */
export const MILESTONE_SHORT_LABELS: Record<OrthoKMilestone, string> = {
  DAY_1: '1d',
  DAY_2: '2d',
  WEEK_1: '1w',
  MONTH_1: '1mo',
  MONTH_3: '3mo',
  MONTH_6: '6mo',
  ANNUAL: '1yr',
  INTERIM: '+',
};

export type MilestoneState = 'DONE' | 'UPCOMING' | 'DUE' | 'OVERDUE';

export const ORTHO_K_STATUSES = [
  'FITTING',
  'ACTIVE',
  'MAINTENANCE',
  'ON_HOLD',
  'DISCONTINUED',
] as const;

export type OrthoKStatus = (typeof ORTHO_K_STATUSES)[number];

export const STATUS_LABELS: Record<OrthoKStatus, string> = {
  FITTING: 'Fitting',
  ACTIVE: 'Active',
  MAINTENANCE: 'Maintenance',
  ON_HOLD: 'On hold',
  DISCONTINUED: 'Discontinued',
};

export interface MilestoneStatus {
  milestone: OrthoKMilestone;
  occurrence: number;
  dueDate: string;
  state: MilestoneState;
  visitDate: string | null;
  daysLate: number;
}

export interface OrthoKVisit {
  id: string;
  milestone: OrthoKMilestone;
  visitDate: string;
  note: string | null;
  recordedBy: { firstName: string; lastName: string } | null;
}

export interface OrthoKEnrollment {
  id: string;
  status: OrthoKStatus;
  startDate: string | null;
  eyes: string | null;
  lensBrand: string | null;
  lensDesign: string | null;
  lensParams: string | null;
  folderRef: string | null;
  notes: string | null;
  patient: {
    id: string;
    mrn: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    preferredContact: string | null;
  };
  visits: OrthoKVisit[];
  milestones: MilestoneStatus[];
  next: MilestoneStatus | null;
}

export interface OrthoKNotifications {
  overdueCount: number;
  dueCount: number;
  rows: OrthoKEnrollment[];
}

export function milestoneLabel(milestone: string): string {
  return MILESTONE_LABELS[milestone as OrthoKMilestone] ?? milestone;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as OrthoKStatus] ?? status;
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
}

/** "17 days late" / "due today" / "in 12 days" — the phrase the board leads with. */
export function describeDue(status: MilestoneStatus | null): string {
  if (!status) return 'No follow-up scheduled';
  const label = milestoneLabel(status.milestone);
  if (status.state === 'OVERDUE') {
    return `${label} — ${status.daysLate} day${status.daysLate === 1 ? '' : 's'} late`;
  }
  const days = daysUntil(status.dueDate);
  if (status.state === 'DUE') {
    if (days === 0) return `${label} — due today`;
    if (days < 0) return `${label} — due ${Math.abs(days)} day${days === -1 ? '' : 's'} ago`;
    return `${label} — due in ${days} day${days === 1 ? '' : 's'}`;
  }
  return `${label} — in ${days} day${days === 1 ? '' : 's'}`;
}

/** Whole days from today to `iso`, by calendar day rather than elapsed hours. */
export function daysUntil(iso: string): number {
  const target = new Date(iso);
  const a = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** Today as `YYYY-MM-DD` for date inputs, in local time. */
export function todayInputValue(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
