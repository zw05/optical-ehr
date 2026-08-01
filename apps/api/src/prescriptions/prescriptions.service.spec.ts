import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrescriptionStatus, PrescriptionType, Role } from '@prisma/client';
import { PrescriptionsService } from './prescriptions.service';
import { JwtPayload } from '../auth/auth.service';

const doctor: JwtPayload = { sub: 'doc-1', practiceId: 'pr-1', role: Role.DOCTOR, email: 'd@x' };
const optician: JwtPayload = { sub: 'opt-1', practiceId: 'pr-1', role: Role.OPTICIAN, email: 'o@x' };

const validSpectacle = {
  od: { sphere: -1.25, cylinder: -0.5, axis: 90 },
  os: { sphere: -1.5 },
  pd: 62,
};

function makeService(overrides: { prescription?: Partial<Record<string, jest.Mock>> } = {}) {
  const prisma = {
    prescription: {
      create: jest.fn().mockResolvedValue({ id: 'rx-1' }),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'rx-1', status: PrescriptionStatus.FINALIZED }),
      ...overrides.prescription,
    },
    $transaction: jest.fn().mockResolvedValue([{}, { id: 'rx-2', version: 2 }]),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new PrescriptionsService(prisma as never, audit as never);
  return { service, prisma, audit };
}

describe('PrescriptionsService', () => {
  it('rejects non-doctors creating prescriptions', async () => {
    const { service } = makeService();
    await expect(
      service.create('pr-1', optician, {
        patientId: 'pat-1',
        type: PrescriptionType.SPECTACLE,
        values: validSpectacle,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects invalid spectacle values (sphere out of range)', async () => {
    const { service } = makeService();
    await expect(
      service.create('pr-1', doctor, {
        patientId: 'pat-1',
        type: PrescriptionType.SPECTACLE,
        values: { od: { sphere: -99 }, os: { sphere: 0 } },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a draft with valid values', async () => {
    const { service, prisma } = makeService();
    await service.create('pr-1', doctor, {
      patientId: 'pat-1',
      type: PrescriptionType.SPECTACLE,
      values: validSpectacle,
    });
    expect(prisma.prescription.create).toHaveBeenCalled();
  });

  it('refuses to edit a finalized prescription', async () => {
    const { service, prisma } = makeService();
    prisma.prescription.findFirst.mockResolvedValue({
      id: 'rx-1',
      status: PrescriptionStatus.FINALIZED,
      type: PrescriptionType.SPECTACLE,
    });
    await expect(
      service.updateDraft('pr-1', 'rx-1', doctor, { values: validSpectacle }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('finalize stamps expiration and writes a FINALIZE audit event', async () => {
    const { service, prisma, audit } = makeService();
    prisma.prescription.findFirst.mockResolvedValue({
      id: 'rx-1',
      status: PrescriptionStatus.DRAFT,
      type: PrescriptionType.SPECTACLE,
      prescriberId: 'doc-1',
      patientId: 'pat-1',
      values: validSpectacle,
    });
    await service.finalize('pr-1', 'rx-1', doctor);
    const updateArg = prisma.prescription.update.mock.calls[0][0];
    expect(updateArg.data.status).toBe(PrescriptionStatus.FINALIZED);
    expect(updateArg.data.expiresAt).toBeInstanceOf(Date);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'FINALIZE' }));
  });

  it('only the prescribing doctor can finalize', async () => {
    const { service, prisma } = makeService();
    prisma.prescription.findFirst.mockResolvedValue({
      id: 'rx-1',
      status: PrescriptionStatus.DRAFT,
      type: PrescriptionType.SPECTACLE,
      prescriberId: 'someone-else',
      values: validSpectacle,
    });
    await expect(service.finalize('pr-1', 'rx-1', doctor)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('supersede creates a new version and marks the old one superseded', async () => {
    const { service, prisma } = makeService();
    prisma.prescription.findFirst.mockResolvedValue({
      id: 'rx-1',
      status: PrescriptionStatus.FINALIZED,
      type: PrescriptionType.SPECTACLE,
      patientId: 'pat-1',
      encounterId: null,
      version: 1,
    });
    const next = await service.supersede('pr-1', 'rx-1', doctor, validSpectacle);
    expect(next.version).toBe(2);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
