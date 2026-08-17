'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { DocumentCard } from '@/components/documents/DocumentCard';
import { DocumentUploadForm } from '@/components/documents/DocumentUploadForm';
import { DocumentViewer } from '@/components/documents/DocumentViewer';
import { extractedToRxRow, kindLabel, type PatientDocument } from '@/lib/documents';

interface AttachedDocsProps {
  encounterId: string;
  patientId: string;
  readOnly: boolean;
  /** Copies a reviewed outside Rx into the refraction tab's Current Rx row. */
  onCopyRx: (row: { od: Record<string, string>; os: Record<string, string> }) => void;
}

/**
 * The exam's Attached Docs tab. Documents live on the chart, so this shows the
 * subset linked to this visit and lets staff pull forward anything already
 * scanned (an outside Rx filed at intake, last year's referral) without
 * re-uploading it.
 */
export function AttachedDocs({ encounterId, patientId, readOnly, onCopyRx }: AttachedDocsProps) {
  const [attached, setAttached] = useState<PatientDocument[]>([]);
  const [chartDocs, setChartDocs] = useState<PatientDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [preview, setPreview] = useState<PatientDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [linked, chart] = await Promise.all([
        api<PatientDocument[]>(`/documents/encounter/${encounterId}`),
        api<PatientDocument[]>(`/documents/patient/${patientId}`),
      ]);
      setAttached(linked);
      setChartDocs(chart);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    }
  }, [encounterId, patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Chart documents not already on this exam — the "attach existing" pool. */
  const attachable = useMemo(() => {
    const linkedIds = new Set(attached.map((doc) => doc.id));
    return chartDocs.filter((doc) => !linkedIds.has(doc.id));
  }, [attached, chartDocs]);

  async function link(documentId: string) {
    setError(null);
    try {
      await api(`/documents/${documentId}/link`, { method: 'POST', body: { encounterId } });
      setPicking(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach document');
    }
  }

  async function unlink(documentId: string) {
    setError(null);
    try {
      await api(`/documents/${documentId}/link/${encounterId}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not detach document');
    }
  }

  async function review(documentId: string, status: 'REVIEWED' | 'REJECTED') {
    setError(null);
    try {
      await api(`/documents/${documentId}/review`, { method: 'PATCH', body: { status } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
    }
  }

  function copyRx(doc: PatientDocument) {
    if (!doc.extractedData) return;
    onCopyRx(extractedToRxRow(doc.extractedData));
    setNotice(`Copied ${doc.fileName} into Current Rx on the Refraction tab.`);
  }

  return (
    <div className="exam-w-full">
      {!readOnly && (
        <div className="toolbar">
          <button type="button" className="secondary" onClick={() => setUploading((v) => !v)}>
            {uploading ? 'Cancel upload' : 'Upload document'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setPicking((v) => !v)}
            disabled={attachable.length === 0}
            title={attachable.length === 0 ? 'Everything on this chart is already attached' : undefined}
          >
            Attach from chart ({attachable.length})
          </button>
        </div>
      )}

      {readOnly && (
        <p className="muted">
          This exam is closed — documents can be viewed but not attached or detached.
        </p>
      )}
      {error && <p className="error-text">{error}</p>}
      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}

      {uploading && !readOnly && (
        <DocumentUploadForm
          patientId={patientId}
          encounterId={encounterId}
          canTranscribe
          onCancel={() => setUploading(false)}
          onUploaded={() => {
            setUploading(false);
            void load();
          }}
        />
      )}

      {picking && !readOnly && (
        <div className="doc-picker">
          <h3>Already on this chart</h3>
          {attachable.map((doc) => (
            <div key={doc.id} className="doc-picker-row">
              <span>
                <strong>{doc.fileName}</strong>{' '}
                <span className="muted">
                  {kindLabel(doc.kind)}
                  {doc.externalProvider ? ` · ${doc.externalProvider}` : ''}
                </span>
              </span>
              <button type="button" className="secondary" onClick={() => void link(doc.id)}>
                Attach
              </button>
            </div>
          ))}
        </div>
      )}

      {preview && <DocumentViewer doc={preview} onClose={() => setPreview(null)} />}

      {attached.length === 0 ? (
        <p className="muted">Nothing attached to this exam yet.</p>
      ) : (
        attached.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            canReview={!readOnly}
            onPreview={() => setPreview(doc)}
            onReview={(status) => void review(doc.id, status)}
          >
            {/* Only reviewed values may be pulled into the exam — an unverified
                transcription must never reach a clinical field. */}
            {doc.kind === 'EXTERNAL_RX' && doc.extractedData && !readOnly && (
              <button
                type="button"
                className="secondary"
                disabled={doc.reviewStatus !== 'REVIEWED'}
                title={
                  doc.reviewStatus === 'REVIEWED'
                    ? undefined
                    : 'Confirm the values against the scan before copying them into the exam'
                }
                onClick={() => copyRx(doc)}
              >
                Copy to Current Rx
              </button>
            )}
            {!readOnly && (
              <button type="button" className="secondary" onClick={() => void unlink(doc.id)}>
                Detach
              </button>
            )}
          </DocumentCard>
        ))
      )}
    </div>
  );
}
