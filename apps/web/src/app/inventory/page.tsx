'use client';

/** Frame and CL trial stock: search, add/update SKUs, adjust quantities. */
import { useCallback, useEffect, useState, FormEvent } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';

interface Item {
  id: string;
  kind: string;
  sku: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  size: string | null;
  quantity: number;
  retail: string | null;
}

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    kind: 'FRAME',
    sku: '',
    brand: '',
    model: '',
    color: '',
    size: '',
    quantity: '0',
    retail: '',
  });

  const load = useCallback(async () => {
    setItems(await api<Item[]>(`/inventory${query ? `?q=${encodeURIComponent(query)}` : ''}`));
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upsert(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api('/inventory', {
        method: 'POST',
        body: {
          kind: form.kind,
          sku: form.sku,
          brand: form.brand || undefined,
          model: form.model || undefined,
          color: form.color || undefined,
          size: form.size || undefined,
          quantity: Number(form.quantity),
          retail: form.retail ? Number(form.retail) : undefined,
        },
      });
      setShowNew(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function adjust(id: string, delta: number) {
    setError(null);
    try {
      await api(`/inventory/${id}/quantity`, { method: 'PATCH', body: { delta } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adjustment failed');
    }
  }

  return (
    <AppShell>
      <h1>Inventory</h1>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search SKU, brand, or model"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="secondary" onClick={() => setShowNew((v) => !v)}>
          {showNew ? 'Close' : 'Add item'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}

      {showNew && (
        <form className="card" onSubmit={upsert}>
          <h2>Add or update item</h2>
          <div className="grid-3">
            <div className="field">
              <label>Kind</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="FRAME">Frame</option>
                <option value="CONTACT_LENS_TRIAL">CL trial</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="field">
              <label>SKU</label>
              <input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div className="field">
              <label>Brand</label>
              <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </div>
            <div className="field">
              <label>Model</label>
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            <div className="field">
              <label>Color</label>
              <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </div>
            <div className="field">
              <label>Size</label>
              <input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
            </div>
            <div className="field">
              <label>Quantity</label>
              <input
                type="number"
                min={0}
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Retail price</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.retail}
                onChange={(e) => setForm({ ...form, retail: e.target.value })}
              />
            </div>
          </div>
          <button type="submit">Save item</button>
        </form>
      )}

      <div className="card">
        {items.length === 0 ? (
          <p className="muted">No inventory items.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Kind</th>
                <th>Brand / model</th>
                <th>Color / size</th>
                <th>Qty</th>
                <th>Retail</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{item.sku}</td>
                  <td>{item.kind === 'FRAME' ? 'Frame' : item.kind === 'CONTACT_LENS_TRIAL' ? 'CL trial' : 'Other'}</td>
                  <td>
                    {item.brand ?? '—'} {item.model ?? ''}
                  </td>
                  <td>
                    {item.color ?? '—'} {item.size ? `/ ${item.size}` : ''}
                  </td>
                  <td>
                    {item.quantity === 0 ? <span className="badge danger">0</span> : item.quantity}
                  </td>
                  <td>{item.retail ? `$${Number(item.retail).toFixed(2)}` : '—'}</td>
                  <td>
                    <button
                      className="secondary"
                      style={{ marginRight: 4, padding: '0.2rem 0.55rem' }}
                      onClick={() => adjust(item.id, 1)}
                      aria-label={`Receive one ${item.sku}`}
                    >
                      +1
                    </button>
                    <button
                      className="secondary"
                      style={{ padding: '0.2rem 0.55rem' }}
                      onClick={() => adjust(item.id, -1)}
                      aria-label={`Consume one ${item.sku}`}
                    >
                      −1
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
