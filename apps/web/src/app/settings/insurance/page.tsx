'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import MoneyInput from '@/components/MoneyInput';

interface Payer {
  id: string;
  name: string;
  notes: string | null;
  eligibilityNotes: string | null;
  phone: string | null;
  fax: string | null;
  website: string | null;
  payerId: string | null;
  frameAllowance: string | number | null;
  lensAllowance: string | number | null;
  examCopay: string | number | null;
  requiresAuth: boolean;
  isVision: boolean;
  isActive: boolean;
}

const empty = {
  name: '',
  notes: '',
  eligibilityNotes: '',
  phone: '',
  fax: '',
  website: '',
  payerId: '',
  frameAllowance: '',
  lensAllowance: '',
  examCopay: '',
  requiresAuth: false,
  isVision: true,
};

export default function InsuranceSettingsPage() {
  const [payers, setPayers] = useState<Payer[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setPayers(await api<Payer[]>(`/accepted-payers${showInactive ? '?all=1' : ''}`));
  }, [showInactive]);

  useEffect(() => {
    void load().catch(() => setPayers([]));
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(empty);
    setShowForm(true);
  }

  function openEdit(p: Payer) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      notes: p.notes ?? '',
      eligibilityNotes: p.eligibilityNotes ?? '',
      phone: p.phone ?? '',
      fax: p.fax ?? '',
      website: p.website ?? '',
      payerId: p.payerId ?? '',
      frameAllowance: p.frameAllowance != null ? String(p.frameAllowance) : '',
      lensAllowance: p.lensAllowance != null ? String(p.lensAllowance) : '',
      examCopay: p.examCopay != null ? String(p.examCopay) : '',
      requiresAuth: p.requiresAuth,
      isVision: p.isVision,
    });
    setShowForm(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const body = {
      name: form.name,
      notes: form.notes || undefined,
      eligibilityNotes: form.eligibilityNotes || undefined,
      phone: form.phone || undefined,
      fax: form.fax || undefined,
      website: form.website || undefined,
      payerId: form.payerId || undefined,
      frameAllowance: form.frameAllowance ? Number(form.frameAllowance) : undefined,
      lensAllowance: form.lensAllowance ? Number(form.lensAllowance) : undefined,
      examCopay: form.examCopay ? Number(form.examCopay) : undefined,
      requiresAuth: form.requiresAuth,
      isVision: form.isVision,
    };
    try {
      if (editingId) await api(`/accepted-payers/${editingId}`, { method: 'PATCH', body });
      else await api('/accepted-payers', { method: 'POST', body });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Accepted insurance</h2>
        <button type="button" className="secondary" onClick={openCreate}>Add payer</button>
        <label>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
        </label>
      </div>
      <p className="muted">These types appear when adding a policy on a patient chart.</p>
      {error && <p className="error-text">{error}</p>}

      {showForm && (
        <form className="card" onSubmit={save}>
          <h3>{editingId ? 'Edit payer' : 'Add payer'}</h3>
          <div className="grid-2">
            <div className="field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Payer ID</label>
              <input value={form.payerId} onChange={(e) => setForm({ ...form, payerId: e.target.value })} />
            </div>
            <div className="field">
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>Fax</label>
              <input value={form.fax} onChange={(e) => setForm({ ...form, fax: e.target.value })} />
            </div>
            <div className="field">
              <label>Website / portal</label>
              <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={form.isVision ? 'vision' : 'medical'} onChange={(e) => setForm({ ...form, isVision: e.target.value === 'vision' })}>
                <option value="vision">Vision</option>
                <option value="medical">Medical</option>
              </select>
            </div>
            <div className="field">
              <label>Frame allowance</label>
              <MoneyInput value={form.frameAllowance} onChange={(e) => setForm({ ...form, frameAllowance: e.target.value })} />
            </div>
            <div className="field">
              <label>Lens allowance</label>
              <MoneyInput value={form.lensAllowance} onChange={(e) => setForm({ ...form, lensAllowance: e.target.value })} />
            </div>
            <div className="field">
              <label>Exam copay</label>
              <MoneyInput value={form.examCopay} onChange={(e) => setForm({ ...form, examCopay: e.target.value })} />
            </div>
            <div className="field">
              <label>
                <input type="checkbox" checked={form.requiresAuth} onChange={(e) => setForm({ ...form, requiresAuth: e.target.checked })} /> Requires authorization
              </label>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Front-desk notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Eligibility notes</label>
              <textarea value={form.eligibilityNotes} onChange={(e) => setForm({ ...form, eligibilityNotes: e.target.value })} />
            </div>
          </div>
          <div className="toolbar">
            <button type="submit">Save</button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {payers.map((p) => (
        <div key={p.id} className="card">
          <div className="toolbar">
            <strong>{p.name}</strong>
            <span className="badge">{p.isVision ? 'Vision' : 'Medical'}</span>
            {!p.isActive && <span className="badge warning">Inactive</span>}
            <button type="button" className="secondary" onClick={() => openEdit(p)}>Edit</button>
            <button
              type="button"
              className="secondary"
              onClick={() => void api(`/accepted-payers/${p.id}`, { method: 'PATCH', body: { isActive: !p.isActive } }).then(load)}
            >
              {p.isActive ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
          <p className="muted" style={{ marginBottom: 0 }}>
            {[p.payerId, p.phone, p.website].filter(Boolean).join(' · ') || 'No extra details'}
            {p.requiresAuth ? ' · Auth required' : ''}
          </p>
        </div>
      ))}
    </div>
  );
}
