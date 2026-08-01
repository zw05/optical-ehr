import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { AuditService } from './audit.service';

/** Admin-only PHI access log viewer. */
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /**
   * GET /api/audit — admin-only view of the audit trail.
   * Query params: `patientId`, `actorId`, `take` (max 500).
   */
  @Get()
  @Roles(Role.ADMIN)
  query(
    @CurrentUser() user: JwtPayload,
    @Query('patientId') patientId?: string,
    @Query('actorId') actorId?: string,
    @Query('take') take?: string,
  ) {
    return this.audit.query(user.practiceId, {
      patientId,
      actorId,
      take: take ? Number(take) : undefined,
    });
  }
}
