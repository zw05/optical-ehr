import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { Roles } from '../auth/roles.decorator';
import { applyPreferencePatch, mergePreferences, PartialUserPreferences } from './preferences';
import { UpdatePreferencesDto } from './preferences.dto';
import { CreateUserDto, SetPermissionsDto, SetUserActiveDto, UpdateUserDto } from './users.dto';
import { RequirePermission } from '../auth/permission.decorator';
import { PERMISSION_CATALOG, Permission } from '../auth/permissions';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /api/users — active staff picker (includes OPTICIAN).
   * GET /api/users?clinical=true — doctors and technicians.
   * GET /api/users?all=1 — admin directory including inactive.
   */
  @Get()
  @Roles(Role.DOCTOR, Role.TECHNICIAN, Role.OPTICIAN, Role.ADMIN, Role.RECEPTIONIST)
  list(
    @CurrentUser() user: JwtPayload,
    @Query('clinical') clinical?: string,
    @Query('all') all?: string,
  ) {
    if (all === '1' || all === 'true') {
      this.users.requireDirectoryAccess(user);
      return this.users.listDirectory(user.practiceId);
    }
    return this.users.listPicker(user.practiceId, clinical === 'true');
  }

  /**
   * GET /api/users/me/permissions — what the signed-in user may do, plus the
   * catalog, so the web app can hide sections it would only 403 on.
   */
  @Get('me/permissions')
  myPermissions(@CurrentUser() user: JwtPayload) {
    return { permissions: user.permissions ?? [], catalog: PERMISSION_CATALOG };
  }

  @Get('me/preferences')
  async getPreferences(@CurrentUser() user: JwtPayload) {
    const row = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { preferences: true },
    });
    return mergePreferences(row?.preferences ?? null);
  }

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

  @Post()
  @RequirePermission(Permission.ACCOUNTS_MANAGE)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateUserDto) {
    return this.users.create(user.practiceId, dto);
  }

  @Patch(':id/active')
  @RequirePermission(Permission.ACCOUNTS_MANAGE)
  setActive(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetUserActiveDto,
  ) {
    return this.users.setActive(user.practiceId, id, dto.isActive, user.sub);
  }

  @Patch(':id')
  @RequirePermission(Permission.ACCOUNTS_MANAGE)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(user.practiceId, id, dto);
  }

  /** PATCH /api/users/:id/permissions — replace one account's grant/deny lists. */
  @Patch(':id/permissions')
  @RequirePermission(Permission.ACCOUNTS_MANAGE)
  setPermissions(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetPermissionsDto,
  ) {
    return this.users.setPermissions(user.practiceId, id, dto.grant, dto.deny, user.sub);
  }
}
