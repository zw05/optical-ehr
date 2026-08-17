'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, downloadApiFile, fileToBase64 } from '@/lib/api';

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
  upc: string | null;
  cost: string | number | null;
  retail: string | number | null;
  quantity: number;
  reorderPoint: number | null;
  isActive: boolean;
}

const empty = {
  sku: '',
  brand: '',
  model: '',
  color: '',
  size: '',
  eye: '',
  bridge: '',
  temple: '',
  material: '',
  upc: '',
  cost: '',
  retail: '',
  quantity: '0',
  reorderPoint: '',
};

export default function FramesSettingsPage() {
  const [items, setItems] = useState<Frame[]>([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ kind: 'FRAME', all: '1' });
    if (query) qs.set('q', query);
    setItems(await api<Frame[]>(`/inventory?${qs}`));
  }, [query]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api('/inventory', {
        method: 'POST',
        body: {
          kind: 'FRAME',
          sku: form.sku,
          brand: form.brand || undefined,
          model: form.model || undefined,
          color: form.color || undefined,
          size: form.size || undefined,
          eye: form.eye || undefined,
          bridge: form.bridge || undefined,
          temple: form.temple || undefined,
          material: form.material || undefined,
          upc: form.upc || undefined,
          cost: form.cost ? Number(form.cost) : undefined,
          retail: form.retail ? Number(form.retail) : undefined,
          quantity: Number(form.quantity) || 0,
          reorderPoint: form.reorderPoint ? Number(form.reorderPoint) : undefined,
          isActive: true,
        },
      });
      setForm(empty);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function importXlsx(file: File | undefined) {
    if (!file) return;
    try {
      const dataBase64 = await fileToBase64(file);
      const result = await api<{ created: number; updated: number; errors: string[] }>(
        '/inventory/frames/import',
        { method: 'POST', body: { fileName: file.name, dataBase64 } },
      );
      setImportMsg(`Created ${result.created}, updated ${result.updated}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  }

  const visible = showInactive ? items : items.filter((i) => i.isActive);

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Frame catalog</h2>
        <button type="button" className="secondary" onClick={() => void downloadApiFile('/inventory/frames/template', 'frames-template.xlsx')}>
          Template
        </button>
        <label className="secondary" style={{ padding: '0.35rem 0.7rem', cursor: 'pointer' }}>
          Import Excel
          <input type="file" accept=".xlsx" hidden onChange={(e) => void importXlsx(e.target.files?.[0])} />
        </label>
        <label>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
        </label>
      </div>
      <p className="muted">Quantity is also adjusted on Inventory. This catalog holds SKU, measurements, and retail.</p>
      {importMsg && <p className="muted">{importMsg}</p>}
      {error && <p className="error-text">{error}</p>}

      <form className="card" onSubmit={save}>
        <h3>Add / update SKU</h3>
        <div className="grid-2">
          {(['sku', 'brand', 'model', 'color', 'size', 'eye', 'bridge', 'temple', 'material', 'upc', 'cost', 'retail', 'quantity', 'reorderPoint'] as const).map((key) => (
            <div className="field" key={key}>
              <label>{key}</label>
              <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} required={key === 'sku'} />
            </div>
          ))}
        </div>
        <button type="submit">Save frame</button>
      </form>

      <div className="field">
        <label>Search</label>
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Brand / model</th>
            <th>Size</th>
            <th>Retail</th>
            <th>Qty</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.map((i) => (
            <tr key={i.id}>
              <td>{i.sku}</td>
              <td>{[i.brand, i.model, i.color].filter(Boolean).join(' ')}</td>
              <td>{i.size ?? [i.eye, i.bridge, i.temple].filter(Boolean).join('-')}</td>
              <td>{i.retail != null ? Number(i.retail).toFixed(2) : '—'}</td>
              <td>
                {i.quantity}
                {i.reorderPoint != null && i.quantity <= i.reorderPoint ? ' (low)' : ''}
              </td>
              <td>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    void api('/inventory', {
                      method: 'POST',
                      body: { kind: 'FRAME', sku: i.sku, isActive: !i.isActive },
                    }).then(load)
                  }
                >
                  {i.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
