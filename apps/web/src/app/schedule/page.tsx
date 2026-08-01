'use client';

/** Day calendar with appointment lifecycle actions (confirm, check in, complete, cancel). */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';

interface Appointment {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  patient: { id: string; firstName: string; lastName: string; mrn: string; phone: string | null };
  provider: { id: string; firstName: string; lastName: string };
  type: { id: string; name: string };
}

interface AppointmentType {
  id: string;
  name: string;
  durationMin: number;
}

const NEXT_STATUS: Record<string, { label: string; status: string }[]> = {
  SCHEDULED: [
    { label: 'Confirm', status: 'CONFIRMED' },
    { label: 'Check in', status: 'CHECKED_IN' },
    { label: 'No-show', status: 'NO_SHOW' },
  ],
  CONFIRMED: [
    { label: 'Check in', status: 'CHECKED_IN' },
    { label: 'No-show', status: 'NO_SHOW' },
  ],
  CHECKED_IN: [{ label: 'Start exam', status: 'IN_PROGRESS' }],
  IN_PROGRESS: [{ label: 'Complete', status: 'COMPLETED' }],
};

export default function SchedulePage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start.getTime() + 86_400_000);
    setAppointments(
      await api<Appointment[]>(`/appointments?from=${start.toISOString()}&to=${end.toISOString()}`),
    );
  }, [date]);

  useEffect(() => {
    void load();
    api<AppointmentType[]>('/appointments/types').then(setTypes).catch(() => setTypes([]));
  }, [load]);

  async function setStatus(id: string, status: string) {
    setError(null);
    try {
      const cancelReason =
        status === 'CANCELLED' ? (window.prompt('Cancellation reason:') ?? undefined) : undefined;
      if (status === 'CANCELLED' && !cancelReason) return;
      await api(`/appointments/${id}/status`, { method: 'PATCH', body: { status, cancelReason } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <AppShell>
      <h1>Schedule</h1>
      <div className="toolbar">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ maxWidth: 180 }}
          aria-label="Schedule date"
        />
        <span className="muted">
          {types.length > 0 && `Appointment types: ${types.map((t) => t.name).join(', ')}`}
        </span>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="card">
        {appointments.length === 0 ? (
          <p className="muted">No appointments for this day. Book from a patient chart.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Patient</th>
                <th>Type</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id}>
                  <td>
                    {new Date(a.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–
                    {new Date(a.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <Link href={`/patients/${a.patient.id}`}>
                      {a.patient.lastName}, {a.patient.firstName}
                    </Link>
                    <span className="muted"> {a.patient.mrn}</span>
                  </td>
                  <td>{a.type.name}</td>
                  <td>Dr. {a.provider.lastName}</td>
                  <td>
                    <span
                      className={`badge ${
                        a.status === 'COMPLETED'
                          ? 'success'
                          : a.status === 'CANCELLED' || a.status === 'NO_SHOW'
                            ? 'danger'
                            : ''
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td>
                    {(NEXT_STATUS[a.status] ?? []).map((action) => (
                      <button
                        key={action.status}
                        className="secondary"
                        style={{ marginRight: 4, padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        onClick={() => setStatus(a.id, action.status)}
                      >
                        {action.label}
                      </button>
                    ))}
                    {a.status !== 'CANCELLED' && a.status !== 'COMPLETED' && a.status !== 'NO_SHOW' && (
                      <button
                        className="danger"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        onClick={() => setStatus(a.id, 'CANCELLED')}
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
