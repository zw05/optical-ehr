import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { PrescriptionsService } from './prescriptions.service';
import { CreatePrescriptionDto, UpdateDraftDto } from './prescriptions.dto';

class FinalizeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  validMonths?: number;
}

class SupersedeDto {
  @IsObject()
  values!: Record<string, unknown>;
}

/** Spectacle and contact-lens prescriptions (doctor-only writes). */
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  /** POST /api/prescriptions — create a DRAFT Rx (doctor only). */
  @Post()
  @Roles(Role.DOCTOR)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePrescriptionDto) {
    return this.prescriptions.create(user.practiceId, user, dto);
  }

  /** PATCH /api/prescriptions/:id — edit a draft's values. */
  @Patch(':id')
  @Roles(Role.DOCTOR)
  updateDraft(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateDraftDto) {
    return this.prescriptions.updateDraft(user.practiceId, id, user, dto);
  }

  /** POST /api/prescriptions/:id/finalize — lock the Rx and stamp expiration. */
  @Post(':id/finalize')
  @Roles(Role.DOCTOR)
  finalize(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: FinalizeDto) {
    return this.prescriptions.finalize(user.practiceId, id, user, dto.validMonths);
  }

  /** POST /api/prescriptions/:id/supersede — issue a corrected version n+1. */
  @Post(':id/supersede')
  @Roles(Role.DOCTOR)
  supersede(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: SupersedeDto) {
    return this.prescriptions.supersede(user.practiceId, id, user, dto.values);
  }

  /** GET /api/prescriptions/:id — one Rx with prescriber and version links. */
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.prescriptions.findOne(user.practiceId, id);
  }

  /** GET /api/prescriptions/patient/:patientId — a patient's Rx history (any role). */
  @Get('patient/:patientId')
  listForPatient(@CurrentUser() user: JwtPayload, @Param('patientId') patientId: string) {
    return this.prescriptions.listForPatient(user.practiceId, patientId);
  }
}
