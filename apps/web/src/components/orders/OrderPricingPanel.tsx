'use client';

/** Lab and money side of an order: retail lines, coverage, and what is owed. */
import { useState } from 'react';
import MoneyInput from '@/components/MoneyInput';
import { computeTotals, type OrderFormValues, type OrderKind } from './orderFormValues';

/** A patient policy with the payer's default benefit terms attached. */
export interface CoveragePolicy {
  id: string;
  payerName: string;
  planName: string | null;
  memberId: string;
  isVision: boolean;
  acceptedPayer: {
    frameAllowance: string | null;
    lensAllowance: string | null;
    examCopay: string | null;
  } | null;
}

interface OrderPricingPanelProps {
  kind: OrderKind;
  values: OrderFormValues;
  onChange: (next: OrderFormValues) => void;
  policies: CoveragePolicy[];
  /** Lab reference and warranty notes are edit-only; create has no DTO field for them. */
  showLabReference?: boolean;
}

function currency(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** Plain-words list of the benefit terms being applied, for the popover. */
function benefitLines(values: OrderFormValues): string[] {
  const lines: string[] = [];
  const materials = values.materialsAllowance.trim();
  const frameAllowance = values.frameAllowance.trim();
  const percentOff = values.framePercentOff.trim();
  const lensCopay = values.lensCopay.trim();
  const lensAllowance = values.lensAllowance.trim();

  if (materials) {
    lines.push(`$${materials} allowance across frame and lenses together`);
    if (percentOff) lines.push(`${percentOff}% off whatever is left over`);
    return lines;
  }
  if (frameAllowance) lines.push(`$${frameAllowance} frame allowance`);
  if (percentOff) lines.push(`${percentOff}% off the frame overage`);
  if (lensCopay) lines.push(`$${lensCopay} lens copay — the plan covers the rest`);
  else if (lensAllowance) lines.push(`$${lensAllowance} lens allowance`);
  if (values.examCharge.trim()) lines.push(`$${values.examCharge.trim()} exam copay`);
  if (lines.length === 0) lines.push('No benefit amounts entered yet.');
  return lines;
}

export default function OrderPricingPanel({
  kind,
  values,
  onChange,
  policies,
  showLabReference = false,
}: OrderPricingPanelProps) {
  const [showBenefits, setShowBenefits] = useState(false);
  const totals = computeTotals(values, kind);
  const spectacle = kind === 'SPECTACLE';

  const set = <K extends keyof OrderFormValues>(key: K, value: OrderFormValues[K]) =>
    onChange({ ...values, [key]: value });

  /** Seeds the worksheet from the payer's defaults; every figure stays editable. */
  function chooseCoverage(policyId: string) {
    const policy = policies.find((p) => p.id === policyId);
    if (!policy) {
      onChange({
        ...values,
        coveragePolicyId: '',
        coveragePayerName: '',
        coveragePlanName: '',
        coverageMemberId: '',
      });
      return;
    }
    onChange({
      ...values,
      coveragePolicyId: policy.id,
      coveragePayerName: policy.payerName,
      coveragePlanName: policy.planName ?? '',
      coverageMemberId: policy.memberId,
      frameAllowance: values.frameAllowance || (policy.acceptedPayer?.frameAllowance ?? ''),
      lensAllowance: values.lensAllowance || (policy.acceptedPayer?.lensAllowance ?? ''),
      examCharge: values.examCharge || (policy.acceptedPayer?.examCopay ?? ''),
    });
  }

  const moneyField = (label: string, key: keyof OrderFormValues) => (
    <div className="field">
      <label>{label}</label>
      <MoneyInput
        value={values[key] as string}
        onChange={(e) => set(key, e.target.value as OrderFormValues[typeof key])}
      />
    </div>
  );

  return (
    <aside className="order-pricing">
      <h3>Lab &amp; pricing</h3>

      <div className="field">
        <label>Lab</label>
        <input value={values.labName} onChange={(e) => set('labName', e.target.value)} />
      </div>
      {showLabReference && (
        <div className="field">
          <label>Lab reference</label>
          <input value={values.labReference} onChange={(e) => set('labReference', e.target.value)} />
        </div>
      )}

      <h4 className="order-pricing-heading">Retail</h4>
      {spectacle ? (
        <>
          {moneyField('Frame', 'frameRetail')}
          {moneyField('Lenses', 'lensRetail')}
          {moneyField('Add-ons', 'addOnsRetail')}
        </>
      ) : (
        <>
          {moneyField('Materials', 'clMaterialsRetail')}
          {moneyField('Fitting fee', 'clFittingRetail')}
        </>
      )}
      {moneyField(totals.insured ? 'Exam copay' : 'Exam fee', 'examCharge')}

      <h4 className="order-pricing-heading">Coverage</h4>
      <div className="field">
        <label>Paid by</label>
        <select value={values.coveragePolicyId} onChange={(e) => chooseCoverage(e.target.value)}>
          <option value="">Self-pay</option>
          {policies.map((policy) => (
            <option key={policy.id} value={policy.id}>
              {policy.payerName}
              {policy.planName ? ` — ${policy.planName}` : ''}
            </option>
          ))}
        </select>
      </div>

      {totals.insured ? (
        <>
          <button
            type="button"
            className="secondary"
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
            onClick={() => setShowBenefits((open) => !open)}
          >
            {showBenefits ? 'Hide benefits' : 'Benefits applied'}
          </button>
          {showBenefits && (
            <div className="order-benefit-popover">
              <strong>{values.coveragePayerName}</strong>
              <ul>
                {benefitLines(values).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {totals.other > 0 && (
                <p className="muted">
                  {spectacle
                    ? 'Exam copay is charged in full.'
                    : 'Exam copay and fitting fee are charged in full.'}
                </p>
              )}
            </div>
          )}
          {spectacle && (
            <>
              {moneyField('Frame allowance', 'frameAllowance')}
              <div className="field">
                <label>% off frame overage</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={values.framePercentOff}
                  onChange={(e) => set('framePercentOff', e.target.value)}
                />
              </div>
            </>
          )}
          {moneyField('Lens copay', 'lensCopay')}
          {moneyField('Lens allowance', 'lensAllowance')}
          {spectacle && moneyField('Materials allowance (combined)', 'materialsAllowance')}
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            A combined materials allowance replaces the frame and lens allowances above. A lens copay
            replaces the lens allowance.
          </p>
        </>
      ) : (
        <>
          <div className="field">
            <label>Discount %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={values.discountPercent}
              onChange={(e) => set('discountPercent', e.target.value)}
            />
          </div>
          {totals.other > 0 && (
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              The discount applies to materials only, not the exam
              {spectacle ? '' : ' or fitting fee'}.
            </p>
          )}
        </>
      )}

      <h4 className="order-pricing-heading">Payment</h4>
      {moneyField('Amount paid', 'deposit')}
      {showLabReference && (
        <div className="field">
          <label>Warranty notes</label>
          <input value={values.warrantyNotes} onChange={(e) => set('warrantyNotes', e.target.value)} />
        </div>
      )}

      <div className="order-pricing-row">
        <span>Subtotal</span>
        <span>{currency(totals.subtotal)}</span>
      </div>
      {totals.discountAmount > 0 && (
        <div className="order-pricing-row">
          <span>Discount</span>
          <span>−{currency(totals.discountAmount)}</span>
        </div>
      )}
      {totals.insured && (
        <div className="order-pricing-row">
          <span>Plan pays</span>
          <span>−{currency(totals.planPortion)}</span>
        </div>
      )}
      <div className="order-pricing-row total">
        <span>Patient owes</span>
        <span>{currency(totals.patientTotal)}</span>
      </div>
      <div className="order-pricing-row">
        <span>Amount paid</span>
        <span>{currency(totals.paid)}</span>
      </div>
      <div className="order-pricing-row balance">
        <span>Balance</span>
        <span>{currency(totals.balance)}</span>
      </div>
    </aside>
  );
}
