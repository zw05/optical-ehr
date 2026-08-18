import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { RequirePermission } from '../auth/permission.decorator';
import { Permission } from '../auth/permissions';
import { ContactLensPricingService, type SupplyPeriod } from './contact-lens-pricing.service';
import {
  CreateContactLensFeeDto,
  CreateContactLensProductDto,
  ImportContactLensDto,
  UpdateContactLensFeeDto,
  UpdateContactLensProductDto,
} from './contact-lens-pricing.dto';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const SUPPLY_PERIODS: SupplyPeriod[] = ['box', 'sixMonth', 'annual'];

function decodeWorkbook(dataBase64: string): Buffer {
  const buffer = Buffer.from(dataBase64, 'base64');
  if (buffer.length === 0) throw new BadRequestException('Uploaded file is empty');
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new BadRequestException('Workbook is larger than 8 MB');
  }
  return buffer;
}

/**
 * Contact lens catalog and pricing. Readable by any signed-in staff member so
 * the counter can quote a supply; editing needs the contact lens capability.
 */
@Controller('contact-lens-pricing')
export class ContactLensPricingController {
  constructor(private readonly pricing: ContactLensPricingService) {}

  @Get('products')
  listProducts(
    @CurrentUser() user: JwtPayload,
    @Query('all') all?: string,
    @Query('q') query?: string,
  ) {
    return this.pricing.listProducts(user.practiceId, all === '1' || all === 'true', query);
  }

  @Post('products')
  @RequirePermission(Permission.CONTACT_LENS_PRICING_EDIT)
  createProduct(@CurrentUser() user: JwtPayload, @Body() dto: CreateContactLensProductDto) {
    return this.pricing.createProduct(user.practiceId, dto);
  }

  @Patch('products/:id')
  @RequirePermission(Permission.CONTACT_LENS_PRICING_EDIT)
  updateProduct(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateContactLensProductDto,
  ) {
    return this.pricing.updateProduct(user.practiceId, id, dto);
  }

  @Get('fees')
  listFees(@CurrentUser() user: JwtPayload, @Query('all') all?: string) {
    return this.pricing.listFees(user.practiceId, all === '1' || all === 'true');
  }

  @Post('fees')
  @RequirePermission(Permission.CONTACT_LENS_PRICING_EDIT)
  createFee(@CurrentUser() user: JwtPayload, @Body() dto: CreateContactLensFeeDto) {
    return this.pricing.createFee(user.practiceId, dto);
  }

  @Patch('fees/:id')
  @RequirePermission(Permission.CONTACT_LENS_PRICING_EDIT)
  updateFee(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateContactLensFeeDto,
  ) {
    return this.pricing.updateFee(user.practiceId, id, dto);
  }

  @Get('template')
  async template(@Res() res: Response) {
    const buf = await this.pricing.templateBuffer();
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', 'attachment; filename="contact-lens-template.xlsx"');
    res.send(buf);
  }

  @Get('export')
  async exportAll(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const buf = await this.pricing.exportBuffer(user.practiceId);
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', 'attachment; filename="contact-lens-prices.xlsx"');
    res.send(buf);
  }

  /** POST /api/contact-lens-pricing/import — `preview: true` diffs without writing. */
  @Post('import')
  @RequirePermission(Permission.CONTACT_LENS_PRICING_EDIT)
  importWorkbook(@CurrentUser() user: JwtPayload, @Body() dto: ImportContactLensDto) {
    return this.pricing.importWorkbook(
      user.practiceId,
      decodeWorkbook(dto.dataBase64),
      dto.preview === true,
    );
  }

  /** GET /api/contact-lens-pricing/quote — price a supply plus fitting fees. */
  @Get('quote')
  quote(
    @CurrentUser() user: JwtPayload,
    @Query('productId') productId: string,
    @Query('period') period = 'annual',
    @Query('eyes') eyes = '2',
    @Query('feeIds') feeIds?: string,
  ) {
    if (!SUPPLY_PERIODS.includes(period as SupplyPeriod)) {
      throw new BadRequestException(`Period must be one of ${SUPPLY_PERIODS.join(', ')}`);
    }
    const ids = feeIds ? feeIds.split(',').filter(Boolean) : [];
    return this.pricing.quote(
      user.practiceId,
      productId,
      period as SupplyPeriod,
      Number(eyes),
      ids,
    );
  }
}
