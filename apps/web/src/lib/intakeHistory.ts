/**
 * The practice's paper intake page — "Past Medical, Social, Surgical History &
 * Review of Systems" — as a typed question catalog.
 *
 * This lives on the chart rather than the visit: the patient answers it once and
 * a provider re-confirms it at each exam, which is what the paper form's
 * "Re-Reviewed Date / Dr.'s Signature" lines are for.
 *
 * Every question carries the paper's `CE` (can't elaborate) choice. Questions
 * that the clinic already recorded in more detail keep the finer options — the
 * tri-state is a floor, not a ceiling.
 */

export type IntakeStatus = string;

export interface IntakeAnswer {
  status: IntakeStatus;
  detail?: string;
}

export type IntakeAnswers = Record<string, IntakeAnswer>;

export interface IntakeOption {
  value: string;
  label: string;
  /** Answers that open the follow-up column. */
  opensDetail?: boolean;
}

export interface IntakeQuestion {
  key: string;
  label: string;
  /** Overrides the group's options where the clinic records finer detail. */
  options?: IntakeOption[];
}

export interface IntakeGroup {
  key: string;
  title: string;
  /** The question printed once above the column, e.g. "Do you use the following?" */
  prompt?: string;
  /** Header of the paper's right-hand column, e.g. "If yes, relationship to you". */
  detailLabel: string;
  detailPlaceholder?: string;
  options: IntakeOption[];
  questions: IntakeQuestion[];
}

/** The paper's default column: CE, No, Yes. */
export const CE_NO_YES: IntakeOption[] = [
  { value: 'ce', label: 'CE' },
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes', opensDetail: true },
];

/** The answer a clinician reaches for when nothing is wrong. */
export const NEGATIVE_STATUS = 'no';

export const INTAKE_GROUPS: IntakeGroup[] = [
  {
    key: 'social',
    title: 'Social History',
    prompt: 'Do you use the following?',
    detailLabel: 'If any changes, or if yes — how often?',
    detailPlaceholder: 'e.g. 2 drinks / week',
    options: CE_NO_YES,
    questions: [
      {
        key: 'alcohol',
        label: 'Alcohol',
        options: [
          { value: 'ce', label: 'CE' },
          { value: 'none', label: 'None' },
          { value: 'occasional', label: 'Occasional', opensDetail: true },
          { value: 'regular', label: 'Regular', opensDetail: true },
        ],
      },
      {
        key: 'tobacco',
        label: 'Tobacco',
        options: [
          { value: 'ce', label: 'CE' },
          { value: 'never', label: 'Never' },
          { value: 'former', label: 'Former', opensDetail: true },
          { value: 'current', label: 'Current', opensDetail: true },
        ],
      },
      { key: 'drives', label: 'Do you drive?' },
    ],
  },
  {
    key: 'family',
    title: 'Family Medical History',
    prompt: 'Does any member of your family have the following?',
    detailLabel: 'If yes, relationship to you',
    detailPlaceholder: 'e.g. Mother',
    options: CE_NO_YES,
    questions: [
      { key: 'cataract', label: 'Cataract' },
      { key: 'glaucoma', label: 'Glaucoma' },
      { key: 'retinalDetachment', label: 'Retinal Detachment' },
      { key: 'highBloodPressure', label: 'High Blood Pressure' },
      { key: 'cancer', label: 'Cancer' },
      { key: 'diabetesInsulin', label: 'Diabetes (insulin dependent)' },
      { key: 'heartAttacks', label: 'Heart Attacks' },
      { key: 'other', label: 'Other' },
    ],
  },
  {
    key: 'ros',
    title: 'Review of Systems (Self)',
    prompt: 'Do you have problems with any of the following?',
    detailLabel: 'If yes, please specify',
    options: CE_NO_YES,
    questions: [
      { key: 'ent', label: 'Ear, nose & throat (e.g. sinus conditions)' },
      { key: 'cardiovascular', label: 'Cardiovascular (heart, blood vessels)' },
      { key: 'respiratory', label: 'Respiratory (lungs, breathing)' },
      { key: 'gastrointestinal', label: 'Gastrointestinal (stomach, intestines)' },
      { key: 'musculoskeletal', label: 'Musculoskeletal (muscles, joint)' },
      { key: 'skin', label: 'Skin' },
      { key: 'neurological', label: 'Neurological (e.g. strokes)' },
      { key: 'psychiatric', label: 'Psychiatric' },
      { key: 'endocrine', label: 'Endocrine (e.g. thyroid)' },
      { key: 'hemeLymph', label: 'Hematological / Lymphatic (blood, lymph nodes)' },
      { key: 'allergicImmunologic', label: 'Allergic / Immunologic (e.g. allergies)' },
    ],
  },
  {
    key: 'pmh',
    title: 'Past Medical History (Self)',
    detailLabel: 'If yes, how long?',
    detailPlaceholder: 'e.g. 5 years',
    options: CE_NO_YES,
    questions: [
      { key: 'highBloodPressure', label: 'High blood pressure' },
      { key: 'diabetesInsulin', label: 'Diabetes (insulin dependent)' },
      { key: 'diabetesNonInsulin', label: 'Diabetes (non-insulin dependent)' },
      { key: 'cardiacDisorder', label: 'Cardiac disorder' },
      { key: 'asthma', label: 'Asthma' },
      { key: 'cva', label: 'CVA (stroke)' },
      { key: 'arthritis', label: 'Arthritis' },
      { key: 'thyroid', label: 'Thyroid' },
      { key: 'cancers', label: 'Cancers' },
      { key: 'others', label: 'Others' },
    ],
  },
];

/**
 * The free-text tail of the paper form. Stored in the same answers map under a
 * reserved prefix so the whole page saves as one document.
 */
export const INTAKE_TEXT_FIELDS: { key: string; label: string; placeholder?: string }[] = [
  { key: 'text.pastSurgicalHistory', label: 'Past Surgical History', placeholder: 'Procedures and dates' },
  { key: 'text.medicationHighBloodPressure', label: 'Medication — High Blood Pressure' },
  { key: 'text.medicationDiabetes', label: 'Medication — Diabetes' },
  { key: 'text.medicationOther', label: 'Medication — Other' },
];

/** The paper's pre-printed allergy ticks, plus a free-text "Other". */
export const INTAKE_ALLERGIES: { key: string; label: string }[] = [
  { key: 'allergy.penicillin', label: 'Penicillin' },
  { key: 'allergy.sulfa', label: 'Sulfa' },
];

export const INTAKE_ALLERGY_OTHER = 'text.allergyOther';
export const INTAKE_NKDA = 'allergy.nkda';

/** Flat list of every tri-state question key, prefixed by its group. */
export function intakeQuestionKey(groupKey: string, questionKey: string): string {
  return `${groupKey}.${questionKey}`;
}

/** True when the chosen answer opens the paper's follow-up column. */
export function opensDetail(group: IntakeGroup, question: IntakeQuestion, status: string): boolean {
  const options = question.options ?? group.options;
  return options.some((o) => o.value === status && o.opensDetail);
}

/**
 * Sets every unanswered question in a group to the negative answer — the paper's
 * common case, where a patient ticks "No" down the whole column. Answers already
 * given are left alone so this never overwrites real information.
 */
export function negativePatchForGroup(group: IntakeGroup, answers: IntakeAnswers): IntakeAnswers {
  const patch: IntakeAnswers = {};
  for (const question of group.questions) {
    const key = intakeQuestionKey(group.key, question.key);
    if (answers[key]?.status) continue;
    const options = question.options ?? group.options;
    // Groups with finer options use their own "nothing to report" value.
    const negative =
      options.find((o) => o.value === NEGATIVE_STATUS) ??
      options.find((o) => o.value === 'none') ??
      options.find((o) => o.value === 'never');
    if (negative) patch[key] = { status: negative.value };
  }
  return patch;
}

/** Count of questions answered across every group — drives the review banner. */
export function intakeProgress(answers: IntakeAnswers): { answered: number; total: number } {
  let answered = 0;
  let total = 0;
  for (const group of INTAKE_GROUPS) {
    for (const question of group.questions) {
      total += 1;
      if (answers[intakeQuestionKey(group.key, question.key)]?.status) answered += 1;
    }
  }
  return { answered, total };
}
