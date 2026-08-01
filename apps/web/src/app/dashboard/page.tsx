'use client';

/** Operational overview: today's appointments, orders ready for pickup, recalls due. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { usePreferences } from '@/components/PreferencesProvider';
import { api } from '@/lib/api';
import {
  DASHBOARD_PANEL_KEYS,
  type DashboardPanelKey,
} from '@/lib/dashboardPanels';

interface Appointment {
  id: string;
  startsAt: string;
  status: string;
  patient: { id: string; firstName: string; lastName: string; mrn: string };
  provider: { firstName: string; lastName: string };
  type: { name: string };
}

interface Recall {
  id: string;
  reason: string;
  dueDate: string;
  patient: { firstName: string; lastName: string; phone: string | null };
}

interface Order {
  id: string;
  status: string;
  kind: string;
  patient: { firstName: string; lastName: string };
}

export default function DashboardPage() {
  const { prefs } = usePreferences();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const end = new Date(start.getTime() + 86_400_000);
    api<Appointment[]>(`/appointments?from=${start.toISOString()}&to=${end.toISOString()}`)
      .then(setAppointments)
      .catch(() => setAppointments([]));
    api<Recall[]>('/recalls/due')
      .then(setRecalls)
      .catch(() => setRecalls([]));
    api<Order[]>('/orders?status=RECEIVED')
      .then(setOrders)
      .catch(() => setOrders([]));
  }, []);

  const panels = useMemo(() => {
    const order =
      prefs.dashboard.panelOrder.length > 0
        ? prefs.dashboard.panelOrder
        : [...DASHBOARD_PANEL_KEYS];
    const hidden = new Set(prefs.dashboard.hiddenPanels);
    const seen = new Set<string>();
    const ordered: DashboardPanelKey[] = [];
    for (const key of order) {
      if (!DASHBOARD_PANEL_KEYS.includes(key as DashboardPanelKey)) continue;
      if (hidden.has(key) || seen.has(key)) continue;
      seen.add(key);
      ordered.push(key as DashboardPanelKey);
    }
    for (const key of DASHBOARD_PANEL_KEYS) {
      if (!seen.has(key) && !hidden.has(key)) ordered.push(key);
    }
    return ordered;
  }, [prefs.dashboard.panelOrder, prefs.dashboard.hiddenPanels]);

  const registry: Record<DashboardPanelKey, ReactNode> = {
    appointments: (
      <section className="panel" key="appointments">
        <div className="panel-header">Today&apos;s Appointments ({appointments.length})</div>
        <div className="panel-body">
          {appointments.length === 0 && <p className="muted">No appointments today.</p>}
          {appointments.length > 0 && (
            <table>
              <tbody>
                {appointments.map((a) => (
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
                    </td>
                    <td>{a.type.name}</td>
                    <td>
                      <span className="badge">{a.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    ),
    orders: (
      <section className="panel" key="orders">
        <div className="panel-header">Ready for pickup ({orders.length})</div>
        <div className="panel-body">
          {orders.length === 0 && <p className="muted">No orders awaiting verification.</p>}
          {orders.length > 0 && (
            <table>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/orders/${o.id}`}>
                        {o.patient.lastName}, {o.patient.firstName}
                      </Link>
                    </td>
                    <td>{o.kind}</td>
                    <td>
                      <span className="badge warning">{o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    ),
    recalls: (
      <section className="panel" key="recalls">
        <div className="panel-header">Recalls due ({recalls.length})</div>
        <div className="panel-body">
          {recalls.length === 0 && <p className="muted">No recalls due in the next 30 days.</p>}
          {recalls.length > 0 && (
            <table>
              <tbody>
                {recalls.slice(0, 10).map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.dueDate).toLocaleDateString()}</td>
                    <td>
                      {r.patient.lastName}, {r.patient.firstName}
                    </td>
                    <td>{r.reason}</td>
                    <td className="muted">{r.patient.phone ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    ),
  };

  return (
    <AppShell>
      <h1 className="page-header">Today</h1>
      <div className="panel-grid">{panels.map((key) => registry[key])}</div>
    </AppShell>
  );
}
