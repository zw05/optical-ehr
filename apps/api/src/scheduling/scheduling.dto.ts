import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
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

  /** Required for timed bookings; ignored when walkIn is true. */
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  /** Walk-in / unscheduled: creates WAITING status and skips overlap check. */
  @IsOptional()
  @IsBoolean()
  walkIn?: boolean;

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

/** Query params for GET /appointments — calendar range with optional filters. */
export class CalendarQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsUUID()
  providerId?: string;

  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;
}
