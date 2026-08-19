import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { Roles } from '../auth/roles.decorator';
import { PatientHistoryService } from './patient-history.service';
import { ReviewIntakeHistoryDto, UpdateIntakeHistoryDto } from './patient-history.dto';

/**
 * The intake questionnaire lives on the chart, not the visit, so it is reached
 * through the patient. Front desk and techs capture it; only a doctor signs the
 * re-review line.
 */
@Controller('patients/:id/intake-history')
export class PatientHistoryController {
  constructor(private readonly history: PatientHistoryService) {}

  /** GET /api/patients/:id/intake-history — answers plus the re-review trail. */
  @Get()
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.history.get(user.practiceId, id);
  }

  /** PUT /api/patients/:id/intake-history — replace the answer set. */
  @Put()
  @Roles(Role.RECEPTIONIST, Role.TECHNICIAN, Role.DOCTOR)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateIntakeHistoryDto,
  ) {
    return this.history.update(user.practiceId, id, dto);
  }

  /** POST /api/patients/:id/intake-history/review — the doctor's re-review line. */
  @Post('review')
  @Roles(Role.DOCTOR)
  review(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReviewIntakeHistoryDto,
  ) {
    return this.history.addReview(user.practiceId, id, user.sub, dto);
  }
}
