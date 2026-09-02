import { IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateAcceptedPayerDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  eligibilityNotes?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  fax?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  payerId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  frameAllowance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lensAllowance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  examCopay?: number;

  @IsOptional()
  @IsBoolean()
  requiresAuth?: boolean;

  @IsOptional()
  @IsBoolean()
  isVision?: boolean;
}

export class UpdateAcceptedPayerDto extends CreateAcceptedPayerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  declare name: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
