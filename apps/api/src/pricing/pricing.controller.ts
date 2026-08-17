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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { PricingService } from './pricing.service';
import {
  CreateAddOnDto,
  CreatePriceListDto,
  ImportWorkbookDto,
  PutCellsDto,
  UpdateAddOnDto,
  UpdatePriceListDto,
} from './pricing.dto';

@Controller('pricing')
@Roles(Role.ADMIN)
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get('lists')
  listLists(@CurrentUser() user: JwtPayload) {
    return this.pricing.listPriceLists(user.practiceId);
  }

  @Post('lists')
  createList(@CurrentUser() user: JwtPayload, @Body() dto: CreatePriceListDto) {
    return this.pricing.createPriceList(user.practiceId, dto);
  }

  @Get('lists/:id')
  getList(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.pricing.getPriceList(user.practiceId, id);
  }

  @Patch('lists/:id')
  updateList(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePriceListDto,
  ) {
    return this.pricing.updatePriceList(user.practiceId, id, dto);
  }

  @Put('lists/:id/cells')
  putCells(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: PutCellsDto,
  ) {
    return this.pricing.putCells(user.practiceId, id, dto.cells);
  }

  @Get('addons')
  listAddOns(@CurrentUser() user: JwtPayload, @Query('all') all?: string) {
    return this.pricing.listAddOns(user.practiceId, all === '1' || all === 'true');
  }

  @Post('addons')
  createAddOn(@CurrentUser() user: JwtPayload, @Body() dto: CreateAddOnDto) {
    return this.pricing.createAddOn(user.practiceId, dto);
  }

  @Patch('addons/:id')
  updateAddOn(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAddOnDto,
  ) {
    return this.pricing.updateAddOn(user.practiceId, id, dto);
  }

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

  @Get('template')
  async template(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const buf = await this.pricing.templateBuffer(user.practiceId);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', 'attachment; filename="lens-price-template.xlsx"');
    res.send(buf);
  }

  @Post('import')
  importJson(@CurrentUser() user: JwtPayload, @Body() dto: ImportWorkbookDto) {
    return this.pricing.importWorkbook(user.practiceId, Buffer.from(dto.dataBase64, 'base64'));
  }

  @Post('import-file')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }))
  importFile(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: { buffer: Buffer; originalname?: string } | undefined,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Upload an .xlsx file as field "file"');
    }
    return this.pricing.importWorkbook(user.practiceId, file.buffer);
  }
}
