'use client';

/** Admin-only PHI access log; filterable by patient id. */
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';

interface AuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  patientId: string | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
  actor: { firstName: string; lastName: string; role: string } | null;
}

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [patientId, setPatientId] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : '';
      setRows(await api<AuditRow[]>(`/audit${query}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Only administrators can view the audit log');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppShell>
      <h1>Audit Log</h1>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Filter by patient ID"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
        />
        <button onClick={load}>Apply</button>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Detail</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>
                  {row.actor ? `${row.actor.lastName}, ${row.actor.firstName} (${row.actor.role})` : 'system'}
                </td>
                <td>
                  <span className="badge">{row.action}</span>
                </td>
                <td>
                  {row.entityType}
                  {row.entityId ? ` ${row.entityId.slice(0, 8)}…` : ''}
                </td>
                <td className="muted">{row.detail ?? '—'}</td>
                <td className="muted">{row.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
