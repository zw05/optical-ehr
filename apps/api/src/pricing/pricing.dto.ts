import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LensDesign, OpticalAddOnKind } from '@prisma/client';

export class CreateLensListDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsEnum(LensDesign)
  design?: LensDesign;

  @IsString()
  @MinLength(1)
  material!: string;

  @IsOptional()
  @IsNumber()
  index?: number;
}

export class UpdateLensListDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(LensDesign)
  design?: LensDesign;

  @IsOptional()
  @IsString()
  material?: string;

  @IsOptional()
  @IsNumber()
  index?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreatePriceListDto extends CreateLensListDto {}
export class UpdatePriceListDto extends UpdateLensListDto {}

export class PriceCellDto {
  @IsNumber()
  sphere!: number;

  @IsNumber()
  cylinder!: number;

  @IsNumber()
  price!: number;
}

export class ReplaceCellsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceCellDto)
  cells!: PriceCellDto[];
}

export class PutCellsDto extends ReplaceCellsDto {}

export class ImportWorkbookDto {
  @IsString()
  @MinLength(1)
  fileName!: string;

  @IsString()
  @MinLength(1)
  dataBase64!: string;
}

export class CreateAddOnDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsEnum(OpticalAddOnKind)
  kind?: OpticalAddOnKind;

  @IsNumber()
  price!: number;
}

export class UpdateAddOnDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(OpticalAddOnKind)
  kind?: OpticalAddOnKind;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
