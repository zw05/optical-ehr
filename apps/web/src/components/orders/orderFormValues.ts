/** Shared field state for the create and edit order forms. */

export type OrderKind = 'SPECTACLE' | 'CONTACT_LENS';

/**
 * Frame specs typed by hand. `source` is not here: it is derived from whether
 * the frame came out of inventory or the patient brought their own.
 */
export const FRAME_FIELDS = [
  ['brand', 'Brand'],
  ['model', 'Model'],
  ['color', 'Color'],
  ['eye', 'Eye size'],
  ['bridge', 'Bridge'],
  ['temple', 'Temple'],
] as const;

export const FRAME_SOURCE_INVENTORY = 'Inventory';
export const FRAME_SOURCE_PATIENT = "Patient's own";

export const MEASUREMENT_FIELDS = [
  ['pdOd', 'PD OD (mm)'],
  ['pdOs', 'PD OS (mm)'],
  ['segHeightOd', 'Seg height OD (mm)'],
  ['segHeightOs', 'Seg height OS (mm)'],
  ['oc', 'Optical center (mm)'],
  ['vertex', 'Vertex (mm)'],
  ['pantoTilt', 'Pantoscopic tilt (°)'],
  ['wrap', 'Wrap (°)'],
] as const;

export const LENS_COATINGS = [
  'AR coating',
  'Blue light filter',
  'Photochromic',
  'Polarized',
  'Scratch-resistant',
  'UV protection',
] as const;

type FrameKey = (typeof FRAME_FIELDS)[number][0];
type MeasurementKey = (typeof MEASUREMENT_FIELDS)[number][0];

/** Every field is held as a string so inputs stay controlled and clearable. */
export interface OrderFormValues {
  frame: Record<FrameKey, string>;
  /** Inventory SKU when the frame came from stock; blank for a patient's own frame. */
  frameSku: string;
  patientOwnFrame: boolean;
  lensDesign: string;
  lensMaterial: string;
  /** Chosen LensPriceList id, or blank when the lens is typed in by hand. */
  lensPriceListId: string;
  coatings: string[];
  measurements: Record<MeasurementKey, string>;
  brand: string;
  /** Chosen ContactLensProduct id, or blank when the brand is typed in by hand. */
  clProductId: string;
  odQty: string;
  osQty: string;
  supplyMonths: string;
  trial: boolean;
  trayNumber: string;
  jobNotes: string;
  labName: string;
  labReference: string;
  warrantyNotes: string;

  // Retail lines. Insurance benefits apply per line, so the price cannot be a
  // single figure the way a self-pay total can.
  frameRetail: string;
  lensRetail: string;
  addOnsRetail: string;
  clMaterialsRetail: string;
  clFittingRetail: string;
  /** Exam copay when insured, full exam fee when self-pay. */
  examCharge: string;

  /** Self-pay discount on materials, ignored once a policy is applied. */
  discountPercent: string;

  /** Patient's policy id, or blank for self-pay. */
  coveragePolicyId: string;
  /** Payer identity captured with the order, since policies can change later. */
  coveragePayerName: string;
  coveragePlanName: string;
  coverageMemberId: string;
  /** Benefit terms as applied to this order, seeded from the payer defaults. */
  frameAllowance: string;
  framePercentOff: string;
  lensAllowance: string;
  lensCopay: string;
  /** One pot covering frame and lens together; overrides the two above. */
  materialsAllowance: string;

  /** Money taken so far; the API calls this the deposit. */
  deposit: string;
}

/** Shape of the freeform details JSON stored on an order. */
export interface OrderDetails {
  frame?: Partial<Record<FrameKey, string>> & { source?: string; sku?: string };
  lens?: { design?: string; material?: string; coatings?: string[]; priceListId?: string };
  measurements?: Partial<Record<MeasurementKey, number>>;
  brand?: string;
  productId?: string;
  odQty?: number;
  osQty?: number;
  supplyMonths?: number;
  trial?: boolean;
  trayNumber?: string;
  jobNotes?: string;
  /**
   * Pricing worksheet. The order's priceTotal column holds what the patient
   * owes, so the API's balance maths stays authoritative; this records how that
   * figure was reached, including the benefit terms as they stood on the day.
   */
  pricing?: {
    frameRetail?: number;
    lensRetail?: number;
    addOnsRetail?: number;
    clMaterialsRetail?: number;
    clFittingRetail?: number;
    examCharge?: number;
    subtotal: number;
    discountPercent?: number;
    coverage?: {
      policyId: string;
      payerName: string;
      planName?: string;
      memberId?: string;
      frameAllowance?: number;
      framePercentOff?: number;
      lensAllowance?: number;
      lensCopay?: number;
      materialsAllowance?: number;
    };
    planPortion: number;
    patientTotal: number;
  };
}

function blankRecord<K extends string>(keys: readonly (readonly [K, string])[]): Record<K, string> {
  return Object.fromEntries(keys.map(([key]) => [key, ''])) as Record<K, string>;
}

export function emptyOrderValues(): OrderFormValues {
  return {
    frame: blankRecord(FRAME_FIELDS),
    frameSku: '',
    patientOwnFrame: false,
    lensDesign: '',
    lensMaterial: '',
    lensPriceListId: '',
    coatings: [],
    measurements: blankRecord(MEASUREMENT_FIELDS),
    brand: '',
    clProductId: '',
    odQty: '',
    osQty: '',
    supplyMonths: '',
    trial: false,
    trayNumber: '',
    jobNotes: '',
    labName: '',
    labReference: '',
    warrantyNotes: '',
    frameRetail: '',
    lensRetail: '',
    addOnsRetail: '',
    clMaterialsRetail: '',
    clFittingRetail: '',
    examCharge: '',
    discountPercent: '',
    coveragePolicyId: '',
    coveragePayerName: '',
    coveragePlanName: '',
    coverageMemberId: '',
    frameAllowance: '',
    framePercentOff: '',
    lensAllowance: '',
    lensCopay: '',
    materialsAllowance: '',
    deposit: '',
  };
}

function str(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

/** Seeds the form from an existing order so edits start from what is stored. */
export function orderValuesFrom(order: {
  details: OrderDetails | null;
  labName: string | null;
  labReference: string | null;
  warrantyNotes: string | null;
  priceTotal: string | number | null;
  deposit: string | number | null;
}): OrderFormValues {
  const d = order.details ?? {};
  const values = emptyOrderValues();

  for (const [key] of FRAME_FIELDS) values.frame[key] = str(d.frame?.[key]);
  for (const [key] of MEASUREMENT_FIELDS) values.measurements[key] = str(d.measurements?.[key]);

  values.frameSku = str(d.frame?.sku);
  values.patientOwnFrame = d.frame?.source === FRAME_SOURCE_PATIENT;
  values.lensDesign = str(d.lens?.design);
  values.lensMaterial = str(d.lens?.material);
  values.lensPriceListId = str(d.lens?.priceListId);
  values.coatings = d.lens?.coatings ?? [];
  values.brand = str(d.brand);
  values.clProductId = str(d.productId);
  values.odQty = str(d.odQty);
  values.osQty = str(d.osQty);
  values.supplyMonths = str(d.supplyMonths);
  values.trial = d.trial ?? false;
  values.trayNumber = str(d.trayNumber);
  values.jobNotes = str(d.jobNotes);
  values.labName = str(order.labName);
  values.labReference = str(order.labReference);
  values.warrantyNotes = str(order.warrantyNotes);
  const p = d.pricing;
  values.frameRetail = str(p?.frameRetail);
  values.lensRetail = str(p?.lensRetail);
  values.addOnsRetail = str(p?.addOnsRetail);
  values.clMaterialsRetail = str(p?.clMaterialsRetail);
  values.clFittingRetail = str(p?.clFittingRetail);
  values.examCharge = str(p?.examCharge);
  values.discountPercent = str(p?.discountPercent);
  values.coveragePolicyId = str(p?.coverage?.policyId);
  values.coveragePayerName = str(p?.coverage?.payerName);
  values.coveragePlanName = str(p?.coverage?.planName);
  values.coverageMemberId = str(p?.coverage?.memberId);
  values.frameAllowance = str(p?.coverage?.frameAllowance);
  values.framePercentOff = str(p?.coverage?.framePercentOff);
  values.lensAllowance = str(p?.coverage?.lensAllowance);
  values.lensCopay = str(p?.coverage?.lensCopay);
  values.materialsAllowance = str(p?.coverage?.materialsAllowance);
  // Orders written before pricing was itemised only have a final figure; show
  // it as the lens line so the panel still adds up to what was charged.
  if (!p && order.priceTotal !== null) values.lensRetail = str(order.priceTotal);
  values.deposit = str(order.deposit);

  return values;
}

export interface OrderTotals {
  /** Frame line; only spectacle orders have one. */
  frame: number;
  /** Lens or contact-lens materials, plus spectacle add-ons. */
  lens: number;
  /** Lines no allowance applies to, e.g. a contact-lens fitting fee. */
  other: number;
  subtotal: number;
  insured: boolean;
  /** Self-pay only. */
  discountAmount: number;
  /** What the plan absorbs; zero when self-pay. */
  planPortion: number;
  /** What the patient owes — this becomes the order's priceTotal. */
  patientTotal: number;
  paid: number;
  balance: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function amount(value: string): number {
  return parseAmount(value) ?? 0;
}

function percentage(value: string): number {
  return Math.min(Math.max(parseAmount(value) ?? 0, 0), 100);
}

/**
 * Splits an order between plan and patient.
 *
 * Frame and lens are the materials: allowances, copays and the self-pay
 * discount all apply to them. Professional fees — the exam charge and a contact
 * lens fitting — are never discounted and never drawn from an allowance, so
 * they fall to the patient in full either way. A combined materials allowance,
 * when set, replaces the separate frame and lens allowances.
 */
export function computeTotals(values: OrderFormValues, kind: OrderKind = 'SPECTACLE'): OrderTotals {
  const spectacle = kind === 'SPECTACLE';
  const frame = spectacle ? amount(values.frameRetail) : 0;
  const lens = spectacle
    ? amount(values.lensRetail) + amount(values.addOnsRetail)
    : amount(values.clMaterialsRetail);
  const other = round2(
    amount(values.examCharge) + (spectacle ? 0 : amount(values.clFittingRetail)),
  );
  const subtotal = round2(frame + lens + other);
  const paid = amount(values.deposit);
  const insured = values.coveragePolicyId !== '';

  if (!insured) {
    const discountAmount = round2(((frame + lens) * percentage(values.discountPercent)) / 100);
    const patientTotal = round2(subtotal - discountAmount);
    return {
      frame,
      lens,
      other,
      subtotal,
      insured,
      discountAmount,
      planPortion: 0,
      patientTotal,
      paid,
      balance: round2(patientTotal - paid),
    };
  }

  const materialsAllowance = parseAmount(values.materialsAllowance);
  const percentOff = percentage(values.framePercentOff);
  let covered: number;

  if (materialsAllowance !== null) {
    const overage = Math.max(0, frame + lens - materialsAllowance);
    covered = round2(overage * (1 - percentOff / 100));
  } else {
    const frameOverage = Math.max(0, frame - (parseAmount(values.frameAllowance) ?? 0));
    const patientFrame = round2(frameOverage * (1 - percentOff / 100));
    const copay = parseAmount(values.lensCopay);
    const patientLens =
      copay !== null
        ? Math.min(copay, lens)
        : round2(Math.max(0, lens - (parseAmount(values.lensAllowance) ?? 0)));
    covered = round2(patientFrame + patientLens);
  }

  const patientTotal = round2(covered + other);
  return {
    frame,
    lens,
    other,
    subtotal,
    insured,
    discountAmount: 0,
    planPortion: round2(subtotal - patientTotal),
    patientTotal,
    paid,
    balance: round2(patientTotal - paid),
  };
}

/** Drops blank entries so stored details never carry empty strings. */
function compact(source: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value !== ''),
  );
}

function compactNumbers(source: Record<string, string>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(source)
      .filter(([, value]) => value.trim() !== '')
      .map(([key, value]) => [key, Number(value)]),
  );
}

function numberOrUndefined(value: string): number | undefined {
  const parsed = parseAmount(value);
  return parsed === null ? undefined : parsed;
}

/** Snapshots the pricing worksheet, including the benefit terms as applied. */
function pricingFrom(values: OrderFormValues, kind: OrderKind): NonNullable<OrderDetails['pricing']> {
  const totals = computeTotals(values, kind);
  const spectacle = kind === 'SPECTACLE';
  return {
    ...(spectacle
      ? {
          frameRetail: numberOrUndefined(values.frameRetail),
          lensRetail: numberOrUndefined(values.lensRetail),
          addOnsRetail: numberOrUndefined(values.addOnsRetail),
        }
      : {
          clMaterialsRetail: numberOrUndefined(values.clMaterialsRetail),
          clFittingRetail: numberOrUndefined(values.clFittingRetail),
        }),
    examCharge: numberOrUndefined(values.examCharge),
    subtotal: totals.subtotal,
    ...(totals.discountAmount > 0
      ? { discountPercent: numberOrUndefined(values.discountPercent) }
      : {}),
    ...(values.coveragePolicyId
      ? {
          coverage: {
            policyId: values.coveragePolicyId,
            payerName: values.coveragePayerName,
            planName: optionalText(values.coveragePlanName),
            memberId: optionalText(values.coverageMemberId),
            frameAllowance: numberOrUndefined(values.frameAllowance),
            framePercentOff: numberOrUndefined(values.framePercentOff),
            lensAllowance: numberOrUndefined(values.lensAllowance),
            lensCopay: numberOrUndefined(values.lensCopay),
            materialsAllowance: numberOrUndefined(values.materialsAllowance),
          },
        }
      : {}),
    planPortion: totals.planPortion,
    patientTotal: totals.patientTotal,
  };
}

/** Builds the details JSON for the given order kind, omitting untouched fields. */
export function detailsFrom(values: OrderFormValues, kind: OrderKind): OrderDetails {
  const job = {
    ...compact({ trayNumber: values.trayNumber, jobNotes: values.jobNotes }),
    pricing: pricingFrom(values, kind),
  };

  if (kind === 'SPECTACLE') {
    const frame = compact(values.frame);
    // Provenance is only meaningful once a frame is actually named, so an
    // untouched frame section stays empty rather than claiming "Inventory".
    const hasFrame = values.patientOwnFrame || values.frameSku !== '' || Object.keys(frame).length > 0;
    return {
      ...job,
      frame: {
        ...frame,
        ...(hasFrame
          ? { source: values.patientOwnFrame ? FRAME_SOURCE_PATIENT : FRAME_SOURCE_INVENTORY }
          : {}),
        // Only a stock frame carries a SKU back to inventory.
        ...(values.patientOwnFrame ? {} : compact({ sku: values.frameSku })),
      },
      lens: {
        ...compact({
          design: values.lensDesign,
          material: values.lensMaterial,
          priceListId: values.lensPriceListId,
        }),
        ...(values.coatings.length > 0 ? { coatings: values.coatings } : {}),
      },
      measurements: compactNumbers(values.measurements),
    };
  }

  return {
    ...job,
    ...compact({ brand: values.brand, productId: values.clProductId }),
    ...compactNumbers({
      odQty: values.odQty,
      osQty: values.osQty,
      supplyMonths: values.supplyMonths,
    }),
    trial: values.trial,
  };
}

/** Optional number for a request body: blank stays absent rather than becoming 0. */
export function optionalNumber(value: string): number | undefined {
  return value.trim() ? Number(value) : undefined;
}

/** Optional string for a request body. */
export function optionalText(value: string): string | undefined {
  return value.trim() || undefined;
}
