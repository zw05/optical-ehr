import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LensDesign, OpticalAddOnKind } from '@prisma/client';

/** Widest powers the practice can price; keeps a fat-fingered band in bounds. */
const POWER_LIMIT = 40;
const MAX_BANDS_PER_LIST = 2000;

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
  @Min(1)
  @Max(2)
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
  @MinLength(1)
  material?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(2)
  index?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class PriceRangeDto {
  @IsOptional()
  @IsString()
  label?: string | null;

  @IsNumber()
  @Min(-POWER_LIMIT)
  @Max(POWER_LIMIT)
  sphMin!: number;

  @IsNumber()
  @Min(-POWER_LIMIT)
  @Max(POWER_LIMIT)
  sphMax!: number;

  @IsNumber()
  @Min(-POWER_LIMIT)
  @Max(0)
  cylMin!: number;

  @IsNumber()
  @Min(-POWER_LIMIT)
  @Max(0)
  cylMax!: number;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

/** Replaces every band on a list in one save, mirroring how the editor works. */
export class PutRangesDto {
  @IsArray()
  @ArrayMaxSize(MAX_BANDS_PER_LIST)
  @ValidateNested({ each: true })
  @Type(() => PriceRangeDto)
  ranges!: PriceRangeDto[];
}

export class ImportWorkbookDto {
  @IsOptional()
  @IsString()
  fileName?: string;

  @IsString()
  @MinLength(1)
  dataBase64!: string;

  /**
   * When true the workbook is parsed and diffed but nothing is written, so the
   * user can see what an import would change before committing to it.
   */
  @IsOptional()
  @IsBoolean()
  preview?: boolean;
}

export class CreateAddOnDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsEnum(OpticalAddOnKind)
  kind?: OpticalAddOnKind;

  @IsNumber()
  @Min(0)
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
  @Min(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
