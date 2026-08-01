import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { AppointmentStatus } from '@prisma/client';

export class CreateAppointmentTypeDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(5)
  durationMin!: number;

  @IsOptional()
  @IsString()
  color?: string;
}

export class CreateAppointmentDto {
  @IsUUID()
  patientId!: string;

  @IsUUID()
  providerId!: string;

  @IsUUID()
  typeId!: string;

  @IsDateString()
  startsAt!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsUUID()
  typeId?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SetStatusDto {
  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;

  @IsOptional()
  @IsString()
  cancelReason?: string;
}
