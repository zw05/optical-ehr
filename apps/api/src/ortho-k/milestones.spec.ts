import { OrthoKMilestone } from '@prisma/client';
import {
  addDays,
  isScheduledMilestone,
  isSequenceComplete,
  milestoneDueDate,
  milestoneStates,
  nextMilestone,
  ORTHO_K_SEQUENCE,
  parseDateOnly,
  programYear,
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

  it('withholds the recurring check until the six numbered checks are logged', () => {
    const partial = NUMBERED_VISITS.slice(0, 5);
    const before = milestoneStates(START, partial, day(400));
    expect(before.map((s) => s.milestone)).not.toContain(OrthoKMilestone.SEMIANNUAL);

    const after = milestoneStates(START, NUMBERED_VISITS, day(400));
    expect(after.filter((s) => s.milestone === OrthoKMilestone.SEMIANNUAL)).toHaveLength(1);
  });

  it('dates the recurring check six months from the last visit, not from the start', () => {
    // Six-month check happened on day 180, so the next one is owed on day 360.
    const recurring = milestoneStates(START, NUMBERED_VISITS, day(200)).filter(
      (s) => s.milestone === OrthoKMilestone.SEMIANNUAL,
    );
    expect(recurring).toHaveLength(1);
    expect(recurring[0]).toMatchObject({ occurrence: 1, dueDate: day(360), state: 'UPCOMING' });
  });

  it('rolls the next check forward from a late visit rather than stacking them up', () => {
    // Seen on day 400 instead of day 360; the next one is 6 months from that visit.
    const visits = [...NUMBERED_VISITS, visit(OrthoKMilestone.SEMIANNUAL, 400)];
    const recurring = milestoneStates(START, visits, day(410)).filter(
      (s) => s.milestone === OrthoKMilestone.SEMIANNUAL,
    );
    expect(recurring).toHaveLength(2);
    expect(recurring[0]).toMatchObject({ occurrence: 1, state: 'DONE', visitDate: day(400) });
    expect(recurring[1]).toMatchObject({ occurrence: 2, dueDate: day(580), state: 'UPCOMING' });
  });

  it('keeps recurring checks coming indefinitely', () => {
    const visits = [
      ...NUMBERED_VISITS,
      visit(OrthoKMilestone.SEMIANNUAL, 360),
      visit(OrthoKMilestone.SEMIANNUAL, 540),
      visit(OrthoKMilestone.SEMIANNUAL, 720),
    ];
    const recurring = milestoneStates(START, visits, day(730)).filter(
      (s) => s.milestone === OrthoKMilestone.SEMIANNUAL,
    );
    expect(recurring).toHaveLength(4);
    expect(recurring[3]).toMatchObject({ occurrence: 4, dueDate: day(900) });
  });

  it('does not let an interim visit push the next recurring check back', () => {
    // A lens problem seen on day 300 must not delay the check owed on day 360.
    const visits = [...NUMBERED_VISITS, visit(OrthoKMilestone.INTERIM, 300)];
    const next = milestoneStates(START, visits, day(310)).find(
      (s) => s.milestone === OrthoKMilestone.SEMIANNUAL && s.state !== 'DONE',
    );
    expect(next).toMatchObject({ dueDate: day(360) });
  });

  it('counts a lens renewal as the patient coming back', () => {
    const visits = [...NUMBERED_VISITS, visit(OrthoKMilestone.NEW_LENSES, 365)];
    const next = milestoneStates(START, visits, day(370)).find(
      (s) => s.milestone === OrthoKMilestone.SEMIANNUAL && s.state !== 'DONE',
    );
    expect(next).toMatchObject({ dueDate: day(545) });
  });

  it('never lets a lens renewal satisfy a numbered milestone', () => {
    const visits = [visit(OrthoKMilestone.NEW_LENSES, 7)];
    expect(stateOn(OrthoKMilestone.WEEK_1, 7, visits)).toBe('DUE');
    expect(isScheduledMilestone(OrthoKMilestone.NEW_LENSES)).toBe(false);
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

  it('falls through to the recurring check once the sequence is complete', () => {
    expect(nextMilestone(START, NUMBERED_VISITS, day(200))).toMatchObject({
      milestone: OrthoKMilestone.SEMIANNUAL,
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

describe('programYear', () => {
  it('counts the original lenses as year one', () => {
    expect(programYear([])).toBe(1);
    expect(programYear(NUMBERED_VISITS)).toBe(1);
  });

  it('advances a year for every lens renewal', () => {
    const visits = [
      ...NUMBERED_VISITS,
      visit(OrthoKMilestone.NEW_LENSES, 365),
      visit(OrthoKMilestone.NEW_LENSES, 730),
    ];
    expect(programYear(visits)).toBe(3);
  });

  it('ignores ordinary follow-ups', () => {
    const visits = [
      ...NUMBERED_VISITS,
      visit(OrthoKMilestone.SEMIANNUAL, 360),
      visit(OrthoKMilestone.INTERIM, 400),
    ];
    expect(programYear(visits)).toBe(1);
  });
});

describe('parseDateOnly', () => {
  it('reads a date-only string as the day the staff typed', () => {
    // `new Date('2026-08-23')` is UTC midnight, which west of Greenwich falls on
    // the 22nd locally and shifts the whole follow-up sequence a day early.
    expect(parseDateOnly('2026-08-23')).toEqual(new Date(2026, 7, 23));
    expect(parseDateOnly(' 2026-01-01 ')).toEqual(new Date(2026, 0, 1));
  });

  it('leaves a full timestamp to the standard parser', () => {
    const iso = '2026-08-23T14:30:00.000Z';
    expect(parseDateOnly(iso)).toEqual(new Date(iso));
  });

  it('keeps a date-entered start date on schedule', () => {
    const start = parseDateOnly('2026-08-23');
    expect(milestoneDueDate(start, OrthoKMilestone.DAY_1)).toEqual(new Date(2026, 7, 24));
    // The day-1 check is not yet due on the evening the patient starts wearing.
    expect(
      milestoneStates(start, [], new Date(2026, 7, 23)).find(
        (s) => s.milestone === OrthoKMilestone.DAY_1,
      )?.state,
    ).toBe('UPCOMING');
  });
});

describe('startOfDay', () => {
  it('strips the clock time so comparisons are by calendar day', () => {
    expect(startOfDay(new Date(2026, 4, 9, 23, 59))).toEqual(new Date(2026, 4, 9));
  });
});
