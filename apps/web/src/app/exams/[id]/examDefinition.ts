/**
 * Typed config for the tabbed patient exam form.
 * Values persist under Encounter.clinicalData keyed by tab key.
 */

export type FieldOption = { value: string; label: string };

export type ExamField =
  | {
      type: 'text' | 'textarea' | 'number';
      key: string;
      label: string;
      placeholder?: string;
      rows?: number;
      width?: 'full' | 'half' | 'third';
    }
  | {
      type: 'radio';
      key: string;
      label: string;
      options: FieldOption[];
      width?: 'full' | 'half' | 'third';
    }
  | {
      type: 'checkboxGroup';
      key: string;
      label: string;
      options: FieldOption[];
      exclusiveNone?: string;
      width?: 'full' | 'half' | 'third';
    }
  | {
      type: 'select';
      key: string;
      label: string;
      options: FieldOption[];
      width?: 'full' | 'half' | 'third';
    }
  | {
      type: 'checkbox';
      key: string;
      label: string;
      width?: 'full' | 'half' | 'third';
    }
  | {
      type: 'duration';
      key: string;
      label: string;
      unitKey: string;
      units: FieldOption[];
      width?: 'full' | 'half' | 'third';
    }
  | {
      type: 'odOsGrid';
      key: string;
      label: string;
      columns: { key: string; label: string; input?: 'text' | 'select'; options?: FieldOption[] }[];
    }
  | {
      type: 'slitLampRow';
      key: string;
      label: string;
      gradingOptions?: FieldOption[];
    }
  | {
      type: 'testRow';
      key: string;
      label: string;
    }
  | {
      type: 'rosSystem';
      key: string;
      label: string;
    }
  | {
      type: 'repeatable';
      key: string;
      label: string;
      addLabel: string;
      itemFields: {
        key: string;
        label: string;
        placeholder?: string;
        width?: 'full' | 'half' | 'third';
        lookup?: 'icd10';
      }[];
    }
  | {
      type: 'hpiComplaint';
      key: string;
      label: string;
    }
  | {
      type: 'externalExam';
      key: string;
      label: string;
    };

export interface ExamSection {
  title?: string;
  fields: ExamField[];
}

export interface ExamTab {
  key: string;
  label: string;
  stub?: boolean;
  sections: ExamSection[];
}

const SNELLEN: FieldOption[] = [
  '20/15',
  '20/20',
  '20/25',
  '20/30',
  '20/40',
  '20/50',
  '20/60',
  '20/70',
  '20/80',
  '20/100',
  '20/200',
  '20/400',
  'CF',
  'HM',
  'LP',
  'NLP',
].map((v) => ({ value: v, label: v }));

const GRADING: FieldOption[] = [
  { value: 'trace', label: 'Trace' },
  { value: '1+', label: '1+' },
  { value: '2+', label: '2+' },
  { value: '3+', label: '3+' },
  { value: '4+', label: '4+' },
];

const CD_RATIO: FieldOption[] = Array.from({ length: 9 }, (_, i) => {
  const v = ((i + 1) / 10).toFixed(1);
  return { value: v, label: v };
});

const RX_COLUMNS: ExamField & { type: 'odOsGrid' } = {
  type: 'odOsGrid',
  key: 'placeholder',
  label: 'Rx',
  columns: [
    { key: 'sphere', label: 'Sphere', input: 'text' },
    { key: 'cylinder', label: 'Cylinder', input: 'text' },
    { key: 'axis', label: 'Axis', input: 'text' },
    { key: 'add', label: 'Add', input: 'text' },
    { key: 'va', label: 'VA', input: 'select', options: SNELLEN },
  ],
};

function rxBlock(key: string, label: string): ExamField {
  return { ...RX_COLUMNS, key, label };
}

export const EXAM_TABS: ExamTab[] = [
  {
    key: 'hpi',
    label: 'HPI',
    sections: [
      {
        title: 'History Of Present Illness',
        fields: [
          {
            type: 'hpiComplaint',
            key: 'complaints',
            label: 'Chief Complaints',
          },
        ],
      },
    ],
  },
  {
    key: 'socialHistory',
    label: 'Social History',
    sections: [
      {
        fields: [
          {
            type: 'radio',
            key: 'tobacco',
            label: 'Tobacco',
            options: [
              { value: 'never', label: 'Never' },
              { value: 'former', label: 'Former' },
              { value: 'current', label: 'Current' },
            ],
            width: 'half',
          },
          {
            type: 'text',
            key: 'packsPerDay',
            label: 'Packs / day',
            placeholder: 'e.g. 0.5',
            width: 'half',
          },
          {
            type: 'radio',
            key: 'alcohol',
            label: 'Alcohol',
            options: [
              { value: 'none', label: 'None' },
              { value: 'occasional', label: 'Occasional' },
              { value: 'regular', label: 'Regular' },
            ],
            width: 'half',
          },
          {
            type: 'radio',
            key: 'recreationalDrugs',
            label: 'Recreational drugs',
            options: [
              { value: 'never', label: 'Never' },
              { value: 'former', label: 'Former' },
              { value: 'current', label: 'Current' },
            ],
            width: 'half',
          },
          {
            type: 'text',
            key: 'occupation',
            label: 'Occupation',
            width: 'half',
          },
          {
            type: 'select',
            key: 'screenTime',
            label: 'Daily screen time',
            options: [
              { value: '<2h', label: '< 2 hours' },
              { value: '2-4h', label: '2–4 hours' },
              { value: '4-8h', label: '4–8 hours' },
              { value: '>8h', label: '> 8 hours' },
            ],
            width: 'half',
          },
          {
            type: 'radio',
            key: 'drives',
            label: 'Drives',
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ],
            width: 'half',
          },
          {
            type: 'checkbox',
            key: 'nightDrivingDifficulty',
            label: 'Night-driving difficulty',
            width: 'half',
          },
        ],
      },
    ],
  },
  {
    key: 'medicalHistory',
    label: 'Medical History',
    sections: [
      {
        title: 'Systemic conditions',
        fields: [
          {
            type: 'checkboxGroup',
            key: 'medicalConditions',
            label: 'Medical conditions',
            exclusiveNone: 'none',
            options: [
              { value: 'diabetes', label: 'Diabetes' },
              { value: 'hypertension', label: 'Hypertension' },
              { value: 'highCholesterol', label: 'High cholesterol' },
              { value: 'thyroid', label: 'Thyroid' },
              { value: 'arthritis', label: 'Arthritis' },
              { value: 'cancer', label: 'Cancer' },
              { value: 'heartDisease', label: 'Heart disease' },
              { value: 'none', label: 'None' },
            ],
          },
        ],
      },
      {
        title: 'Ocular history',
        fields: [
          {
            type: 'checkboxGroup',
            key: 'ocularHistory',
            label: 'Ocular history',
            exclusiveNone: 'none',
            options: [
              { value: 'glaucoma', label: 'Glaucoma' },
              { value: 'cataracts', label: 'Cataracts' },
              { value: 'amd', label: 'Macular degeneration' },
              { value: 'dryEye', label: 'Dry eye' },
              { value: 'amblyopia', label: 'Amblyopia' },
              { value: 'retinalDetachment', label: 'Retinal detachment' },
              { value: 'eyeSurgery', label: 'Eye surgery' },
              { value: 'eyeTrauma', label: 'Eye trauma' },
              { value: 'none', label: 'None' },
            ],
          },
        ],
      },
      {
        title: 'Medications & allergies',
        fields: [
          {
            type: 'repeatable',
            key: 'medications',
            label: 'Medications',
            addLabel: 'Add medication',
            itemFields: [
              { key: 'name', label: 'Name', placeholder: 'Medication name', width: 'half' },
              { key: 'dose', label: 'Dose', placeholder: 'e.g. 10 mg daily', width: 'half' },
            ],
          },
          {
            type: 'checkbox',
            key: 'nkda',
            label: 'NKDA (no known drug allergies)',
          },
          {
            type: 'repeatable',
            key: 'allergies',
            label: 'Allergies',
            addLabel: 'Add allergy',
            itemFields: [
              { key: 'allergen', label: 'Allergen', placeholder: 'e.g. Penicillin', width: 'half' },
              { key: 'reaction', label: 'Reaction', placeholder: 'e.g. Rash', width: 'half' },
            ],
          },
        ],
      },
      {
        title: 'Family history',
        fields: [
          {
            type: 'checkboxGroup',
            key: 'familyHistory',
            label: 'Family history',
            exclusiveNone: 'none',
            options: [
              { value: 'glaucoma', label: 'Glaucoma' },
              { value: 'amd', label: 'AMD' },
              { value: 'diabetes', label: 'Diabetes' },
              { value: 'blindness', label: 'Blindness' },
              { value: 'strabismus', label: 'Strabismus' },
              { value: 'none', label: 'None' },
            ],
          },
        ],
      },
    ],
  },
  {
    key: 'ros',
    label: 'ROS',
    sections: [
      {
        title: 'Review of Systems',
        fields: [
          { type: 'rosSystem', key: 'constitutional', label: 'Constitutional' },
          { type: 'rosSystem', key: 'eyes', label: 'Eyes' },
          { type: 'rosSystem', key: 'ent', label: 'ENT' },
          { type: 'rosSystem', key: 'cardiovascular', label: 'Cardiovascular' },
          { type: 'rosSystem', key: 'respiratory', label: 'Respiratory' },
          { type: 'rosSystem', key: 'gi', label: 'GI' },
          { type: 'rosSystem', key: 'gu', label: 'GU' },
          { type: 'rosSystem', key: 'musculoskeletal', label: 'Musculoskeletal' },
          { type: 'rosSystem', key: 'skin', label: 'Skin' },
          { type: 'rosSystem', key: 'neurological', label: 'Neurological' },
          { type: 'rosSystem', key: 'psychiatric', label: 'Psychiatric' },
          { type: 'rosSystem', key: 'endocrine', label: 'Endocrine' },
          { type: 'rosSystem', key: 'hemeLymph', label: 'Heme/Lymph' },
          { type: 'rosSystem', key: 'allergicImmunologic', label: 'Allergic/Immunologic' },
        ],
      },
    ],
  },
  {
    key: 'prelimBinocular',
    label: 'Preliminary/Binocular',
    sections: [
      {
        title: 'Visual acuity — uncorrected',
        fields: [
          {
            type: 'select',
            key: 'ucvaOdDistance',
            label: 'OD distance',
            options: SNELLEN,
            width: 'third',
          },
          {
            type: 'select',
            key: 'ucvaOsDistance',
            label: 'OS distance',
            options: SNELLEN,
            width: 'third',
          },
          {
            type: 'select',
            key: 'ucvaOuDistance',
            label: 'OU distance',
            options: SNELLEN,
            width: 'third',
          },
          {
            type: 'select',
            key: 'ucvaOdNear',
            label: 'OD near',
            options: SNELLEN,
            width: 'third',
          },
          {
            type: 'select',
            key: 'ucvaOsNear',
            label: 'OS near',
            options: SNELLEN,
            width: 'third',
          },
          {
            type: 'select',
            key: 'ucvaOuNear',
            label: 'OU near',
            options: SNELLEN,
            width: 'third',
          },
        ],
      },
      {
        title: 'Visual acuity — corrected',
        fields: [
          {
            type: 'select',
            key: 'cvaOdDistance',
            label: 'OD distance',
            options: SNELLEN,
            width: 'third',
          },
          {
            type: 'select',
            key: 'cvaOsDistance',
            label: 'OS distance',
            options: SNELLEN,
            width: 'third',
          },
          {
            type: 'select',
            key: 'cvaOuDistance',
            label: 'OU distance',
            options: SNELLEN,
            width: 'third',
          },
          {
            type: 'select',
            key: 'cvaOdNear',
            label: 'OD near',
            options: SNELLEN,
            width: 'third',
          },
          {
            type: 'select',
            key: 'cvaOsNear',
            label: 'OS near',
            options: SNELLEN,
            width: 'third',
          },
          {
            type: 'select',
            key: 'cvaOuNear',
            label: 'OU near',
            options: SNELLEN,
            width: 'third',
          },
        ],
      },
      {
        title: 'Pupils / EOM / Fields',
        fields: [
          { type: 'checkbox', key: 'perrla', label: 'PERRLA', width: 'third' },
          {
            type: 'radio',
            key: 'apd',
            label: 'APD',
            options: [
              { value: 'none', label: 'None' },
              { value: 'od', label: 'OD' },
              { value: 'os', label: 'OS' },
            ],
            width: 'third',
          },
          {
            type: 'text',
            key: 'pupilSize',
            label: 'Pupil sizes (OD / OS mm)',
            placeholder: 'e.g. 4 / 4',
            width: 'third',
          },
          {
            type: 'radio',
            key: 'eoms',
            label: 'EOMs',
            options: [
              { value: 'full', label: 'Full' },
              { value: 'restricted', label: 'Restricted' },
            ],
            width: 'half',
          },
          {
            type: 'text',
            key: 'eomsNotes',
            label: 'EOM notes',
            width: 'half',
          },
          {
            type: 'radio',
            key: 'cvfOd',
            label: 'Confrontation VF OD',
            options: [
              { value: 'full', label: 'Full' },
              { value: 'restricted', label: 'Restricted' },
            ],
            width: 'half',
          },
          {
            type: 'radio',
            key: 'cvfOs',
            label: 'Confrontation VF OS',
            options: [
              { value: 'full', label: 'Full' },
              { value: 'restricted', label: 'Restricted' },
            ],
            width: 'half',
          },
        ],
      },
      {
        title: 'Binocular / sensory',
        fields: [
          {
            type: 'select',
            key: 'coverDistance',
            label: 'Cover test distance',
            options: [
              { value: 'ortho', label: 'Ortho' },
              { value: 'exophoria', label: 'Exophoria' },
              { value: 'esophoria', label: 'Esophoria' },
              { value: 'tropia', label: 'Tropia' },
            ],
            width: 'third',
          },
          {
            type: 'text',
            key: 'coverDistanceMag',
            label: 'Magnitude (Δ)',
            width: 'third',
          },
          {
            type: 'select',
            key: 'coverNear',
            label: 'Cover test near',
            options: [
              { value: 'ortho', label: 'Ortho' },
              { value: 'exophoria', label: 'Exophoria' },
              { value: 'esophoria', label: 'Esophoria' },
              { value: 'tropia', label: 'Tropia' },
            ],
            width: 'third',
          },
          {
            type: 'text',
            key: 'coverNearMag',
            label: 'Near magnitude (Δ)',
            width: 'third',
          },
          {
            type: 'text',
            key: 'npc',
            label: 'NPC',
            placeholder: 'e.g. 6 / 8 cm',
            width: 'third',
          },
          {
            type: 'select',
            key: 'stereo',
            label: 'Stereo',
            options: [
              { value: '40', label: '40″' },
              { value: '50', label: '50″' },
              { value: '60', label: '60″' },
              { value: '80', label: '80″' },
              { value: '100', label: '100″' },
              { value: '200', label: '200″' },
              { value: 'fail', label: 'Fail' },
            ],
            width: 'third',
          },
          {
            type: 'select',
            key: 'colorVision',
            label: 'Color vision',
            options: [
              { value: 'normal', label: 'Normal' },
              { value: 'deficient', label: 'Deficient' },
            ],
            width: 'third',
          },
          {
            type: 'text',
            key: 'colorVisionType',
            label: 'Deficiency type',
            placeholder: 'e.g. deutan',
            width: 'third',
          },
        ],
      },
    ],
  },
  {
    key: 'refractionCl',
    label: 'Refraction/Contact Lens',
    sections: [
      {
        title: 'Refraction',
        fields: [
          rxBlock('currentRx', 'Current Rx'),
          rxBlock('autorefraction', 'Autorefraction'),
          rxBlock('manifest', 'Manifest refraction'),
          rxBlock('finalRx', 'Final Rx'),
          {
            type: 'checkbox',
            key: 'cycloplegicEnabled',
            label: 'Cycloplegic refraction performed',
          },
          rxBlock('cycloplegic', 'Cycloplegic refraction'),
        ],
      },
      {
        title: 'Contact lens',
        fields: [
          {
            type: 'text',
            key: 'clBrand',
            label: 'Current lens brand',
            width: 'third',
          },
          {
            type: 'text',
            key: 'clBc',
            label: 'BC',
            width: 'third',
          },
          {
            type: 'text',
            key: 'clDia',
            label: 'DIA',
            width: 'third',
          },
          {
            type: 'text',
            key: 'clPowerOd',
            label: 'Power OD',
            width: 'half',
          },
          {
            type: 'text',
            key: 'clPowerOs',
            label: 'Power OS',
            width: 'half',
          },
          {
            type: 'radio',
            key: 'clFit',
            label: 'Fit assessment',
            options: [
              { value: 'optimal', label: 'Optimal' },
              { value: 'flat', label: 'Flat' },
              { value: 'steep', label: 'Steep' },
            ],
            width: 'half',
          },
          {
            type: 'text',
            key: 'clOverRefraction',
            label: 'Over-refraction',
            width: 'half',
          },
          {
            type: 'select',
            key: 'clWearSchedule',
            label: 'Wear schedule',
            options: [
              { value: 'daily', label: 'Daily disposable' },
              { value: 'biweekly', label: 'Biweekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'extended', label: 'Extended wear' },
              { value: 'flexible', label: 'Flexible' },
            ],
            width: 'half',
          },
        ],
      },
    ],
  },
  {
    key: 'externalInternal',
    label: 'External/Internal',
    sections: [
      {
        fields: [
          { type: 'externalExam', key: 'externalExam', label: 'External Exam' },
        ],
      },
      {
        title: 'Intraocular pressure',
        fields: [
          {
            type: 'radio',
            key: 'iopMethod',
            label: 'Method',
            options: [
              { value: 'nct', label: 'NCT' },
              { value: 'gat', label: 'GAT' },
              { value: 'icare', label: 'iCare' },
            ],
            width: 'full',
          },
          { type: 'number', key: 'iopOd', label: 'IOP OD (mmHg)', width: 'third' },
          { type: 'number', key: 'iopOs', label: 'IOP OS (mmHg)', width: 'third' },
          { type: 'text', key: 'iopTime', label: 'Time', placeholder: 'HH:MM', width: 'third' },
        ],
      },
      {
        title: 'Internal / fundus',
        fields: [
          {
            type: 'radio',
            key: 'dilated',
            label: 'Dilated',
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ],
            width: 'half',
          },
          {
            type: 'checkboxGroup',
            key: 'dilationAgents',
            label: 'Dilation agents',
            options: [
              { value: 'tropicamide', label: 'Tropicamide' },
              { value: 'phenylephrine', label: 'Phenylephrine' },
              { value: 'cyclopentolate', label: 'Cyclopentolate' },
            ],
            width: 'half',
          },
          { type: 'text', key: 'dilationTime', label: 'Dilation time', width: 'third' },
          {
            type: 'select',
            key: 'cdRatioOd',
            label: 'C/D ratio OD',
            options: CD_RATIO,
            width: 'third',
          },
          {
            type: 'select',
            key: 'cdRatioOs',
            label: 'C/D ratio OS',
            options: CD_RATIO,
            width: 'third',
          },
          { type: 'slitLampRow', key: 'macula', label: 'Macula' },
          { type: 'slitLampRow', key: 'vessels', label: 'Vessels' },
          { type: 'slitLampRow', key: 'vitreous', label: 'Vitreous' },
          { type: 'slitLampRow', key: 'periphery', label: 'Periphery' },
        ],
      },
    ],
  },
  {
    key: 'additionalTests',
    label: 'Additional Tests',
    sections: [
      {
        fields: [
          { type: 'testRow', key: 'oct', label: 'OCT' },
          { type: 'testRow', key: 'visualField', label: 'Visual Field' },
          { type: 'testRow', key: 'fundusPhotos', label: 'Fundus Photos' },
          { type: 'testRow', key: 'topography', label: 'Topography' },
          { type: 'testRow', key: 'pachymetry', label: 'Pachymetry' },
        ],
      },
    ],
  },
  {
    key: 'plan',
    label: 'Procedure Impression/Plan',
    sections: [
      {
        fields: [
          {
            type: 'textarea',
            key: 'assessment',
            label: 'Assessment',
            rows: 3,
            width: 'full',
          },
          {
            type: 'repeatable',
            key: 'diagnoses',
            label: 'Diagnoses (ICD-10)',
            addLabel: 'Add diagnosis',
            itemFields: [
              { key: 'code', label: 'Code', placeholder: 'e.g. H52.13', width: 'third', lookup: 'icd10' },
              { key: 'description', label: 'Description', placeholder: 'Diagnosis', width: 'half', lookup: 'icd10' },
            ],
          },
          {
            type: 'textarea',
            key: 'planNotes',
            label: 'Plan',
            rows: 3,
            width: 'full',
          },
          {
            type: 'checkboxGroup',
            key: 'patientEducation',
            label: 'Patient education',
            options: [
              { value: 'uvProtection', label: 'UV protection' },
              { value: 'clHygiene', label: 'CL hygiene' },
              { value: 'dryEyeRegimen', label: 'Dry eye regimen' },
              { value: 'diabeticEyeInfo', label: 'Diabetic eye info' },
            ],
          },
          {
            type: 'select',
            key: 'returnToClinic',
            label: 'Return to clinic',
            options: [
              { value: '2w', label: '2 weeks' },
              { value: '1m', label: '1 month' },
              { value: '3m', label: '3 months' },
              { value: '6m', label: '6 months' },
              { value: '12m', label: '12 months' },
            ],
            width: 'third',
          },
        ],
      },
    ],
  },
  {
    key: 'finalizeRx',
    label: 'Finalize Prescription',
    stub: true,
    sections: [],
  },
  {
    // Rendered by the AttachedDocs component, not the generic field renderer:
    // its content lives in Document/EncounterDocument rows, not clinicalData.
    key: 'attachedDocs',
    label: 'Attached Docs',
    sections: [],
  },
];

/** HPI complaint sub-fields (used by the hpiComplaint renderer). */
export const HPI_COMPLAINT_FIELDS = {
  location: [
    { value: 'od', label: 'OD' },
    { value: 'os', label: 'OS' },
    { value: 'ou', label: 'OU' },
    { value: 'na', label: 'N/A' },
  ] as FieldOption[],
  quality: [
    { value: 'burning', label: 'Burning' },
    { value: 'itching', label: 'Itching' },
    { value: 'tearing', label: 'Tearing' },
    { value: 'blur', label: 'Blur' },
    { value: 'pain', label: 'Pain' },
    { value: 'redness', label: 'Redness' },
    { value: 'discharge', label: 'Discharge' },
    { value: 'flashes', label: 'Flashes' },
    { value: 'floaters', label: 'Floaters' },
  ] as FieldOption[],
  severity: [
    { value: 'mild', label: 'Mild' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'severe', label: 'Severe' },
  ] as FieldOption[],
  durationUnits: [
    { value: 'hours', label: 'Hours' },
    { value: 'days', label: 'Days' },
    { value: 'weeks', label: 'Weeks' },
    { value: 'months', label: 'Months' },
    { value: 'years', label: 'Years' },
  ] as FieldOption[],
  timing: [
    { value: 'constant', label: 'Constant' },
    { value: 'intermittent', label: 'Intermittent' },
    { value: 'worseAm', label: 'Worse AM' },
    { value: 'worsePm', label: 'Worse PM' },
  ] as FieldOption[],
};

/** Section keys used by the seed / ExamTemplate. */
export const DEFAULT_TEMPLATE_SECTIONS = EXAM_TABS.filter((t) => !t.stub).map((t) => ({
  key: t.key,
  title: t.label,
  enabled: true,
  requiredFields:
    t.key === 'hpi'
      ? ['complaints']
      : t.key === 'plan'
        ? ['assessment']
        : t.key === 'externalInternal'
          ? ['iopOd', 'iopOs', 'iopMethod']
          : t.key === 'prelimBinocular'
            ? ['cvaOdDistance', 'cvaOsDistance']
            : undefined,
}));
