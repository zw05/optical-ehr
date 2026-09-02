'use client';

/** Optical order work queue: filter by status, advance fulfillment, start remakes. */
import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import CreateOrderForm from '@/components/orders/CreateOrderForm';
import EditOrderForm from '@/components/orders/EditOrderForm';
import OrderActionsMenu from '@/components/orders/OrderActionsMenu';
import OrderReasonDialog from '@/components/orders/OrderReasonDialog';
import type { OrderDetails } from '@/components/orders/orderFormValues';
import { usePreferences } from '@/components/PreferencesProvider';
import { api, getSessionUser } from '@/lib/api';
import { printOrder } from '@/lib/printing';

interface OrderRow {
  id: string;
  kind: string;
  status: string;
  labName: string | null;
  labReference: string | null;
  warrantyNotes: string | null;
  priceTotal: string | null;
  deposit: string | null;
  details: OrderDetails | null;
  updatedAt: string;
  patient: { id: string; mrn: string; firstName: string; lastName: string; phone: string | null };
  prescription: { type: string; version: number };
}

/** Mirrors the @Roles guard on POST /orders; technicians get a read-only queue. */
const CREATE_ROLES = ['OPTICIAN', 'DOCTOR', 'RECEPTIONIST', 'ADMIN'];

/** Mirrors the @Roles guard on PATCH /orders/:id — narrower than who may create. */
const EDIT_ROLES = ['OPTICIAN', 'DOCTOR', 'ADMIN'];

/** The service refuses edits once an order is dispensed or cancelled. */
const UNEDITABLE_STATUSES = ['DISPENSED', 'CANCELLED'];

/** Mirrors the TRANSITIONS table: cancelling is only legal before the lab work lands. */
const CANCELLABLE_STATUSES = ['DRAFT', 'ORDERED', 'AT_LAB'];

const STATUSES = ['', 'DRAFT', 'ORDERED', 'AT_LAB', 'RECEIVED', 'VERIFIED', 'DISPENSED', 'REMAKE', 'CANCELLED'];

const NEXT_ACTIONS: Record<string, { label: string; status: string }[]> = {
  DRAFT: [{ label: 'Mark ordered', status: 'ORDERED' }],
  ORDERED: [{ label: 'At lab', status: 'AT_LAB' }, { label: 'Received', status: 'RECEIVED' }],
  AT_LAB: [{ label: 'Received', status: 'RECEIVED' }],
  RECEIVED: [{ label: 'Verified', status: 'VERIFIED' }],
  VERIFIED: [{ label: 'Dispense', status: 'DISPENSED' }],
};

export default function OrdersPage() {
  const router = useRouter();
  const { prefs } = usePreferences();
  const [status, setStatus] = useState('');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<{ kind: 'cancel' | 'remake'; id: string } | null>(null);
  const user = typeof window !== 'undefined' ? getSessionUser() : null;
  const canCreate = CREATE_ROLES.includes(user?.role ?? '');
  const canEdit = EDIT_ROLES.includes(user?.role ?? '');

  const load = useCallback(async () => {
    const query = status ? `?status=${status}` : '';
    try {
      setOrders(await api<OrderRow[]>(`/orders${query}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!showNew) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setShowNew(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showNew]);

  async function advance(id: string, next: string) {
    setError(null);
    try {
      await api(`/orders/${id}/status`, { method: 'PATCH', body: { status: next } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function remake(id: string, reason: string) {
    setError(null);
    try {
      await api(`/orders/${id}/remake`, { method: 'POST', body: { reason } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remake failed');
    }
  }

  async function cancelOrder(id: string, note: string) {
    setError(null);
    try {
      await api(`/orders/${id}/status`, {
        method: 'PATCH',
        body: { status: 'CANCELLED', note: note || undefined },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
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
        {canCreate ? (
          <button className="secondary" onClick={() => setShowNew((open) => !open)}>
            {showNew ? 'Close' : 'New order'}
          </button>
        ) : (
          <span className="muted">Your role can view orders but not create them.</span>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      {showNew && canCreate && (
        <div
          className="book-dialog-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNew(false);
          }}
        >
          <div
            className="book-dialog order-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-dialog-title"
          >
            <CreateOrderForm
              className="book-dialog-form"
              onSuccess={async (order) => {
                setShowNew(false);
                setJustCreatedId(order.id);
                await load();
              }}
              onCancel={() => setShowNew(false)}
            />
          </div>
        </div>
      )}
      {justCreatedId && (
        <div className="card" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Order created.</span>
          <button
            className="secondary"
            onClick={(e) => {
              void printOrder(justCreatedId, prefs.printing.openInNewTab);
              setJustCreatedId(null);
            }}
          >
            Print now
          </button>
          <button className="secondary" onClick={() => setJustCreatedId(null)}>
            Dismiss
          </button>
        </div>
      )}
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
                <th>Tray</th>
                <th>Lab</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <Fragment key={o.id}>
                <tr>
                  <td>
                    <Link href={`/patients/${o.patient.id}`}>
                      {o.patient.lastName}, {o.patient.firstName}
                    </Link>
                  </td>
                  <td>{o.kind === 'SPECTACLE' ? 'Spectacle' : 'Contact lens'}</td>
                  <td>v{o.prescription.version}</td>
                  <td>{o.details?.trayNumber || '—'}</td>
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
                    <OrderActionsMenu
                      label={`${o.patient.lastName}, ${o.patient.firstName}`}
                      actions={[
                        { label: 'Open', run: () => router.push(`/orders/${o.id}`) },
                        {
                          label: 'Print',
                          run: () => void printOrder(o.id, prefs.printing.openInNewTab),
                        },
                        ...(canEdit && !UNEDITABLE_STATUSES.includes(o.status)
                          ? [
                              {
                                label: editingId === o.id ? 'Close editor' : 'Edit',
                                run: () => setEditingId(editingId === o.id ? null : o.id),
                              },
                            ]
                          : []),
                        ...(NEXT_ACTIONS[o.status] ?? []).map((action) => ({
                          label: action.label,
                          run: () => void advance(o.id, action.status),
                        })),
                        ...(CANCELLABLE_STATUSES.includes(o.status)
                          ? [
                              {
                                label: 'Cancel order',
                                danger: true,
                                run: () => setPrompt({ kind: 'cancel', id: o.id }),
                              },
                            ]
                          : []),
                        ...(['RECEIVED', 'VERIFIED', 'DISPENSED'].includes(o.status)
                          ? [
                              {
                                label: 'Remake',
                                danger: true,
                                run: () => setPrompt({ kind: 'remake', id: o.id }),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </td>
                </tr>
                {editingId === o.id && (
                  <tr>
                    <td colSpan={8}>
                      <EditOrderForm
                        className=""
                        order={o}
                        onSuccess={async () => {
                          setEditingId(null);
                          await load();
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {prompt && (
        <OrderReasonDialog
          title={prompt.kind === 'cancel' ? 'Cancel this order?' : 'Start a remake?'}
          description={
            prompt.kind === 'cancel'
              ? 'Cancelling is final — a cancelled order cannot be reopened or edited.'
              : 'This closes the current job and opens a replacement carrying the same prescription and pricing.'
          }
          confirmLabel={prompt.kind === 'cancel' ? 'Cancel order' : 'Start remake'}
          requireReason={prompt.kind === 'remake'}
          onConfirm={async (reason) => {
            if (prompt.kind === 'cancel') await cancelOrder(prompt.id, reason);
            else await remake(prompt.id, reason);
            setPrompt(null);
          }}
          onCancel={() => setPrompt(null)}
        />
      )}
    </AppShell>
  );
}
