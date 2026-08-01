import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { InventoryKind, Role } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, NotEquals } from 'class-validator';
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
}

class AdjustQuantityDto {
  @IsInt()
  @NotEquals(0)
  delta!: number;
}

/** Frame and contact-lens trial stock management. */
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  /** GET /api/inventory?kind=&q= — search active SKUs. */
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('kind') kind?: InventoryKind,
    @Query('q') query?: string,
  ) {
    return this.inventory.list(user.practiceId, kind, query);
  }

  /** POST /api/inventory — create or update an item by SKU. */
  @Post()
  @Roles(Role.OPTICIAN, Role.ADMIN)
  upsert(@CurrentUser() user: JwtPayload, @Body() dto: UpsertItemDto) {
    return this.inventory.upsert(user.practiceId, dto);
  }

  /** PATCH /api/inventory/:id/quantity — receive (+) or consume (−) stock. */
  @Patch(':id/quantity')
  @Roles(Role.OPTICIAN, Role.ADMIN)
  adjust(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AdjustQuantityDto) {
    return this.inventory.adjustQuantity(user.practiceId, id, dto.delta);
  }

  /** DELETE /api/inventory/:id — soft-delete an SKU. */
  @Delete(':id')
  @Roles(Role.ADMIN)
  deactivate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inventory.deactivate(user.practiceId, id);
  }
}
