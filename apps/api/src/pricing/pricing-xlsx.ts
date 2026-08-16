import { LensDesign, OpticalAddOnKind } from '@prisma/client';
import ExcelJS from 'exceljs';

export interface ParsedCell {
  sphere: number;
  cylinder: number;
  price: number;
}

export interface ParsedLensSheet {
  name: string;
  design: LensDesign;
  material: string;
  index: number | null;
  cells: ParsedCell[];
  errors: string[];
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

function roundQuarter(n: number): number {
  return Math.round(n * 4) / 4;
}

function asNumber(value: ExcelJS.CellValue): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && 'result' in value && typeof value.result === 'number') {
    return value.result;
  }
  const n = Number(String(value).replace(/[$,]/g, '').trim());
  return Number.isFinite(n) ? n : null;
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
  if (DESIGNS.has(key as LensDesign)) return key as LensDesign;
  return LensDesign.OTHER;
}

export async function parsePriceWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const lists: ParsedLensSheet[] = [];
  const coatings: ParsedCoating[] = [];
  const coatingErrors: string[] = [];

  for (const sheet of wb.worksheets) {
    const name = sheet.name.trim();
    if (/^coatings?$/i.test(name)) {
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const nameCell = String(row.getCell(1).value ?? '').trim();
        if (!nameCell) return;
        const kind = parseKind(String(row.getCell(2).value ?? 'OTHER'));
        const price = asNumber(row.getCell(3).value);
        if (price == null) {
          coatingErrors.push(`${name}!A${rowNumber}: missing price`);
          return;
        }
        coatings.push({ name: nameCell, kind, price: Math.round(price * 100) / 100 });
      });
      continue;
    }

    let design: LensDesign = LensDesign.SV;
    let material = 'CR-39';
    let index: number | null = null;
    let headerRow = 1;

    const first = String(sheet.getRow(1).getCell(1).value ?? '').trim().toLowerCase();
    if (first === 'design' || first === 'material' || first === 'index' || first === 'name') {
      for (let r = 1; r <= 6; r++) {
        const label = String(sheet.getRow(r).getCell(1).value ?? '').trim().toLowerCase();
        const val = String(sheet.getRow(r).getCell(2).value ?? '').trim();
        if (label === 'design') design = parseDesign(val);
        else if (label === 'material') material = val || material;
        else if (label === 'index') index = asNumber(sheet.getRow(r).getCell(2).value);
        else if (label === 'sphere' || label === 'sph') {
          headerRow = r;
          break;
        }
        if (r === 6) headerRow = 7;
      }
    }

    const cylRow = sheet.getRow(headerRow);
    const cylinders: { col: number; cyl: number }[] = [];
    cylRow.eachCell((cell, colNumber) => {
      if (colNumber === 1) return;
      const cyl = asNumber(cell.value);
      if (cyl == null) return;
      cylinders.push({ col: colNumber, cyl: roundQuarter(cyl) });
    });

    const cells: ParsedCell[] = [];
    const errors: string[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRow) return;
      const sph = asNumber(row.getCell(1).value);
      if (sph == null) return;
      const sphere = roundQuarter(sph);
      for (const { col, cyl } of cylinders) {
        const raw = row.getCell(col).value;
        if (raw == null || raw === '') continue;
        const price = asNumber(raw);
        if (price == null) {
          errors.push(`${name}!${row.getCell(col).address}: not a number`);
          continue;
        }
        cells.push({ sphere, cylinder: cyl, price: Math.round(price * 100) / 100 });
      }
    });

    lists.push({ name, design, material, index, cells, errors });
  }

  return { lists, coatings, coatingErrors };
}

export async function buildPriceTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Poly SV');
  sheet.getCell('A1').value = 'Design';
  sheet.getCell('B1').value = 'SV';
  sheet.getCell('A2').value = 'Material';
  sheet.getCell('B2').value = 'Polycarbonate';
  sheet.getCell('A3').value = 'Index';
  sheet.getCell('B3').value = 1.59;
  const cyls = [0, -0.25, -0.5, -0.75, -1, -1.25, -1.5, -2, -3, -4];
  sheet.getCell('A5').value = 'Sphere';
  cyls.forEach((cyl, i) => {
    sheet.getCell(5, i + 2).value = cyl;
  });
  const spheres = [2, 1, 0, -1, -2, -4, -6];
  spheres.forEach((sph, r) => {
    sheet.getCell(6 + r, 1).value = sph;
    sheet.getCell(6 + r, 2).value = 89;
  });

  const coatings = wb.addWorksheet('Coatings');
  coatings.addRow(['Name', 'Kind', 'Price']);
  coatings.addRow(['Premium AR', 'AR', 79]);
  coatings.addRow(['Transitions', 'PHOTOCHROMIC', 95]);
  coatings.addRow(['Blue light', 'BLUE_LIGHT', 45]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function buildListExport(
  name: string,
  design: string,
  material: string,
  index: number | null,
  cells: ParsedCell[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(name.slice(0, 31) || 'List');
  sheet.getCell('A1').value = 'Design';
  sheet.getCell('B1').value = design;
  sheet.getCell('A2').value = 'Material';
  sheet.getCell('B2').value = material;
  sheet.getCell('A3').value = 'Index';
  sheet.getCell('B3').value = index;
  const spheres = [...new Set(cells.map((c) => c.sphere))].sort((a, b) => b - a);
  const cyls = [...new Set(cells.map((c) => c.cylinder))].sort((a, b) => b - a);
  sheet.getCell('A5').value = 'Sphere';
  cyls.forEach((cyl, i) => {
    sheet.getCell(5, i + 2).value = cyl;
  });
  const lookup = new Map(cells.map((c) => [`${c.sphere}|${c.cylinder}`, c.price]));
  spheres.forEach((sph, r) => {
    sheet.getCell(6 + r, 1).value = sph;
    cyls.forEach((cyl, i) => {
      const price = lookup.get(`${sph}|${cyl}`);
      if (price != null) sheet.getCell(6 + r, i + 2).value = price;
    });
  });
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

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
  ]);
  sheet.addRow(['RAY-2140-52', 'Ray-Ban', '2140', 'Tortoise', '52-18-140', '52', '18', '140', 45, 129, 4, 'Acetate', '']);
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

export async function parseFramesWorkbook(buffer: Buffer): Promise<{ rows: ParsedFrameRow[]; errors: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  const rows: ParsedFrameRow[] = [];
  const errors: string[] = [];
  if (!sheet) return { rows, errors: ['Workbook has no sheets'] };
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const sku = String(row.getCell(1).value ?? '').trim();
    if (!sku) return;
    rows.push({
      sku,
      brand: String(row.getCell(2).value ?? '').trim() || undefined,
      model: String(row.getCell(3).value ?? '').trim() || undefined,
      color: String(row.getCell(4).value ?? '').trim() || undefined,
      size: String(row.getCell(5).value ?? '').trim() || undefined,
      eye: String(row.getCell(6).value ?? '').trim() || undefined,
      bridge: String(row.getCell(7).value ?? '').trim() || undefined,
      temple: String(row.getCell(8).value ?? '').trim() || undefined,
      cost: asNumber(row.getCell(9).value) ?? undefined,
      retail: asNumber(row.getCell(10).value) ?? undefined,
      quantity: asNumber(row.getCell(11).value) ?? undefined,
      material: String(row.getCell(12).value ?? '').trim() || undefined,
      upc: String(row.getCell(13).value ?? '').trim() || undefined,
    });
  });
  return { rows, errors };
}
