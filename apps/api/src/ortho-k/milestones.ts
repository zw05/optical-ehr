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
  OrthoKMilestone.SEMIANNUAL,
] as const;

export type ScheduledMilestone = (typeof ORTHO_K_SEQUENCE)[number];

/**
 * Days to the check, and the grace window either side before it counts as
 * missed. The early checks are deliberately tight: a day-1 visit that slips a
 * day is a real miss, while a six-month review three weeks out is on schedule.
 *
 * The numbered milestones count from the first night of wear. SEMIANNUAL is the
 * exception: it recurs for as long as the patient stays in the program, so its
 * offset counts from their last visit rather than from a fixed anchor.
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
  [OrthoKMilestone.SEMIANNUAL]: { offsetDays: 180, windowDays: 30 },
};

export const MILESTONE_LABELS: Record<OrthoKMilestone, string> = {
  [OrthoKMilestone.DAY_1]: 'Day 1',
  [OrthoKMilestone.DAY_2]: 'Day 2',
  [OrthoKMilestone.WEEK_1]: '1 week',
  [OrthoKMilestone.MONTH_1]: '1 month',
  [OrthoKMilestone.MONTH_3]: '3 months',
  [OrthoKMilestone.MONTH_6]: '6 months',
  [OrthoKMilestone.SEMIANNUAL]: '6-month check',
  [OrthoKMilestone.INTERIM]: 'Interim visit',
  [OrthoKMilestone.NEW_LENSES]: 'New lenses',
};

/** Chip captions for the milestone strip on the Ortho-K board. */
export const MILESTONE_SHORT_LABELS: Record<OrthoKMilestone, string> = {
  [OrthoKMilestone.DAY_1]: '1d',
  [OrthoKMilestone.DAY_2]: '2d',
  [OrthoKMilestone.WEEK_1]: '1w',
  [OrthoKMilestone.MONTH_1]: '1mo',
  [OrthoKMilestone.MONTH_3]: '3mo',
  [OrthoKMilestone.MONTH_6]: '6mo',
  [OrthoKMilestone.SEMIANNUAL]: '+6mo',
  [OrthoKMilestone.INTERIM]: '+',
  [OrthoKMilestone.NEW_LENSES]: 'Rx',
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
 * When a numbered milestone falls due, counting from the first night of wear.
 * The recurring six-month check is not covered here: it rolls from the patient's
 * last visit, so it is derived in {@link milestoneStates} instead.
 */
export function milestoneDueDate(startDate: Date, milestone: ScheduledMilestone): Date {
  const { offsetDays } = MILESTONE_SCHEDULE[milestone];
  return addDays(startOfDay(startDate), offsetDays);
}

/** Visits that count as the patient coming back; interim checks do not reset the clock. */
function resetsRecurringClock(visit: VisitLike): boolean {
  return visit.milestone !== OrthoKMilestone.INTERIM;
}

/**
 * The whole follow-up strip for one enrollment: the six numbered checks, then the
 * recurring six-month checks — every one already completed, and the next one owed.
 *
 * Milestones are scored independently rather than as a chain, so a patient who
 * skipped the one-month check and turned up at three months shows one overdue
 * and one done, which is what the front desk needs to see.
 *
 * The recurring check only enters the strip once the numbered sequence is
 * complete, and is dated six months from the patient's last real visit rather
 * than from a fixed calendar: a patient seen late simply moves the next check
 * out by the same amount. Interim visits are excluded from that anchor, so a
 * lens problem squeezed in between checks does not push the next one back.
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
    if (milestone === OrthoKMilestone.SEMIANNUAL) continue;
    const visit = visits.find((v) => v.milestone === milestone);
    statuses.push(
      buildStatus(
        milestone,
        1,
        milestoneDueDate(startDate, milestone),
        visit?.visitDate ?? null,
        today,
      ),
    );
  }

  const sequenceComplete = statuses.every((s) => s.state === 'DONE');
  if (!sequenceComplete) return statuses;

  // One entry per recurring check already done, each dated when it happened.
  const recurring = visits
    .filter((v) => v.milestone === OrthoKMilestone.SEMIANNUAL)
    .sort((a, b) => a.visitDate.getTime() - b.visitDate.getTime());

  recurring.forEach((visit, index) => {
    statuses.push(
      buildStatus(OrthoKMilestone.SEMIANNUAL, index + 1, visit.visitDate, visit.visitDate, today),
    );
  });

  // Then the next one owed, six months on from when they were last seen.
  const anchor = visits
    .filter(resetsRecurringClock)
    .reduce(
      (latest, v) => (latest === null || v.visitDate > latest ? v.visitDate : latest),
      null as Date | null,
    );
  const { offsetDays } = MILESTONE_SCHEDULE[OrthoKMilestone.SEMIANNUAL];
  statuses.push(
    buildStatus(
      OrthoKMilestone.SEMIANNUAL,
      recurring.length + 1,
      addDays(startOfDay(anchor ?? startDate), offsetDays),
      null,
      today,
    ),
  );

  return statuses;
}

function buildStatus(
  milestone: ScheduledMilestone,
  occurrence: number,
  dueDate: Date,
  visitDate: Date | null,
  today: Date,
): MilestoneStatus {
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
 * have been missed, otherwise the earliest still outstanding. Null only before a
 * start date exists, since the recurring check never runs out.
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
  return ORTHO_K_SEQUENCE.filter((m) => m !== OrthoKMilestone.SEMIANNUAL).every((m) =>
    visits.some((v) => v.milestone === m),
  );
}

/**
 * Which year of the program the patient is in, counted by how many times they
 * have been given lenses: the original pair is year 1, and every NEW_LENSES
 * visit starts the next year. Derived rather than stored so back-dating a
 * renewal that was missed at the time corrects the count immediately.
 */
export function programYear(visits: VisitLike[]): number {
  return 1 + visits.filter((v) => v.milestone === OrthoKMilestone.NEW_LENSES).length;
}
