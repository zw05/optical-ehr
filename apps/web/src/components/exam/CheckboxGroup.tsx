'use client';

import type { FieldOption } from '@/app/exams/[id]/examDefinition';

interface CheckboxGroupProps {
  label: string;
  options: FieldOption[];
  value: string[];
  disabled?: boolean;
  exclusiveNone?: string;
  onChange: (value: string[]) => void;
}

export function CheckboxGroup({
  label,
  options,
  value,
  disabled,
  exclusiveNone,
  onChange,
}: CheckboxGroupProps) {
  const selected = Array.isArray(value) ? value : [];

  function toggle(optValue: string) {
    if (exclusiveNone && optValue === exclusiveNone) {
      onChange(selected.includes(optValue) ? [] : [optValue]);
      return;
    }
    let next = selected.filter((v) => v !== exclusiveNone);
    if (next.includes(optValue)) {
      next = next.filter((v) => v !== optValue);
    } else {
      next = [...next, optValue];
    }
    onChange(next);
  }

  return (
    <div className="field exam-checkbox-field">
      <label>{label}</label>
      <div className="exam-checkbox-grid">
        {options.map((opt) => (
          <label key={opt.value} className="exam-choice">
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              disabled={disabled}
              onChange={() => toggle(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
