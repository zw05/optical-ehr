import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LensDesign } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAddOnDto,
  CreateLensListDto,
  PriceRangeDto,
  UpdateAddOnDto,
  UpdateLensListDto,
} from './pricing.dto';
import { parsePower, roundQuarter } from './optical-powers';
import { describeRange, findRange, type PriceRange } from './price-ranges';
import { buildPriceExport, buildPriceTemplate, parsePriceWorkbook } from './pricing-xlsx';

/** What one sheet of an import would do to the stored catalog. */
export interface ImportListPlan {
  name: string;
  status: 'create' | 'replace';
  source: 'bands' | 'grid';
  rowsRead: number;
  bands: number;
  existingBands: number;
  priceRange: { min: number; max: number } | null;
  sample: string[];
  errors: string[];
  warnings: string[];
}

export interface ImportPlan {
  preview: boolean;
  lists: ImportListPlan[];
  addOns: { name: string; status: 'create' | 'update'; price: number; wasPrice: number | null }[];
  errors: string[];
  /** Populated only once the plan is committed. */
  applied?: { listsCreated: number; listsReplaced: number; bands: number; addOns: number };
}

function toNumber(value: unknown): number {
  return value == null ? 0 : Number(value);
}

/**
 * Spectacle lens pricing: power-banded price lists plus coatings and add-ons.
 * Bands describe ranges rather than individual powers, which is both how lab
 * sheets read and what a person can maintain by hand.
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Price lists ----------

  listPriceLists(practiceId: string, includeInactive = false) {
    return this.prisma.lensPriceList.findMany({
      where: { practiceId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ design: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { ranges: true } } },
    });
  }

  async getPriceList(practiceId: string, id: string) {
    const list = await this.prisma.lensPriceList.findFirst({
      where: { id, practiceId },
      include: { ranges: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!list) throw new NotFoundException('Price list not found');
    return list;
  }

  createPriceList(practiceId: string, dto: CreateLensListDto) {
    return this.prisma.lensPriceList.create({
      data: {
        practiceId,
        name: dto.name.trim(),
        design: dto.design ?? LensDesign.SV,
        material: dto.material.trim(),
        index: dto.index ?? null,
      },
    });
  }

  async updatePriceList(practiceId: string, id: string, dto: UpdateLensListDto) {
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

  /**
   * Normalizes an edited band: powers snap to quarter dioptres and min/max are
   * ordered, so a band typed "from -2 to -6" means the same as "-6 to -2".
   */
  private normalizeRange(range: PriceRangeDto, index: number) {
    const sphA = roundQuarter(range.sphMin);
    const sphB = roundQuarter(range.sphMax);
    const cylA = roundQuarter(range.cylMin);
    const cylB = roundQuarter(range.cylMax);
    if (Math.max(cylA, cylB) > 0) {
      throw new BadRequestException('Cylinder bands must be minus-cyl (zero or negative)');
    }
    if (!Number.isFinite(range.price) || range.price < 0) {
      throw new BadRequestException('Band price must be zero or more');
    }
    return {
      label: range.label?.trim() || null,
      sphMin: Math.min(sphA, sphB),
      sphMax: Math.max(sphA, sphB),
      cylMin: Math.min(cylA, cylB),
      cylMax: Math.max(cylA, cylB),
      price: Math.round(range.price * 100) / 100,
      sortOrder: range.sortOrder ?? index,
    };
  }

  /** Replaces a list's bands wholesale; the editor always saves the full set. */
  async putRanges(practiceId: string, id: string, ranges: PriceRangeDto[]) {
    await this.getPriceList(practiceId, id);
    const rows = ranges.map((range, i) => this.normalizeRange(range, i));
    await this.prisma.$transaction([
      this.prisma.lensPriceRange.deleteMany({ where: { priceListId: id } }),
      ...(rows.length
        ? [this.prisma.lensPriceRange.createMany({ data: rows.map((r) => ({ ...r, priceListId: id })) })]
        : []),
    ]);
    return this.getPriceList(practiceId, id);
  }

  // ---------- Coatings and add-ons ----------

  listAddOns(practiceId: string, includeInactive = false) {
    return this.prisma.opticalAddOn.findMany({
      where: { practiceId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
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

  // ---------- Quoting ----------

  /**
   * Prices one lens at a given power plus any selected add-ons. A power no band
   * covers returns a null price rather than zero, so the optician sees "not
   * offered in this material" instead of quoting a free lens.
   */
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
      include: { ranges: true },
    });
    if (!list) throw new NotFoundException('Price list not found');

    const ranges: PriceRange[] = list.ranges.map((r) => ({
      label: r.label,
      sphMin: toNumber(r.sphMin),
      sphMax: toNumber(r.sphMax),
      cylMin: toNumber(r.cylMin),
      cylMax: toNumber(r.cylMax),
      price: toNumber(r.price),
      sortOrder: r.sortOrder,
    }));
    const band = findRange(ranges, sph, cyl);

    const addOns = addOnIds.length
      ? await this.prisma.opticalAddOn.findMany({
          where: { practiceId, id: { in: addOnIds }, isActive: true },
        })
      : [];
    const addOnTotal = addOns.reduce((sum, a) => sum + toNumber(a.price), 0);

    return {
      list: { id: list.id, name: list.name, design: list.design, material: list.material },
      sphere: sph,
      cylinder: cyl,
      band: band ? { label: band.label ?? describeRange(band), price: band.price } : null,
      lensPrice: band ? band.price : null,
      addOns: addOns.map((a) => ({ id: a.id, name: a.name, price: toNumber(a.price) })),
      total: band ? band.price + addOnTotal : null,
    };
  }

  // ---------- Workbooks ----------

  templateBuffer() {
    return buildPriceTemplate();
  }

  async exportBuffer(practiceId: string) {
    const lists = await this.prisma.lensPriceList.findMany({
      where: { practiceId },
      include: { ranges: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    const addOns = await this.prisma.opticalAddOn.findMany({
      where: { practiceId },
      orderBy: { name: 'asc' },
    });
    return buildPriceExport(
      lists.map((l) => ({
        name: l.name,
        design: l.design,
        material: l.material,
        index: l.index == null ? null : Number(l.index),
        ranges: l.ranges.map((r) => ({
          label: r.label,
          sphMin: toNumber(r.sphMin),
          sphMax: toNumber(r.sphMax),
          cylMin: toNumber(r.cylMin),
          cylMax: toNumber(r.cylMax),
          price: toNumber(r.price),
          sortOrder: r.sortOrder,
        })),
      })),
      addOns.map((a) => ({ name: a.name, kind: a.kind, price: toNumber(a.price) })),
    );
  }

  /**
   * Plans an import, and applies it unless `preview` is set.
   *
   * Price sheets are pasted together by hand and a bad one silently reprices the
   * whole dispensary, so the same call that would write the data can instead
   * describe it: which lists appear, how many bands each collapses to, what the
   * prices span, and which add-ons change and from what. The user commits only
   * after reading that back.
   */
  async importWorkbook(practiceId: string, data: Buffer, preview: boolean): Promise<ImportPlan> {
    const parsed = await parsePriceWorkbook(data);
    if (!parsed.lists.length && !parsed.coatings.length) {
      throw new BadRequestException(
        'No price sheets found in that workbook. Start from the downloadable template.',
      );
    }

    const existingLists = await this.prisma.lensPriceList.findMany({
      where: { practiceId },
      include: { _count: { select: { ranges: true } } },
    });
    const byName = new Map(existingLists.map((l) => [l.name.toLowerCase(), l]));

    const existingAddOns = await this.prisma.opticalAddOn.findMany({ where: { practiceId } });
    const addOnByName = new Map(existingAddOns.map((a) => [a.name.toLowerCase(), a]));

    const plan: ImportPlan = {
      preview,
      lists: parsed.lists.map((sheet) => {
        const existing = byName.get(sheet.name.toLowerCase());
        const prices = sheet.ranges.map((r) => r.price);
        return {
          name: sheet.name,
          status: existing ? 'replace' : 'create',
          source: sheet.source,
          rowsRead: sheet.cellCount,
          bands: sheet.ranges.length,
          existingBands: existing?._count.ranges ?? 0,
          priceRange: prices.length
            ? { min: Math.min(...prices), max: Math.max(...prices) }
            : null,
          sample: sheet.ranges
            .slice(0, 5)
            .map((r) => `${describeRange(r)} = ${r.price.toFixed(2)}`),
          errors: sheet.errors,
          warnings: sheet.warnings,
        };
      }),
      addOns: parsed.coatings.map((coating) => {
        const existing = addOnByName.get(coating.name.toLowerCase());
        return {
          name: coating.name,
          status: existing ? 'update' : 'create',
          price: coating.price,
          wasPrice: existing ? toNumber(existing.price) : null,
        };
      }),
      errors: parsed.coatingErrors,
    };

    if (preview) return plan;

    let listsCreated = 0;
    let listsReplaced = 0;
    let bands = 0;

    for (const sheet of parsed.lists) {
      if (!sheet.ranges.length) continue;
      const existing = byName.get(sheet.name.toLowerCase());
      const list = existing
        ? await this.prisma.lensPriceList.update({
            where: { id: existing.id },
            data: {
              design: sheet.design,
              material: sheet.material,
              index: sheet.index,
              isActive: true,
            },
          })
        : await this.prisma.lensPriceList.create({
            data: {
              practiceId,
              name: sheet.name,
              design: sheet.design,
              material: sheet.material,
              index: sheet.index,
            },
          });
      if (existing) listsReplaced += 1;
      else listsCreated += 1;

      // A sheet is the whole truth for its list: stale bands must not survive it.
      await this.prisma.$transaction([
        this.prisma.lensPriceRange.deleteMany({ where: { priceListId: list.id } }),
        this.prisma.lensPriceRange.createMany({
          data: sheet.ranges.map((r, i) => ({
            priceListId: list.id,
            label: r.label ?? null,
            sphMin: r.sphMin,
            sphMax: r.sphMax,
            cylMin: r.cylMin,
            cylMax: r.cylMax,
            price: r.price,
            sortOrder: r.sortOrder ?? i,
          })),
        }),
      ]);
      bands += sheet.ranges.length;
    }

    for (const coating of parsed.coatings) {
      await this.prisma.opticalAddOn.upsert({
        where: { practiceId_name: { practiceId, name: coating.name } },
        update: { kind: coating.kind, price: coating.price, isActive: true },
        create: {
          practiceId,
          name: coating.name,
          kind: coating.kind,
          price: coating.price,
        },
      });
    }

    plan.applied = {
      listsCreated,
      listsReplaced,
      bands,
      addOns: parsed.coatings.length,
    };
    return plan;
  }
}
