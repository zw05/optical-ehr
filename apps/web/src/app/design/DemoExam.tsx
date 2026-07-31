'use client';

import { useState } from 'react';
import {
  EXAM_TAB_KEYS,
  MOCK_EXAM_PATIENT,
  MOCK_REFRACTION,
  MOCK_SLIT_LAMP,
} from './mockData';

function ageFromDob(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function initials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

const REF_FIELDS = ['sphere', 'cylinder', 'axis', 'add', 'va'] as const;

export default function DemoExam() {
  const [activeTab, setActiveTab] = useState<(typeof EXAM_TAB_KEYS)[number]>('Refraction');
  const p = MOCK_EXAM_PATIENT;

  return (
    <>
      <div className="mn-exam-banner">
        <div className="mn-exam-patient">
          <div className="mn-avatar" aria-hidden style={{ width: 36, height: 36, fontSize: 12 }}>
            {initials(p.firstName, p.lastName)}
          </div>
          <div>
            <div className="mn-exam-patient-name">
              {p.lastName}, {p.firstName}
            </div>
            <div className="mn-muted mn-mono" style={{ fontSize: 12 }}>
              {p.mrn}
            </div>
          </div>
        </div>

        <div className="mn-exam-kv">
          <div className="mn-exam-kv-item">
            <span className="mn-exam-kv-label">DOB</span>
            <span className="mn-exam-kv-value">
              {new Date(p.dateOfBirth).toLocaleDateString()} · {ageFromDob(p.dateOfBirth)}y
            </span>
          </div>
          <div className="mn-exam-kv-item">
            <span className="mn-exam-kv-label">Phone</span>
            <span className="mn-exam-kv-value">{p.phone ?? '—'}</span>
          </div>
          <div className="mn-exam-kv-item">
            <span className="mn-exam-kv-label">Insurance</span>
            <span className="mn-exam-kv-value">{p.insurance}</span>
          </div>
          <div className="mn-exam-kv-item">
            <span className="mn-exam-kv-label">Status</span>
            <span className="mn-badge warning">In progress</span>
          </div>
        </div>

        <div className="mn-exam-actions">
          <button type="button" className="mn-btn secondary">
            Save
          </button>
          <button type="button" className="mn-btn accent">
            Sign
          </button>
        </div>
      </div>

      <div className="mn-tabs" role="tablist" aria-label="Exam sections">
        {EXAM_TAB_KEYS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`mn-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Refraction' && (
        <div className="mn-exam-section">
          <h2 className="mn-exam-section-title">Refraction</h2>
          <div className="mn-odos">
            <table>
              <thead>
                <tr>
                  <th />
                  {REF_FIELDS.map((f) => (
                    <th key={f}>{f}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(['od', 'os'] as const).map((eye) => (
                  <tr key={eye}>
                    <td>{eye}</td>
                    {REF_FIELDS.map((f) => (
                      <td key={f}>
                        <input
                          defaultValue={MOCK_REFRACTION[eye][f]}
                          aria-label={`${eye.toUpperCase()} ${f}`}
                          className="mn-mono"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mn-field-row" style={{ marginTop: 16 }}>
            <div className="mn-field">
              <label>Binocular VA</label>
              <input defaultValue="20/20" className="mn-mono" />
            </div>
            <div className="mn-field">
              <label>PD</label>
              <input defaultValue="62" className="mn-mono" />
            </div>
            <div className="mn-field">
              <label>Notes</label>
              <input defaultValue="Subjective preference −0.25 OU" />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Anterior' && (
        <div className="mn-exam-section">
          <h2 className="mn-exam-section-title">Slit lamp</h2>
          {MOCK_SLIT_LAMP.map((row) => (
            <div key={row.key} className="mn-slit-row">
              <span className="mn-slit-label">{row.label}</span>
              <select defaultValue={row.status} aria-label={`${row.label} status`}>
                <option>Normal</option>
                <option>Abnormal</option>
                <option>Not examined</option>
              </select>
              <input
                defaultValue={row.grade}
                placeholder="Grade"
                aria-label={`${row.label} grade`}
                className="mn-mono"
              />
              <input
                defaultValue={row.notes}
                placeholder="Notes"
                aria-label={`${row.label} notes`}
              />
            </div>
          ))}
        </div>
      )}

      {activeTab !== 'Refraction' && activeTab !== 'Anterior' && (
        <div className="mn-exam-section">
          <h2 className="mn-exam-section-title">{activeTab}</h2>
          <p className="mn-muted">
            Demo stub — switch to <strong>Refraction</strong> or <strong>Anterior</strong> to see
            dense clinical layouts in the minimal style.
          </p>
        </div>
      )}
    </>
  );
}
