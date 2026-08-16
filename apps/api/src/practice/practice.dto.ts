import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePracticeDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  fax?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  npi?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string | null;

  @IsOptional()
  @IsObject()
  hours?: Record<string, { open?: string; close?: string; closed?: boolean }>;
}

export class UploadPracticeLogoDto {
  @IsString()
  fileName!: string;

  @IsString()
  contentType!: string;

  @IsString()
  dataBase64!: string;
}
