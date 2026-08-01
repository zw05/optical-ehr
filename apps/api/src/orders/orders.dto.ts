import { IsEnum, IsNumber, IsObject, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { OrderKind, OrderStatus } from '@prisma/client';

export class CreateOrderDto {
  @IsUUID()
  patientId!: string;

  @IsUUID()
  prescriptionId!: string;

  @IsEnum(OrderKind)
  kind!: OrderKind;

  /**
   * Spectacle: frame, lens, and measurement details.
   * Contact lens: quantities, brand, supply period, trial flag.
   */
  @IsObject()
  details!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  labName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceTotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit?: number;
}

export class UpdateOrderDto {
  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  labName?: string;

  @IsOptional()
  @IsString()
  labReference?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceTotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit?: number;

  @IsOptional()
  @IsString()
  warrantyNotes?: string;
}

export class SetOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

export class RemakeOrderDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
