'use client';

/** Day calendar with booking, walk-ins, and appointment lifecycle actions. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import AppointmentStatusActions from '@/components/scheduling/AppointmentStatusActions';
import BookAppointmentForm from '@/components/scheduling/BookAppointmentForm';
import { api, getSessionUser } from '@/lib/api';

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

export default function SchedulePage() {
  const sessionUser = useMemo(() => getSessionUser(), []);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showBook, setShowBook] = useState(false);

  const load = useCallback(async () => {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start.getTime() + 86_400_000);
    setAppointments(
      await api<Appointment[]>(`/appointments?from=${start.toISOString()}&to=${end.toISOString()}`),
    );
  }, [date]);

  useEffect(() => {
    void load().catch(() => setAppointments([]));
  }, [load]);

  const waiting = useMemo(() => appointments.filter((a) => a.status === 'WAITING'), [appointments]);
  const scheduled = useMemo(() => appointments.filter((a) => a.status !== 'WAITING'), [appointments]);

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
        <button
          type="button"
          className={showBook ? 'secondary' : undefined}
          onClick={() => {
            setShowBook((v) => !v);
            setError(null);
          }}
        >
          {showBook ? 'Close book form' : 'Book appointment'}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {showBook && (
        <BookAppointmentForm
          defaultDate={date}
          onSuccess={async () => {
            setShowBook(false);
            setError(null);
            await load();
          }}
          onCancel={() => setShowBook(false)}
        />
      )}

      {waiting.length > 0 && (
        <section className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-header">Waiting room ({waiting.length})</div>
          <div className="panel-body">
            <table>
              <thead>
                <tr>
                  <th>Arrived</th>
                  <th>Patient</th>
                  <th>Type</th>
                  <th>Provider</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {new Date(a.startsAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
                      <AppointmentStatusActions
                        appointmentId={a.id}
                        status={a.status}
                        role={sessionUser?.role}
                        onUpdated={load}
                        onError={setError}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="card">
        {scheduled.length === 0 ? (
          <p className="muted">
            No scheduled appointments for this day. Use Book appointment above — including walk-ins
            for patients who arrive without a slot.
          </p>
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
              {scheduled.map((a) => (
                <tr key={a.id}>
                  <td>
                    {new Date(a.startsAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    –
                    {new Date(a.endsAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
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
                    <AppointmentStatusActions
                      appointmentId={a.id}
                      status={a.status}
                      role={sessionUser?.role}
                      onUpdated={load}
                      onError={setError}
                    />
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
