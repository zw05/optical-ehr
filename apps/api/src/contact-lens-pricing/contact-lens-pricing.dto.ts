import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { ContactLensFeeKind, ContactLensModality, ContactLensType } from '@prisma/client';

export class CreateContactLensProductDto {
  @IsString()
  @MinLength(1)
  brand!: string;

  @IsString()
  @MinLength(1)
  productName!: string;

  @IsOptional()
  @IsEnum(ContactLensModality)
  modality?: ContactLensModality;

  @IsOptional()
  @IsEnum(ContactLensType)
  lensType?: ContactLensType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  lensesPerBox?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  boxesPerYearPerEye?: number;

  @IsNumber()
  @Min(0)
  pricePerBox!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualSupplyPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sixMonthPrice?: number | null;

  @IsOptional()
  @IsString()
  rebateNote?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateContactLensProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  brand?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  productName?: string;

  @IsOptional()
  @IsEnum(ContactLensModality)
  modality?: ContactLensModality;

  @IsOptional()
  @IsEnum(ContactLensType)
  lensType?: ContactLensType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  lensesPerBox?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  boxesPerYearPerEye?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerBox?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualSupplyPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sixMonthPrice?: number | null;

  @IsOptional()
  @IsString()
  rebateNote?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateContactLensFeeDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsEnum(ContactLensFeeKind)
  kind?: ContactLensFeeKind;

  @IsNumber()
  @Min(0)
  price!: number;
}

export class UpdateContactLensFeeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(ContactLensFeeKind)
  kind?: ContactLensFeeKind;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ImportContactLensDto {
  @IsOptional()
  @IsString()
  fileName?: string;

  @IsString()
  @MinLength(1)
  dataBase64!: string;

  /** Parse and diff without writing, so the change can be reviewed first. */
  @IsOptional()
  @IsBoolean()
  preview?: boolean;
}
