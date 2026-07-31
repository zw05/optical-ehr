'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { MOCK_PATIENTS, type MockPatient } from './mockData';

function ageFromDob(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function relativeViewed(viewedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - viewedAt) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function initials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

export default function DemoPatients() {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<'recent' | 'results'>('recent');
  const [category, setCategory] = useState('');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOCK_PATIENTS.filter((p) => {
      const matchesQuery =
        !q ||
        p.lastName.toLowerCase().includes(q) ||
        p.firstName.toLowerCase().includes(q) ||
        p.mrn.toLowerCase().includes(q);
      const matchesCategory =
        !category ||
        p.tags.some((t) => t.toLowerCase().includes(category.toLowerCase().replace('_', ' ')));
      return matchesQuery && matchesCategory;
    });
  }, [query, category]);

  function runSearch(e?: FormEvent) {
    e?.preventDefault();
    setView(query.trim() || category ? 'results' : 'recent');
  }

  function clearAll() {
    setQuery('');
    setCategory('');
    setView('recent');
  }

  const recent = MOCK_PATIENTS.filter((p) => p.viewedAt).sort(
    (a, b) => (b.viewedAt ?? 0) - (a.viewedAt ?? 0),
  );

  return (
    <>
      <div className="mn-toolbar">
        <button type="button" className="mn-btn secondary">
          New patient
        </button>
        <button type="button" className="mn-btn secondary" onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? 'Hide filters' : 'Filters'}
          {category ? ' ·' : ''}
        </button>
        <form className="mn-toolbar-end" onSubmit={runSearch}>
          <input
            type="search"
            placeholder="Search name or MRN…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search patients"
          />
          <button type="submit" className="mn-btn accent">
            Search
          </button>
          {(view === 'results' || query || category) && (
            <button type="button" className="mn-btn ghost" onClick={clearAll}>
              Clear
            </button>
          )}
        </form>
      </div>

      {showFilters && (
        <div className="mn-filter-bar">
          <span className="mn-filter-label">Filter</span>
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All</option>
              <option value="glasses">Glasses</option>
              <option value="contact">Contact lens</option>
            </select>
          </label>
          <label>
            Insurance
            <select defaultValue="">
              <option value="">All</option>
              <option value="VERIFIED">Verified</option>
              <option value="UNVERIFIED">Unverified</option>
            </select>
          </label>
          <label>
            Age
            <select defaultValue="">
              <option value="">All</option>
              <option value="PEDIATRIC">Pediatric</option>
              <option value="ADULT">Adult</option>
              <option value="SENIOR">Senior</option>
            </select>
          </label>
          <button
            type="button"
            className="mn-btn ghost"
            onClick={() => {
              setCategory('');
              setView(query.trim() ? 'results' : 'recent');
            }}
          >
            Reset
          </button>
        </div>
      )}

      {view === 'results' ? (
        <section className="mn-panel">
          <div className="mn-panel-head">
            <span className="mn-panel-title">Matching patients</span>
            <span className="mn-panel-count">{results.length}</span>
          </div>
          <div className="mn-panel-body">
            {results.length === 0 ? (
              <p className="mn-muted">No matching patients.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>MRN</th>
                    <th>Name</th>
                    <th>DOB</th>
                    <th>Phone</th>
                    <th>Tags</th>
                    <th>Alerts</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((p: MockPatient) => (
                    <tr key={p.id} className="clickable">
                      <td className="mn-mono">{p.mrn}</td>
                      <td>
                        {p.lastName}, {p.firstName}
                      </td>
                      <td className="mn-mono">{new Date(p.dateOfBirth).toLocaleDateString()}</td>
                      <td className="mn-mono">{p.phone ?? '—'}</td>
                      <td>
                        {p.tags.length > 0
                          ? p.tags.map((tag) => (
                              <span key={tag} className="mn-tag" style={{ marginRight: 4 }}>
                                {tag}
                              </span>
                            ))
                          : '—'}
                      </td>
                      <td>
                        {p.alerts ? <span className="mn-badge danger">{p.alerts}</span> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      ) : (
        <section className="mn-panel">
          <div className="mn-panel-head">
            <span className="mn-panel-title">Recent patients</span>
            <span className="mn-panel-count">{recent.length}</span>
          </div>
          <div className="mn-panel-body">
            <div className="mn-card-grid">
              {recent.map((p) => (
                <button key={p.id} type="button" className="mn-patient-card">
                  <div className="mn-avatar" aria-hidden>
                    {initials(p.firstName, p.lastName)}
                  </div>
                  <div className="mn-patient-card-body">
                    <div className="mn-patient-card-name">
                      {p.lastName}, {p.firstName}
                    </div>
                    <div className="mn-patient-card-meta">
                      {p.mrn} · Age {ageFromDob(p.dateOfBirth)}
                    </div>
                    {p.alerts && <span className="mn-badge danger">{p.alerts}</span>}
                    <div className="mn-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                      Viewed {relativeViewed(p.viewedAt!)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
