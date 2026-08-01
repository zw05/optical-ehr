'use client';

interface ItemField {
  key: string;
  label: string;
  placeholder?: string;
  width?: 'full' | 'half' | 'third';
}

interface RepeatableRowsProps {
  label: string;
  addLabel: string;
  itemFields: ItemField[];
  value: Record<string, string>[];
  disabled?: boolean;
  onChange: (value: Record<string, string>[]) => void;
}

export function RepeatableRows({
  label,
  addLabel,
  itemFields,
  value,
  disabled,
  onChange,
}: RepeatableRowsProps) {
  const rows = Array.isArray(value) ? value : [];

  function updateRow(index: number, fieldKey: string, fieldValue: string) {
    const next = rows.map((row, i) => (i === index ? { ...row, [fieldKey]: fieldValue } : row));
    onChange(next);
  }

  function addRow() {
    const blank: Record<string, string> = {};
    for (const f of itemFields) blank[f.key] = '';
    onChange([...rows, blank]);
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="field exam-repeatable">
      <div className="exam-repeatable-header">
        <label>{label}</label>
        {!disabled && (
          <button type="button" className="secondary exam-small-btn" onClick={addRow}>
            {addLabel}
          </button>
        )}
      </div>
      {rows.length === 0 && <p className="muted">None added.</p>}
      {rows.map((row, index) => (
        <div key={index} className="exam-repeatable-row">
          <div className="exam-field-grid">
            {itemFields.map((f) => (
              <div key={f.key} className={`field exam-w-${f.width ?? 'half'}`}>
                <label>{f.label}</label>
                <input
                  disabled={disabled}
                  placeholder={f.placeholder}
                  value={row[f.key] ?? ''}
                  onChange={(e) => updateRow(index, f.key, e.target.value)}
                />
              </div>
            ))}
          </div>
          {!disabled && (
            <button type="button" className="secondary exam-small-btn" onClick={() => removeRow(index)}>
              Remove
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
