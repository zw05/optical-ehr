import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAppointmentDto,
  CreateAppointmentTypeDto,
  SetStatusDto,
  UpdateAppointmentDto,
} from './scheduling.dto';

/** Statuses that still occupy a slot on the provider's calendar. */
const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
];

/** Provider calendars: appointment types, booking, rescheduling, and status flow. */
@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  // ----- appointment types -----

  /** Defines a bookable visit type (name, duration, calendar color). Admin only. */
  createType(practiceId: string, dto: CreateAppointmentTypeDto) {
    return this.prisma.appointmentType.create({ data: { ...dto, practiceId } });
  }

  /** Lists active appointment types for the booking form. */
  listTypes(practiceId: string) {
    return this.prisma.appointmentType.findMany({ where: { practiceId, isActive: true } });
  }

  // ----- appointments -----

  /**
   * Books an appointment. The end time is computed from the type's duration,
   * and the provider's calendar is checked for double-booking (409 on overlap).
   */
  async create(practiceId: string, dto: CreateAppointmentDto) {
    const type = await this.prisma.appointmentType.findFirst({
      where: { id: dto.typeId, practiceId },
    });
    if (!type) throw new NotFoundException('Appointment type not found');

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(startsAt.getTime() + type.durationMin * 60_000);
    await this.assertNoOverlap(dto.providerId, startsAt, endsAt);

    return this.prisma.appointment.create({
      data: {
        practiceId,
        patientId: dto.patientId,
        providerId: dto.providerId,
        typeId: dto.typeId,
        startsAt,
        endsAt,
        notes: dto.notes,
      },
      include: { patient: { select: { firstName: true, lastName: true, mrn: true } }, type: true },
    });
  }

  /** Returns appointments in [from, to), optionally for one provider — the day/week view. */
  async calendar(practiceId: string, from: string, to: string, providerId?: string) {
    return this.prisma.appointment.findMany({
      where: {
        practiceId,
        startsAt: { gte: new Date(from), lt: new Date(to) },
        ...(providerId ? { providerId } : {}),
      },
      orderBy: { startsAt: 'asc' },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, mrn: true, phone: true } },
        provider: { select: { id: true, firstName: true, lastName: true } },
        type: true,
      },
    });
  }

  /**
   * Reschedules an appointment (time, provider, and/or type). Only allowed
   * while the visit is still SCHEDULED or CONFIRMED; re-checks for overlap.
   */
  async update(practiceId: string, id: string, dto: UpdateAppointmentDto) {
    const appt = await this.getOwned(practiceId, id);
    if (appt.status !== AppointmentStatus.SCHEDULED && appt.status !== AppointmentStatus.CONFIRMED) {
      throw new BadRequestException('Only scheduled/confirmed appointments can be rescheduled');
    }

    const typeId = dto.typeId ?? appt.typeId;
    const providerId = dto.providerId ?? appt.providerId;
    const type = await this.prisma.appointmentType.findFirst({ where: { id: typeId, practiceId } });
    if (!type) throw new NotFoundException('Appointment type not found');

    const startsAt = dto.startsAt ? new Date(dto.startsAt) : appt.startsAt;
    const endsAt = new Date(startsAt.getTime() + type.durationMin * 60_000);
    await this.assertNoOverlap(providerId, startsAt, endsAt, id);

    return this.prisma.appointment.update({
      where: { id },
      data: { providerId, typeId, startsAt, endsAt, notes: dto.notes ?? appt.notes },
    });
  }

  /**
   * Moves an appointment through its lifecycle (confirm, check in, start,
   * complete, cancel, no-show). Cancellation requires a reason. Checking a
   * patient in automatically opens a clinical encounter on the active exam
   * template so the technician can begin pre-testing immediately.
   */
  async setStatus(practiceId: string, id: string, dto: SetStatusDto) {
    const appt = await this.getOwned(practiceId, id);
    if (dto.status === AppointmentStatus.CANCELLED && !dto.cancelReason) {
      throw new BadRequestException('Cancellation requires a reason');
    }

    const updated = await this.prisma.appointment.update({
      where: { id: appt.id },
      data: { status: dto.status, cancelReason: dto.cancelReason },
    });

    // Check-in opens the clinical encounter automatically.
    if (dto.status === AppointmentStatus.CHECKED_IN) {
      const existing = await this.prisma.encounter.findUnique({ where: { appointmentId: id } });
      if (!existing) {
        const template = await this.prisma.examTemplate.findFirst({
          where: { practiceId, isActive: true },
          orderBy: { version: 'desc' },
        });
        if (template) {
          await this.prisma.encounter.create({
            data: {
              practiceId,
              patientId: appt.patientId,
              appointmentId: id,
              templateId: template.id,
            },
          });
        }
      }
    }
    return updated;
  }

  /** Loads an appointment or throws 404 if it isn't in the caller's practice. */
  private async getOwned(practiceId: string, id: string) {
    const appt = await this.prisma.appointment.findFirst({ where: { id, practiceId } });
    if (!appt) throw new NotFoundException('Appointment not found');
    return appt;
  }

  /**
   * Throws 409 if the provider already has an active appointment intersecting
   * [startsAt, endsAt). `excludeId` skips the appointment being rescheduled.
   */
  private async assertNoOverlap(providerId: string, startsAt: Date, endsAt: Date, excludeId?: string) {
    const overlap = await this.prisma.appointment.findFirst({
      where: {
        providerId,
        status: { in: ACTIVE_STATUSES },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, startsAt: true },
    });
    if (overlap) {
      throw new ConflictException('Provider already has an appointment in that time slot');
    }
  }
}
