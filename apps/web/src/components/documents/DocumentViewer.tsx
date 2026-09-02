'use client';

import { useEffect, useState } from 'react';
import { fetchDocumentObjectUrl, isPreviewable, type PatientDocument } from '@/lib/documents';

/**
 * Inline preview of one stored document. The file endpoint requires the bearer
 * token, so the bytes are fetched and handed to the browser as an object URL,
 * which is revoked when the preview closes or the document changes.
 */
export function DocumentViewer({ doc, onClose }: { doc: PatientDocument; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    setUrl(null);
    setError(null);
    fetchDocumentObjectUrl(doc.id)
      .then((next) => {
        objectUrl = next;
        // The effect may have been torn down mid-flight; revoke rather than leak.
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        setUrl(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not open file');
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.id]);

  return (
    <div className="doc-viewer">
      <div className="doc-viewer-head">
        <strong>{doc.fileName}</strong>
        <div className="toolbar-end">
          {url && (
            <a className="button-link" href={url} target="_blank" rel="noreferrer">
              Open in new tab
            </a>
          )}
          <button type="button" className="secondary" onClick={onClose}>
            Close preview
          </button>
        </div>
      </div>
      {error && <p className="error-text">{error}</p>}
      {!url && !error && <p className="muted">Loading file…</p>}
      {url && !isPreviewable(doc.contentType) && (
        <p className="muted">
          This file type cannot be previewed here — use “Open in new tab” to view it.
        </p>
      )}
      {url && doc.contentType.startsWith('image/') && (
        // eslint-disable-next-line @next/next/no-img-element -- blob URL, not an optimizable asset
        <img className="doc-viewer-frame" src={url} alt={doc.fileName} />
      )}
      {url && doc.contentType === 'application/pdf' && (
        <iframe className="doc-viewer-frame" src={url} title={doc.fileName} />
      )}
    </div>
  );
}
