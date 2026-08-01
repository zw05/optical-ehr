'use client';

import { HPI_COMPLAINT_FIELDS } from '@/app/exams/[id]/examDefinition';
import { CheckboxGroup } from './CheckboxGroup';
import { RadioRow } from './RadioRow';

export interface HpiComplaint {
  text: string;
  location: string;
  quality: string[];
  severity: string;
  duration: string;
  durationUnit: string;
  timing: string;
  context: string;
  modifyingFactors: string;
  associatedSigns: string;
}

interface HpiComplaintsProps {
  value: HpiComplaint[];
  disabled?: boolean;
  onChange: (value: HpiComplaint[]) => void;
}

function blankComplaint(): HpiComplaint {
  return {
    text: '',
    location: '',
    quality: [],
    severity: '',
    duration: '',
    durationUnit: 'days',
    timing: '',
    context: '',
    modifyingFactors: '',
    associatedSigns: '',
  };
}

export function HpiComplaints({ value, disabled, onChange }: HpiComplaintsProps) {
  const complaints = Array.isArray(value) && value.length > 0 ? value : [blankComplaint()];

  function update(index: number, patch: Partial<HpiComplaint>) {
    const next = complaints.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange(next);
  }

  function add() {
    onChange([...complaints, blankComplaint()]);
  }

  function remove(index: number) {
    if (complaints.length <= 1) {
      onChange([blankComplaint()]);
      return;
    }
    onChange(complaints.filter((_, i) => i !== index));
  }

  return (
    <div className="exam-hpi">
      <div className="exam-section-header">
        <h2>History Of Present Illness</h2>
        {!disabled && (
          <button type="button" onClick={add}>
            Add CC
          </button>
        )}
      </div>
      {complaints.map((cc, index) => (
        <div key={index} className="exam-hpi-block">
          <div className="exam-hpi-block-header">
            <strong>Chief Complaint {index + 1}</strong>
            {!disabled && complaints.length > 1 && (
              <button type="button" className="secondary exam-small-btn" onClick={() => remove(index)}>
                Remove
              </button>
            )}
          </div>
          <div className="field">
            <label>Chief Complaint</label>
            <textarea
              rows={2}
              disabled={disabled}
              value={cc.text}
              onChange={(e) => update(index, { text: e.target.value })}
            />
          </div>
          <div className="exam-field-grid">
            <RadioRow
              name={`hpi-loc-${index}`}
              label="Location"
              options={HPI_COMPLAINT_FIELDS.location}
              value={cc.location}
              disabled={disabled}
              onChange={(location) => update(index, { location })}
            />
            <RadioRow
              name={`hpi-sev-${index}`}
              label="Severity"
              options={HPI_COMPLAINT_FIELDS.severity}
              value={cc.severity}
              disabled={disabled}
              onChange={(severity) => update(index, { severity })}
            />
            <div className="field exam-w-third">
              <label>Duration</label>
              <div className="exam-duration">
                <input
                  type="number"
                  min={0}
                  disabled={disabled}
                  value={cc.duration}
                  onChange={(e) => update(index, { duration: e.target.value })}
                />
                <select
                  disabled={disabled}
                  value={cc.durationUnit}
                  onChange={(e) => update(index, { durationUnit: e.target.value })}
                >
                  {HPI_COMPLAINT_FIELDS.durationUnits.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field exam-w-third">
              <label>Timing</label>
              <select
                disabled={disabled}
                value={cc.timing}
                onChange={(e) => update(index, { timing: e.target.value })}
              >
                <option value="">—</option>
                {HPI_COMPLAINT_FIELDS.timing.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <CheckboxGroup
            label="Quality"
            options={HPI_COMPLAINT_FIELDS.quality}
            value={cc.quality}
            disabled={disabled}
            onChange={(quality) => update(index, { quality })}
          />
          <div className="exam-field-grid">
            <div className="field exam-w-third">
              <label>Context</label>
              <input
                disabled={disabled}
                value={cc.context}
                onChange={(e) => update(index, { context: e.target.value })}
              />
            </div>
            <div className="field exam-w-third">
              <label>Modifying Factors</label>
              <input
                disabled={disabled}
                value={cc.modifyingFactors}
                onChange={(e) => update(index, { modifyingFactors: e.target.value })}
              />
            </div>
            <div className="field exam-w-third">
              <label>Associated Signs</label>
              <input
                disabled={disabled}
                value={cc.associatedSigns}
                onChange={(e) => update(index, { associatedSigns: e.target.value })}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
