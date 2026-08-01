import { BadRequestException } from '@nestjs/common';
import { PrescriptionStatus, PrescriptionType } from '@prisma/client';
import { ReportsService } from './reports.service';

type MockFn = jest.Mock;

function createService(overrides: {
  findFirst?: MockFn;
  findMany?: MockFn;
  create?: MockFn;
  update?: MockFn;
  updateMany?: MockFn;
  findUnique?: MockFn;
  findUniqueOrThrow?: MockFn;
  transaction?: MockFn;
  upload?: MockFn;
  download?: MockFn;
  render?: MockFn;
  auditLog?: MockFn;
} = {}) {
  const reportTemplate = {
    findFirst: overrides.findFirst ?? jest.fn(),
    findMany: overrides.findMany ?? jest.fn(),
    create: overrides.create ?? jest.fn(),
    update: overrides.update ?? jest.fn(),
    updateMany: overrides.updateMany ?? jest.fn(),
    findUnique: overrides.findUnique ?? jest.fn(),
    findUniqueOrThrow: overrides.findUniqueOrThrow ?? jest.fn(),
  };
  const prisma = {
    reportTemplate,
    prescription: { findFirst: jest.fn() },
    generatedReport: { create: jest.fn(), findFirst: jest.fn() },
    practice: { findUnique: jest.fn() },
    $transaction: overrides.transaction ?? jest.fn(async (ops: unknown) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      return ops;
    }),
  };
  const blobs = {
    upload: overrides.upload ?? jest.fn().mockResolvedValue({ blobPath: 'x', sha256: 'abc', sizeBytes: 10 }),
    download: overrides.download ?? jest.fn(),
  };
  const renderer = {
    render: overrides.render ?? jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4')),
  };
  const audit = {
    log: overrides.auditLog ?? jest.fn(),
  };

  const service = new ReportsService(prisma as never, blobs as never, renderer as never, audit as never);
  return { service, prisma, blobs, renderer, audit, reportTemplate };
}

describe('ReportsService template selection', () => {
  it('prefers the default template for a kind', async () => {
    const defaultTpl = { id: 'def', kind: 'spectacle-rx', isDefault: true, isActive: true, layout: {} };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(defaultTpl); // resolveTemplate preferred query
    const { service, reportTemplate } = createService({ findFirst });

    const result = await service.resolveTemplate('practice-1', 'spectacle-rx');
    expect(result).toEqual(defaultTpl);
    expect(reportTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDefault: true, isActive: true, kind: 'spectacle-rx' }),
      }),
    );
  });

  it('falls back to newest active when no default is set', async () => {
    const fallback = { id: 'fb', kind: 'spectacle-rx', isDefault: false, isActive: true, layout: {} };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null) // no default
      .mockResolvedValueOnce(fallback); // fallback
    const { service } = createService({ findFirst });

    const result = await service.resolveTemplate('practice-1', 'spectacle-rx');
    expect(result).toEqual(fallback);
  });

  it('uses the default template when generating a prescription report', async () => {
    const issuedAt = new Date('2026-07-01');
    const expiresAt = new Date('2028-07-01');
    const rx = {
      id: 'rx-1',
      patientId: 'pat-1',
      status: PrescriptionStatus.FINALIZED,
      type: PrescriptionType.SPECTACLE,
      version: 1,
      values: {
        od: { sphere: -1.25, cylinder: -0.5, axis: 90 },
        os: { sphere: -1.0 },
        pd: 63,
      },
      issuedAt,
      expiresAt,
      patient: {
        firstName: 'Jane',
        lastName: 'Doe',
        mrn: 'P1',
        dateOfBirth: new Date('1985-04-12'),
      },
      prescriber: {
        firstName: 'Dana',
        lastName: 'Reyes',
        licenseNumber: 'OD-1',
        npi: '123',
      },
      practice: { name: 'EHR', phone: null, address: null, logoUrl: null },
    };
    const template = {
      id: 'tpl-default',
      kind: 'spectacle-rx',
      isDefault: true,
      isActive: true,
      layout: { paperSize: 'LETTER' },
    };

    const { service, prisma, renderer, reportTemplate } = createService({
      findFirst: jest.fn().mockResolvedValue(template),
      render: jest.fn().mockResolvedValue(Buffer.from('%PDF-fake')),
      upload: jest.fn().mockResolvedValue({ blobPath: 'r/1.pdf', sha256: 'hash', sizeBytes: 9 }),
    });
    prisma.prescription.findFirst.mockResolvedValue(rx);
    prisma.generatedReport.create.mockResolvedValue({ id: 'rep-1' });

    const result = await service.generatePrescriptionReport('practice-1', 'rx-1', {
      sub: 'doctor-1',
      practiceId: 'practice-1',
      role: 'DOCTOR',
      email: 'doctor@dev.local',
    } as never);

    expect(reportTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDefault: true, kind: 'spectacle-rx' }),
      }),
    );
    expect(renderer.render).toHaveBeenCalled();
    expect(result.report.id).toBe('rep-1');
    expect(Buffer.isBuffer(result.pdf)).toBe(true);

    const contentArg = renderer.render.mock.calls[0][1] as {
      eyeTable?: { columns: string[]; rows: { eye: string }[] };
    };
    expect(contentArg.eyeTable).toBeDefined();
    expect(contentArg.eyeTable!.rows).toHaveLength(2);
    expect(contentArg.eyeTable!.rows.map((r) => r.eye)).toEqual(['OD', 'OS']);
    expect(contentArg.eyeTable!.columns).toContain('Sphere');
  });
});

describe('ReportsService archive / default guards', () => {
  it('rejects archiving the default template', async () => {
    const { service } = createService({
      findFirst: jest.fn().mockResolvedValue({
        id: 'tpl-1',
        isDefault: true,
        isActive: true,
        kind: 'spectacle-rx',
      }),
    });
    await expect(service.archiveTemplate('p1', 'tpl-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects setting an archived template as default', async () => {
    const { service } = createService({
      findFirst: jest.fn().mockResolvedValue({
        id: 'tpl-1',
        isDefault: false,
        isActive: false,
        kind: 'spectacle-rx',
      }),
    });
    await expect(service.setDefaultTemplate('p1', 'tpl-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects logo uploads that are not PNG/JPEG', async () => {
    const { service } = createService();
    await expect(
      service.uploadLogo('logo.gif', 'image/gif', Buffer.from('gif')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
