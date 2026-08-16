import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAddOnDto,
  CreatePriceListDto,
  UpdateAddOnDto,
  UpdatePriceListDto,
} from './pricing.dto';
import { assertMinusCyl, parsePower, roundQuarter } from './optical-powers';
import { buildPriceWorkbook, parsePriceWorkbook } from './pricing.excel';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  listPriceLists(practiceId: string) {
    return this.prisma.lensPriceList.findMany({
      where: { practiceId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { cells: true } } },
    });
  }

  async getPriceList(practiceId: string, id: string) {
    const list = await this.prisma.lensPriceList.findFirst({
      where: { id, practiceId },
      include: { cells: true },
    });
    if (!list) throw new NotFoundException('Price list not found');
    return list;
  }

  createPriceList(practiceId: string, dto: CreatePriceListDto) {
    return this.prisma.lensPriceList.create({
      data: {
        practiceId,
        name: dto.name.trim(),
        design: dto.design ?? 'SV',
        material: dto.material.trim(),
        index: dto.index ?? null,
      },
    });
  }

  async updatePriceList(practiceId: string, id: string, dto: UpdatePriceListDto) {
    await this.getPriceList(practiceId, id);
    return this.prisma.lensPriceList.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.design !== undefined ? { design: dto.design } : {}),
        ...(dto.material !== undefined ? { material: dto.material.trim() } : {}),
        ...(dto.index !== undefined ? { index: dto.index } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async putCells(
    practiceId: string,
    id: string,
    cells: { sphere: number; cylinder: number; price: number }[],
  ) {
    await this.getPriceList(practiceId, id);
    const normalized = cells.map((c) => {
      const sphere = roundQuarter(c.sphere);
      const cylinder = roundQuarter(c.cylinder);
      try {
        assertMinusCyl(cylinder);
      } catch {
        throw new BadRequestException('Cylinder must be minus-cyl (0 or negative) in 0.25 steps');
      }
      return { sphere, cylinder, price: c.price };
    });
    await this.prisma.$transaction(
      normalized.map((c) =>
        this.prisma.lensPriceCell.upsert({
          where: {
            priceListId_sphere_cylinder: {
              priceListId: id,
              sphere: c.sphere,
              cylinder: c.cylinder,
            },
          },
          update: { price: c.price },
          create: { priceListId: id, sphere: c.sphere, cylinder: c.cylinder, price: c.price },
        }),
      ),
    );
    return this.getPriceList(practiceId, id);
  }

  listAddOns(practiceId: string, includeInactive = false) {
    return this.prisma.opticalAddOn.findMany({
      where: { practiceId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });
  }

  createAddOn(practiceId: string, dto: CreateAddOnDto) {
    return this.prisma.opticalAddOn.create({
      data: {
        practiceId,
        name: dto.name.trim(),
        kind: dto.kind ?? 'OTHER',
        price: dto.price,
      },
    });
  }

  async updateAddOn(practiceId: string, id: string, dto: UpdateAddOnDto) {
    const existing = await this.prisma.opticalAddOn.findFirst({ where: { id, practiceId } });
    if (!existing) throw new NotFoundException('Add-on not found');
    return this.prisma.opticalAddOn.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async quote(
    practiceId: string,
    listId: string,
    sphere: number,
    cylinder: number,
    addOnIds: string[],
  ) {
    const sph = parsePower(sphere);
    const cyl = parsePower(cylinder);
    if (sph == null || cyl == null) throw new BadRequestException('Invalid sphere or cylinder');
    if (cyl > 0) throw new BadRequestException('Cylinder must be minus-cyl');
    const list = await this.prisma.lensPriceList.findFirst({
      where: { id: listId, practiceId, isActive: true },
    });
    if (!list) throw new NotFoundException('Price list not found');
    const cell = await this.prisma.lensPriceCell.findUnique({
      where: {
        priceListId_sphere_cylinder: { priceListId: listId, sphere: sph, cylinder: cyl },
      },
    });
    const addOns = addOnIds.length
      ? await this.prisma.opticalAddOn.findMany({
          where: { practiceId, id: { in: addOnIds }, isActive: true },
        })
      : [];
    const lensPrice = cell ? Number(cell.price) : null;
    const addOnTotal = addOns.reduce((sum, a) => sum + Number(a.price), 0);
    return {
      list: { id: list.id, name: list.name },
      sphere: sph,
      cylinder: cyl,
      lensPrice,
      addOns: addOns.map((a) => ({ id: a.id, name: a.name, price: Number(a.price) })),
      total: lensPrice == null ? null : lensPrice + addOnTotal,
    };
  }

  async templateBuffer(practiceId: string) {
    const lists = await this.prisma.lensPriceList.findMany({
      where: { practiceId },
      include: { cells: true },
      orderBy: { name: 'asc' },
    });
    const addOns = await this.prisma.opticalAddOn.findMany({
      where: { practiceId },
      orderBy: { name: 'asc' },
    });
    return buildPriceWorkbook(
      lists.map((l) => ({
        name: l.name,
        design: l.design,
        material: l.material,
        index: l.index == null ? null : Number(l.index),
        cells: l.cells.map((c) => ({
          sphere: Number(c.sphere),
          cylinder: Number(c.cylinder),
          price: Number(c.price),
        })),
      })),
      addOns.map((a) => ({ name: a.name, kind: a.kind, price: Number(a.price) })),
    );
  }

  async importWorkbook(practiceId: string, data: Buffer) {
    const parsed = await parsePriceWorkbook(data);
    const results: { lists: number; cells: number; addOns: number } = {
      lists: 0,
      cells: 0,
      addOns: 0,
    };
    for (const list of parsed.lists) {
      const row = await this.prisma.lensPriceList.upsert({
        where: { practiceId_name: { practiceId, name: list.name } },
        update: {},
        create: {
          practiceId,
          name: list.name,
          design: 'SV',
          material: 'Unspecified',
        },
      });
      results.lists += 1;
      if (list.cells.length) {
        await this.putCells(practiceId, row.id, list.cells);
        results.cells += list.cells.length;
      }
    }
    for (const addOn of parsed.addOns) {
      await this.prisma.opticalAddOn.upsert({
        where: { practiceId_name: { practiceId, name: addOn.name } },
        update: { kind: addOn.kind, price: addOn.price, isActive: true },
        create: {
          practiceId,
          name: addOn.name,
          kind: addOn.kind,
          price: addOn.price,
        },
      });
      results.addOns += 1;
    }
    return results;
  }
}
