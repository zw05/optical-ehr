import {
  PdfRenderer,
  ReportContent,
  ReportLayout,
  formatReportDate,
  resolveReportTitle,
  countPdfPages,
} from './pdf-renderer';

const sampleContent: ReportContent = {
  title: 'Spectacle Prescription (v1)',
  practice: { name: 'Test Practice', phone: '555-0100', address: '1 Main St', logoUrl: 'https://example.com/logo.png' },
  patient: { name: 'Doe, Jane', mrn: 'MRN-1', dateOfBirth: '1985-04-12' },
  provider: { name: 'Dr. Sample', licenseNumber: 'OPT-1', npi: '123' },
  issuedAt: '2026-07-28',
  expiresAt: '2027-07-28',
  eyeTable: {
    columns: ['Sphere', 'Cylinder', 'Axis', 'Add'],
    rows: [
      { eye: 'OD', cells: { Sphere: '-1.25', Cylinder: '-0.50', Axis: '90°', Add: '+1.50' } },
      { eye: 'OS', cells: { Sphere: '-1.00', Cylinder: '-0.25', Axis: '85°', Add: '+1.50' } },
    ],
  },
  sections: [
    {
      heading: 'Measurements',
      rows: [
        { label: 'PD (distance)', value: '63 mm' },
        { label: 'PD (near)', value: '60 mm' },
      ],
    },
  ],
  remarks: 'Test remarks',
};

/** Minimal 1x1 PNG (transparent pixel). */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('formatReportDate', () => {
  it('returns ISO by default', () => {
    expect(formatReportDate('2026-07-28', undefined)).toBe('2026-07-28');
    expect(formatReportDate('2026-07-28', 'ISO')).toBe('2026-07-28');
  });

  it('formats US and LONG dates', () => {
    expect(formatReportDate('2026-07-28', 'US')).toBe('07/28/2026');
    expect(formatReportDate('2026-07-28', 'LONG')).toBe('July 28, 2026');
  });

  it('returns empty string for missing dates', () => {
    expect(formatReportDate(undefined, 'US')).toBe('');
  });
});

describe('resolveReportTitle', () => {
  it('uses titleOverride when set', () => {
    expect(resolveReportTitle({ titleOverride: 'Custom Rx' }, 'Spectacle Prescription (v1)')).toBe('Custom Rx');
  });

  it('strips version when showVersion is false', () => {
    expect(resolveReportTitle({ showVersion: false }, 'Spectacle Prescription (v1)')).toBe('Spectacle Prescription');
  });

  it('keeps the original title by default', () => {
    expect(resolveReportTitle({}, 'Spectacle Prescription (v1)')).toBe('Spectacle Prescription (v1)');
  });
});

describe('PdfRenderer', () => {
  const renderer = new PdfRenderer();

  it('renders a LETTER PDF buffer', async () => {
    const layout: ReportLayout = { paperSize: 'LETTER', signatureLine: true };
    const pdf = await renderer.render(layout, sampleContent);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('honors A4 paper size and filters visible fields', async () => {
    const layout: ReportLayout = {
      paperSize: 'A4',
      margin: 48,
      baseFontSize: 11,
      fontFamily: 'Times-Roman',
      valueLayout: 'table',
      visibleFields: ['Sphere'],
      showExpiration: false,
      showPrescriberCredentials: false,
      copiesLabel: 'Patient copy',
      accentColor: '#112233',
      showLogo: true,
      footerText: 'Footer',
    };
    const pdf = await renderer.render(layout, sampleContent);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(500);
  });

  it('applies date format, disclaimer, and signature label', async () => {
    const layout: ReportLayout = {
      dateFormat: 'US',
      disclaimerText: 'This prescription is valid only when signed.',
      signatureLabel: 'Doctor signature',
      titleOverride: 'Eyeglass Rx',
      showVersion: false,
    };
    const pdf = await renderer.render(layout, sampleContent);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(500);
  });

  it('renders with a logo buffer when showLogo is true', async () => {
    const layout: ReportLayout = { showLogo: true, logoWidth: 48 };
    const pdf = await renderer.render(layout, { ...sampleContent, logoBytes: TINY_PNG });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(500);
  });

  it('survives a corrupt logo buffer without throwing', async () => {
    const layout: ReportLayout = { showLogo: true };
    const pdf = await renderer.render(layout, {
      ...sampleContent,
      logoBytes: Buffer.from('not-an-image'),
    });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('renders exactly one page when a footer is present', async () => {
    const layout: ReportLayout = {
      paperSize: 'LETTER',
      footerText: 'Optical EHR — confidential health record',
      signatureLine: true,
      valueLayout: 'table',
    };
    const pdf = await renderer.render(layout, sampleContent);
    expect(countPdfPages(pdf)).toBe(1);
  });

  it('stays on one page even with overlong remarks', async () => {
    const layout: ReportLayout = {
      paperSize: 'LETTER',
      footerText: 'Confidential',
      signatureLine: true,
      valueLayout: 'table',
      disclaimerText: 'A'.repeat(400),
    };
    const pdf = await renderer.render(layout, {
      ...sampleContent,
      remarks: 'Long clinical notes. '.repeat(80),
    });
    expect(countPdfPages(pdf)).toBe(1);
  });

  it('renders the bordered OD/OS grid in table mode', async () => {
    const layout: ReportLayout = { valueLayout: 'table', paperSize: 'LETTER' };
    const pdf = await renderer.render(layout, sampleContent);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(countPdfPages(pdf)).toBe(1);
    expect(pdf.length).toBeGreaterThan(800);
  });

  it('supports list mode flattening of eyeTable', async () => {
    const layout: ReportLayout = { valueLayout: 'list', footerText: 'Footer' };
    const pdf = await renderer.render(layout, sampleContent);
    expect(countPdfPages(pdf)).toBe(1);
  });
});
