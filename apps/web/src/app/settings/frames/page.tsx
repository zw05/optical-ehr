'use client';

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import ImportPanel from '@/components/ImportPanel';
import MoneyInput from '@/components/MoneyInput';
import { getPermissions, Permission } from '@/lib/permissions';

interface Frame {
  id: string;
  sku: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  size: string | null;
  eye: string | null;
  bridge: string | null;
  temple: string | null;
  material: string | null;
  shape: string | null;
  upc: string | null;
  cost: string | number | null;
  retail: string | number | null;
  quantity: number;
  reorderPoint: number | null;
  isActive: boolean;
}

interface ImportPlan {
  created: number;
  updated: number;
  errors: string[];
}

const FIELDS = [
  { key: 'sku', label: 'SKU', required: true },
  { key: 'brand', label: 'Brand' },
  { key: 'model', label: 'Model' },
  { key: 'color', label: 'Color' },
  { key: 'eye', label: 'Eye size' },
  { key: 'bridge', label: 'Bridge' },
  { key: 'temple', label: 'Temple' },
  { key: 'material', label: 'Material' },
  { key: 'shape', label: 'Shape' },
  { key: 'upc', label: 'UPC' },
  { key: 'cost', label: 'Cost', numeric: true, money: true },
  { key: 'retail', label: 'Retail', numeric: true, money: true },
  { key: 'quantity', label: 'Quantity', numeric: true },
  { key: 'reorderPoint', label: 'Reorder point', numeric: true },
] as const;

type FormState = Record<(typeof FIELDS)[number]['key'], string>;

const empty = FIELDS.reduce((acc, f) => ({ ...acc, [f.key]: '' }), {} as FormState);

function money(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  return Number(value).toFixed(2);
}

/** Frames are quoted as eye-bridge-temple, e.g. 52-18-140. */
function frameSize(frame: Frame): string {
  const measured = [frame.eye, frame.bridge, frame.temple].filter(Boolean);
  if (measured.length) return measured.join('-');
  return frame.size ?? '—';
}

export default function FramesSettingsPage() {
  const [items, setItems] = useState<Frame[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<FormState>(empty);
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const canEdit = useMemo(() => getPermissions().includes(Permission.FRAMES_EDIT), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ kind: 'FRAME', all: '1' });
      if (query.trim()) params.set('q', query.trim());
      if (lowStockOnly) params.set('lowStock', '1');
      setItems(await api<Frame[]>(`/inventory?${params}`));
    } finally {
      setLoading(false);
    }
  }, [query, lowStockOnly]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, [load]);

  function openCreate() {
    setEditingSku(null);
    setForm(empty);
    setShowForm(true);
  }

  function openEdit(frame: Frame) {
    setEditingSku(frame.sku);
    setForm({
      sku: frame.sku,
      brand: frame.brand ?? '',
      model: frame.model ?? '',
      color: frame.color ?? '',
      eye: frame.eye ?? '',
      bridge: frame.bridge ?? '',
      temple: frame.temple ?? '',
      material: frame.material ?? '',
      shape: frame.shape ?? '',
      upc: frame.upc ?? '',
      cost: frame.cost != null ? String(frame.cost) : '',
      retail: frame.retail != null ? String(frame.retail) : '',
      quantity: String(frame.quantity),
      reorderPoint: frame.reorderPoint != null ? String(frame.reorderPoint) : '',
    });
    setShowForm(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const body: Record<string, unknown> = { kind: 'FRAME', sku: form.sku.trim(), isActive: true };
    for (const field of FIELDS) {
      if (field.key === 'sku') continue;
      const raw = form[field.key].trim();
      if (!raw) continue;
      body[field.key] = 'numeric' in field && field.numeric ? Number(raw) : raw;
    }
    try {
      await api('/inventory', { method: 'POST', body });
      setShowForm(false);
      setEditingSku(null);
      setForm(empty);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function toggleActive(frame: Frame) {
    setError(null);
    try {
      if (frame.isActive) {
        await api(`/inventory/${frame.id}`, { method: 'DELETE' });
      } else {
        await api('/inventory', {
          method: 'POST',
          body: { kind: 'FRAME', sku: frame.sku, isActive: true },
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  const visible = showInactive ? items : items.filter((i) => i.isActive);
  const lowStock = items.filter(
    (i) => i.isActive && i.reorderPoint != null && i.quantity <= i.reorderPoint,
  ).length;

  return (
    <div className="settings-section">
      <h2 style={{ margin: 0 }}>Frame catalog</h2>
      <p className="muted">
        SKUs, measurements, cost and retail. Day-to-day stock counts are adjusted on the
        Inventory screen; this is where the catalog and its pricing live.
      </p>

      {!canEdit && (
        <p className="muted">
          You can view the frame catalog but not change it. An administrator can grant editing on
          the Accounts screen.
        </p>
      )}
      {error && <p className="error-text">{error}</p>}

      <ImportPanel<ImportPlan>
        templatePath="/inventory/frames/template"
        templateFilename="frames-template.xlsx"
        importPath="/inventory/frames/import"
        canEdit={canEdit}
        onApplied={load}
        summarize={(plan) => `Imported ${plan.created} new and ${plan.updated} updated frames.`}
        renderPreview={(plan) => (
          <>
            <p>
              {plan.created} new {plan.created === 1 ? 'frame' : 'frames'}, {plan.updated} updated.
            </p>
            {plan.errors.length > 0 && (
              <p className="error-text">{plan.errors.slice(0, 5).join('; ')}</p>
            )}
          </>
        )}
      />

      <div className="toolbar">
        <button type="button" className="secondary" disabled={!canEdit} onClick={openCreate}>
          Add frame
        </button>
        <label style={{ marginBottom: 0 }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />{' '}
          Show inactive
        </label>
        <label style={{ marginBottom: 0 }}>
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => setLowStockOnly(e.target.checked)}
          />{' '}
          Low stock only{lowStock > 0 && !lowStockOnly ? ` (${lowStock})` : ''}
        </label>
        <input
          type="search"
          placeholder="Search SKU, brand, or model"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: '20rem' }}
        />
      </div>

      {showForm && (
        <form className="card" onSubmit={save}>
          <h3>{editingSku ? `Edit ${editingSku}` : 'New frame'}</h3>
          <div className="grid-3">
            {FIELDS.map((field) => {
              const shared = {
                id: `frame-${field.key}`,
                value: form[field.key],
                onChange: (e: ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, [field.key]: e.target.value }),
              };
              return (
                <div className="field" key={field.key}>
                  <label htmlFor={shared.id}>{field.label}</label>
                  {'money' in field && field.money ? (
                    <MoneyInput {...shared} />
                  ) : (
                    <input
                      {...shared}
                      inputMode={'numeric' in field && field.numeric ? 'decimal' : undefined}
                      readOnly={field.key === 'sku' && Boolean(editingSku)}
                      required={'required' in field && field.required}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="toolbar">
            <button type="submit">{editingSku ? 'Save frame' : 'Add frame'}</button>
            <button type="button" className="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Brand / model</th>
            <th>Size</th>
            <th>Cost</th>
            <th>Retail</th>
            <th>On hand</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={8} className="muted">
                Loading…
              </td>
            </tr>
          )}
          {!loading && visible.length === 0 && (
            <tr>
              <td colSpan={8} className="muted">
                No frames match. Import a vendor catalog or add a SKU by hand.
              </td>
            </tr>
          )}
          {visible.map((frame) => {
            const low = frame.reorderPoint != null && frame.quantity <= frame.reorderPoint;
            return (
              <tr key={frame.id}>
                <td>
                  <code>{frame.sku}</code>
                </td>
                <td>{[frame.brand, frame.model, frame.color].filter(Boolean).join(' ') || '—'}</td>
                <td>{frameSize(frame)}</td>
                <td>{money(frame.cost)}</td>
                <td>{money(frame.retail)}</td>
                <td>
                  {frame.quantity}
                  {low && <span className="badge warning" style={{ marginLeft: '0.4rem' }}>Low</span>}
                </td>
                <td>
                  {frame.isActive ? (
                    <span className="badge success">Active</span>
                  ) : (
                    <span className="badge">Inactive</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!canEdit}
                    onClick={() => openEdit(frame)}
                  >
                    Edit
                  </button>{' '}
                  <button
                    type="button"
                    className="secondary"
                    disabled={!canEdit}
                    onClick={() => void toggleActive(frame)}
                  >
                    {frame.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
