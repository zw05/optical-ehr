/** Freehand stroke in a drawing pad. Points are normalized 0–1. */
export type Stroke = {
  color: string;
  width: number;
  points: [number, number][];
};

export type Pad = { strokes: Stroke[] };

export type GonioQuadrants = {
  superior: number;
  nasal: number;
  inferior: number;
  temporal: number;
};

export type ExternalExamValue = {
  sle: { od: Pad; os: Pad; lensOd: Pad; lensOs: Pad };
  cornea: { od: Pad; os: Pad; findings: string[]; notes: string };
  gonio: {
    od: GonioQuadrants;
    os: GonioQuadrants;
    pigmentationOd: string;
    pigmentationOs: string;
    notes: string;
  };
};

export const CORNEA_FINDINGS = [
  { value: 'spk', label: 'SPK' },
  { value: 'sei', label: 'SEI' },
  { value: 'scar', label: 'Scar' },
  { value: 'arcus', label: 'Arcus' },
  { value: 'mapDot', label: 'Map Dot' },
  { value: 'ulcer', label: 'Ulcer' },
  { value: 'filaments', label: 'Filaments' },
  { value: 'guttata', label: 'Guttata' },
] as const;

export const PIGMENTATION_OPTIONS = [
  { value: '0', label: 'Pigmentation 0' },
  { value: '1', label: 'Pigmentation 1' },
  { value: '2', label: 'Pigmentation 2' },
  { value: '3', label: 'Pigmentation 3' },
  { value: '4', label: 'Pigmentation 4' },
] as const;

export const EMPTY_PAD: Pad = { strokes: [] };

const OPEN_ANGLE: GonioQuadrants = { superior: 4, nasal: 4, inferior: 4, temporal: 4 };

export function emptyExternalExam(): ExternalExamValue {
  return {
    sle: { od: { strokes: [] }, os: { strokes: [] }, lensOd: { strokes: [] }, lensOs: { strokes: [] } },
    cornea: { od: { strokes: [] }, os: { strokes: [] }, findings: [], notes: '' },
    gonio: {
      od: { ...OPEN_ANGLE },
      os: { ...OPEN_ANGLE },
      pigmentationOd: '',
      pigmentationOs: '',
      notes: '',
    },
  };
}

function asPad(raw: unknown): Pad {
  if (!raw || typeof raw !== 'object') return { strokes: [] };
  const strokes = (raw as Pad).strokes;
  if (!Array.isArray(strokes)) return { strokes: [] };
  return {
    strokes: strokes
      .filter((s) => s && Array.isArray(s.points) && s.points.length > 0)
      .map((s) => ({
        color: typeof s.color === 'string' ? s.color : '#000000',
        width: typeof s.width === 'number' && s.width > 0 ? s.width : 1,
        points: s.points
          .filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2)
          .map((p) => [Number(p[0]), Number(p[1])]),
      })),
  };
}

function asGrade(raw: unknown): number {
  const n = Number(raw);
  if (n >= 1 && n <= 4) return n;
  return 4;
}

function asQuadrants(raw: unknown): GonioQuadrants {
  const q = raw && typeof raw === 'object' ? (raw as Partial<GonioQuadrants>) : {};
  return {
    superior: asGrade(q.superior),
    nasal: asGrade(q.nasal),
    inferior: asGrade(q.inferior),
    temporal: asGrade(q.temporal),
  };
}

/** Merge stored JSON into a complete ExternalExamValue. */
export function normalizeExternalExam(raw: unknown): ExternalExamValue {
  const base = emptyExternalExam();
  if (!raw || typeof raw !== 'object') return base;
  const v = raw as Partial<ExternalExamValue>;
  const sle = v.sle ?? base.sle;
  const cornea = v.cornea ?? base.cornea;
  const gonio = v.gonio ?? base.gonio;
  return {
    sle: {
      od: asPad(sle.od),
      os: asPad(sle.os),
      lensOd: asPad(sle.lensOd),
      lensOs: asPad(sle.lensOs),
    },
    cornea: {
      od: asPad(cornea.od),
      os: asPad(cornea.os),
      findings: Array.isArray(cornea.findings) ? cornea.findings.map(String) : [],
      notes: typeof cornea.notes === 'string' ? cornea.notes : '',
    },
    gonio: {
      od: asQuadrants(gonio.od),
      os: asQuadrants(gonio.os),
      pigmentationOd: typeof gonio.pigmentationOd === 'string' ? gonio.pigmentationOd : '',
      pigmentationOs: typeof gonio.pigmentationOs === 'string' ? gonio.pigmentationOs : '',
      notes: typeof gonio.notes === 'string' ? gonio.notes : '',
    },
  };
}
