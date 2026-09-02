'use client';

/** Shared book / walk-in form used by Schedule and Dashboard. */
import { FormEvent, useEffect, useState } from 'react';
import PatientSearchBox, { type PatientSuggestion } from '@/components/PatientSearchBox';
import { api } from '@/lib/api';

interface AppointmentType {
  id: string;
  name: string;
  durationMin: number;
}

interface ClinicalUser {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface CreatedPatient {
  id: string;
}

const emptyNewPatient = { firstName: '', lastName: '', dateOfBirth: '', phone: '' };

export interface BookAppointmentFormProps {
  /** YYYY-MM-DD used for timed bookings. */
  defaultDate: string;
  defaultWalkIn?: boolean;
  /** When true, walk-in checkbox is fixed on. */
  lockWalkIn?: boolean;
  onSuccess: () => void | Promise<void>;
  onCancel?: () => void;
  /** Extra class on the form wrapper (e.g. card). */
  className?: string;
  title?: string;
}

export default function BookAppointmentForm({
  defaultDate,
  defaultWalkIn = false,
  lockWalkIn = false,
  onSuccess,
  onCancel,
  className = 'card',
  title = 'Book appointment',
}: BookAppointmentFormProps) {
  const [types, setTypes] = useState<AppointmentType[]>([]);
  const [providers, setProviders] = useState<ClinicalUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientSuggestion | null>(null);
  const [newPatientMode, setNewPatientMode] = useState(false);
  const [newPatient, setNewPatient] = useState(emptyNewPatient);
  const [walkIn, setWalkIn] = useState(defaultWalkIn || lockWalkIn);
  const [providerId, setProviderId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [time, setTime] = useState('09:00');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    setWalkIn(defaultWalkIn || lockWalkIn);
  }, [defaultWalkIn, lockWalkIn]);

  useEffect(() => {
    api<AppointmentType[]>('/appointments/types')
      .then((rows) => {
        setTypes(rows);
        setTypeId((current) => current || rows[0]?.id || '');
      })
      .catch(() => setTypes([]));
    api<ClinicalUser[]>('/users?clinical=true')
      .then((rows) => {
        const doctors = rows.filter((u) => u.role === 'DOCTOR');
        const list = doctors.length > 0 ? doctors : rows;
        setProviders(list);
        setProviderId((current) => current || list[0]?.id || '');
      })
      .catch(() => setProviders([]));
  }, []);

  async function bookAppointment(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      let patientId = selectedPatient?.id;

      if (newPatientMode) {
        if (!newPatient.firstName.trim() || !newPatient.lastName.trim()) {
          throw new Error('New patient requires first name and last name');
        }
        const created = await api<CreatedPatient>('/patients', {
          method: 'POST',
          body: {
            firstName: newPatient.firstName.trim(),
            lastName: newPatient.lastName.trim(),
            dateOfBirth: newPatient.dateOfBirth || undefined,
            phone: newPatient.phone.trim() || undefined,
          },
        });
        patientId = created.id;
      }

      if (!patientId) throw new Error('Select a patient or create a new chart');
      if (!providerId) throw new Error('Select a provider');
      if (!typeId) throw new Error('Select an appointment type');
      if (!walkIn && !time) throw new Error('Select a start time');

      const body: Record<string, unknown> = {
        patientId,
        providerId,
        typeId,
        notes: notes.trim() || undefined,
      };

      if (walkIn) {
        body.walkIn = true;
      } else {
        body.startsAt = new Date(`${defaultDate}T${time}:00`).toISOString();
      }

      await api('/appointments', { method: 'POST', body });
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={className} onSubmit={(e) => void bookAppointment(e)}>
      <h2 id="book-dialog-title">{title}</h2>

      {error && <p className="error-text">{error}</p>}

      <div className="grid-3" style={{ marginBottom: '0.75rem' }}>
        <label className="inline-label" style={{ minWidth: 'auto', maxWidth: 'none' }}>
          <input
            type="checkbox"
            checked={walkIn}
            disabled={lockWalkIn}
            onChange={(e) => setWalkIn(e.target.checked)}
          />
          Walk-in / unscheduled
        </label>
        <label className="inline-label" style={{ minWidth: 'auto', maxWidth: 'none' }}>
          <input
            type="checkbox"
            checked={newPatientMode}
            onChange={(e) => {
              setNewPatientMode(e.target.checked);
              if (e.target.checked) {
                setSelectedPatient(null);
                setSearchQuery('');
              }
            }}
          />
          New patient
        </label>
      </div>

      {newPatientMode ? (
        <div className="grid-3">
          <div className="field">
            <label>First name</label>
            <input
              required
              value={newPatient.firstName}
              onChange={(e) => setNewPatient({ ...newPatient, firstName: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Last name</label>
            <input
              required
              value={newPatient.lastName}
              onChange={(e) => setNewPatient({ ...newPatient, lastName: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Date of birth (optional)</label>
            <input
              type="date"
              value={newPatient.dateOfBirth}
              onChange={(e) => setNewPatient({ ...newPatient, dateOfBirth: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Phone</label>
            <input
              value={newPatient.phone}
              onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <div className="field" style={{ marginBottom: '0.75rem' }}>
          <label>Patient</label>
          {selectedPatient ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span>
                {selectedPatient.lastName}, {selectedPatient.firstName}
                <span className="muted"> {selectedPatient.mrn}</span>
              </span>
              <button
                type="button"
                className="secondary"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                onClick={() => {
                  setSelectedPatient(null);
                  setSearchQuery('');
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <PatientSearchBox
              value={searchQuery}
              onChange={setSearchQuery}
              onSubmit={() => undefined}
              onSelect={(patient) => {
                setSelectedPatient(patient);
                setSearchQuery(`${patient.lastName}, ${patient.firstName}`);
              }}
            />
          )}
        </div>
      )}

      <div className="grid-3">
        <div className="field">
          <label>Provider</label>
          <select required value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            <option value="" disabled>
              Select provider
            </option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                Dr. {p.lastName}, {p.firstName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Type</label>
          <select required value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="" disabled>
              Select type
            </option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.durationMin} min)
              </option>
            ))}
          </select>
        </div>
        {!walkIn && (
          <div className="field">
            <label>Start time</label>
            <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label>Notes</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <p className="muted" style={{ marginTop: 0 }}>
        {walkIn
          ? 'Walk-ins go to the waiting room and do not occupy a calendar slot.'
          : 'Timed bookings are checked for provider double-booking.'}
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="submit" disabled={saving}>
          {saving ? 'Booking…' : walkIn ? 'Add walk-in' : 'Book'}
        </button>
        {onCancel && (
          <button type="button" className="secondary" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
