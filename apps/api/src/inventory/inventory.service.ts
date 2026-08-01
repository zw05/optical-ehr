import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface UpsertItemInput {
  kind: InventoryKind;
  sku: string;
  brand?: string;
  model?: string;
  color?: string;
  size?: string;
  quantity?: number;
  cost?: number;
  retail?: number;
}

/** Frame and contact-lens trial stock for the dispensary. */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lists active SKUs, optionally filtered by kind (FRAME, CONTACT_LENS_TRIAL) or search text. */
  list(practiceId: string, kind?: InventoryKind, query?: string) {
    const where: Prisma.InventoryItemWhereInput = { practiceId, isActive: true };
    if (kind) where.kind = kind;
    if (query) {
      where.OR = [
        { sku: { contains: query, mode: 'insensitive' } },
        { brand: { contains: query, mode: 'insensitive' } },
        { model: { contains: query, mode: 'insensitive' } },
      ];
    }
    return this.prisma.inventoryItem.findMany({ where, orderBy: [{ brand: 'asc' }, { model: 'asc' }] });
  }

  /** Creates a new SKU or updates an existing one matched by practice + sku. */
  upsert(practiceId: string, input: UpsertItemInput) {
    return this.prisma.inventoryItem.upsert({
      where: { practiceId_sku: { practiceId, sku: input.sku } },
      update: { ...input },
      create: { ...input, practiceId, quantity: input.quantity ?? 0 },
    });
  }

  /** Positive delta receives stock; negative delta consumes (e.g. frame dispensed). */
  async adjustQuantity(practiceId: string, id: string, delta: number) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, practiceId } });
    if (!item) throw new NotFoundException('Inventory item not found');
    if (item.quantity + delta < 0) {
      throw new BadRequestException(`Only ${item.quantity} in stock`);
    }
    return this.prisma.inventoryItem.update({
      where: { id },
      data: { quantity: { increment: delta } },
    });
  }

  /** Soft-deletes an SKU so it no longer appears in search but history is preserved. */
  async deactivate(practiceId: string, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, practiceId } });
    if (!item) throw new NotFoundException('Inventory item not found');
    return this.prisma.inventoryItem.update({ where: { id }, data: { isActive: false } });
  }
}
