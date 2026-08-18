import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CodeCatalogEntry, CodeSystem, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ICD10_OPTOMETRY, type Icd10Entry } from './icd10-optometry';
import { CPT_OPTOMETRY, HCPCS_OPTOMETRY } from './procedure-codes';
import { CreateCodeDto, UpdateCodeDto } from './codes.dto';
import { buildCodeExport, buildCodeTemplate, parseCodeWorkbook } from './codes-xlsx';

const DEFAULT_TAKE = 10;
const MAX_TAKE = 50;

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/** Keeps a page number or size inside sane bounds, tolerating NaN from a query string. */
function clamp(value: number, min: number, max: number): number {
    return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;
}

/** Bundled starter catalog a practice's own list is seeded from. */
const STARTER_CODES: { system: CodeSystem; code: string; description: string; category: string }[] = [
  ...ICD10_OPTOMETRY.map((e) => ({
    system: CodeSystem.ICD10,
    code: e.code,
    description: e.description,
    category: 'Diagnosis',
  })),
  ...CPT_OPTOMETRY.map((e) => ({ system: CodeSystem.CPT, ...e })),
  ...HCPCS_OPTOMETRY.map((e) => ({ system: CodeSystem.HCPCS, ...e })),
];

/**
 * Ranks a search hit. An exact code match beats a prefix, which beats a word
 * starting inside the description, which beats a bare substring — so typing
 * "H52" surfaces the refractive codes before anything that merely mentions them.
 */
function rank(entry: { code: string; description: string }, q: string): number {
  const code = entry.code.toLowerCase();
  const desc = entry.description.toLowerCase();
  if (code === q) return 0;
  if (code.startsWith(q)) return 1;
  if (desc.startsWith(q)) return 2;
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(desc)) return 3;
  if (desc.includes(q)) return 4;
  if (code.includes(q)) return 5;
  return 99;
}

@Injectable()
export class CodesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fills an empty catalog from the bundled starter sets the first time a
   * practice touches it. Seeding lazily rather than in a migration means a
   * practice that has already curated its codes is never re-seeded, and one
   * upgrading from the old hard-coded list gets exactly what it had before.
   */
  async ensureSeeded(practiceId: string): Promise<void> {
    const existing = await this.prisma.codeCatalogEntry.count({ where: { practiceId } });
    if (existing > 0) return;
    await this.prisma.codeCatalogEntry.createMany({
      data: STARTER_CODES.map((entry) => ({ practiceId, ...entry })),
      skipDuplicates: true,
    });
  }

  /**
   * One page of the catalog for the settings screen.
   *
   * Paged in the database rather than the browser: a practice that imports a
   * full ICD-10 release has tens of thousands of codes, and shipping all of them
   * to render fifty is wasteful however short the visible list looks.
   *
   * The requested page is clamped to what the filter actually returns, so
   * narrowing a search while on page 12 lands on the last real page instead of
   * an empty one.
   */
  async list(
    practiceId: string,
    options: {
      system?: CodeSystem;
      query?: string;
      includeInactive?: boolean;
      page?: number;
      pageSize?: number;
    },
  ): Promise<{
    rows: CodeCatalogEntry[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    await this.ensureSeeded(practiceId);
    const search = options.query?.trim();
    const where: Prisma.CodeCatalogEntryWhereInput = {
      practiceId,
      ...(options.system ? { system: options.system } : {}),
      ...(options.includeInactive ? {} : { isActive: true }),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const pageSize = clamp(options.pageSize ?? DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const total = await this.prisma.codeCatalogEntry.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = clamp(Math.trunc(options.page ?? 1), 1, totalPages);

    const rows = await this.prisma.codeCatalogEntry.findMany({
      where,
      orderBy: [{ system: 'asc' }, { code: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { rows, total, page, pageSize, totalPages };
  }

  /**
   * Type-ahead lookup for the exam pickers. Favourites sort first among equally
   * good matches, so the handful of codes a practice bills every day stay one
   * keystroke away.
   */
  async search(
    practiceId: string,
    system: CodeSystem,
    query: string,
    take?: number,
  ): Promise<Icd10Entry[]> {
    const q = query.trim().toLowerCase();
    if (q.length < 1) return [];
    await this.ensureSeeded(practiceId);
    const limit = Math.min(Math.max(take ?? DEFAULT_TAKE, 1), MAX_TAKE);

    const rows = await this.prisma.codeCatalogEntry.findMany({
      where: {
        practiceId,
        system,
        isActive: true,
        OR: [
          { code: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      // Over-fetch so ranking sees more than the database's alphabetical head.
      take: limit * 20,
    });

    return rows
      .map((row) => ({ row, score: rank(row, q) }))
      .filter(({ score }) => score < 99)
      .sort(
        (a, b) =>
          a.score - b.score ||
          Number(b.row.isFavorite) - Number(a.row.isFavorite) ||
          a.row.code.localeCompare(b.row.code),
      )
      .slice(0, limit)
      .map(({ row }) => ({ code: row.code, description: row.description }));
  }

  async create(practiceId: string, dto: CreateCodeDto) {
    await this.ensureSeeded(practiceId);
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.codeCatalogEntry.findUnique({
      where: { practiceId_system_code: { practiceId, system: dto.system, code } },
    });
    if (existing) {
      throw new BadRequestException(`${dto.system} ${code} is already in the catalog`);
    }
    return this.prisma.codeCatalogEntry.create({
      data: {
        practiceId,
        system: dto.system,
        code,
        description: dto.description.trim(),
        category: dto.category?.trim() || null,
        isFavorite: dto.isFavorite ?? false,
      },
    });
  }

  async update(practiceId: string, id: string, dto: UpdateCodeDto) {
    const existing = await this.prisma.codeCatalogEntry.findFirst({ where: { id, practiceId } });
    if (!existing) throw new NotFoundException('Code not found');
    return this.prisma.codeCatalogEntry.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category?.trim() || null } : {}),
        ...(dto.isFavorite !== undefined ? { isFavorite: dto.isFavorite } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /**
   * Retires a code rather than deleting it. Codes are referenced by exams that
   * were already signed, and a signed record must keep meaning what it said, so
   * removal here only stops the code being offered on new charts.
   */
  async retire(practiceId: string, id: string) {
    const existing = await this.prisma.codeCatalogEntry.findFirst({ where: { id, practiceId } });
    if (!existing) throw new NotFoundException('Code not found');
    return this.prisma.codeCatalogEntry.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /** Restores the bundled starter set without disturbing codes already present. */
  async restoreDefaults(practiceId: string) {
    const result = await this.prisma.codeCatalogEntry.createMany({
      data: STARTER_CODES.map((entry) => ({ practiceId, ...entry })),
      skipDuplicates: true,
    });
    return { added: result.count };
  }

  // ---------- Workbooks ----------

  templateBuffer() {
    return buildCodeTemplate();
  }

  async exportBuffer(practiceId: string) {
    await this.ensureSeeded(practiceId);
    const rows = await this.prisma.codeCatalogEntry.findMany({
      where: { practiceId },
      orderBy: [{ system: 'asc' }, { code: 'asc' }],
    });
    return buildCodeExport(rows);
  }

  async importWorkbook(practiceId: string, data: Buffer, preview: boolean) {
    await this.ensureSeeded(practiceId);
    const parsed = await parseCodeWorkbook(data);
    if (!parsed.rows.length) {
      throw new BadRequestException(
        'No codes found in that workbook. Start from the downloadable template.',
      );
    }

    const existing = await this.prisma.codeCatalogEntry.findMany({
      where: { practiceId },
      select: { system: true, code: true, description: true },
    });
    const key = (system: CodeSystem, code: string) => `${system}|${code.toUpperCase()}`;
    const byKey = new Map(existing.map((e) => [key(e.system, e.code), e]));

    const plan = {
      preview,
      rows: parsed.rows.map((row) => {
        const match = byKey.get(key(row.system, row.code));
        return {
          system: row.system,
          code: row.code,
          description: row.description,
          status: match ? ('update' as const) : ('create' as const),
          wasDescription: match?.description ?? null,
        };
      }),
      errors: parsed.errors,
      applied: undefined as { created: number; updated: number } | undefined,
    };

    if (preview) return plan;

    let created = 0;
    let updated = 0;
    for (const row of parsed.rows) {
      const code = row.code.toUpperCase();
      const match = byKey.get(key(row.system, code));
      if (match) updated += 1;
      else created += 1;
      await this.prisma.codeCatalogEntry.upsert({
        where: { practiceId_system_code: { practiceId, system: row.system, code } },
        update: {
          description: row.description,
          category: row.category,
          isActive: true,
          ...(row.isFavorite != null ? { isFavorite: row.isFavorite } : {}),
        },
        create: {
          practiceId,
          system: row.system,
          code,
          description: row.description,
          category: row.category,
          isFavorite: row.isFavorite ?? false,
        },
      });
    }

    plan.applied = { created, updated };
    return plan;
  }
}
