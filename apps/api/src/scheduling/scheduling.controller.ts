import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { SchedulingService } from './scheduling.service';
import {
  CalendarQueryDto,
  CreateAppointmentDto,
  CreateAppointmentTypeDto,
  SetStatusDto,
  UpdateAppointmentDto,
} from './scheduling.dto';

/** Provider calendar and appointment lifecycle (check-in auto-opens an exam). */
@Controller('appointments')
export class SchedulingController {
  constructor(private readonly scheduling: SchedulingService) {}

  /** POST /api/appointments/types — define a visit type (admin only). */
  @Post('types')
  @Roles(Role.ADMIN)
  createType(@CurrentUser() user: JwtPayload, @Body() dto: CreateAppointmentTypeDto) {
    return this.scheduling.createType(user.practiceId, dto);
  }

  /** GET /api/appointments/types — active visit types for the booking form. */
  @Get('types')
  listTypes(@CurrentUser() user: JwtPayload) {
    return this.scheduling.listTypes(user.practiceId);
  }

  /** POST /api/appointments — book a visit (overlap-checked). */
  @Post()
  @Roles(Role.RECEPTIONIST, Role.TECHNICIAN, Role.DOCTOR)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAppointmentDto) {
    return this.scheduling.create(user.practiceId, dto);
  }

  /** GET /api/appointments?from=&to=&providerId=&status= — calendar range query. */
  @Get()
  calendar(@CurrentUser() user: JwtPayload, @Query() query: CalendarQueryDto) {
    return this.scheduling.calendar(
      user.practiceId,
      query.from,
      query.to,
      query.providerId,
      query.status,
    );
  }

  /** PATCH /api/appointments/:id — reschedule time/provider/type. */
  @Patch(':id')
  @Roles(Role.RECEPTIONIST, Role.TECHNICIAN, Role.DOCTOR)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.scheduling.update(user.practiceId, id, dto);
  }

  /** PATCH /api/appointments/:id/status — lifecycle transitions (check-in opens the encounter). */
  @Patch(':id/status')
  @Roles(Role.RECEPTIONIST, Role.TECHNICIAN, Role.DOCTOR)
  setStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.scheduling.setStatus(user.practiceId, id, dto);
  }
}
