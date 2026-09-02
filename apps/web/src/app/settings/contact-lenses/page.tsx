'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import ImportPanel from '@/components/ImportPanel';
import MoneyInput from '@/components/MoneyInput';
import { getPermissions, Permission } from '@/lib/permissions';

interface Product {
  id: string;
  brand: string;
  productName: string;
  modality: string;
  lensType: string;
  lensesPerBox: number | null;
  boxesPerYearPerEye: number;
  pricePerBox: string | number;
  annualSupplyPrice: string | number | null;
  sixMonthPrice: string | number | null;
  rebateNote: string | null;
  notes: string | null;
  isActive: boolean;
}

interface Fee {
  id: string;
  name: string;
  kind: string;
  price: string | number;
  isActive: boolean;
}

interface ImportPlan {
  products: {
    brand: string;
    productName: string;
    status: 'create' | 'update';
    pricePerBox: number;
    wasPricePerBox: number | null;
  }[];
  fees: { name: string; status: 'create' | 'update'; price: number; wasPrice: number | null }[];
  errors: string[];
  applied?: { productsCreated: number; productsUpdated: number; fees: number };
}

const MODALITIES = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'BIWEEKLY', label: 'Two-week' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'ANNUAL', label: 'Annual' },
  { value: 'OTHER', label: 'Other' },
];

const LENS_TYPES = [
  { value: 'SPHERICAL', label: 'Spherical' },
  { value: 'TORIC', label: 'Toric' },
  { value: 'MULTIFOCAL', label: 'Multifocal' },
  { value: 'MULTIFOCAL_TORIC', label: 'Multifocal toric' },
  { value: 'RGP', label: 'Rigid gas permeable' },
  { value: 'SCLERAL', label: 'Scleral' },
  { value: 'ORTHO_K', label: 'Ortho-K' },
  { value: 'OTHER', label: 'Other' },
];

const FEE_KINDS = [
  { value: 'FITTING_STANDARD', label: 'Standard fitting' },
  { value: 'FITTING_TORIC', label: 'Toric fitting' },
  { value: 'FITTING_MULTIFOCAL', label: 'Multifocal fitting' },
  { value: 'FITTING_SPECIALTY', label: 'Specialty fitting' },
  { value: 'FITTING_ORTHO_K', label: 'Ortho-K fitting' },
  { value: 'EVALUATION', label: 'Evaluation' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'OTHER', label: 'Other' },
];

const emptyProduct = {
  brand: '',
  productName: '',
  modality: 'MONTHLY',
  lensType: 'SPHERICAL',
  lensesPerBox: '',
  boxesPerYearPerEye: '4',
  pricePerBox: '',
  annualSupplyPrice: '',
  sixMonthPrice: '',
  rebateNote: '',
  notes: '',
};

function money(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  return Number(value).toFixed(2);
}

function label(options: { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export default function ContactLensPricingPage() {
  const [tab, setTab] = useState<'products' | 'fees'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [showForm, setShowForm] = useState(false);
  const [newFee, setNewFee] = useState({ name: '', kind: 'FITTING_STANDARD', price: '' });
  const [error, setError] = useState<string | null>(null);

  const canEdit = useMemo(
    () => getPermissions().includes(Permission.CONTACT_LENS_PRICING_EDIT),
    [],
  );

  const loadProducts = useCallback(async () => {
    const params = new URLSearchParams({ all: '1' });
    if (query.trim()) params.set('q', query.trim());
    setProducts(await api<Product[]>(`/contact-lens-pricing/products?${params}`));
  }, [query]);

  const loadFees = useCallback(async () => {
    setFees(await api<Fee[]>('/contact-lens-pricing/fees?all=1'));
  }, []);

  useEffect(() => {
    void loadProducts().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, [loadProducts]);

  useEffect(() => {
    void loadFees().catch(() => undefined);
  }, [loadFees]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyProduct);
    setShowForm(true);
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    setForm({
      brand: product.brand,
      productName: product.productName,
      modality: product.modality,
      lensType: product.lensType,
      lensesPerBox: product.lensesPerBox?.toString() ?? '',
      boxesPerYearPerEye: product.boxesPerYearPerEye.toString(),
      pricePerBox: String(product.pricePerBox),
      annualSupplyPrice: product.annualSupplyPrice != null ? String(product.annualSupplyPrice) : '',
      sixMonthPrice: product.sixMonthPrice != null ? String(product.sixMonthPrice) : '',
      rebateNote: product.rebateNote ?? '',
      notes: product.notes ?? '',
    });
    setShowForm(true);
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const body = {
      brand: form.brand,
      productName: form.productName,
      modality: form.modality,
      lensType: form.lensType,
      lensesPerBox: form.lensesPerBox ? Number(form.lensesPerBox) : null,
      boxesPerYearPerEye: Number(form.boxesPerYearPerEye) || 4,
      pricePerBox: Number(form.pricePerBox),
      annualSupplyPrice: form.annualSupplyPrice ? Number(form.annualSupplyPrice) : null,
      sixMonthPrice: form.sixMonthPrice ? Number(form.sixMonthPrice) : null,
      rebateNote: form.rebateNote || null,
      notes: form.notes || null,
    };
    try {
      if (editingId) {
        await api(`/contact-lens-pricing/products/${editingId}`, { method: 'PATCH', body });
      } else {
        await api('/contact-lens-pricing/products', { method: 'POST', body });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyProduct);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function toggleProduct(product: Product) {
    setError(null);
    try {
      await api(`/contact-lens-pricing/products/${product.id}`, {
        method: 'PATCH',
        body: { isActive: !product.isActive },
      });
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function createFee(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api('/contact-lens-pricing/fees', {
        method: 'POST',
        body: { name: newFee.name, kind: newFee.kind, price: Number(newFee.price) },
      });
      setNewFee({ name: '', kind: 'FITTING_STANDARD', price: '' });
      await loadFees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that fee');
    }
  }

  const visibleProducts = showInactive ? products : products.filter((p) => p.isActive);

  return (
    <div className="settings-section">
      <div className="toolbar">
        <button
          type="button"
          className={tab === 'products' ? '' : 'secondary'}
          onClick={() => setTab('products')}
        >
          Lenses
        </button>
        <button
          type="button"
          className={tab === 'fees' ? '' : 'secondary'}
          onClick={() => setTab('fees')}
        >
          Fitting &amp; evaluation fees
        </button>
      </div>

      {!canEdit && (
        <p className="muted">
          You can view contact lens pricing but not change it. An administrator can grant
          editing on the Accounts screen.
        </p>
      )}
      {error && <p className="error-text">{error}</p>}

      {tab === 'products' && (
        <>
          <ImportPanel<ImportPlan>
            templatePath="/contact-lens-pricing/template"
            templateFilename="contact-lens-template.xlsx"
            exportPath="/contact-lens-pricing/export"
            exportFilename="contact-lens-prices.xlsx"
            importPath="/contact-lens-pricing/import"
            canEdit={canEdit}
            onApplied={async () => {
              await loadProducts();
              await loadFees();
            }}
            summarize={(plan) =>
              plan.applied
                ? `Imported ${plan.applied.productsCreated} new and ${plan.applied.productsUpdated} updated lenses, ${plan.applied.fees} fees.`
                : 'Import complete.'
            }
            renderPreview={(plan) => (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Brand</th>
                      <th>Product</th>
                      <th>Change</th>
                      <th>Price per box</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.products.map((product) => (
                      <tr key={`${product.brand}|${product.productName}`}>
                        <td>{product.brand}</td>
                        <td>{product.productName}</td>
                        <td>
                          <span
                            className={`badge${product.status === 'create' ? ' success' : ' warning'}`}
                          >
                            {product.status === 'create' ? 'New' : 'Updated'}
                          </span>
                        </td>
                        <td>
                          {product.wasPricePerBox != null &&
                          product.wasPricePerBox !== product.pricePerBox ? (
                            <>
                              <s className="muted">{money(product.wasPricePerBox)}</s>{' '}
                              {money(product.pricePerBox)}
                            </>
                          ) : (
                            money(product.pricePerBox)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plan.fees.length > 0 && (
                  <table style={{ marginTop: '1rem' }}>
                    <thead>
                      <tr>
                        <th>Fee</th>
                        <th>Change</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.fees.map((fee) => (
                        <tr key={fee.name}>
                          <td>{fee.name}</td>
                          <td>
                            <span
                              className={`badge${fee.status === 'create' ? ' success' : ' warning'}`}
                            >
                              {fee.status === 'create' ? 'New' : 'Updated'}
                            </span>
                          </td>
                          <td>
                            {fee.wasPrice != null && fee.wasPrice !== fee.price ? (
                              <>
                                <s className="muted">{money(fee.wasPrice)}</s> {money(fee.price)}
                              </>
                            ) : (
                              money(fee.price)
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
            <h2 style={{ margin: 0 }}>Contact lenses</h2>
            <button type="button" className="secondary" disabled={!canEdit} onClick={openCreate}>
              Add lens
            </button>
            <label style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />{' '}
              Show inactive
            </label>
            <input
              type="search"
              placeholder="Search brand or product"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ maxWidth: '18rem' }}
            />
          </div>

          {showForm && (
            <form className="card" onSubmit={saveProduct}>
              <h3>{editingId ? 'Edit lens' : 'New lens'}</h3>
              <div className="grid-3">
                <div className="field">
                  <label htmlFor="cl-brand">Brand</label>
                  <input
                    id="cl-brand"
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    placeholder="Acuvue"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="cl-product">Product</label>
                  <input
                    id="cl-product"
                    value={form.productName}
                    onChange={(e) => setForm({ ...form, productName: e.target.value })}
                    placeholder="Oasys 1-Day"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="cl-modality">Replacement</label>
                  <select
                    id="cl-modality"
                    value={form.modality}
                    onChange={(e) => setForm({ ...form, modality: e.target.value })}
                  >
                    {MODALITIES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cl-type">Lens type</label>
                  <select
                    id="cl-type"
                    value={form.lensType}
                    onChange={(e) => setForm({ ...form, lensType: e.target.value })}
                  >
                    {LENS_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cl-per-box">Lenses per box</label>
                  <input
                    id="cl-per-box"
                    inputMode="numeric"
                    value={form.lensesPerBox}
                    onChange={(e) => setForm({ ...form, lensesPerBox: e.target.value })}
                    placeholder="90"
                  />
                </div>
                <div className="field">
                  <label htmlFor="cl-boxes">Boxes per year, per eye</label>
                  <input
                    id="cl-boxes"
                    inputMode="numeric"
                    value={form.boxesPerYearPerEye}
                    onChange={(e) => setForm({ ...form, boxesPerYearPerEye: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="cl-price">Price per box</label>
                  <MoneyInput
                    id="cl-price"
                    value={form.pricePerBox}
                    onChange={(e) => setForm({ ...form, pricePerBox: e.target.value })}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="cl-annual">Annual supply, per eye</label>
                  <MoneyInput
                    id="cl-annual"
                    value={form.annualSupplyPrice}
                    onChange={(e) => setForm({ ...form, annualSupplyPrice: e.target.value })}
                    placeholder="Blank bills by the box"
                  />
                </div>
                <div className="field">
                  <label htmlFor="cl-six">Six-month supply, per eye</label>
                  <MoneyInput
                    id="cl-six"
                    value={form.sixMonthPrice}
                    onChange={(e) => setForm({ ...form, sixMonthPrice: e.target.value })}
                    placeholder="Blank bills by the box"
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="cl-rebate">Rebate note</label>
                <input
                  id="cl-rebate"
                  value={form.rebateNote}
                  onChange={(e) => setForm({ ...form, rebateNote: e.target.value })}
                  placeholder="$100 manufacturer rebate on an annual supply"
                />
              </div>
              <div className="field">
                <label htmlFor="cl-notes">Notes</label>
                <input
                  id="cl-notes"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <div className="toolbar">
                <button type="submit">{editingId ? 'Save lens' : 'Add lens'}</button>
                <button type="button" className="secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          <table>
            <thead>
              <tr>
                <th>Brand / product</th>
                <th>Replacement</th>
                <th>Type</th>
                <th>Per box</th>
                <th>Annual, per eye</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visibleProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No contact lenses yet. Import a distributor price list or add one by hand.
                  </td>
                </tr>
              )}
              {visibleProducts.map((product) => (
                <tr key={product.id}>
                  <td>
                    <strong>{product.brand}</strong> {product.productName}
                    {product.rebateNote && (
                      <div className="muted" style={{ fontSize: '0.8rem' }}>
                        {product.rebateNote}
                      </div>
                    )}
                  </td>
                  <td>{label(MODALITIES, product.modality)}</td>
                  <td>{label(LENS_TYPES, product.lensType)}</td>
                  <td>{money(product.pricePerBox)}</td>
                  <td>
                    {product.annualSupplyPrice != null ? (
                      money(product.annualSupplyPrice)
                    ) : (
                      <span className="muted">
                        {money(
                          Number(product.pricePerBox) * product.boxesPerYearPerEye,
                        )}{' '}
                        by the box
                      </span>
                    )}
                  </td>
                  <td>
                    {product.isActive ? (
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
                      onClick={() => openEdit(product)}
                    >
                      Edit
                    </button>{' '}
                    <button
                      type="button"
                      className="secondary"
                      disabled={!canEdit}
                      onClick={() => void toggleProduct(product)}
                    >
                      {product.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === 'fees' && (
        <>
          <form className="card" onSubmit={createFee}>
            <h3>Add a fee</h3>
            <p className="muted">
              Professional fees quoted alongside the lenses. Kept separate from material pricing
              because vision plans apply allowances to them differently.
            </p>
            <div className="grid-3">
              <div className="field">
                <label htmlFor="fee-name">Name</label>
                <input
                  id="fee-name"
                  value={newFee.name}
                  onChange={(e) => setNewFee({ ...newFee, name: e.target.value })}
                  placeholder="Toric fitting"
                  required
                  disabled={!canEdit}
                />
              </div>
              <div className="field">
                <label htmlFor="fee-kind">Kind</label>
                <select
                  id="fee-kind"
                  value={newFee.kind}
                  onChange={(e) => setNewFee({ ...newFee, kind: e.target.value })}
                  disabled={!canEdit}
                >
                  {FEE_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="fee-price">Price</label>
                <MoneyInput
                  id="fee-price"
                  value={newFee.price}
                  onChange={(e) => setNewFee({ ...newFee, price: e.target.value })}
                  required
                  disabled={!canEdit}
                />
              </div>
            </div>
            <button type="submit" disabled={!canEdit}>
              Add fee
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
              {fees.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No fitting or evaluation fees yet.
                  </td>
                </tr>
              )}
              {fees.map((fee) => (
                <tr key={fee.id}>
                  <td>{fee.name}</td>
                  <td>{label(FEE_KINDS, fee.kind)}</td>
                  <td>{money(fee.price)}</td>
                  <td>
                    {fee.isActive ? (
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
                        void api(`/contact-lens-pricing/fees/${fee.id}`, {
                          method: 'PATCH',
                          body: { isActive: !fee.isActive },
                        })
                          .then(loadFees)
                          .catch((err: unknown) =>
                            setError(err instanceof Error ? err.message : 'Update failed'),
                          )
                      }
                    >
                      {fee.isActive ? 'Deactivate' : 'Reactivate'}
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
