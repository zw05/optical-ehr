import { collapseGridToRanges, findRange, rangeContains, type PriceCell } from './price-ranges';
import { quarterSteps } from './optical-powers';

/** Builds a grid priced by an arbitrary rule, as a lab sheet would arrive. */
function grid(price: (sphere: number, cylinder: number) => number | null): PriceCell[] {
  const cells: PriceCell[] = [];
  for (const sphere of quarterSteps(-8, 6)) {
    for (const cylinder of quarterSteps(-4, 0)) {
      const value = price(sphere, cylinder);
      if (value != null) cells.push({ sphere, cylinder, price: value });
    }
  }
  return cells;
}

/** Every input cell must price identically through the collapsed bands. */
function expectExact(cells: PriceCell[]) {
  const ranges = collapseGridToRanges(cells);
  for (const cell of cells) {
    const match = findRange(ranges, cell.sphere, cell.cylinder);
    expect(match).not.toBeNull();
    expect(match?.price).toBe(Math.round(cell.price * 100) / 100);
  }
  return ranges;
}

describe('collapseGridToRanges', () => {
  it('reduces a single-price grid to one band', () => {
    const ranges = expectExact(grid(() => 89));
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({ sphMin: -8, sphMax: 6, cylMin: -4, cylMax: 0, price: 89 });
  });

  it('splits a grid priced in power tiers without losing a cell', () => {
    const ranges = expectExact(
      grid((sphere, cylinder) => {
        if (Math.abs(sphere) > 4 || cylinder < -2) return 129;
        return 89;
      }),
    );
    // Far fewer bands than the 1,000+ cells they replace.
    expect(ranges.length).toBeLessThan(10);
    expect(new Set(ranges.map((r) => r.price))).toEqual(new Set([89, 129]));
  });

  it('leaves gaps unpriced rather than filling them in', () => {
    const cells = grid((sphere) => (sphere < -6 ? null : 75));
    const ranges = expectExact(cells);
    expect(findRange(ranges, -7, 0)).toBeNull();
  });

  it('handles a grid with many distinct prices', () => {
    expectExact(grid((sphere, cylinder) => 50 + Math.abs(sphere) * 2 + Math.abs(cylinder)));
  });

  it('never covers a cell with a band of another price', () => {
    const cells = grid((sphere) => (sphere >= 0 ? 60 : 120));
    const ranges = collapseGridToRanges(cells);
    for (const range of ranges) {
      for (const cell of cells) {
        if (rangeContains(range, cell.sphere, cell.cylinder)) {
          expect(range.price).toBe(cell.price);
        }
      }
    }
  });
});

describe('findRange', () => {
  const base = { sphMin: -8, sphMax: 8, cylMin: -6, cylMax: 0, price: 89, sortOrder: 0 };
  const surcharge = { sphMin: -8, sphMax: -6, cylMin: -6, cylMax: -4, price: 149, sortOrder: 1 };

  it('prefers the narrower band where two overlap', () => {
    expect(findRange([base, surcharge], -7, -5)?.price).toBe(149);
  });

  it('falls back to the broad band outside the surcharge', () => {
    expect(findRange([base, surcharge], 0, -1)?.price).toBe(89);
  });

  it('returns null for a power no band covers', () => {
    expect(findRange([base, surcharge], -12, 0)).toBeNull();
  });
});
