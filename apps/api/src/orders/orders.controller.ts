import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { OrdersService } from './orders.service';
import { CreateOrderDto, RemakeOrderDto, SetOrderStatusDto, UpdateOrderDto } from './orders.dto';

/** Spectacle and contact-lens order fulfillment API. */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** POST /api/orders — open a draft order against a finalized prescription. */
  @Post()
  @Roles(Role.OPTICIAN, Role.DOCTOR, Role.RECEPTIONIST)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.practiceId, user.sub, dto);
  }

  /** GET /api/orders?status=&patientId= — order work queue. */
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: OrderStatus,
    @Query('patientId') patientId?: string,
  ) {
    return this.orders.list(user.practiceId, status, patientId);
  }

  /** GET /api/orders/:id — order detail with status timeline. */
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.orders.findOne(user.practiceId, id);
  }

  /** PATCH /api/orders/:id — edit frame/lens details, lab, pricing. */
  @Patch(':id')
  @Roles(Role.OPTICIAN, Role.DOCTOR)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.orders.update(user.practiceId, id, dto);
  }

  /** PATCH /api/orders/:id/status — advance fulfillment (ordered → at lab → … → dispensed). */
  @Patch(':id/status')
  @Roles(Role.OPTICIAN, Role.DOCTOR)
  setStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: SetOrderStatusDto) {
    return this.orders.setStatus(user.practiceId, id, user.sub, dto);
  }

  /** POST /api/orders/:id/remake — close defective job and open a linked replacement. */
  @Post(':id/remake')
  @Roles(Role.OPTICIAN, Role.DOCTOR)
  remake(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: RemakeOrderDto) {
    return this.orders.remake(user.practiceId, id, user.sub, dto);
  }
}
