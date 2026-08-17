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
import { CreateUserDto, UpdateUserDto } from './users.dto';

const STAFF_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  licenseNumber: true,
  npi: true,
  isActive: true,
  createdAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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

  listDirectory(practiceId: string) {
    return this.prisma.user.findMany({
      where: { practiceId },
      select: STAFF_SELECT,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
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
      return { user, temporaryPassword };
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
      return await this.prisma.user.update({
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
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A user with that email already exists');
      }
      throw err;
    }
  }

  async setActive(practiceId: string, id: string, isActive: boolean) {
    const existing = await this.prisma.user.findFirst({ where: { id, practiceId } });
    if (!existing) throw new NotFoundException('User not found');
    if (!isActive && existing.role === Role.ADMIN) {
      await this.assertNotLastAdmin(practiceId, id);
    }
    if (!isActive && existing.isActive === false) return existing;
    return this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: STAFF_SELECT,
    });
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

  requireAdminDirectory(role: string) {
    if (role !== Role.ADMIN) {
      throw new ForbiddenException('Staff directory is administrators only');
    }
  }
}
