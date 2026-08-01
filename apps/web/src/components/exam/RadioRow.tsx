'use client';

import type { FieldOption } from '@/app/exams/[id]/examDefinition';

interface RadioRowProps {
  name: string;
  label: string;
  options: FieldOption[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function RadioRow({ name, label, options, value, disabled, onChange }: RadioRowProps) {
  return (
    <div className="field exam-radio-field">
      <label>{label}</label>
      <div className="exam-radio-group">
        {options.map((opt) => (
          <label key={opt.value} className="exam-choice">
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              disabled={disabled}
              onChange={() => onChange(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
