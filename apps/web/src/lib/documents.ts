'use client';

import { api } from './api';

/** Mirrors the Prisma DocumentKind enum. */
export type DocumentKind =
  | 'EXTERNAL_RECORD'
  | 'EXTERNAL_RX'
  | 'KERATOMETRY'
  | 'REFERRAL_LETTER'
  | 'LAB_IMAGING'
  | 'INSURANCE_CARD'
  | 'OTHER';

export type DocumentReviewStatus = 'PENDING_REVIEW' | 'REVIEWED' | 'REJECTED';

/** One eye's values transcribed off an imported document. */
export interface ExtractedEye {
  sphere?: number;
  cylinder?: number;
  axis?: number;
  add?: number;
  k1?: number;
  k2?: number;
  kAxis?: number;
}

export interface ExtractedData {
  od?: ExtractedEye;
  os?: ExtractedEye;
  kUnit?: 'D' | 'mm';
  pd?: number;
  notes?: string;
}

export interface PatientDocument {
  id: string;
  fileName: string;
  contentType: string;
  category: string | null;
  kind: DocumentKind;
  externalProvider: string | null;
  documentDate: string | null;
  extractedData: ExtractedData | null;
  reviewStatus: DocumentReviewStatus;
  reviewedAt: string | null;
  sizeBytes: number;
  createdAt: string;
  /** Chart listing only: exams this document is already attached to. */
  linkedEncounterIds?: string[];
  /** Encounter listing only. */
  linkedAt?: string;
  linkedBy?: { firstName: string; lastName: string } | null;
}

export const DOCUMENT_KINDS: { value: DocumentKind; label: string }[] = [
  { value: 'EXTERNAL_RX', label: 'Outside prescription' },
  { value: 'KERATOMETRY', label: 'Keratometry readings' },
  { value: 'EXTERNAL_RECORD', label: 'Outside record' },
  { value: 'REFERRAL_LETTER', label: 'Referral letter' },
  { value: 'LAB_IMAGING', label: 'Lab / imaging' },
  { value: 'INSURANCE_CARD', label: 'Insurance card' },
  { value: 'OTHER', label: 'Other' },
];

/** Kinds that carry structured OD/OS values worth transcribing. */
export const STRUCTURED_KINDS: DocumentKind[] = ['EXTERNAL_RX', 'KERATOMETRY'];

/** What the API's content-type allowlist accepts, for the file picker. */
export const ACCEPTED_UPLOAD_TYPES =
  'application/pdf,image/jpeg,image/png,image/tiff,image/heic,image/webp';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function kindLabel(kind: DocumentKind): string {
  return DOCUMENT_KINDS.find((k) => k.value === kind)?.label ?? 'Other';
}

export function reviewLabel(status: DocumentReviewStatus): string {
  if (status === 'REVIEWED') return 'Reviewed';
  if (status === 'REJECTED') return 'Rejected';
  return 'Needs review';
}

/** Maps review status onto the app's badge modifier classes. */
export function reviewBadgeClass(status: DocumentReviewStatus): string {
  if (status === 'REVIEWED') return 'badge success';
  if (status === 'REJECTED') return 'badge danger';
  return 'badge warning';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Signed power with an explicit leading + so transcription errors stand out. */
function signed(value: number | undefined, digits = 2): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function padAxis(axis: number | undefined): string {
  return axis === undefined ? '' : String(axis).padStart(3, '0');
}

/** One eye of an outside Rx, e.g. "-1.25 -0.50 x090 add +2.00". */
function formatRxEye(eye: ExtractedEye | undefined): string {
  if (!eye) return '—';
  const parts = [signed(eye.sphere)];
  if (eye.cylinder !== undefined) parts.push(signed(eye.cylinder));
  if (eye.axis !== undefined) parts.push(`x${padAxis(eye.axis)}`);
  if (eye.add !== undefined) parts.push(`add ${signed(eye.add)}`);
  const text = parts.filter(Boolean).join(' ');
  return text || '—';
}

/** One eye of a K reading, e.g. "43.25 / 44.00 @ 180". */
function formatKEye(eye: ExtractedEye | undefined, unit: 'D' | 'mm'): string {
  if (!eye || (eye.k1 === undefined && eye.k2 === undefined)) return '—';
  const digits = unit === 'mm' ? 2 : 2;
  const k1 = eye.k1 !== undefined ? eye.k1.toFixed(digits) : '—';
  const k2 = eye.k2 !== undefined ? eye.k2.toFixed(digits) : '—';
  const axis = eye.kAxis !== undefined ? ` @ ${padAxis(eye.kAxis)}` : '';
  return `${k1} / ${k2}${axis} ${unit}`;
}

/** Short OD/OS summary for a document row. Empty string when nothing was transcribed. */
export function summarizeExtracted(kind: DocumentKind, data: ExtractedData | null): string {
  if (!data) return '';
  if (kind === 'KERATOMETRY') {
    const unit = data.kUnit ?? 'D';
    const od = formatKEye(data.od, unit);
    const os = formatKEye(data.os, unit);
    return od === '—' && os === '—' ? '' : `OD ${od} · OS ${os}`;
  }
  if (kind === 'EXTERNAL_RX') {
    const od = formatRxEye(data.od);
    const os = formatRxEye(data.os);
    if (od === '—' && os === '—') return '';
    const pd = data.pd !== undefined ? ` · PD ${data.pd}` : '';
    return `OD ${od} · OS ${os}${pd}`;
  }
  return '';
}

/**
 * The exam form stores refraction cells as strings; this converts transcribed
 * numbers into that shape so an outside Rx can be copied into a refraction row.
 */
export function extractedToRxRow(data: ExtractedData): {
  od: Record<string, string>;
  os: Record<string, string>;
} {
  const eye = (e: ExtractedEye | undefined): Record<string, string> => ({
    sphere: signed(e?.sphere),
    cylinder: signed(e?.cylinder),
    axis: e?.axis !== undefined ? padAxis(e.axis) : '',
    add: signed(e?.add),
  });
  return { od: eye(data.od), os: eye(data.os) };
}

/**
 * Fetches a document's bytes as an object URL. Callers own the URL and must
 * revoke it — the file endpoint needs the bearer token, so it cannot be used
 * directly as an <img>/<iframe> src.
 */
export async function fetchDocumentObjectUrl(id: string): Promise<string> {
  const blob = await api<Blob>(`/documents/${id}/content`);
  return URL.createObjectURL(blob);
}

/** True when the browser can render the file inline rather than downloading it. */
export function isPreviewable(contentType: string): boolean {
  return contentType === 'application/pdf' || contentType.startsWith('image/');
}
