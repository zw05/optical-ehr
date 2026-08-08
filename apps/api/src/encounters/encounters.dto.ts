import {
  IsArray,
  IsDateString,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** Query params for GET /encounters — the exams dashboard list. */
export class ListEncountersDto {
  @IsOptional()
  @IsIn(['recent', 'unfinished', 'finalized', 'voided'])
  tab?: 'recent' | 'unfinished' | 'finalized' | 'voided';

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsOptional()
  @IsString()
  insurance?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  impression?: string;

  @IsOptional()
  @IsIn(['createdAt', 'patient', 'status'])
  sortBy?: 'createdAt' | 'patient' | 'status';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class CreateEncounterDto {
  @IsUUID()
  patientId!: string;

  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @IsOptional()
  @IsUUID()
  templateId?: string;
}

export class UpdateEncounterDto {
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  /**
   * Structured clinical sections keyed by template section key, e.g.
   * { visualAcuity: {...}, refraction: { od: {sphere: -1.25, ...}, os: {...} }, iop: {...} }
   * Validated against the encounter's template in the service layer.
   */
  @IsOptional()
  @IsObject()
  clinicalData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  assessment?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  diagnosisCodes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  procedureCodes?: string[];
}

export class AddAddendumDto {
  @IsString()
  text!: string;
}

export class VoidEncounterDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}
