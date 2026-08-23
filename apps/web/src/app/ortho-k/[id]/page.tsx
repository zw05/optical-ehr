'use client';

/**
 * One Ortho-K enrollment: the follow-up sequence in full, the visit log, and the
 * form staff use to record a check that has happened.
 *
 * Exam findings live in the paper folder — this page tracks dates and where that
 * folder is, not what was found.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import AppShell from '@/components/AppShell';
import BackButton from '@/components/BackButton';
import MilestoneStrip from '@/components/orthok/MilestoneStrip';
import { api, getSessionUser } from '@/lib/api';
import {
  describeDue,
  formatDate,
  LOGGABLE_MILESTONES,
  milestoneLabel,
  ORTHO_K_STATUSES,
  statusLabel,
  todayInputValue,
  type OrthoKEnrollment,
  type OrthoKMilestone,
  type OrthoKStatus,
} from '@/lib/orthoK';

/** Only clinical staff may retract a logged visit, matching the API's roles. */
const MAY_DELETE_VISIT = new Set(['DOCTOR', 'TECHNICIAN', 'ADMIN']);

export default function OrthoKDetailPage() {
  const params = useParams<{ id: string }>();
  const enrollmentId = params.id;
  const [enrollment, setEnrollment] = useState<OrthoKEnrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user] = useState(() => (typeof window !== 'undefined' ? getSessionUser() : null));

  const [visitDate, setVisitDate] = useState(todayInputValue());
  const [milestone, setMilestone] = useState<OrthoKMilestone | ''>('');
  const [note, setNote] = useState('');

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    startDate: '',
    status: '' as '' | OrthoKStatus,
    eyes: '',
    lensBrand: '',
    lensDesign: '',
    lensParams: '',
    folderRef: '',
    notes: '',
  });

  const load = useCallback(async () => {
    try {
      const row = await api<OrthoKEnrollment>(`/ortho-k/${enrollmentId}`);
      setEnrollment(row);
      // Default the picker to whatever check is owed next; staff can override.
      setMilestone((current) => current || (row.next?.milestone ?? 'INTERIM'));
      setForm({
        startDate: row.startDate ? row.startDate.slice(0, 10) : '',
        status: row.status,
        eyes: row.eyes ?? '',
        lensBrand: row.lensBrand ?? '',
        lensDesign: row.lensDesign ?? '',
        lensParams: row.lensParams ?? '',
        folderRef: row.folderRef ?? '',
        notes: row.notes ?? '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the enrollment');
    }
  }, [enrollmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function logVisit(event: FormEvent) {
    event.preventDefault();
    if (!milestone) return;
    setError(null);
    try {
      await api(`/ortho-k/${enrollmentId}/visits`, {
        method: 'POST',
        body: { milestone, visitDate, note: note.trim() || undefined },
      });
      setNote('');
      setVisitDate(todayInputValue());
      setMilestone('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log the visit');
    }
  }

  async function removeVisit(visitId: string) {
    setError(null);
    try {
      await api(`/ortho-k/${enrollmentId}/visits/${visitId}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove the visit');
    }
  }

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api(`/ortho-k/${enrollmentId}`, {
        method: 'PATCH',
        body: {
          startDate: form.startDate || undefined,
          status: form.status || undefined,
          eyes: form.eyes || undefined,
          lensBrand: form.lensBrand,
          lensDesign: form.lensDesign,
          lensParams: form.lensParams,
          folderRef: form.folderRef,
          notes: form.notes,
        },
      });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    }
  }

  if (error && !enrollment) {
    return (
      <AppShell>
        <BackButton fallbackHref="/ortho-k" />
        <p className="error-text">{error}</p>
      </AppShell>
    );
  }

  if (!enrollment) {
    return (
      <AppShell>
        <BackButton fallbackHref="/ortho-k" />
        <p className="muted">Loading enrollment…</p>
      </AppShell>
    );
  }

  const { patient } = enrollment;
  const canDelete = MAY_DELETE_VISIT.has(user?.role ?? '');
  const overdue = enrollment.next?.state === 'OVERDUE';

  return (
    <AppShell>
      <BackButton fallbackHref="/ortho-k" />
      <h1>
        Ortho-K — {patient.lastName}, {patient.firstName}{' '}
        <span className="badge">{statusLabel(enrollment.status)}</span>
      </h1>
      <p className="muted">
        <Link href={`/patients/${patient.id}`}>Open patient chart</Link> · {patient.mrn}
        {patient.phone ? ` · ${patient.phone}` : ''}
        {enrollment.folderRef ? ` · Folder ${enrollment.folderRef}` : ''}
      </p>

      {error && <p className="error-text">{error}</p>}

      <section className="card">
        <h2 className="ok-section-title">Follow-up sequence</h2>
        <MilestoneStrip
          milestones={enrollment.milestones}
          visits={enrollment.visits}
          size="full"
        />
        <p className={`ok-next-line${overdue ? ' ok-overdue-text' : ''}`}>
          {enrollment.startDate
            ? describeDue(enrollment.next)
            : 'Set the first night of wear to start the follow-up sequence.'}
        </p>
      </section>

      <section className="card">
        <h2 className="ok-section-title">Log a follow-up</h2>
        {enrollment.startDate ? (
          <form className="ok-log-form" onSubmit={logVisit}>
            <label>
              Visit date
              <input
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                required
              />
            </label>
            <label>
              Milestone
              <select
                value={milestone}
                onChange={(e) => setMilestone(e.target.value as OrthoKMilestone)}
                required
              >
                {LOGGABLE_MILESTONES.map((m) => (
                  <option key={m} value={m}>
                    {milestoneLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="ok-log-note">
              Note
              <input
                value={note}
                placeholder="Optional — findings stay in the paper folder"
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button type="submit">Record visit</button>
          </form>
        ) : (
          <p className="muted">
            No start date yet. Record the first night of lens wear in Program details below, and
            the follow-up schedule begins from that date.
          </p>
        )}
      </section>

      <section className="card">
        <div className="ok-card-head">
          <h2 className="ok-section-title">Program details</h2>
          <button type="button" className="secondary ok-inline-button" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {editing ? (
          <form onSubmit={saveDetails}>
            <div className="ok-enroll-grid">
              <label>
                First night of wear
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                />
                <span className="ok-hint">Changing this re-dates every follow-up.</span>
              </label>
              <label>
                Status
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as OrthoKStatus }))}
                >
                  {ORTHO_K_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Eyes
                <select
                  value={form.eyes}
                  onChange={(e) => setForm((f) => ({ ...f, eyes: e.target.value }))}
                >
                  <option value="OU">Both (OU)</option>
                  <option value="OD">Right (OD)</option>
                  <option value="OS">Left (OS)</option>
                </select>
              </label>
              <label>
                Lens brand
                <input
                  value={form.lensBrand}
                  onChange={(e) => setForm((f) => ({ ...f, lensBrand: e.target.value }))}
                />
              </label>
              <label>
                Lens design
                <input
                  value={form.lensDesign}
                  onChange={(e) => setForm((f) => ({ ...f, lensDesign: e.target.value }))}
                />
              </label>
              <label>
                Paper folder
                <input
                  value={form.folderRef}
                  onChange={(e) => setForm((f) => ({ ...f, folderRef: e.target.value }))}
                />
              </label>
              <label className="ok-enroll-wide">
                Lens parameters
                <input
                  value={form.lensParams}
                  onChange={(e) => setForm((f) => ({ ...f, lensParams: e.target.value }))}
                />
              </label>
              <label className="ok-enroll-wide">
                Notes
                <input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
            </div>
            <button type="submit">Save</button>
          </form>
        ) : (
          <dl className="detail-list">
            <div className="detail-row">
              <dt>First night of wear</dt>
              <dd className={enrollment.startDate ? undefined : 'empty'}>
                {formatDate(enrollment.startDate)}
              </dd>
            </div>
            <div className="detail-row">
              <dt>Eyes</dt>
              <dd className={enrollment.eyes ? undefined : 'empty'}>{enrollment.eyes ?? '—'}</dd>
            </div>
            <div className="detail-row">
              <dt>Lens</dt>
              <dd className={enrollment.lensBrand ? undefined : 'empty'}>
                {[enrollment.lensBrand, enrollment.lensDesign].filter(Boolean).join(' ') || '—'}
              </dd>
            </div>
            <div className="detail-row">
              <dt>Parameters</dt>
              <dd className={enrollment.lensParams ? undefined : 'empty'}>
                {enrollment.lensParams ?? '—'}
              </dd>
            </div>
            <div className="detail-row">
              <dt>Paper folder</dt>
              <dd className={enrollment.folderRef ? undefined : 'empty'}>
                {enrollment.folderRef ?? '—'}
              </dd>
            </div>
            <div className="detail-row">
              <dt>Notes</dt>
              <dd className={enrollment.notes ? undefined : 'empty'}>{enrollment.notes ?? '—'}</dd>
            </div>
          </dl>
        )}
      </section>

      <section className="card">
        <h2 className="ok-section-title">Visit log</h2>
        {enrollment.visits.length === 0 ? (
          <p className="muted">No follow-ups recorded yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Milestone</th>
                <th>Note</th>
                <th>Recorded by</th>
                {canDelete && <th />}
              </tr>
            </thead>
            <tbody>
              {enrollment.visits.map((visit) => (
                <tr key={visit.id}>
                  <td>{formatDate(visit.visitDate)}</td>
                  <td>{milestoneLabel(visit.milestone)}</td>
                  <td className={visit.note ? undefined : 'muted'}>{visit.note ?? '—'}</td>
                  <td className="muted">
                    {visit.recordedBy
                      ? `${visit.recordedBy.firstName} ${visit.recordedBy.lastName}`
                      : '—'}
                  </td>
                  {canDelete && (
                    <td>
                      <button
                        type="button"
                        className="danger ok-inline-button"
                        onClick={() => void removeVisit(visit.id)}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AppShell>
  );
}
