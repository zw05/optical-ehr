'use client';

/** Practice catalog of insurance payers accepted at the front desk. */
import { useCallback, useEffect, useState, FormEvent } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';

interface AcceptedPayer {
  id: string;
  name: string;
  notes: string | null;
  isVision: boolean;
  isActive: boolean;
}

export default function InsuranceCatalogPage() {
  const [payers, setPayers] = useState<AcceptedPayer[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', notes: '', isVision: true });

  const load = useCallback(async () => {
    const qs = showInactive ? '?all=1' : '';
    setPayers(await api<AcceptedPayer[]>(`/accepted-payers${qs}`));
  }, [showInactive]);

  useEffect(() => {
    void load().catch(() => setPayers([]));
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm({ name: '', notes: '', isVision: true });
    setShowForm(true);
    setError(null);
  }

  function openEdit(payer: AcceptedPayer) {
    setEditingId(payer.id);
    setForm({
      name: payer.name,
      notes: payer.notes ?? '',
      isVision: payer.isVision,
    });
    setShowForm(true);
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (editingId) {
        await api(`/accepted-payers/${editingId}`, {
          method: 'PATCH',
          body: {
            name: form.name,
            notes: form.notes || undefined,
            isVision: form.isVision,
          },
        });
      } else {
        await api('/accepted-payers', {
          method: 'POST',
          body: {
            name: form.name,
            notes: form.notes || undefined,
            isVision: form.isVision,
          },
        });
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function setActive(id: string, isActive: boolean) {
    setError(null);
    try {
      await api(`/accepted-payers/${id}`, { method: 'PATCH', body: { isActive } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  const visible = showInactive ? payers : payers.filter((p) => p.isActive);

  return (
    <AppShell>
      <h1>Accepted insurance</h1>
      <p className="muted" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
        Maintain the list of insurance types this practice accepts. Patient policies still live on
        each chart. Frame and lens retail prices are managed under Inventory.
      </p>
      <div className="toolbar">
        <button className="secondary" onClick={openCreate}>
          Add payer
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>
      {error && <p className="error-text">{error}</p>}

      {showForm && (
        <form className="card" onSubmit={save}>
          <h2>{editingId ? 'Edit payer' : 'Add payer'}</h2>
          <div className="grid-2">
            <div className="field">
              <label>Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. VSP, EyeMed"
              />
            </div>
            <div className="field">
              <label>Type</label>
              <select
                value={form.isVision ? 'vision' : 'medical'}
                onChange={(e) => setForm({ ...form, isVision: e.target.value === 'vision' })}
              >
                <option value="vision">Vision</option>
                <option value="medical">Medical</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Optional notes for front desk"
            />
          </div>
          <div className="toolbar">
            <button type="submit">Save</button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="card">
        {visible.length === 0 ? (
          <p className="muted">No payers in the catalog yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Notes</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((payer) => (
                <tr key={payer.id}>
                  <td>{payer.name}</td>
                  <td>{payer.isVision ? 'Vision' : 'Medical'}</td>
                  <td className="muted">{payer.notes ?? '—'}</td>
                  <td>
                    <span className={`badge ${payer.isActive ? 'success' : 'warning'}`}>
                      {payer.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="secondary"
                      style={{ marginRight: 4, padding: '0.2rem 0.55rem' }}
                      onClick={() => openEdit(payer)}
                    >
                      Edit
                    </button>
                    {payer.isActive ? (
                      <button
                        className="secondary"
                        style={{ padding: '0.2rem 0.55rem' }}
                        onClick={() => setActive(payer.id, false)}
                      >
                        Deactivate
                      </button>
                    ) : (
                      <button
                        className="secondary"
                        style={{ padding: '0.2rem 0.55rem' }}
                        onClick={() => setActive(payer.id, true)}
                      >
                        Reactivate
                      </button>
                    )}
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
