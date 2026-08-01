import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { Roles } from '../auth/roles.decorator';
import { applyPreferencePatch, mergePreferences, PartialUserPreferences } from './preferences';
import { UpdatePreferencesDto } from './preferences.dto';

/**
 * Lightweight user directory for exam/provider pickers, plus the signed-in
 * user's UI/accessibility preferences.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/users?clinical=true — doctors (and optionally technicians) for
   * the Exam Provider dropdown on the patient exam form.
   */
  @Get()
  @Roles(Role.DOCTOR, Role.TECHNICIAN, Role.ADMIN, Role.RECEPTIONIST)
  list(
    @CurrentUser() user: JwtPayload,
    @Query('clinical') clinical?: string,
  ) {
    const where: {
      practiceId: string;
      isActive: boolean;
      role?: { in: Role[] };
    } = {
      practiceId: user.practiceId,
      isActive: true,
    };

    if (clinical === 'true') {
      where.role = { in: [Role.DOCTOR, Role.TECHNICIAN] };
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        licenseNumber: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  /** GET /api/users/me/preferences — stored prefs deep-merged over defaults. */
  @Get('me/preferences')
  async getPreferences(@CurrentUser() user: JwtPayload) {
    const row = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { preferences: true },
    });
    return mergePreferences(row?.preferences ?? null);
  }

  /**
   * PATCH /api/users/me/preferences — deep-merge a partial prefs tree, persist,
   * and return the full merged result. No audit event (not PHI).
   */
  @Patch('me/preferences')
  async updatePreferences(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePreferencesDto) {
    const row = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { preferences: true },
    });
    const current = mergePreferences(row?.preferences ?? null);
    const merged = applyPreferencePatch(current, dto as PartialUserPreferences);
    await this.prisma.user.update({
      where: { id: user.sub },
      data: { preferences: merged as object },
    });
    return merged;
  }
}
