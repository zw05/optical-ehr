'use client';

/**
 * The Ortho-K program board: every patient in the orthokeratology program, the
 * follow-up each one is owed next, and a needs-attention panel for the checks
 * that have slipped.
 *
 * Ortho-K exams stay in the paper folder, so nothing here records findings —
 * staff log the date a follow-up happened and the board works out what is due.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import PatientSearchBox, { type PatientSuggestion } from '@/components/PatientSearchBox';
import { api } from '@/lib/api';
import {
  describeDue,
  formatDate,
  milestoneLabel,
  ORTHO_K_STATUSES,
  statusLabel,
  todayInputValue,
  type MilestoneState,
  type OrthoKEnrollment,
  type OrthoKStatus,
} from '@/lib/orthoK';

const EMPTY_ENROLL = {
  patientId: '',
  patientLabel: '',
  startDate: '',
  eyes: 'OU',
  lensBrand: '',
  lensDesign: '',
  lensParams: '',
  notes: '',
};

/** Cards at the top of the board: the follow-ups someone has to chase today. */
function NeedsAttention({
  rows,
  onLog,
}: {
  rows: OrthoKEnrollment[];
  onLog: (row: OrthoKEnrollment) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="card ok-attention">
      <h2 className="ok-section-title">
        Needs attention <span className="badge danger">{rows.length}</span>
      </h2>
      <div className="ok-attention-grid">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`ok-attention-card ok-attention-${row.next?.state.toLowerCase()}`}
          >
            <div className="ok-attention-head">
              <Link href={`/ortho-k/${row.id}`} className="ok-attention-name">
                {row.patient.lastName}, {row.patient.firstName}
              </Link>
              <span className="badge">{row.patient.mrn}</span>
            </div>
            <p className="ok-attention-due">{describeDue(row.next)}</p>
            <p className="muted">{row.patient.phone ?? 'No phone on file'}</p>
            <button
              type="button"
              className="secondary ok-inline-button"
              onClick={() => onLog(row)}
            >
              Log visit
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function OrthoKPage() {
  const [rows, setRows] = useState<OrthoKEnrollment[]>([]);
  const [status, setStatus] = useState<'' | OrthoKStatus>('');
  const [state, setState] = useState<'' | MilestoneState>('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEnroll, setShowEnroll] = useState(false);
  const [enroll, setEnroll] = useState(EMPTY_ENROLL);

  // Quick-log form opened from a needs-attention card.
  const [logFor, setLogFor] = useState<OrthoKEnrollment | null>(null);
  const [logDate, setLogDate] = useState(todayInputValue());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (state) params.set('state', state);
      if (query.trim()) params.set('q', query.trim());
      const search = params.toString();
      setRows(await api<OrthoKEnrollment[]>(`/ortho-k${search ? `?${search}` : ''}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the Ortho-K board');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, state, query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitEnroll(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!enroll.patientId) {
      setError('Choose a patient to enroll');
      return;
    }
    try {
      await api('/ortho-k', {
        method: 'POST',
        body: {
          patientId: enroll.patientId,
          startDate: enroll.startDate || undefined,
          eyes: enroll.eyes || undefined,
          lensBrand: enroll.lensBrand || undefined,
          lensDesign: enroll.lensDesign || undefined,
          lensParams: enroll.lensParams || undefined,
          notes: enroll.notes || undefined,
        },
      });
      setEnroll(EMPTY_ENROLL);
      setShowEnroll(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enroll patient');
    }
  }

  async function submitLog(event: FormEvent) {
    event.preventDefault();
    if (!logFor?.next) return;
    setError(null);
    try {
      await api(`/ortho-k/${logFor.id}/visits`, {
        method: 'POST',
        body: { milestone: logFor.next.milestone, visitDate: logDate },
      });
      setLogFor(null);
      setLogDate(todayInputValue());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log the visit');
    }
  }

  const attention = rows.filter(
    (r) => r.next?.state === 'OVERDUE' || r.next?.state === 'DUE',
  );

  return (
    <AppShell>
      <h1 className="page-header">Ortho-K</h1>
      <p className="muted ok-intro">
        Orthokeratology patients and their follow-up sequence. Exam findings stay in the paper
        folder — record the date each follow-up happened and the board tracks what is due.
      </p>

      <div className="toolbar">
        <button className="secondary" onClick={() => setShowEnroll((v) => !v)}>
          {showEnroll ? 'Close' : 'Enroll patient'}
        </button>
        <div className="toolbar-end ok-filters">
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as OrthoKStatus | '')}>
              <option value="">Active programs</option>
              {ORTHO_K_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Follow-up
            <select value={state} onChange={(e) => setState(e.target.value as MilestoneState | '')}>
              <option value="">All</option>
              <option value="OVERDUE">Overdue</option>
              <option value="DUE">Due now</option>
              <option value="UPCOMING">Upcoming</option>
            </select>
          </label>
          <label>
            Patient
            <input
              type="search"
              value={query}
              placeholder="Name or MRN"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {showEnroll && (
        <form className="card ok-enroll" onSubmit={submitEnroll}>
          <h2 className="ok-section-title">Enroll a patient</h2>
          <div className="ok-enroll-grid">
            <label className="ok-enroll-wide">
              Patient
              {enroll.patientId ? (
                <div className="ok-chosen">
                  <span>{enroll.patientLabel}</span>
                  <button
                    type="button"
                    className="secondary ok-inline-button"
                    onClick={() => setEnroll((f) => ({ ...f, patientId: '', patientLabel: '' }))}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <PatientSearchBox
                  value={enroll.patientLabel}
                  onChange={(v) => setEnroll((f) => ({ ...f, patientLabel: v }))}
                  onSubmit={() => undefined}
                  onSelect={(p: PatientSuggestion) =>
                    setEnroll((f) => ({
                      ...f,
                      patientId: p.id,
                      patientLabel: `${p.lastName}, ${p.firstName} (${p.mrn})`,
                    }))
                  }
                />
              )}
            </label>
            <label>
              First night of wear
              <input
                type="date"
                value={enroll.startDate}
                onChange={(e) => setEnroll((f) => ({ ...f, startDate: e.target.value }))}
              />
              <span className="ok-hint">Leave blank while lenses are on order.</span>
            </label>
            <label>
              Eyes
              <select
                value={enroll.eyes}
                onChange={(e) => setEnroll((f) => ({ ...f, eyes: e.target.value }))}
              >
                <option value="OU">Both (OU)</option>
                <option value="OD">Right (OD)</option>
                <option value="OS">Left (OS)</option>
              </select>
            </label>
            <label>
              Lens brand
              <input
                value={enroll.lensBrand}
                onChange={(e) => setEnroll((f) => ({ ...f, lensBrand: e.target.value }))}
              />
            </label>
            <label>
              Lens design
              <input
                value={enroll.lensDesign}
                onChange={(e) => setEnroll((f) => ({ ...f, lensDesign: e.target.value }))}
              />
            </label>
            <label className="ok-enroll-wide">
              Lens parameters
              <input
                value={enroll.lensParams}
                placeholder="OD 8.6 / -2.75 / 33.0   OS 8.7 / -2.50 / 33.0"
                onChange={(e) => setEnroll((f) => ({ ...f, lensParams: e.target.value }))}
              />
            </label>
            <label className="ok-enroll-wide">
              Notes
              <input
                value={enroll.notes}
                onChange={(e) => setEnroll((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
          </div>
          <button type="submit">Enroll</button>
        </form>
      )}

      {logFor && (
        <form className="card ok-quicklog" onSubmit={submitLog}>
          <h2 className="ok-section-title">
            Log {milestoneLabel(logFor.next?.milestone ?? '')} — {logFor.patient.lastName},{' '}
            {logFor.patient.firstName}
          </h2>
          <div className="ok-quicklog-row">
            <label>
              Visit date
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                required
              />
            </label>
            <button type="submit">Record visit</button>
            <button type="button" className="secondary" onClick={() => setLogFor(null)}>
              Cancel
            </button>
            <Link href={`/ortho-k/${logFor.id}`} className="ok-detail-link">
              Open full record
            </Link>
          </div>
        </form>
      )}

      {!state && <NeedsAttention rows={attention} onLog={setLogFor} />}

      <div className="card">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No patients on the Ortho-K board.</p>
        ) : (
          <table className="ok-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Started</th>
                <th>Last visit</th>
                <th>Next due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                // The API returns visits newest first, so the head of the list is
                // the most recent follow-up, interim visits included.
                const lastVisit = row.visits[0];
                return (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/ortho-k/${row.id}`}>
                        {row.patient.lastName}, {row.patient.firstName}
                      </Link>
                      <div className="muted">{row.patient.mrn}</div>
                    </td>
                    <td>{formatDate(row.startDate)}</td>
                    <td className={lastVisit ? undefined : 'muted'}>
                      {lastVisit ? (
                        <>
                          {formatDate(lastVisit.visitDate)}
                          <div className="muted">{milestoneLabel(lastVisit.milestone)}</div>
                        </>
                      ) : (
                        'None yet'
                      )}
                    </td>
                    <td className={row.next?.state === 'OVERDUE' ? 'ok-overdue-text' : undefined}>
                      {describeDue(row.next)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
