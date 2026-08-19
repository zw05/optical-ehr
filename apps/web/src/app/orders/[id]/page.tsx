'use client';

/** One optical order: job spec, money, and the full fulfillment timeline. */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import BackButton from '@/components/BackButton';
import { usePreferences } from '@/components/PreferencesProvider';
import type { OrderDetails } from '@/components/orders/orderFormValues';
import { api } from '@/lib/api';
import { printOrder } from '@/lib/printing';

interface StatusEvent {
  id: string;
  status: string;
  note: string | null;
  actorId: string | null;
  createdAt: string;
}

interface OrderDetail {
  id: string;
  kind: string;
  status: string;
  labName: string | null;
  labReference: string | null;
  warrantyNotes: string | null;
  priceTotal: string | null;
  deposit: string | null;
  balanceDue: string | null;
  details: OrderDetails | null;
  createdAt: string;
  orderedAt: string | null;
  receivedAt: string | null;
  dispensedAt: string | null;
  patient: { id: string; mrn: string; firstName: string; lastName: string };
  prescription: { type: string; version: number };
  statusEvents: StatusEvent[];
  remakeOf: { id: string; status: string } | null;
  remadeBy: { id: string; status: string } | null;
}

interface StaffUser {
  id: string;
  firstName: string;
  lastName: string;
}

function money(value: string | null): string {
  return value === null ? '—' : `$${Number(value).toFixed(2)}`;
}

function whenText(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const { prefs } = usePreferences();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrder(await api<OrderDetail>(`/orders/${orderId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order');
    }
  }, [orderId]);

  useEffect(() => {
    void load();
    // Status events store only an actor id, so names are resolved here.
    api<StaffUser[]>('/users')
      .then(setStaff)
      .catch(() => setStaff([]));
  }, [load]);

  function actorName(actorId: string | null): string {
    if (!actorId) return 'System';
    const match = staff.find((s) => s.id === actorId);
    return match ? `${match.firstName} ${match.lastName}` : 'Unknown user';
  }

  if (error) {
    return (
      <AppShell>
        <BackButton />
        <p className="error-text">{error}</p>
      </AppShell>
    );
  }

  if (!order) {
    return (
      <AppShell>
        <BackButton />
        <p className="muted">Loading order…</p>
      </AppShell>
    );
  }

  const pricing = order.details?.pricing;

  return (
    <AppShell>
      <BackButton />
      <h1>
        {order.kind === 'SPECTACLE' ? 'Spectacle' : 'Contact lens'} order{' '}
        <span
          className={`badge ${
            order.status === 'DISPENSED'
              ? 'success'
              : order.status === 'REMAKE' || order.status === 'CANCELLED'
                ? 'danger'
                : ''
          }`}
        >
          {order.status}
        </span>
      </h1>
      <p className="muted">
        <Link href={`/patients/${order.patient.id}`}>
          {order.patient.lastName}, {order.patient.firstName}
        </Link>{' '}
        · {order.patient.mrn} · Rx v{order.prescription.version}
      </p>

      <div className="toolbar">
        <button className="secondary" onClick={() => void printOrder(order.id, prefs.printing.openInNewTab)}>
          Print
        </button>
        {order.remakeOf && (
          <Link href={`/orders/${order.remakeOf.id}`}>Replaces an earlier order</Link>
        )}
        {order.remadeBy && <Link href={`/orders/${order.remadeBy.id}`}>Replaced by a remake</Link>}
      </div>

      <section className="card">
        <h2>Job</h2>
        <dl className="grid-3">
          <div>
            <dt className="muted">Tray</dt>
            <dd>{order.details?.trayNumber || '—'}</dd>
          </div>
          <div>
            <dt className="muted">Lab</dt>
            <dd>{order.labName ?? '—'}</dd>
          </div>
          <div>
            <dt className="muted">Lab reference</dt>
            <dd>{order.labReference ?? '—'}</dd>
          </div>
        </dl>
        {order.details?.jobNotes && <p>{order.details.jobNotes}</p>}
      </section>

      <section className="card">
        <h2>Money</h2>
        {pricing?.coverage ? (
          <p className="muted">
            {pricing.coverage.payerName}
            {pricing.coverage.planName ? ` — ${pricing.coverage.planName}` : ''} covered{' '}
            {money(String(pricing.planPortion))} of {money(String(pricing.subtotal))}.
          </p>
        ) : (
          <p className="muted">Self-pay.</p>
        )}
        <dl className="grid-3">
          <div>
            <dt className="muted">Patient owes</dt>
            <dd>{money(order.priceTotal)}</dd>
          </div>
          <div>
            <dt className="muted">Amount paid</dt>
            <dd>{money(order.deposit)}</dd>
          </div>
          <div>
            <dt className="muted">Balance</dt>
            <dd>{money(order.balanceDue)}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <h2>Timeline</h2>
        {order.statusEvents.length === 0 ? (
          <p className="muted">No status changes recorded.</p>
        ) : (
          <ol className="order-timeline">
            {order.statusEvents.map((event) => (
              <li key={event.id}>
                <span className="badge">{event.status}</span>
                <span className="muted">
                  {whenText(event.createdAt)} · {actorName(event.actorId)}
                </span>
                {event.note && <p>{event.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </AppShell>
  );
}
