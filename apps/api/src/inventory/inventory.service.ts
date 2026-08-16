import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildFramesTemplate, parseFramesWorkbook } from '../pricing/pricing-xlsx';

export interface UpsertItemInput {
  kind: InventoryKind;
  sku: string;
  brand?: string;
  model?: string;
  color?: string;
  size?: string;
  eye?: string;
  bridge?: string;
  temple?: string;
  a?: string;
  b?: string;
  ed?: string;
  material?: string;
  shape?: string;
  upc?: string;
  reorderPoint?: number;
  quantity?: number;
  cost?: number;
  retail?: number;
  isActive?: boolean;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  list(practiceId: string, kind?: InventoryKind, query?: string, includeInactive = false) {
    const where: Prisma.InventoryItemWhereInput = {
      practiceId,
      ...(includeInactive ? {} : { isActive: true }),
    };
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

  upsert(practiceId: string, input: UpsertItemInput) {
    const { sku, ...rest } = input;
    return this.prisma.inventoryItem.upsert({
      where: { practiceId_sku: { practiceId, sku } },
      update: { ...rest, sku },
      create: { ...rest, sku, practiceId, quantity: input.quantity ?? 0 },
    });
  }

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

  async deactivate(practiceId: string, id: string) {
    const item = await this.prisma.inventoryItem.findFirst({ where: { id, practiceId } });
    if (!item) throw new NotFoundException('Inventory item not found');
    return this.prisma.inventoryItem.update({ where: { id }, data: { isActive: false } });
  }

  framesTemplate() {
    return buildFramesTemplate();
  }

  async importFrames(practiceId: string, buffer: Buffer) {
    const { rows, errors } = await parseFramesWorkbook(buffer);
    let created = 0;
    let updated = 0;
    for (const row of rows) {
      const existing = await this.prisma.inventoryItem.findUnique({
        where: { practiceId_sku: { practiceId, sku: row.sku } },
      });
      await this.prisma.inventoryItem.upsert({
        where: { practiceId_sku: { practiceId, sku: row.sku } },
        update: {
          kind: InventoryKind.FRAME,
          brand: row.brand,
          model: row.model,
          color: row.color,
          size: row.size,
          eye: row.eye,
          bridge: row.bridge,
          temple: row.temple,
          material: row.material,
          upc: row.upc,
          cost: row.cost,
          retail: row.retail,
          ...(row.quantity !== undefined ? { quantity: Math.round(row.quantity) } : {}),
          isActive: true,
        },
        create: {
          practiceId,
          kind: InventoryKind.FRAME,
          sku: row.sku,
          brand: row.brand,
          model: row.model,
          color: row.color,
          size: row.size,
          eye: row.eye,
          bridge: row.bridge,
          temple: row.temple,
          material: row.material,
          upc: row.upc,
          cost: row.cost,
          retail: row.retail,
          quantity: row.quantity != null ? Math.round(row.quantity) : 0,
        },
      });
      if (existing) updated += 1;
      else created += 1;
    }
    return { created, updated, errors };
  }
}
