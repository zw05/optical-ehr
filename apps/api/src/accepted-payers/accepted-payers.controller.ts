import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { AcceptedPayersService } from './accepted-payers.service';
import { CreateAcceptedPayerDto, UpdateAcceptedPayerDto } from './accepted-payers.dto';

/** Practice-level accepted insurance payer catalog (not patient policies). */
@Controller('accepted-payers')
export class AcceptedPayersController {
  constructor(private readonly payers: AcceptedPayersService) {}

  /** GET /api/accepted-payers?all=1 — list payers (active only unless all=1). */
  @Get()
  list(@CurrentUser() user: JwtPayload, @Query('all') all?: string) {
    return this.payers.list(user.practiceId, all === '1' || all === 'true');
  }

  /** POST /api/accepted-payers — add a payer to the catalog. */
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAcceptedPayerDto) {
    return this.payers.create(user.practiceId, dto);
  }

  /** PATCH /api/accepted-payers/:id — update or soft-deactivate a payer. */
  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAcceptedPayerDto,
  ) {
    return this.payers.update(user.practiceId, id, dto);
  }
}
