/**
 * Development seed: one practice, one user per role, default exam and report
 * templates, appointment types, and a demo patient. Synthetic data only.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

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

  for (const [name, isVision] of [
    ['VSP', true],
    ['EyeMed', true],
    ['Spectera', true],
    ['Medicare', false],
    ['Davis Vision', true],
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

  console.log('Seed complete. Dev logins use password: test12340');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
