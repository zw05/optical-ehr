/**
 * Demo seed: two finished exams with printable prescriptions, so the Rx PDF
 * output can be reviewed against realistic data. Run after `npm run seed`.
 *
 * Case 1 (Nora Whitfield) is a routine myope with early presbyopia and normal
 * findings. Case 2 (Marcus Delgado) is deliberately busy — high cylinder,
 * prism, multiple diagnoses — to stress the print layout.
 *
 * Rows are written straight through Prisma rather than the Nest services
 * because signing and finalizing require an authenticated doctor request.
 * Synthetic data only.
 */
import {
  EncounterStatus,
  PatientTag,
  PrescriptionStatus,
  PrescriptionType,
  PrismaClient,
  Role,
  Sex,
} from '@prisma/client';

const prisma = new PrismaClient();

const PRACTICE_ID = 'seed-practice';

/** Fixed ids keep re-runs idempotent; UUID format satisfies the DTO validators. */
const IDS = {
  routine: {
    patient: '11111111-1111-4111-8111-111111111101',
    insurance: '44444444-4444-4444-8444-444444444401',
    encounter: '22222222-2222-4222-8222-222222222201',
    spectacleRx: '33333333-3333-4333-8333-333333333301',
    contactLensRx: '33333333-3333-4333-8333-333333333302',
  },
  complex: {
    patient: '11111111-1111-4111-8111-111111111102',
    insurance: '44444444-4444-4444-8444-444444444402',
    encounter: '22222222-2222-4222-8222-222222222202',
    spectacleRx: '33333333-3333-4333-8333-333333333303',
    contactLensRx: '33333333-3333-4333-8333-333333333304',
  },
};

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(10, 30, 0, 0);
  return d;
}

function monthsFrom(start: Date, months: number): Date {
  const d = new Date(start);
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Every ROS system marked negative, matching the form's "all negative" shortcut. */
function rosAllNegative(positives: Record<string, string> = {}) {
  const systems = [
    'constitutional',
    'eyes',
    'ent',
    'cardiovascular',
    'respiratory',
    'gi',
    'gu',
    'musculoskeletal',
    'skin',
    'neurological',
    'psychiatric',
    'endocrine',
    'hemeLymph',
    'allergicImmunologic',
  ];
  const ros: Record<string, string> = {};
  for (const key of systems) {
    ros[key] = positives[key] ? 'positive' : 'negative';
    if (positives[key]) ros[`${key}Notes`] = positives[key];
  }
  return ros;
}

const ROUTINE_CLINICAL_DATA = {
  hpi: {
    complaints: [
      {
        text: 'Blurry vision at distance, worse when driving at night. Also holding the phone farther away to read.',
        location: 'ou',
        quality: ['blur'],
        severity: 'moderate',
        duration: '6',
        durationUnit: 'months',
        timing: 'constant',
        context: 'Noticed after starting a new desk job',
        modifyingFactors: 'Better with current glasses, worse when tired',
        associatedSigns: 'Mild eye strain by end of day',
      },
    ],
  },
  socialHistory: {
    tobacco: 'never',
    alcohol: 'occasional',
    recreationalDrugs: 'never',
    occupation: 'Software developer',
    screenTime: '>8h',
    drives: 'yes',
    nightDrivingDifficulty: true,
  },
  medicalHistory: {
    medicalConditions: ['hypertension'],
    ocularHistory: ['dryEye'],
    medications: [{ name: 'Lisinopril', dose: '10 mg daily' }],
    nkda: true,
    allergies: [],
    familyHistory: ['glaucoma'],
  },
  ros: rosAllNegative({ eyes: 'Intermittent dryness and end-of-day strain' }),
  prelimBinocular: {
    ucvaOdDistance: '20/60',
    ucvaOsDistance: '20/70',
    ucvaOuDistance: '20/50',
    ucvaOdNear: '20/25',
    ucvaOsNear: '20/25',
    ucvaOuNear: '20/20',
    cvaOdDistance: '20/20',
    cvaOsDistance: '20/20',
    cvaOuDistance: '20/20',
    cvaOdNear: '20/20',
    cvaOsNear: '20/20',
    cvaOuNear: '20/20',
    perrla: true,
    apd: 'none',
    pupilSize: '4 / 4',
    eoms: 'full',
    cvfOd: 'full',
    cvfOs: 'full',
    coverDistance: 'ortho',
    coverNear: 'exophoria',
    coverNearMag: '4',
    npc: '6 / 8 cm',
    stereo: '40',
    colorVision: 'normal',
  },
  refractionCl: {
    currentRx: {
      od: { sphere: '-1.50', cylinder: '-0.50', axis: '175', add: '', va: '20/25' },
      os: { sphere: '-1.75', cylinder: '-0.25', axis: '005', add: '', va: '20/25' },
    },
    autorefraction: {
      od: { sphere: '-1.82', cylinder: '-0.54', axis: '174', add: '', va: '' },
      os: { sphere: '-2.06', cylinder: '-0.31', axis: '007', add: '', va: '' },
    },
    manifest: {
      od: { sphere: '-1.75', cylinder: '-0.50', axis: '175', add: '+1.00', va: '20/20' },
      os: { sphere: '-2.00', cylinder: '-0.25', axis: '005', add: '+1.00', va: '20/20' },
    },
    finalRx: {
      od: { sphere: '-1.75', cylinder: '-0.50', axis: '175', add: '+1.00', va: '20/20' },
      os: { sphere: '-2.00', cylinder: '-0.25', axis: '005', add: '+1.00', va: '20/20' },
    },
    cycloplegicEnabled: false,
    clBrand: 'Acuvue Oasys 1-Day',
    clBc: '8.5',
    clDia: '14.3',
    clPowerOd: '-1.75',
    clPowerOs: '-2.00',
    clFit: 'optimal',
    clOverRefraction: 'Plano OU',
    clWearSchedule: 'daily',
  },
  externalInternal: {
    lidsLashes: { wnl: true },
    conjunctiva: { wnl: true },
    cornea: { wnl: false, grade: 'trace', notes: 'Trace inferior punctate staining OU' },
    anteriorChamber: { wnl: true },
    iris: { wnl: true },
    lens: { wnl: true },
    vanHerick: '4',
    iopMethod: 'gat',
    iopOd: 15,
    iopOs: 16,
    iopTime: '10:45',
    dilated: 'yes',
    dilationAgents: ['tropicamide', 'phenylephrine'],
    dilationTime: '10:50',
    cdRatioOd: '0.3',
    cdRatioOs: '0.3',
    macula: { wnl: true, notes: 'Flat, good foveal reflex OU' },
    vessels: { wnl: true },
    vitreous: { wnl: true },
    periphery: { wnl: true, notes: 'Attached 360 OU' },
  },
  additionalTests: {
    fundusPhotos: { performed: true, result: 'normal', notes: 'Baseline optic nerve photos OU' },
    oct: { performed: true, result: 'normal', notes: 'RNFL within normal limits OU' },
  },
  plan: {
    assessment: 'Compound myopic astigmatism with early presbyopia; mild evaporative dry eye. Ocular health normal.',
    diagnoses: [
      { code: 'H52.223', description: 'Regular astigmatism, bilateral' },
      { code: 'H52.13', description: 'Myopia, bilateral' },
      { code: 'H52.4', description: 'Presbyopia' },
      { code: 'H04.123', description: 'Dry eye syndrome, bilateral lacrimal glands' },
    ],
    planNotes:
      'Updated spectacle Rx with +1.00 add; progressive lenses recommended. Daily disposable contact lenses dispensed for part-time wear. Preservative-free artificial tears QID. Return in 12 months.',
    patientEducation: ['uvProtection', 'clHygiene', 'dryEyeRegimen'],
    returnToClinic: '12m',
  },
};

const COMPLEX_CLINICAL_DATA = {
  hpi: {
    complaints: [
      {
        text: 'Progressive blur at all distances despite two Rx changes in the past year. Glare and halos around headlights.',
        location: 'ou',
        quality: ['blur'],
        severity: 'severe',
        duration: '14',
        durationUnit: 'months',
        timing: 'constant',
        context: 'Worse since insulin dose was increased',
        modifyingFactors: 'Nothing helps; brighter light makes glare worse',
        associatedSigns: 'Stopped driving after dark',
      },
      {
        text: 'Intermittent vertical double vision at near, resolves when covering either eye.',
        location: 'ou',
        quality: ['blur'],
        severity: 'moderate',
        duration: '3',
        durationUnit: 'months',
        timing: 'intermittent',
        context: 'Reading or working at the computer',
        modifyingFactors: 'Better with rest and closing one eye',
        associatedSigns: 'Frontal headache after reading',
      },
    ],
  },
  socialHistory: {
    tobacco: 'former',
    packsPerDay: '1',
    alcohol: 'occasional',
    recreationalDrugs: 'never',
    occupation: 'Retired machinist',
    screenTime: '4-8h',
    drives: 'yes',
    nightDrivingDifficulty: true,
  },
  medicalHistory: {
    medicalConditions: ['diabetes', 'hypertension', 'highCholesterol'],
    ocularHistory: ['glaucoma', 'cataracts', 'dryEye'],
    medications: [
      { name: 'Insulin glargine', dose: '28 units nightly' },
      { name: 'Metformin', dose: '1000 mg BID' },
      { name: 'Atorvastatin', dose: '40 mg daily' },
      { name: 'Latanoprost 0.005%', dose: '1 drop OU QHS' },
    ],
    nkda: false,
    allergies: [
      { allergen: 'Sulfa drugs', reaction: 'Hives' },
      { allergen: 'Neomycin', reaction: 'Contact dermatitis of lids' },
    ],
    familyHistory: ['glaucoma', 'diabetes', 'blindness'],
  },
  ros: rosAllNegative({
    eyes: 'Glare, halos, fluctuating vision, intermittent diplopia at near',
    endocrine: 'Type 2 diabetes, last A1c 8.4%',
    cardiovascular: 'Hypertension, controlled on medication',
    neurological: 'Occasional frontal headache after reading',
  }),
  prelimBinocular: {
    ucvaOdDistance: '20/200',
    ucvaOsDistance: '20/400',
    ucvaOuDistance: '20/200',
    ucvaOdNear: '20/100',
    ucvaOsNear: '20/200',
    ucvaOuNear: '20/100',
    cvaOdDistance: '20/30',
    cvaOsDistance: '20/40',
    cvaOuDistance: '20/30',
    cvaOdNear: '20/30',
    cvaOsNear: '20/40',
    cvaOuNear: '20/30',
    perrla: false,
    apd: 'os',
    pupilSize: '3 / 3.5',
    eoms: 'restricted',
    eomsNotes: 'Mild underaction of left superior oblique',
    cvfOd: 'full',
    cvfOs: 'restricted',
    coverDistance: 'esophoria',
    coverDistanceMag: '6',
    coverNear: 'tropia',
    coverNearMag: '8 left hyper',
    npc: '12 / 16 cm',
    stereo: '200',
    colorVision: 'deficient',
    colorVisionType: 'Acquired, blue-yellow OS',
  },
  refractionCl: {
    currentRx: {
      od: { sphere: '-5.75', cylinder: '-2.75', axis: '020', add: '+2.25', va: '20/50' },
      os: { sphere: '-6.25', cylinder: '-2.25', axis: '160', add: '+2.25', va: '20/70' },
    },
    autorefraction: {
      od: { sphere: '-6.87', cylinder: '-3.31', axis: '016', add: '', va: '' },
      os: { sphere: '-7.44', cylinder: '-2.81', axis: '164', add: '', va: '' },
    },
    manifest: {
      od: { sphere: '-6.75', cylinder: '-3.25', axis: '015', add: '+2.50', va: '20/30' },
      os: { sphere: '-7.25', cylinder: '-2.75', axis: '165', add: '+2.50', va: '20/40' },
    },
    finalRx: {
      od: { sphere: '-6.75', cylinder: '-3.25', axis: '015', add: '+2.50', va: '20/30' },
      os: { sphere: '-7.25', cylinder: '-2.75', axis: '165', add: '+2.50', va: '20/40' },
    },
    cycloplegicEnabled: true,
    cycloplegic: {
      od: { sphere: '-6.50', cylinder: '-3.25', axis: '015', add: '', va: '20/30' },
      os: { sphere: '-7.00', cylinder: '-2.75', axis: '165', add: '', va: '20/40' },
    },
    clBrand: 'Biofinity Toric',
    clBc: '8.7',
    clDia: '14.5',
    clPowerOd: '-6.50',
    clPowerOs: '-7.00',
    clFit: 'steep',
    clOverRefraction: '-0.25 sphere OU',
    clWearSchedule: 'monthly',
  },
  externalInternal: {
    lidsLashes: { wnl: false, grade: '1+', notes: 'Anterior blepharitis with collarettes OU' },
    conjunctiva: { wnl: false, grade: 'trace', notes: 'Trace injection OU' },
    cornea: { wnl: false, grade: '2+', notes: 'Diffuse punctate staining OU, worse OS' },
    anteriorChamber: { wnl: true, notes: 'Deep and quiet OU' },
    iris: { wnl: false, notes: 'Mild transillumination defects OS' },
    lens: { wnl: false, grade: '3+', notes: 'NS 3+ OD, NS 3+ with 2+ PSC OS' },
    vanHerick: '2',
    iopMethod: 'gat',
    iopOd: 24,
    iopOs: 27,
    iopTime: '09:15',
    dilated: 'yes',
    dilationAgents: ['tropicamide', 'phenylephrine'],
    dilationTime: '09:25',
    cdRatioOd: '0.7',
    cdRatioOs: '0.8',
    macula: {
      wnl: false,
      notes: 'Scattered dot-blot hemorrhages and hard exudates within one disc diameter of fovea OS',
    },
    vessels: { wnl: false, notes: 'AV nicking, copper wiring, venous beading OU' },
    vitreous: { wnl: false, notes: 'Posterior vitreous detachment OD' },
    periphery: { wnl: false, notes: 'Microaneurysms and cotton wool spots in all quadrants OU' },
  },
  additionalTests: {
    oct: { performed: true, result: 'abnormal', notes: 'Central subfield thickness 342 um OS; RNFL thinning superiorly OU' },
    visualField: { performed: true, result: 'abnormal', notes: 'Superior arcuate defect OS, MD -6.82 dB' },
    fundusPhotos: { performed: true, result: 'abnormal', notes: 'Documented NPDR changes OU' },
    pachymetry: { performed: true, result: 'normal', notes: '545 um OD / 538 um OS' },
    topography: { performed: true, result: 'abnormal', notes: 'Symmetric bowtie with 3.1 D of corneal astigmatism OU' },
  },
  plan: {
    assessment:
      'Moderate NPDR OU with clinically significant macular edema OS. Primary open-angle glaucoma OU, uncontrolled on monotherapy. Visually significant nuclear sclerotic and posterior subcapsular cataract OU. High compound myopic astigmatism with presbyopia and decompensating left hyperphoria at near.',
    diagnoses: [
      { code: 'E11.3311', description: 'Type 2 diabetes with moderate NPDR with macular edema, right eye' },
      { code: 'E11.3312', description: 'Type 2 diabetes with moderate NPDR with macular edema, left eye' },
      { code: 'H40.11X2', description: 'Primary open-angle glaucoma, moderate stage' },
      { code: 'H25.13', description: 'Age-related nuclear cataract, bilateral' },
      { code: 'H52.223', description: 'Regular astigmatism, bilateral' },
      { code: 'H50.31', description: 'Intermittent vertical strabismus' },
      { code: 'H01.003', description: 'Blepharitis, bilateral' },
    ],
    planNotes:
      'Urgent retina referral for anti-VEGF evaluation OS, patient to be seen within two weeks. Add timolol 0.5% BID OU to latanoprost; recheck IOP in 4 weeks with repeat visual field and OCT RNFL. Cataract surgery discussed, deferred until retinopathy is stabilized. New spectacle Rx with 2 prism diopters base up OD for near-vertical imbalance. Lid hygiene with warm compresses BID. Coordinate with PCP on glycemic control.',
    patientEducation: ['diabeticEyeInfo', 'uvProtection', 'dryEyeRegimen', 'clHygiene'],
    returnToClinic: '1m',
  },
};

async function main() {
  const practice = await prisma.practice.findUnique({ where: { id: PRACTICE_ID } });
  const doctor = await prisma.user.findUnique({ where: { email: 'doctor@dev.local' } });
  const template = await prisma.examTemplate.findFirst({
    where: { practiceId: PRACTICE_ID, isActive: true },
    orderBy: { version: 'desc' },
  });
  if (!practice || !doctor || doctor.role !== Role.DOCTOR || !template) {
    throw new Error('Run `npm run seed` first — demo data builds on the base practice, doctor, and exam template.');
  }

  const routineExamDate = daysAgo(2);
  const complexExamDate = daysAgo(4);

  // ----- Case 1: routine myope with early presbyopia -----

  await prisma.patient.upsert({
    where: { id: IDS.routine.patient },
    update: {},
    create: {
      id: IDS.routine.patient,
      practiceId: practice.id,
      mrn: 'P000101',
      firstName: 'Nora',
      lastName: 'Whitfield',
      dateOfBirth: new Date('1980-03-22'),
      sex: Sex.FEMALE,
      phone: '(555) 010-4411',
      email: 'nora.whitfield@example.dev',
      address: '412 Cedar Lane',
      city: 'Springfield',
      state: 'IL',
      zip: '62704',
      preferredContact: 'email',
      consentSignedAt: daysAgo(2),
    },
  });

  await prisma.insurancePolicy.upsert({
    where: { id: IDS.routine.insurance },
    update: {},
    create: {
      id: IDS.routine.insurance,
      patientId: IDS.routine.patient,
      payerName: 'VSP',
      planName: 'VSP Choice',
      memberId: 'VSP-4471902',
      groupNumber: 'GRP-2210',
      isVision: true,
      priority: 1,
    },
  });

  await prisma.encounter.upsert({
    where: { id: IDS.routine.encounter },
    update: {},
    create: {
      id: IDS.routine.encounter,
      practiceId: practice.id,
      patientId: IDS.routine.patient,
      templateId: template.id,
      status: EncounterStatus.SIGNED,
      chiefComplaint: 'Blurry distance vision and trouble reading small print',
      clinicalData: ROUTINE_CLINICAL_DATA,
      assessment: ROUTINE_CLINICAL_DATA.plan.assessment,
      plan: ROUTINE_CLINICAL_DATA.plan.planNotes,
      diagnosisCodes: ROUTINE_CLINICAL_DATA.plan.diagnoses.map((d) => d.code),
      procedureCodes: ['92004', '92015', '92250'],
      signedById: doctor.id,
      signedAt: routineExamDate,
      createdAt: routineExamDate,
    },
  });

  await prisma.prescription.upsert({
    where: { id: IDS.routine.spectacleRx },
    update: {},
    create: {
      id: IDS.routine.spectacleRx,
      practiceId: practice.id,
      patientId: IDS.routine.patient,
      encounterId: IDS.routine.encounter,
      prescriberId: doctor.id,
      type: PrescriptionType.SPECTACLE,
      status: PrescriptionStatus.FINALIZED,
      values: {
        od: { sphere: -1.75, cylinder: -0.5, axis: 175, add: 1.0 },
        os: { sphere: -2.0, cylinder: -0.25, axis: 5, add: 1.0 },
        pd: 63,
        pdNear: 60,
        remarks: 'Progressive lenses with anti-reflective coating recommended for computer work.',
      },
      issuedAt: routineExamDate,
      expiresAt: monthsFrom(routineExamDate, 24),
      finalizedAt: routineExamDate,
      createdAt: routineExamDate,
    },
  });

  await prisma.prescription.upsert({
    where: { id: IDS.routine.contactLensRx },
    update: {},
    create: {
      id: IDS.routine.contactLensRx,
      practiceId: practice.id,
      patientId: IDS.routine.patient,
      encounterId: IDS.routine.encounter,
      prescriberId: doctor.id,
      type: PrescriptionType.CONTACT_LENS,
      status: PrescriptionStatus.FINALIZED,
      values: {
        od: {
          brand: 'Acuvue Oasys 1-Day',
          material: 'Senofilcon A',
          baseCurve: 8.5,
          diameter: 14.3,
          sphere: -1.75,
        },
        os: {
          brand: 'Acuvue Oasys 1-Day',
          material: 'Senofilcon A',
          baseCurve: 8.5,
          diameter: 14.3,
          sphere: -2.0,
        },
        wearSchedule: 'Daily wear, part-time',
        replacementSchedule: 'Daily disposable',
        remarks: 'Do not sleep in lenses. Reading glasses may be needed over contacts.',
      },
      issuedAt: routineExamDate,
      expiresAt: monthsFrom(routineExamDate, 12),
      finalizedAt: routineExamDate,
      createdAt: routineExamDate,
    },
  });

  // ----- Case 2: complex diabetic / glaucoma patient -----

  await prisma.patient.upsert({
    where: { id: IDS.complex.patient },
    update: {},
    create: {
      id: IDS.complex.patient,
      practiceId: practice.id,
      mrn: 'P000102',
      firstName: 'Marcus',
      lastName: 'Delgado',
      dateOfBirth: new Date('1965-06-05'),
      sex: Sex.MALE,
      phone: '(555) 010-7788',
      email: 'marcus.delgado@example.dev',
      address: '89 Oakridge Court, Apt 3B',
      city: 'Springfield',
      state: 'IL',
      zip: '62711',
      preferredContact: 'phone',
      alerts: 'Sulfa and neomycin allergy. Requires wheelchair access. Interpreter (Spanish) preferred.',
      tags: [PatientTag.SPECIALTY_CL, PatientTag.DRY_EYE],
      consentSignedAt: daysAgo(4),
    },
  });

  await prisma.insurancePolicy.upsert({
    where: { id: IDS.complex.insurance },
    update: {},
    create: {
      id: IDS.complex.insurance,
      patientId: IDS.complex.patient,
      payerName: 'Medicare',
      planName: 'Medicare Part B',
      memberId: '1EG4-TE5-MK73',
      isVision: false,
      priority: 1,
    },
  });

  await prisma.encounter.upsert({
    where: { id: IDS.complex.encounter },
    update: {},
    create: {
      id: IDS.complex.encounter,
      practiceId: practice.id,
      patientId: IDS.complex.patient,
      templateId: template.id,
      status: EncounterStatus.SIGNED,
      chiefComplaint: 'Worsening blur, glare, and intermittent double vision at near',
      clinicalData: COMPLEX_CLINICAL_DATA,
      assessment: COMPLEX_CLINICAL_DATA.plan.assessment,
      plan: COMPLEX_CLINICAL_DATA.plan.planNotes,
      diagnosisCodes: COMPLEX_CLINICAL_DATA.plan.diagnoses.map((d) => d.code),
      procedureCodes: ['92014', '92083', '92134', '92250', '76514'],
      signedById: doctor.id,
      signedAt: complexExamDate,
      createdAt: complexExamDate,
    },
  });

  await prisma.prescription.upsert({
    where: { id: IDS.complex.spectacleRx },
    update: {},
    create: {
      id: IDS.complex.spectacleRx,
      practiceId: practice.id,
      patientId: IDS.complex.patient,
      encounterId: IDS.complex.encounter,
      prescriberId: doctor.id,
      type: PrescriptionType.SPECTACLE,
      status: PrescriptionStatus.FINALIZED,
      values: {
        od: { sphere: -6.75, cylinder: -3.25, axis: 15, add: 2.5, prism: 2, base: 'BU' },
        os: { sphere: -7.25, cylinder: -2.75, axis: 165, add: 2.5 },
        pd: 66,
        pdNear: 63,
        remarks:
          'High-index 1.74 lenses with anti-reflective coating. 2 prism diopters base up OD ground into the near portion for vertical imbalance. Rx may change after cataract surgery — dispense a single pair only.',
      },
      issuedAt: complexExamDate,
      expiresAt: monthsFrom(complexExamDate, 12),
      finalizedAt: complexExamDate,
      createdAt: complexExamDate,
    },
  });

  await prisma.prescription.upsert({
    where: { id: IDS.complex.contactLensRx },
    update: {},
    create: {
      id: IDS.complex.contactLensRx,
      practiceId: practice.id,
      patientId: IDS.complex.patient,
      encounterId: IDS.complex.encounter,
      prescriberId: doctor.id,
      type: PrescriptionType.CONTACT_LENS,
      status: PrescriptionStatus.FINALIZED,
      values: {
        od: {
          brand: 'Biofinity Toric',
          material: 'Comfilcon A',
          baseCurve: 8.7,
          diameter: 14.5,
          sphere: -6.5,
          cylinder: -2.75,
          axis: 20,
        },
        os: {
          brand: 'Biofinity Toric',
          material: 'Comfilcon A',
          baseCurve: 8.7,
          diameter: 14.5,
          sphere: -7.0,
          cylinder: -2.25,
          axis: 160,
        },
        wearSchedule: 'Daily wear, no overnight wear',
        replacementSchedule: 'Monthly',
        remarks:
          'Monovision not tolerated; reading glasses to be worn over contacts. Discontinue lens wear and call the office immediately if the eye becomes red or painful.',
      },
      issuedAt: complexExamDate,
      expiresAt: monthsFrom(complexExamDate, 12),
      finalizedAt: complexExamDate,
      createdAt: complexExamDate,
    },
  });

  console.log('Demo seed complete.');
  console.log('  Routine case  — Whitfield, Nora (P000101): spectacle + contact lens Rx');
  console.log('  Complex case  — Delgado, Marcus (P000102): spectacle with prism + toric contact lens Rx');
  console.log('Open a patient chart and use the Print link on any FINALIZED prescription.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
