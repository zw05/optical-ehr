import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { InventoryKind, Role } from '@prisma/client';
import { Response } from 'express';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, NotEquals } from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { InventoryService } from './inventory.service';

class UpsertItemDto {
  @IsEnum(InventoryKind)
  kind!: InventoryKind;

  @IsString()
  sku!: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  eye?: string;

  @IsOptional()
  @IsString()
  bridge?: string;

  @IsOptional()
  @IsString()
  temple?: string;

  @IsOptional()
  @IsString()
  a?: string;

  @IsOptional()
  @IsString()
  b?: string;

  @IsOptional()
  @IsString()
  ed?: string;

  @IsOptional()
  @IsString()
  material?: string;

  @IsOptional()
  @IsString()
  shape?: string;

  @IsOptional()
  @IsString()
  upc?: string;

  @IsOptional()
  @IsInt()
  reorderPoint?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  retail?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class AdjustQuantityDto {
  @IsInt()
  @NotEquals(0)
  delta!: number;
}

class ImportFileDto {
  @IsString()
  fileName!: string;

  @IsString()
  dataBase64!: string;
}

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('kind') kind?: InventoryKind,
    @Query('q') query?: string,
    @Query('all') all?: string,
  ) {
    return this.inventory.list(user.practiceId, kind, query, all === '1' || all === 'true');
  }

  @Get('frames/template')
  @Roles(Role.ADMIN)
  async framesTemplate(@Res() res: Response) {
    const buf = await this.inventory.framesTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="frames-template.xlsx"');
    res.send(buf);
  }

  @Post('frames/import')
  @Roles(Role.ADMIN)
  importFrames(@CurrentUser() user: JwtPayload, @Body() dto: ImportFileDto) {
    return this.inventory.importFrames(user.practiceId, Buffer.from(dto.dataBase64, 'base64'));
  }

  @Post()
  @Roles(Role.OPTICIAN, Role.ADMIN)
  upsert(@CurrentUser() user: JwtPayload, @Body() dto: UpsertItemDto) {
    return this.inventory.upsert(user.practiceId, dto);
  }

  @Patch(':id/quantity')
  @Roles(Role.OPTICIAN, Role.ADMIN)
  adjust(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AdjustQuantityDto) {
    return this.inventory.adjustQuantity(user.practiceId, id, dto.delta);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  deactivate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inventory.deactivate(user.practiceId, id);
  }
}
