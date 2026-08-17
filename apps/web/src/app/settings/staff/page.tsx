'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

const ROLES = ['DOCTOR', 'TECHNICIAN', 'OPTICIAN', 'RECEPTIONIST', 'ADMIN'] as const;

interface Staff {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: (typeof ROLES)[number];
  licenseNumber: string | null;
  npi: string | null;
  isActive: boolean;
}

const blank = {
  email: '',
  firstName: '',
  lastName: '',
  role: 'RECEPTIONIST' as Staff['role'],
  password: '',
  licenseNumber: '',
  npi: '',
};

export default function StaffSettingsPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStaff(await api<Staff[]>('/users?all=1'));
  }, []);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Load failed'));
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api('/users', { method: 'POST', body: form });
      setTempPassword(form.password);
      setCreating(false);
      setForm(blank);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      await api(`/users/${editing.id}`, {
        method: 'PATCH',
        body: {
          email: editing.email,
          firstName: editing.firstName,
          lastName: editing.lastName,
          role: editing.role,
          licenseNumber: editing.licenseNumber,
          npi: editing.npi,
        },
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function setActive(id: string, isActive: boolean) {
    setError(null);
    try {
      await api(`/users/${id}/active`, { method: 'PATCH', body: { isActive } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Staff accounts</h2>
        <button type="button" className="secondary" onClick={() => { setCreating(true); setTempPassword(null); }}>
          Add staff
        </button>
      </div>
      {tempPassword && (
        <p className="card">
          Temporary password (shown once): <strong>{tempPassword}</strong>
        </p>
      )}
      {error && <p className="error-text">{error}</p>}

      {creating && (
        <form className="card" onSubmit={create}>
          <h3>New staff member</h3>
          <div className="grid-2">
            <div className="field">
              <label>First name</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </div>
            <div className="field">
              <label>Last name</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Staff['role'] })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Temporary password</label>
              <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
            </div>
            <div className="field">
              <label>License</label>
              <input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} />
            </div>
            <div className="field">
              <label>NPI</label>
              <input value={form.npi} onChange={(e) => setForm({ ...form, npi: e.target.value })} />
            </div>
          </div>
          <div className="toolbar">
            <button type="submit">Create</button>
            <button type="button" className="secondary" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </form>
      )}

      {editing && (
        <form className="card" onSubmit={saveEdit}>
          <h3>Edit {editing.firstName} {editing.lastName}</h3>
          <div className="grid-2">
            <div className="field">
              <label>First name</label>
              <input value={editing.firstName} onChange={(e) => setEditing({ ...editing, firstName: e.target.value })} />
            </div>
            <div className="field">
              <label>Last name</label>
              <input value={editing.lastName} onChange={(e) => setEditing({ ...editing, lastName: e.target.value })} />
            </div>
            <div className="field">
              <label>Email</label>
              <input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
            </div>
            <div className="field">
              <label>Role</label>
              <select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as Staff['role'] })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="toolbar">
            <button type="submit">Save</button>
            <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {staff.map((u) => (
            <tr key={u.id}>
              <td>{u.lastName}, {u.firstName}</td>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{u.isActive ? 'Active' : 'Inactive'}</td>
              <td>
                <button type="button" className="secondary" onClick={() => setEditing(u)}>Edit</button>{' '}
                <button type="button" className="secondary" onClick={() => void setActive(u.id, !u.isActive)}>
                  {u.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
