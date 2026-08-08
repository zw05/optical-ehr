'use client';

/** Patient directory, search, filters, and new-patient registration. */
import { useCallback, useEffect, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import PatientSearchBox from '@/components/PatientSearchBox';
import { api } from '@/lib/api';
import { PATIENT_TAGS, patientTagLabel, type PatientTag } from '@/lib/patientTags';

interface PatientRow {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  alerts: string | null;
  tags?: PatientTag[];
  lastSeenAt: string | null;
}

interface Filters {
  category: '' | 'GLASSES' | 'CONTACT_LENS';
  tag: '' | PatientTag;
  payer: string;
  insurance: '' | 'VERIFIED' | 'UNVERIFIED' | 'NONE';
  recall: '' | 'DUE';
  lastSeen: '' | 'LAPSED_12M' | 'NEVER';
  ageGroup: '' | 'PEDIATRIC' | 'ADULT' | 'SENIOR';
  hasAlerts: boolean;
}

const EMPTY_FILTERS: Filters = {
  category: '',
  tag: '',
  payer: '',
  insurance: '',
  recall: '',
  lastSeen: '',
  ageGroup: '',
  hasAlerts: false,
};

function hasActiveFilters(filters: Filters): boolean {
  return Boolean(
    filters.category ||
    filters.tag ||
    filters.payer ||
    filters.insurance ||
    filters.recall ||
    filters.lastSeen ||
    filters.ageGroup ||
    filters.hasAlerts,
  );
}

function PatientTable({
  rows,
  onOpen,
}: {
  rows: PatientRow[];
  onOpen: (id: string) => void;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>MRN</th>
          <th>Name</th>
          <th>DOB</th>
          <th>Phone</th>
          <th>Last seen</th>
          <th>Tags</th>
          <th>Alerts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="clickable" onClick={() => onOpen(p.id)}>
            <td>{p.mrn}</td>
            <td>
              {p.lastName}, {p.firstName}
            </td>
            <td>{p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString() : '—'}</td>
            <td>{p.phone ?? '—'}</td>
            <td className={p.lastSeenAt ? undefined : 'muted'}>
              {p.lastSeenAt ? new Date(p.lastSeenAt).toLocaleDateString() : 'Never'}
            </td>
            <td>
              {p.tags && p.tags.length > 0
                ? p.tags.map((tag) => (
                  <span key={tag} className="badge" style={{ marginRight: '0.25rem' }}>
                    {patientTagLabel(tag)}
                  </span>
                ))
                : '—'}
            </td>
            <td>{p.alerts ? <span className="badge danger">{p.alerts}</span> : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PatientsPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PatientRow[]>([]);
  const [directory, setDirectory] = useState<PatientRow[]>([]);
  const [view, setView] = useState<'directory' | 'results'>('directory');
  const [showNew, setShowNew] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [payers, setPayers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zip: '',
  });

  const loadDirectory = useCallback(async () => {
    setDirectoryLoading(true);
    setError(null);
    try {
      const rows = await api<PatientRow[]>('/patients/directory?take=200');
      setDirectory(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load patients');
      setDirectory([]);
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDirectory();
    api<{ payers: string[] }>('/patients/filter-options')
      .then((data) => setPayers(data.payers))
      .catch(() => setPayers([]));
  }, [loadDirectory]);

  const loadResults = useCallback(async (q: string, nextFilters: Filters) => {
    const active = hasActiveFilters(nextFilters);
    const trimmed = q.trim();
    if (!trimmed && !active) {
      setResults([]);
      setView('directory');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (trimmed) params.set('q', trimmed);
      if (nextFilters.category) params.set('category', nextFilters.category);
      if (nextFilters.tag) params.set('tag', nextFilters.tag);
      if (nextFilters.payer) params.set('payer', nextFilters.payer);
      if (nextFilters.insurance) params.set('insurance', nextFilters.insurance);
      if (nextFilters.recall) params.set('recall', nextFilters.recall);
      if (nextFilters.lastSeen) params.set('lastSeen', nextFilters.lastSeen);
      if (nextFilters.ageGroup) params.set('ageGroup', nextFilters.ageGroup);
      if (nextFilters.hasAlerts) params.set('hasAlerts', '1');

      const rows = await api<PatientRow[]>(`/patients?${params.toString()}`);
      setResults(rows);
      setView('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search patients');
      setResults([]);
      setView('results');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasActiveFilters(filters)) return;
    void loadResults(query, filters);
    // Intentionally omit `query`: free-text applies on Search submit; filters apply live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, loadResults]);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    await loadResults(query, filters);
  }

  function runSearch() {
    void search();
  }

  function clearAll() {
    setQuery('');
    setFilters(EMPTY_FILTERS);
    setResults([]);
    setView('directory');
    setError(null);
  }

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    if (!query.trim()) {
      setResults([]);
      setView('directory');
    } else {
      void loadResults(query, EMPTY_FILTERS);
    }
  }

  async function createPatient(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const patient = await api<PatientRow>('/patients', {
        method: 'POST',
        body: {
          firstName: form.firstName,
          lastName: form.lastName,
          dateOfBirth: form.dateOfBirth || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          address: form.address || undefined,
          city: form.city || undefined,
          state: form.state || undefined,
          zip: form.zip || undefined,
        },
      });
      router.push(`/patients/${patient.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create patient');
    }
  }

  const showingResults = view === 'results';
  const filtersActive = hasActiveFilters(filters);
  const openPatient = (id: string) => router.push(`/patients/${id}`);

  return (
    <AppShell>
      <h1 className="page-header">Patients</h1>
      <div className="toolbar">
        <button className="secondary" onClick={() => setShowNew((v) => !v)}>
          {showNew ? 'Close' : 'New patient'}
        </button>
        <button className="secondary" onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? 'Hide filters' : 'Filters'}
          {filtersActive ? ' *' : ''}
        </button>
        <form className="toolbar-end" onSubmit={search}>
          <PatientSearchBox
            value={query}
            onChange={setQuery}
            onSubmit={runSearch}
            onSelect={(p) => router.push(`/patients/${p.id}`)}
          />
          <button type="submit">Search</button>
          {(showingResults || query || filtersActive) && (
            <button type="button" className="secondary" onClick={clearAll}>
              Clear
            </button>
          )}
        </form>
      </div>

      {showFilters && (
        <div className="filter-bar">
          <span className="filter-bar-label">Filter By</span>
          <label>
            Category
            <select
              value={filters.category}
              onChange={(e) => updateFilter('category', e.target.value as Filters['category'])}
            >
              <option value="">All</option>
              <option value="GLASSES">Glasses</option>
              <option value="CONTACT_LENS">Contact lens</option>
            </select>
          </label>
          <label>
            Program
            <select value={filters.tag} onChange={(e) => updateFilter('tag', e.target.value as Filters['tag'])}>
              <option value="">All</option>
              {PATIENT_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {patientTagLabel(tag)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payer
            <select value={filters.payer} onChange={(e) => updateFilter('payer', e.target.value)}>
              <option value="">All</option>
              {payers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Insurance
            <select
              value={filters.insurance}
              onChange={(e) => updateFilter('insurance', e.target.value as Filters['insurance'])}
            >
              <option value="">All</option>
              <option value="VERIFIED">Verified</option>
              <option value="UNVERIFIED">Unverified</option>
              <option value="NONE">None on file</option>
            </select>
          </label>
          <label>
            Recall
            <select
              value={filters.recall}
              onChange={(e) => updateFilter('recall', e.target.value as Filters['recall'])}
            >
              <option value="">All</option>
              <option value="DUE">Due in 30 days</option>
            </select>
          </label>
          <label>
            Last seen
            <select
              value={filters.lastSeen}
              onChange={(e) => updateFilter('lastSeen', e.target.value as Filters['lastSeen'])}
            >
              <option value="">All</option>
              <option value="LAPSED_12M">No exam in 12 months</option>
              <option value="NEVER">Never examined</option>
            </select>
          </label>
          <label>
            Age
            <select
              value={filters.ageGroup}
              onChange={(e) => updateFilter('ageGroup', e.target.value as Filters['ageGroup'])}
            >
              <option value="">All</option>
              <option value="PEDIATRIC">Pediatric (&lt;18)</option>
              <option value="ADULT">Adult (18–64)</option>
              <option value="SENIOR">Senior (65+)</option>
            </select>
          </label>
          <label className="inline-label" style={{ alignSelf: 'flex-end', minWidth: 'auto', maxWidth: 'none' }}>
            <input
              type="checkbox"
              checked={filters.hasAlerts}
              onChange={(e) => updateFilter('hasAlerts', e.target.checked)}
            />
            Has alerts
          </label>
          <button type="button" className="secondary" onClick={resetFilters}>
            Reset Filters
          </button>
        </div>
      )}

      {showNew && (
        <form className="card" onSubmit={createPatient}>
          <h2>Register patient</h2>
          <div className="grid-3">
            <div className="field">
              <label>First name</label>
              <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="field">
              <label>Last name</label>
              <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div className="field">
              <label>Date of Birth</label>
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Address</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="field">
              <label>City</label>
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="field">
              <label>State</label>
              <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
            <div className="field">
              <label>ZIP</label>
              <input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
            </div>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button type="submit">Create chart</button>
        </form>
      )}

      {error && !showNew && <p className="error-text">{error}</p>}

      {showingResults ? (
        <section className="panel">
          <div className="panel-header">
            Matching patients ({loading ? '…' : results.length})
          </div>
          <div className="panel-body">
            {loading ? (
              <p className="muted">Searching…</p>
            ) : results.length === 0 ? (
              <p className="muted">No matching patients.</p>
            ) : (
              <PatientTable rows={results} onOpen={openPatient} />
            )}
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-header">
            All patients ({directoryLoading ? '…' : directory.length})
          </div>
          <div className="panel-body">
            {directoryLoading ? (
              <p className="muted">Loading patients…</p>
            ) : directory.length === 0 ? (
              <p className="muted">No patients on file yet. Register a chart to get started.</p>
            ) : (
              <PatientTable rows={directory} onOpen={openPatient} />
            )}
          </div>
        </section>
      )}
    </AppShell>
  );
}
