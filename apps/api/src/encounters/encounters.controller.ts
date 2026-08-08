import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { EncountersService } from './encounters.service';
import {
  AddAddendumDto,
  CreateEncounterDto,
  ListEncountersDto,
  UpdateEncounterDto,
  VoidEncounterDto,
} from './encounters.dto';

/**
 * Exam endpoints. All clinical detail is restricted to technicians and
 * doctors — front desk and opticians never see encounter content.
 *
 * Note: static routes (`GET /`, `GET patient/:id`) must be declared before
 * parameterized `GET :id` so Nest does not treat "patient" as an id.
 */
@Controller('encounters')
export class EncountersController {
  constructor(private readonly encounters: EncountersService) {}

  /** POST /api/encounters — open an exam for a patient. */
  @Post()
  @Roles(Role.TECHNICIAN, Role.DOCTOR)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateEncounterDto) {
    return this.encounters.create(user.practiceId, dto);
  }

  /** GET /api/encounters — practice-wide exams dashboard (filtered list + tab counts). */
  @Get()
  @Roles(Role.TECHNICIAN, Role.DOCTOR)
  list(@CurrentUser() user: JwtPayload, @Query() dto: ListEncountersDto) {
    return this.encounters.list(user.practiceId, dto);
  }

  /** GET /api/encounters/patient/:patientId — exam history for the chart. */
  @Get('patient/:patientId')
  @Roles(Role.TECHNICIAN, Role.DOCTOR)
  listForPatient(@CurrentUser() user: JwtPayload, @Param('patientId') patientId: string) {
    return this.encounters.listForPatient(user.practiceId, patientId);
  }

  /** GET /api/encounters/:id — full exam for the documentation screen. */
  @Get(':id')
  @Roles(Role.TECHNICIAN, Role.DOCTOR)
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.encounters.findOne(user.practiceId, id);
  }

  /** PATCH /api/encounters/:id — save draft exam data (blocked once signed). */
  @Patch(':id')
  @Roles(Role.TECHNICIAN, Role.DOCTOR)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateEncounterDto) {
    return this.encounters.update(user.practiceId, id, dto);
  }

  /** POST /api/encounters/:id/sign — doctor sign-off; freezes the record. */
  @Post(':id/sign')
  @Roles(Role.DOCTOR)
  sign(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.encounters.sign(user.practiceId, id, user);
  }

  /** POST /api/encounters/:id/void — retract a draft exam opened in error. */
  @Post(':id/void')
  @Roles(Role.DOCTOR)
  voidEncounter(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: VoidEncounterDto,
  ) {
    return this.encounters.voidEncounter(user.practiceId, id, user, dto);
  }

  /** POST /api/encounters/:id/addenda — append a correction to a signed exam. */
  @Post(':id/addenda')
  @Roles(Role.DOCTOR)
  addAddendum(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AddAddendumDto) {
    return this.encounters.addAddendum(user.practiceId, id, user, dto);
  }
}
