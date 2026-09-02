'use client';

/** Practice-wide exams dashboard: status tabs, filters, sort, and search. */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';

type ExamTab = 'recent' | 'unfinished' | 'finalized' | 'voided';
type SortBy = 'createdAt' | 'patient' | 'status';
type SortOrder = 'asc' | 'desc';

interface StaffName {
  firstName: string;
  lastName: string;
}

interface InsuranceRow {
  payerName: string;
  isVision: boolean;
  priority: number;
}

interface ExamRow {
  id: string;
  status: 'IN_PROGRESS' | 'SIGNED' | 'VOIDED';
  chiefComplaint: string | null;
  assessment: string | null;
  createdAt: string;
  patient: {
    id: string;
    mrn: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    insurances: InsuranceRow[];
  };
  appointment: { provider: StaffName } | null;
  signedBy: StaffName | null;
}

interface ListResponse {
  rows: ExamRow[];
  counts: { recent: number; unfinished: number; finalized: number; voided: number };
  options: { reasons: string[]; impressions: string[]; insurances: string[] };
}

interface Filters {
  from: string;
  to: string;
  dob: string;
  insurance: string;
  reason: string;
  impression: string;
}

const EMPTY_FILTERS: Filters = {
  from: '',
  to: '',
  dob: '',
  insurance: '',
  reason: '',
  impression: '',
};

const TABS: { key: ExamTab; label: string }[] = [
  { key: 'recent', label: 'Recent Exams' },
  { key: 'unfinished', label: 'Unfinished Exams' },
  { key: 'finalized', label: 'Finalized Exams' },
  { key: 'voided', label: 'Voided Exams' },
];

function pickInsurance(insurances: InsuranceRow[], vision: boolean): string {
  const match = insurances.find((i) => i.isVision === vision);
  return match?.payerName ?? '—';
}

function providerLabel(row: ExamRow): string {
  const person = row.appointment?.provider ?? row.signedBy;
  return person ? `${person.lastName}, ${person.firstName}` : '—';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function statusLabel(status: ExamRow['status']): string {
  if (status === 'SIGNED') return 'Finalized';
  if (status === 'VOIDED') return 'Voided';
  return 'In Progress';
}

function statusBadgeClass(status: ExamRow['status']): string {
  if (status === 'SIGNED') return 'success';
  if (status === 'VOIDED') return 'danger';
  return 'warning';
}

export default function ExamsPage() {
  const [tab, setTab] = useState<ExamTab>('recent');
  const [sortBy, setSortBy] = useState<SortBy>('createdAt');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<ExamRow[]>([]);
  const [counts, setCounts] = useState({ recent: 0, unfinished: 0, finalized: 0, voided: 0 });
  const [options, setOptions] = useState({ reasons: [] as string[], impressions: [] as string[], insurances: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setQ(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('tab', tab);
      params.set('sortBy', sortBy);
      params.set('order', order);
      if (q) params.set('q', q);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      if (filters.dob) params.set('dob', filters.dob);
      if (filters.insurance) params.set('insurance', filters.insurance);
      if (filters.reason) params.set('reason', filters.reason);
      if (filters.impression) params.set('impression', filters.impression);

      const data = await api<ListResponse>(`/encounters?${params.toString()}`);
      setRows(data.rows);
      setCounts(data.counts);
      setOptions(data.options);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exams');
    } finally {
      setLoading(false);
    }
  }, [tab, sortBy, order, q, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setSearchInput('');
    setQ('');
  }

  return (
    <AppShell>
      <h1>Patient Exam</h1>

      <div className="subtabs" role="tablist" aria-label="Exam status">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`subtab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="badge">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <label className="inline-label">
          Sort by
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} style={{ maxWidth: 180 }}>
            <option value="createdAt">Created At</option>
            <option value="patient">Patient</option>
            <option value="status">Exam Status</option>
          </select>
        </label>
        <label className="inline-label radio-group">
          <span>
            <input
              type="radio"
              name="order"
              checked={order === 'asc'}
              onChange={() => setOrder('asc')}
            />{' '}
            Ascending
          </span>
          <span>
            <input
              type="radio"
              name="order"
              checked={order === 'desc'}
              onChange={() => setOrder('desc')}
            />{' '}
            Descending
          </span>
        </label>
        <input
          type="search"
          placeholder="Type to search..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search exams"
          style={{ marginLeft: 'auto' }}
        />
      </div>

      <div className="filter-bar">
        <span className="filter-bar-label">Filter By</span>
        <label>
          From
          <input type="date" value={filters.from} onChange={(e) => updateFilter('from', e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={filters.to} onChange={(e) => updateFilter('to', e.target.value)} />
        </label>
        <label>
          Insurance
          <select value={filters.insurance} onChange={(e) => updateFilter('insurance', e.target.value)}>
            <option value="">All</option>
            {options.insurances.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date of Birth
          <input type="date" value={filters.dob} onChange={(e) => updateFilter('dob', e.target.value)} />
        </label>
        <label>
          Reason For Visit
          <select value={filters.reason} onChange={(e) => updateFilter('reason', e.target.value)}>
            <option value="">All</option>
            {options.reasons.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Impression
          <select value={filters.impression} onChange={(e) => updateFilter('impression', e.target.value)}>
            <option value="">All</option>
            {options.impressions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="secondary" onClick={resetFilters}>
          Reset Filters
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        {loading ? (
          <p className="muted">Loading exams…</p>
        ) : rows.length === 0 ? (
          <p className="muted">No exams match.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>S.No</th>
                <th>Patient</th>
                <th>Birthdate</th>
                <th>Vision Insurance</th>
                <th>Medical Insurance</th>
                <th>Reason For Visit</th>
                <th>Impression</th>
                <th>Exam Date</th>
                <th>Exam Status</th>
                <th>Provider</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>
                    <Link href={`/patients/${row.patient.id}`}>
                      {row.patient.lastName}, {row.patient.firstName}
                    </Link>
                  </td>
                  <td>{formatDate(row.patient.dateOfBirth)}</td>
                  <td>{pickInsurance(row.patient.insurances, true)}</td>
                  <td>{pickInsurance(row.patient.insurances, false)}</td>
                  <td>{row.chiefComplaint ?? '—'}</td>
                  <td>{row.assessment ?? '—'}</td>
                  <td>{formatDate(row.createdAt)}</td>
                  <td>
                    <span className={`badge ${statusBadgeClass(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td>{providerLabel(row)}</td>
                  <td>
                    <Link href={`/exams/${row.id}`}>Open</Link>
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
