'use client';

/** Job specification fields shared by the create and edit order forms. */
import { useEffect, useState } from 'react';
import CatalogSearchBox from '@/components/orders/CatalogSearchBox';
import {
  FRAME_FIELDS,
  LENS_COATINGS,
  MEASUREMENT_FIELDS,
  type OrderFormValues,
  type OrderKind,
} from './orderFormValues';
import { api } from '@/lib/api';

/** Stocked frame from the inventory catalog. */
interface FrameItem {
  id: string;
  sku: string;
  brand: string | null;
  model: string | null;
  color: string | null;
  eye: string | null;
  bridge: string | null;
  temple: string | null;
  quantity: number;
  retail: string | null;
}

/** Spectacle lens offering from the practice price lists. */
interface LensList {
  id: string;
  name: string;
  design: string;
  material: string;
  index: string | null;
}

/** Stocked contact lens from the contact-lens price catalog. */
interface ContactLensProduct {
  id: string;
  brand: string;
  productName: string;
  modality: string;
  lensType: string;
  lensesPerBox: number | null;
  pricePerBox: string;
}

interface OrderFieldsProps {
  kind: OrderKind;
  values: OrderFormValues;
  onChange: (next: OrderFormValues) => void;
}

function money(value: string | null): string {
  return value === null ? '' : `$${Number(value).toFixed(2)}`;
}

/**
 * Humanises an enum code for display, leaving short acronyms alone so SV, PAL
 * and RGP do not come out as "Sv", "Pal" and "Rgp".
 */
function codeLabel(value: string): string {
  return value
    .split('_')
    .map((word) => (word.length <= 3 ? word : word.charAt(0) + word.slice(1).toLowerCase()))
    .join(' ');
}

export default function OrderFields({ kind, values, onChange }: OrderFieldsProps) {
  const [lensLists, setLensLists] = useState<LensList[]>([]);

  useEffect(() => {
    if (kind !== 'SPECTACLE') return;
    api<LensList[]>('/pricing/lens-lists')
      .then(setLensLists)
      .catch(() => setLensLists([]));
  }, [kind]);

  const set = <K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) =>
    onChange({ ...values, [key]: value });

  function toggleCoating(coating: string) {
    set(
      'coatings',
      values.coatings.includes(coating)
        ? values.coatings.filter((c) => c !== coating)
        : [...values.coatings, coating],
    );
  }

  /** Pulls the frame specs off the stock item so the lab paper matches inventory. */
  function chooseFrame(item: FrameItem) {
    onChange({
      ...values,
      frameSku: item.sku,
      frame: {
        brand: item.brand ?? '',
        model: item.model ?? '',
        color: item.color ?? '',
        eye: item.eye ?? '',
        bridge: item.bridge ?? '',
        temple: item.temple ?? '',
      },
    });
  }

  function clearFrame() {
    onChange({
      ...values,
      frameSku: '',
      frame: { brand: '', model: '', color: '', eye: '', bridge: '', temple: '' },
    });
  }

  function chooseLensList(id: string) {
    const list = lensLists.find((l) => l.id === id);
    if (!list) {
      // "Enter manually" — keep whatever is typed and drop the catalog link.
      set('lensPriceListId', '');
      return;
    }
    onChange({
      ...values,
      lensPriceListId: list.id,
      lensDesign: list.name,
      lensMaterial: list.material,
    });
  }

  function chooseProduct(item: ContactLensProduct) {
    onChange({
      ...values,
      clProductId: item.id,
      brand: `${item.brand} ${item.productName}`,
    });
  }

  const selectedList = lensLists.find((l) => l.id === values.lensPriceListId) ?? null;

  return (
    <>
      {kind === 'SPECTACLE' ? (
        <>
          <h3>Frame</h3>
          <label className="inline-label" style={{ minWidth: 'auto', maxWidth: 'none' }}>
            <input
              type="checkbox"
              checked={values.patientOwnFrame}
              onChange={(e) =>
                onChange({
                  ...values,
                  patientOwnFrame: e.target.checked,
                  // A patient-supplied frame is not stock, so it carries no SKU.
                  frameSku: e.target.checked ? '' : values.frameSku,
                })
              }
            />
            Patient&apos;s own frame
          </label>

          {!values.patientOwnFrame &&
            (values.frameSku ? (
              <div
                className="field"
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}
              >
                <span>
                  {values.frame.brand} {values.frame.model}
                  <span className="muted">
                    {' '}
                    SKU {values.frameSku}
                    {values.frame.color ? ` · ${values.frame.color}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                  onClick={clearFrame}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="field">
                <label>Search stock frames</label>
                <CatalogSearchBox<FrameItem>
                  placeholder="Search frames by brand, model, or SKU"
                  ariaLabel="Search stock frames"
                  search={(q) => api<FrameItem[]>(`/inventory?kind=FRAME&q=${encodeURIComponent(q)}`)}
                  optionKey={(item) => item.id}
                  optionLabel={(item) => `${item.brand ?? ''} ${item.model ?? ''}`.trim() || item.sku}
                  optionMeta={(item) =>
                    [
                      item.sku,
                      item.color,
                      item.eye && item.bridge ? `${item.eye}-${item.bridge}` : null,
                      money(item.retail),
                      `${item.quantity} in stock`,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  }
                  onSelect={chooseFrame}
                />
              </div>
            ))}

          {(values.patientOwnFrame || !values.frameSku) && (
            <div className="grid-3">
              {FRAME_FIELDS.map(([key, label]) => (
                <div className="field" key={key}>
                  <label>{label}</label>
                  <input
                    value={values.frame[key]}
                    onChange={(e) => set('frame', { ...values.frame, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          )}

          <h3>Lens</h3>
          <div className="field">
            <label>Lens from price list</label>
            <select value={values.lensPriceListId} onChange={(e) => chooseLensList(e.target.value)}>
              <option value="">Not listed — enter manually</option>
              {lensLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} · {codeLabel(list.design)} · {list.material}
                  {list.index ? ` · ${list.index}` : ''}
                </option>
              ))}
            </select>
          </div>
          {!selectedList && (
            <div className="grid-2">
              <div className="field">
                <label>Design</label>
                <input value={values.lensDesign} onChange={(e) => set('lensDesign', e.target.value)} />
              </div>
              <div className="field">
                <label>Material</label>
                <input
                  value={values.lensMaterial}
                  onChange={(e) => set('lensMaterial', e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="exam-checkbox-grid">
            {LENS_COATINGS.map((coating) => (
              <label key={coating} className="exam-choice">
                <input
                  type="checkbox"
                  checked={values.coatings.includes(coating)}
                  onChange={() => toggleCoating(coating)}
                />
                {coating}
              </label>
            ))}
          </div>

          <h3>Measurements</h3>
          <div className="grid-3">
            {MEASUREMENT_FIELDS.map(([key, label]) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <input
                  type="number"
                  step="0.1"
                  value={values.measurements[key]}
                  onChange={(e) =>
                    set('measurements', { ...values.measurements, [key]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <h3>Contact lens</h3>
          {values.clProductId ? (
            <div
              className="field"
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}
            >
              <span>{values.brand}</span>
              <button
                type="button"
                className="secondary"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                onClick={() => onChange({ ...values, clProductId: '', brand: '' })}
              >
                Change
              </button>
            </div>
          ) : (
            <div className="field">
              <label>Search catalog</label>
              <CatalogSearchBox<ContactLensProduct>
                placeholder="Search contact lenses by brand or product"
                ariaLabel="Search contact lens catalog"
                search={(q) =>
                  api<ContactLensProduct[]>(
                    `/contact-lens-pricing/products?q=${encodeURIComponent(q)}`,
                  )
                }
                optionKey={(item) => item.id}
                optionLabel={(item) => `${item.brand} ${item.productName}`}
                optionMeta={(item) =>
                  [
                    codeLabel(item.modality),
                    codeLabel(item.lensType),
                    item.lensesPerBox ? `${item.lensesPerBox}/box` : null,
                    `${money(item.pricePerBox)}/box`,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                }
                onSelect={chooseProduct}
              />
            </div>
          )}
          <div className="grid-3">
            {!values.clProductId && (
              <div className="field">
                <label>Brand</label>
                <input value={values.brand} onChange={(e) => set('brand', e.target.value)} />
              </div>
            )}
            <div className="field">
              <label>OD quantity</label>
              <input
                type="number"
                min="0"
                value={values.odQty}
                onChange={(e) => set('odQty', e.target.value)}
              />
            </div>
            <div className="field">
              <label>OS quantity</label>
              <input
                type="number"
                min="0"
                value={values.osQty}
                onChange={(e) => set('osQty', e.target.value)}
              />
            </div>
            <div className="field">
              <label>Supply (months)</label>
              <input
                type="number"
                min="0"
                value={values.supplyMonths}
                onChange={(e) => set('supplyMonths', e.target.value)}
              />
            </div>
          </div>
          <label className="inline-label" style={{ minWidth: 'auto', maxWidth: 'none' }}>
            <input
              type="checkbox"
              checked={values.trial}
              onChange={(e) => set('trial', e.target.checked)}
            />
            Trial pair
          </label>
        </>
      )}

      <h3>Job / tray</h3>
      <div className="grid-2">
        <div className="field">
          <label>Tray #</label>
          <input
            value={values.trayNumber}
            onChange={(e) => set('trayNumber', e.target.value)}
            placeholder="e.g. A-14"
          />
        </div>
        <div className="field">
          <label>Job notes</label>
          <input value={values.jobNotes} onChange={(e) => set('jobNotes', e.target.value)} />
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Leave the tray blank to print a line to write on when the tray is assigned.
      </p>

    </>
  );
}
