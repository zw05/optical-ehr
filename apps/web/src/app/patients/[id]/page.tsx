'use client';

/** Single patient chart: demographics, insurance, exams, prescriptions, print Rx PDF. */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import BackButton from '@/components/BackButton';
import { usePreferences } from '@/components/PreferencesProvider';
import { api, getSessionUser } from '@/lib/api';
import { recordRecentPatient } from '@/lib/recentPatients';
import { PATIENT_TAGS, patientTagLabel, type PatientTag } from '@/lib/patientTags';

interface PatientDetail {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  alerts: string | null;
  notes: string | null;
  tags: PatientTag[];
  histories: { id: string; kind: string; label: string; detail: string | null; resolved: boolean }[];
  insurances: {
    id: string;
    payerName: string;
    memberId: string;
    groupNumber: string | null;
    verification: string;
    priority: number;
  }[];
  recalls: { id: string; reason: string; dueDate: string }[];
}

interface EncounterRow {
  id: string;
  status: string;
  createdAt: string;
  signedBy: { firstName: string; lastName: string } | null;
  template: { name: string; version: number };
}

interface PrescriptionRow {
  id: string;
  type: string;
  status: string;
  version: number;
  issuedAt: string | null;
  expiresAt: string | null;
  prescriber: { firstName: string; lastName: string };
}

export default function PatientChartPage() {
  const params = useParams<{ id: string }>();
  const patientId = params.id;
  const user = typeof window !== 'undefined' ? getSessionUser() : null;
  const { prefs } = usePreferences();
  const isClinical = user?.role === 'DOCTOR' || user?.role === 'TECHNICIAN' || user?.role === 'ADMIN';
  const canEditTags =
    user?.role === 'RECEPTIONIST' ||
    user?.role === 'TECHNICIAN' ||
    user?.role === 'DOCTOR' ||
    user?.role === 'ADMIN';

  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [encounters, setEncounters] = useState<EncounterRow[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [savingTags, setSavingTags] = useState(false);

  const load = useCallback(async () => {
    try {
      const detail = await api<PatientDetail>(`/patients/${patientId}`);
      setPatient(detail);
      recordRecentPatient({
        id: detail.id,
        mrn: detail.mrn,
        firstName: detail.firstName,
        lastName: detail.lastName,
        dateOfBirth: detail.dateOfBirth,
        phone: detail.phone,
        alerts: detail.alerts,
      });
      setPrescriptions(await api<PrescriptionRow[]>(`/prescriptions/patient/${patientId}`));
      if (isClinical) {
        setEncounters(await api<EncounterRow[]>(`/encounters/patient/${patientId}`));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chart');
    }
  }, [patientId, isClinical]);

  useEffect(() => {
    void load();
  }, [load]);

  async function newEncounter() {
    const encounter = await api<{ id: string }>('/encounters', {
      method: 'POST',
      body: { patientId },
    });
    window.location.href = `/exams/${encounter.id}`;
  }

  async function toggleTag(tag: PatientTag) {
    if (!patient || !canEditTags || savingTags) return;
    const current = patient.tags ?? [];
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    setSavingTags(true);
    setTagError(null);
    try {
      const updated = await api<PatientDetail>(`/patients/${patientId}`, {
        method: 'PATCH',
        body: { tags: next },
      });
      setPatient({ ...patient, tags: updated.tags ?? next });
    } catch (err) {
      setTagError(err instanceof Error ? err.message : 'Failed to update programs');
    } finally {
      setSavingTags(false);
    }
  }

  if (error) {
    return (
      <AppShell>
        <div className="page-title-row">
          <BackButton fallbackHref="/patients" />
        </div>
        <p className="error-text">{error}</p>
      </AppShell>
    );
  }
  if (!patient) {
    return (
      <AppShell>
        <div className="page-title-row">
          <BackButton fallbackHref="/patients" />
        </div>
        <p className="muted">Loading chart…</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="page-title-row">
        <BackButton fallbackHref="/patients" />
        <h1>
          {patient.lastName}, {patient.firstName} <span className="muted">MRN {patient.mrn}</span>
        </h1>
      </div>
      {patient.alerts && <p className="badge danger">{patient.alerts}</p>}

      <div className="grid-2">
        <section className="card">
          <h2>Demographics</h2>
          <p>
            DOB {new Date(patient.dateOfBirth).toLocaleDateString()} · {patient.sex}
            <br />
            {patient.phone ?? 'No phone'} · {patient.email ?? 'No email'}
            <br />
            {patient.address ?? 'No address on file'}
          </p>
          {patient.notes && <p className="muted">{patient.notes}</p>}
        </section>

        <section className="card">
          <h2>Insurance</h2>
          {patient.insurances.length === 0 && <p className="muted">No policies on file.</p>}
          {patient.insurances.map((policy) => (
            <p key={policy.id}>
              <strong>{policy.payerName}</strong> · Member {policy.memberId}
              {policy.groupNumber ? ` · Group ${policy.groupNumber}` : ''}{' '}
              <span className={`badge ${policy.verification === 'VERIFIED' ? 'success' : 'warning'}`}>
                {policy.verification}
              </span>
            </p>
          ))}
        </section>
      </div>

      <section className="card">
        <h2>Programs</h2>
        {(patient.tags?.length ?? 0) > 0 ? (
          <p>
            {patient.tags.map((tag) => (
              <span key={tag} className="badge" style={{ marginRight: '0.35rem' }}>
                {patientTagLabel(tag)}
              </span>
            ))}
          </p>
        ) : (
          <p className="muted">No specialty programs tagged.</p>
        )}
        {canEditTags && (
          <div className="exam-checkbox-grid" style={{ marginTop: '0.75rem' }}>
            {PATIENT_TAGS.map((tag) => (
              <label key={tag} className="exam-choice">
                <input
                  type="checkbox"
                  checked={(patient.tags ?? []).includes(tag)}
                  disabled={savingTags}
                  onChange={() => void toggleTag(tag)}
                />
                {patientTagLabel(tag)}
              </label>
            ))}
          </div>
        )}
        {tagError && <p className="error-text">{tagError}</p>}
      </section>

      {isClinical && (
        <section className="card">
          <div className="toolbar">
            <h2 style={{ margin: 0 }}>Exams</h2>
            <button onClick={newEncounter}>New exam</button>
          </div>
          {encounters.length === 0 ? (
            <p className="muted">No exams recorded.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Signed by</th>
                </tr>
              </thead>
              <tbody>
                {encounters.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/exams/${e.id}`}>{new Date(e.createdAt).toLocaleDateString()}</Link>
                    </td>
                    <td>
                      {e.template.name} v{e.template.version}
                    </td>
                    <td>
                      <span className={`badge ${e.status === 'SIGNED' ? 'success' : 'warning'}`}>{e.status}</span>
                    </td>
                    <td>{e.signedBy ? `Dr. ${e.signedBy.lastName}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className="card">
        <h2>Prescriptions</h2>
        {prescriptions.length === 0 ? (
          <p className="muted">No prescriptions.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Version</th>
                <th>Status</th>
                <th>Issued</th>
                <th>Expires</th>
                <th>Prescriber</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {prescriptions.map((rx) => (
                <tr key={rx.id}>
                  <td>{rx.type === 'SPECTACLE' ? 'Spectacle' : 'Contact lens'}</td>
                  <td>v{rx.version}</td>
                  <td>
                    <span
                      className={`badge ${
                        rx.status === 'FINALIZED' ? 'success' : rx.status === 'DRAFT' ? 'warning' : ''
                      }`}
                    >
                      {rx.status}
                    </span>
                  </td>
                  <td>{rx.issuedAt ? new Date(rx.issuedAt).toLocaleDateString() : '—'}</td>
                  <td>{rx.expiresAt ? new Date(rx.expiresAt).toLocaleDateString() : '—'}</td>
                  <td>
                    Dr. {rx.prescriber.lastName}
                  </td>
                  <td>
                    {rx.status === 'FINALIZED' && (
                      <a
                        href={`/api/reports/prescriptions/${rx.id}`}
                        onClick={(e) => printRx(e, rx.id, prefs.printing.openInNewTab)}
                      >
                        Print
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {patient.recalls.length > 0 && (
        <section className="card">
          <h2>Pending recalls</h2>
          {patient.recalls.map((r) => (
            <p key={r.id}>
              {new Date(r.dueDate).toLocaleDateString()} — {r.reason}
            </p>
          ))}
        </section>
      )}
    </AppShell>
  );
}

async function printRx(event: React.MouseEvent, prescriptionId: string, openInNewTab: boolean) {
  event.preventDefault();
  const blob = await api<Blob>(`/reports/prescriptions/${prescriptionId}`, { method: 'POST' });
  const url = URL.createObjectURL(blob);
  if (openInNewTab) {
    window.open(url, '_blank');
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = `prescription-${prescriptionId}.pdf`;
    a.click();
  }
}
