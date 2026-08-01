import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, PrescriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto, RemakeOrderDto, SetOrderStatusDto, UpdateOrderDto } from './orders.dto';

/** Allowed forward transitions for order fulfillment. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: [OrderStatus.ORDERED, OrderStatus.CANCELLED],
  ORDERED: [OrderStatus.AT_LAB, OrderStatus.RECEIVED, OrderStatus.CANCELLED],
  AT_LAB: [OrderStatus.RECEIVED, OrderStatus.CANCELLED],
  RECEIVED: [OrderStatus.VERIFIED, OrderStatus.REMAKE],
  VERIFIED: [OrderStatus.DISPENSED, OrderStatus.REMAKE],
  DISPENSED: [OrderStatus.REMAKE],
  REMAKE: [],
  CANCELLED: [],
};

/**
 * Spectacle and contact-lens order fulfillment. Every status change is
 * recorded as an OrderStatusEvent, giving each order a full timeline.
 */
@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Opens a DRAFT order against a prescription. The Rx must belong to the
   * same patient, be FINALIZED, and be unexpired. Balance due is computed as
   * price minus deposit when pricing is provided.
   */
  async create(practiceId: string, actorId: string, dto: CreateOrderDto) {
    const rx = await this.prisma.prescription.findFirst({
      where: { id: dto.prescriptionId, practiceId, patientId: dto.patientId },
    });
    if (!rx) throw new NotFoundException('Prescription not found for this patient');
    if (rx.status !== PrescriptionStatus.FINALIZED) {
      throw new BadRequestException('Orders require a finalized prescription');
    }
    if (rx.expiresAt && rx.expiresAt < new Date()) {
      throw new BadRequestException('Prescription is expired');
    }

    const balanceDue =
      dto.priceTotal !== undefined ? dto.priceTotal - (dto.deposit ?? 0) : undefined;

    const order = await this.prisma.opticalOrder.create({
      data: {
        practiceId,
        patientId: dto.patientId,
        prescriptionId: dto.prescriptionId,
        kind: dto.kind,
        details: dto.details as object,
        labName: dto.labName,
        priceTotal: dto.priceTotal,
        deposit: dto.deposit,
        balanceDue,
        statusEvents: { create: { status: OrderStatus.DRAFT, actorId } },
      },
      include: { statusEvents: true },
    });
    return order;
  }

  /** Order work queue, optionally filtered by status and/or patient. */
  list(practiceId: string, status?: OrderStatus, patientId?: string) {
    return this.prisma.opticalOrder.findMany({
      where: {
        practiceId,
        ...(status ? { status } : {}),
        ...(patientId ? { patientId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        patient: { select: { id: true, mrn: true, firstName: true, lastName: true, phone: true } },
        prescription: { select: { type: true, version: true, expiresAt: true } },
      },
    });
  }

  /** One order with its Rx, status timeline, and remake links. */
  async findOne(practiceId: string, id: string) {
    const order = await this.prisma.opticalOrder.findFirst({
      where: { id, practiceId },
      include: {
        patient: { select: { id: true, mrn: true, firstName: true, lastName: true, phone: true } },
        prescription: true,
        statusEvents: { orderBy: { createdAt: 'asc' } },
        remakeOf: { select: { id: true, status: true } },
        remadeBy: { select: { id: true, status: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /**
   * Edits order details (frame/lens specs, lab, pricing, warranty notes) and
   * recomputes the balance. Dispensed and cancelled orders are closed to edits.
   */
  async update(practiceId: string, id: string, dto: UpdateOrderDto) {
    const order = await this.getOwned(practiceId, id);
    if (order.status === OrderStatus.DISPENSED || order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException('Dispensed or cancelled orders cannot be edited');
    }
    const priceTotal = dto.priceTotal ?? order.priceTotal?.toNumber();
    const deposit = dto.deposit ?? order.deposit?.toNumber();
    return this.prisma.opticalOrder.update({
      where: { id },
      data: {
        ...(dto.details ? { details: dto.details as object } : {}),
        labName: dto.labName ?? order.labName,
        labReference: dto.labReference ?? order.labReference,
        warrantyNotes: dto.warrantyNotes ?? order.warrantyNotes,
        priceTotal,
        deposit,
        balanceDue: priceTotal !== undefined ? priceTotal - (deposit ?? 0) : order.balanceDue,
      },
    });
  }

  /**
   * Advances an order through fulfillment. The TRANSITIONS table rejects
   * illegal jumps (e.g. DRAFT straight to DISPENSED). Milestone timestamps
   * (orderedAt/receivedAt/dispensedAt) are stamped and a timeline event is
   * appended with the actor and optional note.
   */
  async setStatus(practiceId: string, id: string, actorId: string, dto: SetOrderStatusDto) {
    const order = await this.getOwned(practiceId, id);
    const allowed = TRANSITIONS[order.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(`Cannot move order from ${order.status} to ${dto.status}`);
    }

    const timestamps: Record<string, Date> = {};
    if (dto.status === OrderStatus.ORDERED) timestamps.orderedAt = new Date();
    if (dto.status === OrderStatus.RECEIVED) timestamps.receivedAt = new Date();
    if (dto.status === OrderStatus.DISPENSED) timestamps.dispensedAt = new Date();

    return this.prisma.opticalOrder.update({
      where: { id },
      data: {
        status: dto.status,
        ...timestamps,
        statusEvents: { create: { status: dto.status, note: dto.note, actorId } },
      },
      include: { statusEvents: { orderBy: { createdAt: 'asc' } } },
    });
  }

  /**
   * Handles defective or wrong jobs: marks the original REMAKE (with the
   * reason on its timeline) and opens a linked replacement order carrying the
   * same Rx and pricing, in one transaction. Only received, verified, or
   * dispensed orders can be remade. Returns the replacement.
   */
  async remake(practiceId: string, id: string, actorId: string, dto: RemakeOrderDto) {
    const order = await this.getOwned(practiceId, id);
    const remakeable: OrderStatus[] = [OrderStatus.RECEIVED, OrderStatus.VERIFIED, OrderStatus.DISPENSED];
    if (!remakeable.includes(order.status)) {
      throw new BadRequestException('Only received, verified, or dispensed orders can be remade');
    }
    const [, replacement] = await this.prisma.$transaction([
      this.prisma.opticalOrder.update({
        where: { id },
        data: {
          status: OrderStatus.REMAKE,
          statusEvents: { create: { status: OrderStatus.REMAKE, note: dto.reason, actorId } },
        },
      }),
      this.prisma.opticalOrder.create({
        data: {
          practiceId,
          patientId: order.patientId,
          prescriptionId: order.prescriptionId,
          kind: order.kind,
          details: (dto.details ?? order.details) as object,
          labName: order.labName,
          priceTotal: order.priceTotal,
          deposit: order.deposit,
          balanceDue: order.balanceDue,
          remakeOfId: order.id,
          statusEvents: { create: { status: OrderStatus.DRAFT, note: `Remake: ${dto.reason}`, actorId } },
        },
      }),
    ]);
    return replacement;
  }

  /** Loads an order or throws 404 outside the caller's practice. */
  private async getOwned(practiceId: string, id: string) {
    const order = await this.prisma.opticalOrder.findFirst({ where: { id, practiceId } });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
}
