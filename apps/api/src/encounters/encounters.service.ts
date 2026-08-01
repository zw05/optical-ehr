import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EncounterStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.service';
import {
  AddAddendumDto,
  CreateEncounterDto,
  ListEncountersDto,
  UpdateEncounterDto,
} from './encounters.dto';

const RECENT_DAYS = 7;
const LIST_TAKE = 100;

/** Shape of one section definition stored in ExamTemplate.sections (JSONB). */
interface TemplateSection {
  key: string;
  title: string;
  enabled: boolean;
  requiredFields?: string[];
}

/**
 * Eye-exam encounters: created at check-in (or manually), filled in by
 * technician and doctor, then signed by a doctor. Signing freezes the record;
 * later corrections are signed addenda only.
 */
@Injectable()
export class EncountersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Opens a new encounter for a patient. Uses the requested exam template or
   * falls back to the practice's newest active one (400 if none configured).
   */
  async create(practiceId: string, dto: CreateEncounterDto) {
    let templateId = dto.templateId;
    if (!templateId) {
      const template = await this.prisma.examTemplate.findFirst({
        where: { practiceId, isActive: true },
        orderBy: { version: 'desc' },
      });
      if (!template) throw new BadRequestException('No active exam template configured');
      templateId = template.id;
    }
    return this.prisma.encounter.create({
      data: {
        practiceId,
        patientId: dto.patientId,
        appointmentId: dto.appointmentId,
        templateId,
      },
      include: { template: true },
    });
  }

  /**
   * Loads one encounter with its template (drives the exam form layout),
   * patient header, signer credentials, addenda, and linked prescriptions.
   */
  async findOne(practiceId: string, id: string) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id, practiceId },
      include: {
        template: true,
        patient: {
          select: {
            id: true,
            mrn: true,
            firstName: true,
            lastName: true,
            dateOfBirth: true,
            phone: true,
            email: true,
            alerts: true,
            insurances: {
              select: { payerName: true, isVision: true, priority: true },
              orderBy: { priority: 'asc' },
            },
          },
        },
        signedBy: { select: { firstName: true, lastName: true, licenseNumber: true } },
        addenda: { include: { author: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' } },
        prescriptions: true,
      },
    });
    if (!encounter) throw new NotFoundException('Encounter not found');
    return encounter;
  }

  /** Exam history for the patient chart, newest first. */
  async listForPatient(practiceId: string, patientId: string) {
    return this.prisma.encounter.findMany({
      where: { practiceId, patientId },
      orderBy: { createdAt: 'desc' },
      include: {
        signedBy: { select: { firstName: true, lastName: true } },
        template: { select: { name: true, version: true } },
      },
    });
  }

  /**
   * Practice-wide exams dashboard: filtered/sorted rows, tab badge counts
   * (counts honor the same filters but swap the tab predicate), and
   * unfiltered distinct values for the Reason / Impression / Insurance dropdowns.
   */
  async list(practiceId: string, dto: ListEncountersDto) {
    const tab = dto.tab ?? 'recent';
    const order = dto.order === 'asc' ? 'asc' : 'desc';
    const sortBy = dto.sortBy ?? 'createdAt';
    const recentSince = new Date();
    recentSince.setDate(recentSince.getDate() - RECENT_DAYS);

    const filters = this.buildListFilters(practiceId, dto);
    const activeWhere = this.mergeTabWhere(filters, tab, recentSince);

    const orderBy: Prisma.EncounterOrderByWithRelationInput[] =
      sortBy === 'patient'
        ? [{ patient: { lastName: order } }, { patient: { firstName: order } }]
        : sortBy === 'status'
          ? [{ status: order }, { createdAt: 'desc' }]
          : [{ createdAt: order }];

    const include = {
      patient: {
        select: {
          id: true,
          mrn: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          insurances: {
            select: { payerName: true, isVision: true, priority: true },
            orderBy: { priority: 'asc' as const },
          },
        },
      },
      appointment: {
        select: {
          provider: { select: { firstName: true, lastName: true } },
        },
      },
      signedBy: { select: { firstName: true, lastName: true } },
    };

    const [rows, recent, unfinished, finalized, reasonRows, impressionRows, insuranceRows] =
      await this.prisma.$transaction([
        this.prisma.encounter.findMany({
          where: activeWhere,
          orderBy,
          take: LIST_TAKE,
          include,
        }),
        this.prisma.encounter.count({
          where: this.mergeTabWhere(filters, 'recent', recentSince),
        }),
        this.prisma.encounter.count({
          where: this.mergeTabWhere(filters, 'unfinished', recentSince),
        }),
        this.prisma.encounter.count({
          where: this.mergeTabWhere(filters, 'finalized', recentSince),
        }),
        this.prisma.encounter.findMany({
          where: { practiceId, chiefComplaint: { not: null } },
          distinct: ['chiefComplaint'],
          select: { chiefComplaint: true },
          orderBy: { chiefComplaint: 'asc' },
        }),
        this.prisma.encounter.findMany({
          where: { practiceId, assessment: { not: null } },
          distinct: ['assessment'],
          select: { assessment: true },
          orderBy: { assessment: 'asc' },
        }),
        this.prisma.insurancePolicy.findMany({
          where: { patient: { practiceId } },
          distinct: ['payerName'],
          select: { payerName: true },
          orderBy: { payerName: 'asc' },
        }),
      ]);

    return {
      rows,
      counts: { recent, unfinished, finalized },
      options: {
        reasons: reasonRows.map((r) => r.chiefComplaint!).filter(Boolean),
        impressions: impressionRows.map((r) => r.assessment!).filter(Boolean),
        insurances: insuranceRows.map((r) => r.payerName),
      },
    };
  }

  /**
   * Shared filter predicates for the dashboard (practice-scoped). Tab status/date
   * predicates are applied separately so badge counts can swap them.
   */
  private buildListFilters(
    practiceId: string,
    dto: ListEncountersDto,
  ): Prisma.EncounterWhereInput {
    const where: Prisma.EncounterWhereInput = { practiceId };
    const and: Prisma.EncounterWhereInput[] = [];

    if (dto.from || dto.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (dto.from) createdAt.gte = new Date(dto.from);
      if (dto.to) {
        const end = new Date(dto.to);
        end.setHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
      where.createdAt = createdAt;
    }

    const q = dto.q?.trim();
    if (q) {
      and.push({
        OR: [
          { patient: { firstName: { contains: q, mode: 'insensitive' } } },
          { patient: { lastName: { contains: q, mode: 'insensitive' } } },
          { patient: { mrn: { contains: q, mode: 'insensitive' } } },
          { chiefComplaint: { contains: q, mode: 'insensitive' } },
          { assessment: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    if (dto.dob) {
      const dayStart = new Date(dto.dob);
      const dayEnd = new Date(dto.dob);
      dayEnd.setHours(23, 59, 59, 999);
      and.push({
        patient: { dateOfBirth: { gte: dayStart, lte: dayEnd } },
      });
    }

    if (dto.insurance?.trim()) {
      and.push({
        patient: {
          insurances: {
            some: { payerName: { equals: dto.insurance.trim(), mode: 'insensitive' } },
          },
        },
      });
    }

    if (dto.reason?.trim()) {
      where.chiefComplaint = { equals: dto.reason.trim(), mode: 'insensitive' };
    }

    if (dto.impression?.trim()) {
      where.assessment = { equals: dto.impression.trim(), mode: 'insensitive' };
    }

    if (and.length > 0) where.AND = and;
    return where;
  }

  /**
   * Combines filter where with the active tab predicate. For "recent", intersects
   * the 7-day window with any from/to range already on filters.createdAt.
   */
  private mergeTabWhere(
    filters: Prisma.EncounterWhereInput,
    tab: 'recent' | 'unfinished' | 'finalized',
    recentSince: Date,
  ): Prisma.EncounterWhereInput {
    if (tab === 'unfinished') {
      return { ...filters, status: EncounterStatus.IN_PROGRESS };
    }
    if (tab === 'finalized') {
      return { ...filters, status: EncounterStatus.SIGNED };
    }

    const existing = (filters.createdAt ?? {}) as Prisma.DateTimeFilter;
    const gte =
      existing.gte && existing.gte > recentSince ? existing.gte : recentSince;
    return {
      ...filters,
      createdAt: { ...existing, gte },
    };
  }

  /**
   * Saves draft exam data. Rejected with 400 once the encounter is signed.
   * `clinicalData` is merged section-by-section (not replaced) so a
   * technician's pre-testing and the doctor's findings can't overwrite each
   * other when saved separately.
   */
  async update(practiceId: string, id: string, dto: UpdateEncounterDto) {
    const encounter = await this.getOwned(practiceId, id);
    if (encounter.status === EncounterStatus.SIGNED) {
      throw new BadRequestException('Signed encounters are immutable; add an addendum instead');
    }

    // Merge section-by-section so technicians and doctors can work on
    // different sections without overwriting each other.
    const clinicalData = {
      ...(encounter.clinicalData as Record<string, unknown>),
      ...(dto.clinicalData ?? {}),
    };

    return this.prisma.encounter.update({
      where: { id },
      data: {
        chiefComplaint: dto.chiefComplaint ?? encounter.chiefComplaint,
        clinicalData: clinicalData as object,
        assessment: dto.assessment ?? encounter.assessment,
        plan: dto.plan ?? encounter.plan,
        diagnosisCodes: dto.diagnosisCodes ?? encounter.diagnosisCodes,
        procedureCodes: dto.procedureCodes ?? encounter.procedureCodes,
      },
    });
  }

  /**
   * Doctor sign-off. Validates chief complaint, assessment, and every
   * required field of every enabled template section (400 lists what is
   * missing), then stamps signer + timestamp, sets status SIGNED, and writes
   * a SIGN audit event. After this the encounter is immutable.
   */
  async sign(practiceId: string, id: string, user: JwtPayload) {
    if (user.role !== Role.DOCTOR) {
      throw new ForbiddenException('Only a doctor can sign an encounter');
    }
    const encounter = await this.getOwned(practiceId, id);
    if (encounter.status === EncounterStatus.SIGNED) {
      throw new BadRequestException('Encounter is already signed');
    }

    this.validateRequiredSections(encounter.template.sections as unknown as TemplateSection[], {
      chiefComplaint: encounter.chiefComplaint,
      assessment: encounter.assessment,
      clinicalData: encounter.clinicalData as Record<string, unknown>,
    });

    const signed = await this.prisma.encounter.update({
      where: { id },
      data: { status: EncounterStatus.SIGNED, signedById: user.sub, signedAt: new Date() },
    });

    await this.audit.log({
      practiceId,
      actorId: user.sub,
      action: 'SIGN',
      entityType: 'Encounter',
      entityId: id,
      patientId: encounter.patientId,
    });
    return signed;
  }

  /**
   * Appends a doctor's correction note to a signed encounter. Drafts are
   * edited directly instead, so addenda on unsigned encounters are rejected.
   */
  async addAddendum(practiceId: string, id: string, user: JwtPayload, dto: AddAddendumDto) {
    if (user.role !== Role.DOCTOR) {
      throw new ForbiddenException('Only a doctor can add an addendum');
    }
    const encounter = await this.getOwned(practiceId, id);
    if (encounter.status !== EncounterStatus.SIGNED) {
      throw new BadRequestException('Addenda apply to signed encounters; edit the draft directly');
    }
    return this.prisma.addendum.create({
      data: { encounterId: id, authorId: user.sub, text: dto.text },
    });
  }

  /**
   * Sign-time completeness check. Collects every missing required field
   * across enabled sections and throws one 400 listing all of them, so the
   * doctor can fix everything in a single pass.
   */
  private validateRequiredSections(
    sections: TemplateSection[],
    data: { chiefComplaint: string | null; assessment: string | null; clinicalData: Record<string, unknown> },
  ) {
    const missing: string[] = [];
    if (!data.chiefComplaint?.trim()) missing.push('chief complaint');
    if (!data.assessment?.trim()) missing.push('assessment');

    for (const section of sections ?? []) {
      if (!section.enabled) continue;
      for (const field of section.requiredFields ?? []) {
        const sectionData = data.clinicalData?.[section.key] as Record<string, unknown> | undefined;
        if (!this.isClinicalFieldPresent(sectionData?.[field])) {
          missing.push(`${section.title}: ${field}`);
        }
      }
    }
    if (missing.length > 0) {
      throw new BadRequestException(`Cannot sign; missing required fields — ${missing.join(', ')}`);
    }
  }

  /**
   * True when a clinicalData field has usable content. Supports scalars,
   * non-empty arrays (HPI complaints need at least one with text), and
   * plain objects with any keys.
   */
  private isClinicalFieldPresent(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return false;
    if (typeof value === 'boolean') return true;
    if (typeof value === 'number') return !Number.isNaN(value);
    if (Array.isArray(value)) {
      if (value.length === 0) return false;
      if (value.every((item) => typeof item === 'object' && item !== null && 'text' in item)) {
        return value.some((item) => String((item as { text?: string }).text ?? '').trim().length > 0);
      }
      return true;
    }
    if (typeof value === 'object') {
      return Object.keys(value as object).length > 0;
    }
    return true;
  }

  /** Loads an encounter (with template) or throws 404 outside the practice. */
  private async getOwned(practiceId: string, id: string) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id, practiceId },
      include: { template: true },
    });
    if (!encounter) throw new NotFoundException('Encounter not found');
    return encounter;
  }
}
