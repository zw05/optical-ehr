import { formatPower, roundQuarter, STEP } from './optical-powers';

/** A priced power band. Minus-cyl throughout, so cylMin <= cylMax <= 0. */
export interface PriceRange {
  label?: string | null;
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  price: number;
  sortOrder?: number;
}

/** One cell of an imported SPH x CYL price grid. */
export interface PriceCell {
  sphere: number;
  cylinder: number;
  price: number;
}

const idx = (power: number) => Math.round(power / STEP);
const power = (index: number) => roundQuarter(index * STEP);

/** True when the band covers this prescription. */
export function rangeContains(range: PriceRange, sphere: number, cylinder: number): boolean {
  return (
    sphere >= Math.min(range.sphMin, range.sphMax) &&
    sphere <= Math.max(range.sphMin, range.sphMax) &&
    cylinder >= Math.min(range.cylMin, range.cylMax) &&
    cylinder <= Math.max(range.cylMin, range.cylMax)
  );
}

function area(range: PriceRange): number {
  const sph = Math.abs(idx(range.sphMax) - idx(range.sphMin)) + 1;
  const cyl = Math.abs(idx(range.cylMax) - idx(range.cylMin)) + 1;
  return sph * cyl;
}

/**
 * Picks the band that prices a given Rx. The narrowest matching band wins, so a
 * practice can drop a tight high-power surcharge band on top of a broad base
 * band without editing the base; `sortOrder` breaks ties between bands of equal
 * size. Returns null when no band covers the power, which the caller reports as
 * "not offered" rather than as free.
 */
export function findRange<T extends PriceRange>(
  ranges: T[],
  sphere: number,
  cylinder: number,
): T | null {
  const matches = ranges.filter((r) => rangeContains(r, sphere, cylinder));
  if (matches.length === 0) return null;
  matches.sort((a, b) => area(a) - area(b) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return matches[0];
}

/** Human-readable band description, e.g. "+4.00 to -6.00 sph / 0.00 to -2.00 cyl". */
export function describeRange(range: PriceRange): string {
  const sph = `${formatPower(Math.max(range.sphMin, range.sphMax))} to ${formatPower(
    Math.min(range.sphMin, range.sphMax),
  )}`;
  const cyl = `${formatPower(Math.max(range.cylMin, range.cylMax))} to ${formatPower(
    Math.min(range.cylMin, range.cylMax),
  )}`;
  return `${sph} sph / ${cyl} cyl`;
}

/**
 * Collapses a full SPH x CYL price grid into the fewest rectangular bands that
 * reproduce it exactly.
 *
 * Lab price sheets arrive as grids of a few thousand cells holding only a
 * handful of distinct prices, which is unreadable and miserable to maintain by
 * hand. Cells are grouped by price and each group is covered greedily: start at
 * the lowest uncovered cell, widen along cylinder as far as the price holds,
 * then grow down through sphere while every cell of that width still matches.
 * Because a rectangle only ever absorbs cells of its own price, the result
 * prices every input cell identically to the grid it came from — no cell is
 * dropped and none is silently repriced.
 */
export function collapseGridToRanges(cells: PriceCell[]): PriceRange[] {
  const byPrice = new Map<number, Set<string>>();
  for (const cell of cells) {
    const price = Math.round(cell.price * 100) / 100;
    const key = `${idx(cell.sphere)}|${idx(cell.cylinder)}`;
    const bucket = byPrice.get(price);
    if (bucket) bucket.add(key);
    else byPrice.set(price, new Set([key]));
  }

  const ranges: PriceRange[] = [];
  for (const [price, keys] of byPrice) {
    const remaining = new Set(keys);
    const points = [...keys]
      .map((k) => {
        const [s, c] = k.split('|').map(Number);
        return { s, c };
      })
      .sort((a, b) => b.s - a.s || b.c - a.c);

    for (const start of points) {
      const startKey = `${start.s}|${start.c}`;
      if (!remaining.has(startKey)) continue;

      // Widen along cylinder (descending, since cyl runs 0 down to negative).
      let cylEnd = start.c;
      while (remaining.has(`${start.s}|${cylEnd - 1}`)) cylEnd -= 1;

      // Deepen through sphere while the whole cylinder span still matches.
      let sphEnd = start.s;
      for (;;) {
        const next = sphEnd - 1;
        let complete = true;
        for (let c = start.c; c >= cylEnd; c--) {
          if (!remaining.has(`${next}|${c}`)) {
            complete = false;
            break;
          }
        }
        if (!complete) break;
        sphEnd = next;
      }

      for (let s = start.s; s >= sphEnd; s--) {
        for (let c = start.c; c >= cylEnd; c--) remaining.delete(`${s}|${c}`);
      }

      ranges.push({
        sphMin: power(sphEnd),
        sphMax: power(start.s),
        cylMin: power(cylEnd),
        cylMax: power(start.c),
        price,
      });
    }
  }

  // Widest bands first so the list reads base-price-then-exceptions.
  ranges.sort((a, b) => area(b) - area(a) || b.price - a.price);
  return ranges.map((range, i) => ({ ...range, sortOrder: i }));
}
