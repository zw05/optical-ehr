'use client';

import type { ExamField } from '@/app/exams/[id]/examDefinition';
import { CheckboxGroup } from './CheckboxGroup';
import { ExternalExam } from './ExternalExam';
import { HpiComplaints, type HpiComplaint } from './HpiComplaints';
import { OdOsGrid } from './OdOsGrid';
import { RadioRow } from './RadioRow';
import { RepeatableRows } from './RepeatableRows';

interface FieldRendererProps {
  field: ExamField;
  tabKey: string;
  sectionData: Record<string, unknown>;
  disabled?: boolean;
  onChange: (key: string, value: unknown) => void;
}

function widthClass(width?: 'full' | 'half' | 'third') {
  return `exam-w-${width ?? 'full'}`;
}

export function FieldRenderer({
  field,
  tabKey,
  sectionData,
  disabled,
  onChange,
}: FieldRendererProps) {
  const value = sectionData[field.key];

  switch (field.type) {
    case 'text':
    case 'number':
      return (
        <div className={`field ${widthClass(field.width)}`}>
          <label>{field.label}</label>
          <input
            type={field.type === 'number' ? 'number' : 'text'}
            disabled={disabled}
            placeholder={field.placeholder}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        </div>
      );

    case 'textarea':
      return (
        <div className={`field ${widthClass(field.width)}`}>
          <label>{field.label}</label>
          <textarea
            rows={field.rows ?? 3}
            disabled={disabled}
            placeholder={field.placeholder}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        </div>
      );

    case 'select':
      return (
        <div className={`field ${widthClass(field.width)}`}>
          <label>{field.label}</label>
          <select
            disabled={disabled}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(field.key, e.target.value)}
          >
            <option value="">—</option>
            {field.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );

    case 'checkbox':
      return (
        <div className={`field ${widthClass(field.width)}`}>
          <label className="exam-choice">
            <input
              type="checkbox"
              disabled={disabled}
              checked={Boolean(value)}
              onChange={(e) => onChange(field.key, e.target.checked)}
            />
            {field.label}
          </label>
        </div>
      );

    case 'radio':
      return (
        <div className={widthClass(field.width)}>
          <RadioRow
            name={`${tabKey}-${field.key}`}
            label={field.label}
            options={field.options}
            value={(value as string) ?? ''}
            disabled={disabled}
            onChange={(v) => onChange(field.key, v)}
          />
        </div>
      );

    case 'checkboxGroup':
      return (
        <div className={widthClass(field.width)}>
          <CheckboxGroup
            label={field.label}
            options={field.options}
            value={(value as string[]) ?? []}
            disabled={disabled}
            exclusiveNone={field.exclusiveNone}
            onChange={(v) => onChange(field.key, v)}
          />
        </div>
      );

    case 'duration':
      return (
        <div className={`field ${widthClass(field.width)}`}>
          <label>{field.label}</label>
          <div className="exam-duration">
            <input
              type="number"
              min={0}
              disabled={disabled}
              value={(value as string) ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}
            />
            <select
              disabled={disabled}
              value={(sectionData[field.unitKey] as string) ?? field.units[0]?.value}
              onChange={(e) => onChange(field.unitKey, e.target.value)}
            >
              {field.units.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      );

    case 'odOsGrid':
      return (
        <OdOsGrid
          label={field.label}
          columns={field.columns}
          value={value as { od?: Record<string, string>; os?: Record<string, string> } | undefined}
          disabled={disabled}
          onChange={(v) => onChange(field.key, v)}
        />
      );

    case 'repeatable':
      return (
        <RepeatableRows
          label={field.label}
          addLabel={field.addLabel}
          itemFields={field.itemFields}
          value={(value as Record<string, string>[]) ?? []}
          disabled={disabled}
          onChange={(v) => onChange(field.key, v)}
        />
      );

    case 'hpiComplaint':
      return (
        <HpiComplaints
          value={(value as HpiComplaint[]) ?? []}
          disabled={disabled}
          onChange={(v) => onChange(field.key, v)}
        />
      );

    case 'rosSystem': {
      const status = (value as string) ?? '';
      const notesKey = `${field.key}Notes`;
      const notes = (sectionData[notesKey] as string) ?? '';
      return (
        <div className="exam-ros-row">
          <div className="exam-ros-label">{field.label}</div>
          <div className="exam-radio-group">
            {['negative', 'positive'].map((opt) => (
              <label key={opt} className="exam-choice">
                <input
                  type="radio"
                  name={`${tabKey}-${field.key}`}
                  checked={status === opt}
                  disabled={disabled}
                  onChange={() => onChange(field.key, opt)}
                />
                {opt === 'negative' ? 'Negative' : 'Positive'}
              </label>
            ))}
          </div>
          {status === 'positive' && (
            <input
              className="exam-ros-notes"
              disabled={disabled}
              placeholder="Notes"
              value={notes}
              onChange={(e) => onChange(notesKey, e.target.value)}
            />
          )}
        </div>
      );
    }

    case 'slitLampRow': {
      const row = (value as { wnl?: boolean; grade?: string; notes?: string }) ?? {};
      return (
        <div className="exam-slit-row">
          <div className="exam-slit-label">{field.label}</div>
          <label className="exam-choice">
            <input
              type="checkbox"
              disabled={disabled}
              checked={Boolean(row.wnl)}
              onChange={(e) => onChange(field.key, { ...row, wnl: e.target.checked })}
            />
            WNL
          </label>
          {field.gradingOptions && (
            <select
              disabled={disabled || Boolean(row.wnl)}
              value={row.grade ?? ''}
              onChange={(e) => onChange(field.key, { ...row, grade: e.target.value })}
            >
              <option value="">Grade</option>
              {field.gradingOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          <input
            disabled={disabled}
            placeholder="Notes"
            value={row.notes ?? ''}
            onChange={(e) => onChange(field.key, { ...row, notes: e.target.value })}
          />
        </div>
      );
    }

    case 'externalExam':
      return (
        <ExternalExam
          value={value}
          disabled={disabled}
          onChange={(v) => onChange(field.key, v)}
        />
      );

    case 'testRow': {
      const row = (value as { performed?: boolean; result?: string; notes?: string }) ?? {};
      return (
        <div className="exam-test-row">
          <div className="exam-test-label">{field.label}</div>
          <label className="exam-choice">
            <input
              type="checkbox"
              disabled={disabled}
              checked={Boolean(row.performed)}
              onChange={(e) => onChange(field.key, { ...row, performed: e.target.checked })}
            />
            Performed
          </label>
          <div className="exam-radio-group">
            {['normal', 'abnormal'].map((opt) => (
              <label key={opt} className="exam-choice">
                <input
                  type="radio"
                  name={`${tabKey}-${field.key}-result`}
                  disabled={disabled || !row.performed}
                  checked={row.result === opt}
                  onChange={() => onChange(field.key, { ...row, result: opt })}
                />
                {opt === 'normal' ? 'Normal' : 'Abnormal'}
              </label>
            ))}
          </div>
          <input
            disabled={disabled || !row.performed}
            placeholder="Notes"
            value={row.notes ?? ''}
            onChange={(e) => onChange(field.key, { ...row, notes: e.target.value })}
          />
        </div>
      );
    }

    default:
      return null;
  }
}

/** Shortcut used by ROS tab — mark all systems negative. */
export function markAllRosNegative(
  systems: string[],
  onBulkChange: (patch: Record<string, unknown>) => void,
) {
  const patch: Record<string, unknown> = {};
  for (const key of systems) {
    patch[key] = 'negative';
    patch[`${key}Notes`] = '';
  }
  onBulkChange(patch);
}
