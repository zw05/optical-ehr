import { CodeSystem } from '@prisma/client';
import ExcelJS from 'exceljs';

const SYSTEMS = new Set(Object.values(CodeSystem));
const HEADERS = ['System', 'Code', 'Description', 'Category', 'Favorite'];

export interface ParsedCodeRow {
  system: CodeSystem;
  code: string;
  description: string;
  category: string | null;
  isFavorite: boolean | null;
}

function asText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text.trim();
  }
  if (typeof value === 'object' && 'result' in value) return String(value.result ?? '').trim();
  return String(value).trim();
}

function parseSystem(raw: string): CodeSystem | null {
  const key = raw.trim().toUpperCase().replace(/[\s-]+/g, '');
  const aliases: Record<string, CodeSystem> = {
    'ICD10CM': CodeSystem.ICD10,
    'ICD': CodeSystem.ICD10,
    'DIAGNOSIS': CodeSystem.ICD10,
    'PROCEDURE': CodeSystem.CPT,
  };
  if (aliases[key]) return aliases[key];
  return SYSTEMS.has(key as CodeSystem) ? (key as CodeSystem) : null;
}

/** Reads a yes/no column, tolerating the several ways people write it. */
function parseFlag(raw: string): boolean | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  if (['y', 'yes', 'true', '1', 'x'].includes(key)) return true;
  if (['n', 'no', 'false', '0'].includes(key)) return false;
  return null;
}

export async function parseCodeWorkbook(
  buffer: Buffer,
): Promise<{ rows: ParsedCodeRow[]; errors: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const rows: ParsedCodeRow[] = [];
  const errors: string[] = [];

  for (const sheet of wb.worksheets) {
    // A sheet named for a code system lets a workbook skip the System column.
    const sheetSystem = parseSystem(sheet.name);
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const systemText = asText(row.getCell(1).value);
      const code = asText(row.getCell(2).value);
      const description = asText(row.getCell(3).value);
      if (!systemText && !code && !description) return;

      const system = parseSystem(systemText) ?? sheetSystem;
      if (!system) {
        errors.push(`${sheet.name} row ${rowNumber}: unknown code system "${systemText}"`);
        return;
      }
      if (!code) {
        errors.push(`${sheet.name} row ${rowNumber}: missing code`);
        return;
      }
      if (!description) {
        errors.push(`${sheet.name} row ${rowNumber}: missing description`);
        return;
      }
      rows.push({
        system,
        code,
        description,
        category: asText(row.getCell(4).value) || null,
        isFavorite: parseFlag(asText(row.getCell(5).value)),
      });
    });
  }

  return { rows, errors };
}

function writeSheet(sheet: ExcelJS.Worksheet, rows: (string | number)[][]) {
  sheet.addRow(HEADERS).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  sheet.getColumn(1).width = 12;
  sheet.getColumn(2).width = 14;
  sheet.getColumn(3).width = 60;
  sheet.getColumn(4).width = 22;
  sheet.getColumn(5).width = 10;
}

export async function buildCodeTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Optical EHR';
  writeSheet(wb.addWorksheet('Codes'), [
    ['ICD10', 'H52.4', 'Presbyopia', 'Diagnosis', 'Y'],
    ['ICD10', 'H52.13', 'Myopia, bilateral', 'Diagnosis', 'Y'],
    ['CPT', '92014', 'Ophthalmological exam, established patient, comprehensive', 'Eye exam', 'Y'],
    ['HCPCS', 'V2750', 'Anti-reflective coating, per lens', 'Lens add-ons', 'N'],
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * Exports the codes currently on offer. Retired codes are deliberately left out:
 * the export is meant to be edited and imported back, and importing reactivates
 * whatever it contains, so shipping retired rows in the file would quietly undo
 * the decision to retire them.
 */
export async function buildCodeExport(
  entries: {
    system: CodeSystem;
    code: string;
    description: string;
    category: string | null;
    isFavorite: boolean;
    isActive: boolean;
  }[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Optical EHR';
  writeSheet(
    wb.addWorksheet('Codes'),
    entries
      .filter((e) => e.isActive)
      .map((e) => [e.system, e.code, e.description, e.category ?? '', e.isFavorite ? 'Y' : 'N']),
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}
