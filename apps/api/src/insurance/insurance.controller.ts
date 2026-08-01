import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { InsuranceService } from './insurance.service';
import { CreateInsuranceDto, SetVerificationDto, UpdateInsuranceDto } from './insurance.dto';

/** Insurance policy records (no claims submission in v1). */
@Controller('insurance')
export class InsuranceController {
  constructor(private readonly insurance: InsuranceService) {}

  /** POST /api/insurance — add a policy to a patient. */
  @Post()
  @Roles(Role.RECEPTIONIST, Role.OPTICIAN, Role.DOCTOR)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateInsuranceDto) {
    return this.insurance.create(user.practiceId, dto);
  }

  /** GET /api/insurance/patient/:patientId — list a patient's policies. */
  @Get('patient/:patientId')
  listForPatient(@CurrentUser() user: JwtPayload, @Param('patientId') patientId: string) {
    return this.insurance.listForPatient(user.practiceId, patientId);
  }

  /** PATCH /api/insurance/:id — edit policy details. */
  @Patch(':id')
  @Roles(Role.RECEPTIONIST, Role.OPTICIAN, Role.DOCTOR)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateInsuranceDto) {
    return this.insurance.update(user.practiceId, id, dto);
  }

  /** PATCH /api/insurance/:id/verification — record a manual verification result. */
  @Patch(':id/verification')
  @Roles(Role.RECEPTIONIST, Role.OPTICIAN)
  setVerification(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetVerificationDto,
  ) {
    return this.insurance.setVerification(user.practiceId, id, dto.status);
  }
}
