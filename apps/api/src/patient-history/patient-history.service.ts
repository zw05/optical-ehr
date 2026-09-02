import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  INTAKE_STATUS_PATTERN,
  type IntakeAnswer,
  ReviewIntakeHistoryDto,
  UpdateIntakeHistoryDto,
} from './patient-history.dto';

const REVIEWER = {
  select: { firstName: true, lastName: true, licenseNumber: true },
} as const;

/** How many re-review lines the exam screen needs; older ones stay in the table. */
const REVIEW_PAGE_SIZE = 20;

/**
 * The intake questionnaire that used to be a paper page: kept on the patient
 * chart, edited over time, and re-attested by a provider at each visit.
 */
@Injectable()
export class PatientHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Guards cross-practice access; every route funnels through here. */
  private async assertPatient(practiceId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, practiceId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  /**
   * Drops anything that is not a well-formed answer. The question catalog lives
   * with the form on the web side, so we validate the shape and let unknown
   * keys through — a retired question simply stops being rendered.
   */
  private sanitize(answers: Record<string, IntakeAnswer>): Prisma.JsonObject {
    const clean: Prisma.JsonObject = {};
    for (const [key, value] of Object.entries(answers ?? {})) {
      if (!key || key.length > 100 || !value || typeof value !== 'object') continue;
      const status = String(value.status ?? '');
      if (status && !INTAKE_STATUS_PATTERN.test(status)) continue;
      const detail = typeof value.detail === 'string' ? value.detail.slice(0, 500) : '';
      // An unanswered row with no detail carries nothing — leave it out so the
      // stored blob stays the set of things actually asked and answered.
      if (!status && !detail) continue;
      clean[key] = detail ? { status, detail } : { status };
    }
    return clean;
  }

  /** Returns the chart's questionnaire, creating an empty one on first read. */
  async get(practiceId: string, patientId: string) {
    await this.assertPatient(practiceId, patientId);
    const intake = await this.prisma.patientIntakeHistory.findUnique({
      where: { patientId },
      include: {
        reviews: {
          orderBy: { reviewedAt: 'desc' },
          take: REVIEW_PAGE_SIZE,
          include: { reviewedBy: REVIEWER },
        },
      },
    });
    if (intake) return intake;
    return {
      id: null,
      patientId,
      answers: {} as Prisma.JsonObject,
      patientSignedAt: null,
      createdAt: null,
      updatedAt: null,
      reviews: [] as never[],
    };
  }

  /**
   * Replaces the answer set. The whole questionnaire is saved at once because
   * the form is edited as a page, and a partial merge would make clearing an
   * answer impossible to express.
   */
  async update(practiceId: string, patientId: string, dto: UpdateIntakeHistoryDto) {
    await this.assertPatient(practiceId, patientId);
    const answers = this.sanitize(dto.answers);
    const patientSignedAt = dto.patientSignedAt ? new Date(dto.patientSignedAt) : undefined;
    return this.prisma.patientIntakeHistory.upsert({
      where: { patientId },
      create: { patientId, answers, patientSignedAt },
      update: { answers, ...(patientSignedAt ? { patientSignedAt } : {}) },
    });
  }

  /**
   * Records one "Re-Reviewed Date / Dr.'s Signature" line. Reviews are
   * append-only so the trail survives later edits to the answers themselves.
   */
  async addReview(
    practiceId: string,
    patientId: string,
    reviewedById: string,
    dto: ReviewIntakeHistoryDto,
  ) {
    await this.assertPatient(practiceId, patientId);
    // A provider can attest on a chart the patient never filled in — create the
    // shell so the attestation has something to hang off.
    const intake = await this.prisma.patientIntakeHistory.upsert({
      where: { patientId },
      create: { patientId, answers: {} },
      update: {},
    });
    return this.prisma.patientHistoryReview.create({
      data: {
        intakeId: intake.id,
        encounterId: dto.encounterId,
        reviewedById,
        changesNoted: dto.changesNoted ?? false,
        note: dto.note,
      },
      include: { reviewedBy: REVIEWER },
    });
  }
}
