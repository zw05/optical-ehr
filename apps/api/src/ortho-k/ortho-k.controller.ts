import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { OrthoKStatus, Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { OrthoKService } from './ortho-k.service';
import { EnrollOrthoKDto, LogOrthoKVisitDto, UpdateOrthoKDto } from './ortho-k.dto';

const BOARD_STATES = ['OVERDUE', 'DUE', 'UPCOMING'] as const;
type BoardState = (typeof BOARD_STATES)[number];

/** The Ortho-K program board: enrollments, follow-up logging, and due-check notifications. */
@Controller('ortho-k')
export class OrthoKController {
  constructor(private readonly orthoK: OrthoKService) {}

  /** GET /api/ortho-k?status=&state=&q= — the program board. */
  @Get()
  board(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('state') state?: string,
    @Query('q') q?: string,
  ) {
    return this.orthoK.board(user.practiceId, {
      status: isStatus(status) ? status : undefined,
      state: isState(state) ? state : undefined,
      q,
    });
  }

  /** GET /api/ortho-k/notifications — overdue and due follow-up counts for the nav badge and dashboard. */
  @Get('notifications')
  notifications(@CurrentUser() user: JwtPayload) {
    return this.orthoK.notifications(user.practiceId);
  }

  /** GET /api/ortho-k/:id — one enrollment with its visit history. */
  @Get(':id')
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.orthoK.get(user.practiceId, id);
  }

  /** POST /api/ortho-k — enroll a patient in the program. */
  @Post()
  @Roles(Role.RECEPTIONIST, Role.TECHNICIAN, Role.DOCTOR, Role.OPTICIAN)
  enroll(@CurrentUser() user: JwtPayload, @Body() dto: EnrollOrthoKDto) {
    return this.orthoK.enroll(user.practiceId, user.sub, dto);
  }

  /** PATCH /api/ortho-k/:id — edit the number, notes, status, or start date. */
  @Patch(':id')
  @Roles(Role.TECHNICIAN, Role.DOCTOR, Role.OPTICIAN)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateOrthoKDto,
  ) {
    return this.orthoK.update(user.practiceId, id, dto);
  }

  /** POST /api/ortho-k/:id/visits — record a follow-up that happened. */
  @Post(':id/visits')
  @Roles(Role.RECEPTIONIST, Role.TECHNICIAN, Role.DOCTOR, Role.OPTICIAN)
  logVisit(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: LogOrthoKVisitDto,
  ) {
    return this.orthoK.logVisit(user.practiceId, id, user.sub, dto);
  }

  /** DELETE /api/ortho-k/:id/visits/:visitId — remove a mis-entered visit. */
  @Delete(':id/visits/:visitId')
  @Roles(Role.TECHNICIAN, Role.DOCTOR)
  deleteVisit(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('visitId') visitId: string,
  ) {
    return this.orthoK.deleteVisit(user.practiceId, id, visitId);
  }
}

function isStatus(value?: string): value is OrthoKStatus {
  return !!value && Object.values(OrthoKStatus).includes(value as OrthoKStatus);
}

function isState(value?: string): value is BoardState {
  return !!value && (BOARD_STATES as readonly string[]).includes(value);
}
