'use client';

/** Compact status transition buttons for an appointment row. */
import { useState } from 'react';
import { api } from '@/lib/api';
import { actionsForStatus, canCancelAppointment } from './appointmentStatus';

interface AppointmentStatusActionsProps {
  appointmentId: string;
  status: string;
  /** Signed-in user's role; decides whether clinical actions are offered. */
  role: string | undefined;
  onUpdated?: () => void | Promise<void>;
  onError?: (message: string) => void;
}

/** Forward-progress actions get the solid primary treatment. */
const PRIMARY_STATUSES = new Set(['CHECKED_IN', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED']);

function actionClass(nextStatus: string): string {
  if (PRIMARY_STATUSES.has(nextStatus)) return 'appt-action appt-action-primary';
  if (nextStatus === 'NO_SHOW') return 'appt-action appt-action-quiet';
  return 'appt-action appt-action-quiet';
}

export default function AppointmentStatusActions({
  appointmentId,
  status,
  role,
  onUpdated,
  onError,
}: AppointmentStatusActionsProps) {
  const [busy, setBusy] = useState(false);

  async function setStatus(next: string) {
    if (busy) return;
    setBusy(true);
    try {
      const cancelReason =
        next === 'CANCELLED' ? (window.prompt('Cancellation reason:') ?? undefined) : undefined;
      if (next === 'CANCELLED' && !cancelReason) return;
      await api(`/appointments/${appointmentId}/status`, {
        method: 'PATCH',
        body: { status: next, cancelReason },
      });
      await onUpdated?.();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="appt-actions">
      {actionsForStatus(status, role).map((action) => (
        <button
          key={action.status}
          type="button"
          className={actionClass(action.status)}
          disabled={busy}
          onClick={() => void setStatus(action.status)}
        >
          {action.label}
        </button>
      ))}
      {canCancelAppointment(status) && (
        <button
          type="button"
          className="appt-action appt-action-cancel"
          disabled={busy}
          onClick={() => void setStatus('CANCELLED')}
        >
          Cancel
        </button>
      )}
    </div>
  );
}
