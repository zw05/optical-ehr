'use client';

/** Operational today board: book/walk-in, patient flow, and workflow panels. */
import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { usePreferences } from '@/components/PreferencesProvider';
import AppointmentStatusActions from '@/components/scheduling/AppointmentStatusActions';
import BookAppointmentForm from '@/components/scheduling/BookAppointmentForm';
import {
  FLOW_STATUSES,
  SCHEDULING_ROLES,
} from '@/components/scheduling/appointmentStatus';
import { api, getSessionUser } from '@/lib/api';
import {
  DASHBOARD_PANEL_KEYS,
  type DashboardPanelKey,
} from '@/lib/dashboardPanels';
import { describeDue, type OrthoKNotifications } from '@/lib/orthoK';

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

interface Task {
  id: string;
  title: string;
  dueDate: string | null;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE';
}

interface EncounterRow {
  id: string;
  createdAt: string;
  status: string;
  patient: { id: string; firstName: string; lastName: string };
}

const CLINICAL_ROLES = new Set(['DOCTOR', 'TECHNICIAN']);

type BookMode = 'book' | 'walkIn' | null;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < startOfDay(new Date());
}

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DashboardPage() {
  const { prefs } = usePreferences();
  const sessionUser = useMemo(() => getSessionUser(), []);
  const canSeeUnsigned = CLINICAL_ROLES.has(sessionUser?.role ?? '');
  const canSchedule = SCHEDULING_ROLES.has(sessionUser?.role ?? '');

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [orthoK, setOrthoK] = useState<OrthoKNotifications | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [history, setHistory] = useState<Appointment[]>([]);
  const [unsigned, setUnsigned] = useState<EncounterRow[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [bookMode, setBookMode] = useState<BookMode>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    [],
  );
  const todayDate = useMemo(() => todayIsoDate(), []);

  const loadTodayAppointments = useCallback(async () => {
    const today = new Date();
    const start = startOfDay(today);
    const end = new Date(start.getTime() + 86_400_000);
    setAppointmentsLoading(true);
    try {
      const rows = await api<Appointment[]>(
        `/appointments?from=${start.toISOString()}&to=${end.toISOString()}`,
      );
      setAppointments(rows);
    } catch {
      setAppointments([]);
    } finally {
      setAppointmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTodayAppointments();

    const today = new Date();
    const start = startOfDay(today);
    const monthAgo = new Date(start.getTime() - 30 * 86_400_000);

    api<Recall[]>('/recalls/due')
      .then(setRecalls)
      .catch(() => setRecalls([]));
    api<Order[]>('/orders?status=RECEIVED')
      .then(setOrders)
      .catch(() => setOrders([]));
    api<OrthoKNotifications>('/ortho-k/notifications')
      .then(setOrthoK)
      .catch(() => setOrthoK(null));

    api<Appointment[]>(
      `/appointments?from=${monthAgo.toISOString()}&to=${today.toISOString()}&status=COMPLETED`,
    )
      .then((rows) => setHistory([...rows].reverse()))
      .catch(() => setHistory([]));

    const user = getSessionUser();
    if (user) {
      api<Task[]>(`/tasks?assigneeId=${user.id}`)
        .then((rows) => setTasks(rows.filter((t) => t.status !== 'DONE')))
        .catch(() => setTasks([]));
    }

    if (user && CLINICAL_ROLES.has(user.role)) {
      api<{ rows: EncounterRow[] }>('/encounters?tab=unfinished')
        .then((data) => setUnsigned(data.rows ?? []))
        .catch(() => setUnsigned([]));
    }
  }, [loadTodayAppointments]);

  const scheduledToday = useMemo(
    () => appointments.filter((a) => a.status !== 'WAITING'),
    [appointments],
  );
  const inFlow = useMemo(
    () => appointments.filter((a) => FLOW_STATUSES.has(a.status)),
    [appointments],
  );
  const waitingCount = useMemo(
    () => appointments.filter((a) => a.status === 'WAITING').length,
    [appointments],
  );
  const inOfficeCount = useMemo(
    () => appointments.filter((a) => a.status === 'CHECKED_IN' || a.status === 'IN_PROGRESS').length,
    [appointments],
  );
  const scheduledRemaining = useMemo(
    () =>
      appointments.filter((a) => a.status === 'SCHEDULED' || a.status === 'CONFIRMED').length,
    [appointments],
  );

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
      if (key === 'unsignedEncounters' && !canSeeUnsigned) continue;
      if (hidden.has(key) || seen.has(key)) continue;
      seen.add(key);
      ordered.push(key as DashboardPanelKey);
    }
    for (const key of DASHBOARD_PANEL_KEYS) {
      if (key === 'unsignedEncounters' && !canSeeUnsigned) continue;
      if (!seen.has(key) && !hidden.has(key)) ordered.push(key);
    }
    return ordered;
  }, [prefs.dashboard.panelOrder, prefs.dashboard.hiddenPanels, canSeeUnsigned]);

  async function completeTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      await api(`/tasks/${id}/status`, { method: 'PATCH', body: { status: 'DONE' } });
    } catch {
      const user = getSessionUser();
      if (user) {
        const rows = await api<Task[]>(`/tasks?assigneeId=${user.id}`).catch(() => [] as Task[]);
        setTasks(rows.filter((t) => t.status !== 'DONE'));
      }
    }
  }

  async function addTask(e: FormEvent) {
    e.preventDefault();
    const title = newTaskTitle.trim();
    if (!title || !sessionUser || addingTask) return;
    setAddingTask(true);
    try {
      const created = await api<Task>('/tasks', {
        method: 'POST',
        body: {
          title,
          assigneeId: sessionUser.id,
          ...(newTaskDue ? { dueDate: new Date(newTaskDue).toISOString() } : {}),
        },
      });
      setTasks((prev) =>
        [...prev, created].sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }),
      );
      setNewTaskTitle('');
      setNewTaskDue('');
    } finally {
      setAddingTask(false);
    }
  }

  async function refreshAfterStatus() {
    setActionError(null);
    await loadTodayAppointments();
  }

  const registry: Record<DashboardPanelKey, ReactNode> = {
    appointments: (
      <section className="panel" key="appointments">
        <div className="panel-header">Today&apos;s Appointments ({scheduledToday.length})</div>
        <div className="panel-body">
          {appointmentsLoading && <p className="muted">Loading appointments…</p>}
          {!appointmentsLoading && scheduledToday.length === 0 && (
            <div className="empty-state">
              <p className="muted">No scheduled appointments today.</p>
              {canSchedule && (
                <button type="button" onClick={() => setBookMode('book')}>
                  Book appointment
                </button>
              )}
            </div>
          )}
          {!appointmentsLoading && scheduledToday.length > 0 && (
            <table>
              <tbody>
                {scheduledToday.map((a) => (
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
                    {canSchedule && (
                      <td>
                        <AppointmentStatusActions
                          appointmentId={a.id}
                          status={a.status}
                          role={sessionUser?.role}
                          onUpdated={refreshAfterStatus}
                          onError={setActionError}
                        />
                      </td>
                    )}
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
    orthoK: (
      <section className="panel" key="orthoK">
        <div className="panel-header">
          Ortho-K follow-ups ({orthoK ? orthoK.overdueCount + orthoK.dueCount : 0})
        </div>
        <div className="panel-body">
          {!orthoK || orthoK.rows.length === 0 ? (
            <p className="muted">No Ortho-K follow-ups due.</p>
          ) : (
            <table>
              <tbody>
                {orthoK.rows.slice(0, 10).map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/ortho-k/${row.id}`}>
                        {row.patient.lastName}, {row.patient.firstName}
                      </Link>
                    </td>
                    <td className={row.next?.state === 'OVERDUE' ? 'ok-overdue-text' : undefined}>
                      {describeDue(row.next)}
                    </td>
                    <td className="muted">{row.patient.phone ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    ),
    myTasks: (
      <section className="panel" key="myTasks">
        <div className="panel-header">My Tasks ({tasks.length})</div>
        <div className="panel-body">
          {tasks.length === 0 && <p className="muted">No open tasks.</p>}
          {tasks.length > 0 && (
            <table>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td style={{ width: '2rem' }}>
                      <input
                        type="checkbox"
                        aria-label={`Complete ${t.title}`}
                        onChange={() => void completeTask(t.id)}
                      />
                    </td>
                    <td>{t.title}</td>
                    <td className={isOverdue(t.dueDate) ? 'error-text' : 'muted'}>
                      {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form
            onSubmit={(e) => void addTask(e)}
            style={{
              display: 'flex',
              gap: '0.5rem',
              flexWrap: 'wrap',
              marginTop: '0.75rem',
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              placeholder="New task…"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              required
              style={{ flex: '1 1 10rem', minWidth: 0 }}
            />
            <input
              type="date"
              value={newTaskDue}
              onChange={(e) => setNewTaskDue(e.target.value)}
              aria-label="Due date"
            />
            <button type="submit" className="btn" disabled={addingTask || !newTaskTitle.trim()}>
              Add
            </button>
          </form>
        </div>
      </section>
    ),
    apptHistory: (
      <section className="panel" key="apptHistory">
        <div className="panel-header">Appointment History ({history.length})</div>
        <div className="panel-body" style={{ maxHeight: '20rem', overflowY: 'auto' }}>
          {history.length === 0 && (
            <p className="muted">No completed appointments in the last 30 days.</p>
          )}
          {history.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient</th>
                  <th>Provider</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {history.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {new Date(a.startsAt).toLocaleDateString()}{' '}
                      <span className="muted">
                        {new Date(a.startsAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </td>
                    <td>
                      <Link href={`/patients/${a.patient.id}`}>
                        {a.patient.lastName}, {a.patient.firstName}
                      </Link>
                    </td>
                    <td>
                      {a.provider.lastName}, {a.provider.firstName}
                    </td>
                    <td>{a.type.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    ),
    patientFlow: (
      <section className="panel" key="patientFlow">
        <div className="panel-header">Patient Flow ({inFlow.length})</div>
        <div className="panel-body">
          {appointmentsLoading && <p className="muted">Loading…</p>}
          {!appointmentsLoading && inFlow.length === 0 && (
            <div className="empty-state">
              <p className="muted">No patients in office.</p>
              {canSchedule && (
                <button type="button" onClick={() => setBookMode('walkIn')}>
                  Add walk-in
                </button>
              )}
            </div>
          )}
          {!appointmentsLoading && inFlow.length > 0 && (
            <table>
              <tbody>
                {inFlow.map((a) => (
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
                    <td>
                      {a.provider.lastName}, {a.provider.firstName}
                    </td>
                    <td>
                      <span className="badge warning">{a.status}</span>
                    </td>
                    {canSchedule && (
                      <td>
                        <AppointmentStatusActions
                          appointmentId={a.id}
                          status={a.status}
                          role={sessionUser?.role}
                          onUpdated={refreshAfterStatus}
                          onError={setActionError}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    ),
    unsignedEncounters: (
      <section className="panel" key="unsignedEncounters">
        <div className="panel-header">Unsigned Encounters ({unsigned.length})</div>
        <div className="panel-body">
          {unsigned.length === 0 && <p className="muted">All exams are signed.</p>}
          {unsigned.length > 0 && (
            <table>
              <tbody>
                {unsigned.slice(0, 15).map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.createdAt).toLocaleDateString()}</td>
                    <td>
                      <Link href={`/patients/${e.patient.id}`}>
                        {e.patient.lastName}, {e.patient.firstName}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/exams/${e.id}`}>Open exam</Link>
                    </td>
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
      <header className="today-board-header">
        <div className="today-board-title">
          <h1 className="page-header">Today</h1>
          <p className="muted today-board-date">{todayLabel}</p>
        </div>
        <div className="today-board-actions">
          {canSchedule && (
            <>
              <button type="button" onClick={() => setBookMode('book')}>
                Book appointment
              </button>
              <button type="button" className="secondary" onClick={() => setBookMode('walkIn')}>
                Walk-in
              </button>
            </>
          )}
          <Link href="/schedule" className="secondary button-link">
            Full schedule
          </Link>
        </div>
      </header>

      <div className="today-board-counts" aria-label="Today summary">
        <div className="today-count">
          <span className="today-count-value">{scheduledRemaining}</span>
          <span className="today-count-label">Scheduled</span>
        </div>
        <div className="today-count">
          <span className="today-count-value">{waitingCount}</span>
          <span className="today-count-label">Waiting</span>
        </div>
        <div className="today-count">
          <span className="today-count-value">{inOfficeCount}</span>
          <span className="today-count-label">In office</span>
        </div>
      </div>

      {actionError && <p className="error-text">{actionError}</p>}

      <div className="panel-grid">{panels.map((key) => registry[key])}</div>

      {bookMode && (
        <div
          className="book-dialog-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBookMode(null);
          }}
        >
          <div
            className="book-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-dialog-title"
          >
            <BookAppointmentForm
              className="book-dialog-form"
              title={bookMode === 'walkIn' ? 'Walk-in' : 'Book appointment'}
              defaultDate={todayDate}
              defaultWalkIn={bookMode === 'walkIn'}
              lockWalkIn={bookMode === 'walkIn'}
              onSuccess={async () => {
                setBookMode(null);
                setActionError(null);
                await loadTodayAppointments();
              }}
              onCancel={() => setBookMode(null)}
            />
          </div>
        </div>
      )}
    </AppShell>
  );
}
