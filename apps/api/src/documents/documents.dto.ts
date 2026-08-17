import { Type } from 'class-transformer';
import {
  IsBase64,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DocumentKind, DocumentReviewStatus } from '@prisma/client';

/**
 * One eye's worth of values transcribed off an imported document. Every field
 * is optional because the shape depends on the document: an outside spectacle
 * Rx carries sphere/cylinder/axis/add, a keratometry printout carries k1/k2.
 */
export class ExtractedEyeDto {
  @IsOptional()
  @IsNumber()
  @Min(-30)
  @Max(30)
  sphere?: number;

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

  // Range spans both recording conventions: ~6-9 mm and ~30-60 D.
  // Which one applies is carried by `kUnit` on the parent.
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(70)
  k1?: number;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(70)
  k2?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  kAxis?: number;
}

/** Structured values read off an imported document (see Document.extractedData). */
export class ExtractedDataDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ExtractedEyeDto)
  od?: ExtractedEyeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExtractedEyeDto)
  os?: ExtractedEyeDto;

  /** Unit the k1/k2 values are recorded in. Defaults to diopters. */
  @IsOptional()
  @IsIn(['D', 'mm'])
  kUnit?: 'D' | 'mm';

  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(85)
  pd?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** Fields describing what an uploaded file is; shared by upload and update. */
class DocumentMetadataDto {
  @IsOptional()
  @IsEnum(DocumentKind)
  kind?: DocumentKind;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalProvider?: string;

  /** Date printed on the document itself, not the upload date. */
  @IsOptional()
  @IsDateString()
  documentDate?: string;

  /** Validated against ExtractedDataDto in the service. */
  @IsOptional()
  @IsObject()
  extractedData?: Record<string, unknown>;
}

export class UploadDocumentDto extends DocumentMetadataDto {
  @IsUUID()
  patientId!: string;

  /** When present, the new document is linked to this encounter on upload. */
  @IsOptional()
  @IsUUID()
  encounterId?: string;

  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(150)
  contentType!: string;

  @IsBase64()
  dataBase64!: string;
}

/** Metadata-only edit; the stored bytes are never replaced in place. */
export class UpdateDocumentDto extends DocumentMetadataDto {}

/** Query filter for the chart-level document list. */
export class ListDocumentsDto {
  @IsOptional()
  @IsEnum(DocumentKind)
  kind?: DocumentKind;
}

export class LinkDocumentDto {
  @IsUUID()
  encounterId!: string;
}

/**
 * Clinical attestation that the extracted values match the source image.
 * PENDING_REVIEW is the upload default and is not settable here.
 */
export class ReviewDocumentDto {
  @IsIn([DocumentReviewStatus.REVIEWED, DocumentReviewStatus.REJECTED])
  status!: typeof DocumentReviewStatus.REVIEWED | typeof DocumentReviewStatus.REJECTED;
}
