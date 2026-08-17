import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAcceptedPayerDto, UpdateAcceptedPayerDto } from './accepted-payers.dto';

function emptyToNull(value?: string) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

@Injectable()
export class AcceptedPayersService {
  constructor(private readonly prisma: PrismaService) {}

  list(practiceId: string, includeInactive = false) {
    return this.prisma.acceptedPayer.findMany({
      where: { practiceId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });
  }

  async create(practiceId: string, dto: CreateAcceptedPayerDto) {
    try {
      return await this.prisma.acceptedPayer.create({
        data: {
          practiceId,
          name: dto.name.trim(),
          notes: emptyToNull(dto.notes),
          eligibilityNotes: emptyToNull(dto.eligibilityNotes),
          phone: emptyToNull(dto.phone),
          fax: emptyToNull(dto.fax),
          website: emptyToNull(dto.website),
          payerId: emptyToNull(dto.payerId),
          frameAllowance: dto.frameAllowance ?? null,
          lensAllowance: dto.lensAllowance ?? null,
          examCopay: dto.examCopay ?? null,
          requiresAuth: dto.requiresAuth ?? false,
          isVision: dto.isVision ?? true,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Payer "${dto.name}" already exists`);
      }
      throw err;
    }
  }

  async update(practiceId: string, id: string, dto: UpdateAcceptedPayerDto) {
    const existing = await this.prisma.acceptedPayer.findFirst({ where: { id, practiceId } });
    if (!existing) throw new NotFoundException('Accepted payer not found');
    try {
      return await this.prisma.acceptedPayer.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.notes !== undefined ? { notes: emptyToNull(dto.notes) } : {}),
          ...(dto.eligibilityNotes !== undefined ? { eligibilityNotes: emptyToNull(dto.eligibilityNotes) } : {}),
          ...(dto.phone !== undefined ? { phone: emptyToNull(dto.phone) } : {}),
          ...(dto.fax !== undefined ? { fax: emptyToNull(dto.fax) } : {}),
          ...(dto.website !== undefined ? { website: emptyToNull(dto.website) } : {}),
          ...(dto.payerId !== undefined ? { payerId: emptyToNull(dto.payerId) } : {}),
          ...(dto.frameAllowance !== undefined ? { frameAllowance: dto.frameAllowance } : {}),
          ...(dto.lensAllowance !== undefined ? { lensAllowance: dto.lensAllowance } : {}),
          ...(dto.examCopay !== undefined ? { examCopay: dto.examCopay } : {}),
          ...(dto.requiresAuth !== undefined ? { requiresAuth: dto.requiresAuth } : {}),
          ...(dto.isVision !== undefined ? { isVision: dto.isVision } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Payer "${dto.name}" already exists`);
      }
      throw err;
    }
  }
}
