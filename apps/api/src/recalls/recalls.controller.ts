import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RecallStatus, Role } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { RecallsService } from './recalls.service';

class CreateRecallDto {
  @IsUUID()
  patientId!: string;

  @IsString()
  reason!: string;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class SetRecallStatusDto {
  @IsEnum(RecallStatus)
  status!: RecallStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Patient recall outreach work queue (annual exams, CL follow-ups, …). */
@Controller('recalls')
export class RecallsController {
  constructor(private readonly recalls: RecallsService) {}

  /** POST /api/recalls — schedule a recall for a patient. */
  @Post()
  @Roles(Role.RECEPTIONIST, Role.TECHNICIAN, Role.DOCTOR, Role.OPTICIAN)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRecallDto) {
    return this.recalls.create(user.practiceId, dto.patientId, dto.reason, new Date(dto.dueDate), dto.notes);
  }

  /** GET /api/recalls/due?horizon= — recalls due before the horizon (default +30 days). */
  @Get('due')
  due(@CurrentUser() user: JwtPayload, @Query('horizon') horizon?: string) {
    const horizonDate = horizon ? new Date(horizon) : addDays(new Date(), 30);
    return this.recalls.due(user.practiceId, horizonDate);
  }

  /** PATCH /api/recalls/:id/status — mark contacted, scheduled, or dismissed. */
  @Patch(':id/status')
  @Roles(Role.RECEPTIONIST, Role.TECHNICIAN, Role.DOCTOR, Role.OPTICIAN)
  setStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: SetRecallStatusDto) {
    return this.recalls.setStatus(user.practiceId, id, dto.status, dto.notes);
  }
}

/** Adds calendar days to a date (used for default recall horizon). */
function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
