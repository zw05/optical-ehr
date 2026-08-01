'use client';

/** Recall outreach list; mark patients contacted, scheduled, or dismissed. */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';

interface RecallRow {
  id: string;
  reason: string;
  dueDate: string;
  status: string;
  notes: string | null;
  patient: {
    id: string;
    mrn: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    preferredContact: string | null;
  };
}

export default function RecallsPage() {
  const [recalls, setRecalls] = useState<RecallRow[]>([]);

  const load = useCallback(async () => {
    setRecalls(await api<RecallRow[]>('/recalls/due?horizon=' + addDays(90).toISOString()));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    await api(`/recalls/${id}/status`, { method: 'PATCH', body: { status } });
    await load();
  }

  return (
    <AppShell>
      <h1>Recalls</h1>
      <p className="muted">
        Recalls due within 90 days. Outbound messages must not include diagnosis or prescription details.
      </p>
      <div className="card">
        {recalls.length === 0 ? (
          <p className="muted">Nothing due.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Due</th>
                <th>Patient</th>
                <th>Reason</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recalls.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.dueDate).toLocaleDateString()}</td>
                  <td>
                    <Link href={`/patients/${r.patient.id}`}>
                      {r.patient.lastName}, {r.patient.firstName}
                    </Link>
                  </td>
                  <td>{r.reason}</td>
                  <td className="muted">
                    {r.patient.phone ?? '—'} {r.patient.preferredContact ? `(${r.patient.preferredContact})` : ''}
                  </td>
                  <td>
                    <span className={`badge ${r.status === 'CONTACTED' ? 'warning' : ''}`}>{r.status}</span>
                  </td>
                  <td>
                    {r.status === 'PENDING' && (
                      <button
                        className="secondary"
                        style={{ marginRight: 4, padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        onClick={() => setStatus(r.id, 'CONTACTED')}
                      >
                        Mark contacted
                      </button>
                    )}
                    <button
                      className="secondary"
                      style={{ marginRight: 4, padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                      onClick={() => setStatus(r.id, 'SCHEDULED')}
                    >
                      Scheduled
                    </button>
                    <button
                      className="danger"
                      style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                      onClick={() => setStatus(r.id, 'DISMISSED')}
                    >
                      Dismiss
                    </button>
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

function addDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
