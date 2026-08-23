import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { OrthoKMilestone, OrthoKStatus } from '@prisma/client';

export class EnrollOrthoKDto {
  @IsUUID()
  patientId!: string;

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

  /** Drawer, section, or folder number of the paper chart. */
  @IsOptional()
  @IsString()
  folderRef?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOrthoKDto {
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
  folderRef?: string;

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
