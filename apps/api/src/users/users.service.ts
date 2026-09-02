import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import {
  effectivePermissions,
  parseOverrides,
  Permission,
  type PermissionKey,
} from '../auth/permissions';

const STAFF_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  licenseNumber: true,
  npi: true,
  isActive: true,
  permissionOverrides: true,
  createdAt: true,
} as const;

type StaffRow = {
  role: Role;
  permissionOverrides: unknown;
};

/**
 * Expands the stored override JSON into what the permissions screen needs:
 * the raw grant/deny lists it edits, and the resolved set it displays.
 */
function withPermissions<T extends StaffRow>(row: T) {
  const { permissionOverrides, ...rest } = row;
  return {
    ...rest,
    overrides: parseOverrides(permissionOverrides),
    permissions: effectivePermissions(row.role, permissionOverrides),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listPicker(practiceId: string, clinical?: boolean) {
    return this.prisma.user.findMany({
      where: {
        practiceId,
        isActive: true,
        ...(clinical ? { role: { in: [Role.DOCTOR, Role.TECHNICIAN] } } : {}),
      },
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

  async listDirectory(practiceId: string) {
    const rows = await this.prisma.user.findMany({
      where: { practiceId },
      select: STAFF_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map(withPermissions);
  }

  async create(practiceId: string, dto: CreateUserDto) {
    const temporaryPassword = randomBytes(9).toString('base64url').slice(0, 12);
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          practiceId,
          email: dto.email.trim().toLowerCase(),
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          role: dto.role,
          licenseNumber: dto.licenseNumber?.trim() || null,
          npi: dto.npi?.trim() || null,
          passwordHash,
          isActive: true,
        },
        select: STAFF_SELECT,
      });
      return { user: withPermissions(user), temporaryPassword };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A user with that email already exists');
      }
      throw err;
    }
  }

  async update(practiceId: string, id: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findFirst({ where: { id, practiceId } });
    if (!existing) throw new NotFoundException('User not found');
    if (existing.role === Role.ADMIN && dto.role && dto.role !== Role.ADMIN) {
      await this.assertNotLastAdmin(practiceId, id);
    }
    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data: {
          ...(dto.email !== undefined ? { email: dto.email.trim().toLowerCase() } : {}),
          ...(dto.firstName !== undefined ? { firstName: dto.firstName.trim() } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.licenseNumber !== undefined ? { licenseNumber: dto.licenseNumber?.trim() || null } : {}),
          ...(dto.npi !== undefined ? { npi: dto.npi?.trim() || null } : {}),
        },
        select: STAFF_SELECT,
      });
      return withPermissions(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A user with that email already exists');
      }
      throw err;
    }
  }

  async setActive(practiceId: string, id: string, isActive: boolean, actorId?: string) {
    const existing = await this.prisma.user.findFirst({ where: { id, practiceId } });
    if (!existing) throw new NotFoundException('User not found');
    if (!isActive && existing.role === Role.ADMIN) {
      await this.assertNotLastAdmin(practiceId, id);
    }
    if (!isActive && existing.isActive === false) return withPermissions(existing);
    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: STAFF_SELECT,
    });
    await this.audit.log({
      practiceId,
      actorId,
      action: 'UPDATE',
      entityType: 'User',
      entityId: id,
      detail: `${isActive ? 'Reactivated' : 'Deactivated'} ${existing.email}`,
    });
    return withPermissions(updated);
  }

  /**
   * Replaces one account's permission overrides. A key listed in both lists is
   * treated as denied, since the safer reading of a contradictory instruction is
   * the one that grants less. Administrators keep account management regardless,
   * so a practice cannot lock itself out of its own permissions screen.
   */
  async setPermissions(
    practiceId: string,
    id: string,
    grant: PermissionKey[],
    deny: PermissionKey[],
    actorId?: string,
  ) {
    const existing = await this.prisma.user.findFirst({ where: { id, practiceId } });
    if (!existing) throw new NotFoundException('User not found');
    const denied = new Set(deny);
    const overrides = {
      grant: [...new Set(grant)].filter((key) => !denied.has(key)),
      deny: [...denied],
    };
    if (existing.role === Role.ADMIN && denied.has(Permission.ACCOUNTS_MANAGE)) {
      throw new BadRequestException(
        'Administrators always keep account management; change the role instead',
      );
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: { permissionOverrides: overrides },
      select: STAFF_SELECT,
    });
    await this.audit.log({
      practiceId,
      actorId,
      action: 'UPDATE',
      entityType: 'User',
      entityId: id,
      detail:
        `Permissions for ${existing.email} — ` +
        `granted: ${overrides.grant.join(', ') || 'none'}; ` +
        `revoked: ${overrides.deny.join(', ') || 'none'}`,
    });
    return withPermissions(updated);
  }

  private async assertNotLastAdmin(practiceId: string, userId: string) {
    const otherAdmins = await this.prisma.user.count({
      where: {
        practiceId,
        role: Role.ADMIN,
        isActive: true,
        id: { not: userId },
      },
    });
    if (otherAdmins === 0) {
      throw new BadRequestException('Cannot deactivate or demote the last administrator');
    }
  }

  /** The full directory exposes roles and permissions, so it needs the capability. */
  requireDirectoryAccess(user: { role: string; permissions?: string[] }) {
    if (!user.permissions?.includes(Permission.ACCOUNTS_MANAGE)) {
      throw new ForbiddenException('Staff directory requires account management permission');
    }
  }
}
