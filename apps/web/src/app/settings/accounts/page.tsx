'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, getSessionUser } from '@/lib/api';
import type { PermissionCatalogEntry, PermissionKey } from '@/lib/permissions';

const ROLES = [
  { value: 'DOCTOR', label: 'Doctor' },
  { value: 'TECHNICIAN', label: 'Technician' },
  { value: 'OPTICIAN', label: 'Optician' },
  { value: 'RECEPTIONIST', label: 'Receptionist' },
  { value: 'ADMIN', label: 'Administrator' },
] as const;

type Role = (typeof ROLES)[number]['value'];

interface Staff {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  licenseNumber: string | null;
  npi: string | null;
  isActive: boolean;
  overrides: { grant: PermissionKey[]; deny: PermissionKey[] };
  permissions: PermissionKey[];
}

const blank = {
  email: '',
  firstName: '',
  lastName: '',
  role: 'RECEPTIONIST' as Role,
  licenseNumber: '',
  npi: '',
};

export default function AccountsSettingsPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [permissionsFor, setPermissionsFor] = useState<Staff | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState<{ email: string; password: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const me = getSessionUser();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStaff(await api<Staff[]>('/users?all=1'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Load failed'));
    void api<{ catalog: PermissionCatalogEntry[] }>('/users/me/permissions')
      .then((result) => setCatalog(result.catalog))
      .catch(() => undefined);
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      // The server generates the first password and returns it once; it is never
      // stored in readable form, so this is the only chance to hand it over.
      const result = await api<{ user: Staff; temporaryPassword: string }>('/users', {
        method: 'POST',
        body: {
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          role: form.role,
          licenseNumber: form.licenseNumber || undefined,
          npi: form.npi || undefined,
        },
      });
      setNewAccount({ email: result.user.email, password: result.temporaryPassword });
      setCreating(false);
      setForm(blank);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account');
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

  async function setActive(user: Staff, isActive: boolean) {
    setError(null);
    try {
      await api(`/users/${user.id}/active`, { method: 'PATCH', body: { isActive } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function savePermissions(event: FormEvent) {
    event.preventDefault();
    if (!permissionsFor) return;
    setError(null);
    try {
      await api(`/users/${permissionsFor.id}/permissions`, {
        method: 'PATCH',
        body: permissionsFor.overrides,
      });
      setPermissionsFor(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save permissions');
    }
  }

  /**
   * Each capability is a three-way choice: inherit whatever the role gives,
   * grant it regardless, or revoke it regardless. Storing grant and deny
   * separately rather than a flat list means a later change to the role's
   * defaults still flows through to everyone who never overrode it.
   */
  function setChoice(key: PermissionKey, choice: 'inherit' | 'grant' | 'deny') {
    if (!permissionsFor) return;
    const grant = permissionsFor.overrides.grant.filter((k) => k !== key);
    const deny = permissionsFor.overrides.deny.filter((k) => k !== key);
    if (choice === 'grant') grant.push(key);
    if (choice === 'deny') deny.push(key);
    setPermissionsFor({ ...permissionsFor, overrides: { grant, deny } });
  }

  function choiceFor(user: Staff, key: PermissionKey): 'inherit' | 'grant' | 'deny' {
    if (user.overrides.deny.includes(key)) return 'deny';
    if (user.overrides.grant.includes(key)) return 'grant';
    return 'inherit';
  }

  return (
    <div className="settings-section">
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Staff accounts</h2>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setCreating((v) => !v);
            setNewAccount(null);
          }}
        >
          {creating ? 'Cancel' : 'Add staff member'}
        </button>
      </div>

      <p className="muted">
        Roles set what someone can normally do. Permissions let you make an exception for one
        person without inventing a new role.
      </p>

      {newAccount && (
        <div className="card">
          <h3>Account created</h3>
          <p>
            Temporary password for <strong>{newAccount.email}</strong>:{' '}
            <code>{newAccount.password}</code>
          </p>
          <p className="muted">
            Shown once and never again. Hand it over directly and have them change it at first
            sign-in.
          </p>
          <button type="button" className="secondary" onClick={() => setNewAccount(null)}>
            Dismiss
          </button>
        </div>
      )}

      {error && <p className="error-text">{error}</p>}

      {creating && (
        <form className="card" onSubmit={create}>
          <h3>New staff member</h3>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="new-first">First name</label>
              <input
                id="new-first"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new-last">Last name</label>
              <input
                id="new-last"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new-email">Email</label>
              <input
                id="new-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="new-role">Role</label>
              <select
                id="new-role"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-license">License number</label>
              <input
                id="new-license"
                value={form.licenseNumber}
                onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="new-npi">NPI</label>
              <input
                id="new-npi"
                value={form.npi}
                onChange={(e) => setForm({ ...form, npi: e.target.value })}
              />
            </div>
          </div>
          <p className="muted">
            A temporary password is generated for you and shown once after the account is created.
          </p>
          <button type="submit">Create account</button>
        </form>
      )}

      {editing && (
        <form className="card" onSubmit={saveEdit}>
          <h3>
            Edit {editing.firstName} {editing.lastName}
          </h3>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="edit-first">First name</label>
              <input
                id="edit-first"
                value={editing.firstName}
                onChange={(e) => setEditing({ ...editing, firstName: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-last">Last name</label>
              <input
                id="edit-last"
                value={editing.lastName}
                onChange={(e) => setEditing({ ...editing, lastName: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-email">Email</label>
              <input
                id="edit-email"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-role">Role</label>
              <select
                id="edit-role"
                value={editing.role}
                onChange={(e) => setEditing({ ...editing, role: e.target.value as Role })}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="edit-license">License number</label>
              <input
                id="edit-license"
                value={editing.licenseNumber ?? ''}
                onChange={(e) => setEditing({ ...editing, licenseNumber: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-npi">NPI</label>
              <input
                id="edit-npi"
                value={editing.npi ?? ''}
                onChange={(e) => setEditing({ ...editing, npi: e.target.value })}
              />
            </div>
          </div>
          <div className="toolbar">
            <button type="submit">Save</button>
            <button type="button" className="secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {permissionsFor && (
        <form className="card" onSubmit={savePermissions}>
          <h3>
            Permissions for {permissionsFor.firstName} {permissionsFor.lastName}
          </h3>
          <p className="muted">
            {ROLES.find((r) => r.value === permissionsFor.role)?.label} is the baseline. Change a
            row only where this person should differ from it.
          </p>
          {catalog.map((entry) => {
            const choice = choiceFor(permissionsFor, entry.key);
            return (
              <div className="settings-row" key={entry.key}>
                <span className="settings-row-label">
                  {entry.label}
                  <span className="settings-row-help">{entry.description}</span>
                </span>
                <div className="settings-choices">
                  {(['inherit', 'grant', 'deny'] as const).map((option) => {
                    const optionLabel =
                      option === 'inherit'
                        ? 'Use role default'
                        : option === 'grant'
                          ? 'Always allow'
                          : 'Never allow';
                    return (
                      <label key={option}>
                        <input
                          type="radio"
                          name={`perm-${entry.key}`}
                          // Spelled out because "Always allow" on its own tells a
                          // screen reader nothing about which capability it governs.
                          aria-label={`${entry.label}: ${optionLabel.toLowerCase()}`}
                          checked={choice === option}
                          onChange={() => setChoice(entry.key, option)}
                        />{' '}
                        {optionLabel}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="toolbar">
            <button type="submit">Save permissions</button>
            <button type="button" className="secondary" onClick={() => setPermissionsFor(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Exceptions</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={6} className="muted">
                Loading…
              </td>
            </tr>
          )}
          {staff.map((user) => {
            const exceptions =
              user.overrides.grant.length + user.overrides.deny.length;
            return (
              <tr key={user.id}>
                <td>
                  {user.lastName}, {user.firstName}
                  {user.id === me?.id && <span className="muted"> (you)</span>}
                </td>
                <td>{user.email}</td>
                <td>{ROLES.find((r) => r.value === user.role)?.label ?? user.role}</td>
                <td>
                  {exceptions === 0 ? (
                    <span className="muted">Role default</span>
                  ) : (
                    <span className="badge warning">
                      {user.overrides.grant.length > 0 && `+${user.overrides.grant.length}`}
                      {user.overrides.grant.length > 0 && user.overrides.deny.length > 0 && ' '}
                      {user.overrides.deny.length > 0 && `−${user.overrides.deny.length}`}
                    </span>
                  )}
                </td>
                <td>
                  {user.isActive ? (
                    <span className="badge success">Active</span>
                  ) : (
                    <span className="badge">Inactive</span>
                  )}
                </td>
                <td>
                  <button type="button" className="secondary" onClick={() => setEditing(user)}>
                    Edit
                  </button>{' '}
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setPermissionsFor(user)}
                  >
                    Permissions
                  </button>{' '}
                  <button
                    type="button"
                    className="secondary"
                    disabled={user.id === me?.id}
                    title={
                      user.id === me?.id ? 'You cannot deactivate your own account' : undefined
                    }
                    onClick={() => void setActive(user, !user.isActive)}
                  >
                    {user.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
