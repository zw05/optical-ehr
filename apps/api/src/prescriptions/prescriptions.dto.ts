import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PrescriptionType } from '@prisma/client';

export class SpectacleEyeDto {
  @IsNumber()
  @Min(-30)
  @Max(30)
  sphere!: number;

  @IsOptional()
  @IsNumber()
  @Min(-15)
  @Max(15)
  cylinder?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  axis?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  add?: number;

  @IsOptional()
  @IsNumber()
  prism?: number;

  @IsOptional()
  @IsString()
  base?: string; // BU | BD | BI | BO
}

export class SpectacleValuesDto {
  @ValidateNested()
  @Type(() => SpectacleEyeDto)
  od!: SpectacleEyeDto;

  @ValidateNested()
  @Type(() => SpectacleEyeDto)
  os!: SpectacleEyeDto;

  @IsOptional()
  @IsNumber()
  pd?: number;

  @IsOptional()
  @IsNumber()
  pdNear?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class ContactLensEyeDto {
  @IsString()
  brand!: string;

  @IsOptional()
  @IsString()
  material?: string;

  @IsNumber()
  baseCurve!: number;

  @IsNumber()
  diameter!: number;

  @IsNumber()
  @Min(-30)
  @Max(30)
  sphere!: number;

  @IsOptional()
  @IsNumber()
  cylinder?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  axis?: number;

  @IsOptional()
  @IsNumber()
  add?: number;
}

export class ContactLensValuesDto {
  @ValidateNested()
  @Type(() => ContactLensEyeDto)
  od!: ContactLensEyeDto;

  @ValidateNested()
  @Type(() => ContactLensEyeDto)
  os!: ContactLensEyeDto;

  @IsOptional()
  @IsString()
  wearSchedule?: string;

  @IsOptional()
  @IsString()
  replacementSchedule?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CreatePrescriptionDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsUUID()
  encounterId?: string;

  @IsEnum(PrescriptionType)
  type!: PrescriptionType;

  @IsObject()
  values!: Record<string, unknown>; // validated against type in the service

  /** Validity in months; default 24 for spectacles, 12 for contact lenses. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  validMonths?: number;
}

export class UpdateDraftDto {
  @IsObject()
  values!: Record<string, unknown>;
}
