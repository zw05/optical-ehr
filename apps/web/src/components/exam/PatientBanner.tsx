'use client';

interface InsuranceInfo {
  payerName: string;
  isVision: boolean;
  priority: number;
}

interface PatientBannerProps {
  patient: {
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    phone: string | null;
    email: string | null;
    insurances?: InsuranceInfo[];
  };
  chiefComplaint: string;
  examProviderId: string;
  examDate: string;
  recallDate: string;
  providers: { id: string; firstName: string; lastName: string }[];
  readOnly?: boolean;
  onChiefComplaintChange: (value: string) => void;
  onProviderChange: (value: string) => void;
  onExamDateChange: (value: string) => void;
  onRecallDateChange: (value: string) => void;
}

function ageFromDob(dob: string | null): string {
  if (!dob) return '—';
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return '—';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return String(age);
}

function formatDob(dob: string | null): string {
  if (!dob) return '—';
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return dob;
  return d.toLocaleDateString();
}

export function PatientBanner({
  patient,
  chiefComplaint,
  examProviderId,
  examDate,
  recallDate,
  providers,
  readOnly,
  onChiefComplaintChange,
  onProviderChange,
  onExamDateChange,
  onRecallDateChange,
}: PatientBannerProps) {
  const initials = `${patient.firstName.charAt(0)}${patient.lastName.charAt(0)}`.toUpperCase();
  const vision = (patient.insurances ?? [])
    .filter((i) => i.isVision)
    .sort((a, b) => a.priority - b.priority)
    .map((i) => i.payerName)
    .join(' | ');
  const medical = (patient.insurances ?? [])
    .filter((i) => !i.isVision)
    .sort((a, b) => a.priority - b.priority)
    .map((i) => i.payerName)
    .join(' | ');

  return (
    <section className="exam-banner card">
      <div className="exam-banner-patient">
        <div className="exam-avatar" aria-hidden>
          {initials}
        </div>
        <div>
          <strong>
            {patient.lastName}, {patient.firstName}
          </strong>
          <div className="muted">
            DOB {formatDob(patient.dateOfBirth)} | {ageFromDob(patient.dateOfBirth)}
          </div>
          <div className="muted">Phone: {patient.phone || '—'}</div>
          <div className="muted">Email: {patient.email || '—'}</div>
          <div className="muted">Vision Insurance: {vision || '—'}</div>
          <div className="muted">Medical Insurance: {medical || '—'}</div>
        </div>
      </div>

      <div className="exam-banner-fields">
        <div className="field">
          <label>Chief Complaint</label>
          <textarea
            rows={3}
            disabled={readOnly}
            value={chiefComplaint}
            onChange={(e) => onChiefComplaintChange(e.target.value)}
          />
        </div>
        <div className="exam-banner-meta">
          <div className="field">
            <label>Exam Provider</label>
            <select
              disabled={readOnly}
              value={examProviderId}
              onChange={(e) => onProviderChange(e.target.value)}
            >
              <option value="">Select provider</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Exam Date</label>
            <input
              type="datetime-local"
              disabled={readOnly}
              value={examDate}
              onChange={(e) => onExamDateChange(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Recall Date</label>
            <input
              type="date"
              disabled={readOnly}
              value={recallDate}
              onChange={(e) => onRecallDateChange(e.target.value)}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
