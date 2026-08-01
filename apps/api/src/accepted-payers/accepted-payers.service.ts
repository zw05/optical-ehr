import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAcceptedPayerDto, UpdateAcceptedPayerDto } from './accepted-payers.dto';

/** Practice catalog of insurance payers accepted at the front desk. */
@Injectable()
export class AcceptedPayersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lists payers; by default only active. Pass includeInactive for the full catalog. */
  list(practiceId: string, includeInactive = false) {
    return this.prisma.acceptedPayer.findMany({
      where: { practiceId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });
  }

  /** Adds a payer name to the practice catalog. */
  async create(practiceId: string, dto: CreateAcceptedPayerDto) {
    try {
      return await this.prisma.acceptedPayer.create({
        data: {
          practiceId,
          name: dto.name.trim(),
          notes: dto.notes,
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

  /** Updates name, notes, vision flag, or active status. */
  async update(practiceId: string, id: string, dto: UpdateAcceptedPayerDto) {
    const existing = await this.prisma.acceptedPayer.findFirst({ where: { id, practiceId } });
    if (!existing) throw new NotFoundException('Accepted payer not found');
    try {
      return await this.prisma.acceptedPayer.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
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
