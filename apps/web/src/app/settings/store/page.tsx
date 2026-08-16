'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api, fileToBase64 } from '@/lib/api';

const DAYS = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
] as const;

type Hours = Record<string, { open: string; close: string } | null>;

interface Practice {
  id: string;
  name: string;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  npi: string | null;
  taxId: string | null;
  timezone: string | null;
  hours: Hours | null;
  logoUrl: string | null;
}

function defaultHours(): Hours {
  const hours: Hours = {};
  for (const d of DAYS) {
    hours[d.key] = d.key === 'sun' ? null : { open: '09:00', close: '17:00' };
  }
  return hours;
}

export default function StoreSettingsPage() {
  const [form, setForm] = useState<Practice | null>(null);
  const [hours, setHours] = useState<Hours>(defaultHours());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    api<Practice>('/practice')
      .then((p) => {
        setForm(p);
        setHours((p.hours as Hours) ?? defaultHours());
        if (p.logoUrl) {
          api<Blob>('/practice/logo')
            .then((blob) => setLogoPreview(URL.createObjectURL(blob)))
            .catch(() => undefined);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Load failed'));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setError(null);
    try {
      const updated = await api<Practice>('/practice', {
        method: 'PATCH',
        body: {
          name: form.name,
          phone: form.phone,
          fax: form.fax,
          email: form.email,
          website: form.website,
          address: form.address,
          npi: form.npi,
          taxId: form.taxId,
          timezone: form.timezone,
          hours,
        },
      });
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const dataBase64 = await fileToBase64(file);
      await api('/practice/logo', {
        method: 'POST',
        body: { fileName: file.name, contentType: file.type || 'image/png', dataBase64 },
      });
      setLogoPreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logo upload failed');
    }
  }

  if (!form) return <p className="muted">{error ?? 'Loading…'}</p>;

  return (
    <form className="card" onSubmit={save}>
      <h2>Store profile</h2>
      <div className="grid-2">
        <div className="field">
          <label>Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="field">
          <label>Timezone</label>
          <select
            value={form.timezone ?? 'America/New_York'}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          >
            <option value="America/New_York">Eastern</option>
            <option value="America/Chicago">Central</option>
            <option value="America/Denver">Mountain</option>
            <option value="America/Los_Angeles">Pacific</option>
            <option value="America/Phoenix">Arizona</option>
            <option value="Pacific/Honolulu">Hawaii</option>
          </select>
        </div>
        <div className="field">
          <label>Phone</label>
          <input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="field">
          <label>Fax</label>
          <input value={form.fax ?? ''} onChange={(e) => setForm({ ...form, fax: e.target.value })} />
        </div>
        <div className="field">
          <label>Email</label>
          <input value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label>Website</label>
          <input value={form.website ?? ''} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>Address</label>
          <input value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="field">
          <label>NPI</label>
          <input value={form.npi ?? ''} onChange={(e) => setForm({ ...form, npi: e.target.value })} />
        </div>
        <div className="field">
          <label>Tax ID</label>
          <input value={form.taxId ?? ''} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
        </div>
      </div>

      <div className="field" style={{ marginTop: '1rem' }}>
        <label>Logo</label>
        {logoPreview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoPreview} alt="Store logo" className="topbar-brand-logo" style={{ display: 'block', marginBottom: '0.5rem' }} />
        )}
        <input type="file" accept="image/png,image/jpeg" onChange={(e) => void onLogo(e.target.files?.[0])} />
      </div>

      <h3>Hours</h3>
      {DAYS.map((d) => {
        const slot = hours[d.key];
        return (
          <div key={d.key} className="settings-row" style={{ gridTemplateColumns: '8rem 1fr' }}>
            <span>{d.label}</span>
            <div className="settings-choices">
              <label>
                <input
                  type="checkbox"
                  checked={!slot}
                  onChange={(e) =>
                    setHours({
                      ...hours,
                      [d.key]: e.target.checked ? null : { open: '09:00', close: '17:00' },
                    })
                  }
                />{' '}
                Closed
              </label>
              {slot && (
                <>
                  <input
                    type="time"
                    value={slot.open}
                    onChange={(e) => setHours({ ...hours, [d.key]: { ...slot, open: e.target.value } })}
                  />
                  <input
                    type="time"
                    value={slot.close}
                    onChange={(e) => setHours({ ...hours, [d.key]: { ...slot, close: e.target.value } })}
                  />
                </>
              )}
            </div>
          </div>
        );
      })}

      {error && <p className="error-text">{error}</p>}
      <button type="submit">{saved ? 'Saved' : 'Save store'}</button>
    </form>
  );
}
