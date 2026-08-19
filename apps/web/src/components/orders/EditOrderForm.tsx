'use client';

/** Inline edit form for correcting an order's job spec, lab, and pricing. */
import { FormEvent, useEffect, useState } from 'react';
import OrderFields from '@/components/orders/OrderFields';
import OrderPricingPanel, { type CoveragePolicy } from '@/components/orders/OrderPricingPanel';
import {
  computeTotals,
  detailsFrom,
  optionalNumber,
  optionalText,
  orderValuesFrom,
  type OrderDetails,
  type OrderFormValues,
  type OrderKind,
} from '@/components/orders/orderFormValues';
import { api } from '@/lib/api';

export interface EditableOrder {
  id: string;
  kind: string;
  patient: { id: string };
  details: OrderDetails | null;
  labName: string | null;
  labReference: string | null;
  warrantyNotes: string | null;
  priceTotal: string | number | null;
  deposit: string | number | null;
}

export interface EditOrderFormProps {
  order: EditableOrder;
  onSuccess: () => void | Promise<void>;
  onCancel: () => void;
  className?: string;
}

export default function EditOrderForm({
  order,
  onSuccess,
  onCancel,
  className = 'card',
}: EditOrderFormProps) {
  const [values, setValues] = useState<OrderFormValues>(() => orderValuesFrom(order));
  const [policies, setPolicies] = useState<CoveragePolicy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const kind = order.kind as OrderKind;

  useEffect(() => {
    api<CoveragePolicy[]>(`/insurance/patient/${order.patient.id}`)
      .then(setPolicies)
      .catch(() => setPolicies([]));
  }, [order.patient.id]);

  async function saveOrder(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api(`/orders/${order.id}`, {
        method: 'PATCH',
        body: {
          details: detailsFrom(values, kind),
          labName: optionalText(values.labName),
          labReference: optionalText(values.labReference),
          warrantyNotes: optionalText(values.warrantyNotes),
          priceTotal: computeTotals(values, kind).patientTotal,
          deposit: optionalNumber(values.deposit),
        },
      });
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className={className}
      onSubmit={(e) => void saveOrder(e)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault();
      }}
    >
      <h2>Edit order</h2>

      {error && <p className="error-text">{error}</p>}

      <div className="order-dialog-layout">
        <div>
          <OrderFields kind={kind} values={values} onChange={setValues} />
        </div>
        <OrderPricingPanel
          kind={kind}
          values={values}
          onChange={setValues}
          policies={policies}
          showLabReference
        />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className="secondary" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
