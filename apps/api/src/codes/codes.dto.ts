import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CodeSystem } from '@prisma/client';

export class CreateCodeDto {
  @IsEnum(CodeSystem)
  system!: CodeSystem;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string | null;

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;
}

export class UpdateCodeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string | null;

  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ImportCodesDto {
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
