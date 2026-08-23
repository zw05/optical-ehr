import { OrthoKMilestone } from '@prisma/client';
import {
  addDays,
  isScheduledMilestone,
  isSequenceComplete,
  milestoneDueDate,
  milestoneStates,
  nextMilestone,
  ORTHO_K_SEQUENCE,
  startOfDay,
  type MilestoneState,
  type VisitLike,
} from './milestones';

const START = new Date(2026, 0, 1); // 1 Jan 2026, local midnight

/** The date a patient `days` into the program would be seen. */
function day(days: number): Date {
  return addDays(START, days);
}

function visit(milestone: OrthoKMilestone, days: number): VisitLike {
  return { milestone, visitDate: day(days) };
}

/** The six numbered checks, logged on the day each falls due. */
const NUMBERED_VISITS: VisitLike[] = [
  visit(OrthoKMilestone.DAY_1, 1),
  visit(OrthoKMilestone.DAY_2, 2),
  visit(OrthoKMilestone.WEEK_1, 7),
  visit(OrthoKMilestone.MONTH_1, 30),
  visit(OrthoKMilestone.MONTH_3, 90),
  visit(OrthoKMilestone.MONTH_6, 180),
];

/** State of one milestone on a given day of the program. */
function stateOn(
  milestone: OrthoKMilestone,
  dayOfProgram: number,
  visits: VisitLike[] = [],
): MilestoneState | undefined {
  return milestoneStates(START, visits, day(dayOfProgram)).find(
    (s) => s.milestone === milestone,
  )?.state;
}

describe('milestoneDueDate', () => {
  it('places each numbered check at its offset from the first night of wear', () => {
    expect(milestoneDueDate(START, OrthoKMilestone.DAY_1)).toEqual(day(1));
    expect(milestoneDueDate(START, OrthoKMilestone.DAY_2)).toEqual(day(2));
    expect(milestoneDueDate(START, OrthoKMilestone.WEEK_1)).toEqual(day(7));
    expect(milestoneDueDate(START, OrthoKMilestone.MONTH_1)).toEqual(day(30));
    expect(milestoneDueDate(START, OrthoKMilestone.MONTH_3)).toEqual(day(90));
    expect(milestoneDueDate(START, OrthoKMilestone.MONTH_6)).toEqual(day(180));
  });

  it('repeats annual reviews a year apart', () => {
    expect(milestoneDueDate(START, OrthoKMilestone.ANNUAL, 1)).toEqual(day(365));
    expect(milestoneDueDate(START, OrthoKMilestone.ANNUAL, 2)).toEqual(day(730));
  });

  it('ignores the clock time on the start date', () => {
    const afternoon = new Date(2026, 0, 1, 16, 45);
    expect(milestoneDueDate(afternoon, OrthoKMilestone.WEEK_1)).toEqual(day(7));
  });
});

describe('milestoneStates window boundaries', () => {
  it('treats the day-1 check as due only on the morning after the first night', () => {
    expect(stateOn(OrthoKMilestone.DAY_1, 0)).toBe('UPCOMING');
    expect(stateOn(OrthoKMilestone.DAY_1, 1)).toBe('DUE');
    expect(stateOn(OrthoKMilestone.DAY_1, 2)).toBe('OVERDUE');
  });

  it('opens the one-week check three days early and closes it three days late', () => {
    expect(stateOn(OrthoKMilestone.WEEK_1, 3)).toBe('UPCOMING');
    expect(stateOn(OrthoKMilestone.WEEK_1, 4)).toBe('DUE');
    expect(stateOn(OrthoKMilestone.WEEK_1, 10)).toBe('DUE');
    expect(stateOn(OrthoKMilestone.WEEK_1, 11)).toBe('OVERDUE');
  });

  it('gives the six-month review three weeks either side', () => {
    expect(stateOn(OrthoKMilestone.MONTH_6, 158)).toBe('UPCOMING');
    expect(stateOn(OrthoKMilestone.MONTH_6, 159)).toBe('DUE');
    expect(stateOn(OrthoKMilestone.MONTH_6, 201)).toBe('DUE');
    expect(stateOn(OrthoKMilestone.MONTH_6, 202)).toBe('OVERDUE');
  });

  it('counts days late from the due date, not from the end of the window', () => {
    const status = milestoneStates(START, [], day(20)).find(
      (s) => s.milestone === OrthoKMilestone.WEEK_1,
    );
    expect(status).toMatchObject({ state: 'OVERDUE', daysLate: 13 });
  });

  it('reports a logged milestone as done however late the visit was', () => {
    const late = [visit(OrthoKMilestone.DAY_1, 30)];
    expect(stateOn(OrthoKMilestone.DAY_1, 60, late)).toBe('DONE');
    const status = milestoneStates(START, late, day(60))[0];
    expect(status).toMatchObject({ visitDate: day(30), daysLate: 0 });
  });

  it('scores milestones independently, so a skipped check does not hide a due one', () => {
    // Month 1 never happened; the patient turns up at month 3.
    const visits = [visit(OrthoKMilestone.MONTH_3, 90)];
    expect(stateOn(OrthoKMilestone.MONTH_1, 90, visits)).toBe('OVERDUE');
    expect(stateOn(OrthoKMilestone.MONTH_3, 90, visits)).toBe('DONE');
  });
});

describe('milestoneStates sequence shape', () => {
  it('returns nothing until the first night of wear is recorded', () => {
    expect(milestoneStates(null, [], day(400))).toEqual([]);
    expect(nextMilestone(null, [], day(400))).toBeNull();
  });

  it('withholds annual reviews until the six numbered checks are logged', () => {
    const partial = NUMBERED_VISITS.slice(0, 5);
    const before = milestoneStates(START, partial, day(400));
    expect(before.map((s) => s.milestone)).not.toContain(OrthoKMilestone.ANNUAL);

    const after = milestoneStates(START, NUMBERED_VISITS, day(400));
    expect(after.filter((s) => s.milestone === OrthoKMilestone.ANNUAL)).toHaveLength(1);
  });

  it('schedules the following year once an annual review is logged', () => {
    const visits = [...NUMBERED_VISITS, visit(OrthoKMilestone.ANNUAL, 365)];
    const annual = milestoneStates(START, visits, day(400)).filter(
      (s) => s.milestone === OrthoKMilestone.ANNUAL,
    );
    expect(annual).toHaveLength(2);
    expect(annual[0]).toMatchObject({ occurrence: 1, state: 'DONE' });
    expect(annual[1]).toMatchObject({ occurrence: 2, dueDate: day(730), state: 'UPCOMING' });
  });

  it('never lets an interim visit satisfy a numbered milestone', () => {
    const visits = [visit(OrthoKMilestone.INTERIM, 7)];
    expect(stateOn(OrthoKMilestone.WEEK_1, 7, visits)).toBe('DUE');
    expect(stateOn(OrthoKMilestone.WEEK_1, 30, visits)).toBe('OVERDUE');
    expect(isScheduledMilestone(OrthoKMilestone.INTERIM)).toBe(false);
    expect(milestoneStates(START, visits, day(7)).map((s) => s.milestone)).not.toContain(
      OrthoKMilestone.INTERIM,
    );
  });

  it('covers every scheduled milestone in order', () => {
    const shown = milestoneStates(START, NUMBERED_VISITS, day(400)).map((s) => s.milestone);
    expect(shown).toEqual([...ORTHO_K_SEQUENCE]);
  });
});

describe('nextMilestone', () => {
  it('names the day-1 check as soon as the enrollment starts, before it is due', () => {
    // The board must show a same-day enrollment immediately, not after an overnight job.
    expect(nextMilestone(START, [], START)).toMatchObject({
      milestone: OrthoKMilestone.DAY_1,
      state: 'UPCOMING',
      dueDate: day(1),
    });
    expect(nextMilestone(START, [], day(1))).toMatchObject({
      milestone: OrthoKMilestone.DAY_1,
      state: 'DUE',
    });
  });

  it('prefers the oldest missed check over a nearer upcoming one', () => {
    // Day 1 and 2 done; week 1 missed; the patient is now 25 days in.
    const visits = NUMBERED_VISITS.slice(0, 2);
    expect(nextMilestone(START, visits, day(25))).toMatchObject({
      milestone: OrthoKMilestone.WEEK_1,
      state: 'OVERDUE',
    });
  });

  it('falls through to the annual review once the sequence is complete', () => {
    expect(nextMilestone(START, NUMBERED_VISITS, day(200))).toMatchObject({
      milestone: OrthoKMilestone.ANNUAL,
      occurrence: 1,
      state: 'UPCOMING',
    });
  });
});

describe('isSequenceComplete', () => {
  it('is false while any numbered check is outstanding', () => {
    expect(isSequenceComplete(NUMBERED_VISITS.slice(0, 5))).toBe(false);
  });

  it('is true once all six are logged, ignoring interim visits', () => {
    expect(isSequenceComplete(NUMBERED_VISITS)).toBe(true);
    expect(isSequenceComplete([visit(OrthoKMilestone.INTERIM, 4)])).toBe(false);
  });
});

describe('startOfDay', () => {
  it('strips the clock time so comparisons are by calendar day', () => {
    expect(startOfDay(new Date(2026, 4, 9, 23, 59))).toEqual(new Date(2026, 4, 9));
  });
});
