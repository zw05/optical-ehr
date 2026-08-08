import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

/**
 * Practice-configurable presentation options stored in
 * ReportTemplate.layout (JSONB): header/footer text, field visibility,
 * paper size, typography, and whether to print a signature line.
 */
export interface ReportLayout {
  headerText?: string;
  footerText?: string;
  showLogo?: boolean;
  /** Blob path of an uploaded practice logo (PNG/JPEG) used when showLogo is true. */
  logoBlobPath?: string;
  /** Rendered logo width in points; defaults to 72. */
  logoWidth?: number;
  visibleFields?: string[]; // omit to show all
  signatureLine?: boolean;
  /** Label under the signature line; defaults to "Provider signature". */
  signatureLabel?: string;
  paperSize?: 'LETTER' | 'A4';
  margin?: number;
  baseFontSize?: number;
  fontFamily?: 'Helvetica' | 'Times-Roman' | 'Courier';
  /** Default is table (bordered OD/OS grid). Explicit 'list' keeps legacy label:value lines. */
  valueLayout?: 'list' | 'table';
  showExpiration?: boolean;
  showPrescriberCredentials?: boolean;
  copiesLabel?: string;
  accentColor?: string;
  /** Replaces the generated title (e.g. "Spectacle Prescription (v1)"). */
  titleOverride?: string;
  /** When false, strips the "(vN)" suffix from the generated title. Default true. */
  showVersion?: boolean;
  /** How issued/expires dates are printed. Default ISO (YYYY-MM-DD). */
  dateFormat?: 'ISO' | 'US' | 'LONG';
  /** Optional legal/disclaimer paragraph rendered above the signature line. */
  disclaimerText?: string;
}

/** Combined OD/OS grid for spectacle or contact-lens powers. */
export interface EyeTable {
  /** Column labels in print order, e.g. ['Sphere','Cylinder','Axis','Add','Prism'] */
  columns: string[];
  /** One row per eye; cells keyed by column label. */
  rows: { eye: string; cells: Record<string, string> }[];
}

/** The data a report displays, independent of how the layout styles it. */
export interface ReportContent {
  title: string;
  practice: { name: string; phone?: string | null; address?: string | null; logoUrl?: string | null };
  patient: { name: string; mrn: string; dateOfBirth: string | null };
  provider?: { name: string; licenseNumber?: string | null; npi?: string | null };
  issuedAt?: string;
  expiresAt?: string;
  /** Combined OD/OS prescription grid (preferred). */
  eyeTable?: EyeTable;
  /** Extra sections (Measurements, Wear) and legacy per-eye fallbacks. */
  sections: { heading: string; rows: { label: string; value: string }[] }[];
  remarks?: string;
  /** Resolved logo image bytes (PNG/JPEG); preferred over practice.logoUrl. */
  logoBytes?: Buffer | null;
}

const PAGE_SIZES: Record<'LETTER' | 'A4', { width: number; height: number }> = {
  LETTER: { width: 612, height: 792 },
  A4: { width: 595.28, height: 841.89 },
};

const CELL_PAD = 4;
const EYE_COL_WIDTH = 36;
/** Space reserved at the bottom for signature + footer (points). */
const BOTTOM_BAND = 72;

/** Formats an ISO date string (YYYY-MM-DD) according to the layout preference. */
export function formatReportDate(isoDate: string | null | undefined, format: ReportLayout['dateFormat']): string {
  if (!isoDate) return '';
  if (!format || format === 'ISO') return isoDate;
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (format === 'US') {
    return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}/${y}`;
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Applies titleOverride / showVersion to the content title before rendering. */
export function resolveReportTitle(layout: ReportLayout, contentTitle: string): string {
  if (layout.titleOverride?.trim()) return layout.titleOverride.trim();
  if (layout.showVersion === false) {
    return contentTitle.replace(/\s*\(v\d+\)\s*$/i, '').trim();
  }
  return contentTitle;
}

/** Counts PDF page objects in a rendered buffer (for tests). */
export function countPdfPages(pdf: Buffer): number {
  const text = pdf.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page(?!s)\b/g);
  return matches?.length ?? 0;
}

type Doc = PDFKit.PDFDocument;

/** Turns layout + content into a PDF using pdfkit. */
@Injectable()
export class PdfRenderer {
  /**
   * Renders one report: practice header, title, patient/provider block,
   * bordered OD/OS table (or list fallback), optional remarks, signature,
   * and footer. Always a single page.
   */
  render(layout: ReportLayout, content: ReportContent): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const paperSize = layout.paperSize === 'A4' ? 'A4' : 'LETTER';
      const margin = typeof layout.margin === 'number' && layout.margin > 0 ? layout.margin : 54;
      const page = PAGE_SIZES[paperSize];
      const baseFont = Math.max(8, Math.min(14, layout.baseFontSize ?? 10));
      const family = layout.fontFamily ?? 'Helvetica';
      const regular = family === 'Times-Roman' ? 'Times-Roman' : family === 'Courier' ? 'Courier' : 'Helvetica';
      const bold =
        family === 'Times-Roman' ? 'Times-Bold' : family === 'Courier' ? 'Courier-Bold' : 'Helvetica-Bold';

      const doc = new PDFDocument({ size: paperSize, margin });
      // Raise pdfkit's maxY to the paper edge so footer/signature never auto-paginate.
      doc.page.margins.bottom = 0;

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const contentWidth = page.width - margin * 2;
      const rightEdge = page.width - margin;
      const accent = layout.accentColor || '#0d5c8c';
      const title = resolveReportTitle(layout, content.title);
      const issuedAt = formatReportDate(content.issuedAt, layout.dateFormat);
      const expiresAt = formatReportDate(content.expiresAt, layout.dateFormat);
      const patientDob = formatReportDate(content.patient.dateOfBirth, layout.dateFormat);
      const useTable = layout.valueLayout !== 'list';
      const visible = layout.visibleFields ? new Set(layout.visibleFields) : null;
      const contentBottom = page.height - margin - BOTTOM_BAND;

      if (layout.copiesLabel) {
        doc.fontSize(baseFont - 1).font(regular).fillColor(accent).text(layout.copiesLabel, {
          align: 'right',
        });
        doc.fillColor('#000000');
      }

      // Header: optional logo image, then practice identity
      if (layout.showLogo && content.logoBytes && content.logoBytes.length > 0) {
        try {
          const logoW = Math.max(24, Math.min(180, layout.logoWidth ?? 72));
          const startY = doc.y;
          doc.image(content.logoBytes, margin, startY, { width: logoW });
          doc.y = startY;
          doc.x = margin + logoW + 12;
          const textWidth = contentWidth - logoW - 12;
          doc.fontSize(baseFont + 6).font(bold).text(content.practice.name, { width: textWidth });
          doc.fontSize(baseFont - 1).font(regular);
          if (content.practice.address) doc.text(content.practice.address, { width: textWidth });
          if (content.practice.phone) doc.text(content.practice.phone, { width: textWidth });
          doc.x = margin;
          const afterLogoY = startY + logoW * 0.6;
          if (doc.y < afterLogoY) doc.y = afterLogoY;
        } catch {
          doc.fontSize(baseFont + 6).font(bold).text(content.practice.name);
          doc.fontSize(baseFont - 1).font(regular);
          if (content.practice.address) doc.text(content.practice.address);
          if (content.practice.phone) doc.text(content.practice.phone);
        }
      } else {
        doc.fontSize(baseFont + 6).font(bold).text(content.practice.name);
        doc.fontSize(baseFont - 1).font(regular);
        if (content.practice.address) doc.text(content.practice.address);
        if (content.practice.phone) doc.text(content.practice.phone);
      }

      if (layout.headerText) doc.moveDown(0.3).text(layout.headerText);
      doc.moveDown(0.5);
      doc
        .strokeColor(accent)
        .moveTo(margin, doc.y)
        .lineTo(rightEdge, doc.y)
        .stroke()
        .strokeColor('#000000');
      doc.moveDown(0.5);

      doc.fontSize(baseFont + 4).font(bold).text(title, { align: 'center' });
      doc.moveDown(0.5);

      // Patient / provider block
      doc.fontSize(baseFont).font(regular);
      const dobLabel = patientDob || content.patient.dateOfBirth || '—';
      doc.text(`Patient: ${content.patient.name}   MRN: ${content.patient.mrn}   DOB: ${dobLabel}`);
      if (content.provider) {
        const showCreds = layout.showPrescriberCredentials !== false;
        const credentials = showCreds
          ? [
              content.provider.licenseNumber ? `License ${content.provider.licenseNumber}` : null,
              content.provider.npi ? `NPI ${content.provider.npi}` : null,
            ]
              .filter(Boolean)
              .join(', ')
          : '';
        doc.text(`Provider: ${content.provider.name}${credentials ? ` (${credentials})` : ''}`);
      }
      if (issuedAt) doc.text(`Issued: ${issuedAt}`);
      if (layout.showExpiration !== false && expiresAt) {
        doc.text(`Expires: ${expiresAt}`);
      }
      doc.moveDown(0.8);

      // OD/OS eye table or flattened list
      if (content.eyeTable && content.eyeTable.rows.length > 0) {
        const columns = visible
          ? content.eyeTable.columns.filter((c) => visible.has(c))
          : content.eyeTable.columns;
        if (columns.length > 0) {
          if (useTable) {
            if (doc.y < contentBottom) {
              this.drawEyeTable(doc, {
                margin,
                contentWidth,
                baseFont,
                regular,
                bold,
                accent,
                columns,
                rows: content.eyeTable.rows,
                maxY: contentBottom,
              });
              doc.moveDown(0.6);
            }
          } else {
            this.drawEyeTableAsList(doc, {
              baseFont,
              regular,
              bold,
              columns,
              rows: content.eyeTable.rows,
            });
            doc.moveDown(0.6);
          }
        }
      }

      // Extra sections (Measurements, Wear) — and legacy per-eye sections when no eyeTable
      for (const section of content.sections) {
        if (doc.y >= contentBottom) break;
        const rows = visible ? section.rows.filter((r) => visible.has(r.label)) : section.rows;
        if (rows.length === 0) continue;
        doc.fontSize(baseFont + 1).font(bold).text(section.heading);
        doc.moveDown(0.2);
        doc.fontSize(baseFont).font(regular);

        if (useTable) {
          this.drawKeyValueTable(doc, {
            margin,
            contentWidth,
            baseFont,
            regular,
            bold,
            accent,
            rows,
            maxY: contentBottom,
          });
        } else {
          for (const row of rows) {
            if (doc.y >= contentBottom) break;
            doc.text(`${row.label}: ${row.value}`);
          }
        }
        doc.moveDown(0.6);
      }

      // Remarks — truncated to remaining space above the bottom band
      if (content.remarks && doc.y < contentBottom) {
        doc.fontSize(baseFont + 1).font(bold).text('Remarks');
        doc.moveDown(0.15);
        const remaining = Math.max(baseFont * 2, contentBottom - doc.y - 8);
        doc.fontSize(baseFont).font(regular).text(content.remarks, {
          width: contentWidth,
          height: remaining,
          ellipsis: true,
        });
        doc.moveDown(0.4);
      }

      // Disclaimer — same truncation rule
      if (layout.disclaimerText?.trim() && doc.y < contentBottom) {
        const remaining = Math.max(baseFont * 2, contentBottom - doc.y - 4);
        doc.fontSize(baseFont - 1).font(regular).text(layout.disclaimerText.trim(), {
          width: contentWidth,
          height: remaining,
          ellipsis: true,
        });
      }

      // Signature pinned into the reserved bottom band
      if (layout.signatureLine !== false) {
        const sigY = page.height - margin - BOTTOM_BAND + 16;
        doc.moveTo(margin, sigY).lineTo(margin + 226, sigY).stroke();
        const sigLabel = layout.signatureLabel?.trim() || 'Provider signature';
        doc.fontSize(baseFont - 1).font(regular).text(sigLabel, margin, sigY + 4);
      }

      // Footer inside the bottom margin, never past the paper edge
      if (layout.footerText) {
        const footerY = page.height - margin + 4;
        doc
          .fontSize(baseFont - 2)
          .font(regular)
          .text(layout.footerText, margin, footerY, {
            width: contentWidth,
            align: 'center',
            lineBreak: false,
            height: margin - 8,
            ellipsis: true,
          });
      }

      doc.end();
    });
  }

  /**
   * Draws a bordered OD/OS grid: eye label column + one column per Rx field,
   * shaded header, measured row heights, full cell borders.
   */
  private drawEyeTable(
    doc: Doc,
    opts: {
      margin: number;
      contentWidth: number;
      baseFont: number;
      regular: string;
      bold: string;
      accent: string;
      columns: string[];
      rows: { eye: string; cells: Record<string, string> }[];
      maxY: number;
    },
  ) {
    const { margin, contentWidth, baseFont, regular, bold, accent, columns, rows, maxY } = opts;
    const colCount = columns.length;
    const dataWidth = contentWidth - EYE_COL_WIDTH;
    const colW = dataWidth / Math.max(colCount, 1);
    const widths = [EYE_COL_WIDTH, ...columns.map(() => colW)];

    const headerCells = ['', ...columns];
    const bodyRows = rows.map((r) => [r.eye, ...columns.map((c) => r.cells[c] ?? '—')]);

    this.strokeGrid(doc, {
      margin,
      widths,
      baseFont,
      regular,
      bold,
      accent,
      headerCells,
      bodyRows,
      maxY,
    });
  }

  /** Legacy list layout: one heading per eye with label: value lines. */
  private drawEyeTableAsList(
    doc: Doc,
    opts: {
      baseFont: number;
      regular: string;
      bold: string;
      columns: string[];
      rows: { eye: string; cells: Record<string, string> }[];
    },
  ) {
    const { baseFont, regular, bold, columns, rows } = opts;
    for (const row of rows) {
      const heading = row.eye === 'OD' ? 'Right eye (OD)' : row.eye === 'OS' ? 'Left eye (OS)' : row.eye;
      doc.fontSize(baseFont + 1).font(bold).text(heading);
      doc.moveDown(0.15);
      doc.fontSize(baseFont).font(regular);
      for (const col of columns) {
        const value = row.cells[col];
        if (value !== undefined && value !== '') {
          doc.text(`${col}: ${value}`);
        }
      }
      doc.moveDown(0.4);
    }
  }

  /**
   * Compact bordered box for Measurements / Wear: header row of labels,
   * one row of values underneath.
   */
  private drawKeyValueTable(
    doc: Doc,
    opts: {
      margin: number;
      contentWidth: number;
      baseFont: number;
      regular: string;
      bold: string;
      accent: string;
      rows: { label: string; value: string }[];
      maxY: number;
    },
  ) {
    const { margin, contentWidth, baseFont, regular, bold, accent, rows, maxY } = opts;
    if (rows.length === 0) return;
    const colW = contentWidth / rows.length;
    const widths = rows.map(() => colW);
    this.strokeGrid(doc, {
      margin,
      widths,
      baseFont,
      regular,
      bold,
      accent,
      headerCells: rows.map((r) => r.label),
      bodyRows: [rows.map((r) => r.value)],
      maxY,
    });
  }

  /**
   * Shared grid painter: measures each row, paints a shaded header, then
   * strokes the outer rectangle plus vertical and horizontal rules.
   */
  private strokeGrid(
    doc: Doc,
    opts: {
      margin: number;
      widths: number[];
      baseFont: number;
      regular: string;
      bold: string;
      accent: string;
      headerCells: string[];
      bodyRows: string[][];
      maxY: number;
    },
  ) {
    const { margin, widths, baseFont, regular, bold, accent, headerCells, bodyRows, maxY } = opts;
    const textW = (i: number) => Math.max(8, widths[i] - CELL_PAD * 2);

    const measureRow = (cells: string[], font: string) => {
      doc.font(font).fontSize(baseFont);
      let h = baseFont + CELL_PAD * 2;
      for (let i = 0; i < cells.length; i++) {
        const cellH = doc.heightOfString(cells[i] || ' ', { width: textW(i) }) + CELL_PAD * 2;
        if (cellH > h) h = cellH;
      }
      return Math.max(h, baseFont + CELL_PAD * 2);
    };

    const headerH = measureRow(headerCells, bold);
    const bodyHeights = bodyRows.map((r) => measureRow(r, regular));
    let totalH = headerH + bodyHeights.reduce((a, b) => a + b, 0);

    // Drop body rows that would cross the content bottom (defensive).
    while (bodyHeights.length > 0 && doc.y + totalH > maxY) {
      bodyHeights.pop();
      bodyRows.pop();
      totalH = headerH + bodyHeights.reduce((a, b) => a + b, 0);
    }
    if (doc.y + headerH > maxY) return;

    const startY = doc.y;
    const tableW = widths.reduce((a, b) => a + b, 0);
    const allHeights = [headerH, ...bodyHeights];
    const allRows = [headerCells, ...bodyRows];

    // Shaded header background
    doc.save();
    doc.fillColor('#f0f4f8').rect(margin, startY, tableW, headerH).fill();
    doc.restore();

    // Cell text
    let y = startY;
    for (let r = 0; r < allRows.length; r++) {
      const row = allRows[r];
      const rowH = allHeights[r];
      let x = margin;
      const font = r === 0 ? bold : regular;
      doc.font(font).fontSize(baseFont).fillColor('#000000');
      for (let c = 0; c < row.length; c++) {
        doc.text(row[c] || '—', x + CELL_PAD, y + CELL_PAD, {
          width: textW(c),
          height: rowH - CELL_PAD * 2,
          ellipsis: true,
          align: c === 0 && r > 0 && headerCells[0] === '' ? 'center' : 'left',
        });
        x += widths[c];
      }
      y += rowH;
    }

    // Grid lines
    doc.save();
    doc.strokeColor(accent).lineWidth(0.75);
    doc.rect(margin, startY, tableW, totalH).stroke();

    // Vertical rules
    let vx = margin;
    for (let c = 0; c < widths.length - 1; c++) {
      vx += widths[c];
      doc.moveTo(vx, startY).lineTo(vx, startY + totalH).stroke();
    }

    // Horizontal rules
    let hy = startY;
    for (let r = 0; r < allHeights.length - 1; r++) {
      hy += allHeights[r];
      doc.moveTo(margin, hy).lineTo(margin + tableW, hy).stroke();
    }
    doc.restore();
    doc.strokeColor('#000000').lineWidth(1);

    doc.y = startY + totalH + 4;
    doc.x = margin;
  }
}
