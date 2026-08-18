import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { RequirePermission } from '../auth/permission.decorator';
import { Permission } from '../auth/permissions';
import { PricingService } from './pricing.service';
import {
  CreateAddOnDto,
  CreateLensListDto,
  ImportWorkbookDto,
  PutRangesDto,
  UpdateAddOnDto,
  UpdateLensListDto,
} from './pricing.dto';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Refuses a base64 payload larger than this once decoded. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function decodeWorkbook(dataBase64: string): Buffer {
  const buffer = Buffer.from(dataBase64, 'base64');
  if (buffer.length === 0) throw new BadRequestException('Uploaded file is empty');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new BadRequestException('Workbook is larger than 8 MB');
  }
  return buffer;
}

/**
 * Spectacle lens pricing: power-banded price lists plus coatings and add-ons.
 * Reading prices is open to any signed-in staff member because quoting a job at
 * the dispensing table needs them; changing them needs the pricing capability.
 */
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get('lens-lists')
  listLists(@CurrentUser() user: JwtPayload, @Query('all') all?: string) {
    return this.pricing.listPriceLists(user.practiceId, all === '1' || all === 'true');
  }

  @Post('lens-lists')
  @RequirePermission(Permission.LENS_PRICING_EDIT)
  createList(@CurrentUser() user: JwtPayload, @Body() dto: CreateLensListDto) {
    return this.pricing.createPriceList(user.practiceId, dto);
  }

  @Get('lens-lists/template')
  async template(@Res() res: Response) {
    const buf = await this.pricing.templateBuffer();
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', 'attachment; filename="lens-price-template.xlsx"');
    res.send(buf);
  }

  @Get('lens-lists/export')
  async exportAll(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const buf = await this.pricing.exportBuffer(user.practiceId);
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', 'attachment; filename="lens-prices.xlsx"');
    res.send(buf);
  }

  /**
   * POST /api/pricing/lens-lists/import — with `preview: true` returns what the
   * workbook would change without writing anything; without it, applies the
   * same plan and reports what it did.
   */
  @Post('lens-lists/import')
  @RequirePermission(Permission.LENS_PRICING_EDIT)
  importWorkbook(@CurrentUser() user: JwtPayload, @Body() dto: ImportWorkbookDto) {
    return this.pricing.importWorkbook(
      user.practiceId,
      decodeWorkbook(dto.dataBase64),
      dto.preview === true,
    );
  }

  @Get('lens-lists/:id')
  getList(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.pricing.getPriceList(user.practiceId, id);
  }

  @Patch('lens-lists/:id')
  @RequirePermission(Permission.LENS_PRICING_EDIT)
  updateList(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateLensListDto,
  ) {
    return this.pricing.updatePriceList(user.practiceId, id, dto);
  }

  @Put('lens-lists/:id/ranges')
  @RequirePermission(Permission.LENS_PRICING_EDIT)
  putRanges(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: PutRangesDto,
  ) {
    return this.pricing.putRanges(user.practiceId, id, dto.ranges);
  }

  @Get('add-ons')
  listAddOns(@CurrentUser() user: JwtPayload, @Query('all') all?: string) {
    return this.pricing.listAddOns(user.practiceId, all === '1' || all === 'true');
  }

  @Post('add-ons')
  @RequirePermission(Permission.LENS_PRICING_EDIT)
  createAddOn(@CurrentUser() user: JwtPayload, @Body() dto: CreateAddOnDto) {
    return this.pricing.createAddOn(user.practiceId, dto);
  }

  @Patch('add-ons/:id')
  @RequirePermission(Permission.LENS_PRICING_EDIT)
  updateAddOn(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAddOnDto,
  ) {
    return this.pricing.updateAddOn(user.practiceId, id, dto);
  }

  /** GET /api/pricing/quote — price one lens power plus selected add-ons. */
  @Get('quote')
  quote(
    @CurrentUser() user: JwtPayload,
    @Query('listId') listId: string,
    @Query('sphere') sphere: string,
    @Query('cylinder') cylinder: string,
    @Query('addOnIds') addOnIds?: string,
  ) {
    const ids = addOnIds ? addOnIds.split(',').filter(Boolean) : [];
    return this.pricing.quote(user.practiceId, listId, Number(sphere), Number(cylinder), ids);
  }
}
