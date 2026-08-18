import { ContactLensFeeKind, ContactLensModality, ContactLensType } from '@prisma/client';
import ExcelJS from 'exceljs';

const MODALITIES = new Set(Object.values(ContactLensModality));
const TYPES = new Set(Object.values(ContactLensType));
const FEE_KINDS = new Set(Object.values(ContactLensFeeKind));

export const PRODUCT_HEADERS = [
  'Brand',
  'Product',
  'Modality',
  'Lens type',
  'Lenses per box',
  'Boxes per year (per eye)',
  'Price per box',
  'Annual supply (per eye)',
  'Six month (per eye)',
  'Rebate note',
  'Notes',
];

export const FEE_HEADERS = ['Name', 'Kind', 'Price'];

export interface ParsedProduct {
  brand: string;
  productName: string;
  modality: ContactLensModality;
  lensType: ContactLensType;
  lensesPerBox: number | null;
  boxesPerYearPerEye: number;
  pricePerBox: number;
  annualSupplyPrice: number | null;
  sixMonthPrice: number | null;
  rebateNote: string | null;
  notes: string | null;
}

export interface ParsedFee {
  name: string;
  kind: ContactLensFeeKind;
  price: number;
}

export interface ParsedContactLensWorkbook {
  products: ParsedProduct[];
  fees: ParsedFee[];
  errors: string[];
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

function asText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text.trim();
  }
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '').trim();
  return String(value).trim();
}

function normalizeKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

/** Accepts the words practices actually write on a price sheet. */
function parseModality(raw: string): ContactLensModality {
  const key = normalizeKey(raw);
  const aliases: Record<string, ContactLensModality> = {
    DAILIES: ContactLensModality.DAILY,
    DAILY_DISPOSABLE: ContactLensModality.DAILY,
    ONE_DAY: ContactLensModality.DAILY,
    TWO_WEEK: ContactLensModality.BIWEEKLY,
    BI_WEEKLY: ContactLensModality.BIWEEKLY,
    MONTHLIES: ContactLensModality.MONTHLY,
    YEARLY: ContactLensModality.ANNUAL,
  };
  if (aliases[key]) return aliases[key];
  if (MODALITIES.has(key as ContactLensModality)) return key as ContactLensModality;
  return ContactLensModality.OTHER;
}

function parseLensType(raw: string): ContactLensType {
  const key = normalizeKey(raw);
  const aliases: Record<string, ContactLensType> = {
    SPHERE: ContactLensType.SPHERICAL,
    ASTIGMATISM: ContactLensType.TORIC,
    MULTI_FOCAL: ContactLensType.MULTIFOCAL,
    BIFOCAL: ContactLensType.MULTIFOCAL,
    TORIC_MULTIFOCAL: ContactLensType.MULTIFOCAL_TORIC,
    GP: ContactLensType.RGP,
    ORTHOK: ContactLensType.ORTHO_K,
  };
  if (aliases[key]) return aliases[key];
  if (TYPES.has(key as ContactLensType)) return key as ContactLensType;
  return ContactLensType.OTHER;
}

function parseFeeKind(raw: string): ContactLensFeeKind {
  const key = normalizeKey(raw);
  if (FEE_KINDS.has(key as ContactLensFeeKind)) return key as ContactLensFeeKind;
  const aliases: Record<string, ContactLensFeeKind> = {
    STANDARD: ContactLensFeeKind.FITTING_STANDARD,
    TORIC: ContactLensFeeKind.FITTING_TORIC,
    MULTIFOCAL: ContactLensFeeKind.FITTING_MULTIFOCAL,
    SPECIALTY: ContactLensFeeKind.FITTING_SPECIALTY,
    ORTHO_K: ContactLensFeeKind.FITTING_ORTHO_K,
  };
  return aliases[key] ?? ContactLensFeeKind.OTHER;
}

/** Reads a contact lens price workbook: a Products sheet and a Fees sheet. */
export async function parseContactLensWorkbook(
  buffer: Buffer,
): Promise<ParsedContactLensWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const products: ParsedProduct[] = [];
  const fees: ParsedFee[] = [];
  const errors: string[] = [];

  for (const sheet of wb.worksheets) {
    const sheetName = sheet.name.trim();
    if (/^fees?$/i.test(sheetName)) {
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const name = asText(row.getCell(1).value);
        if (!name) return;
        const price = asNumber(row.getCell(3).value);
        if (price == null) {
          errors.push(`${sheetName} row ${rowNumber}: missing price`);
          return;
        }
        fees.push({
          name,
          kind: parseFeeKind(asText(row.getCell(2).value)),
          price: Math.round(price * 100) / 100,
        });
      });
      continue;
    }

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const brand = asText(row.getCell(1).value);
      const productName = asText(row.getCell(2).value);
      if (!brand && !productName) return;
      if (!brand || !productName) {
        errors.push(`${sheetName} row ${rowNumber}: brand and product are both required`);
        return;
      }
      const pricePerBox = asNumber(row.getCell(7).value);
      if (pricePerBox == null) {
        errors.push(`${sheetName} row ${rowNumber}: missing price per box`);
        return;
      }
      const boxes = asNumber(row.getCell(6).value);
      const perBoxLenses = asNumber(row.getCell(5).value);
      products.push({
        brand,
        productName,
        modality: parseModality(asText(row.getCell(3).value)),
        lensType: parseLensType(asText(row.getCell(4).value)),
        lensesPerBox: perBoxLenses == null ? null : Math.round(perBoxLenses),
        boxesPerYearPerEye: boxes == null || boxes <= 0 ? 4 : Math.round(boxes),
        pricePerBox: Math.round(pricePerBox * 100) / 100,
        annualSupplyPrice: round2(asNumber(row.getCell(8).value)),
        sixMonthPrice: round2(asNumber(row.getCell(9).value)),
        rebateNote: asText(row.getCell(10).value) || null,
        notes: asText(row.getCell(11).value) || null,
      });
    });
  }

  return { products, fees, errors };
}

function round2(value: number | null): number | null {
  return value == null ? null : Math.round(value * 100) / 100;
}

function writeProductSheet(
  sheet: ExcelJS.Worksheet,
  rows: (string | number | null)[][],
) {
  sheet.addRow(PRODUCT_HEADERS).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  sheet.getColumn(1).width = 20;
  sheet.getColumn(2).width = 28;
  for (let c = 3; c <= PRODUCT_HEADERS.length; c++) sheet.getColumn(c).width = 16;
}

function writeFeeSheet(sheet: ExcelJS.Worksheet, rows: (string | number)[][]) {
  sheet.addRow(FEE_HEADERS).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  sheet.getColumn(1).width = 32;
  sheet.getColumn(2).width = 22;
}

export async function buildContactLensTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Optical EHR';
  writeProductSheet(wb.addWorksheet('Products'), [
    ['Acuvue', 'Oasys 1-Day', 'DAILY', 'SPHERICAL', 90, 4, 78, 288, 150, 'Manufacturer rebate on annual supply', ''],
    ['Acuvue', 'Oasys for Astigmatism', 'BIWEEKLY', 'TORIC', 6, 4, 46, 168, 90, '', ''],
    ['Biofinity', 'Multifocal', 'MONTHLY', 'MULTIFOCAL', 6, 2, 72, 132, 72, '', ''],
  ]);
  writeFeeSheet(wb.addWorksheet('Fees'), [
    ['Standard fitting', 'FITTING_STANDARD', 75],
    ['Toric fitting', 'FITTING_TORIC', 110],
    ['Multifocal fitting', 'FITTING_MULTIFOCAL', 130],
    ['Specialty fitting', 'FITTING_SPECIALTY', 250],
    ['Annual CL evaluation', 'EVALUATION', 60],
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildContactLensExport(
  products: ParsedProduct[],
  fees: ParsedFee[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Optical EHR';
  writeProductSheet(
    wb.addWorksheet('Products'),
    products.map((p) => [
      p.brand,
      p.productName,
      p.modality,
      p.lensType,
      p.lensesPerBox,
      p.boxesPerYearPerEye,
      p.pricePerBox,
      p.annualSupplyPrice,
      p.sixMonthPrice,
      p.rebateNote,
      p.notes,
    ]),
  );
  writeFeeSheet(
    wb.addWorksheet('Fees'),
    fees.map((f) => [f.name, f.kind, f.price]),
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}
