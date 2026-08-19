import { BadRequestException } from '@nestjs/common';
import { OrderKind, OrderStatus, PrescriptionStatus, PrescriptionType, Prisma } from '@prisma/client';
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
    opticalOrder: { findFirst: jest.fn() },
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

describe('ReportsService order reports', () => {
  const orderTemplate = {
    id: 'tpl-order',
    kind: 'order-summary',
    isDefault: true,
    isActive: true,
    layout: { paperSize: 'LETTER' },
  };

  function spectacleOrder(details: Record<string, unknown>) {
    return {
      id: 'ord-1',
      patientId: 'pat-1',
      prescriptionId: 'rx-1',
      kind: OrderKind.SPECTACLE,
      status: OrderStatus.DRAFT,
      details,
      labName: 'Bench Optical',
      labReference: null,
      priceTotal: new Prisma.Decimal('420.00'),
      deposit: new Prisma.Decimal('100.00'),
      balanceDue: new Prisma.Decimal('320.00'),
      warrantyNotes: null,
      createdAt: new Date('2026-08-18'),
      patient: { firstName: 'Jane', lastName: 'Doe', mrn: 'P1', dateOfBirth: new Date('1985-04-12') },
      prescription: {
        type: PrescriptionType.SPECTACLE,
        version: 2,
        values: { od: { sphere: -1.25 }, os: { sphere: -1.0 } },
      },
      practice: { name: 'EHR', phone: null, address: null, logoUrl: null },
    };
  }

  async function generate(order: ReturnType<typeof spectacleOrder>) {
    const { service, prisma, renderer } = createService({
      findFirst: jest.fn().mockResolvedValue(orderTemplate),
      upload: jest.fn().mockResolvedValue({ blobPath: 'r/o.pdf', sha256: 'hash', sizeBytes: 9 }),
    });
    prisma.opticalOrder.findFirst.mockResolvedValue(order);
    prisma.generatedReport.create.mockResolvedValue({ id: 'rep-order' });

    const result = await service.generateOrderReport('practice-1', 'ord-1', {
      sub: 'optician-1',
      practiceId: 'practice-1',
      role: 'OPTICIAN',
      email: 'optician@dev.local',
    } as never);

    const content = renderer.render.mock.calls[0][1] as {
      sections: { heading: string; rows: { label: string; value: string }[] }[];
      eyeTable?: { rows: { eye: string }[] };
    };
    return { result, content, prisma };
  }

  it('prints the ordered powers and the assigned tray number', async () => {
    const { result, content, prisma } = await generate(
      spectacleOrder({ trayNumber: 'A-14', frame: { brand: 'Acme' }, measurements: { pdOd: 31.5 } }),
    );

    expect(result.report.id).toBe('rep-order');
    expect(content.eyeTable!.rows.map((r) => r.eye)).toEqual(['OD', 'OS']);

    const tray = content.sections.find((s) => s.heading === 'Job / tray');
    expect(tray!.rows).toContainEqual({ label: 'Tray #', value: 'A-14' });

    const frame = content.sections.find((s) => s.heading === 'Frame');
    expect(frame!.rows).toEqual([{ label: 'Brand', value: 'Acme' }]);

    const balance = content.sections.find((s) => s.heading === 'Balance');
    expect(balance!.rows).toContainEqual({ label: 'Balance due', value: '320.00' });

    // Traced to the patient via the Rx, since GeneratedReport has no order link.
    expect(prisma.generatedReport.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ prescriptionId: 'rx-1' }) }),
    );
  });

  it('prints a blank tray rule when no tray is assigned yet', async () => {
    const { content } = await generate(spectacleOrder({ frame: { brand: 'Acme' } }));

    const tray = content.sections.find((s) => s.heading === 'Job / tray');
    expect(tray!.rows[0].label).toBe('Tray #');
    expect(tray!.rows[0].value).toMatch(/^_+$/);
  });

  it('omits detail sections that have no values', async () => {
    const { content } = await generate(spectacleOrder({ trayNumber: 'B-2' }));

    expect(content.sections.map((s) => s.heading)).toEqual(['Job / tray', 'Lab', 'Balance']);
  });

  it('prints the benefit terms snapshotted on an insured order', async () => {
    const { content } = await generate(
      spectacleOrder({
        trayNumber: 'E-1',
        pricing: {
          frameRetail: 220,
          lensRetail: 180,
          subtotal: 400,
          coverage: {
            policyId: 'pol-1',
            payerName: 'EyeMed',
            planName: 'EyeMed Insight',
            memberId: 'EYE-1',
            frameAllowance: 150,
            framePercentOff: 20,
            lensCopay: 25,
          },
          planPortion: 319,
          patientTotal: 81,
        },
      }),
    );

    const pricing = content.sections.find((s) => s.heading === 'Pricing');
    expect(pricing!.rows).toContainEqual({ label: 'Subtotal', value: '400.00' });

    const insurance = content.sections.find((s) => s.heading === 'Insurance');
    expect(insurance!.rows).toContainEqual({ label: 'Plan', value: 'EyeMed — EyeMed Insight' });
    expect(insurance!.rows).toContainEqual({ label: 'Frame allow.', value: '150.00' });
    expect(insurance!.rows).toContainEqual({ label: 'Overage off', value: '20%' });
    expect(insurance!.rows).toContainEqual({ label: 'Lens copay', value: '25.00' });
    expect(insurance!.rows).toContainEqual({ label: 'Plan pays', value: '319.00' });
  });

  it('labels the exam line by whether the order is insured', async () => {
    const insured = await generate(
      spectacleOrder({
        pricing: {
          lensRetail: 180,
          examCharge: 25,
          subtotal: 205,
          coverage: { policyId: 'pol-1', payerName: 'EyeMed' },
          planPortion: 0,
          patientTotal: 205,
        },
      }),
    );
    expect(
      insured.content.sections.find((s) => s.heading === 'Pricing')!.rows,
    ).toContainEqual({ label: 'Exam copay', value: '25.00' });

    const selfPay = await generate(
      spectacleOrder({
        pricing: { lensRetail: 180, examCharge: 95, subtotal: 275, planPortion: 0, patientTotal: 275 },
      }),
    );
    expect(
      selfPay.content.sections.find((s) => s.heading === 'Pricing')!.rows,
    ).toContainEqual({ label: 'Exam fee', value: '95.00' });
  });

  it('leaves out the insurance section for a self-pay order', async () => {
    const { content } = await generate(
      spectacleOrder({ pricing: { lensRetail: 400, subtotal: 400, planPortion: 0, patientTotal: 400 } }),
    );

    expect(content.sections.map((s) => s.heading)).not.toContain('Insurance');
  });

  it('generates for a DRAFT order without a status gate', async () => {
    const { result } = await generate(spectacleOrder({ trayNumber: 'C-9' }));
    expect(Buffer.isBuffer(result.pdf)).toBe(true);
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

  it('rejects signature uploads that are not PNG/JPEG', async () => {
    const { service } = createService();
    await expect(
      service.uploadSignature('sig.gif', 'image/gif', Buffer.from('gif')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
