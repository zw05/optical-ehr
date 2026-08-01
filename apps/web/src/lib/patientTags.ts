/** Program tags staff assign on a patient chart (not derived from Rx/orders). */

export const PATIENT_TAGS = [
  'ORTHO_K',
  'MYOPIA_MANAGEMENT',
  'SPECIALTY_CL',
  'DRY_EYE',
  'VISION_THERAPY',
  'LOW_VISION',
] as const;

export type PatientTag = (typeof PATIENT_TAGS)[number];

export const PATIENT_TAG_LABELS: Record<PatientTag, string> = {
  ORTHO_K: 'Ortho-K',
  MYOPIA_MANAGEMENT: 'Myopia management',
  SPECIALTY_CL: 'Specialty contact lens',
  DRY_EYE: 'Dry eye',
  VISION_THERAPY: 'Vision therapy',
  LOW_VISION: 'Low vision',
};

export function patientTagLabel(tag: string): string {
  return PATIENT_TAG_LABELS[tag as PatientTag] ?? tag;
}
