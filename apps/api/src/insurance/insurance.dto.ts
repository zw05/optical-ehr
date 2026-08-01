import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { SubscriberRelation, VerificationStatus } from '@prisma/client';

export class CreateInsuranceDto {
  @IsUUID()
  patientId!: string;

  @IsString()
  payerName!: string;

  @IsOptional()
  @IsString()
  planName?: string;

  @IsString()
  memberId!: string;

  @IsOptional()
  @IsString()
  groupNumber?: string;

  @IsOptional()
  @IsString()
  subscriberName?: string;

  @IsOptional()
  @IsEnum(SubscriberRelation)
  relation?: SubscriberRelation;

  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @IsOptional()
  @IsBoolean()
  isVision?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  priority?: number;

  @IsOptional()
  @IsString()
  cardFrontDocId?: string;

  @IsOptional()
  @IsString()
  cardBackDocId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateInsuranceDto extends CreateInsuranceDto {
  @IsOptional()
  @IsUUID()
  declare patientId: string;

  @IsOptional()
  @IsString()
  declare payerName: string;

  @IsOptional()
  @IsString()
  declare memberId: string;
}

export class SetVerificationDto {
  @IsEnum(VerificationStatus)
  status!: VerificationStatus;
}
