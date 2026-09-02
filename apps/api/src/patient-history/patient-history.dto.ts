import { IsBoolean, IsDateString, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Answers are slugs from the question catalog, which lives with the form on the
 * web side. Every question offers the paper's `ce` ("can't elaborate"); most
 * offer `no`/`yes`, while the few the clinic records in more detail use their
 * own values (`never`/`former`/`current`). Blank means unanswered.
 */
export const INTAKE_STATUS_PATTERN = /^[a-z][a-zA-Z0-9]{0,29}$/;
export type IntakeStatus = string;

/**
 * One row of the questionnaire: the tri-state answer plus the paper form's
 * follow-up column ("how often?", "relationship to you", "how long?").
 */
export interface IntakeAnswer {
  status: IntakeStatus;
  detail?: string;
}

export class UpdateIntakeHistoryDto {
  /**
   * Map of questionKey -> answer. Question keys are data, not a fixed schema, so
   * the map is validated entry-by-entry in the service (see `sanitize`) rather
   * than by decorators — the global pipe's `forbidNonWhitelisted` would reject
   * every dynamic key. That also lets questions be added or reworded without an
   * API deploy.
   */
  @IsObject()
  answers!: Record<string, IntakeAnswer>;

  /** Set when the patient signs the form; cleared answers do not clear this. */
  @IsOptional()
  @IsDateString()
  patientSignedAt?: string;
}

export class ReviewIntakeHistoryDto {
  /** The paper form's re-review line: reviewed as-is, or reviewed with changes. */
  @IsOptional()
  @IsBoolean()
  changesNoted?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Visit this review was performed at, so the exam can show its own attestation. */
  @IsOptional()
  @IsString()
  encounterId?: string;
}
