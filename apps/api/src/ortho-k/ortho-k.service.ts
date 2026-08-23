import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  OrthoKMilestone,
  OrthoKStatus,
  PatientTag,
  Prisma,
  RecallStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollOrthoKDto, LogOrthoKVisitDto, UpdateOrthoKDto } from './ortho-k.dto';
import {
  isScheduledMilestone,
  isSequenceComplete,
  MILESTONE_LABELS,
  milestoneStates,
  nextMilestone,
  parseDateOnly,
  type MilestoneState,
  type MilestoneStatus,
} from './milestones';

/** Recall rows this module owns are tagged by reason prefix, since Recall has no FK to an enrollment. */
const RECALL_PREFIX = 'Ortho-K — ';

/** Statuses whose follow-up sequence is still running. */
const LIVE_STATUSES: OrthoKStatus[] = [
  OrthoKStatus.FITTING,
  OrthoKStatus.ACTIVE,
  OrthoKStatus.MAINTENANCE,
];

const ENROLLMENT_INCLUDE = {
  patient: {
    select: {
      id: true,
      mrn: true,
      firstName: true,
      lastName: true,
      phone: true,
      preferredContact: true,
    },
  },
  visits: {
    orderBy: { visitDate: 'desc' as const },
    include: { recordedBy: { select: { firstName: true, lastName: true } } },
  },
} satisfies Prisma.OrthoKEnrollmentInclude;

type EnrollmentRow = Prisma.OrthoKEnrollmentGetPayload<{ include: typeof ENROLLMENT_INCLUDE }>;

export interface OrthoKBoardFilters {
  status?: OrthoKStatus;
  state?: 'OVERDUE' | 'DUE' | 'UPCOMING';
  q?: string;
}

/** An enrollment with its follow-up sequence resolved against today's date. */
export type OrthoKBoardRow = EnrollmentRow & {
  milestones: MilestoneStatus[];
  next: MilestoneStatus | null;
};

/**
 * The orthokeratology program board.
 *
 * Ortho-K exams stay in the physical folder, so nothing here records clinical
 * findings: an enrollment carries the lens parameters and where the paper chart
 * lives, and a visit records only that a follow-up happened on a given date.
 * What is due next is derived from the start date on every read (see
 * `milestones.ts`) rather than stored, so it cannot drift.
 *
 * Follow-ups are also written into the shared {@link Recall} queue, which puts
 * them in front of the front desk alongside every other kind of outreach
 * instead of in a second place staff have to remember to check.
 */
@Injectable()
export class OrthoKService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Starts a patient on the program, tags the chart so the tag shows in the
   * ordinary patient directory, and queues the follow-up recalls.
   *
   * A patient may hold only one live enrollment; restarting after
   * discontinuation creates a second one so the first sequence stays intact.
   */
  async enroll(practiceId: string, actorId: string, dto: EnrollOrthoKDto) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, practiceId },
      select: { id: true, tags: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    const live = await this.prisma.orthoKEnrollment.findFirst({
      where: { practiceId, patientId: dto.patientId, status: { in: LIVE_STATUSES } },
      select: { id: true },
    });
    if (live) {
      throw new BadRequestException('Patient already has an active Ortho-K enrollment');
    }

    const startDate = dto.startDate ? parseDateOnly(dto.startDate) : null;

    return this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.orthoKEnrollment.create({
        data: {
          practiceId,
          patientId: dto.patientId,
          startedById: actorId,
          startDate,
          status: startDate ? OrthoKStatus.ACTIVE : OrthoKStatus.FITTING,
          eyes: dto.eyes,
          lensBrand: dto.lensBrand,
          lensDesign: dto.lensDesign,
          lensParams: dto.lensParams,
          notes: dto.notes,
        },
        include: ENROLLMENT_INCLUDE,
      });

      // The tag is what makes the patient identifiable as Ortho-K everywhere
      // else in the app, so enrolling applies it rather than relying on staff.
      if (!patient.tags.includes(PatientTag.ORTHO_K)) {
        await tx.patient.update({
          where: { id: patient.id },
          data: { tags: { set: [...patient.tags, PatientTag.ORTHO_K] } },
        });
      }

      await this.syncRecalls(tx, enrollment);
      return this.withSchedule(enrollment);
    });
  }

  /**
   * The program board: every enrollment with its follow-up sequence resolved.
   *
   * Discontinued enrollments are excluded unless asked for by status, since the
   * board is a work queue rather than a history.
   */
  async board(practiceId: string, filters: OrthoKBoardFilters = {}): Promise<OrthoKBoardRow[]> {
    const q = filters.q?.trim();
    const rows = await this.prisma.orthoKEnrollment.findMany({
      where: {
        practiceId,
        status: filters.status ?? { in: LIVE_STATUSES },
        ...(q
          ? {
              patient: {
                OR: [
                  { firstName: { contains: q, mode: 'insensitive' } },
                  { lastName: { contains: q, mode: 'insensitive' } },
                  { mrn: { contains: q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: ENROLLMENT_INCLUDE,
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    });

    const resolved = rows.map((row) => this.withSchedule(row));
    if (!filters.state) return resolved;
    return resolved.filter((row) => row.next?.state === filters.state);
  }

  /** One enrollment with its full visit history, newest visit first. */
  async get(practiceId: string, id: string): Promise<OrthoKBoardRow> {
    const enrollment = await this.prisma.orthoKEnrollment.findFirst({
      where: { id, practiceId },
      include: ENROLLMENT_INCLUDE,
    });
    if (!enrollment) throw new NotFoundException('Ortho-K enrollment not found');
    return this.withSchedule(enrollment);
  }

  /**
   * Edits the lens details, notes, status, or start date.
   * Changing the start date re-dates the whole sequence, so the queued recalls
   * are rebuilt to match.
   */
  async update(practiceId: string, id: string, dto: UpdateOrthoKDto): Promise<OrthoKBoardRow> {
    const existing = await this.prisma.orthoKEnrollment.findFirst({
      where: { id, practiceId },
      select: { id: true, startDate: true, status: true },
    });
    if (!existing) throw new NotFoundException('Ortho-K enrollment not found');

    const startDate = dto.startDate !== undefined ? parseDateOnly(dto.startDate) : undefined;

    // Recording the first night of wear is what moves a fitting into the sequence.
    // The check is made against the status the edit would leave in place, not just
    // an explicitly chosen one: an edit form that resubmits the current status
    // unchanged must not strand a started enrollment on FITTING.
    const requested = dto.status ?? existing.status;
    const status =
      startDate && requested === OrthoKStatus.FITTING ? OrthoKStatus.ACTIVE : dto.status;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.orthoKEnrollment.update({
        where: { id },
        data: {
          ...(startDate !== undefined ? { startDate } : {}),
          ...(status ? { status } : {}),
          ...(dto.eyes !== undefined ? { eyes: dto.eyes } : {}),
          ...(dto.lensBrand !== undefined ? { lensBrand: dto.lensBrand } : {}),
          ...(dto.lensDesign !== undefined ? { lensDesign: dto.lensDesign } : {}),
          ...(dto.lensParams !== undefined ? { lensParams: dto.lensParams } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
        include: ENROLLMENT_INCLUDE,
      });
      await this.syncRecalls(tx, updated);
      return this.withSchedule(updated);
    });
  }

  /**
   * Records a follow-up that happened. Completing the six numbered checks moves
   * the enrollment onto annual review.
   *
   * Numbered milestones are recorded once; INTERIM and ANNUAL repeat.
   */
  async logVisit(
    practiceId: string,
    id: string,
    actorId: string,
    dto: LogOrthoKVisitDto,
  ): Promise<OrthoKBoardRow> {
    const enrollment = await this.prisma.orthoKEnrollment.findFirst({
      where: { id, practiceId },
      include: ENROLLMENT_INCLUDE,
    });
    if (!enrollment) throw new NotFoundException('Ortho-K enrollment not found');
    if (!enrollment.startDate && isScheduledMilestone(dto.milestone)) {
      throw new BadRequestException(
        'Set the enrollment start date before logging a scheduled follow-up',
      );
    }

    const repeatable =
      dto.milestone === OrthoKMilestone.INTERIM || dto.milestone === OrthoKMilestone.ANNUAL;
    if (!repeatable && enrollment.visits.some((v) => v.milestone === dto.milestone)) {
      throw new BadRequestException(
        `${MILESTONE_LABELS[dto.milestone]} follow-up is already recorded`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.orthoKVisit.create({
        data: {
          enrollmentId: id,
          milestone: dto.milestone,
          visitDate: parseDateOnly(dto.visitDate),
          note: dto.note,
          recordedById: actorId,
        },
      });

      const visits = [
        ...enrollment.visits,
        { milestone: dto.milestone, visitDate: parseDateOnly(dto.visitDate) },
      ];

      // Finishing the six-month check ends the fitting sequence.
      const status =
        enrollment.status === OrthoKStatus.ACTIVE && isSequenceComplete(visits)
          ? OrthoKStatus.MAINTENANCE
          : enrollment.status;

      const refreshed = await tx.orthoKEnrollment.update({
        where: { id },
        data: { status },
        include: ENROLLMENT_INCLUDE,
      });
      await this.syncRecalls(tx, refreshed);
      return this.withSchedule(refreshed);
    });
  }

  /**
   * Removes a logged visit — a mistyped date, or one filed against the wrong
   * enrollment. The milestone falls due again.
   */
  async deleteVisit(practiceId: string, id: string, visitId: string): Promise<OrthoKBoardRow> {
    const visit = await this.prisma.orthoKVisit.findFirst({
      where: { id: visitId, enrollmentId: id, enrollment: { practiceId } },
      select: { id: true },
    });
    if (!visit) throw new NotFoundException('Ortho-K visit not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.orthoKVisit.delete({ where: { id: visitId } });
      const refreshed = await tx.orthoKEnrollment.findFirstOrThrow({
        where: { id },
        include: ENROLLMENT_INCLUDE,
      });
      await this.syncRecalls(tx, refreshed);
      return this.withSchedule(refreshed);
    });
  }

  /**
   * Counts and rows behind the nav badge and dashboard panel: follow-ups that
   * have slipped, then those due now. Derived on read, so a patient enrolled
   * this morning is counted this morning.
   */
  async notifications(practiceId: string) {
    const rows = await this.board(practiceId);
    const byState = (state: MilestoneState) => rows.filter((r) => r.next?.state === state);
    const overdue = byState('OVERDUE');
    const due = byState('DUE');
    return {
      overdueCount: overdue.length,
      dueCount: due.length,
      // Most overdue first, so the worst-slipped patient leads the panel.
      rows: [...overdue.sort((a, b) => (b.next?.daysLate ?? 0) - (a.next?.daysLate ?? 0)), ...due],
    };
  }

  /** Resolves the stored enrollment against today: which checks are done, due, or missed. */
  private withSchedule(enrollment: EnrollmentRow): OrthoKBoardRow {
    const visits = enrollment.visits.map((v) => ({
      milestone: v.milestone,
      visitDate: v.visitDate,
    }));
    return {
      ...enrollment,
      milestones: milestoneStates(enrollment.startDate, visits),
      next: nextMilestone(enrollment.startDate, visits),
    };
  }

  /**
   * Rebuilds this enrollment's rows in the shared recall queue so they always
   * match the derived schedule.
   *
   * Every outstanding milestone gets a recall dated when it falls due, rather
   * than one recall at a time: the recalls page already filters by horizon, so
   * future checks stay out of sight until they approach, and a missed check
   * cannot strand the ones behind it. Rows staff have already actioned
   * (SCHEDULED, DISMISSED) are left alone.
   */
  private async syncRecalls(tx: Prisma.TransactionClient, enrollment: EnrollmentRow) {
    await tx.recall.deleteMany({
      where: {
        patientId: enrollment.patientId,
        reason: { startsWith: RECALL_PREFIX },
        status: { in: [RecallStatus.PENDING, RecallStatus.CONTACTED] },
      },
    });

    if (!LIVE_STATUSES.includes(enrollment.status)) return;

    const visits = enrollment.visits.map((v) => ({
      milestone: v.milestone,
      visitDate: v.visitDate,
    }));
    const outstanding = milestoneStates(enrollment.startDate, visits).filter(
      (m) => m.state !== 'DONE',
    );
    if (outstanding.length === 0) return;

    await tx.recall.createMany({
      data: outstanding.map((m) => ({
        practiceId: enrollment.practiceId,
        patientId: enrollment.patientId,
        reason: `${RECALL_PREFIX}${MILESTONE_LABELS[m.milestone]} follow-up`,
        dueDate: m.dueDate,
      })),
    });
  }
}
