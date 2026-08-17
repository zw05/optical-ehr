import ExcelJS from 'exceljs';
import { LensDesign, OpticalAddOnKind } from '@prisma/client';
import {
  cylRange,
  formatPower,
  parsePower,
  sphRange,
} from './optical-powers';

export interface TemplateList {
  name: string;
  design: LensDesign;
  material: string;
  index: number | null;
  cells: { sphere: number; cylinder: number; price: number }[];
}

export interface TemplateAddOn {
  name: string;
  kind: OpticalAddOnKind;
  price: number;
}

export async function buildPriceWorkbook(
  lists: TemplateList[],
  addOns: TemplateAddOn[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Optical EHR';
  const sphs = sphRange();
  const cyls = cylRange();

  const sheets = lists.length
    ? lists
    : [
        {
          name: 'CR39 SV',
          design: LensDesign.SV,
          material: 'CR-39',
          index: 1.5,
          cells: [],
        },
      ];

  for (const list of sheets) {
    const ws = wb.addWorksheet(safeSheetName(list.name));
    const priceMap = new Map(
      list.cells.map((c) => [`${Number(c.sphere)}|${Number(c.cylinder)}`, Number(c.price)]),
    );
    ws.getCell(1, 1).value = 'SPH';
    cyls.forEach((cyl, i) => {
      ws.getCell(1, i + 2).value = formatPower(cyl);
    });
    sphs.forEach((sph, r) => {
      ws.getCell(r + 2, 1).value = formatPower(sph);
      cyls.forEach((cyl, i) => {
        const price = priceMap.get(`${sph}|${cyl}`);
        if (price != null) ws.getCell(r + 2, i + 2).value = price;
      });
    });
    ws.getRow(1).font = { bold: true };
    ws.getColumn(1).font = { bold: true };
  }

  const coatings = wb.addWorksheet('Coatings');
  coatings.addRow(['Name', 'Kind', 'Price']);
  coatings.getRow(1).font = { bold: true };
  if (addOns.length) {
    for (const a of addOns) coatings.addRow([a.name, a.kind, Number(a.price)]);
  } else {
    coatings.addRow(['Premium AR', 'AR', 89]);
    coatings.addRow(['UV 400', 'UV', 25]);
    coatings.addRow(['Photochromic', 'PHOTOCHROMIC', 120]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export interface ImportedList {
  name: string;
  cells: { sphere: number; cylinder: number; price: number }[];
}

export interface ImportedAddOn {
  name: string;
  kind: OpticalAddOnKind;
  price: number;
}

export async function parsePriceWorkbook(data: Buffer): Promise<{
  lists: ImportedList[];
  addOns: ImportedAddOn[];
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as unknown as ExcelJS.Buffer);
  const lists: ImportedList[] = [];
  const addOns: ImportedAddOn[] = [];

  for (const ws of wb.worksheets) {
    if (ws.name.trim().toLowerCase() === 'coatings') {
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const name = String(row.getCell(1).value ?? '').trim();
        const kindRaw = String(row.getCell(2).value ?? 'OTHER').trim().toUpperCase();
        const price = Number(row.getCell(3).value);
        if (!name || !Number.isFinite(price)) return;
        const kind = (Object.values(OpticalAddOnKind) as string[]).includes(kindRaw)
          ? (kindRaw as OpticalAddOnKind)
          : OpticalAddOnKind.OTHER;
        addOns.push({ name, kind, price });
      });
      continue;
    }

    const header = ws.getRow(1);
    const cyls: { col: number; cyl: number }[] = [];
    header.eachCell((cell, col) => {
      if (col === 1) return;
      const cyl = parsePower(cell.value);
      if (cyl == null || cyl > 0) return;
      cyls.push({ col, cyl });
    });
    const cells: ImportedList['cells'] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const sph = parsePower(row.getCell(1).value);
      if (sph == null) return;
      for (const { col, cyl } of cyls) {
        const raw = row.getCell(col).value;
        if (raw == null || raw === '') continue;
        const price = Number(raw);
        if (!Number.isFinite(price)) continue;
        cells.push({ sphere: sph, cylinder: cyl, price });
      }
    });
    lists.push({ name: ws.name.trim(), cells });
  }

  return { lists, addOns };
}

function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]]/g, ' ').slice(0, 31) || 'Product';
}
