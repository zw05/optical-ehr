import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { HistoryKind, PatientTag, Sex } from '@prisma/client';

export class CreatePatientDto {
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsEnum(Sex)
  sex?: Sex;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zip?: string;

  @IsOptional()
  @IsString()
  preferredContact?: string;

  @IsOptional()
  @IsString()
  alerts?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(PatientTag, { each: true })
  tags?: PatientTag[];
}

export class UpdatePatientDto extends CreatePatientDto {
  @IsOptional()
  @IsString()
  declare firstName: string;

  @IsOptional()
  @IsString()
  declare lastName: string;

  @IsOptional()
  @IsDateString()
  declare dateOfBirth: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AddHistoryDto {
  @IsEnum(HistoryKind)
  kind!: HistoryKind;

  @IsString()
  label!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  detail?: string;

  @IsOptional()
  @IsDateString()
  onsetDate?: string;
}
