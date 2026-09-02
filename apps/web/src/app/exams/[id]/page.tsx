'use client';

/** Tabbed patient exam form with structured clinical inputs. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { AttachedDocs } from '@/components/exam/AttachedDocs';
import { FieldRenderer, markAllRosNegative } from '@/components/exam/FieldRenderer';
import { IntakeHistoryPanel } from '@/components/exam/IntakeHistoryPanel';
import { PatientBanner } from '@/components/exam/PatientBanner';
import { TabStrip } from '@/components/TabStrip';
import { usePreferences } from '@/components/PreferencesProvider';
import { api, getSessionUser } from '@/lib/api';
import {
  EXAM_TABS,
  normalPatchForSection,
  normalPatchForTab,
  sectionHasNormals,
  tabsWithNormals,
} from './examDefinition';

interface TemplateSection {
  key: string;
  title: string;
  enabled: boolean;
  requiredFields?: string[];
}

interface ProviderOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface EncounterDetail {
  id: string;
  status: 'IN_PROGRESS' | 'SIGNED' | 'VOIDED';
  chiefComplaint: string | null;
  clinicalData: Record<string, Record<string, unknown>>;
  assessment: string | null;
  plan: string | null;
  diagnosisCodes: string[];
  signedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  template: { name: string; version: number; sections: TemplateSection[] };
  patient: {
    id: string;
    mrn: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    phone: string | null;
    email: string | null;
    alerts: string | null;
    insurances?: { payerName: string; isVision: boolean; priority: number }[];
  };
  signedBy: { firstName: string; lastName: string; licenseNumber: string | null } | null;
  voidedBy: { firstName: string; lastName: string } | null;
  addenda: { id: string; text: string; createdAt: string; author: { firstName: string; lastName: string } }[];
}

interface ExamMeta {
  providerId?: string;
  examDate?: string;
  recallDate?: string;
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function recallFromReturn(code: string, fromDate: string): string {
  const base = fromDate ? new Date(fromDate) : new Date();
  if (Number.isNaN(base.getTime())) return '';
  const next = new Date(base);
  switch (code) {
    case '2w':
      next.setDate(next.getDate() + 14);
      break;
    case '1m':
      next.setMonth(next.getMonth() + 1);
      break;
    case '3m':
      next.setMonth(next.getMonth() + 3);
      break;
    case '6m':
      next.setMonth(next.getMonth() + 6);
      break;
    case '12m':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function diagnosesToCodes(diagnoses: unknown): string[] {
  if (!Array.isArray(diagnoses)) return [];
  return diagnoses
    .map((d) => (typeof d === 'object' && d && 'code' in d ? String((d as { code: string }).code).trim() : ''))
    .filter(Boolean);
}

export default function ExamPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = typeof window !== 'undefined' ? getSessionUser() : null;
  const canSign = user?.role === 'DOCTOR';
  const { prefs, announce } = usePreferences();
  const examPrefs = prefs.exam;
  const defaultTabApplied = useRef(false);

  const [encounter, setEncounter] = useState<EncounterDetail | null>(null);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [activeTab, setActiveTab] = useState(examPrefs.defaultTab || EXAM_TABS[0].key);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [toast, setToast] = useState<string | null>(null);
  const [addendumText, setAddendumText] = useState('');

  const load = useCallback(async () => {
    try {
      const [enc, providerList] = await Promise.all([
        api<EncounterDetail>(`/encounters/${params.id}`),
        api<ProviderOption[]>('/users?clinical=true').catch(() => [] as ProviderOption[]),
      ]);
      setEncounter(enc);
      setProviders(providerList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exam');
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (defaultTabApplied.current) return;
    if (examPrefs.defaultTab) {
      setActiveTab(examPrefs.defaultTab);
      defaultTabApplied.current = true;
    }
  }, [examPrefs.defaultTab]);

  const clinicalData = encounter?.clinicalData ?? {};

  const requiredTabKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const section of encounter?.template.sections ?? []) {
      if (section.enabled && (section.requiredFields?.length ?? 0) > 0) {
        keys.add(section.key);
      }
    }
    return keys;
  }, [encounter?.template.sections]);

  const visibleTabs = useMemo(() => {
    const hidden = new Set(examPrefs.hiddenTabs.filter((k) => !requiredTabKeys.has(k)));
    const order =
      examPrefs.tabOrder.length > 0 ? examPrefs.tabOrder : EXAM_TABS.map((t) => t.key);
    const byKey = new Map(EXAM_TABS.map((t) => [t.key, t]));
    const result: typeof EXAM_TABS = [];
    const seen = new Set<string>();
    for (const key of order) {
      const tab = byKey.get(key);
      if (!tab || hidden.has(key) || seen.has(key)) continue;
      seen.add(key);
      result.push(tab);
    }
    for (const tab of EXAM_TABS) {
      if (!seen.has(tab.key) && !hidden.has(tab.key)) result.push(tab);
    }
    // Superseded tabs only appear on encounters that actually recorded them, so
    // old exams stay readable without offering the old fields for new work.
    return result.filter(
      (tab) => !tab.legacy || Object.keys(clinicalData[tab.key] ?? {}).length > 0,
    );
  }, [examPrefs.hiddenTabs, examPrefs.tabOrder, requiredTabKeys, clinicalData]);

  useEffect(() => {
    if (!visibleTabs.some((t) => t.key === activeTab) && visibleTabs.length > 0) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [visibleTabs, activeTab]);

  const meta = useMemo<ExamMeta>(() => {
    const raw = (encounter?.clinicalData?.meta ?? {}) as ExamMeta;
    return {
      providerId: raw.providerId ?? '',
      examDate: raw.examDate ?? (encounter ? toDatetimeLocal(encounter.createdAt) : ''),
      recallDate: raw.recallDate ?? '',
    };
  }, [encounter]);

  const isSigned = encounter?.status === 'SIGNED';
  const isVoided = encounter?.status === 'VOIDED';
  const readOnly = isSigned || isVoided;
  const encounterRef = useRef(encounter);
  encounterRef.current = encounter;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  function setSectionField(sectionKey: string, field: string, value: unknown) {
    setEncounter((prev) => {
      if (!prev) return prev;
      const section = { ...(prev.clinicalData[sectionKey] ?? {}), [field]: value };
      const nextClinical = { ...prev.clinicalData, [sectionKey]: section };

      let chiefComplaint = prev.chiefComplaint;
      let assessment = prev.assessment;
      let plan = prev.plan;
      let diagnosisCodes = prev.diagnosisCodes;

      if (sectionKey === 'hpi' && field === 'complaints' && Array.isArray(value)) {
        const texts = value
          .map((c) => (typeof c === 'object' && c && 'text' in c ? String((c as { text: string }).text).trim() : ''))
          .filter(Boolean);
        chiefComplaint = texts.join('; ') || chiefComplaint;
      }

      if (sectionKey === 'plan') {
        if (field === 'assessment') assessment = String(value ?? '');
        if (field === 'planNotes') plan = String(value ?? '');
        if (field === 'diagnoses') diagnosisCodes = diagnosesToCodes(value);
        if (field === 'returnToClinic') {
          const recallDate = recallFromReturn(String(value ?? ''), meta.examDate || new Date().toISOString());
          nextClinical.meta = { ...(nextClinical.meta ?? {}), recallDate };
        }
      }

      return {
        ...prev,
        chiefComplaint,
        assessment,
        plan,
        diagnosisCodes,
        clinicalData: nextClinical,
      };
    });
  }

  function setSectionBulk(sectionKey: string, patch: Record<string, unknown>) {
    setEncounter((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        clinicalData: {
          ...prev.clinicalData,
          [sectionKey]: { ...(prev.clinicalData[sectionKey] ?? {}), ...patch },
        },
      };
    });
  }

  /**
   * Fills every objective finding with its normal value in one action, so a
   * routine exam is recorded by exception. Only blank fields are touched —
   * anything already answered is left as the examiner recorded it.
   */
  function markExamNormal() {
    setEncounter((prev) => {
      if (!prev) return prev;
      const nextClinical = { ...prev.clinicalData };
      for (const tab of tabsWithNormals()) {
        const current = { ...(nextClinical[tab.key] ?? {}) };
        for (const [key, value] of Object.entries(normalPatchForTab(tab))) {
          const existing = current[key];
          const blank =
            existing === undefined ||
            existing === '' ||
            (Array.isArray(existing) && existing.length === 0);
          if (blank) current[key] = value;
        }
        nextClinical[tab.key] = current;
      }
      return { ...prev, clinicalData: nextClinical };
    });
    setToast('Normal findings filled in — review before signing');
    setTimeout(() => setToast(null), 2500);
  }

  function setMeta(patch: Partial<ExamMeta>) {
    setEncounter((prev) => {
      if (!prev) return prev;
      const current = (prev.clinicalData.meta ?? {}) as ExamMeta;
      return {
        ...prev,
        clinicalData: {
          ...prev.clinicalData,
          meta: { ...current, ...patch },
        },
      };
    });
  }

  async function save() {
    if (!encounter) return;
    setSaveState('saving');
    setError(null);
    try {
      const planData = encounter.clinicalData.plan ?? {};
      const diagnosisCodes = Array.isArray(planData.diagnoses)
        ? diagnosesToCodes(planData.diagnoses)
        : encounter.diagnosisCodes;
      await api(`/encounters/${encounter.id}`, {
        method: 'PATCH',
        body: {
          chiefComplaint: encounter.chiefComplaint ?? undefined,
          clinicalData: encounter.clinicalData,
          assessment: (planData.assessment as string) ?? encounter.assessment ?? undefined,
          plan: (planData.planNotes as string) ?? encounter.plan ?? undefined,
          diagnosisCodes,
        },
      });
      setSaveState('saved');
      setToast('Exam saved successfully');
      if (prefs.accessibility.announceSaves) {
        announce('Exam saved successfully');
      }
      setTimeout(() => {
        setSaveState('idle');
        setToast(null);
      }, 2000);
    } catch (err) {
      setSaveState('idle');
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const seconds = examPrefs.autoSaveSeconds;
    if (!seconds || readOnly) return;
    const timer = setInterval(() => {
      if (readOnlyRef.current || !encounterRef.current) return;
      void saveRef.current();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [examPrefs.autoSaveSeconds, readOnly]);

  async function finalize() {
    if (!encounter) return;
    setError(null);
    try {
      await save();
      await api(`/encounters/${encounter.id}/sign`, { method: 'POST' });
      setToast('Exam finalized successfully');
      await load();
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Finalize failed');
    }
  }

  async function voidExam() {
    if (!encounter) return;
    const reason = window.prompt('Reason for voiding this exam (kept for audit):');
    if (reason === null) return;
    if (!reason.trim()) {
      setError('A reason is required to void an exam');
      return;
    }
    setError(null);
    try {
      await api(`/encounters/${encounter.id}/void`, { method: 'POST', body: { reason: reason.trim() } });
      setToast('Exam voided');
      await load();
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Void failed');
    }
  }

  async function addAddendum() {
    if (!encounter || !addendumText.trim()) return;
    await api(`/encounters/${encounter.id}/addenda`, { method: 'POST', body: { text: addendumText } });
    setAddendumText('');
    await load();
  }

  if (error && !encounter) {
    return (
      <AppShell>
        <p className="error-text">{error}</p>
      </AppShell>
    );
  }

  if (!encounter) {
    return (
      <AppShell>
        <p className="muted">Loading exam…</p>
      </AppShell>
    );
  }

  const active = visibleTabs.find((t) => t.key === activeTab) ?? visibleTabs[0] ?? EXAM_TABS[0];
  const sectionData = (encounter.clinicalData[active.key] ?? {}) as Record<string, unknown>;
  const rosKeys = EXAM_TABS.find((t) => t.key === 'ros')
    ?.sections.flatMap((s) => s.fields)
    .filter((f) => f.type === 'rosSystem')
    .map((f) => f.key) ?? [];

  const fieldColumns = examPrefs.fieldColumns;
  const singlePage = examPrefs.singlePageMode;
  const tabsToRender = singlePage ? visibleTabs.filter((t) => !t.stub) : [active];

  function renderTabBody(tab: (typeof EXAM_TABS)[number]) {
    const data = (encounter!.clinicalData[tab.key] ?? {}) as Record<string, unknown>;
    if (tab.stub) {
      return <p className="muted">This section is coming soon.</p>;
    }
    // The intake questionnaire lives on the patient chart, not this encounter.
    if (tab.key === 'history') {
      return (
        <IntakeHistoryPanel
          patientId={encounter!.patient.id}
          encounterId={encounter!.id}
          readOnly={readOnly}
        />
      );
    }
    // Attached docs are Document rows, not clinicalData — own component.
    if (tab.key === 'attachedDocs') {
      return (
        <AttachedDocs
          encounterId={encounter!.id}
          patientId={encounter!.patient.id}
          readOnly={readOnly}
          onCopyRx={(row) => setSectionField('refractionCl', 'currentRx', row)}
        />
      );
    }
    return (
      <>
        {tab.key === 'ros' && !readOnly && (
          <div className="toolbar">
            <button
              type="button"
              className="secondary"
              onClick={() => markAllRosNegative(rosKeys, (patch) => setSectionBulk('ros', patch))}
            >
              Mark all negative
            </button>
          </div>
        )}
        {tab.sections.map((section, sIdx) => (
          <div key={`${tab.key}-${sIdx}`} className="exam-section">
            {section.title && tab.key !== 'hpi' && (
              <div className="exam-section-header">
                <h2>{section.title}</h2>
                {!readOnly && sectionHasNormals(section) && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setSectionBulk(tab.key, normalPatchForSection(section))}
                  >
                    All normal
                  </button>
                )}
              </div>
            )}
            {!section.title && !readOnly && sectionHasNormals(section) && (
              <div className="toolbar">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setSectionBulk(tab.key, normalPatchForSection(section))}
                >
                  All normal
                </button>
              </div>
            )}
            <div className="exam-field-grid" data-columns={fieldColumns}>
              {section.fields.map((field) => {
                if (
                  field.type === 'odOsGrid' &&
                  field.key === 'cycloplegic' &&
                  !data.cycloplegicEnabled
                ) {
                  return null;
                }
                return (
                  <FieldRenderer
                    key={field.key}
                    field={field}
                    tabKey={tab.key}
                    sectionData={data}
                    disabled={readOnly}
                    onChange={(key, value) => setSectionField(tab.key, key, value)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </>
    );
  }

  return (
    <AppShell>
      <div className="exam-page-header">
        <div>
          <h1>
            Patient Exam Form <span className="muted">ID: {encounter.id.slice(0, 8)}</span>
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            <Link href={`/patients/${encounter.patient.id}`}>
              {encounter.patient.lastName}, {encounter.patient.firstName}
            </Link>{' '}
            · MRN {encounter.patient.mrn} · {encounter.template.name} v{encounter.template.version} ·{' '}
            {isVoided ? (
              <span className="badge danger">Voided</span>
            ) : isSigned ? (
              <span className="badge success">
                Signed {encounter.signedAt ? new Date(encounter.signedAt).toLocaleString() : ''} by Dr.{' '}
                {encounter.signedBy?.lastName}
              </span>
            ) : (
              <span className="badge warning">In progress</span>
            )}
          </p>
          {encounter.patient.alerts && <p className="badge danger">{encounter.patient.alerts}</p>}
          {isVoided && (
            <p className="error-text" role="status">
              This exam was voided
              {encounter.voidedAt ? ` on ${new Date(encounter.voidedAt).toLocaleString()}` : ''}
              {encounter.voidedBy ? ` by Dr. ${encounter.voidedBy.lastName}` : ''}
              {encounter.voidReason ? ` — ${encounter.voidReason}` : ''}
            </p>
          )}
        </div>
        <div className="exam-actions">
          {!readOnly && (
            <>
              <button type="button" className="secondary" onClick={markExamNormal}>
                Normal exam
              </button>
              <button type="button" onClick={save} disabled={saveState === 'saving'}>
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save Exam'}
              </button>
              {canSign && (
                <button type="button" className="danger" onClick={finalize}>
                  Finalize Exam
                </button>
              )}
              {canSign && (
                <button type="button" className="secondary" onClick={voidExam}>
                  Void Exam
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() => router.push(`/patients/${encounter.patient.id}`)}
          >
            Close
          </button>
        </div>
      </div>

      <div className={examPrefs.stickyBanner ? 'exam-banner-sticky' : undefined}>
        <PatientBanner
          patient={encounter.patient}
          chiefComplaint={encounter.chiefComplaint ?? ''}
          examProviderId={meta.providerId ?? ''}
          examDate={meta.examDate ?? ''}
          recallDate={meta.recallDate ?? ''}
          providers={providers}
          readOnly={readOnly}
          onChiefComplaintChange={(value) => setEncounter({ ...encounter, chiefComplaint: value })}
          onProviderChange={(value) => setMeta({ providerId: value })}
          onExamDateChange={(value) => setMeta({ examDate: value })}
          onRecallDateChange={(value) => setMeta({ recallDate: value })}
        />
      </div>

      <TabStrip
        id="exam"
        tabs={visibleTabs}
        activeKey={activeTab}
        onChange={setActiveTab}
        anchorMode={singlePage}
      />

      {singlePage ? (
        tabsToRender.map((tab) => (
          <section
            key={tab.key}
            className="card"
            id={`exam-panel-${tab.key}`}
            role="tabpanel"
            aria-labelledby={`exam-tab-${tab.key}`}
          >
            <h2>{tab.label}</h2>
            {renderTabBody(tab)}
          </section>
        ))
      ) : (
        <section
          className="card"
          id={`exam-panel-${active.key}`}
          role="tabpanel"
          aria-labelledby={`exam-tab-${active.key}`}
        >
          {renderTabBody(active)}
        </section>
      )}

      {error && <p className="error-text">{error}</p>}

      {readOnly && (
        <section className="card">
          <h2>Addenda</h2>
          {encounter.addenda.length === 0 && <p className="muted">No addenda.</p>}
          {encounter.addenda.map((a) => (
            <p key={a.id}>
              <strong>
                {new Date(a.createdAt).toLocaleString()} — Dr. {a.author.lastName}:
              </strong>{' '}
              {a.text}
            </p>
          ))}
          {canSign && (
            <div className="toolbar">
              <input
                placeholder="Addendum text"
                value={addendumText}
                onChange={(e) => setAddendumText(e.target.value)}
              />
              <button type="button" onClick={addAddendum} disabled={!addendumText.trim()}>
                Add addendum
              </button>
            </div>
          )}
        </section>
      )}

      {toast && <div className="exam-toast">{toast}</div>}
    </AppShell>
  );
}
