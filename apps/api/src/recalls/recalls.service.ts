import { Injectable, NotFoundException } from '@nestjs/common';
import { RecallStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Patient recall scheduling and outreach tracking. Recalls drive the front-desk
 * work queue; outbound messages must not include diagnosis or Rx details.
 */
@Injectable()
export class RecallsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Schedules a future follow-up (annual exam, CL check, etc.) for a patient.
   * @param reason  Human-readable label shown on the recalls page.
   * @param dueDate When the patient should be contacted or seen.
   */
  async create(practiceId: string, patientId: string, reason: string, dueDate: Date, notes?: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, practiceId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return this.prisma.recall.create({
      data: { practiceId, patientId, reason, dueDate, notes },
    });
  }

  /** Work queue: pending/contacted recalls due before the horizon date. */
  due(practiceId: string, horizon: Date) {
    return this.prisma.recall.findMany({
      where: {
        practiceId,
        status: { in: [RecallStatus.PENDING, RecallStatus.CONTACTED] },
        dueDate: { lte: horizon },
      },
      orderBy: { dueDate: 'asc' },
      include: {
        patient: {
          select: { id: true, mrn: true, firstName: true, lastName: true, phone: true, preferredContact: true },
        },
      },
    });
  }

  /** Marks outreach progress: CONTACTED, SCHEDULED, or DISMISSED. Optional notes update. */
  async setStatus(practiceId: string, id: string, status: RecallStatus, notes?: string) {
    const recall = await this.prisma.recall.findFirst({ where: { id, practiceId } });
    if (!recall) throw new NotFoundException('Recall not found');
    return this.prisma.recall.update({
      where: { id },
      data: { status, ...(notes !== undefined ? { notes } : {}) },
    });
  }
}
