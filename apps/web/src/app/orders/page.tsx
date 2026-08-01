'use client';

/** Optical order work queue: filter by status, advance fulfillment, start remakes. */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';

interface OrderRow {
  id: string;
  kind: string;
  status: string;
  labName: string | null;
  updatedAt: string;
  patient: { id: string; mrn: string; firstName: string; lastName: string; phone: string | null };
  prescription: { type: string; version: number };
}

const STATUSES = ['', 'DRAFT', 'ORDERED', 'AT_LAB', 'RECEIVED', 'VERIFIED', 'DISPENSED', 'REMAKE', 'CANCELLED'];

const NEXT_ACTIONS: Record<string, { label: string; status: string }[]> = {
  DRAFT: [{ label: 'Mark ordered', status: 'ORDERED' }],
  ORDERED: [{ label: 'At lab', status: 'AT_LAB' }, { label: 'Received', status: 'RECEIVED' }],
  AT_LAB: [{ label: 'Received', status: 'RECEIVED' }],
  RECEIVED: [{ label: 'Verified', status: 'VERIFIED' }],
  VERIFIED: [{ label: 'Dispense', status: 'DISPENSED' }],
};

export default function OrdersPage() {
  const [status, setStatus] = useState('');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = status ? `?status=${status}` : '';
    setOrders(await api<OrderRow[]>(`/orders${query}`));
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function advance(id: string, next: string) {
    setError(null);
    try {
      await api(`/orders/${id}/status`, { method: 'PATCH', body: { status: next } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function remake(id: string) {
    const reason = window.prompt('Remake reason:');
    if (!reason) return;
    setError(null);
    try {
      await api(`/orders/${id}/remake`, { method: 'POST', body: { reason } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remake failed');
    }
  }

  return (
    <AppShell>
      <h1>Optical Orders</h1>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 220 }}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === '' ? 'All statuses' : s}
            </option>
          ))}
        </select>
        <span className="muted">Create orders from a patient chart’s finalized prescription.</span>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="card">
        {orders.length === 0 ? (
          <p className="muted">No orders match.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Kind</th>
                <th>Rx</th>
                <th>Lab</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/patients/${o.patient.id}`}>
                      {o.patient.lastName}, {o.patient.firstName}
                    </Link>
                  </td>
                  <td>{o.kind === 'SPECTACLE' ? 'Spectacle' : 'Contact lens'}</td>
                  <td>v{o.prescription.version}</td>
                  <td>{o.labName ?? '—'}</td>
                  <td>
                    <span
                      className={`badge ${
                        o.status === 'DISPENSED'
                          ? 'success'
                          : o.status === 'REMAKE' || o.status === 'CANCELLED'
                            ? 'danger'
                            : ''
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td>{new Date(o.updatedAt).toLocaleDateString()}</td>
                  <td>
                    {(NEXT_ACTIONS[o.status] ?? []).map((action) => (
                      <button
                        key={action.status}
                        className="secondary"
                        style={{ marginRight: 4, padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        onClick={() => advance(o.id, action.status)}
                      >
                        {action.label}
                      </button>
                    ))}
                    {['RECEIVED', 'VERIFIED', 'DISPENSED'].includes(o.status) && (
                      <button
                        className="danger"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        onClick={() => remake(o.id)}
                      >
                        Remake
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
