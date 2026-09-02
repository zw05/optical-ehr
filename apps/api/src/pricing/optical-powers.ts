/** Minus-cylinder SPH×CYL grids in 0.25 D steps. */

export const DEFAULT_SPH_MAX = 8;
export const DEFAULT_SPH_MIN = -12;
export const DEFAULT_CYL_MAX = 0;
export const DEFAULT_CYL_MIN = -6;
export const STEP = 0.25;

export function quarterSteps(from: number, to: number, descending = false): number[] {
  const start = Math.round(from / STEP);
  const end = Math.round(to / STEP);
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const values: number[] = [];
  for (let i = lo; i <= hi; i++) values.push(roundQuarter(i * STEP));
  return descending ? values.reverse() : values;
}

export function roundQuarter(n: number): number {
  return Math.round(n / STEP) * STEP;
}

export function formatPower(n: number): string {
  const v = roundQuarter(n);
  const abs = Math.abs(v).toFixed(2);
  if (v > 0) return `+${abs}`;
  if (v < 0) return `-${abs}`;
  return '0.00';
}

export function parsePower(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^\d.+-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return roundQuarter(n);
}

export function assertMinusCyl(cyl: number) {
  if (cyl > 0) {
    throw new Error('Cylinder must be minus-cyl (zero or negative)');
  }
}

export function sphRange(): number[] {
  return quarterSteps(DEFAULT_SPH_MIN, DEFAULT_SPH_MAX, true);
}

export function cylRange(): number[] {
  return quarterSteps(DEFAULT_CYL_MIN, DEFAULT_CYL_MAX, false).reverse();
}
