import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** One row destined for the append-only AuditEvent table. */
export interface AuditEntry {
  practiceId: string;
  actorId?: string;
  action: AuditAction | keyof typeof AuditAction;
  entityType: string;
  entityId?: string;
  patientId?: string;
  detail?: string;
  ip?: string;
  sessionId?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append an audit event. Failures are logged but never break the clinical
   * operation itself; a monitor alert fires on audit write errors.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          practiceId: entry.practiceId,
          actorId: entry.actorId,
          action: entry.action as AuditAction,
          entityType: entry.entityType,
          entityId: entry.entityId,
          patientId: entry.patientId,
          detail: entry.detail,
          ip: entry.ip,
          sessionId: entry.sessionId,
        },
      });
    } catch (error) {
      this.logger.error(`Audit write failed for ${entry.entityType}:${entry.entityId}`, error);
    }
  }

  /**
   * Reads recent audit events for the admin audit screen, newest first.
   * Optional filters narrow to one patient (per-patient access report) or one
   * staff member. Capped at 500 rows per request.
   */
  async query(practiceId: string, filters: { patientId?: string; actorId?: string; take?: number }) {
    const where: Prisma.AuditEventWhereInput = { practiceId };
    if (filters.patientId) where.patientId = filters.patientId;
    if (filters.actorId) where.actorId = filters.actorId;
    return this.prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filters.take ?? 100, 500),
      include: { actor: { select: { firstName: true, lastName: true, role: true } } },
    });
  }
}
