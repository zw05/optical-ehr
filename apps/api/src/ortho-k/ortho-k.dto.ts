import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { OrthoKMilestone, OrthoKStatus } from '@prisma/client';

export class EnrollOrthoKDto {
  @IsUUID()
  patientId!: string;

  /** Ortho-K case number. Left out, the next free number for the practice is used. */
  @IsOptional()
  @IsInt()
  @Min(1)
  caseNumber?: number;

  /**
   * First night of lens wear. Optional: a patient can be enrolled while the
   * lenses are still on order, and the sequence starts when the date is set.
   */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsIn(['OD', 'OS', 'OU'])
  eyes?: string;

  @IsOptional()
  @IsString()
  lensBrand?: string;

  @IsOptional()
  @IsString()
  lensDesign?: string;

  @IsOptional()
  @IsString()
  lensParams?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOrthoKDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  caseNumber?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsEnum(OrthoKStatus)
  status?: OrthoKStatus;

  @IsOptional()
  @IsIn(['OD', 'OS', 'OU'])
  eyes?: string;

  @IsOptional()
  @IsString()
  lensBrand?: string;

  @IsOptional()
  @IsString()
  lensDesign?: string;

  @IsOptional()
  @IsString()
  lensParams?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class LogOrthoKVisitDto {
  /** Which milestone the visit satisfied; INTERIM for anything in between. */
  @IsEnum(OrthoKMilestone)
  milestone!: OrthoKMilestone;

  @IsDateString()
  visitDate!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
