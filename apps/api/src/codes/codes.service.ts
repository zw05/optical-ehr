import { Injectable } from '@nestjs/common';
import { ICD10_OPTOMETRY, type Icd10Entry } from './icd10-optometry';

const DEFAULT_TAKE = 10;
const MAX_TAKE = 25;

function rank(entry: Icd10Entry, q: string): number {
  const code = entry.code.toLowerCase();
  const desc = entry.description.toLowerCase();
  if (code.startsWith(q)) return 0;
  if (desc.startsWith(q)) return 1;
  if (desc.includes(q)) return 2;
  if (code.includes(q)) return 3;
  return 99;
}

/** In-memory ICD-10 lookup over the optometry catalog. */
@Injectable()
export class CodesService {
  searchIcd10(query: string, take?: number): Icd10Entry[] {
    const q = query.trim().toLowerCase();
    const parsed = take === undefined || Number.isNaN(take) ? DEFAULT_TAKE : take;
    const limit = Math.min(Math.max(parsed, 1), MAX_TAKE);
    if (q.length < 1) return [];

    return ICD10_OPTOMETRY.filter((entry) => rank(entry, q) < 99)
      .sort((a, b) => {
        const diff = rank(a, q) - rank(b, q);
        if (diff !== 0) return diff;
        return a.code.localeCompare(b.code);
      })
      .slice(0, limit);
  }
}
