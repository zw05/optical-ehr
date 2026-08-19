'use client';

/** Inline create-order form: pick a patient, pick a finalized Rx, spec the job. */
import { FormEvent, useEffect, useState } from 'react';
import PatientSearchBox, { type PatientSuggestion } from '@/components/PatientSearchBox';
import OrderFields from '@/components/orders/OrderFields';
import OrderPricingPanel, { type CoveragePolicy } from '@/components/orders/OrderPricingPanel';
import {
  computeTotals,
  detailsFrom,
  emptyOrderValues,
  optionalNumber,
  optionalText,
  type OrderFormValues,
  type OrderKind,
} from '@/components/orders/orderFormValues';
import { api } from '@/lib/api';

interface PrescriptionRow {
  id: string;
  type: string;
  status: string;
  version: number;
  issuedAt: string | null;
  expiresAt: string | null;
  prescriber: { firstName: string; lastName: string };
}

export interface CreatedOrder {
  id: string;
  kind: string;
}

export interface CreateOrderFormProps {
  onSuccess: (order: CreatedOrder) => void | Promise<void>;
  onCancel?: () => void;
  className?: string;
}

/** True while the Rx can still be ordered against: finalized and not past its expiry. */
function isOrderable(rx: PrescriptionRow): boolean {
  if (rx.status !== 'FINALIZED') return false;
  return !rx.expiresAt || new Date(rx.expiresAt) > new Date();
}

function rxLabel(rx: PrescriptionRow): string {
  const kind = rx.type === 'SPECTACLE' ? 'Spectacle' : 'Contact lens';
  const expiry = rx.expiresAt ? `expires ${new Date(rx.expiresAt).toLocaleDateString()}` : 'no expiry';
  return `${kind} v${rx.version} — ${expiry}`;
}

export default function CreateOrderForm({ onSuccess, onCancel, className = 'card' }: CreateOrderFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientSuggestion | null>(null);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRow[]>([]);
  const [loadingRx, setLoadingRx] = useState(false);
  const [selectedRxId, setSelectedRxId] = useState('');
  const [policies, setPolicies] = useState<CoveragePolicy[]>([]);
  const [values, setValues] = useState<OrderFormValues>(emptyOrderValues);

  useEffect(() => {
    if (!selectedPatient) {
      setPrescriptions([]);
      setSelectedRxId('');
      setPolicies([]);
      return;
    }
    api<CoveragePolicy[]>(`/insurance/patient/${selectedPatient.id}`)
      .then(setPolicies)
      .catch(() => setPolicies([]));
    setLoadingRx(true);
    api<PrescriptionRow[]>(`/prescriptions/patient/${selectedPatient.id}`)
      .then((rows) => {
        const orderable = rows.filter(isOrderable);
        setPrescriptions(orderable);
        setSelectedRxId(orderable[0]?.id ?? '');
      })
      .catch(() => {
        setPrescriptions([]);
        setSelectedRxId('');
      })
      .finally(() => setLoadingRx(false));
  }, [selectedPatient]);

  const selectedRx = prescriptions.find((rx) => rx.id === selectedRxId) ?? null;
  // A spectacle order against a contact-lens Rx is nonsensical, so the kind
  // follows the prescription rather than being picked separately.
  const kind = (selectedRx?.type as OrderKind | undefined) ?? 'SPECTACLE';

  async function createOrder(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (!selectedPatient) throw new Error('Select a patient');
      if (!selectedRx) throw new Error('Select a finalized prescription');

      const order = await api<CreatedOrder>('/orders', {
        method: 'POST',
        body: {
          patientId: selectedPatient.id,
          prescriptionId: selectedRx.id,
          kind,
          details: detailsFrom(values, kind),
          labName: optionalText(values.labName),
          // The stored total is what the patient owes after discount or
          // benefits; the API derives the balance from it.
          priceTotal: computeTotals(values, kind).patientTotal,
          deposit: optionalNumber(values.deposit),
        },
      });
      await onSuccess(order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order creation failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className={className}
      onSubmit={(e) => void createOrder(e)}
      // PatientSearchBox lets Enter bubble so the Patients page can run its
      // search on it. Here that would open a half-empty order, so ordering is
      // deliberate: only the Create order button submits.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault();
      }}
    >
      <h2 id="order-dialog-title">New order</h2>

      {error && <p className="error-text">{error}</p>}

      <div className="field" style={{ marginBottom: '0.75rem' }}>
        <label>Patient</label>
        {selectedPatient ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span>
              {selectedPatient.lastName}, {selectedPatient.firstName}
              <span className="muted"> {selectedPatient.mrn}</span>
            </span>
            <button
              type="button"
              className="secondary"
              style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
              onClick={() => {
                setSelectedPatient(null);
                setSearchQuery('');
              }}
            >
              Change
            </button>
          </div>
        ) : (
          <PatientSearchBox
            value={searchQuery}
            onChange={setSearchQuery}
            onSubmit={() => undefined}
            onSelect={(patient) => {
              setSelectedPatient(patient);
              setSearchQuery(`${patient.lastName}, ${patient.firstName}`);
            }}
          />
        )}
      </div>

      {selectedPatient && (
        <div className="field" style={{ marginBottom: '0.75rem' }}>
          <label>Prescription</label>
          {loadingRx ? (
            <p className="muted">Loading prescriptions…</p>
          ) : prescriptions.length === 0 ? (
            <p className="muted">No finalized, unexpired prescriptions for this patient.</p>
          ) : (
            <select value={selectedRxId} onChange={(e) => setSelectedRxId(e.target.value)}>
              {prescriptions.map((rx) => (
                <option key={rx.id} value={rx.id}>
                  {rxLabel(rx)}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {selectedRx && (
        <div className="order-dialog-layout">
          <div>
            <OrderFields kind={kind} values={values} onChange={setValues} />
          </div>
          <OrderPricingPanel kind={kind} values={values} onChange={setValues} policies={policies} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
        <button type="submit" disabled={saving || !selectedRx}>
          {saving ? 'Creating…' : 'Create order'}
        </button>
        {onCancel && (
          <button type="button" className="secondary" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
