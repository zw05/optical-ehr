/** Hardcoded clinical data for the /design preview — no API calls. */

export interface MockPatient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string | null;
  email: string | null;
  alerts: string | null;
  tags: string[];
  viewedAt?: number;
}

export interface MockAppointment {
  id: string;
  startsAt: string;
  status: string;
  patient: { id: string; firstName: string; lastName: string; mrn: string };
  provider: { firstName: string; lastName: string };
  type: { name: string };
}

export interface MockOrder {
  id: string;
  status: string;
  kind: string;
  patient: { firstName: string; lastName: string };
}

export interface MockRecall {
  id: string;
  reason: string;
  dueDate: string;
  patient: { firstName: string; lastName: string; phone: string | null };
}

export interface MockExamPatient {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone: string | null;
  email: string | null;
  alerts: string | null;
  insurance: string;
}

export const MOCK_USER = {
  firstName: 'Sara',
  lastName: 'Nguyen',
  role: 'DOCTOR',
  initials: 'SN',
};

export const MOCK_PATIENTS: MockPatient[] = [
  {
    id: 'p1',
    mrn: 'MRN-10482',
    firstName: 'Elena',
    lastName: 'Martinez',
    dateOfBirth: '1987-03-14',
    phone: '(555) 014-2291',
    email: 'elena.m@example.com',
    alerts: null,
    tags: ['Glasses'],
    viewedAt: Date.now() - 12 * 60_000,
  },
  {
    id: 'p2',
    mrn: 'MRN-09831',
    firstName: 'James',
    lastName: 'Okonkwo',
    dateOfBirth: '1952-11-02',
    phone: '(555) 882-4410',
    email: null,
    alerts: 'Sulfa allergy',
    tags: ['Contact lens', 'Senior'],
    viewedAt: Date.now() - 3 * 3600_000,
  },
  {
    id: 'p3',
    mrn: 'MRN-11207',
    firstName: 'Aisha',
    lastName: 'Patel',
    dateOfBirth: '1999-07-22',
    phone: '(555) 301-7782',
    email: 'aisha.p@example.com',
    alerts: null,
    tags: ['Contact lens'],
    viewedAt: Date.now() - 26 * 3600_000,
  },
  {
    id: 'p4',
    mrn: 'MRN-08744',
    firstName: 'Robert',
    lastName: 'Chen',
    dateOfBirth: '1964-01-09',
    phone: '(555) 640-1193',
    email: 'rchen@example.com',
    alerts: null,
    tags: ['Glasses'],
    viewedAt: Date.now() - 48 * 3600_000,
  },
];

function todayAt(hours: number, minutes: number): string {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export const MOCK_APPOINTMENTS: MockAppointment[] = [
  {
    id: 'a1',
    startsAt: todayAt(9, 0),
    status: 'CHECKED_IN',
    patient: { id: 'p1', firstName: 'Elena', lastName: 'Martinez', mrn: 'MRN-10482' },
    provider: { firstName: 'Sara', lastName: 'Nguyen' },
    type: { name: 'Comprehensive' },
  },
  {
    id: 'a2',
    startsAt: todayAt(10, 30),
    status: 'SCHEDULED',
    patient: { id: 'p2', firstName: 'James', lastName: 'Okonkwo', mrn: 'MRN-09831' },
    provider: { firstName: 'Sara', lastName: 'Nguyen' },
    type: { name: 'Contact lens fit' },
  },
  {
    id: 'a3',
    startsAt: todayAt(13, 15),
    status: 'SCHEDULED',
    patient: { id: 'p3', firstName: 'Aisha', lastName: 'Patel', mrn: 'MRN-11207' },
    provider: { firstName: 'Marcus', lastName: 'Lee' },
    type: { name: 'Follow-up' },
  },
  {
    id: 'a4',
    startsAt: todayAt(15, 0),
    status: 'SCHEDULED',
    patient: { id: 'p4', firstName: 'Robert', lastName: 'Chen', mrn: 'MRN-08744' },
    provider: { firstName: 'Sara', lastName: 'Nguyen' },
    type: { name: 'Comprehensive' },
  },
];

export const MOCK_ORDERS: MockOrder[] = [
  {
    id: 'o1',
    status: 'RECEIVED',
    kind: 'SPECTACLE',
    patient: { firstName: 'Elena', lastName: 'Martinez' },
  },
  {
    id: 'o2',
    status: 'RECEIVED',
    kind: 'CONTACT_LENS',
    patient: { firstName: 'James', lastName: 'Okonkwo' },
  },
];

export const MOCK_RECALLS: MockRecall[] = [
  {
    id: 'r1',
    reason: 'Annual comprehensive',
    dueDate: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    patient: { firstName: 'Robert', lastName: 'Chen', phone: '(555) 640-1193' },
  },
  {
    id: 'r2',
    reason: 'CL refill check',
    dueDate: new Date(Date.now() + 12 * 86_400_000).toISOString(),
    patient: { firstName: 'Aisha', lastName: 'Patel', phone: '(555) 301-7782' },
  },
  {
    id: 'r3',
    reason: 'IOP follow-up',
    dueDate: new Date(Date.now() + 18 * 86_400_000).toISOString(),
    patient: { firstName: 'James', lastName: 'Okonkwo', phone: '(555) 882-4410' },
  },
];

export const MOCK_EXAM_PATIENT: MockExamPatient = {
  id: 'p1',
  mrn: 'MRN-10482',
  firstName: 'Elena',
  lastName: 'Martinez',
  dateOfBirth: '1987-03-14',
  phone: '(555) 014-2291',
  email: 'elena.m@example.com',
  alerts: null,
  insurance: 'VSP — Primary',
};

export const MOCK_REFRACTION = {
  od: { sphere: '-2.25', cylinder: '-0.75', axis: '090', add: '+1.50', va: '20/20' },
  os: { sphere: '-2.00', cylinder: '-0.50', axis: '085', add: '+1.50', va: '20/20' },
};

export const MOCK_SLIT_LAMP = [
  { key: 'lidsLashes', label: 'Lids & lashes', status: 'Normal', grade: '', notes: '' },
  { key: 'conjunctiva', label: 'Conjunctiva', status: 'Abnormal', grade: '1+', notes: 'Mild injection OD' },
  { key: 'cornea', label: 'Cornea', status: 'Normal', grade: '', notes: '' },
  { key: 'ac', label: 'Anterior chamber', status: 'Normal', grade: '', notes: 'Deep & quiet' },
  { key: 'iris', label: 'Iris', status: 'Normal', grade: '', notes: '' },
  { key: 'lens', label: 'Lens', status: 'Abnormal', grade: 'NS 1+', notes: 'Early nuclear sclerosis OU' },
];

export const EXAM_TAB_KEYS = [
  'HPI',
  'History',
  'Entrance',
  'Refraction',
  'Anterior',
  'Posterior',
  'A&P',
] as const;
