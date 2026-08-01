import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrescriptionStatus, PrescriptionType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.service';
import {
  ContactLensValuesDto,
  CreatePrescriptionDto,
  SpectacleValuesDto,
  UpdateDraftDto,
} from './prescriptions.dto';

/**
 * Spectacle and contact-lens prescriptions with an immutability guarantee:
 * DRAFT (editable) → FINALIZED (locked, printable) → SUPERSEDED (replaced by
 * a new version). Only doctors create, edit, finalize, or supersede.
 */
@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates a DRAFT prescription. Values are validated against the clinical
   * DTO for the type (sphere/cylinder/axis ranges for spectacles; brand,
   * base curve, diameter, power for contact lenses).
   */
  async create(practiceId: string, user: JwtPayload, dto: CreatePrescriptionDto) {
    this.assertPrescriber(user);
    this.validateValues(dto.type, dto.values);
    return this.prisma.prescription.create({
      data: {
        practiceId,
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        prescriberId: user.sub,
        type: dto.type,
        values: dto.values as object,
      },
    });
  }

  /** Replaces a draft's values (re-validated). 400 once the Rx is finalized. */
  async updateDraft(practiceId: string, id: string, user: JwtPayload, dto: UpdateDraftDto) {
    this.assertPrescriber(user);
    const rx = await this.getOwned(practiceId, id);
    if (rx.status !== PrescriptionStatus.DRAFT) {
      throw new BadRequestException('Only draft prescriptions can be edited');
    }
    this.validateValues(rx.type, dto.values);
    return this.prisma.prescription.update({
      where: { id },
      data: { values: dto.values as object },
    });
  }

  /**
   * Locks a draft permanently. Only the prescribing doctor may finalize.
   * Stamps issue date and expiration (default 24 months for spectacles,
   * 12 for contact lenses) and writes a FINALIZE audit event. Reports and
   * optical orders are only allowed against finalized prescriptions.
   */
  async finalize(practiceId: string, id: string, user: JwtPayload, validMonths?: number) {
    this.assertPrescriber(user);
    const rx = await this.getOwned(practiceId, id);
    if (rx.status !== PrescriptionStatus.DRAFT) {
      throw new BadRequestException('Prescription is not a draft');
    }
    if (rx.prescriberId !== user.sub) {
      throw new ForbiddenException('Only the prescribing doctor can finalize');
    }
    this.validateValues(rx.type, rx.values as Record<string, unknown>);

    const months = validMonths ?? (rx.type === PrescriptionType.SPECTACLE ? 24 : 12);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt);
    expiresAt.setMonth(expiresAt.getMonth() + months);

    const finalized = await this.prisma.prescription.update({
      where: { id },
      data: {
        status: PrescriptionStatus.FINALIZED,
        issuedAt,
        expiresAt,
        finalizedAt: issuedAt,
      },
    });

    await this.audit.log({
      practiceId,
      actorId: user.sub,
      action: 'FINALIZE',
      entityType: 'Prescription',
      entityId: id,
      patientId: rx.patientId,
    });
    return finalized;
  }

  /**
   * Corrects a finalized prescription by issuing version n+1 with the new
   * values in one transaction; the original is preserved and marked
   * SUPERSEDED with a link in both directions. Nothing is ever overwritten.
   */
  async supersede(practiceId: string, id: string, user: JwtPayload, values: Record<string, unknown>) {
    this.assertPrescriber(user);
    const rx = await this.getOwned(practiceId, id);
    if (rx.status !== PrescriptionStatus.FINALIZED) {
      throw new BadRequestException('Only finalized prescriptions can be superseded');
    }
    this.validateValues(rx.type, values);

    const [, next] = await this.prisma.$transaction([
      this.prisma.prescription.update({
        where: { id },
        data: { status: PrescriptionStatus.SUPERSEDED },
      }),
      this.prisma.prescription.create({
        data: {
          practiceId,
          patientId: rx.patientId,
          encounterId: rx.encounterId,
          prescriberId: user.sub,
          type: rx.type,
          values: values as object,
          version: rx.version + 1,
          supersedesId: rx.id,
        },
      }),
    ]);
    return next;
  }

  /** Loads one prescription with prescriber credentials and version links. */
  async findOne(practiceId: string, id: string) {
    const rx = await this.prisma.prescription.findFirst({
      where: { id, practiceId },
      include: {
        prescriber: { select: { firstName: true, lastName: true, licenseNumber: true, npi: true } },
        patient: { select: { id: true, mrn: true, firstName: true, lastName: true, dateOfBirth: true } },
        supersedes: { select: { id: true, version: true } },
        supersededBy: { select: { id: true, version: true } },
      },
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    return rx;
  }

  /** All of a patient's prescriptions, grouped by type, newest version first. */
  listForPatient(practiceId: string, patientId: string) {
    return this.prisma.prescription.findMany({
      where: { practiceId, patientId },
      orderBy: [{ type: 'asc' }, { version: 'desc' }],
      include: { prescriber: { select: { firstName: true, lastName: true } } },
    });
  }

  /** Throws 403 unless the caller is a doctor. */
  private assertPrescriber(user: JwtPayload) {
    if (user.role !== Role.DOCTOR) {
      throw new ForbiddenException('Only doctors manage prescriptions');
    }
  }

  /**
   * Runs class-validator against the type-specific DTO (SpectacleValuesDto or
   * ContactLensValuesDto) and throws one 400 listing every invalid field.
   */
  private validateValues(type: PrescriptionType, values: Record<string, unknown>) {
    const dtoClass = type === PrescriptionType.SPECTACLE ? SpectacleValuesDto : ContactLensValuesDto;
    const instance = plainToInstance(dtoClass, values);
    const errors = validateSync(instance, { whitelist: true });
    if (errors.length > 0) {
      const detail = errors
        .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`)
        .join(' | ');
      throw new BadRequestException(`Invalid prescription values — ${detail}`);
    }
  }

  /** Loads a prescription or throws 404 outside the caller's practice. */
  private async getOwned(practiceId: string, id: string) {
    const rx = await this.prisma.prescription.findFirst({ where: { id, practiceId } });
    if (!rx) throw new NotFoundException('Prescription not found');
    return rx;
  }
}
