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
  'SEMIANNUAL',
  'INTERIM',
  'NEW_LENSES',
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
  'SEMIANNUAL',
  'INTERIM',
  'NEW_LENSES',
];

export const MILESTONE_LABELS: Record<OrthoKMilestone, string> = {
  DAY_1: 'Day 1',
  DAY_2: 'Day 2',
  WEEK_1: '1 week',
  MONTH_1: '1 month',
  MONTH_3: '3 months',
  MONTH_6: '6 months',
  SEMIANNUAL: '6-month check',
  INTERIM: 'Interim visit',
  NEW_LENSES: 'New lenses',
};

/** Chip captions on the milestone strip. */
export const MILESTONE_SHORT_LABELS: Record<OrthoKMilestone, string> = {
  DAY_1: '1d',
  DAY_2: '2d',
  WEEK_1: '1w',
  MONTH_1: '1mo',
  MONTH_3: '3mo',
  MONTH_6: '6mo',
  SEMIANNUAL: '+6mo',
  INTERIM: '+',
  NEW_LENSES: 'Rx',
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
  /** The practice's own Ortho-K case number, counting from 1. */
  caseNumber: number;
  status: OrthoKStatus;
  startDate: string | null;
  eyes: string | null;
  lensBrand: string | null;
  lensDesign: string | null;
  lensParams: string | null;
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
  /** Which year of lenses the patient is on; 1 until the first renewal is logged. */
  programYear: number;
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

/** "Dec 2026" — how the board states when a check falls due. */
export function formatMonthYear(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/** "17 days late" / "due today" / "in 12 days" — used where lateness is the point. */
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

/** One year of the program: the lenses dispensed, and the follow-ups that ran on them. */
export interface ProgramYear {
  year: number;
  /** When this year's lenses were dispensed — the enrollment start for year 1. */
  startedAt: string | null;
  /** Visits belonging to this year, newest first. */
  visits: OrthoKVisit[];
  /** The year the patient is in now, and the only one still accruing visits. */
  isCurrent: boolean;
}

/**
 * Splits the visit log into program years, one per set of lenses.
 *
 * A `NEW_LENSES` visit opens the year it belongs to rather than closing the
 * previous one: the day the patient collects their next pair is day one of that
 * year, and every follow-up after it belongs there too.
 */
export function groupVisitsByYear(
  visits: OrthoKVisit[],
  startDate: string | null,
): ProgramYear[] {
  const ascending = [...visits].sort(
    (a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime(),
  );

  const years: ProgramYear[] = [
    { year: 1, startedAt: startDate, visits: [], isCurrent: true },
  ];

  for (const visit of ascending) {
    if (visit.milestone === 'NEW_LENSES') {
      years.push({
        year: years.length + 1,
        startedAt: visit.visitDate,
        visits: [],
        isCurrent: true,
      });
    }
    years[years.length - 1].visits.push(visit);
  }

  return years
    .map((y, index) => ({
      ...y,
      visits: [...y.visits].reverse(),
      isCurrent: index === years.length - 1,
    }))
    .reverse();
}
