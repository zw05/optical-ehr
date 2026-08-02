import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderKind, PatientTag, PrescriptionStatus, PrescriptionType, Prisma, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto, UpdatePatientDto, AddHistoryDto } from './dto/patient.dto';

/** Optional filters for patient list/search. Empty query is allowed when any filter is set. */
export interface PatientSearchFilters {
  category?: 'GLASSES' | 'CONTACT_LENS';
  tag?: PatientTag;
  payer?: string;
  insurance?: 'VERIFIED' | 'UNVERIFIED' | 'NONE';
  recall?: 'DUE';
  lastSeen?: 'LAPSED_12M' | 'NEVER';
  ageGroup?: 'PEDIATRIC' | 'ADULT' | 'SENIOR';
  hasAlerts?: boolean;
}

function hasActiveFilters(filters?: PatientSearchFilters): boolean {
  if (!filters) return false;
  return Boolean(
    filters.category ||
      filters.tag ||
      filters.payer ||
      filters.insurance ||
      filters.recall ||
      filters.lastSeen ||
      filters.ageGroup ||
      filters.hasAlerts,
  );
}

/** Patient chart CRUD, search, history, merge, and right-of-access export. */
@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registers a new patient chart. Assigns the next sequential MRN
   * (medical record number, e.g. P000042) for the practice.
   */
  async create(practiceId: string, dto: CreatePatientDto) {
    const mrn = await this.nextMrn(practiceId);
    return this.prisma.patient.create({
      data: {
        ...dto,
        dateOfBirth: new Date(dto.dateOfBirth),
        practiceId,
        mrn,
      },
    });
  }

  /**
   * Case-insensitive patient lookup by name, MRN, phone, or email, with optional
   * category/program/insurance/recall filters. Multi-word queries are tokenized
   * and AND-ed so each token may match a different field. Returns [] only when
   * there is neither a query nor an active filter (keeps typeahead empty-safe).
   */
  async search(
    practiceId: string,
    query: string,
    take = 200,
    filters?: PatientSearchFilters,
  ) {
    const tokens = query.trim().split(/[\s,]+/).filter(Boolean);
    if (tokens.length === 0 && !hasActiveFilters(filters)) return [];

    const limit = Number.isFinite(take) ? Math.min(Math.max(1, take), 200) : 200;
    const andClauses: Prisma.PatientWhereInput[] = [];

    if (tokens.length > 0) {
      andClauses.push(
        ...tokens.map((token) => ({
          OR: [
            { firstName: { contains: token, mode: 'insensitive' as const } },
            { lastName: { contains: token, mode: 'insensitive' as const } },
            { mrn: { contains: token, mode: 'insensitive' as const } },
            { phone: { contains: token } },
            { email: { contains: token, mode: 'insensitive' as const } },
          ],
        })),
      );
    }

    if (filters?.category === 'GLASSES') {
      andClauses.push({
        OR: [
          {
            prescriptions: {
              some: { type: PrescriptionType.SPECTACLE, status: { not: PrescriptionStatus.DRAFT } },
            },
          },
          { orders: { some: { kind: OrderKind.SPECTACLE } } },
        ],
      });
    } else if (filters?.category === 'CONTACT_LENS') {
      andClauses.push({
        OR: [
          {
            prescriptions: {
              some: { type: PrescriptionType.CONTACT_LENS, status: { not: PrescriptionStatus.DRAFT } },
            },
          },
          { orders: { some: { kind: OrderKind.CONTACT_LENS } } },
        ],
      });
    }

    if (filters?.tag) {
      andClauses.push({ tags: { has: filters.tag } });
    }

    if (filters?.payer) {
      andClauses.push({
        insurances: {
          some: { payerName: { equals: filters.payer, mode: 'insensitive' } },
        },
      });
    }

    if (filters?.insurance === 'VERIFIED') {
      andClauses.push({
        insurances: { some: { verification: VerificationStatus.VERIFIED } },
      });
    } else if (filters?.insurance === 'UNVERIFIED') {
      andClauses.push({
        insurances: { some: { verification: VerificationStatus.UNVERIFIED } },
      });
    } else if (filters?.insurance === 'NONE') {
      andClauses.push({ insurances: { none: {} } });
    }

    if (filters?.recall === 'DUE') {
      const dueBy = new Date();
      dueBy.setDate(dueBy.getDate() + 30);
      andClauses.push({
        recalls: { some: { status: 'PENDING', dueDate: { lte: dueBy } } },
      });
    }

    if (filters?.lastSeen === 'LAPSED_12M') {
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - 1);
      andClauses.push({ encounters: { none: { createdAt: { gte: cutoff } } } });
    } else if (filters?.lastSeen === 'NEVER') {
      andClauses.push({ encounters: { none: {} } });
    }

    if (filters?.ageGroup) {
      andClauses.push(this.ageGroupWhere(filters.ageGroup));
    }

    if (filters?.hasAlerts) {
      andClauses.push({
        AND: [{ alerts: { not: null } }, { NOT: { alerts: '' } }],
      });
    }

    const where: Prisma.PatientWhereInput = {
      practiceId,
      isActive: true,
      mergedIntoId: null,
      ...(andClauses.length > 0 ? { AND: andClauses } : {}),
    };

    return this.prisma.patient.findMany({
      where,
      take: limit,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        mrn: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        phone: true,
        email: true,
        alerts: true,
        tags: true,
      },
    });
  }

  /** Distinct payer names used on charts in this practice, for filter dropdowns. */
  async filterOptions(practiceId: string) {
    const payers = await this.prisma.insurancePolicy.findMany({
      where: { patient: { practiceId } },
      distinct: ['payerName'],
      select: { payerName: true },
      orderBy: { payerName: 'asc' },
    });
    return { payers: payers.map((p) => p.payerName) };
  }

  /**
   * Loads one chart with its histories, insurance policies (primary first),
   * and pending recalls. 404 if the chart belongs to another practice.
   */
  async findOne(practiceId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, practiceId },
      include: {
        histories: { orderBy: { createdAt: 'desc' } },
        insurances: { orderBy: { priority: 'asc' } },
        recalls: { where: { status: 'PENDING' }, orderBy: { dueDate: 'asc' } },
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  /** Updates demographics/contact fields; all fields optional in the DTO. */
  async update(practiceId: string, id: string, dto: UpdatePatientDto) {
    await this.assertExists(practiceId, id);
    const { dateOfBirth, ...rest } = dto;
    return this.prisma.patient.update({
      where: { id },
      data: {
        ...rest,
        ...(dateOfBirth ? { dateOfBirth: new Date(dateOfBirth) } : {}),
      },
    });
  }

  /**
   * Appends a history entry (MEDICAL, OCULAR, FAMILY, MEDICATION, ALLERGY, or
   * DIAGNOSIS). History rows are never edited in place — see resolveHistory.
   */
  async addHistory(practiceId: string, patientId: string, dto: AddHistoryDto) {
    await this.assertExists(practiceId, patientId);
    return this.prisma.patientHistory.create({
      data: {
        patientId,
        kind: dto.kind,
        label: dto.label,
        code: dto.code,
        detail: dto.detail,
        onsetDate: dto.onsetDate ? new Date(dto.onsetDate) : undefined,
      },
    });
  }

  /** Marks a history entry resolved (e.g. a medication stopped) without deleting it. */
  async resolveHistory(practiceId: string, patientId: string, historyId: string) {
    await this.assertExists(practiceId, patientId);
    return this.prisma.patientHistory.update({
      where: { id: historyId },
      data: { resolved: true },
    });
  }

  /**
   * Merge duplicate charts: repoint clinical children to the target chart and
   * deactivate the source. Original rows are kept for the audit trail.
   */
  async merge(practiceId: string, sourceId: string, targetId: string) {
    if (sourceId === targetId) throw new BadRequestException('Cannot merge a chart into itself');
    await this.assertExists(practiceId, sourceId);
    await this.assertExists(practiceId, targetId);

    await this.prisma.$transaction([
      this.prisma.patientHistory.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } }),
      this.prisma.insurancePolicy.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } }),
      this.prisma.appointment.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } }),
      this.prisma.encounter.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } }),
      this.prisma.prescription.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } }),
      this.prisma.document.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } }),
      this.prisma.opticalOrder.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } }),
      this.prisma.recall.updateMany({ where: { patientId: sourceId }, data: { patientId: targetId } }),
      this.prisma.patient.update({
        where: { id: sourceId },
        data: { isActive: false, mergedIntoId: targetId },
      }),
    ]);
    return this.findOne(practiceId, targetId);
  }

  /** Full chart export supporting the HIPAA right of access. */
  async exportChart(practiceId: string, id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, practiceId },
      include: {
        histories: true,
        insurances: true,
        appointments: { include: { type: true } },
        encounters: { include: { addenda: true } },
        prescriptions: true,
        documents: { select: { id: true, fileName: true, category: true, createdAt: true } },
        orders: { include: { statusEvents: true } },
        recalls: true,
      },
    });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  /** DOB range for pediatric (<18), adult (18–64), or senior (65+). */
  private ageGroupWhere(ageGroup: 'PEDIATRIC' | 'ADULT' | 'SENIOR'): Prisma.PatientWhereInput {
    const today = new Date();
    const yearsAgo = (years: number) =>
      new Date(today.getFullYear() - years, today.getMonth(), today.getDate());

    if (ageGroup === 'PEDIATRIC') {
      // Under 18 → born after today-minus-18-years
      return { dateOfBirth: { gt: yearsAgo(18) } };
    }
    if (ageGroup === 'SENIOR') {
      // 65+ → born on or before today-minus-65-years
      return { dateOfBirth: { lte: yearsAgo(65) } };
    }
    // Adult 18–64 → DOB between today-65 (exclusive of senior) and today-18 (inclusive)
    return { dateOfBirth: { lte: yearsAgo(18), gt: yearsAgo(65) } };
  }

  /** Throws 404 unless the patient exists inside the caller's practice. */
  private async assertExists(practiceId: string, id: string) {
    const found = await this.prisma.patient.findFirst({ where: { id, practiceId }, select: { id: true } });
    if (!found) throw new NotFoundException('Patient not found');
  }

  /** Generates the next human-friendly chart number: P + zero-padded count. */
  private async nextMrn(practiceId: string): Promise<string> {
    const count = await this.prisma.patient.count({ where: { practiceId } });
    return `P${String(count + 1).padStart(6, '0')}`;
  }
}
