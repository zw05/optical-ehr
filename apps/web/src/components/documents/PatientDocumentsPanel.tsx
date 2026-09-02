'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { DOCUMENT_KINDS, type DocumentKind, type PatientDocument } from '@/lib/documents';
import { DocumentCard } from './DocumentCard';
import { DocumentUploadForm } from './DocumentUploadForm';
import { DocumentViewer } from './DocumentViewer';

/**
 * The chart's file cabinet: everything scanned for this patient, whether or not
 * it belongs to a visit. Front desk files insurance cards here at intake, before
 * an exam exists; the exam's Attached Docs tab links from this same set.
 */
export function PatientDocumentsPanel({
  patientId,
  canUpload,
  isClinical,
}: {
  patientId: string;
  canUpload: boolean;
  isClinical: boolean;
}) {
  const [docs, setDocs] = useState<PatientDocument[]>([]);
  const [filter, setFilter] = useState<DocumentKind | ''>('');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PatientDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const query = filter ? `?kind=${filter}` : '';
      setDocs(await api<PatientDocument[]>(`/documents/patient/${patientId}${query}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    }
  }, [patientId, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, status: 'REVIEWED' | 'REJECTED') {
    setError(null);
    try {
      await api(`/documents/${id}/review`, { method: 'PATCH', body: { status } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
    }
  }

  return (
    <>
      <div className="toolbar">
        {canUpload && !uploading && (
          <button type="button" className="secondary" onClick={() => setUploading(true)}>
            Upload document
          </button>
        )}
        <div className="toolbar-end">
          <label className="sr-only" htmlFor="doc-filter">
            Filter by type
          </label>
          <select
            id="doc-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as DocumentKind | '')}
          >
            <option value="">All types</option>
            {DOCUMENT_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {uploading && (
        <DocumentUploadForm
          patientId={patientId}
          canTranscribe={isClinical}
          onCancel={() => setUploading(false)}
          onUploaded={() => {
            setUploading(false);
            void load();
          }}
        />
      )}

      {preview && <DocumentViewer doc={preview} onClose={() => setPreview(null)} />}

      {docs.length === 0 ? (
        <p className="muted">
          {filter ? 'No documents of this type.' : 'No documents on file.'}
        </p>
      ) : (
        docs.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            canReview={isClinical}
            onPreview={() => setPreview(doc)}
            onReview={(status) => void review(doc.id, status)}
          >
            {(doc.linkedEncounterIds?.length ?? 0) > 0 && (
              <span className="muted doc-card-meta">
                Attached to {doc.linkedEncounterIds!.length} exam
                {doc.linkedEncounterIds!.length === 1 ? '' : 's'}
              </span>
            )}
          </DocumentCard>
        ))
      )}
    </>
  );
}
