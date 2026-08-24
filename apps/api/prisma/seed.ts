/**
 * Development seed: one practice, one user per role, default exam and report
 * templates, appointment types, and a demo patient. Synthetic data only.
 */
import {
  OrthoKMilestone,
  OrthoKStatus,
  PatientTag,
  Practice,
  PrismaClient,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  addDays,
  MILESTONE_LABELS,
  startOfDay,
  MILESTONE_SCHEDULE,
  milestoneStates,
  type ScheduledMilestone,
} from '../src/ortho-k/milestones';

const prisma = new PrismaClient();

const DEFAULT_EXAM_SECTIONS = [
  { key: 'hpi', title: 'HPI', enabled: true, requiredFields: ['complaints'] },
  { key: 'socialHistory', title: 'Social History', enabled: true },
  { key: 'medicalHistory', title: 'Medical History', enabled: true },
  { key: 'ros', title: 'ROS', enabled: true },
  { key: 'prelimBinocular', title: 'Preliminary/Binocular', enabled: true, requiredFields: ['cvaOdDistance', 'cvaOsDistance'] },
  { key: 'refractionCl', title: 'Refraction/Contact Lens', enabled: true },
  { key: 'externalInternal', title: 'External/Internal', enabled: true, requiredFields: ['iopOd', 'iopOs', 'iopMethod'] },
  { key: 'additionalTests', title: 'Additional Tests', enabled: true },
  { key: 'plan', title: 'Procedure Impression/Plan', enabled: true, requiredFields: ['assessment'] },
];

async function main() {
  const practice = await prisma.practice.upsert({
    where: { id: 'seed-practice' },
    update: {},
    create: {
      id: 'seed-practice',
      name: 'EHR',
      phone: '(555) 010-2020',
      address: '100 Main Street, Springfield, US',
    },
  });

  const passwordHash = await bcrypt.hash('test12340', 10);
  const users: Array<{ email: string; role: Role; firstName: string; lastName: string; licenseNumber?: string; npi?: string }> = [
    { email: 'doctor@dev.local', role: Role.DOCTOR, firstName: 'Dana', lastName: 'Reyes', licenseNumber: 'OD-12345', npi: '1234567890' },
    { email: 'tech@dev.local', role: Role.TECHNICIAN, firstName: 'Taylor', lastName: 'Kim' },
    { email: 'optician@dev.local', role: Role.OPTICIAN, firstName: 'Omar', lastName: 'Lopez' },
    { email: 'frontdesk@dev.local', role: Role.RECEPTIONIST, firstName: 'Riley', lastName: 'Chen' },
    { email: 'admin@dev.local', role: Role.ADMIN, firstName: 'Avery', lastName: 'Singh' },
  ];
  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash },
      create: { ...user, practiceId: practice.id, passwordHash },
    });
  }

  const existingTemplate = await prisma.examTemplate.findFirst({
    where: { practiceId: practice.id, name: 'Comprehensive Exam', isActive: true },
    orderBy: { version: 'desc' },
  });
  if (!existingTemplate) {
    await prisma.examTemplate.create({
      data: { practiceId: practice.id, name: 'Comprehensive Exam', sections: DEFAULT_EXAM_SECTIONS },
    });
  } else {
    // Refresh section layout for the tabbed exam form on re-seed.
    await prisma.examTemplate.update({
      where: { id: existingTemplate.id },
      data: { sections: DEFAULT_EXAM_SECTIONS },
    });
  }

  for (const [name, kind] of [
    ['Spectacle Rx', 'spectacle-rx'],
    ['Contact Lens Rx', 'contact-lens-rx'],
    ['Exam Summary', 'exam-summary'],
    ['Order Summary', 'order-summary'],
  ] as const) {
    const existing = await prisma.reportTemplate.findFirst({
      where: { practiceId: practice.id, kind },
      orderBy: { version: 'desc' },
    });
    if (!existing) {
      await prisma.reportTemplate.create({
        data: {
          practiceId: practice.id,
          name,
          kind,
          isDefault: kind !== 'exam-summary',
          layout: {
            footerText: 'Optical EHR — confidential health record',
            signatureLine: true,
            paperSize: 'LETTER',
            margin: 54,
            baseFontSize: 10,
            fontFamily: 'Helvetica',
            valueLayout: 'table',
            showLogo: false,
            showExpiration: true,
            showPrescriberCredentials: true,
          },
        },
      });
    } else if (kind !== 'exam-summary' && !existing.isDefault) {
      // Ensure Rx templates are marked default on re-seed when none is yet.
      const anyDefault = await prisma.reportTemplate.findFirst({
        where: { practiceId: practice.id, kind, isDefault: true, isActive: true },
      });
      if (!anyDefault) {
        await prisma.reportTemplate.update({
          where: { id: existing.id },
          data: { isDefault: true },
        });
      }
    }
  }

  for (const [name, durationMin] of [
    ['Comprehensive Exam', 40],
    ['Contact Lens Fitting', 30],
    ['Follow-up', 15],
  ] as const) {
    const existing = await prisma.appointmentType.findFirst({
      where: { practiceId: practice.id, name },
    });
    if (!existing) {
      await prisma.appointmentType.create({ data: { practiceId: practice.id, name, durationMin } });
    }
  }

  // Vision plans, then the Medicare Advantage carriers the practice bills
  // through. Straight Medicare is deliberately absent — it is not accepted.
  for (const [name, isVision] of [
    ['EyeMed', true],
    ['Spectera', true],
    ['Davis Vision', true],
    ['Healthfirst', false],
    ['UnitedHealthcare', false],
    ['Fidelis Care', false],
  ] as const) {
    await prisma.acceptedPayer.upsert({
      where: { practiceId_name: { practiceId: practice.id, name } },
      update: {},
      create: { practiceId: practice.id, name, isVision },
    });
  }

  const existingPatient = await prisma.patient.findFirst({
    where: { practiceId: practice.id, mrn: 'P000001' },
  });
  if (!existingPatient) {
    await prisma.patient.create({
      data: {
        practiceId: practice.id,
        mrn: 'P000001',
        firstName: 'Pat',
        lastName: 'Example',
        dateOfBirth: new Date('1985-04-12'),
        phone: '(555) 010-9999',
        email: 'pat@example.dev',
      },
    });
  }

  await seedOrthoK(practice);

  console.log('Seed complete. Dev logins use password: test12340');
}

/**
 * Ortho-K program patients, chosen to put every board state on screen at once:
 * a fitting that has not started, a patient on schedule, one who has slipped
 * past a check, and one through the sequence and onto annual review.
 *
 * Start dates are relative to the seed run, so the board looks the same however
 * long after the seed it is opened. Recalls are derived with the same helper the
 * service uses, so seeded data and live data agree.
 */
async function seedOrthoK(practice: Practice) {
  const enrollments: {
    mrn: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    phone: string;
    startedDaysAgo: number | null;
    logged: ScheduledMilestone[];
    interimDaysIn?: number;
    /** Recurring checks and lens renewals, which repeat and so are listed explicitly. */
    extraVisits?: { milestone: OrthoKMilestone; daysIn: number }[];
    status: OrthoKStatus;
    lensBrand: string;
    lensDesign: string;
    lensParams: string;
    notes?: string;
  }[] = [
    {
      // Lenses on order: no start date, so nothing is scheduled yet.
      mrn: 'P000201',
      firstName: 'Mina',
      lastName: 'Okafor',
      dateOfBirth: '2013-09-22',
      phone: '(555) 010-2201',
      startedDaysAgo: null,
      logged: [],
      status: OrthoKStatus.FITTING,
      lensBrand: 'Paragon',
      lensDesign: 'CRT Dual Axis',
      lensParams: 'OD 8.6 / -2.75 / 33.0   OS 8.7 / -2.50 / 33.0',
      notes: 'Lenses ordered; dispense visit booked.',
    },
    {
      // On schedule six weeks in, with an unscheduled check in between.
      mrn: 'P000202',
      firstName: 'Ellis',
      lastName: 'Navarro',
      dateOfBirth: '2011-02-14',
      phone: '(555) 010-2202',
      startedDaysAgo: 42,
      logged: [
        OrthoKMilestone.DAY_1,
        OrthoKMilestone.DAY_2,
        OrthoKMilestone.WEEK_1,
        OrthoKMilestone.MONTH_1,
      ],
      interimDaysIn: 12,
      status: OrthoKStatus.ACTIVE,
      lensBrand: 'Euclid',
      lensDesign: 'Emerald',
      lensParams: 'OD 8.8 / -3.25 / 10.6   OS 8.8 / -3.00 / 10.6',
      notes: 'Interim visit at two weeks for lens handling.',
    },
    {
      // Missed the one-week check: the board should show this one in red.
      mrn: 'P000203',
      firstName: 'Rosa',
      lastName: 'Delgado',
      dateOfBirth: '2014-11-30',
      phone: '(555) 010-2203',
      startedDaysAgo: 24,
      logged: [OrthoKMilestone.DAY_1, OrthoKMilestone.DAY_2],
      status: OrthoKStatus.ACTIVE,
      lensBrand: 'Paragon',
      lensDesign: 'CRT',
      lensParams: 'OD 8.9 / -1.75 / 33.0   OS 8.9 / -1.75 / 33.0',
      notes: 'Parent rescheduled twice; phone is the best contact.',
    },
    {
      // Through the sequence and onto annual review.
      mrn: 'P000204',
      firstName: 'Jonah',
      lastName: 'Whitfield',
      dateOfBirth: '2009-07-08',
      phone: '(555) 010-2204',
      startedDaysAgo: 1180,
      logged: [
        OrthoKMilestone.DAY_1,
        OrthoKMilestone.DAY_2,
        OrthoKMilestone.WEEK_1,
        OrthoKMilestone.MONTH_1,
        OrthoKMilestone.MONTH_3,
        OrthoKMilestone.MONTH_6,
      ],
      // Three years in: a lens renewal each year, with the six-month checks between.
      extraVisits: [
        { milestone: OrthoKMilestone.SEMIANNUAL, daysIn: 360 },
        { milestone: OrthoKMilestone.NEW_LENSES, daysIn: 370 },
        { milestone: OrthoKMilestone.SEMIANNUAL, daysIn: 550 },
        { milestone: OrthoKMilestone.SEMIANNUAL, daysIn: 730 },
        { milestone: OrthoKMilestone.NEW_LENSES, daysIn: 740 },
        { milestone: OrthoKMilestone.SEMIANNUAL, daysIn: 920 },
        { milestone: OrthoKMilestone.SEMIANNUAL, daysIn: 1100 },
      ],
      status: OrthoKStatus.MAINTENANCE,
      lensBrand: 'Euclid',
      lensDesign: 'Emerald',
      lensParams: 'OD 8.7 / -4.00 / 10.6   OS 8.6 / -4.25 / 10.6',
    },
  ];

  // Local midnight, so every seeded date is a clean calendar day. Carrying the
  // seed run's time of day would let a visit land on the previous day once
  // stored as UTC, and this whole board is driven by calendar dates.
  const today = startOfDay(new Date());

  for (const [index, row] of enrollments.entries()) {
    const existing = await prisma.patient.findFirst({
      where: { practiceId: practice.id, mrn: row.mrn },
      select: { id: true },
    });
    if (existing) continue; // re-seeding must not duplicate the program board

    const patient = await prisma.patient.create({
      data: {
        practiceId: practice.id,
        mrn: row.mrn,
        firstName: row.firstName,
        lastName: row.lastName,
        dateOfBirth: new Date(row.dateOfBirth),
        phone: row.phone,
        preferredContact: 'phone',
        tags: [PatientTag.ORTHO_K],
      },
    });

    const startDate = row.startedDaysAgo === null ? null : addDays(today, -row.startedDaysAgo);

    const visits = startDate
      ? [
          ...row.logged.map((milestone) => ({
            milestone,
            // Seen on the day the check fell due.
            visitDate: addDays(startDate, MILESTONE_SCHEDULE[milestone].offsetDays),
          })),
          ...(row.interimDaysIn !== undefined
            ? [
                {
                  milestone: OrthoKMilestone.INTERIM,
                  visitDate: addDays(startDate, row.interimDaysIn),
                },
              ]
            : []),
          ...(row.extraVisits ?? []).map((v) => ({
            milestone: v.milestone,
            visitDate: addDays(startDate, v.daysIn),
          })),
        ]
      : [];

    await prisma.orthoKEnrollment.create({
      data: {
        practiceId: practice.id,
        patientId: patient.id,
        caseNumber: index + 1,
        status: row.status,
        startDate,
        eyes: 'OU',
        lensBrand: row.lensBrand,
        lensDesign: row.lensDesign,
        lensParams: row.lensParams,
        notes: row.notes,
        visits: { create: visits },
      },
    });

    // Same derivation the service uses, so the recall queue matches the board.
    const outstanding = milestoneStates(startDate, visits).filter((m) => m.state !== 'DONE');
    if (outstanding.length > 0) {
      await prisma.recall.createMany({
        data: outstanding.map((m) => ({
          practiceId: practice.id,
          patientId: patient.id,
          reason: `Ortho-K — ${MILESTONE_LABELS[m.milestone]} follow-up`,
          dueDate: m.dueDate,
        })),
      });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
