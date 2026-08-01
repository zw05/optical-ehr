import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EncounterStatus, Role } from '@prisma/client';
import { EncountersService } from './encounters.service';
import { JwtPayload } from '../auth/auth.service';

const doctor: JwtPayload = { sub: 'doc-1', practiceId: 'pr-1', role: Role.DOCTOR, email: 'd@x' };
const tech: JwtPayload = { sub: 'tech-1', practiceId: 'pr-1', role: Role.TECHNICIAN, email: 't@x' };

const template = {
  sections: [
    { key: 'iop', title: 'Intraocular Pressure', enabled: true, requiredFields: ['od', 'os', 'method'] },
    { key: 'skipped', title: 'Disabled Section', enabled: false, requiredFields: ['whatever'] },
  ],
};

function makeService() {
  const prisma = {
    encounter: {
      findFirst: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'enc-1', ...data })),
      create: jest.fn(),
    },
    addendum: { create: jest.fn().mockResolvedValue({ id: 'add-1' }) },
    examTemplate: { findFirst: jest.fn() },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new EncountersService(prisma as never, audit as never);
  return { service, prisma, audit };
}

const completeEncounter = {
  id: 'enc-1',
  patientId: 'pat-1',
  status: EncounterStatus.IN_PROGRESS,
  chiefComplaint: 'Blurry vision at distance',
  assessment: 'Myopia OU',
  clinicalData: { iop: { od: 15, os: 16, method: 'NCT' } },
  diagnosisCodes: ['H52.13'],
  procedureCodes: [],
  template,
};

describe('EncountersService.sign', () => {
  it('rejects non-doctors', async () => {
    const { service } = makeService();
    await expect(service.sign('pr-1', 'enc-1', tech)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects signing when required template fields are missing', async () => {
    const { service, prisma } = makeService();
    prisma.encounter.findFirst.mockResolvedValue({
      ...completeEncounter,
      clinicalData: { iop: { od: 15 } }, // os and method missing
    });
    await expect(service.sign('pr-1', 'enc-1', doctor)).rejects.toThrow(/missing required fields/);
  });

  it('ignores required fields on disabled sections', async () => {
    const { service, prisma } = makeService();
    prisma.encounter.findFirst.mockResolvedValue(completeEncounter);
    await expect(service.sign('pr-1', 'enc-1', doctor)).resolves.toBeDefined();
  });

  it('signs a complete encounter and writes a SIGN audit event', async () => {
    const { service, prisma, audit } = makeService();
    prisma.encounter.findFirst.mockResolvedValue(completeEncounter);
    await service.sign('pr-1', 'enc-1', doctor);
    expect(prisma.encounter.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: EncounterStatus.SIGNED, signedById: 'doc-1' }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'SIGN' }));
  });

  it('refuses to sign twice', async () => {
    const { service, prisma } = makeService();
    prisma.encounter.findFirst.mockResolvedValue({ ...completeEncounter, status: EncounterStatus.SIGNED });
    await expect(service.sign('pr-1', 'enc-1', doctor)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('EncountersService.update', () => {
  it('blocks edits to signed encounters', async () => {
    const { service, prisma } = makeService();
    prisma.encounter.findFirst.mockResolvedValue({ ...completeEncounter, status: EncounterStatus.SIGNED });
    await expect(service.update('pr-1', 'enc-1', { assessment: 'changed' })).rejects.toThrow(/immutable/);
  });

  it('merges clinical sections instead of replacing them', async () => {
    const { service, prisma } = makeService();
    prisma.encounter.findFirst.mockResolvedValue(completeEncounter);
    await service.update('pr-1', 'enc-1', { clinicalData: { visualAcuity: { odDistance: '20/20' } } });
    const updateArg = prisma.encounter.update.mock.calls[0][0];
    expect(updateArg.data.clinicalData).toEqual({
      iop: { od: 15, os: 16, method: 'NCT' },
      visualAcuity: { odDistance: '20/20' },
    });
  });
});

describe('EncountersService.addAddendum', () => {
  it('appends addenda to signed encounters only', async () => {
    const { service, prisma } = makeService();
    prisma.encounter.findFirst.mockResolvedValue(completeEncounter); // still in progress
    await expect(
      service.addAddendum('pr-1', 'enc-1', doctor, { text: 'correction' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.encounter.findFirst.mockResolvedValue({ ...completeEncounter, status: EncounterStatus.SIGNED });
    await expect(
      service.addAddendum('pr-1', 'enc-1', doctor, { text: 'correction' }),
    ).resolves.toEqual({ id: 'add-1' });
  });
});
