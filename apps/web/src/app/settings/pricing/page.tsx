'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api, downloadApiFile, fileToBase64 } from '@/lib/api';

interface LensList {
  id: string;
  name: string;
  design: string;
  material: string;
  index: string | number | null;
  isActive: boolean;
  _count?: { cells: number };
}

interface Cell {
  sphere: number;
  cylinder: number;
  price: number;
}

interface AddOn {
  id: string;
  name: string;
  kind: string;
  price: string | number;
  isActive: boolean;
}

const DESIGNS = ['SV', 'BIFOCAL', 'PAL', 'OFFICE', 'OTHER'];
const KINDS = ['AR', 'UV', 'PHOTOCHROMIC', 'POLARIZED', 'BLUE_LIGHT', 'EDGE', 'OTHER'];

function spheres() {
  const out: number[] = [];
  for (let s = 8; s >= -8; s -= 0.25) out.push(Math.round(s * 4) / 4);
  return out;
}
function cylinders() {
  const out: number[] = [];
  for (let c = 0; c >= -6; c -= 0.25) out.push(Math.round(c * 4) / 4);
  return out;
}

export default function PricingSettingsPage() {
  const [tab, setTab] = useState<'lenses' | 'coatings'>('lenses');
  const [lists, setLists] = useState<LensList[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [cells, setCells] = useState<Cell[]>([]);
  const [addons, setAddons] = useState<AddOn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [newList, setNewList] = useState({ name: '', design: 'SV', material: 'Polycarbonate', index: '1.59' });
  const [newAdd, setNewAdd] = useState({ name: '', kind: 'AR', price: '' });

  const sph = useMemo(() => spheres(), []);
  const cyl = useMemo(() => cylinders(), []);
  const cellMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cells) m.set(`${c.sphere}|${c.cylinder}`, c.price);
    return m;
  }, [cells]);

  const loadLists = useCallback(async () => {
    setLists(await api<LensList[]>('/pricing/lens-lists?all=1'));
  }, []);
  const loadAddons = useCallback(async () => {
    setAddons(await api<AddOn[]>('/pricing/add-ons?all=1'));
  }, []);

  useEffect(() => {
    void loadLists().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
    void loadAddons().catch(() => undefined);
  }, [loadLists, loadAddons]);

  useEffect(() => {
    if (!selected) return;
    api<Cell[]>(`/pricing/lens-lists/${selected}/cells`)
      .then(setCells)
      .catch((e) => setError(e instanceof Error ? e.message : 'Load cells failed'));
  }, [selected]);

  function setCell(sphere: number, cylinder: number, raw: string) {
    const key = `${sphere}|${cylinder}`;
    const next = cells.filter((c) => `${c.sphere}|${c.cylinder}` !== key);
    if (raw.trim() !== '') {
      const price = Number(raw);
      if (!Number.isNaN(price)) next.push({ sphere, cylinder, price });
    }
    setCells(next);
  }

  async function saveGrid() {
    if (!selected) return;
    setError(null);
    try {
      await api(`/pricing/lens-lists/${selected}/cells`, { method: 'PUT', body: { cells } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function createList(event: FormEvent) {
    event.preventDefault();
    try {
      const created = await api<LensList>('/pricing/lens-lists', {
        method: 'POST',
        body: {
          name: newList.name,
          design: newList.design,
          material: newList.material,
          index: newList.index ? Number(newList.index) : undefined,
        },
      });
      setNewList({ name: '', design: 'SV', material: 'Polycarbonate', index: '1.59' });
      await loadLists();
      setSelected(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function importXlsx(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const dataBase64 = await fileToBase64(file);
      const result = await api<{
        listsCreated: number;
        listsUpdated: number;
        cellsUpserted: number;
        coatingsUpserted: number;
        errors: string[];
      }>('/pricing/lens-lists/import', { method: 'POST', body: { fileName: file.name, dataBase64 } });
      setImportMsg(
        `Created ${result.listsCreated}, updated ${result.listsUpdated}, cells ${result.cellsUpserted}, coatings ${result.coatingsUpserted}` +
          (result.errors.length ? `. Issues: ${result.errors.slice(0, 8).join('; ')}` : ''),
      );
      await loadLists();
      await loadAddons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  }

  async function createAddOn(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/pricing/add-ons', {
        method: 'POST',
        body: { name: newAdd.name, kind: newAdd.kind, price: Number(newAdd.price) },
      });
      setNewAdd({ name: '', kind: 'AR', price: '' });
      await loadAddons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button type="button" className={tab === 'lenses' ? '' : 'secondary'} onClick={() => setTab('lenses')}>
          Lens prices
        </button>
        <button type="button" className={tab === 'coatings' ? '' : 'secondary'} onClick={() => setTab('coatings')}>
          Coatings & add-ons
        </button>
        <button type="button" className="secondary" onClick={() => void downloadApiFile('/pricing/lens-lists/template', 'lens-price-template.xlsx')}>
          Download template
        </button>
        <label className="secondary" style={{ padding: '0.35rem 0.7rem', cursor: 'pointer' }}>
          Import Excel
          <input type="file" accept=".xlsx" hidden onChange={(e) => void importXlsx(e.target.files?.[0])} />
        </label>
      </div>
      {importMsg && <p className="muted">{importMsg}</p>}
      {error && <p className="error-text">{error}</p>}

      {tab === 'lenses' && (
        <>
          <form className="card" onSubmit={createList}>
            <h3>New price list</h3>
            <div className="grid-2">
              <div className="field">
                <label>Name</label>
                <input value={newList.name} onChange={(e) => setNewList({ ...newList, name: e.target.value })} required placeholder="Poly SV" />
              </div>
              <div className="field">
                <label>Design</label>
                <select value={newList.design} onChange={(e) => setNewList({ ...newList, design: e.target.value })}>
                  {DESIGNS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Material</label>
                <input value={newList.material} onChange={(e) => setNewList({ ...newList, material: e.target.value })} />
              </div>
              <div className="field">
                <label>Index</label>
                <input value={newList.index} onChange={(e) => setNewList({ ...newList, index: e.target.value })} />
              </div>
            </div>
            <button type="submit">Add list</button>
          </form>

          <div className="field">
            <label>Price list</label>
            <select value={selected ?? ''} onChange={(e) => setSelected(e.target.value || null)}>
              <option value="">Select…</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.design} / {l.material}) {l.isActive ? '' : '— inactive'}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <>
              <div className="toolbar">
                <button type="button" onClick={() => void saveGrid()}>Save grid</button>
                <button type="button" className="secondary" onClick={() => void downloadApiFile(`/pricing/lens-lists/${selected}/export`, 'lens-prices.xlsx')}>
                  Export
                </button>
              </div>
              <p className="muted">Minus cylinder. Empty cells are not offered. Sphere down the side, cylinder across.</p>
              <div className="price-grid-wrap">
                <table className="price-grid">
                  <thead>
                    <tr>
                      <th>Sph \ Cyl</th>
                      {cyl.map((c) => (
                        <th key={c}>{c.toFixed(2)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sph.map((s) => (
                      <tr key={s}>
                        <th>{s.toFixed(2)}</th>
                        {cyl.map((c) => (
                          <td key={c}>
                            <input
                              inputMode="decimal"
                              value={cellMap.has(`${s}|${c}`) ? String(cellMap.get(`${s}|${c}`)) : ''}
                              onChange={(e) => setCell(s, c, e.target.value)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'coatings' && (
        <>
          <form className="card" onSubmit={createAddOn}>
            <h3>Add coating / add-on</h3>
            <div className="grid-2">
              <div className="field">
                <label>Name</label>
                <input value={newAdd.name} onChange={(e) => setNewAdd({ ...newAdd, name: e.target.value })} required />
              </div>
              <div className="field">
                <label>Kind</label>
                <select value={newAdd.kind} onChange={(e) => setNewAdd({ ...newAdd, kind: e.target.value })}>
                  {KINDS.map((k) => <option key={k}>{k}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Price</label>
                <input value={newAdd.price} onChange={(e) => setNewAdd({ ...newAdd, price: e.target.value })} required />
              </div>
            </div>
            <button type="submit">Add</button>
          </form>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {addons.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.kind}</td>
                  <td>{Number(a.price).toFixed(2)}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        void api(`/pricing/add-ons/${a.id}`, {
                          method: 'PATCH',
                          body: { isActive: !a.isActive },
                        }).then(loadAddons)
                      }
                    >
                      {a.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
