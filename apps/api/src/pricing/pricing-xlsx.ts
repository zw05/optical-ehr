import { LensDesign, OpticalAddOnKind } from '@prisma/client';
import ExcelJS from 'exceljs';
import { quarterSteps, roundQuarter } from './optical-powers';
import {
  collapseGridToRanges,
  describeRange,
  type PriceCell,
  type PriceRange,
} from './price-ranges';

export interface ParsedLensSheet {
  name: string;
  design: LensDesign;
  material: string;
  index: number | null;
  ranges: PriceRange[];
  /** How the sheet was written, surfaced in the import preview. */
  source: 'bands' | 'grid';
  /** Rows read from the sheet, before grid collapsing. */
  cellCount: number;
  errors: string[];
  /** Non-fatal notes worth showing before the user commits the import. */
  warnings: string[];
}

export interface ParsedCoating {
  name: string;
  kind: OpticalAddOnKind;
  price: number;
}

export interface ParsedWorkbook {
  lists: ParsedLensSheet[];
  coatings: ParsedCoating[];
  coatingErrors: string[];
}

const DESIGNS = new Set(Object.values(LensDesign));
const KINDS = new Set(Object.values(OpticalAddOnKind));

const BAND_HEADERS = ['Label', 'Sphere from', 'Sphere to', 'Cylinder from', 'Cylinder to', 'Price'];

/** Caps how many cell-level complaints one sheet contributes to the preview. */
const MAX_SHEET_ERRORS = 20;

function asNumber(value: ExcelJS.CellValue): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && 'result' in value && typeof value.result === 'number') {
    return value.result;
  }
  const n = Number(String(value).replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function asText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text.trim();
  }
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '').trim();
  return String(value).trim();
}

function parseKind(raw: string): OpticalAddOnKind {
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (KINDS.has(key as OpticalAddOnKind)) return key as OpticalAddOnKind;
  return OpticalAddOnKind.OTHER;
}

function parseDesign(raw: string | undefined): LensDesign {
  if (!raw) return LensDesign.SV;
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (key === 'SINGLE_VISION' || key === 'SINGLEVISION') return LensDesign.SV;
  if (key === 'PROGRESSIVE') return LensDesign.PAL;
  if (DESIGNS.has(key as LensDesign)) return key as LensDesign;
  return LensDesign.OTHER;
}

/** Reads the optional Design/Material/Index preamble above a sheet's table. */
function readHeader(sheet: ExcelJS.Worksheet): {
  design: LensDesign;
  material: string;
  index: number | null;
  tableRow: number;
} {
  let design: LensDesign = LensDesign.SV;
  let material = 'Unspecified';
  let index: number | null = null;
  let tableRow = 1;

  for (let r = 1; r <= 8; r++) {
    const label = asText(sheet.getRow(r).getCell(1).value).toLowerCase();
    if (!label) continue;
    if (label === 'design') design = parseDesign(asText(sheet.getRow(r).getCell(2).value));
    else if (label === 'material') material = asText(sheet.getRow(r).getCell(2).value) || material;
    else if (label === 'index') index = asNumber(sheet.getRow(r).getCell(2).value);
    else {
      tableRow = r;
      break;
    }
  }
  return { design, material, index, tableRow };
}

/** A band sheet leads its table with a "Label" column; a grid leads with "Sphere". */
function isBandTable(sheet: ExcelJS.Worksheet, tableRow: number): boolean {
  const first = asText(sheet.getRow(tableRow).getCell(1).value).toLowerCase();
  return first === 'label' || first === 'band';
}

function parseBandTable(
  sheet: ExcelJS.Worksheet,
  tableRow: number,
): { ranges: PriceRange[]; errors: string[] } {
  const ranges: PriceRange[] = [];
  const errors: string[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= tableRow) return;
    const label = asText(row.getCell(1).value);
    const sphA = asNumber(row.getCell(2).value);
    const sphB = asNumber(row.getCell(3).value);
    const cylA = asNumber(row.getCell(4).value);
    const cylB = asNumber(row.getCell(5).value);
    const price = asNumber(row.getCell(6).value);
    if (sphA == null && sphB == null && cylA == null && cylB == null && price == null) return;
    if (sphA == null || sphB == null || cylA == null || cylB == null) {
      errors.push(`${sheet.name} row ${rowNumber}: incomplete power range`);
      return;
    }
    if (price == null) {
      errors.push(`${sheet.name} row ${rowNumber}: missing price`);
      return;
    }
    const cylMin = roundQuarter(Math.min(cylA, cylB));
    const cylMax = roundQuarter(Math.max(cylA, cylB));
    if (cylMax > 0) {
      errors.push(`${sheet.name} row ${rowNumber}: cylinder must be minus-cyl (zero or negative)`);
      return;
    }
    ranges.push({
      label: label || null,
      sphMin: roundQuarter(Math.min(sphA, sphB)),
      sphMax: roundQuarter(Math.max(sphA, sphB)),
      cylMin,
      cylMax,
      price: Math.round(price * 100) / 100,
      sortOrder: ranges.length,
    });
  });
  return { ranges, errors };
}

/**
 * Reports powers a grid skips over. A sheet that lists 0.00, -0.50, -1.00 says
 * nothing about -0.25, and importing it leaves that power unpriced — which the
 * dispensary only discovers when a patient with that Rx is standing there. The
 * gap is real either way; naming it before the import is the useful part.
 */
function findAxisGaps(values: number[], axis: string): string[] {
  const unique = [...new Set(values)].sort((a, b) => a - b);
  if (unique.length < 2) return [];
  const missing: number[] = [];
  for (let i = 1; i < unique.length; i++) {
    const steps = Math.round((unique[i] - unique[i - 1]) / 0.25);
    for (let step = 1; step < steps; step++) {
      missing.push(roundQuarter(unique[i - 1] + step * 0.25));
    }
  }
  if (!missing.length) return [];
  const shown = missing.slice(0, 4).map((v) => v.toFixed(2)).join(', ');
  return [
    `${axis} skips ${missing.length} quarter-dioptre ${
      missing.length === 1 ? 'step' : 'steps'
    } (${shown}${missing.length > 4 ? ', …' : ''}); those powers will be left unpriced.`,
  ];
}

function parseGridTable(
  sheet: ExcelJS.Worksheet,
  tableRow: number,
): { cells: PriceCell[]; errors: string[]; warnings: string[] } {
  const cylinders: { col: number; cyl: number }[] = [];
  sheet.getRow(tableRow).eachCell((cell, colNumber) => {
    if (colNumber === 1) return;
    const cyl = asNumber(cell.value);
    if (cyl == null) return;
    cylinders.push({ col: colNumber, cyl: roundQuarter(cyl) });
  });

  const cells: PriceCell[] = [];
  const errors: string[] = [];
  const complain = (message: string) => {
    if (errors.length < MAX_SHEET_ERRORS) errors.push(message);
  };

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= tableRow) return;
    const sph = asNumber(row.getCell(1).value);
    if (sph == null) return;
    const sphere = roundQuarter(sph);
    for (const { col, cyl } of cylinders) {
      const raw = row.getCell(col).value;
      if (raw == null || raw === '') continue;
      if (cyl > 0) {
        complain(`${sheet.name}!${row.getCell(col).address}: cylinder must be minus-cyl`);
        continue;
      }
      const price = asNumber(raw);
      if (price == null) {
        complain(`${sheet.name}!${row.getCell(col).address}: not a number`);
        continue;
      }
      cells.push({ sphere, cylinder: cyl, price: Math.round(price * 100) / 100 });
    }
  });

  const warnings = [
    ...findAxisGaps(
      cells.map((c) => c.sphere),
      'Sphere',
    ),
    ...findAxisGaps(
      cylinders.map((c) => c.cyl),
      'Cylinder',
    ),
  ];
  return { cells, errors, warnings };
}

/**
 * Reads a lens price workbook. Each sheet is one price list, written either as
 * power bands or as a full SPH x CYL grid — grids are what labs send, so they
 * are accepted unchanged and collapsed into bands on the way in. A sheet named
 * "Coatings" or "Add-ons" holds add-on pricing instead of lens powers.
 */
export async function parsePriceWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const lists: ParsedLensSheet[] = [];
  const coatings: ParsedCoating[] = [];
  const coatingErrors: string[] = [];

  for (const sheet of wb.worksheets) {
    const name = sheet.name.trim();
    if (/^(coatings?|add[\s-]?ons?)$/i.test(name)) {
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const addOnName = asText(row.getCell(1).value);
        if (!addOnName) return;
        const kind = parseKind(asText(row.getCell(2).value) || 'OTHER');
        const price = asNumber(row.getCell(3).value);
        if (price == null) {
          coatingErrors.push(`${name} row ${rowNumber}: missing price`);
          return;
        }
        coatings.push({ name: addOnName, kind, price: Math.round(price * 100) / 100 });
      });
      continue;
    }

    const { design, material, index, tableRow } = readHeader(sheet);
    if (isBandTable(sheet, tableRow)) {
      const { ranges, errors } = parseBandTable(sheet, tableRow);
      lists.push({
        name,
        design,
        material,
        index,
        ranges,
        source: 'bands',
        cellCount: ranges.length,
        errors,
        warnings: [],
      });
    } else {
      const { cells, errors, warnings } = parseGridTable(sheet, tableRow);
      lists.push({
        name,
        design,
        material,
        index,
        ranges: collapseGridToRanges(cells),
        source: 'grid',
        cellCount: cells.length,
        errors,
        warnings,
      });
    }
  }

  return { lists, coatings, coatingErrors };
}

function writeBandSheet(
  sheet: ExcelJS.Worksheet,
  meta: { design: string; material: string; index: number | null },
  ranges: PriceRange[],
) {
  sheet.getCell('A1').value = 'Design';
  sheet.getCell('B1').value = meta.design;
  sheet.getCell('A2').value = 'Material';
  sheet.getCell('B2').value = meta.material;
  sheet.getCell('A3').value = 'Index';
  sheet.getCell('B3').value = meta.index;
  const header = sheet.getRow(5);
  BAND_HEADERS.forEach((title, i) => {
    header.getCell(i + 1).value = title;
  });
  header.font = { bold: true };
  ranges.forEach((range, i) => {
    const row = sheet.getRow(6 + i);
    row.getCell(1).value = range.label ?? describeRange(range);
    row.getCell(2).value = range.sphMax;
    row.getCell(3).value = range.sphMin;
    row.getCell(4).value = range.cylMax;
    row.getCell(5).value = range.cylMin;
    row.getCell(6).value = range.price;
  });
  sheet.getColumn(1).width = 34;
  for (let c = 2; c <= 6; c++) sheet.getColumn(c).width = 14;
}

/**
 * A starter workbook showing both accepted layouts: a band sheet to fill in by
 * hand, and a grid sheet in the shape a lab price list usually arrives in.
 */
export async function buildPriceTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Optical EHR';

  writeBandSheet(
    wb.addWorksheet('Poly SV'),
    { design: 'SV', material: 'Polycarbonate', index: 1.59 },
    [
      { label: 'Standard powers', sphMin: -6, sphMax: 4, cylMin: -2, cylMax: 0, price: 89 },
      { label: 'High cylinder', sphMin: -6, sphMax: 4, cylMin: -4, cylMax: -2.25, price: 119 },
      { label: 'High sphere', sphMin: -12, sphMax: -6.25, cylMin: -4, cylMax: 0, price: 149 },
    ],
  );

  // The grid example is written in full quarter-dioptre steps, the way a lab
  // sheet arrives. A grid that skipped steps would import with unpriced holes
  // between the listed powers, so the shipped example must not teach that shape.
  const gridSheet = wb.addWorksheet('CR39 SV (grid example)');
  gridSheet.getCell('A1').value = 'Design';
  gridSheet.getCell('B1').value = 'SV';
  gridSheet.getCell('A2').value = 'Material';
  gridSheet.getCell('B2').value = 'CR-39';
  gridSheet.getCell('A3').value = 'Index';
  gridSheet.getCell('B3').value = 1.5;
  const cyls = quarterSteps(-2, 0).reverse();
  const sphs = quarterSteps(-4, 2).reverse();
  gridSheet.getCell('A5').value = 'Sphere';
  cyls.forEach((cyl, i) => {
    gridSheet.getCell(5, i + 2).value = cyl;
  });
  gridSheet.getRow(5).font = { bold: true };
  sphs.forEach((sph, r) => {
    gridSheet.getCell(6 + r, 1).value = sph;
    cyls.forEach((cyl, i) => {
      gridSheet.getCell(6 + r, i + 2).value = Math.abs(sph) > 2 || cyl < -1 ? 119 : 79;
    });
  });

  const coatings = wb.addWorksheet('Coatings');
  coatings.addRow(['Name', 'Kind', 'Price']).font = { bold: true };
  coatings.addRow(['Premium AR', 'AR', 79]);
  coatings.addRow(['Transitions', 'PHOTOCHROMIC', 95]);
  coatings.addRow(['Polarized', 'POLARIZED', 99]);
  coatings.addRow(['Blue light filter', 'BLUE_LIGHT', 45]);
  coatings.getColumn(1).width = 24;
  coatings.getColumn(2).width = 18;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Excel rejects these characters in a sheet name, and caps names at 31 chars. */
const ILLEGAL_SHEET_CHARS = /[\\/*?:\[\]]/g;

/** Exports current price lists and add-ons in the same shape import accepts. */
export async function buildPriceExport(
  lists: {
    name: string;
    design: string;
    material: string;
    index: number | null;
    ranges: PriceRange[];
  }[],
  addOns: { name: string; kind: string; price: number }[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Optical EHR';
  const used = new Set<string>();

  for (const list of lists) {
    let name = (list.name || 'List').replace(ILLEGAL_SHEET_CHARS, ' ').slice(0, 31).trim() || 'List';
    let suffix = 2;
    while (used.has(name.toLowerCase())) {
      name = `${name.slice(0, 28)} ${suffix++}`;
    }
    used.add(name.toLowerCase());
    writeBandSheet(wb.addWorksheet(name), list, list.ranges);
  }
  if (!lists.length) wb.addWorksheet('No price lists');

  const coatings = wb.addWorksheet('Coatings');
  coatings.addRow(['Name', 'Kind', 'Price']).font = { bold: true };
  for (const addOn of addOns) coatings.addRow([addOn.name, addOn.kind, addOn.price]);
  coatings.getColumn(1).width = 24;
  coatings.getColumn(2).width = 18;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------- Frames ----------

/** A starter workbook for the frame catalog, one row per SKU. */
export async function buildFramesTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Frames');
  sheet.addRow([
    'SKU',
    'Brand',
    'Model',
    'Color',
    'Size',
    'Eye',
    'Bridge',
    'Temple',
    'Cost',
    'Retail',
    'Quantity',
    'Material',
    'UPC',
  ]).font = { bold: true };
  sheet.addRow([
    'RAY-2140-52',
    'Ray-Ban',
    '2140',
    'Tortoise',
    '52-18-140',
    '52',
    '18',
    '140',
    45,
    129,
    4,
    'Acetate',
    '',
  ]);
  sheet.getColumn(1).width = 18;
  sheet.getColumn(2).width = 16;
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export interface ParsedFrameRow {
  sku: string;
  brand?: string;
  model?: string;
  color?: string;
  size?: string;
  eye?: string;
  bridge?: string;
  temple?: string;
  cost?: number;
  retail?: number;
  quantity?: number;
  material?: string;
  upc?: string;
}

/**
 * Reads a frame catalog workbook from its first sheet. Rows without a SKU are
 * skipped rather than rejected, since vendor sheets often carry blank spacer
 * rows between brands.
 */
export async function parseFramesWorkbook(
  buffer: Buffer,
): Promise<{ rows: ParsedFrameRow[]; errors: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  const rows: ParsedFrameRow[] = [];
  const errors: string[] = [];
  if (!sheet) return { rows, errors: ['Workbook has no sheets'] };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const sku = asText(row.getCell(1).value);
    if (!sku) return;
    rows.push({
      sku,
      brand: asText(row.getCell(2).value) || undefined,
      model: asText(row.getCell(3).value) || undefined,
      color: asText(row.getCell(4).value) || undefined,
      size: asText(row.getCell(5).value) || undefined,
      eye: asText(row.getCell(6).value) || undefined,
      bridge: asText(row.getCell(7).value) || undefined,
      temple: asText(row.getCell(8).value) || undefined,
      cost: asNumber(row.getCell(9).value) ?? undefined,
      retail: asNumber(row.getCell(10).value) ?? undefined,
      quantity: asNumber(row.getCell(11).value) ?? undefined,
      material: asText(row.getCell(12).value) || undefined,
      upc: asText(row.getCell(13).value) || undefined,
    });
  });
  return { rows, errors };
}
