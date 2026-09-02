'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import ImportPanel from '@/components/ImportPanel';
import { getPermissions, Permission } from '@/lib/permissions';

interface CodeEntry {
  id: string;
  system: 'ICD10' | 'CPT' | 'HCPCS';
  code: string;
  description: string;
  category: string | null;
  isFavorite: boolean;
  isActive: boolean;
}

interface CodePage {
  rows: CodeEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ImportPlan {
  rows: {
    system: string;
    code: string;
    description: string;
    status: 'create' | 'update';
    wasDescription: string | null;
  }[];
  errors: string[];
  applied?: { created: number; updated: number };
}

const SYSTEMS = [
  { value: 'ICD10', label: 'Diagnosis (ICD-10)' },
  { value: 'CPT', label: 'Procedure (CPT)' },
  { value: 'HCPCS', label: 'Supply (HCPCS)' },
] as const;

const PAGE_SIZES = [25, 50, 100, 200];

const emptyForm = { system: 'ICD10', code: '', description: '', category: '', isFavorite: false };

const emptyPage: CodePage = { rows: [], total: 0, page: 1, pageSize: 50, totalPages: 1 };

/**
 * Page numbers to show around the current one: always the first and last, a
 * window either side of where the user is, and gaps marked with an ellipsis.
 * Keeps the control a fixed width whether the catalog has 5 pages or 500.
 */
function pageWindow(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current]);
  for (const offset of [-1, 1]) {
    const near = current + offset;
    if (near > 1 && near < total) pages.add(near);
  }
  // Keep the run wide enough that the control does not change width at the ends.
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((p) => pages.add(p));

  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) out.push('gap');
    out.push(page);
    previous = page;
  }
  return out;
}

export default function CodesSettingsPage() {
  const [system, setSystem] = useState<'ICD10' | 'CPT' | 'HCPCS'>('ICD10');
  const [result, setResult] = useState<CodePage>(emptyPage);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [showRetired, setShowRetired] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const canEdit = useMemo(() => getPermissions().includes(Permission.CODES_EDIT), []);

  // Typing re-queries the database, so settle on a value before asking.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(queryInput), 250);
    return () => clearTimeout(timer);
  }, [queryInput]);

  // Any change to what is being listed starts again from the first page.
  useEffect(() => {
    setPage(1);
  }, [system, query, showRetired, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        system,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (query.trim()) params.set('q', query.trim());
      if (showRetired) params.set('all', '1');
      const next = await api<CodePage>(`/codes?${params}`);
      setResult(next);
      // The server clamps to the last real page when a filter narrows the list.
      if (next.page !== page) setPage(next.page);
    } finally {
      setLoading(false);
    }
  }, [system, query, showRetired, page, pageSize]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, system });
    setShowForm(true);
  }

  function openEdit(entry: CodeEntry) {
    setEditingId(entry.id);
    setForm({
      system: entry.system,
      code: entry.code,
      description: entry.description,
      category: entry.category ?? '',
      isFavorite: entry.isFavorite,
    });
    setShowForm(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await api(`/codes/${editingId}`, {
          method: 'PATCH',
          body: {
            code: form.code,
            description: form.description,
            category: form.category || null,
            isFavorite: form.isFavorite,
          },
        });
      } else {
        await api('/codes', {
          method: 'POST',
          body: {
            system: form.system,
            code: form.code,
            description: form.description,
            category: form.category || null,
            isFavorite: form.isFavorite,
          },
        });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function toggleActive(entry: CodeEntry) {
    setError(null);
    try {
      if (entry.isActive) {
        await api(`/codes/${entry.id}`, { method: 'DELETE' });
      } else {
        await api(`/codes/${entry.id}`, { method: 'PATCH', body: { isActive: true } });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function toggleFavorite(entry: CodeEntry) {
    setError(null);
    try {
      await api(`/codes/${entry.id}`, {
        method: 'PATCH',
        body: { isFavorite: !entry.isFavorite },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function restoreDefaults() {
    setError(null);
    setMessage(null);
    try {
      const restored = await api<{ added: number }>('/codes/restore-defaults', { method: 'POST' });
      setMessage(
        restored.added === 0
          ? 'Nothing to restore — every bundled code is already in your catalog.'
          : `Restored ${restored.added} bundled ${restored.added === 1 ? 'code' : 'codes'}.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    }
  }

  const { rows, total, totalPages } = result;
  const firstOnPage = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastOnPage = Math.min(page * pageSize, total);

  return (
    <div className="settings-section">
      <div className="toolbar">
        {SYSTEMS.map((s) => (
          <button
            key={s.value}
            type="button"
            className={system === s.value ? '' : 'secondary'}
            onClick={() => setSystem(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="muted">
        Codes offered in the exam pickers. Retiring a code stops it being offered on new charts
        but leaves exams that already carry it untouched, so signed records keep their meaning.
      </p>

      {!canEdit && (
        <p className="muted">
          You can view the code catalog but not change it. An administrator can grant editing on
          the Accounts screen.
        </p>
      )}
      {message && <p className="settings-saved">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <ImportPanel<ImportPlan>
        templatePath="/codes/template"
        templateFilename="code-catalog-template.xlsx"
        exportPath="/codes/export"
        exportFilename="code-catalog.xlsx"
        importPath="/codes/import"
        canEdit={canEdit}
        onApplied={load}
        summarize={(plan) =>
          plan.applied
            ? `Imported ${plan.applied.created} new and ${plan.applied.updated} updated codes.`
            : 'Import complete.'
        }
        renderPreview={(plan) => (
          <>
            <p className="muted">
              {plan.rows.filter((r) => r.status === 'create').length} new,{' '}
              {plan.rows.filter((r) => r.status === 'update').length} updated.
            </p>
            <table>
              <thead>
                <tr>
                  <th>System</th>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {plan.rows.slice(0, 50).map((row) => (
                  <tr key={`${row.system}|${row.code}`}>
                    <td>{row.system}</td>
                    <td>{row.code}</td>
                    <td>
                      {row.description}
                      {row.wasDescription && row.wasDescription !== row.description && (
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          was: {row.wasDescription}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge${row.status === 'create' ? ' success' : ' warning'}`}>
                        {row.status === 'create' ? 'New' : 'Updated'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {plan.rows.length > 50 && (
              <p className="muted">…and {plan.rows.length - 50} more rows.</p>
            )}
            {plan.errors.length > 0 && (
              <p className="error-text">{plan.errors.slice(0, 5).join('; ')}</p>
            )}
          </>
        )}
      />

      <div className="toolbar">
        <button type="button" className="secondary" disabled={!canEdit} onClick={openCreate}>
          Add code
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!canEdit}
          onClick={() => void restoreDefaults()}
          title="Re-adds the bundled optometry starter codes without touching your own"
        >
          Restore bundled codes
        </button>
        <label style={{ marginBottom: 0 }}>
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
          />{' '}
          Show retired
        </label>
        <input
          type="search"
          placeholder="Search code or description"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          style={{ maxWidth: '20rem' }}
        />
      </div>

      {showForm && (
        <form className="card" onSubmit={save}>
          <h3>{editingId ? 'Edit code' : 'New code'}</h3>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="code-system">System</label>
              <select
                id="code-system"
                value={form.system}
                disabled={Boolean(editingId)}
                onChange={(e) => setForm({ ...form, system: e.target.value })}
              >
                {SYSTEMS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="code-value">Code</label>
              <input
                id="code-value"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="H52.4"
                required
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="code-description">Description</label>
              <input
                id="code-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Presbyopia"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="code-category">Category</label>
              <input
                id="code-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Diagnosis"
              />
            </div>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={form.isFavorite}
                  onChange={(e) => setForm({ ...form, isFavorite: e.target.checked })}
                />{' '}
                Show first in lookups
              </label>
            </div>
          </div>
          <div className="toolbar">
            <button type="submit">{editingId ? 'Save code' : 'Add code'}</button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="pager-summary">
        <span className="muted">
          {loading
            ? 'Loading…'
            : total === 0
              ? 'No codes match.'
              : `Showing ${firstOnPage}–${lastOnPage} of ${total} ${total === 1 ? 'code' : 'codes'}`}
        </span>
        <label className="pager-size">
          Per page{' '}
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Codes per page"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: '6rem' }}>Code</th>
            <th>Description</th>
            <th>Category</th>
            <th style={{ width: '5rem' }}>Pinned</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No codes match.
              </td>
            </tr>
          )}
          {rows.map((entry) => (
            <tr key={entry.id}>
              <td>
                <code>{entry.code}</code>
              </td>
              <td>{entry.description}</td>
              <td className="muted">{entry.category ?? '—'}</td>
              <td>
                <button
                  type="button"
                  className="secondary"
                  disabled={!canEdit}
                  aria-label={`${entry.isFavorite ? 'Unpin' : 'Pin'} ${entry.code}`}
                  onClick={() => void toggleFavorite(entry)}
                >
                  {entry.isFavorite ? '★' : '☆'}
                </button>
              </td>
              <td>
                {entry.isActive ? (
                  <span className="badge success">Offered</span>
                ) : (
                  <span className="badge">Retired</span>
                )}
              </td>
              <td>
                <button
                  type="button"
                  className="secondary"
                  disabled={!canEdit}
                  onClick={() => openEdit(entry)}
                >
                  Edit
                </button>{' '}
                <button
                  type="button"
                  className="secondary"
                  disabled={!canEdit}
                  onClick={() => void toggleActive(entry)}
                >
                  {entry.isActive ? 'Retire' : 'Restore'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {totalPages > 1 && (
        <nav className="pager" aria-label="Code catalog pages">
          <button
            type="button"
            className="secondary"
            disabled={page <= 1 || loading}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          {pageWindow(page, totalPages).map((entry, i) =>
            entry === 'gap' ? (
              <span key={`gap-${i}`} className="pager-gap" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                className={entry === page ? 'pager-page' : 'secondary pager-page'}
                aria-label={`Page ${entry}`}
                aria-current={entry === page ? 'page' : undefined}
                disabled={loading}
                onClick={() => setPage(entry)}
              >
                {entry}
              </button>
            ),
          )}
          <button
            type="button"
            className="secondary"
            disabled={page >= totalPages || loading}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
