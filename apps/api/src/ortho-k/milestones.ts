import { OrthoKMilestone } from '@prisma/client';

/**
 * The orthokeratology follow-up schedule, and the arithmetic that turns a start
 * date plus a list of logged visits into "what is due next".
 *
 * Nothing here is stored: every due date and state is derived at query time from
 * {@link OrthoKEnrollment.startDate}, so an enrollment created today shows its
 * day-1 check immediately rather than waiting for an overnight job, and a
 * corrected start date re-dates the whole sequence at once.
 *
 * The web app mirrors this table in `apps/web/src/lib/orthoK.ts`; the two must
 * agree on what "overdue" means, so change them together.
 */

/** Milestones that have a due date, in the order the practice works through them. */
export const ORTHO_K_SEQUENCE = [
  OrthoKMilestone.DAY_1,
  OrthoKMilestone.DAY_2,
  OrthoKMilestone.WEEK_1,
  OrthoKMilestone.MONTH_1,
  OrthoKMilestone.MONTH_3,
  OrthoKMilestone.MONTH_6,
  OrthoKMilestone.ANNUAL,
] as const;

export type ScheduledMilestone = (typeof ORTHO_K_SEQUENCE)[number];

/**
 * Days after the first night of lens wear, and the grace window either side
 * before the follow-up counts as missed. The early checks are deliberately
 * tight: a day-1 visit that slips a day is a real miss, while a six-month
 * review three weeks out is still on schedule.
 */
export const MILESTONE_SCHEDULE: Record<
  ScheduledMilestone,
  { offsetDays: number; windowDays: number }
> = {
  [OrthoKMilestone.DAY_1]: { offsetDays: 1, windowDays: 0 },
  [OrthoKMilestone.DAY_2]: { offsetDays: 2, windowDays: 1 },
  [OrthoKMilestone.WEEK_1]: { offsetDays: 7, windowDays: 3 },
  [OrthoKMilestone.MONTH_1]: { offsetDays: 30, windowDays: 7 },
  [OrthoKMilestone.MONTH_3]: { offsetDays: 90, windowDays: 14 },
  [OrthoKMilestone.MONTH_6]: { offsetDays: 180, windowDays: 21 },
  [OrthoKMilestone.ANNUAL]: { offsetDays: 365, windowDays: 30 },
};

export const MILESTONE_LABELS: Record<OrthoKMilestone, string> = {
  [OrthoKMilestone.DAY_1]: 'Day 1',
  [OrthoKMilestone.DAY_2]: 'Day 2',
  [OrthoKMilestone.WEEK_1]: '1 week',
  [OrthoKMilestone.MONTH_1]: '1 month',
  [OrthoKMilestone.MONTH_3]: '3 months',
  [OrthoKMilestone.MONTH_6]: '6 months',
  [OrthoKMilestone.ANNUAL]: 'Annual review',
  [OrthoKMilestone.INTERIM]: 'Interim visit',
};

/** Chip captions for the milestone strip on the Ortho-K board. */
export const MILESTONE_SHORT_LABELS: Record<OrthoKMilestone, string> = {
  [OrthoKMilestone.DAY_1]: '1d',
  [OrthoKMilestone.DAY_2]: '2d',
  [OrthoKMilestone.WEEK_1]: '1w',
  [OrthoKMilestone.MONTH_1]: '1mo',
  [OrthoKMilestone.MONTH_3]: '3mo',
  [OrthoKMilestone.MONTH_6]: '6mo',
  [OrthoKMilestone.ANNUAL]: '1yr',
  [OrthoKMilestone.INTERIM]: '+',
};

/**
 * DONE     a visit was logged for this milestone
 * UPCOMING the due date is still further out than the grace window
 * DUE       inside the grace window either side of the due date
 * OVERDUE  the grace window closed without a visit
 */
export type MilestoneState = 'DONE' | 'UPCOMING' | 'DUE' | 'OVERDUE';

/** A logged follow-up, as much of it as the schedule arithmetic needs. */
export interface VisitLike {
  milestone: OrthoKMilestone;
  visitDate: Date;
}

export interface MilestoneStatus {
  milestone: ScheduledMilestone;
  /** Which annual review this is: 1 for the first, 2 the year after, and so on. Always 1 for the numbered milestones. */
  occurrence: number;
  dueDate: Date;
  state: MilestoneState;
  /** The visit that satisfied the milestone, when state is DONE. */
  visitDate: Date | null;
  /** Days past the due date; 0 unless the state is OVERDUE. */
  daysLate: number;
}

/** Interim visits are logged but never scheduled, so they satisfy no milestone. */
export function isScheduledMilestone(
  milestone: OrthoKMilestone,
): milestone is ScheduledMilestone {
  return (ORTHO_K_SEQUENCE as readonly OrthoKMilestone[]).includes(milestone);
}

/** Midnight local time, so comparisons are by calendar day rather than clock time. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Reads a date the staff typed, as the day they meant.
 *
 * `new Date('2026-08-23')` is parsed as UTC midnight, which west of Greenwich is
 * the previous calendar day locally — enough to shift a whole follow-up sequence
 * a day early. Date-only strings are therefore built in local time; anything
 * carrying a time zone (a full ISO timestamp) is left to the standard parser.
 */
export function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: Date, to: Date): number {
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * When a milestone falls due.
 * @param occurrence Annual reviews repeat, so the second is a year after the first.
 */
export function milestoneDueDate(
  startDate: Date,
  milestone: ScheduledMilestone,
  occurrence = 1,
): Date {
  const { offsetDays } = MILESTONE_SCHEDULE[milestone];
  return addDays(startOfDay(startDate), offsetDays * occurrence);
}

/**
 * The whole follow-up strip for one enrollment: the six numbered checks plus the
 * annual reviews — every one already completed, and the next one still owed.
 *
 * Milestones are scored independently rather than as a chain, so a patient who
 * skipped the one-month check and turned up at three months shows one overdue
 * and one done, which is what the front desk needs to see. Annual reviews only
 * enter the strip once the six-month check is logged, since that is what ends
 * the fitting sequence.
 *
 * @param visits  Every visit logged against the enrollment, in any order.
 * @param asOf    Defaults to today; injected by tests and reports.
 */
export function milestoneStates(
  startDate: Date | null,
  visits: VisitLike[],
  asOf: Date = new Date(),
): MilestoneStatus[] {
  // Until the first night of wear is recorded there is nothing to schedule from.
  if (!startDate) return [];

  const today = startOfDay(asOf);
  const statuses: MilestoneStatus[] = [];

  for (const milestone of ORTHO_K_SEQUENCE) {
    if (milestone === OrthoKMilestone.ANNUAL) continue;
    const visit = visits.find((v) => v.milestone === milestone);
    statuses.push(buildStatus(startDate, milestone, 1, visit?.visitDate ?? null, today));
  }

  const sequenceComplete = statuses.every((s) => s.state === 'DONE');
  if (!sequenceComplete) return statuses;

  // Annual reviews: one entry per review already logged, then the next one owed.
  const annualVisits = visits
    .filter((v) => v.milestone === OrthoKMilestone.ANNUAL)
    .sort((a, b) => a.visitDate.getTime() - b.visitDate.getTime());

  annualVisits.forEach((visit, index) => {
    statuses.push(
      buildStatus(startDate, OrthoKMilestone.ANNUAL, index + 1, visit.visitDate, today),
    );
  });
  statuses.push(
    buildStatus(startDate, OrthoKMilestone.ANNUAL, annualVisits.length + 1, null, today),
  );

  return statuses;
}

function buildStatus(
  startDate: Date,
  milestone: ScheduledMilestone,
  occurrence: number,
  visitDate: Date | null,
  today: Date,
): MilestoneStatus {
  const dueDate = milestoneDueDate(startDate, milestone, occurrence);
  const { windowDays } = MILESTONE_SCHEDULE[milestone];

  if (visitDate) {
    return { milestone, occurrence, dueDate, state: 'DONE', visitDate, daysLate: 0 };
  }

  const daysUntilDue = daysBetween(today, dueDate);
  let state: MilestoneState;
  if (daysUntilDue > windowDays) state = 'UPCOMING';
  else if (daysUntilDue >= -windowDays) state = 'DUE';
  else state = 'OVERDUE';

  return {
    milestone,
    occurrence,
    dueDate,
    state,
    visitDate: null,
    daysLate: state === 'OVERDUE' ? -daysUntilDue : 0,
  };
}

/**
 * The follow-up the practice owes this patient next: the most overdue one if any
 * have been missed, otherwise the earliest still outstanding. Null once every
 * milestone is done, which only happens before an annual review is scheduled.
 */
export function nextMilestone(
  startDate: Date | null,
  visits: VisitLike[],
  asOf: Date = new Date(),
): MilestoneStatus | null {
  const outstanding = milestoneStates(startDate, visits, asOf).filter(
    (s) => s.state !== 'DONE',
  );
  if (outstanding.length === 0) return null;
  return outstanding.reduce((earliest, s) =>
    s.dueDate < earliest.dueDate ? s : earliest,
  );
}

/** True once the six numbered checks are logged, which moves an enrollment to MAINTENANCE. */
export function isSequenceComplete(visits: VisitLike[]): boolean {
  return ORTHO_K_SEQUENCE.filter((m) => m !== OrthoKMilestone.ANNUAL).every((m) =>
    visits.some((v) => v.milestone === m),
  );
}
