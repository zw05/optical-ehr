import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { CodeSystem } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { RequirePermission } from '../auth/permission.decorator';
import { Permission } from '../auth/permissions';
import { CodesService } from './codes.service';
import { CreateCodeDto, ImportCodesDto, UpdateCodeDto } from './codes.dto';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function decodeWorkbook(dataBase64: string): Buffer {
  const buffer = Buffer.from(dataBase64, 'base64');
  if (buffer.length === 0) throw new BadRequestException('Uploaded file is empty');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new BadRequestException('Workbook is larger than 8 MB');
  }
  return buffer;
}

function parseSystem(raw: string | undefined): CodeSystem | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toUpperCase();
  if (key in CodeSystem) return key as CodeSystem;
  throw new BadRequestException(`Unknown code system "${raw}"`);
}

/**
 * The practice's diagnosis and procedure code catalog. Lookups are open to any
 * signed-in role because charting needs them; maintaining the list needs the
 * codes capability.
 */
@Controller('codes')
export class CodesController {
  constructor(private readonly codes: CodesService) {}

  /** GET /api/codes/icd10?q=... — diagnosis type-ahead used by the exam page. */
  @Get('icd10')
  searchIcd10(
    @CurrentUser() user: JwtPayload,
    @Query('q') q = '',
    @Query('take') take?: string,
  ) {
    return this.codes.search(
      user.practiceId,
      CodeSystem.ICD10,
      q,
      take ? Number(take) : undefined,
    );
  }

  /** GET /api/codes/search?system=CPT&q=... — type-ahead for any code system. */
  @Get('search')
  search(
    @CurrentUser() user: JwtPayload,
    @Query('system') system = 'ICD10',
    @Query('q') q = '',
    @Query('take') take?: string,
  ) {
    return this.codes.search(
      user.practiceId,
      parseSystem(system) ?? CodeSystem.ICD10,
      q,
      take ? Number(take) : undefined,
    );
  }

  /**
   * GET /api/codes — one page of the catalog for the settings screen.
   * Returns `{ rows, total, page, pageSize, totalPages }`; `page` is the page
   * actually served, which may be lower than asked for if the filter narrowed.
   */
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('system') system?: string,
    @Query('q') query?: string,
    @Query('all') all?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.codes.list(user.practiceId, {
      system: parseSystem(system),
      query,
      includeInactive: all === '1' || all === 'true',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('template')
  async template(@Res() res: Response) {
    const buf = await this.codes.templateBuffer();
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', 'attachment; filename="code-catalog-template.xlsx"');
    res.send(buf);
  }

  @Get('export')
  async exportAll(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const buf = await this.codes.exportBuffer(user.practiceId);
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', 'attachment; filename="code-catalog.xlsx"');
    res.send(buf);
  }

  @Post()
  @RequirePermission(Permission.CODES_EDIT)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCodeDto) {
    return this.codes.create(user.practiceId, dto);
  }

  /** POST /api/codes/import — `preview: true` diffs the workbook without writing. */
  @Post('import')
  @RequirePermission(Permission.CODES_EDIT)
  importWorkbook(@CurrentUser() user: JwtPayload, @Body() dto: ImportCodesDto) {
    return this.codes.importWorkbook(
      user.practiceId,
      decodeWorkbook(dto.dataBase64),
      dto.preview === true,
    );
  }

  /** POST /api/codes/restore-defaults — re-add the bundled starter codes. */
  @Post('restore-defaults')
  @RequirePermission(Permission.CODES_EDIT)
  restoreDefaults(@CurrentUser() user: JwtPayload) {
    return this.codes.restoreDefaults(user.practiceId);
  }

  @Patch(':id')
  @RequirePermission(Permission.CODES_EDIT)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateCodeDto) {
    return this.codes.update(user.practiceId, id, dto);
  }

  /**
   * DELETE /api/codes/:id — retires the code. Signed exams reference codes by
   * value, so entries are withdrawn from the pickers rather than destroyed.
   */
  @Delete(':id')
  @RequirePermission(Permission.CODES_EDIT)
  retire(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.codes.retire(user.practiceId, id);
  }
}
