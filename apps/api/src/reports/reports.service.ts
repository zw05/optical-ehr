import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderKind, OrderStatus, PrescriptionStatus, PrescriptionType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BlobStorageService } from '../documents/blob-storage.service';
import { JwtPayload } from '../auth/auth.service';
import { PdfRenderer, ReportContent, ReportLayout, EyeTable } from './pdf-renderer';

interface SpectacleEye {
  sphere: number;
  cylinder?: number;
  axis?: number;
  add?: number;
  prism?: number;
  base?: string;
}

interface ContactLensEye {
  brand: string;
  material?: string;
  baseCurve: number;
  diameter: number;
  sphere: number;
  cylinder?: number;
  axis?: number;
  add?: number;
}

const MAX_LOGO_BYTES = 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);

/**
 * Report templates (branding/layout, versioned like exam templates) and
 * PDF generation. Every issued PDF is stored immutably with its SHA-256 so
 * the practice can always prove exactly what was handed to a patient.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blobs: BlobStorageService,
    private readonly renderer: PdfRenderer,
    private readonly audit: AuditService,
  ) {}

  // ----- report templates -----

  /** Active report templates by kind (spectacle-rx, contact-lens-rx, exam-summary). */
  listTemplates(practiceId: string) {
    return this.prisma.reportTemplate.findMany({
      where: { practiceId, isActive: true },
      orderBy: [{ kind: 'asc' }, { isDefault: 'desc' }, { version: 'desc' }],
    });
  }

  /**
   * Creates a new report template (version 1). When this is the first active
   * template of its kind, it becomes the practice default automatically.
   */
  async createTemplate(practiceId: string, name: string, kind: string, layout: ReportLayout) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Template name is required');

    const collision = await this.prisma.reportTemplate.findFirst({
      where: { practiceId, name: trimmed, version: 1 },
    });
    if (collision) {
      throw new BadRequestException(`A template named "${trimmed}" already exists`);
    }

    const existingDefault = await this.prisma.reportTemplate.findFirst({
      where: { practiceId, kind, isActive: true, isDefault: true },
    });

    try {
      return await this.prisma.reportTemplate.create({
        data: {
          practiceId,
          name: trimmed,
          kind,
          layout: layout as object,
          isDefault: !existingDefault,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(`A template named "${trimmed}" already exists`);
      }
      throw err;
    }
  }

  /**
   * Publishes an edited layout as a new version and retires the old one, so
   * previously generated reports keep pointing at the exact layout used.
   * The new version inherits the default flag from the retired one.
   */
  async publishTemplateVersion(practiceId: string, id: string, layout: ReportLayout) {
    const current = await this.prisma.reportTemplate.findFirst({ where: { id, practiceId } });
    if (!current) throw new NotFoundException('Report template not found');
    const [, next] = await this.prisma.$transaction([
      this.prisma.reportTemplate.update({
        where: { id },
        data: { isActive: false, isDefault: false },
      }),
      this.prisma.reportTemplate.create({
        data: {
          practiceId,
          name: current.name,
          kind: current.kind,
          version: current.version + 1,
          layout: layout as object,
          isDefault: current.isDefault,
        },
      }),
    ]);
    return next;
  }

  /**
   * Copies an existing template's layout under a new name at version 1.
   * The duplicate is never the default — the admin must promote it explicitly.
   */
  async duplicateTemplate(practiceId: string, id: string, name: string) {
    const source = await this.prisma.reportTemplate.findFirst({ where: { id, practiceId } });
    if (!source) throw new NotFoundException('Report template not found');
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Template name is required');

    const collision = await this.prisma.reportTemplate.findFirst({
      where: { practiceId, name: trimmed, version: 1 },
    });
    if (collision) {
      throw new BadRequestException(`A template named "${trimmed}" already exists`);
    }

    try {
      return await this.prisma.reportTemplate.create({
        data: {
          practiceId,
          name: trimmed,
          kind: source.kind,
          layout: source.layout as object,
          isDefault: false,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(`A template named "${trimmed}" already exists`);
      }
      throw err;
    }
  }

  /**
   * Marks one template as the practice default for its kind and clears the
   * flag on every sibling of the same kind (active or not).
   */
  async setDefaultTemplate(practiceId: string, id: string) {
    const target = await this.prisma.reportTemplate.findFirst({ where: { id, practiceId } });
    if (!target) throw new NotFoundException('Report template not found');
    if (!target.isActive) {
      throw new BadRequestException('Cannot set an archived template as default');
    }

    await this.prisma.$transaction([
      this.prisma.reportTemplate.updateMany({
        where: { practiceId, kind: target.kind, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.reportTemplate.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    return this.prisma.reportTemplate.findUniqueOrThrow({ where: { id } });
  }

  /**
   * Soft-deletes a template. Rejected when the template is the current default
   * so a practice can never end up with nothing printable for a kind.
   */
  async archiveTemplate(practiceId: string, id: string) {
    const target = await this.prisma.reportTemplate.findFirst({ where: { id, practiceId } });
    if (!target) throw new NotFoundException('Report template not found');
    if (target.isDefault) {
      throw new BadRequestException('Cannot archive the default template; set another default first');
    }
    return this.prisma.reportTemplate.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Stores a practice logo image for use in Rx print templates.
   * Accepts PNG/JPEG up to 1 MB and returns the blob path to embed in layout.
   */
  async uploadLogo(fileName: string, contentType: string, data: Buffer) {
    return this.uploadTemplateImage('logos', 'logo', fileName, contentType, data);
  }

  /**
   * Stores a provider signature image for Rx print templates.
   * Accepts PNG/JPEG up to 1 MB and returns the blob path to embed in layout.
   */
  async uploadSignature(fileName: string, contentType: string, data: Buffer) {
    return this.uploadTemplateImage('signatures', 'signature', fileName, contentType, data);
  }

  private async uploadTemplateImage(
    container: 'logos' | 'signatures',
    kind: 'logo' | 'signature',
    fileName: string,
    contentType: string,
    data: Buffer,
  ) {
    const normalized = contentType.toLowerCase();
    if (!ALLOWED_LOGO_TYPES.has(normalized)) {
      throw new BadRequestException(`${kind === 'logo' ? 'Logo' : 'Signature'} must be a PNG or JPEG image`);
    }
    if (data.length === 0) throw new BadRequestException('Empty file');
    if (data.length > MAX_LOGO_BYTES) {
      throw new BadRequestException(`${kind === 'logo' ? 'Logo' : 'Signature'} exceeds 1 MB limit`);
    }
    const ext = normalized.includes('png') ? 'png' : 'jpg';
    const safeName = fileName.trim() || `${kind}.${ext}`;
    const stored = await this.blobs.upload(
      container,
      safeName.endsWith(`.${ext}`) ? safeName : `${safeName}.${ext}`,
      data,
    );
    return { blobPath: stored.blobPath, sizeBytes: stored.sizeBytes };
  }

  // ----- prescription report generation -----

  /**
   * Issues the printable PDF for a finalized prescription:
   * 1. loads the Rx with patient/prescriber/practice details (400 unless FINALIZED),
   * 2. picks the default report template for its kind (falls back to newest active),
   * 3. renders the PDF and stores it in the reports container with its hash,
   * 4. records a GeneratedReport row and a PRINT audit event.
   * Returns both the database record and the PDF bytes for the response.
   */
  async generatePrescriptionReport(practiceId: string, prescriptionId: string, user: JwtPayload) {
    const rx = await this.prisma.prescription.findFirst({
      where: { id: prescriptionId, practiceId },
      include: {
        patient: true,
        prescriber: true,
        practice: true,
      },
    });
    if (!rx) throw new NotFoundException('Prescription not found');
    if (rx.status !== PrescriptionStatus.FINALIZED) {
      throw new BadRequestException('Reports are issued for finalized prescriptions only');
    }

    const kind = rx.type === PrescriptionType.SPECTACLE ? 'spectacle-rx' : 'contact-lens-rx';
    const template = await this.resolveTemplate(practiceId, kind);
    if (!template) throw new BadRequestException(`No active report template for ${kind}`);

    const layout = template.layout as unknown as ReportLayout;
    const content = this.buildPrescriptionContent(rx);
    const withAssets = await this.attachPrintAssets(layout, content);
    const pdf = await this.renderer.render(layout, withAssets);

    const stored = await this.blobs.upload('reports', `${kind}-${rx.patient.mrn}-v${rx.version}.pdf`, pdf);
    const report = await this.prisma.generatedReport.create({
      data: {
        templateId: template.id,
        prescriptionId: rx.id,
        blobPath: stored.blobPath,
        sha256: stored.sha256,
        generatedById: user.sub,
      },
    });

    await this.audit.log({
      practiceId,
      actorId: user.sub,
      action: 'PRINT',
      entityType: 'GeneratedReport',
      entityId: report.id,
      patientId: rx.patientId,
    });

    return { report, pdf };
  }

  /**
   * Issues the printable job paper for an optical order. Unlike prescriptions
   * there is no status gate: the paper is normally printed the moment the order
   * is opened, while it is still DRAFT, and is reprinted throughout fulfillment.
   * The underlying Rx was already required to be finalized at order creation.
   */
  async generateOrderReport(practiceId: string, orderId: string, user: JwtPayload) {
    const order = await this.prisma.opticalOrder.findFirst({
      where: { id: orderId, practiceId },
      include: { patient: true, prescription: true, practice: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const rxKind = order.prescription.type === PrescriptionType.SPECTACLE ? 'spectacle-rx' : 'contact-lens-rx';
    // Practices seeded before order printing existed have no order-summary
    // template; the matching Rx template is always present and prints fine.
    const template = (await this.resolveTemplate(practiceId, 'order-summary')) ?? (await this.resolveTemplate(practiceId, rxKind));
    if (!template) throw new BadRequestException('No active report template for order-summary');

    const layout = template.layout as unknown as ReportLayout;
    const content = this.buildOrderContent(order);
    const withAssets = await this.attachPrintAssets(layout, content);
    const pdf = await this.renderer.render(layout, withAssets);

    const stored = await this.blobs.upload('reports', `order-${order.patient.mrn}-${order.id}.pdf`, pdf);
    const report = await this.prisma.generatedReport.create({
      data: {
        templateId: template.id,
        // GeneratedReport has no order link; the Rx keeps the row traceable to
        // a patient for re-download audit, and the blob path names the order.
        prescriptionId: order.prescriptionId,
        blobPath: stored.blobPath,
        sha256: stored.sha256,
        generatedById: user.sub,
      },
    });

    await this.audit.log({
      practiceId,
      actorId: user.sub,
      action: 'PRINT',
      entityType: 'GeneratedReport',
      entityId: report.id,
      patientId: order.patientId,
    });

    return { report, pdf };
  }

  /** Re-downloads a previously issued PDF and logs the access (READ audit event). */
  async getReportContent(practiceId: string, id: string, user: JwtPayload) {
    const report = await this.prisma.generatedReport.findFirst({
      where: {
        id,
        template: { practiceId },
      },
      include: { prescription: { select: { patientId: true } } },
    });
    if (!report) throw new NotFoundException('Report not found');
    const pdf = await this.blobs.download('reports', report.blobPath);
    await this.audit.log({
      practiceId,
      actorId: user.sub,
      action: 'READ',
      entityType: 'GeneratedReport',
      entityId: id,
      patientId: report.prescription?.patientId ?? undefined,
    });
    return { report, pdf };
  }

  /**
   * Renders a sample Rx PDF from a posted layout without persisting a
   * GeneratedReport — used by the Settings printing preview.
   */
  async previewLayout(practiceId: string, layout: ReportLayout, kind = 'spectacle-rx') {
    const practice = await this.prisma.practice.findUnique({ where: { id: practiceId } });
    if (!practice) throw new NotFoundException('Practice not found');
    const content = samplePrescriptionContent(practice, kind);
    const withAssets = await this.attachPrintAssets(layout, content);
    return this.renderer.render(layout, withAssets);
  }

  /**
   * Prefers the practice default for the kind; falls back to the newest active
   * template so practices that never set a default keep working.
   */
  async resolveTemplate(practiceId: string, kind: string) {
    const preferred = await this.prisma.reportTemplate.findFirst({
      where: { practiceId, kind, isActive: true, isDefault: true },
      orderBy: { version: 'desc' },
    });
    if (preferred) return preferred;
    return this.prisma.reportTemplate.findFirst({
      where: { practiceId, kind, isActive: true },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Loads logo and signature image bytes from layout blob paths when set.
   * Missing or unreadable blobs degrade to no image rather than failing the print.
   */
  private async attachPrintAssets(layout: ReportLayout, content: ReportContent): Promise<ReportContent> {
    let next = content;
    if (layout.showLogo && layout.logoBlobPath) {
      try {
        const logoBytes = await this.blobs.download('logos', layout.logoBlobPath);
        next = { ...next, logoBytes };
      } catch {
        // keep content without logo
      }
    }
    if (layout.signatureLine !== false && layout.signatureBlobPath) {
      try {
        const signatureBytes = await this.blobs.download('signatures', layout.signatureBlobPath);
        next = { ...next, signatureBytes };
      } catch {
        // keep content without signature image
      }
    }
    return next;
  }

  /**
   * Maps a prescription row into renderer-ready content: header identity
   * block plus OD/OS sections (spectacle powers or contact-lens fit values).
   */
  private buildPrescriptionContent(rx: {
    type: PrescriptionType;
    values: unknown;
    version: number;
    issuedAt: Date | null;
    expiresAt: Date | null;
    patient: { firstName: string; lastName: string; mrn: string; dateOfBirth: Date | null };
    prescriber: { firstName: string; lastName: string; licenseNumber: string | null; npi: string | null };
    practice: { name: string; phone: string | null; address: string | null; logoUrl?: string | null };
  }): ReportContent {
    const base = {
      practice: {
        name: rx.practice.name,
        phone: rx.practice.phone,
        address: rx.practice.address,
        logoUrl: rx.practice.logoUrl ?? null,
      },
      patient: {
        name: `${rx.patient.lastName}, ${rx.patient.firstName}`,
        mrn: rx.patient.mrn,
        dateOfBirth: rx.patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      },
      provider: {
        name: `Dr. ${rx.prescriber.firstName} ${rx.prescriber.lastName}`,
        licenseNumber: rx.prescriber.licenseNumber,
        npi: rx.prescriber.npi,
      },
      issuedAt: rx.issuedAt?.toISOString().slice(0, 10),
      expiresAt: rx.expiresAt?.toISOString().slice(0, 10),
    };

    if (rx.type === PrescriptionType.SPECTACLE) {
      const v = rx.values as { od: SpectacleEye; os: SpectacleEye; pd?: number; pdNear?: number; remarks?: string };
      return {
        ...base,
        title: `Spectacle Prescription (v${rx.version})`,
        eyeTable: spectacleEyeTable(v.od, v.os),
        sections: [
          {
            heading: 'Measurements',
            rows: [
              ...(v.pd !== undefined ? [{ label: 'PD (distance)', value: `${v.pd} mm` }] : []),
              ...(v.pdNear !== undefined ? [{ label: 'PD (near)', value: `${v.pdNear} mm` }] : []),
            ],
          },
        ],
        remarks: v.remarks,
      };
    }

    const v = rx.values as {
      od: ContactLensEye;
      os: ContactLensEye;
      wearSchedule?: string;
      replacementSchedule?: string;
      remarks?: string;
    };
    return {
      ...base,
      title: `Contact Lens Prescription (v${rx.version})`,
      eyeTable: contactLensEyeTable(v.od, v.os),
      sections: [
        {
          heading: 'Wear',
          rows: [
            ...(v.wearSchedule ? [{ label: 'Wear schedule', value: v.wearSchedule }] : []),
            ...(v.replacementSchedule ? [{ label: 'Replacement', value: v.replacementSchedule }] : []),
          ],
        },
      ],
      remarks: v.remarks,
    };
  }

  /**
   * Maps an optical order into renderer-ready content: the powers being ordered
   * (taken from the linked Rx) plus the job specification the lab works from.
   */
  private buildOrderContent(order: {
    id: string;
    kind: OrderKind;
    status: OrderStatus;
    details: unknown;
    labName: string | null;
    labReference: string | null;
    priceTotal: Prisma.Decimal | null;
    deposit: Prisma.Decimal | null;
    balanceDue: Prisma.Decimal | null;
    warrantyNotes: string | null;
    createdAt: Date;
    patient: { firstName: string; lastName: string; mrn: string; dateOfBirth: Date | null };
    prescription: { type: PrescriptionType; values: unknown; version: number };
    practice: { name: string; phone: string | null; address: string | null; logoUrl?: string | null };
  }): ReportContent {
    const d = (order.details ?? {}) as OrderDetails;
    const spectacle = order.kind === OrderKind.SPECTACLE;

    const jobRows = [
      // Always printed, even when unset: an unassigned tray gets written on by
      // hand at the bench, so the paper needs a rule to write on.
      { label: 'Tray #', value: d.trayNumber?.trim() || '______________________' },
      ...rowsFrom([
        ['Job notes', d.jobNotes],
        ['Order date', order.createdAt.toISOString().slice(0, 10)],
        ['Status', order.status],
      ]),
    ];

    const detailSections = spectacle
      ? [
          { heading: 'Frame', rows: rowsFrom([
            ['Brand', d.frame?.brand],
            ['Model', d.frame?.model],
            ['Color', d.frame?.color],
            ['SKU', d.frame?.sku],
            ['Eye', d.frame?.eye],
            ['Bridge', d.frame?.bridge],
            ['Temple', d.frame?.temple],
            ['Source', d.frame?.source],
          ]) },
          { heading: 'Lens', rows: rowsFrom([
            ['Design', d.lens?.design],
            ['Material', d.lens?.material],
            ['Coatings', d.lens?.coatings?.length ? d.lens.coatings.join(', ') : undefined],
          ]) },
          { heading: 'Measurements', rows: rowsFrom([
            ['PD OD', mm(d.measurements?.pdOd)],
            ['PD OS', mm(d.measurements?.pdOs)],
            ['Seg height OD', mm(d.measurements?.segHeightOd)],
            ['Seg height OS', mm(d.measurements?.segHeightOs)],
            ['Optical center', mm(d.measurements?.oc)],
            ['Vertex', mm(d.measurements?.vertex)],
            ['Pantoscopic tilt', deg(d.measurements?.pantoTilt)],
            ['Wrap', deg(d.measurements?.wrap)],
          ]) },
        ]
      : [
          { heading: 'Contact lens', rows: rowsFrom([
            ['Brand', d.brand],
            ['OD quantity', d.odQty],
            ['OS quantity', d.osQty],
            ['Supply', d.supplyMonths !== undefined ? `${d.supplyMonths} months` : undefined],
            ['Trial', d.trial === undefined ? undefined : d.trial ? 'Yes' : 'No'],
          ]) },
        ];

    const labRows = rowsFrom([
      ['Lab', order.labName],
      ['Lab reference', order.labReference],
    ]);
    const owedRows = rowsFrom([
      ['Patient owes', money(order.priceTotal)],
      ['Amount paid', money(order.deposit)],
      ['Balance due', money(order.balanceDue)],
    ]);

    return {
      title: `${spectacle ? 'Spectacle' : 'Contact Lens'} Order`,
      practice: {
        name: order.practice.name,
        phone: order.practice.phone,
        address: order.practice.address,
        logoUrl: order.practice.logoUrl ?? null,
      },
      patient: {
        name: `${order.patient.lastName}, ${order.patient.firstName}`,
        mrn: order.patient.mrn,
        dateOfBirth: order.patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      },
      eyeTable:
        order.prescription.type === PrescriptionType.SPECTACLE
          ? spectacleEyeTable(
              (order.prescription.values as { od: SpectacleEye; os: SpectacleEye }).od,
              (order.prescription.values as { od: SpectacleEye; os: SpectacleEye }).os,
            )
          : contactLensEyeTable(
              (order.prescription.values as { od: ContactLensEye; os: ContactLensEye }).od,
              (order.prescription.values as { od: ContactLensEye; os: ContactLensEye }).os,
            ),
      sections: [
        { heading: 'Job / tray', rows: jobRows },
        ...detailSections.filter((s) => s.rows.length > 0),
        ...(labRows.length > 0 ? [{ heading: 'Lab', rows: labRows }] : []),
        ...pricingSections(d),
        ...(owedRows.length > 0 ? [{ heading: 'Balance', rows: owedRows }] : []),
      ],
      remarks: order.warrantyNotes ?? undefined,
    };
  }
}

interface OrderDetails {
  frame?: {
    brand?: string;
    model?: string;
    color?: string;
    sku?: string;
    eye?: string;
    bridge?: string;
    temple?: string;
    source?: string;
  };
  lens?: { design?: string; material?: string; coatings?: string[] };
  measurements?: {
    pdOd?: number;
    pdOs?: number;
    segHeightOd?: number;
    segHeightOs?: number;
    oc?: number;
    vertex?: number;
    pantoTilt?: number;
    wrap?: number;
  };
  odQty?: number;
  osQty?: number;
  brand?: string;
  supplyMonths?: number;
  trial?: boolean;
  trayNumber?: string;
  jobNotes?: string;
  pricing?: {
    frameRetail?: number;
    lensRetail?: number;
    addOnsRetail?: number;
    clMaterialsRetail?: number;
    clFittingRetail?: number;
    examCharge?: number;
    subtotal: number;
    discountPercent?: number;
    coverage?: {
      payerName: string;
      planName?: string;
      memberId?: string;
      frameAllowance?: number;
      framePercentOff?: number;
      lensAllowance?: number;
      lensCopay?: number;
      materialsAllowance?: number;
    };
    planPortion: number;
    patientTotal: number;
  };
}

function amount(value: number | undefined): string | undefined {
  return value === undefined ? undefined : value.toFixed(2);
}

/**
 * The retail lines, the benefits, then what is owed — as separate sections
 * because the renderer lays each section out as one column per row, so a single
 * long section would squeeze every label into a sliver. Benefit terms come from
 * the order's own snapshot, so a reprint shows what was quoted on the day.
 */
function pricingSections(details: OrderDetails): ReportContent['sections'] {
  const p = details.pricing;
  if (!p) return [];
  const coverage = p.coverage;

  const retail = rowsFrom([
    ['Frame', amount(p.frameRetail)],
    ['Lenses', amount(p.lensRetail)],
    ['Add-ons', amount(p.addOnsRetail)],
    ['Materials', amount(p.clMaterialsRetail)],
    ['Fitting fee', amount(p.clFittingRetail)],
    [p.coverage ? 'Exam copay' : 'Exam fee', amount(p.examCharge)],
    ['Subtotal', amount(p.subtotal)],
    ...(p.discountPercent
      ? ([[`Discount (${p.discountPercent}%)`, amount(p.subtotal - p.patientTotal)]] as [string, unknown][])
      : []),
  ]);

  const benefits = coverage
    ? rowsFrom([
        ['Plan', [coverage.payerName, coverage.planName].filter(Boolean).join(' — ')],
        ['Member ID', coverage.memberId],
        ['Frame allow.', amount(coverage.frameAllowance)],
        ['Overage off', coverage.framePercentOff ? `${coverage.framePercentOff}%` : undefined],
        ['Lens allow.', amount(coverage.lensAllowance)],
        ['Lens copay', amount(coverage.lensCopay)],
        ['Materials allow.', amount(coverage.materialsAllowance)],
        ['Plan pays', amount(p.planPortion)],
      ])
    : [];

  return [
    ...(retail.length > 0 ? [{ heading: 'Pricing', rows: retail }] : []),
    ...(benefits.length > 0 ? [{ heading: 'Insurance', rows: benefits }] : []),
  ];
}

/** Drops entries with no value so the paper never prints an empty field. */
function rowsFrom(entries: [string, unknown][]): { label: string; value: string }[] {
  return entries
    .filter(([, value]) => value !== undefined && value !== null && `${value}`.trim() !== '')
    .map(([label, value]) => ({ label, value: `${value}`.trim() }));
}

function mm(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${value} mm`;
}

function deg(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${value}°`;
}

function money(value: Prisma.Decimal | null): string | undefined {
  return value === null ? undefined : value.toFixed(2);
}

/** Formats a diopter value with explicit sign and two decimals, e.g. "-1.25", "+2.00". */
function fmtDiopter(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
}

const SPECTACLE_COLUMNS = ['Sphere', 'Cylinder', 'Axis', 'Add', 'Prism'] as const;
const CONTACT_LENS_COLUMNS = [
  'Brand',
  'Material',
  'Base curve',
  'Diameter',
  'Power',
  'Cylinder',
  'Axis',
  'Add',
] as const;

/** Builds a combined OD/OS grid from spectacle eye values (column union, em dash for gaps). */
function spectacleEyeTable(od: SpectacleEye, os: SpectacleEye): EyeTable {
  const cellsFor = (eye: SpectacleEye): Record<string, string> => {
    const cells: Record<string, string> = { Sphere: fmtDiopter(eye.sphere) };
    if (eye.cylinder !== undefined) cells.Cylinder = fmtDiopter(eye.cylinder);
    if (eye.axis !== undefined) cells.Axis = `${eye.axis}°`;
    if (eye.add !== undefined) cells.Add = fmtDiopter(eye.add);
    if (eye.prism !== undefined) cells.Prism = `${eye.prism}${eye.base ? ` ${eye.base}` : ''}`;
    return cells;
  };
  const odCells = cellsFor(od);
  const osCells = cellsFor(os);
  const present = new Set([...Object.keys(odCells), ...Object.keys(osCells)]);
  const columns = SPECTACLE_COLUMNS.filter((c) => present.has(c));
  return {
    columns: [...columns],
    rows: [
      { eye: 'OD', cells: fillMissing(odCells, columns) },
      { eye: 'OS', cells: fillMissing(osCells, columns) },
    ],
  };
}

/** Builds a combined OD/OS grid from contact-lens eye values. */
function contactLensEyeTable(od: ContactLensEye, os: ContactLensEye): EyeTable {
  const cellsFor = (eye: ContactLensEye): Record<string, string> => {
    const cells: Record<string, string> = {
      Brand: eye.brand,
      'Base curve': eye.baseCurve.toFixed(1),
      Diameter: eye.diameter.toFixed(1),
      Power: fmtDiopter(eye.sphere),
    };
    if (eye.material) cells.Material = eye.material;
    if (eye.cylinder !== undefined) cells.Cylinder = fmtDiopter(eye.cylinder);
    if (eye.axis !== undefined) cells.Axis = `${eye.axis}°`;
    if (eye.add !== undefined) cells.Add = fmtDiopter(eye.add);
    return cells;
  };
  const odCells = cellsFor(od);
  const osCells = cellsFor(os);
  const present = new Set([...Object.keys(odCells), ...Object.keys(osCells)]);
  const columns = CONTACT_LENS_COLUMNS.filter((c) => present.has(c));
  return {
    columns: [...columns],
    rows: [
      { eye: 'OD', cells: fillMissing(odCells, columns) },
      { eye: 'OS', cells: fillMissing(osCells, columns) },
    ],
  };
}

/** Ensures every column has a value (em dash for absent fields). */
function fillMissing(cells: Record<string, string>, columns: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of columns) {
    out[col] = cells[col] ?? '—';
  }
  return out;
}

/** Fixed sample content for admin layout preview (no PHI). */
function samplePrescriptionContent(
  practice: { name: string; phone: string | null; address: string | null; logoUrl: string | null },
  kind: string,
): ReportContent {
  const base = {
    practice: {
      name: practice.name,
      phone: practice.phone,
      address: practice.address,
      logoUrl: practice.logoUrl,
    },
    patient: { name: 'Doe, Jane', mrn: 'MRN-0001', dateOfBirth: '1985-04-12' },
    provider: { name: 'Dr. Sample Provider', licenseNumber: 'OPT-12345', npi: '1234567890' },
    issuedAt: new Date().toISOString().slice(0, 10),
    expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  };
  if (kind === 'contact-lens-rx') {
    return {
      ...base,
      title: 'Contact Lens Prescription (sample)',
      eyeTable: contactLensEyeTable(
        {
          brand: 'Acuvue Oasys',
          baseCurve: 8.4,
          diameter: 14.0,
          sphere: -2.25,
          cylinder: -0.75,
          axis: 180,
        },
        {
          brand: 'Acuvue Oasys',
          baseCurve: 8.4,
          diameter: 14.0,
          sphere: -2.0,
        },
      ),
      sections: [
        {
          heading: 'Wear',
          rows: [
            { label: 'Wear schedule', value: 'Daily wear' },
            { label: 'Replacement', value: 'Biweekly' },
          ],
        },
      ],
      remarks: 'Sample preview — not a real prescription.',
    };
  }
  return {
    ...base,
    title: 'Spectacle Prescription (sample)',
    eyeTable: spectacleEyeTable(
      { sphere: -1.25, cylinder: -0.5, axis: 90, add: 1.5 },
      { sphere: -1.0, cylinder: -0.25, axis: 85, add: 1.5 },
    ),
    sections: [
      {
        heading: 'Measurements',
        rows: [
          { label: 'PD (distance)', value: '63 mm' },
          { label: 'PD (near)', value: '60 mm' },
        ],
      },
    ],
    remarks: 'Sample preview — not a real prescription.',
  };
}
