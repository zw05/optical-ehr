'use client';

import type { ReactNode } from 'react';
import {
  formatFileSize,
  kindLabel,
  reviewBadgeClass,
  reviewLabel,
  summarizeExtracted,
  type PatientDocument,
} from '@/lib/documents';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

/**
 * One document row: what it is, where it came from, and any values transcribed
 * off it. Actions differ between the chart and the exam tab and are passed in.
 */
export function DocumentCard({
  doc,
  canReview,
  onPreview,
  onReview,
  children,
}: {
  doc: PatientDocument;
  canReview: boolean;
  onPreview: () => void;
  onReview?: (status: 'REVIEWED' | 'REJECTED') => void;
  children?: ReactNode;
}) {
  const summary = summarizeExtracted(doc.kind, doc.extractedData);
  const source = [doc.externalProvider, formatDate(doc.documentDate)].filter(Boolean).join(' · ');
  // Only offer sign-off where there is something to attest to.
  const showReview = canReview && onReview && summary && doc.reviewStatus !== 'REVIEWED';

  return (
    <div className="doc-card">
      <div className="doc-card-head">
        <button type="button" className="doc-card-name" onClick={onPreview}>
          {doc.fileName}
        </button>
        <span className="badge">{kindLabel(doc.kind)}</span>
        {summary && <span className={reviewBadgeClass(doc.reviewStatus)}>{reviewLabel(doc.reviewStatus)}</span>}
      </div>

      <p className="muted doc-card-meta">
        {source && <>{source} · </>}
        {formatFileSize(doc.sizeBytes)} · uploaded {formatDate(doc.createdAt)}
      </p>

      {summary && <p className="doc-card-values">{summary}</p>}
      {doc.extractedData?.notes && <p className="muted doc-card-meta">{doc.extractedData.notes}</p>}

      <div className="toolbar doc-card-actions">
        <button type="button" className="secondary" onClick={onPreview}>
          View
        </button>
        {children}
        {showReview && (
          <>
            <button type="button" className="secondary" onClick={() => onReview('REVIEWED')}>
              Confirm values
            </button>
            <button type="button" className="secondary" onClick={() => onReview('REJECTED')}>
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}
