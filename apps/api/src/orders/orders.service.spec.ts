import { BadRequestException } from '@nestjs/common';
import { OrderKind, OrderStatus, PrescriptionStatus } from '@prisma/client';
import { OrdersService } from './orders.service';

function makeService() {
  const prisma = {
    prescription: { findFirst: jest.fn() },
    opticalOrder: {
      create: jest.fn().mockResolvedValue({ id: 'ord-1' }),
      findFirst: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'ord-1', ...data })),
    },
    $transaction: jest.fn().mockResolvedValue([{}, { id: 'ord-2', remakeOfId: 'ord-1' }]),
  };
  const service = new OrdersService(prisma as never);
  return { service, prisma };
}

const finalizedRx = {
  id: 'rx-1',
  status: PrescriptionStatus.FINALIZED,
  expiresAt: new Date(Date.now() + 86_400_000),
};

describe('OrdersService.create', () => {
  it('requires a finalized prescription', async () => {
    const { service, prisma } = makeService();
    prisma.prescription.findFirst.mockResolvedValue({ ...finalizedRx, status: PrescriptionStatus.DRAFT });
    await expect(
      service.create('pr-1', 'user-1', {
        patientId: 'pat-1',
        prescriptionId: 'rx-1',
        kind: OrderKind.SPECTACLE,
        details: {},
      }),
    ).rejects.toThrow(/finalized/);
  });

  it('rejects expired prescriptions', async () => {
    const { service, prisma } = makeService();
    prisma.prescription.findFirst.mockResolvedValue({
      ...finalizedRx,
      expiresAt: new Date(Date.now() - 86_400_000),
    });
    await expect(
      service.create('pr-1', 'user-1', {
        patientId: 'pat-1',
        prescriptionId: 'rx-1',
        kind: OrderKind.SPECTACLE,
        details: {},
      }),
    ).rejects.toThrow(/expired/);
  });

  it('computes balance due from price and deposit', async () => {
    const { service, prisma } = makeService();
    prisma.prescription.findFirst.mockResolvedValue(finalizedRx);
    await service.create('pr-1', 'user-1', {
      patientId: 'pat-1',
      prescriptionId: 'rx-1',
      kind: OrderKind.SPECTACLE,
      details: { frame: { brand: 'Acme' } },
      priceTotal: 400,
      deposit: 100,
    });
    const createArg = prisma.opticalOrder.create.mock.calls[0][0];
    expect(createArg.data.balanceDue).toBe(300);
  });
});

describe('OrdersService.setStatus', () => {
  it('enforces the fulfillment state machine', async () => {
    const { service, prisma } = makeService();
    prisma.opticalOrder.findFirst.mockResolvedValue({ id: 'ord-1', status: OrderStatus.DRAFT });
    await expect(
      service.setStatus('pr-1', 'ord-1', 'user-1', { status: OrderStatus.DISPENSED }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows draft -> ordered and stamps orderedAt', async () => {
    const { service, prisma } = makeService();
    prisma.opticalOrder.findFirst.mockResolvedValue({ id: 'ord-1', status: OrderStatus.DRAFT });
    await service.setStatus('pr-1', 'ord-1', 'user-1', { status: OrderStatus.ORDERED });
    const updateArg = prisma.opticalOrder.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe(OrderStatus.ORDERED);
    expect(updateArg.data.orderedAt).toBeInstanceOf(Date);
  });
});

describe('OrdersService.remake', () => {
  it('only remakes received/verified/dispensed orders', async () => {
    const { service, prisma } = makeService();
    prisma.opticalOrder.findFirst.mockResolvedValue({ id: 'ord-1', status: OrderStatus.DRAFT });
    await expect(
      service.remake('pr-1', 'ord-1', 'user-1', { reason: 'scratched lens' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a linked replacement order', async () => {
    const { service, prisma } = makeService();
    prisma.opticalOrder.findFirst.mockResolvedValue({
      id: 'ord-1',
      status: OrderStatus.DISPENSED,
      patientId: 'pat-1',
      prescriptionId: 'rx-1',
      kind: OrderKind.SPECTACLE,
      details: {},
    });
    const replacement = await service.remake('pr-1', 'ord-1', 'user-1', { reason: 'scratched lens' });
    expect(replacement.remakeOfId).toBe('ord-1');
  });
});
