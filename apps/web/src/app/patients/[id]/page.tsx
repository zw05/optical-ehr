'use client';

/** Single patient chart: demographics, insurance, exams, prescriptions, documents, print Rx PDF. */
import { useCallback, useEffect, useState, FormEvent, ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import BackButton from '@/components/BackButton';
import { PatientDocumentsPanel } from '@/components/documents/PatientDocumentsPanel';
import { usePreferences } from '@/components/PreferencesProvider';
import { api, getSessionUser } from '@/lib/api';
import { recordRecentPatient } from '@/lib/recentPatients';
import { PATIENT_TAGS, patientTagLabel, type PatientTag } from '@/lib/patientTags';

interface PatientDetail {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  sex: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  preferredContact: string | null;
  alerts: string | null;
  notes: string | null;
  tags: PatientTag[];
  histories: { id: string; kind: string; label: string; detail: string | null; resolved: boolean }[];
  insurances: {
    id: string;
    acceptedPayerId: string | null;
    payerName: string;
    memberId: string;
    groupNumber: string | null;
    verification: string;
    priority: number;
    isVision: boolean;
  }[];
  recalls: { id: string; reason: string; dueDate: string }[];
}

interface DemoForm {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  sex: string;
  phone: string;
  email: string;
  preferredContact: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  alerts: string;
  notes: string;
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

const SEX_OPTIONS = ['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'] as const;
const CONTACT_OPTIONS = ['', 'phone', 'email', 'sms'] as const;

/** Slice an ISO timestamp to YYYY-MM-DD for <input type="date">. */
function toDateInputValue(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function ageFromDob(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const birth = new Date(iso);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return String(age);
}

/** MALE → Male, CONTACT_LENS → Contact lens. */
function titleCase(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatPhone(value: string | null | undefined): string {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value;
}

function formatAddressLines(patient: Pick<PatientDetail, 'address' | 'city' | 'state' | 'zip'>): string[] {
  const lines: string[] = [];
  if (patient.address?.trim()) lines.push(patient.address.trim());
  const cityState = [patient.city, patient.state].filter(Boolean).join(', ');
  const cityLine = [cityState, patient.zip].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  return lines;
}

function seedDemoForm(patient: PatientDetail): DemoForm {
  return {
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: toDateInputValue(patient.dateOfBirth),
    sex: patient.sex || 'UNKNOWN',
    phone: patient.phone ?? '',
    email: patient.email ?? '',
    preferredContact: patient.preferredContact ?? '',
    address: patient.address ?? '',
    city: patient.city ?? '',
    state: patient.state ?? '',
    zip: patient.zip ?? '',
    alerts: patient.alerts ?? '',
    notes: patient.notes ?? '',
  };
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  const empty =
    children == null ||
    children === '' ||
    children === '—' ||
    (typeof children === 'string' && children.trim() === '');
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd className={empty ? 'empty' : undefined}>{empty ? '—' : children}</dd>
    </div>
  );
}

function priorityLabel(priority: number): string {
  if (priority === 1) return 'Primary';
  if (priority === 2) return 'Secondary';
  return `Priority ${priority}`;
}

export default function PatientChartPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const patientId = params.id;
  const user = typeof window !== 'undefined' ? getSessionUser() : null;
  const { prefs } = usePreferences();
  const isClinical = user?.role === 'DOCTOR' || user?.role === 'TECHNICIAN' || user?.role === 'ADMIN';
  const canEditPatient =
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
  const [editing, setEditing] = useState(false);
  const [savingDemo, setSavingDemo] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [demoForm, setDemoForm] = useState<DemoForm | null>(null);

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

  function openEdit() {
    if (!patient) return;
    setDemoForm(seedDemoForm(patient));
    setDemoError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDemoError(null);
    setDemoForm(null);
  }

  async function saveDemographics(event: FormEvent) {
    event.preventDefault();
    if (!patient || !demoForm || !canEditPatient || savingDemo) return;
    setSavingDemo(true);
    setDemoError(null);
    try {
      const updated = await api<PatientDetail>(`/patients/${patientId}`, {
        method: 'PATCH',
        body: {
          firstName: demoForm.firstName.trim(),
          lastName: demoForm.lastName.trim(),
          dateOfBirth: demoForm.dateOfBirth || undefined,
          sex: demoForm.sex || 'UNKNOWN',
          phone: blankToNull(demoForm.phone),
          email: blankToNull(demoForm.email),
          preferredContact: blankToNull(demoForm.preferredContact),
          address: blankToNull(demoForm.address),
          city: blankToNull(demoForm.city),
          state: blankToNull(demoForm.state),
          zip: blankToNull(demoForm.zip),
          alerts: blankToNull(demoForm.alerts),
          notes: blankToNull(demoForm.notes),
        },
      });
      const next: PatientDetail = {
        ...patient,
        ...updated,
        // Preserve relations if the PATCH response omits includes
        histories: updated.histories ?? patient.histories,
        insurances: updated.insurances ?? patient.insurances,
        recalls: updated.recalls ?? patient.recalls,
        tags: updated.tags ?? patient.tags,
      };
      setPatient(next);
      recordRecentPatient({
        id: next.id,
        mrn: next.mrn,
        firstName: next.firstName,
        lastName: next.lastName,
        dateOfBirth: next.dateOfBirth,
        phone: next.phone,
        alerts: next.alerts,
      });
      setEditing(false);
      setDemoForm(null);
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : 'Failed to update demographics');
    } finally {
      setSavingDemo(false);
    }
  }

  async function newEncounter() {
    const encounter = await api<{ id: string }>('/encounters', {
      method: 'POST',
      body: { patientId },
    });
    window.location.href = `/exams/${encounter.id}`;
  }

  async function toggleTag(tag: PatientTag) {
    if (!patient || !canEditPatient || savingTags) return;
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

  const addressLines = formatAddressLines(patient);
  const age = ageFromDob(patient.dateOfBirth);
  const dobDisplay = patient.dateOfBirth
    ? `${formatDate(patient.dateOfBirth)}${age ? ` · ${age} yrs` : ''}`
    : null;

  return (
    <AppShell>
      <div className="page-title-row">
        <BackButton fallbackHref="/patients" />
        <h1>
          {patient.lastName}, {patient.firstName} <span className="muted">MRN {patient.mrn}</span>
        </h1>
      </div>
      {patient.alerts && (
        <p className="badge danger" role="status">
          <strong>Alert</strong>
          <span>{patient.alerts}</span>
        </p>
      )}

      <div className="grid-2">
        <section className="card">
          {editing && demoForm ? (
            <form onSubmit={saveDemographics}>
              <div className="toolbar">
                <h2 style={{ margin: 0 }}>Edit demographics</h2>
              </div>

              <div className="grid-3">
                <div className="field">
                  <label>First name</label>
                  <input
                    required
                    value={demoForm.firstName}
                    onChange={(e) => setDemoForm({ ...demoForm, firstName: e.target.value })}
                    disabled={savingDemo}
                  />
                </div>
                <div className="field">
                  <label>Last name</label>
                  <input
                    required
                    value={demoForm.lastName}
                    onChange={(e) => setDemoForm({ ...demoForm, lastName: e.target.value })}
                    disabled={savingDemo}
                  />
                </div>
                <div className="field">
                  <label>Date of birth (optional)</label>
                  <input
                    type="date"
                    value={demoForm.dateOfBirth}
                    onChange={(e) => setDemoForm({ ...demoForm, dateOfBirth: e.target.value })}
                    disabled={savingDemo}
                  />
                </div>
                <div className="field">
                  <label>Sex</label>
                  <select
                    value={demoForm.sex}
                    onChange={(e) => setDemoForm({ ...demoForm, sex: e.target.value })}
                    disabled={savingDemo}
                  >
                    {SEX_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input
                    value={demoForm.phone}
                    onChange={(e) => setDemoForm({ ...demoForm, phone: e.target.value })}
                    disabled={savingDemo}
                  />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input
                    type="email"
                    value={demoForm.email}
                    onChange={(e) => setDemoForm({ ...demoForm, email: e.target.value })}
                    disabled={savingDemo}
                  />
                </div>
                <div className="field">
                  <label>Preferred contact</label>
                  <select
                    value={demoForm.preferredContact}
                    onChange={(e) => setDemoForm({ ...demoForm, preferredContact: e.target.value })}
                    disabled={savingDemo}
                  >
                    <option value="">Not set</option>
                    {CONTACT_OPTIONS.filter(Boolean).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Address</label>
                  <input
                    value={demoForm.address}
                    onChange={(e) => setDemoForm({ ...demoForm, address: e.target.value })}
                    disabled={savingDemo}
                  />
                </div>
                <div className="field">
                  <label>City</label>
                  <input
                    value={demoForm.city}
                    onChange={(e) => setDemoForm({ ...demoForm, city: e.target.value })}
                    disabled={savingDemo}
                  />
                </div>
                <div className="field">
                  <label>State</label>
                  <input
                    value={demoForm.state}
                    onChange={(e) => setDemoForm({ ...demoForm, state: e.target.value })}
                    disabled={savingDemo}
                  />
                </div>
                <div className="field">
                  <label>ZIP</label>
                  <input
                    value={demoForm.zip}
                    onChange={(e) => setDemoForm({ ...demoForm, zip: e.target.value })}
                    disabled={savingDemo}
                  />
                </div>
              </div>

              <div className="field">
                <label>Alerts</label>
                <textarea
                  rows={2}
                  value={demoForm.alerts}
                  onChange={(e) => setDemoForm({ ...demoForm, alerts: e.target.value })}
                  disabled={savingDemo}
                  placeholder="Allergies, mobility needs, etc."
                />
              </div>
              <div className="field">
                <label>Notes</label>
                <textarea
                  rows={2}
                  value={demoForm.notes}
                  onChange={(e) => setDemoForm({ ...demoForm, notes: e.target.value })}
                  disabled={savingDemo}
                />
              </div>

              {demoError && <p className="error-text">{demoError}</p>}
              <div className="toolbar">
                <button type="submit" disabled={savingDemo}>
                  {savingDemo ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="secondary" onClick={cancelEdit} disabled={savingDemo}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="toolbar">
                <h2 style={{ margin: 0 }}>Demographics</h2>
                {canEditPatient && (
                  <button type="button" className="secondary" onClick={openEdit}>
                    Edit
                  </button>
                )}
              </div>
              <dl className="detail-list">
                <DetailRow label="Date of birth">{dobDisplay}</DetailRow>
                <DetailRow label="Sex">{titleCase(patient.sex)}</DetailRow>
                <DetailRow label="Phone">{formatPhone(patient.phone)}</DetailRow>
                <DetailRow label="Email">{patient.email}</DetailRow>
                <DetailRow label="Preferred contact">
                  {patient.preferredContact ? titleCase(patient.preferredContact) : null}
                </DetailRow>
                <DetailRow label="Address">
                  {addressLines.length > 0 ? (
                    <>
                      {addressLines.map((line) => (
                        <div key={line}>{line}</div>
                      ))}
                    </>
                  ) : null}
                </DetailRow>
                {patient.notes ? <DetailRow label="Notes">{patient.notes}</DetailRow> : null}
              </dl>
            </>
          )}
        </section>

        <section className="card">
          <h2>Insurance</h2>
          <PatientInsurancePanel
            patientId={patient.id}
            policies={patient.insurances}
            canEdit={canEditPatient}
            onChanged={() => void load()}
          />
        </section>
      </div>

      <section className="card">
        <h2>Programs</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Current programs
        </p>
        {(patient.tags?.length ?? 0) > 0 ? (
          <div className="badge-row">
            {patient.tags.map((tag) => (
              <span key={tag} className="badge">
                {patientTagLabel(tag)}
              </span>
            ))}
          </div>
        ) : (
          <p className="muted">No specialty programs tagged.</p>
        )}
        {canEditPatient && (
          <>
            <p className="muted" style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>
              Update programs
            </p>
            <div className="exam-checkbox-grid">
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
          </>
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
                  <th scope="col">Date</th>
                  <th scope="col">Template</th>
                  <th scope="col">Status</th>
                  <th scope="col">Signed by</th>
                </tr>
              </thead>
              <tbody>
                {encounters.map((e) => (
                  <tr
                    key={e.id}
                    className="clickable"
                    onClick={() => router.push(`/exams/${e.id}`)}
                  >
                    <td>{formatDate(e.createdAt)}</td>
                    <td>
                      {e.template.name} v{e.template.version}
                    </td>
                    <td>
                      <span className={`badge ${e.status === 'SIGNED' ? 'success' : 'warning'}`}>
                        {titleCase(e.status)}
                      </span>
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
                <th scope="col">Type</th>
                <th scope="col">Version</th>
                <th scope="col">Status</th>
                <th scope="col">Issued</th>
                <th scope="col">Expires</th>
                <th scope="col">Prescriber</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {prescriptions.map((rx) => (
                <tr key={rx.id}>
                  <td>{titleCase(rx.type)}</td>
                  <td>v{rx.version}</td>
                  <td>
                    <span
                      className={`badge ${
                        rx.status === 'FINALIZED' ? 'success' : rx.status === 'DRAFT' ? 'warning' : ''
                      }`}
                    >
                      {titleCase(rx.status)}
                    </span>
                  </td>
                  <td>{formatDate(rx.issuedAt)}</td>
                  <td>{formatDate(rx.expiresAt)}</td>
                  <td>Dr. {rx.prescriber.lastName}</td>
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

      <section className="card">
        <h2>Documents</h2>
        <PatientDocumentsPanel
          patientId={patientId}
          canUpload={canEditPatient}
          isClinical={isClinical}
        />
      </section>

      {patient.recalls.length > 0 && (
        <section className="card">
          <h2>Pending recalls</h2>
          <dl className="detail-list">
            {patient.recalls.map((r) => (
              <DetailRow key={r.id} label={formatDate(r.dueDate)}>
                {r.reason}
              </DetailRow>
            ))}
          </dl>
        </section>
      )}
    </AppShell>
  );
}

function PatientInsurancePanel({
  patientId,
  policies,
  canEdit,
  onChanged,
}: {
  patientId: string;
  policies: PatientDetail['insurances'];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [payers, setPayers] = useState<{ id: string; name: string; isVision: boolean }[]>([]);
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    acceptedPayerId: '',
    memberId: '',
    groupNumber: '',
    priority: '1',
  });

  useEffect(() => {
    api<{ id: string; name: string; isVision: boolean }[]>('/accepted-payers')
      .then(setPayers)
      .catch(() => setPayers([]));
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm({ acceptedPayerId: payers[0]?.id ?? '', memberId: '', groupNumber: '', priority: '1' });
    setShow(true);
    setError(null);
  }

  function openEdit(p: PatientDetail['insurances'][number]) {
    setEditingId(p.id);
    setForm({
      acceptedPayerId: p.acceptedPayerId ?? payers.find((x) => x.name === p.payerName)?.id ?? '',
      memberId: p.memberId,
      groupNumber: p.groupNumber ?? '',
      priority: String(p.priority),
    });
    setShow(true);
    setError(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body = {
        patientId,
        acceptedPayerId: form.acceptedPayerId || undefined,
        memberId: form.memberId,
        groupNumber: form.groupNumber || undefined,
        priority: Number(form.priority),
      };
      if (editingId) await api(`/insurance/${editingId}`, { method: 'PATCH', body });
      else await api('/insurance', { method: 'POST', body });
      setShow(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function verify(id: string, status: 'VERIFIED' | 'UNVERIFIED' | 'INACTIVE') {
    setError(null);
    try {
      await api(`/insurance/${id}/verification`, { method: 'PATCH', body: { status } });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    }
  }

  return (
    <>
      {canEdit && (
        <div className="toolbar">
          <button type="button" className="secondary" onClick={openCreate}>
            Add policy
          </button>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      {show && (
        <form onSubmit={save} style={{ marginBottom: '1rem' }}>
          <div className="grid-2">
            <div className="field">
              <label>Accepted payer</label>
              <select
                required
                value={form.acceptedPayerId}
                onChange={(e) => setForm({ ...form, acceptedPayerId: e.target.value })}
              >
                <option value="">Select…</option>
                {payers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.isVision ? 'Vision' : 'Medical'})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Member ID</label>
              <input required value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })} />
            </div>
            <div className="field">
              <label>Group</label>
              <input value={form.groupNumber} onChange={(e) => setForm({ ...form, groupNumber: e.target.value })} />
            </div>
            <div className="field">
              <label>Priority</label>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="1">Primary</option>
                <option value="2">Secondary</option>
                <option value="3">Tertiary</option>
              </select>
            </div>
          </div>
          <div className="toolbar">
            <button type="submit">Save policy</button>
            <button type="button" className="secondary" onClick={() => setShow(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {policies.length === 0 && <p className="muted">No policies on file.</p>}
      {policies.map((policy) => (
        <div key={policy.id} className="policy-block">
          <div className="policy-block-header">
            <strong>{policy.payerName}</strong>
            <span className={`badge ${policy.verification === 'VERIFIED' ? 'success' : 'warning'}`}>
              {titleCase(policy.verification)}
            </span>
          </div>
          <dl className="detail-list">
            <DetailRow label="Member ID">{policy.memberId}</DetailRow>
            <DetailRow label="Group">{policy.groupNumber}</DetailRow>
            <DetailRow label="Plan type">{policy.isVision ? 'Vision' : 'Medical'}</DetailRow>
            <DetailRow label="Priority">{priorityLabel(policy.priority)}</DetailRow>
          </dl>
          {canEdit && (
            <div className="toolbar">
              <button type="button" className="secondary" onClick={() => openEdit(policy)}>
                Edit
              </button>
              <button type="button" className="secondary" onClick={() => void verify(policy.id, 'VERIFIED')}>
                Verify
              </button>
            </div>
          )}
        </div>
      ))}
    </>
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
