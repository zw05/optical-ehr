'use client';

/** Confirms a status change that needs a reason on the order's timeline. */
import { FormEvent, useEffect, useState } from 'react';

interface OrderReasonDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  /** Remake will not save without a reason; cancelling accepts a blank one. */
  requireReason?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
  onCancel: () => void;
}

export default function OrderReasonDialog({
  title,
  description,
  confirmLabel,
  requireReason = false,
  onConfirm,
  onCancel,
}: OrderReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="book-dialog-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="book-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-reason-title"
        style={{ maxWidth: '28rem' }}
      >
        <form className="book-dialog-form" onSubmit={(e) => void submit(e)}>
          <h2 id="order-reason-title">{title}</h2>
          <p className="muted">{description}</p>
          <div className="field">
            <label htmlFor="order-reason">Reason{requireReason ? '' : ' (optional)'}</label>
            <textarea
              id="order-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="submit" className="danger" disabled={saving || (requireReason && !reason.trim())}>
              {saving ? 'Working…' : confirmLabel}
            </button>
            <button type="button" className="secondary" disabled={saving} onClick={onCancel}>
              Keep order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
