import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PatientTag, Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { PatientsService, type PatientSearchFilters } from './patients.service';
import { CreatePatientDto, UpdatePatientDto, AddHistoryDto } from './dto/patient.dto';

/** REST surface for patient charts; every route is scoped to the caller's practice. */
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  /** POST /api/patients — register a chart (front desk, tech, or doctor). */
  @Post()
  @Roles(Role.RECEPTIONIST, Role.TECHNICIAN, Role.DOCTOR)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePatientDto) {
    return this.patients.create(user.practiceId, dto);
  }

  /**
   * GET /api/patients?q=...&take=...&category=...&tag=...&payer=...&insurance=...
   * &recall=...&lastSeen=...&ageGroup=...&hasAlerts=1 — search + filters (any role).
   */
  @Get()
  search(
    @CurrentUser() user: JwtPayload,
    @Query('q') q = '',
    @Query('take') take?: string,
    @Query('category') category?: string,
    @Query('tag') tag?: string,
    @Query('payer') payer?: string,
    @Query('insurance') insurance?: string,
    @Query('recall') recall?: string,
    @Query('lastSeen') lastSeen?: string,
    @Query('ageGroup') ageGroup?: string,
    @Query('hasAlerts') hasAlerts?: string,
  ) {
    const filters: PatientSearchFilters = {
      category: category === 'GLASSES' || category === 'CONTACT_LENS' ? category : undefined,
      tag: isPatientTag(tag) ? tag : undefined,
      payer: payer || undefined,
      insurance:
        insurance === 'VERIFIED' || insurance === 'UNVERIFIED' || insurance === 'NONE'
          ? insurance
          : undefined,
      recall: recall === 'DUE' ? 'DUE' : undefined,
      lastSeen: lastSeen === 'LAPSED_12M' || lastSeen === 'NEVER' ? lastSeen : undefined,
      ageGroup:
        ageGroup === 'PEDIATRIC' || ageGroup === 'ADULT' || ageGroup === 'SENIOR'
          ? ageGroup
          : undefined,
      hasAlerts: hasAlerts === '1' || hasAlerts === 'true' ? true : undefined,
    };
    return this.patients.search(user.practiceId, q, take ? Number(take) : undefined, filters);
  }

  /** GET /api/patients/filter-options — payer names for filter dropdowns. Must be above :id. */
  @Get('filter-options')
  filterOptions(@CurrentUser() user: JwtPayload) {
    return this.patients.filterOptions(user.practiceId);
  }

  /** GET /api/patients/directory?take= — all active charts, most recent visit first. Must be above :id. */
  @Get('directory')
  directory(@CurrentUser() user: JwtPayload, @Query('take') take?: string) {
    return this.patients.directory(user.practiceId, take ? Number(take) : undefined);
  }

  /** GET /api/patients/:id — full chart header with histories, insurance, recalls. */
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.patients.findOne(user.practiceId, id);
  }

  /** PATCH /api/patients/:id — update demographics/contact details. */
  @Patch(':id')
  @Roles(Role.RECEPTIONIST, Role.TECHNICIAN, Role.DOCTOR)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdatePatientDto) {
    return this.patients.update(user.practiceId, id, dto);
  }

  /** POST /api/patients/:id/history — append a medical/ocular/allergy history entry. */
  @Post(':id/history')
  @Roles(Role.TECHNICIAN, Role.DOCTOR)
  addHistory(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AddHistoryDto) {
    return this.patients.addHistory(user.practiceId, id, dto);
  }

  /** PATCH /api/patients/:id/history/:historyId/resolve — mark an entry resolved. */
  @Patch(':id/history/:historyId/resolve')
  @Roles(Role.TECHNICIAN, Role.DOCTOR)
  resolveHistory(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('historyId') historyId: string,
  ) {
    return this.patients.resolveHistory(user.practiceId, id, historyId);
  }

  /** POST /api/patients/:id/merge/:targetId — merge duplicate charts (admin only). */
  @Post(':id/merge/:targetId')
  @Roles(Role.ADMIN)
  merge(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Param('targetId') targetId: string) {
    return this.patients.merge(user.practiceId, id, targetId);
  }

  /** GET /api/patients/:id/export — full JSON chart export (HIPAA right of access). */
  @Get(':id/export')
  @Roles(Role.DOCTOR, Role.ADMIN)
  exportChart(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.patients.exportChart(user.practiceId, id);
  }
}

const PATIENT_TAGS = new Set<string>(Object.values(PatientTag));

function isPatientTag(value?: string): value is PatientTag {
  return Boolean(value && PATIENT_TAGS.has(value));
}
