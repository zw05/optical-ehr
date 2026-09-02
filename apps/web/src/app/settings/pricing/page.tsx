'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import ImportPanel from '@/components/ImportPanel';
import MoneyInput from '@/components/MoneyInput';
import { getPermissions, Permission } from '@/lib/permissions';

interface LensList {
  id: string;
  name: string;
  design: string;
  material: string;
  index: string | number | null;
  isActive: boolean;
  _count?: { ranges: number };
}

interface Band {
  id?: string;
  label: string | null;
  sphMin: string | number;
  sphMax: string | number;
  cylMin: string | number;
  cylMax: string | number;
  price: string | number;
  sortOrder: number;
}

interface AddOn {
  id: string;
  name: string;
  kind: string;
  price: string | number;
  isActive: boolean;
}

interface ImportPlan {
  lists: {
    name: string;
    status: 'create' | 'replace';
    source: 'bands' | 'grid';
    rowsRead: number;
    bands: number;
    existingBands: number;
    priceRange: { min: number; max: number } | null;
    sample: string[];
    errors: string[];
    warnings: string[];
  }[];
  addOns: { name: string; status: 'create' | 'update'; price: number; wasPrice: number | null }[];
  errors: string[];
  applied?: { listsCreated: number; listsReplaced: number; bands: number; addOns: number };
}

const DESIGNS = [
  { value: 'SV', label: 'Single vision' },
  { value: 'BIFOCAL', label: 'Bifocal' },
  { value: 'PAL', label: 'Progressive' },
  { value: 'OFFICE', label: 'Office / computer' },
  { value: 'OTHER', label: 'Other' },
];

const KINDS = [
  { value: 'AR', label: 'Anti-reflective' },
  { value: 'UV', label: 'UV' },
  { value: 'PHOTOCHROMIC', label: 'Photochromic' },
  { value: 'POLARIZED', label: 'Polarized' },
  { value: 'BLUE_LIGHT', label: 'Blue light' },
  { value: 'EDGE', label: 'Edge treatment' },
  { value: 'OTHER', label: 'Other' },
];

const blankBand = (sortOrder: number): Band => ({
  label: '',
  sphMax: '4.00',
  sphMin: '-6.00',
  cylMax: '0.00',
  cylMin: '-2.00',
  price: '',
  sortOrder,
});

function money(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  return Number(value).toFixed(2);
}

export default function LensPricingPage() {
  const [tab, setTab] = useState<'lists' | 'addons'>('lists');
  const [lists, setLists] = useState<LensList[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [bands, setBands] = useState<Band[]>([]);
  const [addons, setAddons] = useState<AddOn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newList, setNewList] = useState({ name: '', design: 'SV', material: '', index: '' });
  const [newAdd, setNewAdd] = useState({ name: '', kind: 'AR', price: '' });
  const [quote, setQuote] = useState({ sphere: '-2.00', cylinder: '-0.75' });
  const [quoteResult, setQuoteResult] = useState<string | null>(null);

  const canEdit = useMemo(
    () => getPermissions().includes(Permission.LENS_PRICING_EDIT),
    [],
  );

  const loadLists = useCallback(async () => {
    setLists(await api<LensList[]>('/pricing/lens-lists?all=1'));
  }, []);

  const loadAddons = useCallback(async () => {
    setAddons(await api<AddOn[]>('/pricing/add-ons?all=1'));
  }, []);

  const loadBands = useCallback(async (listId: string) => {
    const list = await api<LensList & { ranges: Band[] }>(`/pricing/lens-lists/${listId}`);
    setBands(list.ranges.map((r, i) => ({ ...r, sortOrder: r.sortOrder ?? i })));
  }, []);

  useEffect(() => {
    void loadLists().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
    void loadAddons().catch(() => undefined);
  }, [loadLists, loadAddons]);

  useEffect(() => {
    if (!selected) {
      setBands([]);
      return;
    }
    void loadBands(selected).catch((e) =>
      setError(e instanceof Error ? e.message : 'Could not load bands'),
    );
  }, [selected, loadBands]);

  const selectedList = lists.find((l) => l.id === selected) ?? null;

  function setBand(index: number, patch: Partial<Band>) {
    setBands((current) => current.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  async function saveBands() {
    if (!selected) return;
    setError(null);
    try {
      await api(`/pricing/lens-lists/${selected}/ranges`, {
        method: 'PUT',
        body: {
          ranges: bands.map((b, i) => ({
            label: (b.label ?? '').toString().trim() || undefined,
            sphMin: Number(b.sphMin),
            sphMax: Number(b.sphMax),
            cylMin: Number(b.cylMin),
            cylMax: Number(b.cylMax),
            price: Number(b.price),
            sortOrder: i,
          })),
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      await loadLists();
      await loadBands(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function createList(event: FormEvent) {
    event.preventDefault();
    setError(null);
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
      setNewList({ name: '', design: 'SV', material: '', index: '' });
      setShowCreate(false);
      await loadLists();
      setSelected(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the list');
    }
  }

  async function toggleList(list: LensList) {
    setError(null);
    try {
      await api(`/pricing/lens-lists/${list.id}`, {
        method: 'PATCH',
        body: { isActive: !list.isActive },
      });
      await loadLists();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function createAddOn(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api('/pricing/add-ons', {
        method: 'POST',
        body: { name: newAdd.name, kind: newAdd.kind, price: Number(newAdd.price) },
      });
      setNewAdd({ name: '', kind: 'AR', price: '' });
      await loadAddons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that');
    }
  }

  async function testQuote() {
    if (!selected) return;
    setQuoteResult(null);
    try {
      const result = await api<{ lensPrice: number | null; band: { label: string } | null }>(
        `/pricing/quote?listId=${selected}&sphere=${quote.sphere}&cylinder=${quote.cylinder}`,
      );
      setQuoteResult(
        result.lensPrice == null
          ? 'Not offered — no band covers that power.'
          : `${money(result.lensPrice)} — ${result.band?.label ?? 'matched band'}`,
      );
    } catch (err) {
      setQuoteResult(err instanceof Error ? err.message : 'Quote failed');
    }
  }

  return (
    <div className="settings-section">
      <div className="toolbar">
        <button
          type="button"
          className={tab === 'lists' ? '' : 'secondary'}
          onClick={() => setTab('lists')}
        >
          Price lists
        </button>
        <button
          type="button"
          className={tab === 'addons' ? '' : 'secondary'}
          onClick={() => setTab('addons')}
        >
          Coatings &amp; add-ons
        </button>
      </div>

      {!canEdit && (
        <p className="muted">
          You can view lens pricing but not change it. An administrator can grant editing on
          the Accounts screen.
        </p>
      )}
      {error && <p className="error-text">{error}</p>}

      {tab === 'lists' && (
        <>
          <ImportPanel<ImportPlan>
            templatePath="/pricing/lens-lists/template"
            templateFilename="lens-price-template.xlsx"
            exportPath="/pricing/lens-lists/export"
            exportFilename="lens-prices.xlsx"
            importPath="/pricing/lens-lists/import"
            canEdit={canEdit}
            onApplied={async () => {
              await loadLists();
              await loadAddons();
              if (selected) await loadBands(selected);
            }}
            summarize={(plan) =>
              plan.applied
                ? `Imported ${plan.applied.listsCreated} new and ${plan.applied.listsReplaced} updated price ${
                    plan.applied.listsCreated + plan.applied.listsReplaced === 1 ? 'list' : 'lists'
                  }, ${plan.applied.bands} bands, ${plan.applied.addOns} add-ons.`
                : 'Import complete.'
            }
            renderPreview={(plan) => (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Price list</th>
                      <th>Change</th>
                      <th>Read</th>
                      <th>Bands</th>
                      <th>Price span</th>
                      <th>Example bands</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.lists.map((list) => (
                      <tr key={list.name}>
                        <td>{list.name}</td>
                        <td>
                          <span
                            className={`badge${list.status === 'create' ? ' success' : ' warning'}`}
                          >
                            {list.status === 'create'
                              ? 'New list'
                              : `Replaces ${list.existingBands} bands`}
                          </span>
                        </td>
                        <td>
                          {list.rowsRead} {list.source === 'grid' ? 'grid cells' : 'rows'}
                        </td>
                        <td>{list.bands}</td>
                        <td>
                          {list.priceRange
                            ? `${money(list.priceRange.min)} – ${money(list.priceRange.max)}`
                            : '—'}
                        </td>
                        <td className="muted" style={{ fontSize: '0.8rem' }}>
                          {list.sample.join(' · ') || '—'}
                          {list.warnings.map((warning) => (
                            <div key={warning} className="import-warning">
                              {warning}
                            </div>
                          ))}
                          {list.errors.length > 0 && (
                            <div className="error-text">{list.errors.slice(0, 3).join('; ')}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plan.addOns.length > 0 && (
                  <table style={{ marginTop: '1rem' }}>
                    <thead>
                      <tr>
                        <th>Coating / add-on</th>
                        <th>Change</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.addOns.map((addOn) => (
                        <tr key={addOn.name}>
                          <td>{addOn.name}</td>
                          <td>
                            <span
                              className={`badge${addOn.status === 'create' ? ' success' : ' warning'}`}
                            >
                              {addOn.status === 'create' ? 'New' : 'Updated'}
                            </span>
                          </td>
                          <td>
                            {addOn.wasPrice != null && addOn.wasPrice !== addOn.price ? (
                              <>
                                <s className="muted">{money(addOn.wasPrice)}</s>{' '}
                                {money(addOn.price)}
                              </>
                            ) : (
                              money(addOn.price)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {plan.errors.length > 0 && (
                  <p className="error-text">{plan.errors.slice(0, 5).join('; ')}</p>
                )}
              </>
            )}
          />

          <div className="toolbar">
            <h2 style={{ margin: 0 }}>Price lists</h2>
            <button
              type="button"
              className="secondary"
              disabled={!canEdit}
              onClick={() => setShowCreate((v) => !v)}
            >
              {showCreate ? 'Cancel' : 'New price list'}
            </button>
          </div>

          {showCreate && (
            <form className="card" onSubmit={createList}>
              <h3>New price list</h3>
              <p className="muted">
                One list per lens design and material — the combination a patient is quoted, such
                as &ldquo;Polycarbonate progressive&rdquo;.
              </p>
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="list-name">Name</label>
                  <input
                    id="list-name"
                    value={newList.name}
                    onChange={(e) => setNewList({ ...newList, name: e.target.value })}
                    placeholder="Polycarbonate single vision"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="list-design">Design</label>
                  <select
                    id="list-design"
                    value={newList.design}
                    onChange={(e) => setNewList({ ...newList, design: e.target.value })}
                  >
                    {DESIGNS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="list-material">Material</label>
                  <input
                    id="list-material"
                    value={newList.material}
                    onChange={(e) => setNewList({ ...newList, material: e.target.value })}
                    placeholder="Polycarbonate"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="list-index">Index (optional)</label>
                  <input
                    id="list-index"
                    inputMode="decimal"
                    value={newList.index}
                    onChange={(e) => setNewList({ ...newList, index: e.target.value })}
                    placeholder="1.59"
                  />
                </div>
              </div>
              <button type="submit">Create list</button>
            </form>
          )}

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Design</th>
                <th>Material</th>
                <th>Index</th>
                <th>Bands</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lists.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No price lists yet. Import a lab price sheet or create one by hand.
                  </td>
                </tr>
              )}
              {lists.map((list) => (
                <tr key={list.id} className={list.id === selected ? 'selected-row' : undefined}>
                  <td>{list.name}</td>
                  <td>{DESIGNS.find((d) => d.value === list.design)?.label ?? list.design}</td>
                  <td>{list.material}</td>
                  <td>{list.index ?? '—'}</td>
                  <td>{list._count?.ranges ?? 0}</td>
                  <td>
                    {list.isActive ? (
                      <span className="badge success">Active</span>
                    ) : (
                      <span className="badge">Inactive</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setSelected(list.id === selected ? null : list.id)}
                    >
                      {list.id === selected ? 'Close' : 'Edit bands'}
                    </button>{' '}
                    <button
                      type="button"
                      className="secondary"
                      disabled={!canEdit}
                      onClick={() => void toggleList(list)}
                    >
                      {list.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {selectedList && (
            <div className="card">
              <h3>{selectedList.name} — power bands</h3>
              <p className="muted">
                Each band prices a range of prescriptions. Cylinder is minus-cyl, so it runs from
                0.00 downwards. Where bands overlap the narrowest one wins, which lets a
                high-power surcharge sit on top of a base band without editing it.
              </p>
              <div className="band-editor">
                <table>
                  <thead>
                    <tr>
                      <th style={{ minWidth: '10rem' }}>Label</th>
                      <th>Sphere from</th>
                      <th>Sphere to</th>
                      <th>Cyl from</th>
                      <th>Cyl to</th>
                      <th>Price</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {bands.length === 0 && (
                      <tr>
                        <td colSpan={7} className="muted">
                          No bands yet. Add one, or import a lab price sheet.
                        </td>
                      </tr>
                    )}
                    {bands.map((band, i) => (
                      <tr key={band.id ?? `new-${i}`}>
                        <td>
                          <input
                            aria-label={`Band ${i + 1} label`}
                            value={band.label ?? ''}
                            disabled={!canEdit}
                            onChange={(e) => setBand(i, { label: e.target.value })}
                            placeholder="Standard powers"
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Band ${i + 1} sphere from`}
                            inputMode="decimal"
                            value={band.sphMax}
                            disabled={!canEdit}
                            onChange={(e) => setBand(i, { sphMax: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Band ${i + 1} sphere to`}
                            inputMode="decimal"
                            value={band.sphMin}
                            disabled={!canEdit}
                            onChange={(e) => setBand(i, { sphMin: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Band ${i + 1} cylinder from`}
                            inputMode="decimal"
                            value={band.cylMax}
                            disabled={!canEdit}
                            onChange={(e) => setBand(i, { cylMax: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Band ${i + 1} cylinder to`}
                            inputMode="decimal"
                            value={band.cylMin}
                            disabled={!canEdit}
                            onChange={(e) => setBand(i, { cylMin: e.target.value })}
                          />
                        </td>
                        <td>
                          <MoneyInput
                            aria-label={`Band ${i + 1} price`}
                            value={band.price}
                            disabled={!canEdit}
                            onChange={(e) => setBand(i, { price: e.target.value })}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="secondary"
                            disabled={!canEdit}
                            onClick={() => setBands(bands.filter((_, index) => index !== i))}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="toolbar">
                <button
                  type="button"
                  className="secondary"
                  disabled={!canEdit}
                  onClick={() => setBands([...bands, blankBand(bands.length)])}
                >
                  Add band
                </button>
                <button type="button" disabled={!canEdit} onClick={() => void saveBands()}>
                  Save bands
                </button>
                {saved && <span className="settings-saved">Saved</span>}
              </div>

              <h4>Check a prescription</h4>
              <p className="muted">
                Confirms which band a given power falls into, and catches gaps left by an import.
              </p>
              <div className="toolbar">
                <label style={{ marginBottom: 0 }}>
                  Sphere
                  <input
                    inputMode="decimal"
                    value={quote.sphere}
                    onChange={(e) => setQuote({ ...quote, sphere: e.target.value })}
                    style={{ width: '6rem' }}
                  />
                </label>
                <label style={{ marginBottom: 0 }}>
                  Cylinder
                  <input
                    inputMode="decimal"
                    value={quote.cylinder}
                    onChange={(e) => setQuote({ ...quote, cylinder: e.target.value })}
                    style={{ width: '6rem' }}
                  />
                </label>
                <button type="button" className="secondary" onClick={() => void testQuote()}>
                  Price it
                </button>
                {quoteResult && <span className="settings-saved">{quoteResult}</span>}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'addons' && (
        <>
          <form className="card" onSubmit={createAddOn}>
            <h3>Add a coating or add-on</h3>
            <div className="grid-3">
              <div className="field">
                <label htmlFor="addon-name">Name</label>
                <input
                  id="addon-name"
                  value={newAdd.name}
                  onChange={(e) => setNewAdd({ ...newAdd, name: e.target.value })}
                  placeholder="Premium AR"
                  required
                  disabled={!canEdit}
                />
              </div>
              <div className="field">
                <label htmlFor="addon-kind">Kind</label>
                <select
                  id="addon-kind"
                  value={newAdd.kind}
                  onChange={(e) => setNewAdd({ ...newAdd, kind: e.target.value })}
                  disabled={!canEdit}
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="addon-price">Price</label>
                <MoneyInput
                  id="addon-price"
                  value={newAdd.price}
                  onChange={(e) => setNewAdd({ ...newAdd, price: e.target.value })}
                  required
                  disabled={!canEdit}
                />
              </div>
            </div>
            <button type="submit" disabled={!canEdit}>
              Add
            </button>
          </form>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Price</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {addons.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No coatings or add-ons yet.
                  </td>
                </tr>
              )}
              {addons.map((addOn) => (
                <tr key={addOn.id}>
                  <td>{addOn.name}</td>
                  <td>{KINDS.find((k) => k.value === addOn.kind)?.label ?? addOn.kind}</td>
                  <td>{money(addOn.price)}</td>
                  <td>
                    {addOn.isActive ? (
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
                      onClick={() =>
                        void api(`/pricing/add-ons/${addOn.id}`, {
                          method: 'PATCH',
                          body: { isActive: !addOn.isActive },
                        })
                          .then(loadAddons)
                          .catch((err: unknown) =>
                            setError(err instanceof Error ? err.message : 'Update failed'),
                          )
                      }
                    >
                      {addOn.isActive ? 'Deactivate' : 'Reactivate'}
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
