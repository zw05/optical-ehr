import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContactLensFeeKind, ContactLensModality, ContactLensType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateContactLensFeeDto,
  CreateContactLensProductDto,
  UpdateContactLensFeeDto,
  UpdateContactLensProductDto,
} from './contact-lens-pricing.dto';
import {
  buildContactLensExport,
  buildContactLensTemplate,
  parseContactLensWorkbook,
} from './contact-lens-xlsx';

/** Supply lengths a practice quotes at the counter. */
export type SupplyPeriod = 'box' | 'sixMonth' | 'annual';

export interface ContactLensImportPlan {
  preview: boolean;
  products: {
    brand: string;
    productName: string;
    status: 'create' | 'update';
    pricePerBox: number;
    wasPricePerBox: number | null;
  }[];
  fees: { name: string; status: 'create' | 'update'; price: number; wasPrice: number | null }[];
  errors: string[];
  applied?: { productsCreated: number; productsUpdated: number; fees: number };
}

function toNumber(value: Prisma.Decimal | number | null): number | null {
  return value == null ? null : Number(value);
}

/**
 * Contact lens catalog, supply pricing, and professional fees. Priced per box
 * rather than per power, because contact lens parameters do not change what the
 * practice pays or charges.
 */
@Injectable()
export class ContactLensPricingService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Products ----------

  listProducts(practiceId: string, includeInactive = false, query?: string) {
    const search = query?.trim();
    return this.prisma.contactLensProduct.findMany({
      where: {
        practiceId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(search
          ? {
              OR: [
                { brand: { contains: search, mode: 'insensitive' } },
                { productName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ brand: 'asc' }, { productName: 'asc' }],
    });
  }

  createProduct(practiceId: string, dto: CreateContactLensProductDto) {
    return this.prisma.contactLensProduct.create({
      data: {
        practiceId,
        brand: dto.brand.trim(),
        productName: dto.productName.trim(),
        modality: dto.modality ?? ContactLensModality.MONTHLY,
        lensType: dto.lensType ?? ContactLensType.SPHERICAL,
        lensesPerBox: dto.lensesPerBox ?? null,
        boxesPerYearPerEye: dto.boxesPerYearPerEye ?? 4,
        pricePerBox: dto.pricePerBox,
        annualSupplyPrice: dto.annualSupplyPrice ?? null,
        sixMonthPrice: dto.sixMonthPrice ?? null,
        rebateNote: dto.rebateNote?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async updateProduct(practiceId: string, id: string, dto: UpdateContactLensProductDto) {
    const existing = await this.prisma.contactLensProduct.findFirst({ where: { id, practiceId } });
    if (!existing) throw new NotFoundException('Contact lens product not found');
    return this.prisma.contactLensProduct.update({
      where: { id },
      data: {
        ...(dto.brand !== undefined ? { brand: dto.brand.trim() } : {}),
        ...(dto.productName !== undefined ? { productName: dto.productName.trim() } : {}),
        ...(dto.modality !== undefined ? { modality: dto.modality } : {}),
        ...(dto.lensType !== undefined ? { lensType: dto.lensType } : {}),
        ...(dto.lensesPerBox !== undefined ? { lensesPerBox: dto.lensesPerBox } : {}),
        ...(dto.boxesPerYearPerEye !== undefined
          ? { boxesPerYearPerEye: dto.boxesPerYearPerEye }
          : {}),
        ...(dto.pricePerBox !== undefined ? { pricePerBox: dto.pricePerBox } : {}),
        ...(dto.annualSupplyPrice !== undefined
          ? { annualSupplyPrice: dto.annualSupplyPrice }
          : {}),
        ...(dto.sixMonthPrice !== undefined ? { sixMonthPrice: dto.sixMonthPrice } : {}),
        ...(dto.rebateNote !== undefined ? { rebateNote: dto.rebateNote?.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  // ---------- Fitting and evaluation fees ----------

  listFees(practiceId: string, includeInactive = false) {
    return this.prisma.contactLensFee.findMany({
      where: { practiceId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
  }

  createFee(practiceId: string, dto: CreateContactLensFeeDto) {
    return this.prisma.contactLensFee.create({
      data: {
        practiceId,
        name: dto.name.trim(),
        kind: dto.kind ?? ContactLensFeeKind.OTHER,
        price: dto.price,
      },
    });
  }

  async updateFee(practiceId: string, id: string, dto: UpdateContactLensFeeDto) {
    const existing = await this.prisma.contactLensFee.findFirst({ where: { id, practiceId } });
    if (!existing) throw new NotFoundException('Fee not found');
    return this.prisma.contactLensFee.update({
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
   * Prices a contact lens supply for one or both eyes.
   *
   * Bundle prices are stored per eye rather than derived, because an annual
   * supply is normally discounted below the per-box rate. Where a practice has
   * not set a bundle price, the quote falls back to boxes at the per-box rate
   * and says so, so the counter never quotes an unset bundle as free.
   */
  async quote(
    practiceId: string,
    productId: string,
    period: SupplyPeriod,
    eyes: number,
    feeIds: string[],
  ) {
    if (eyes !== 1 && eyes !== 2) throw new BadRequestException('Eyes must be 1 or 2');
    const product = await this.prisma.contactLensProduct.findFirst({
      where: { id: productId, practiceId, isActive: true },
    });
    if (!product) throw new NotFoundException('Contact lens product not found');

    const perBox = Number(product.pricePerBox);
    const annual = toNumber(product.annualSupplyPrice);
    const sixMonth = toNumber(product.sixMonthPrice);

    let perEye: number;
    let boxesPerEye: number;
    let basis: 'bundle' | 'per-box';

    if (period === 'annual') {
      boxesPerEye = product.boxesPerYearPerEye;
      perEye = annual ?? perBox * boxesPerEye;
      basis = annual == null ? 'per-box' : 'bundle';
    } else if (period === 'sixMonth') {
      boxesPerEye = Math.max(1, Math.ceil(product.boxesPerYearPerEye / 2));
      perEye = sixMonth ?? perBox * boxesPerEye;
      basis = sixMonth == null ? 'per-box' : 'bundle';
    } else {
      boxesPerEye = 1;
      perEye = perBox;
      basis = 'per-box';
    }

    const fees = feeIds.length
      ? await this.prisma.contactLensFee.findMany({
          where: { practiceId, id: { in: feeIds }, isActive: true },
        })
      : [];
    const feeTotal = fees.reduce((sum, f) => sum + Number(f.price), 0);
    const material = Math.round(perEye * eyes * 100) / 100;

    return {
      product: {
        id: product.id,
        brand: product.brand,
        productName: product.productName,
        modality: product.modality,
        lensType: product.lensType,
      },
      period,
      eyes,
      basis,
      boxesPerEye,
      pricePerEye: Math.round(perEye * 100) / 100,
      materialTotal: material,
      fees: fees.map((f) => ({ id: f.id, name: f.name, price: Number(f.price) })),
      total: Math.round((material + feeTotal) * 100) / 100,
      rebateNote: product.rebateNote,
    };
  }

  // ---------- Workbooks ----------

  templateBuffer() {
    return buildContactLensTemplate();
  }

  async exportBuffer(practiceId: string) {
    const products = await this.prisma.contactLensProduct.findMany({
      where: { practiceId },
      orderBy: [{ brand: 'asc' }, { productName: 'asc' }],
    });
    const fees = await this.prisma.contactLensFee.findMany({
      where: { practiceId },
      orderBy: { name: 'asc' },
    });
    return buildContactLensExport(
      products.map((p) => ({
        brand: p.brand,
        productName: p.productName,
        modality: p.modality,
        lensType: p.lensType,
        lensesPerBox: p.lensesPerBox,
        boxesPerYearPerEye: p.boxesPerYearPerEye,
        pricePerBox: Number(p.pricePerBox),
        annualSupplyPrice: toNumber(p.annualSupplyPrice),
        sixMonthPrice: toNumber(p.sixMonthPrice),
        rebateNote: p.rebateNote,
        notes: p.notes,
      })),
      fees.map((f) => ({ name: f.name, kind: f.kind, price: Number(f.price) })),
    );
  }

  /** Plans an import, applying it only when `preview` is false. */
  async importWorkbook(
    practiceId: string,
    data: Buffer,
    preview: boolean,
  ): Promise<ContactLensImportPlan> {
    const parsed = await parseContactLensWorkbook(data);
    if (!parsed.products.length && !parsed.fees.length) {
      throw new BadRequestException(
        'No contact lens rows found in that workbook. Start from the downloadable template.',
      );
    }

    const existingProducts = await this.prisma.contactLensProduct.findMany({
      where: { practiceId },
    });
    const productKey = (brand: string, name: string) =>
      `${brand.trim().toLowerCase()}|${name.trim().toLowerCase()}`;
    const byProduct = new Map(
      existingProducts.map((p) => [productKey(p.brand, p.productName), p]),
    );

    const existingFees = await this.prisma.contactLensFee.findMany({ where: { practiceId } });
    const byFee = new Map(existingFees.map((f) => [f.name.trim().toLowerCase(), f]));

    const plan: ContactLensImportPlan = {
      preview,
      products: parsed.products.map((p) => {
        const existing = byProduct.get(productKey(p.brand, p.productName));
        return {
          brand: p.brand,
          productName: p.productName,
          status: existing ? 'update' : 'create',
          pricePerBox: p.pricePerBox,
          wasPricePerBox: existing ? Number(existing.pricePerBox) : null,
        };
      }),
      fees: parsed.fees.map((f) => {
        const existing = byFee.get(f.name.trim().toLowerCase());
        return {
          name: f.name,
          status: existing ? 'update' : 'create',
          price: f.price,
          wasPrice: existing ? Number(existing.price) : null,
        };
      }),
      errors: parsed.errors,
    };

    if (preview) return plan;

    let productsCreated = 0;
    let productsUpdated = 0;
    for (const p of parsed.products) {
      const existing = byProduct.get(productKey(p.brand, p.productName));
      if (existing) productsUpdated += 1;
      else productsCreated += 1;
      await this.prisma.contactLensProduct.upsert({
        where: {
          practiceId_brand_productName: {
            practiceId,
            brand: p.brand,
            productName: p.productName,
          },
        },
        update: {
          modality: p.modality,
          lensType: p.lensType,
          lensesPerBox: p.lensesPerBox,
          boxesPerYearPerEye: p.boxesPerYearPerEye,
          pricePerBox: p.pricePerBox,
          annualSupplyPrice: p.annualSupplyPrice,
          sixMonthPrice: p.sixMonthPrice,
          rebateNote: p.rebateNote,
          notes: p.notes,
          isActive: true,
        },
        create: {
          practiceId,
          brand: p.brand,
          productName: p.productName,
          modality: p.modality,
          lensType: p.lensType,
          lensesPerBox: p.lensesPerBox,
          boxesPerYearPerEye: p.boxesPerYearPerEye,
          pricePerBox: p.pricePerBox,
          annualSupplyPrice: p.annualSupplyPrice,
          sixMonthPrice: p.sixMonthPrice,
          rebateNote: p.rebateNote,
          notes: p.notes,
        },
      });
    }

    for (const fee of parsed.fees) {
      await this.prisma.contactLensFee.upsert({
        where: { practiceId_name: { practiceId, name: fee.name } },
        update: { kind: fee.kind, price: fee.price, isActive: true },
        create: { practiceId, name: fee.name, kind: fee.kind, price: fee.price },
      });
    }

    plan.applied = { productsCreated, productsUpdated, fees: parsed.fees.length };
    return plan;
  }
}
