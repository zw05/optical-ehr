import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrthoKMilestone, OrthoKStatus, PatientTag, RecallStatus } from '@prisma/client';
import { OrthoKService } from './ortho-k.service';
import { addDays } from './milestones';

const PRACTICE = 'pr-1';
const ACTOR = 'user-1';
/** Far enough into the program that the whole numbered sequence has fallen due. */
const START = addDays(new Date(), -200);

function visit(milestone: OrthoKMilestone, daysIn: number) {
  return { id: `v-${milestone}`, milestone, visitDate: addDays(START, daysIn) };
}

const NUMBERED_VISITS = [
  visit(OrthoKMilestone.DAY_1, 1),
  visit(OrthoKMilestone.DAY_2, 2),
  visit(OrthoKMilestone.WEEK_1, 7),
  visit(OrthoKMilestone.MONTH_1, 30),
  visit(OrthoKMilestone.MONTH_3, 90),
  visit(OrthoKMilestone.MONTH_6, 180),
];

function enrollment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'enr-1',
    practiceId: PRACTICE,
    patientId: 'pat-1',
    status: OrthoKStatus.ACTIVE,
    startDate: START,
    patient: { id: 'pat-1', mrn: 'P1', firstName: 'Ada', lastName: 'Lovelace' },
    visits: [] as ReturnType<typeof visit>[],
    ...overrides,
  };
}

function makeService() {
  const prisma = {
    patient: {
      findFirst: jest.fn().mockResolvedValue({ id: 'pat-1', tags: [] }),
      update: jest.fn().mockResolvedValue({}),
    },
    orthoKEnrollment: {
      findFirst: jest.fn().mockResolvedValue(null),
      findFirstOrThrow: jest.fn().mockResolvedValue(enrollment()),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue(enrollment()),
      update: jest.fn().mockResolvedValue(enrollment()),
    },
    orthoKVisit: {
      findFirst: jest.fn().mockResolvedValue({ id: 'v-1' }),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    recall: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  // Interactive transactions run their callback against the same mock client.
  const client = Object.assign(prisma, {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
  });
  const service = new OrthoKService(client as never);
  return { service, prisma: client };
}

type Mocks = ReturnType<typeof makeService>['prisma'];

/** Reasons of the recall rows written by the most recent syncRecalls call. */
function seededReasons(prisma: Mocks): string[] {
  const calls = prisma.recall.createMany.mock.calls;
  if (calls.length === 0) return [];
  const last = calls[calls.length - 1][0] as { data: { reason: string }[] };
  return last.data.map((r) => r.reason);
}

describe('OrthoKService.enroll', () => {
  it('rejects a patient from another practice', async () => {
    const { service, prisma } = makeService();
    prisma.patient.findFirst.mockResolvedValue(null);
    await expect(service.enroll(PRACTICE, ACTOR, { patientId: 'pat-9' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses a second live enrollment for the same patient', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findFirst.mockResolvedValue({ id: 'enr-old' });
    await expect(service.enroll(PRACTICE, ACTOR, { patientId: 'pat-1' })).rejects.toThrow(
      /already has an active Ortho-K enrollment/,
    );
  });

  it('tags the chart so the patient is identifiable in the ordinary directory', async () => {
    const { service, prisma } = makeService();
    await service.enroll(PRACTICE, ACTOR, { patientId: 'pat-1' });
    expect(prisma.patient.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { tags: { set: [PatientTag.ORTHO_K] } } }),
    );
  });

  it('leaves an already-tagged chart alone and keeps its other tags', async () => {
    const { service, prisma } = makeService();
    prisma.patient.findFirst.mockResolvedValue({
      id: 'pat-1',
      tags: [PatientTag.ORTHO_K, PatientTag.MYOPIA_MANAGEMENT],
    });
    await service.enroll(PRACTICE, ACTOR, { patientId: 'pat-1' });
    expect(prisma.patient.update).not.toHaveBeenCalled();
  });

  it('starts in FITTING without a start date and ACTIVE with one', async () => {
    const { service, prisma } = makeService();

    await service.enroll(PRACTICE, ACTOR, { patientId: 'pat-1' });
    expect(prisma.orthoKEnrollment.create.mock.calls[0][0].data.status).toBe(OrthoKStatus.FITTING);

    await service.enroll(PRACTICE, ACTOR, {
      patientId: 'pat-1',
      startDate: new Date().toISOString(),
    });
    expect(prisma.orthoKEnrollment.create.mock.calls[1][0].data.status).toBe(OrthoKStatus.ACTIVE);
  });

  it('queues a recall for every outstanding follow-up', async () => {
    const { service, prisma } = makeService();
    await service.enroll(PRACTICE, ACTOR, {
      patientId: 'pat-1',
      startDate: START.toISOString(),
    });
    // Six numbered checks outstanding; the annual review is withheld until they are done.
    expect(seededReasons(prisma)).toEqual([
      'Ortho-K — Day 1 follow-up',
      'Ortho-K — Day 2 follow-up',
      'Ortho-K — 1 week follow-up',
      'Ortho-K — 1 month follow-up',
      'Ortho-K — 3 months follow-up',
      'Ortho-K — 6 months follow-up',
    ]);
  });

  it('queues nothing until a start date exists to schedule from', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.create.mockResolvedValue(
      enrollment({ startDate: null, status: OrthoKStatus.FITTING }),
    );
    await service.enroll(PRACTICE, ACTOR, { patientId: 'pat-1' });
    expect(seededReasons(prisma)).toEqual([]);
  });
});

describe('OrthoKService.logVisit', () => {
  it('rejects an enrollment from another practice', async () => {
    const { service } = makeService();
    await expect(
      service.logVisit(PRACTICE, 'enr-1', ACTOR, {
        milestone: OrthoKMilestone.DAY_1,
        visitDate: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a scheduled follow-up before the start date is known', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findFirst.mockResolvedValue(
      enrollment({ startDate: null, status: OrthoKStatus.FITTING }),
    );
    await expect(
      service.logVisit(PRACTICE, 'enr-1', ACTOR, {
        milestone: OrthoKMilestone.DAY_1,
        visitDate: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records a numbered milestone only once', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findFirst.mockResolvedValue(
      enrollment({ visits: [visit(OrthoKMilestone.WEEK_1, 7)] }),
    );
    await expect(
      service.logVisit(PRACTICE, 'enr-1', ACTOR, {
        milestone: OrthoKMilestone.WEEK_1,
        visitDate: new Date().toISOString(),
      }),
    ).rejects.toThrow(/already recorded/);
  });

  it('allows interim visits to repeat', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findFirst.mockResolvedValue(
      enrollment({ visits: [visit(OrthoKMilestone.INTERIM, 4)] }),
    );
    await service.logVisit(PRACTICE, 'enr-1', ACTOR, {
      milestone: OrthoKMilestone.INTERIM,
      visitDate: new Date().toISOString(),
    });
    expect(prisma.orthoKVisit.create).toHaveBeenCalled();
  });

  it('moves the enrollment to maintenance once the six-month check lands', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findFirst.mockResolvedValue(
      enrollment({ visits: NUMBERED_VISITS.slice(0, 5) }),
    );
    await service.logVisit(PRACTICE, 'enr-1', ACTOR, {
      milestone: OrthoKMilestone.MONTH_6,
      visitDate: new Date().toISOString(),
    });
    expect(prisma.orthoKEnrollment.update.mock.calls[0][0].data.status).toBe(
      OrthoKStatus.MAINTENANCE,
    );
  });

  it('keeps the enrollment active while numbered checks remain', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findFirst.mockResolvedValue(enrollment({ visits: [] }));
    await service.logVisit(PRACTICE, 'enr-1', ACTOR, {
      milestone: OrthoKMilestone.DAY_1,
      visitDate: new Date().toISOString(),
    });
    expect(prisma.orthoKEnrollment.update.mock.calls[0][0].data.status).toBe(OrthoKStatus.ACTIVE);
  });

  it('rebuilds the recall queue, dropping the milestone just completed', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findFirst.mockResolvedValue(enrollment({ visits: [] }));
    prisma.orthoKEnrollment.update.mockResolvedValue(
      enrollment({ visits: [visit(OrthoKMilestone.DAY_1, 1)] }),
    );
    await service.logVisit(PRACTICE, 'enr-1', ACTOR, {
      milestone: OrthoKMilestone.DAY_1,
      visitDate: new Date().toISOString(),
    });
    expect(seededReasons(prisma)).not.toContain('Ortho-K — Day 1 follow-up');
    expect(seededReasons(prisma)).toContain('Ortho-K — Day 2 follow-up');
    // Only rows nobody has actioned yet are cleared and rewritten.
    expect(prisma.recall.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: [RecallStatus.PENDING, RecallStatus.CONTACTED] },
        }),
      }),
    );
  });

  it('queues the annual review once the sequence is complete', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findFirst.mockResolvedValue(
      enrollment({ visits: NUMBERED_VISITS.slice(0, 5) }),
    );
    prisma.orthoKEnrollment.update.mockResolvedValue(
      enrollment({ status: OrthoKStatus.MAINTENANCE, visits: NUMBERED_VISITS }),
    );
    await service.logVisit(PRACTICE, 'enr-1', ACTOR, {
      milestone: OrthoKMilestone.MONTH_6,
      visitDate: new Date().toISOString(),
    });
    expect(seededReasons(prisma)).toEqual(['Ortho-K — Annual review follow-up']);
  });
});

describe('OrthoKService.deleteVisit', () => {
  it('rejects a visit from another practice', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKVisit.findFirst.mockResolvedValue(null);
    await expect(service.deleteVisit(PRACTICE, 'enr-1', 'v-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('puts the milestone back on the recall queue', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findFirstOrThrow.mockResolvedValue(enrollment({ visits: [] }));
    await service.deleteVisit(PRACTICE, 'enr-1', 'v-1');
    expect(prisma.orthoKVisit.delete).toHaveBeenCalled();
    expect(seededReasons(prisma)).toContain('Ortho-K — Day 1 follow-up');
  });
});

describe('OrthoKService.update', () => {
  it('starts the sequence when the first night of wear is recorded', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findFirst.mockResolvedValue({
      id: 'enr-1',
      startDate: null,
      status: OrthoKStatus.FITTING,
    });
    await service.update(PRACTICE, 'enr-1', { startDate: START.toISOString() });
    expect(prisma.orthoKEnrollment.update.mock.calls[0][0].data.status).toBe(OrthoKStatus.ACTIVE);
  });

  it('starts the sequence even when the edit resubmits FITTING unchanged', async () => {
    // The detail page's edit form posts every field, including the current status.
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findFirst.mockResolvedValue({
      id: 'enr-1',
      startDate: null,
      status: OrthoKStatus.FITTING,
    });
    await service.update(PRACTICE, 'enr-1', {
      startDate: START.toISOString(),
      status: OrthoKStatus.FITTING,
    });
    expect(prisma.orthoKEnrollment.update.mock.calls[0][0].data.status).toBe(OrthoKStatus.ACTIVE);
  });

  it('honours an explicit status that is not FITTING when a start date is set', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findFirst.mockResolvedValue({
      id: 'enr-1',
      startDate: null,
      status: OrthoKStatus.FITTING,
    });
    await service.update(PRACTICE, 'enr-1', {
      startDate: START.toISOString(),
      status: OrthoKStatus.ON_HOLD,
    });
    expect(prisma.orthoKEnrollment.update.mock.calls[0][0].data.status).toBe(OrthoKStatus.ON_HOLD);
  });

  it('leaves the status alone when no start date is involved', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findFirst.mockResolvedValue({
      id: 'enr-1',
      startDate: START,
      status: OrthoKStatus.ACTIVE,
    });
    await service.update(PRACTICE, 'enr-1', { notes: 'Parent prefers morning visits' });
    expect(prisma.orthoKEnrollment.update.mock.calls[0][0].data.status).toBeUndefined();
  });

  it('clears the recall queue when an enrollment is discontinued', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findFirst.mockResolvedValue({
      id: 'enr-1',
      startDate: START,
      status: OrthoKStatus.ACTIVE,
    });
    prisma.orthoKEnrollment.update.mockResolvedValue(
      enrollment({ status: OrthoKStatus.DISCONTINUED }),
    );
    await service.update(PRACTICE, 'enr-1', { status: OrthoKStatus.DISCONTINUED });
    expect(prisma.recall.deleteMany).toHaveBeenCalled();
    expect(seededReasons(prisma)).toEqual([]);
  });
});

describe('OrthoKService.board and notifications', () => {
  it('resolves each enrollment against today and ranks the worst slip first', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findMany.mockResolvedValue([
      // Day 1 missed by nearly 200 days.
      enrollment({ id: 'enr-late', visits: [] }),
      // Only the six-month check outstanding, still inside its 21-day window.
      enrollment({ id: 'enr-near', visits: NUMBERED_VISITS.slice(0, 5) }),
    ]);

    const board = await service.board(PRACTICE);
    expect(board[0].next).toMatchObject({
      milestone: OrthoKMilestone.DAY_1,
      state: 'OVERDUE',
    });

    const notes = await service.notifications(PRACTICE);
    expect(notes.overdueCount).toBe(1);
    expect(notes.dueCount).toBe(1);
    // Overdue leads, due follows.
    expect(notes.rows.map((r) => r.id)).toEqual(['enr-late', 'enr-near']);
  });

  it('filters the board by follow-up state', async () => {
    const { service, prisma } = makeService();
    prisma.orthoKEnrollment.findMany.mockResolvedValue([
      enrollment({ id: 'enr-late', visits: [] }),
      enrollment({ id: 'enr-fresh', startDate: new Date(), visits: [] }),
    ]);
    const overdue = await service.board(PRACTICE, { state: 'OVERDUE' });
    expect(overdue.map((r) => r.id)).toEqual(['enr-late']);
  });

  it('scopes every board query to the practice', async () => {
    const { service, prisma } = makeService();
    await service.board(PRACTICE, { q: 'love' });
    const where = prisma.orthoKEnrollment.findMany.mock.calls[0][0].where;
    expect(where.practiceId).toBe(PRACTICE);
  });
});
