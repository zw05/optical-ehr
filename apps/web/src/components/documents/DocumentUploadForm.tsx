'use client';

import { useRef, useState, type FormEvent } from 'react';
import { api, fileToBase64 } from '@/lib/api';
import {
  ACCEPTED_UPLOAD_TYPES,
  DOCUMENT_KINDS,
  MAX_UPLOAD_BYTES,
  STRUCTURED_KINDS,
  formatFileSize,
  type DocumentKind,
  type ExtractedData,
  type ExtractedEye,
} from '@/lib/documents';

/** Blank strings for every transcribable cell; the form keeps values as text. */
type EyeForm = { sphere: string; cylinder: string; axis: string; add: string; k1: string; k2: string; kAxis: string };

const EMPTY_EYE: EyeForm = { sphere: '', cylinder: '', axis: '', add: '', k1: '', k2: '', kAxis: '' };

/** Parses a typed cell, returning undefined for blanks so the key is omitted. */
function num(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Drops blank cells so the payload never carries empty keys into validation. */
function toEye(form: EyeForm, kind: DocumentKind): ExtractedEye | undefined {
  const eye: ExtractedEye =
    kind === 'KERATOMETRY'
      ? { k1: num(form.k1), k2: num(form.k2), kAxis: num(form.kAxis) }
      : { sphere: num(form.sphere), cylinder: num(form.cylinder), axis: num(form.axis), add: num(form.add) };
  const filled = Object.fromEntries(Object.entries(eye).filter(([, v]) => v !== undefined));
  return Object.keys(filled).length > 0 ? (filled as ExtractedEye) : undefined;
}

const RX_CELLS: { key: keyof EyeForm; label: string; placeholder: string }[] = [
  { key: 'sphere', label: 'Sphere', placeholder: '-1.25' },
  { key: 'cylinder', label: 'Cyl', placeholder: '-0.50' },
  { key: 'axis', label: 'Axis', placeholder: '90' },
  { key: 'add', label: 'Add', placeholder: '+2.00' },
];

const K_CELLS: { key: keyof EyeForm; label: string; placeholder: string }[] = [
  { key: 'k1', label: 'K1', placeholder: '43.25' },
  { key: 'k2', label: 'K2', placeholder: '44.00' },
  { key: 'kAxis', label: 'Axis', placeholder: '180' },
];

/**
 * Uploads a scan or photo of a paper document. When the document is an outside
 * prescription or keratometry printout, clinical staff can transcribe the OD/OS
 * values off the page at the same time — that is what makes the import usable
 * downstream instead of an image nobody reads.
 */
export function DocumentUploadForm({
  patientId,
  encounterId,
  canTranscribe,
  onUploaded,
  onCancel,
}: {
  patientId: string;
  /** When set, the upload is attached to this exam in the same request. */
  encounterId?: string;
  canTranscribe: boolean;
  onUploaded: () => void;
  onCancel: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocumentKind>('EXTERNAL_RECORD');
  const [externalProvider, setExternalProvider] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [kUnit, setKUnit] = useState<'D' | 'mm'>('D');
  const [pd, setPd] = useState('');
  const [notes, setNotes] = useState('');
  const [od, setOd] = useState<EyeForm>(EMPTY_EYE);
  const [os, setOs] = useState<EyeForm>(EMPTY_EYE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const structured = canTranscribe && STRUCTURED_KINDS.includes(kind);
  const cells = kind === 'KERATOMETRY' ? K_CELLS : RX_CELLS;

  function buildExtractedData(): ExtractedData | undefined {
    if (!structured) return undefined;
    const data: ExtractedData = {};
    const odEye = toEye(od, kind);
    const osEye = toEye(os, kind);
    if (odEye) data.od = odEye;
    if (osEye) data.os = osEye;
    if (kind === 'KERATOMETRY' && (odEye || osEye)) data.kUnit = kUnit;
    if (kind === 'EXTERNAL_RX' && num(pd) !== undefined) data.pd = num(pd);
    if (notes.trim()) data.notes = notes.trim();
    return Object.keys(data).length > 0 ? data : undefined;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || busy) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`${file.name} is ${formatFileSize(file.size)} — the limit is 25 MB`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/documents', {
        method: 'POST',
        body: {
          patientId,
          encounterId,
          fileName: file.name,
          contentType: file.type,
          kind,
          externalProvider: externalProvider.trim() || undefined,
          documentDate: documentDate || undefined,
          extractedData: buildExtractedData(),
          dataBase64: await fileToBase64(file),
        },
      });
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="doc-upload-form" onSubmit={submit}>
      {error && <p className="error-text">{error}</p>}
      <div className="grid-2">
        <div className="field">
          <label htmlFor="doc-file">File</label>
          <input id="doc-file" ref={fileRef} type="file" required accept={ACCEPTED_UPLOAD_TYPES} />
          <span className="muted doc-hint">PDF or image scan, up to 25 MB.</span>
        </div>
        <div className="field">
          <label htmlFor="doc-kind">Document type</label>
          <select id="doc-kind" value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)}>
            {DOCUMENT_KINDS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="doc-provider">From (outside doctor or clinic)</label>
          <input
            id="doc-provider"
            value={externalProvider}
            onChange={(e) => setExternalProvider(e.target.value)}
            placeholder="e.g. Dr. Alvarez, Northside Optical"
          />
        </div>
        <div className="field">
          <label htmlFor="doc-date">Date on document</label>
          <input id="doc-date" type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} />
        </div>
      </div>

      {structured && (
        <fieldset className="doc-transcribe">
          <legend>
            {kind === 'KERATOMETRY' ? 'Keratometry readings' : 'Prescription values'} from the page
          </legend>
          <p className="muted doc-hint">
            Optional. Typed values stay marked “Needs review” until clinical staff confirm them
            against the scan.
          </p>
          <div className="exam-odos-table-wrap">
            <table className="exam-odos-table">
              <thead>
                <tr>
                  <th />
                  {cells.map((cell) => (
                    <th key={cell.key}>{cell.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['od', od, setOd],
                  ['os', os, setOs],
                ] as const).map(([eye, value, setValue]) => (
                  <tr key={eye}>
                    <th>{eye.toUpperCase()}</th>
                    {cells.map((cell) => (
                      <td key={cell.key}>
                        <input
                          inputMode="decimal"
                          aria-label={`${eye.toUpperCase()} ${cell.label}`}
                          placeholder={cell.placeholder}
                          value={value[cell.key]}
                          onChange={(e) => setValue({ ...value, [cell.key]: e.target.value })}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid-2">
            {kind === 'KERATOMETRY' ? (
              <div className="field">
                <label htmlFor="doc-kunit">Recorded in</label>
                <select id="doc-kunit" value={kUnit} onChange={(e) => setKUnit(e.target.value as 'D' | 'mm')}>
                  <option value="D">Diopters</option>
                  <option value="mm">Millimetres</option>
                </select>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="doc-pd">PD</label>
                <input id="doc-pd" inputMode="decimal" value={pd} onChange={(e) => setPd(e.target.value)} placeholder="62" />
              </div>
            )}
            <div className="field">
              <label htmlFor="doc-notes">Notes</label>
              <input
                id="doc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything written on the page worth keeping"
              />
            </div>
          </div>
        </fieldset>
      )}

      <div className="toolbar">
        <button type="submit" disabled={busy}>
          {busy ? 'Uploading…' : encounterId ? 'Upload and attach' : 'Upload'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
