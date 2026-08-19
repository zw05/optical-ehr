'use client';

import type { IntakeOption } from '@/lib/intakeHistory';

interface TriStateRowProps {
  label: string;
  options: IntakeOption[];
  value: string;
  detail: string;
  /** Follow-up column is only rendered when the chosen answer calls for it. */
  showDetail: boolean;
  detailPlaceholder?: string;
  disabled?: boolean;
  onChange: (status: string) => void;
  onDetailChange: (detail: string) => void;
}

/**
 * One line of the paper questionnaire. The answer is a row of segmented buttons
 * rather than radio dots so a normal answer costs a single tap on the whole
 * target, and the follow-up column only appears when the answer opens it.
 */
export function TriStateRow({
  label,
  options,
  value,
  detail,
  showDetail,
  detailPlaceholder,
  disabled,
  onChange,
  onDetailChange,
}: TriStateRowProps) {
  return (
    <div className="intake-row">
      <div className="intake-row-label">{label}</div>
      <div className="intake-segmented" role="group" aria-label={label}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              className={active ? 'intake-seg active' : 'intake-seg'}
              aria-pressed={active}
              disabled={disabled}
              // Tapping the active answer clears it, so a mis-tap costs one click.
              onClick={() => onChange(active ? '' : opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="intake-row-detail">
        {showDetail && (
          <input
            aria-label={`${label} — details`}
            placeholder={detailPlaceholder}
            disabled={disabled}
            value={detail}
            onChange={(e) => onDetailChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}
