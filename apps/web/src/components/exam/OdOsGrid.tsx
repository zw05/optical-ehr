'use client';

import type { FieldOption } from '@/app/exams/[id]/examDefinition';

type EyeKey = 'od' | 'os';

interface Column {
  key: string;
  label: string;
  input?: 'text' | 'select';
  options?: FieldOption[];
}

interface OdOsGridProps {
  label: string;
  columns: Column[];
  value: { od?: Record<string, string>; os?: Record<string, string> } | undefined;
  disabled?: boolean;
  onChange: (value: { od: Record<string, string>; os: Record<string, string> }) => void;
}

export function OdOsGrid({ label, columns, value, disabled, onChange }: OdOsGridProps) {
  const od = value?.od ?? {};
  const os = value?.os ?? {};

  function setCell(eye: EyeKey, colKey: string, cellValue: string) {
    const next = {
      od: { ...od },
      os: { ...os },
    };
    next[eye] = { ...next[eye], [colKey]: cellValue };
    onChange(next);
  }

  return (
    <div className="field exam-odos-field">
      <label>{label}</label>
      <div className="exam-odos-table-wrap">
        <table className="exam-odos-table">
          <thead>
            <tr>
              <th />
              {columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(['od', 'os'] as EyeKey[]).map((eye) => (
              <tr key={eye}>
                <th>{eye.toUpperCase()}</th>
                {columns.map((col) => (
                  <td key={col.key}>
                    {col.input === 'select' ? (
                      <select
                        disabled={disabled}
                        value={(eye === 'od' ? od : os)[col.key] ?? ''}
                        onChange={(e) => setCell(eye, col.key, e.target.value)}
                      >
                        <option value="">—</option>
                        {(col.options ?? []).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        disabled={disabled}
                        value={(eye === 'od' ? od : os)[col.key] ?? ''}
                        onChange={(e) => setCell(eye, col.key, e.target.value)}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
