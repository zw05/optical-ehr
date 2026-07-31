'use client';

import {
  MOCK_APPOINTMENTS,
  MOCK_ORDERS,
  MOCK_RECALLS,
} from './mockData';

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function statusTone(status: string): 'success' | 'warning' | '' {
  if (status === 'CHECKED_IN' || status === 'COMPLETED') return 'success';
  if (status === 'RECEIVED' || status === 'SCHEDULED') return 'warning';
  return '';
}

export default function DemoDashboard() {
  return (
    <div className="mn-panel-grid">
      <section className="mn-panel">
        <div className="mn-panel-head">
          <span className="mn-panel-title">Today&apos;s Appointments</span>
          <span className="mn-panel-count">{MOCK_APPOINTMENTS.length}</span>
        </div>
        <div className="mn-panel-body">
          <table>
            <tbody>
              {MOCK_APPOINTMENTS.map((a) => (
                <tr key={a.id} className="clickable">
                  <td className="mn-mono">
                    {new Date(a.startsAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td>
                    <a href="#">{a.patient.lastName}, {a.patient.firstName}</a>
                  </td>
                  <td className="mn-muted">{a.type.name}</td>
                  <td>
                    <span className={`mn-badge ${statusTone(a.status)}`}>
                      {formatStatus(a.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mn-panel">
        <div className="mn-panel-head">
          <span className="mn-panel-title">Ready for pickup</span>
          <span className="mn-panel-count">{MOCK_ORDERS.length}</span>
        </div>
        <div className="mn-panel-body">
          <table>
            <tbody>
              {MOCK_ORDERS.map((o) => (
                <tr key={o.id} className="clickable">
                  <td>
                    <a href="#">{o.patient.lastName}, {o.patient.firstName}</a>
                  </td>
                  <td className="mn-muted">{o.kind.replace(/_/g, ' ')}</td>
                  <td>
                    <span className={`mn-badge ${statusTone(o.status)}`}>
                      {formatStatus(o.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mn-panel">
        <div className="mn-panel-head">
          <span className="mn-panel-title">Recalls due</span>
          <span className="mn-panel-count">{MOCK_RECALLS.length}</span>
        </div>
        <div className="mn-panel-body">
          <table>
            <tbody>
              {MOCK_RECALLS.map((r) => (
                <tr key={r.id}>
                  <td className="mn-mono">{new Date(r.dueDate).toLocaleDateString()}</td>
                  <td>
                    {r.patient.lastName}, {r.patient.firstName}
                  </td>
                  <td className="mn-muted">{r.reason}</td>
                  <td className="mn-muted mn-mono">{r.patient.phone ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
