import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAcceptedPayerDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isVision?: boolean;
}

export class UpdateAcceptedPayerDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isVision?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
