'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { usePreferences } from '@/components/PreferencesProvider';
import { TabStrip } from '@/components/TabStrip';
import { getSessionUser, api } from '@/lib/api';
import {
  DASHBOARD_PANEL_KEYS,
  DASHBOARD_PANEL_LABELS,
  type DashboardPanelKey,
} from '@/lib/dashboardPanels';
import { EXAM_TABS } from '@/app/exams/[id]/examDefinition';
import type {
  Density,
  FontFamilyPref,
  FontScale,
  SidebarMode,
  ThemePreference,
} from '@/lib/preferences';
import {
  DEFAULT_SIDEBAR_W,
  SIDEBAR_MAX_W,
  SIDEBAR_MIN_W,
} from '@/lib/preferences';

type SettingsTab = 'appearance' | 'dashboard' | 'exam' | 'printing' | 'accessibility';

interface ReportTemplate {
  id: string;
  name: string;
  kind: string;
  version: number;
  isDefault?: boolean;
  layout: ReportLayoutEditor;
}

interface ReportLayoutEditor {
  headerText?: string;
  footerText?: string;
  showLogo?: boolean;
  logoBlobPath?: string;
  logoWidth?: number;
  signatureLine?: boolean;
  signatureLabel?: string;
  paperSize?: 'LETTER' | 'A4';
  margin?: number;
  baseFontSize?: number;
  fontFamily?: 'Helvetica' | 'Times-Roman' | 'Courier';
  valueLayout?: 'list' | 'table';
  showExpiration?: boolean;
  showPrescriberCredentials?: boolean;
  copiesLabel?: string;
  accentColor?: string;
  visibleFields?: string[];
  titleOverride?: string;
  showVersion?: boolean;
  dateFormat?: 'ISO' | 'US' | 'LONG';
  disclaimerText?: string;
}

const SPECTACLE_VISIBLE_FIELDS = [
  'Sphere',
  'Cylinder',
  'Axis',
  'Add',
  'Prism',
  'PD (distance)',
  'PD (near)',
];

const CONTACT_LENS_VISIBLE_FIELDS = [
  'Brand',
  'Material',
  'Base curve',
  'Diameter',
  'Power',
  'Cylinder',
  'Axis',
  'Add',
];

const DEFAULT_NEW_LAYOUT: ReportLayoutEditor = {
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
  showVersion: true,
  dateFormat: 'US',
};

const SETTINGS_TABS = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'exam', label: 'Exam layout' },
  { key: 'printing', label: 'Printing' },
  { key: 'accessibility', label: 'Accessibility' },
];

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Paper' },
  { value: 'slate', label: 'Slate' },
  { value: 'dark', label: 'Ink' },
  { value: 'forest', label: 'Forest' },
  { value: 'high-contrast', label: 'High contrast' },
  { value: 'system', label: 'System' },
];

const FONT_SCALE_OPTIONS: { value: FontScale; label: string }[] = [
  { value: 'sm', label: 'Small' },
  { value: 'md', label: 'Medium' },
  { value: 'lg', label: 'Large' },
  { value: 'xl', label: 'Extra large' },
];

const LANDING_OPTIONS = [
  { value: '/dashboard', label: 'Dashboard' },
  { value: '/patients', label: 'Patients' },
  { value: '/schedule', label: 'Schedule' },
  { value: '/exams', label: 'Exams' },
];

const SIDEBAR_MODE_OPTIONS: { value: SidebarMode; label: string; help: string }[] = [
  { value: 'expanded', label: 'Expanded', help: 'Full labels always visible' },
  { value: 'rail', label: 'Icons only', help: 'Compact icon rail' },
  { value: 'auto', label: 'Auto-compact', help: 'Opens on hover or focus' },
];

export default function SettingsPage() {
  const { prefs, update, reset, saving } = usePreferences();
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const [savedFlash, setSavedFlash] = useState(false);
  const user = getSessionUser();
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    if (!saving && savedFlash) {
      const t = setTimeout(() => setSavedFlash(false), 1500);
      return () => clearTimeout(t);
    }
  }, [saving, savedFlash]);

  async function patch(partial: Parameters<typeof update>[0]) {
    setSavedFlash(true);
    await update(partial);
  }

  return (
    <AppShell>
      <div className="settings-header">
        <h1 className="page-header" style={{ margin: 0 }}>
          Settings
        </h1>
        {(saving || savedFlash) && (
          <span className="settings-saved" aria-live="polite">
            {saving ? 'Saving…' : 'Saved'}
          </span>
        )}
      </div>

      <TabStrip
        id="settings"
        className="subtabs"
        tabs={SETTINGS_TABS}
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as SettingsTab)}
      />

      <section
        className="card"
        role="tabpanel"
        id={`settings-panel-${activeTab}`}
        aria-labelledby={`settings-tab-${activeTab}`}
      >
        {activeTab === 'appearance' && (
          <AppearanceSection
            theme={prefs.appearance.theme}
            fontScale={prefs.appearance.fontScale}
            density={prefs.appearance.density}
            fontFamily={prefs.appearance.fontFamily}
            landingRoute={prefs.dashboard.landingRoute}
            sidebarMode={prefs.sidebar.mode}
            sidebarWidth={prefs.sidebar.width}
            onChange={patch}
          />
        )}
        {activeTab === 'dashboard' && (
          <DashboardSection
            panelOrder={prefs.dashboard.panelOrder}
            hiddenPanels={prefs.dashboard.hiddenPanels}
            onChange={patch}
          />
        )}
        {activeTab === 'exam' && (
          <ExamSection
            defaultTab={prefs.exam.defaultTab}
            tabOrder={prefs.exam.tabOrder}
            hiddenTabs={prefs.exam.hiddenTabs}
            singlePageMode={prefs.exam.singlePageMode}
            fieldColumns={prefs.exam.fieldColumns}
            stickyBanner={prefs.exam.stickyBanner}
            autoSaveSeconds={prefs.exam.autoSaveSeconds}
            onChange={patch}
          />
        )}
        {activeTab === 'printing' && (
          <PrintingSection
            openInNewTab={prefs.printing.openInNewTab}
            copies={prefs.printing.copies}
            isAdmin={!!isAdmin}
            onChange={patch}
          />
        )}
        {activeTab === 'accessibility' && (
          <AccessibilitySection
            reducedMotion={prefs.accessibility.reducedMotion}
            boldFocusRing={prefs.accessibility.boldFocusRing}
            underlineLinks={prefs.accessibility.underlineLinks}
            idleTimeoutMinutes={prefs.accessibility.idleTimeoutMinutes}
            idleWarningSeconds={prefs.accessibility.idleWarningSeconds}
            announceSaves={prefs.accessibility.announceSaves}
            keyboardShortcuts={prefs.accessibility.keyboardShortcuts}
            onChange={patch}
            onReset={async () => {
              setSavedFlash(true);
              await reset();
            }}
          />
        )}
      </section>
    </AppShell>
  );
}

function AppearanceSection({
  theme,
  fontScale,
  density,
  fontFamily,
  landingRoute,
  sidebarMode,
  sidebarWidth,
  onChange,
}: {
  theme: ThemePreference;
  fontScale: FontScale;
  density: Density;
  fontFamily: FontFamilyPref;
  landingRoute: string;
  sidebarMode: SidebarMode;
  sidebarWidth: number;
  onChange: (p: Parameters<ReturnType<typeof usePreferences>['update']>[0]) => Promise<void>;
}) {
  return (
    <div className="settings-section">
      <div className="settings-row">
        <div>
          <div className="settings-row-label">Theme</div>
          <span className="settings-row-help">Applies immediately across the app</span>
        </div>
        <div className="settings-choices">
          {THEME_OPTIONS.map((o) => (
            <label key={o.value} className="exam-choice">
              <input
                type="radio"
                name="theme"
                checked={theme === o.value}
                onChange={() => onChange({ appearance: { theme: o.value } })}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">Font size</div>
        </div>
        <div className="settings-choices">
          {FONT_SCALE_OPTIONS.map((o) => (
            <label key={o.value} className="exam-choice">
              <input
                type="radio"
                name="fontScale"
                checked={fontScale === o.value}
                onChange={() => onChange({ appearance: { fontScale: o.value } })}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">Density</div>
        </div>
        <div className="settings-choices">
          <label className="exam-choice">
            <input
              type="radio"
              name="density"
              checked={density === 'comfortable'}
              onChange={() => onChange({ appearance: { density: 'comfortable' } })}
            />
            Comfortable
          </label>
          <label className="exam-choice">
            <input
              type="radio"
              name="density"
              checked={density === 'compact'}
              onChange={() => onChange({ appearance: { density: 'compact' } })}
            />
            Compact
          </label>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">Sidebar</div>
          <span className="settings-row-help">Desktop navigation layout</span>
        </div>
        <div className="settings-choices">
          {SIDEBAR_MODE_OPTIONS.map((o) => (
            <label key={o.value} className="exam-choice" title={o.help}>
              <input
                type="radio"
                name="sidebarMode"
                checked={sidebarMode === o.value}
                onChange={() => onChange({ sidebar: { mode: o.value } })}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">Sidebar width</div>
          <span className="settings-row-help">
            {sidebarMode === 'rail'
              ? 'Not used while icons-only is selected'
              : `${sidebarWidth}px (drag the sidebar edge to resize)`}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '14rem' }}>
          <input
            type="range"
            min={SIDEBAR_MIN_W}
            max={SIDEBAR_MAX_W}
            step={4}
            value={sidebarWidth}
            disabled={sidebarMode === 'rail'}
            aria-label="Sidebar width in pixels"
            onChange={(e) => onChange({ sidebar: { width: Number(e.target.value) } })}
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className="secondary"
            disabled={sidebarMode === 'rail' || sidebarWidth === DEFAULT_SIDEBAR_W}
            onClick={() => onChange({ sidebar: { width: DEFAULT_SIDEBAR_W } })}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">Font family</div>
        </div>
        <div className="settings-choices">
          {(
            [
              ['system', 'System'],
              ['serif', 'Serif'],
              ['dyslexic', 'Dyslexia-friendly'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="exam-choice">
              <input
                type="radio"
                name="fontFamily"
                checked={fontFamily === value}
                onChange={() => onChange({ appearance: { fontFamily: value } })}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">Landing page</div>
          <span className="settings-row-help">After sign-in</span>
        </div>
        <select
          value={landingRoute}
          onChange={(e) => onChange({ dashboard: { landingRoute: e.target.value } })}
          style={{ maxWidth: '16rem' }}
        >
          {LANDING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-preview-card">
        <h2>Live preview</h2>
        <p className="muted">Sample text at your current theme and scale.</p>
        <p>
          <button type="button">Primary</button>{' '}
          <button type="button" className="secondary">
            Secondary
          </button>
        </p>
        <p>
          <span className="badge">Info</span>{' '}
          <span className="badge success">Success</span>{' '}
          <span className="badge warning">Warning</span>{' '}
          <span className="badge danger">Danger</span>
        </p>
      </div>
    </div>
  );
}

function DashboardSection({
  panelOrder,
  hiddenPanels,
  onChange,
}: {
  panelOrder: string[];
  hiddenPanels: string[];
  onChange: (p: Parameters<ReturnType<typeof usePreferences>['update']>[0]) => Promise<void>;
}) {
  const order = useMemo(() => {
    const base = panelOrder.length ? panelOrder.filter((k) =>
      DASHBOARD_PANEL_KEYS.includes(k as DashboardPanelKey),
    ) : [...DASHBOARD_PANEL_KEYS];
    for (const k of DASHBOARD_PANEL_KEYS) {
      if (!base.includes(k)) base.push(k);
    }
    return base as DashboardPanelKey[];
  }, [panelOrder]);

  const hidden = new Set(hiddenPanels);

  function move(index: number, dir: -1 | 1) {
    const next = [...order];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    void onChange({ dashboard: { panelOrder: next } });
  }

  function toggleHidden(key: DashboardPanelKey) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    void onChange({ dashboard: { hiddenPanels: [...next] } });
  }

  return (
    <div className="settings-section">
      <p className="muted">Reorder panels and choose which appear on the Today dashboard.</p>
      <ul className="settings-reorder">
        {order.map((key, index) => (
          <li key={key} className="settings-reorder-item">
            <label className="exam-choice" style={{ flex: 1 }}>
              <input type="checkbox" checked={!hidden.has(key)} onChange={() => toggleHidden(key)} />
              {DASHBOARD_PANEL_LABELS[key]}
            </label>
            <button type="button" className="secondary" disabled={index === 0} onClick={() => move(index, -1)}>
              Up
            </button>
            <button
              type="button"
              className="secondary"
              disabled={index === order.length - 1}
              onClick={() => move(index, 1)}
            >
              Down
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExamSection({
  defaultTab,
  tabOrder,
  hiddenTabs,
  singlePageMode,
  fieldColumns,
  stickyBanner,
  autoSaveSeconds,
  onChange,
}: {
  defaultTab: string;
  tabOrder: string[];
  hiddenTabs: string[];
  singlePageMode: boolean;
  fieldColumns: 1 | 2 | 3;
  stickyBanner: boolean;
  autoSaveSeconds: number | null;
  onChange: (p: Parameters<ReturnType<typeof usePreferences>['update']>[0]) => Promise<void>;
}) {
  const order = useMemo(() => {
    const keys = EXAM_TABS.map((t) => t.key);
    const base = tabOrder.length ? tabOrder.filter((k) => keys.includes(k)) : [...keys];
    for (const k of keys) {
      if (!base.includes(k)) base.push(k);
    }
    return base;
  }, [tabOrder]);

  const hidden = new Set(hiddenTabs);
  const labelFor = (key: string) => EXAM_TABS.find((t) => t.key === key)?.label ?? key;

  function move(index: number, dir: -1 | 1) {
    const next = [...order];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    void onChange({ exam: { tabOrder: next } });
  }

  function toggleHidden(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    void onChange({ exam: { hiddenTabs: [...next] } });
  }

  return (
    <div className="settings-section">
      <div className="settings-row">
        <div>
          <div className="settings-row-label">Default tab</div>
        </div>
        <select
          value={defaultTab}
          onChange={(e) => onChange({ exam: { defaultTab: e.target.value } })}
          style={{ maxWidth: '16rem' }}
        >
          {EXAM_TABS.filter((t) => !t.stub).map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">Layout mode</div>
        </div>
        <div className="settings-choices">
          <label className="exam-choice">
            <input
              type="radio"
              name="examMode"
              checked={!singlePageMode}
              onChange={() => onChange({ exam: { singlePageMode: false } })}
            />
            Tabbed
          </label>
          <label className="exam-choice">
            <input
              type="radio"
              name="examMode"
              checked={singlePageMode}
              onChange={() => onChange({ exam: { singlePageMode: true } })}
            />
            Single page
          </label>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">Field columns</div>
        </div>
        <div className="settings-choices">
          {([1, 2, 3] as const).map((n) => (
            <label key={n} className="exam-choice">
              <input
                type="radio"
                name="fieldColumns"
                checked={fieldColumns === n}
                onChange={() => onChange({ exam: { fieldColumns: n } })}
              />
              {n}
            </label>
          ))}
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">Sticky patient banner</div>
        </div>
        <label className="exam-choice">
          <input
            type="checkbox"
            checked={stickyBanner}
            onChange={(e) => onChange({ exam: { stickyBanner: e.target.checked } })}
          />
          Keep banner visible while scrolling
        </label>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">Autosave</div>
          <span className="settings-row-help">Seconds between drafts; off = manual only</span>
        </div>
        <select
          value={autoSaveSeconds ?? ''}
          onChange={(e) =>
            onChange({
              exam: { autoSaveSeconds: e.target.value === '' ? null : Number(e.target.value) },
            })
          }
          style={{ maxWidth: '12rem' }}
        >
          <option value="">Off</option>
          <option value="30">30 seconds</option>
          <option value="60">60 seconds</option>
          <option value="120">2 minutes</option>
        </select>
      </div>

      <div>
        <div className="settings-row-label" style={{ marginBottom: '0.5rem' }}>
          Tab order &amp; visibility
        </div>
        <p className="muted">Tabs required for sign-off stay available even if hidden here.</p>
        <ul className="settings-reorder">
          {order.map((key, index) => {
            const stub = EXAM_TABS.find((t) => t.key === key)?.stub;
            return (
              <li key={key} className="settings-reorder-item">
                <label className="exam-choice" style={{ flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={!hidden.has(key)}
                    disabled={!!stub}
                    onChange={() => toggleHidden(key)}
                  />
                  {labelFor(key)}
                  {stub ? ' (coming soon)' : ''}
                </label>
                <button type="button" className="secondary" disabled={index === 0} onClick={() => move(index, -1)}>
                  Up
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={index === order.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Down
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function PrintingSection({
  openInNewTab,
  copies,
  isAdmin,
  onChange,
}: {
  openInNewTab: boolean;
  copies: number;
  isAdmin: boolean;
  onChange: (p: Parameters<ReturnType<typeof usePreferences>['update']>[0]) => Promise<void>;
}) {
  return (
    <div className="settings-section">
      <div className="settings-row">
        <div>
          <div className="settings-row-label">Open Rx PDF</div>
        </div>
        <div className="settings-choices">
          <label className="exam-choice">
            <input
              type="radio"
              name="rxOpen"
              checked={openInNewTab}
              onChange={() => onChange({ printing: { openInNewTab: true } })}
            />
            New browser tab
          </label>
          <label className="exam-choice">
            <input
              type="radio"
              name="rxOpen"
              checked={!openInNewTab}
              onChange={() => onChange({ printing: { openInNewTab: false } })}
            />
            Download file
          </label>
        </div>
      </div>

      <div className="settings-row">
        <div>
          <div className="settings-row-label">Preferred copies</div>
          <span className="settings-row-help">Hint for staff; PDF itself is single-page</span>
        </div>
        <select
          value={copies}
          onChange={(e) => onChange({ printing: { copies: Number(e.target.value) } })}
          style={{ maxWidth: '8rem' }}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {isAdmin ? (
        <AdminPrintTemplateEditor />
      ) : (
        <p className="muted">Practice-wide Rx print templates are managed by an administrator.</p>
      )}
    </div>
  );
}

function AdminPrintTemplateEditor() {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [layout, setLayout] = useState<ReportLayoutEditor>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<'spectacle-rx' | 'contact-lens-rx'>('spectacle-rx');

  const selected = templates.find((t) => t.id === selectedId);
  const fieldOptions =
    selected?.kind === 'contact-lens-rx' ? CONTACT_LENS_VISIBLE_FIELDS : SPECTACLE_VISIBLE_FIELDS;

  const load = useCallback(async (preferId?: string) => {
    const list = await api<ReportTemplate[]>('/reports/templates');
    const rx = list.filter((t) => t.kind === 'spectacle-rx' || t.kind === 'contact-lens-rx');
    setTemplates(rx);
    const nextId = preferId && rx.some((t) => t.id === preferId) ? preferId : rx[0]?.id ?? '';
    setSelectedId(nextId);
    const next = rx.find((t) => t.id === nextId);
    if (next) setLayout({ ...next.layout });
  }, []);

  useEffect(() => {
    load().catch(() => setStatus('Failed to load report templates'));
  }, [load]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function selectTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    setSelectedId(id);
    if (t) setLayout({ ...t.layout });
  }

  function setField<K extends keyof ReportLayoutEditor>(key: K, value: ReportLayoutEditor[K]) {
    setLayout((prev) => ({ ...prev, [key]: value }));
  }

  function toggleVisibleField(label: string) {
    const current = layout.visibleFields;
    // undefined means "show all" — first toggle creates an explicit list with everything except the clicked one
    if (!current) {
      setField(
        'visibleFields',
        fieldOptions.filter((f) => f !== label),
      );
      return;
    }
    if (current.includes(label)) {
      setField(
        'visibleFields',
        current.filter((f) => f !== label),
      );
    } else {
      setField('visibleFields', [...current, label]);
    }
  }

  function isFieldVisible(label: string) {
    return !layout.visibleFields || layout.visibleFields.includes(label);
  }

  async function preview() {
    if (!selected) return;
    setBusy(true);
    setStatus(null);
    try {
      const blob = await api<Blob>('/reports/templates/preview', {
        method: 'POST',
        body: { layout, kind: selected.kind },
      });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!selected) return;
    setBusy(true);
    setStatus(null);
    try {
      const next = await api<ReportTemplate>(`/reports/templates/${selected.id}/versions`, {
        method: 'POST',
        body: { layout },
      });
      setStatus(`Published ${next.name} v${next.version}`);
      await load(next.id);
      setLayout({ ...next.layout });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  }

  async function createTemplate() {
    const name = newName.trim();
    if (!name) {
      setStatus('Enter a name for the new template');
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const created = await api<ReportTemplate>('/reports/templates', {
        method: 'POST',
        body: { name, kind: newKind, layout: DEFAULT_NEW_LAYOUT },
      });
      setCreating(false);
      setNewName('');
      setStatus(`Created ${created.name}`);
      await load(created.id);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function duplicateTemplate() {
    if (!selected) return;
    const name = window.prompt('Name for the duplicate template', `${selected.name} copy`);
    if (!name?.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const created = await api<ReportTemplate>(`/reports/templates/${selected.id}/duplicate`, {
        method: 'POST',
        body: { name: name.trim() },
      });
      setStatus(`Duplicated as ${created.name}`);
      await load(created.id);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Duplicate failed');
    } finally {
      setBusy(false);
    }
  }

  async function setAsDefault() {
    if (!selected || selected.isDefault) return;
    setBusy(true);
    setStatus(null);
    try {
      await api(`/reports/templates/${selected.id}/default`, { method: 'PATCH' });
      setStatus(`${selected.name} is now the default`);
      await load(selected.id);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not set default');
    } finally {
      setBusy(false);
    }
  }

  async function archiveTemplate() {
    if (!selected) return;
    if (selected.isDefault) {
      setStatus('Cannot archive the default template; set another default first');
      return;
    }
    if (!window.confirm(`Archive “${selected.name}”? It will no longer appear in this list.`)) return;
    setBusy(true);
    setStatus(null);
    try {
      await api(`/reports/templates/${selected.id}/archive`, { method: 'PATCH' });
      setStatus(`Archived ${selected.name}`);
      await load();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Archive failed');
    } finally {
      setBusy(false);
    }
  }

  async function onLogoSelected(file: File | null) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      setStatus('Logo must be a PNG or JPEG');
      return;
    }
    if (file.size > 1024 * 1024) {
      setStatus('Logo must be 1 MB or smaller');
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const dataBase64 = await readFileAsBase64(file);
      const uploaded = await api<{ blobPath: string }>('/reports/templates/logo', {
        method: 'POST',
        body: { fileName: file.name, contentType: file.type, dataBase64 },
      });
      setLayout((prev) => ({
        ...prev,
        showLogo: true,
        logoBlobPath: uploaded.blobPath,
        logoWidth: prev.logoWidth ?? 72,
      }));
      setStatus('Logo uploaded — preview or publish to apply');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Logo upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-section" style={{ marginTop: '1rem' }}>
      <h2>Practice Rx print templates</h2>
      <p className="muted">
        Edits publish as a new version so previously issued PDFs stay unchanged. Printing always uses
        the default template for each Rx kind.
      </p>

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <select
          value={selectedId}
          onChange={(e) => selectTemplate(e.target.value)}
          style={{ maxWidth: '22rem' }}
          aria-label="Template"
        >
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} (v{t.version}){t.isDefault ? ' — default' : ''}
            </option>
          ))}
        </select>
        {selected?.isDefault && <span className="badge success">Default</span>}
        <button type="button" className="secondary" disabled={busy} onClick={() => setCreating((v) => !v)}>
          New
        </button>
        <button type="button" className="secondary" disabled={busy || !selected} onClick={duplicateTemplate}>
          Duplicate
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || !selected || !!selected.isDefault}
          onClick={setAsDefault}
        >
          Set default
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy || !selected || !!selected.isDefault}
          onClick={archiveTemplate}
        >
          Archive
        </button>
      </div>

      {creating && (
        <div className="card" style={{ marginTop: '0.75rem' }}>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="newTemplateName">Name</label>
              <input
                id="newTemplateName"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Large print spectacle Rx"
              />
            </div>
            <div className="field">
              <label htmlFor="newTemplateKind">Kind</label>
              <select
                id="newTemplateKind"
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as 'spectacle-rx' | 'contact-lens-rx')}
              >
                <option value="spectacle-rx">Spectacle Rx</option>
                <option value="contact-lens-rx">Contact lens Rx</option>
              </select>
            </div>
          </div>
          <div className="toolbar">
            <button type="button" onClick={createTemplate} disabled={busy}>
              Create
            </button>
            <button type="button" className="secondary" onClick={() => setCreating(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {selected && (
        <>
          <div className="grid-2" style={{ marginTop: '1rem' }}>
            <div className="field">
              <label htmlFor="paperSize">Paper size</label>
              <select
                id="paperSize"
                value={layout.paperSize ?? 'LETTER'}
                onChange={(e) => setField('paperSize', e.target.value as 'LETTER' | 'A4')}
              >
                <option value="LETTER">US Letter</option>
                <option value="A4">A4</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="margin">Margin (pt)</label>
              <input
                id="margin"
                type="number"
                min={36}
                max={90}
                value={layout.margin ?? 54}
                onChange={(e) => setField('margin', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="baseFontSize">Base font size</label>
              <input
                id="baseFontSize"
                type="number"
                min={8}
                max={14}
                value={layout.baseFontSize ?? 10}
                onChange={(e) => setField('baseFontSize', Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="fontFamily">Font</label>
              <select
                id="fontFamily"
                value={layout.fontFamily ?? 'Helvetica'}
                onChange={(e) =>
                  setField('fontFamily', e.target.value as ReportLayoutEditor['fontFamily'])
                }
              >
                <option value="Helvetica">Helvetica</option>
                <option value="Times-Roman">Times</option>
                <option value="Courier">Courier</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="valueLayout">Values layout</label>
              <select
                id="valueLayout"
                value={layout.valueLayout ?? 'table'}
                onChange={(e) => setField('valueLayout', e.target.value as 'list' | 'table')}
              >
                <option value="table">Table</option>
                <option value="list">List</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="dateFormat">Date format</label>
              <select
                id="dateFormat"
                value={layout.dateFormat ?? 'ISO'}
                onChange={(e) => setField('dateFormat', e.target.value as 'ISO' | 'US' | 'LONG')}
              >
                <option value="ISO">YYYY-MM-DD</option>
                <option value="US">MM/DD/YYYY</option>
                <option value="LONG">Month D, YYYY</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="accentColor">Accent color</label>
              <input
                id="accentColor"
                type="text"
                value={layout.accentColor ?? '#0d5c8c'}
                onChange={(e) => setField('accentColor', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="titleOverride">Title override</label>
              <input
                id="titleOverride"
                type="text"
                placeholder="Leave blank for default title"
                value={layout.titleOverride ?? ''}
                onChange={(e) => setField('titleOverride', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="headerText">Header text</label>
              <input
                id="headerText"
                type="text"
                value={layout.headerText ?? ''}
                onChange={(e) => setField('headerText', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="footerText">Footer text</label>
              <input
                id="footerText"
                type="text"
                value={layout.footerText ?? ''}
                onChange={(e) => setField('footerText', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="copiesLabel">Copies label</label>
              <input
                id="copiesLabel"
                type="text"
                placeholder="Patient copy"
                value={layout.copiesLabel ?? ''}
                onChange={(e) => setField('copiesLabel', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="signatureLabel">Signature label</label>
              <input
                id="signatureLabel"
                type="text"
                placeholder="Provider signature"
                value={layout.signatureLabel ?? ''}
                onChange={(e) => setField('signatureLabel', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="logoWidth">Logo width (pt)</label>
              <input
                id="logoWidth"
                type="number"
                min={24}
                max={180}
                value={layout.logoWidth ?? 72}
                onChange={(e) => setField('logoWidth', Number(e.target.value))}
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="disclaimerText">Disclaimer</label>
              <textarea
                id="disclaimerText"
                rows={2}
                placeholder="Optional legal text above the signature line"
                value={layout.disclaimerText ?? ''}
                onChange={(e) => setField('disclaimerText', e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="logoFile">Logo image</label>
              <input
                id="logoFile"
                type="file"
                accept="image/png,image/jpeg"
                disabled={busy}
                onChange={(e) => onLogoSelected(e.target.files?.[0] ?? null)}
              />
              {layout.logoBlobPath && (
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  Uploaded: {layout.logoBlobPath}
                </span>
              )}
            </div>
          </div>

          <div className="settings-choices" style={{ marginBottom: '1rem' }}>
            <label className="exam-choice">
              <input
                type="checkbox"
                checked={!!layout.showLogo}
                onChange={(e) => setField('showLogo', e.target.checked)}
              />
              Show logo
            </label>
            <label className="exam-choice">
              <input
                type="checkbox"
                checked={layout.signatureLine !== false}
                onChange={(e) => setField('signatureLine', e.target.checked)}
              />
              Signature line
            </label>
            <label className="exam-choice">
              <input
                type="checkbox"
                checked={layout.showExpiration !== false}
                onChange={(e) => setField('showExpiration', e.target.checked)}
              />
              Show expiration
            </label>
            <label className="exam-choice">
              <input
                type="checkbox"
                checked={layout.showPrescriberCredentials !== false}
                onChange={(e) => setField('showPrescriberCredentials', e.target.checked)}
              />
              Prescriber credentials
            </label>
            <label className="exam-choice">
              <input
                type="checkbox"
                checked={layout.showVersion !== false}
                onChange={(e) => setField('showVersion', e.target.checked)}
              />
              Show version in title
            </label>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div className="settings-row-label" style={{ marginBottom: '0.5rem' }}>
              Visible fields
            </div>
            <p className="muted" style={{ marginTop: 0 }}>
              Uncheck to hide a value from the printed Rx. Leave all checked to show everything.
            </p>
            <div className="settings-choices">
              {fieldOptions.map((label) => (
                <label key={label} className="exam-choice">
                  <input
                    type="checkbox"
                    checked={isFieldVisible(label)}
                    onChange={() => toggleVisibleField(label)}
                  />
                  {label}
                </label>
              ))}
            </div>
            {layout.visibleFields && (
              <button
                type="button"
                className="secondary"
                style={{ marginTop: '0.5rem' }}
                onClick={() => setField('visibleFields', undefined)}
              >
                Reset to show all
              </button>
            )}
          </div>

          <div className="toolbar">
            <button type="button" onClick={preview} disabled={busy}>
              {busy ? 'Working…' : 'Preview'}
            </button>
            <button type="button" className="secondary" onClick={publish} disabled={busy}>
              Publish new version
            </button>
          </div>
          {status && <p className="muted">{status}</p>}
          {previewUrl && (
            <iframe title="Rx PDF preview" className="settings-print-preview" src={previewUrl} />
          )}
        </>
      )}
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read file'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

function AccessibilitySection({
  reducedMotion,
  boldFocusRing,
  underlineLinks,
  idleTimeoutMinutes,
  idleWarningSeconds,
  announceSaves,
  keyboardShortcuts,
  onChange,
  onReset,
}: {
  reducedMotion: boolean;
  boldFocusRing: boolean;
  underlineLinks: boolean;
  idleTimeoutMinutes: number;
  idleWarningSeconds: number;
  announceSaves: boolean;
  keyboardShortcuts: boolean;
  onChange: (p: Parameters<ReturnType<typeof usePreferences>['update']>[0]) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  return (
    <div className="settings-section">
      <div className="settings-row">
        <div className="settings-row-label">Motion</div>
        <label className="exam-choice">
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => onChange({ accessibility: { reducedMotion: e.target.checked } })}
          />
          Reduce motion
        </label>
      </div>
      <div className="settings-row">
        <div className="settings-row-label">Focus indicator</div>
        <label className="exam-choice">
          <input
            type="checkbox"
            checked={boldFocusRing}
            onChange={(e) => onChange({ accessibility: { boldFocusRing: e.target.checked } })}
          />
          Bold focus ring
        </label>
      </div>
      <div className="settings-row">
        <div className="settings-row-label">Links</div>
        <label className="exam-choice">
          <input
            type="checkbox"
            checked={underlineLinks}
            onChange={(e) => onChange({ accessibility: { underlineLinks: e.target.checked } })}
          />
          Always underline links
        </label>
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-label">Idle timeout</div>
          <span className="settings-row-help">5–30 minutes (HIPAA automatic logoff)</span>
        </div>
        <input
          type="number"
          min={5}
          max={30}
          value={idleTimeoutMinutes}
          onChange={(e) =>
            onChange({ accessibility: { idleTimeoutMinutes: Number(e.target.value) } })
          }
          style={{ maxWidth: '8rem' }}
        />
      </div>
      <div className="settings-row">
        <div>
          <div className="settings-row-label">Idle warning</div>
          <span className="settings-row-help">Seconds before logout to show the stay-signed-in dialog</span>
        </div>
        <input
          type="number"
          min={15}
          max={300}
          value={idleWarningSeconds}
          onChange={(e) =>
            onChange({ accessibility: { idleWarningSeconds: Number(e.target.value) } })
          }
          style={{ maxWidth: '8rem' }}
        />
      </div>
      <div className="settings-row">
        <div className="settings-row-label">Screen reader</div>
        <label className="exam-choice">
          <input
            type="checkbox"
            checked={announceSaves}
            onChange={(e) => onChange({ accessibility: { announceSaves: e.target.checked } })}
          />
          Announce exam saves
        </label>
      </div>
      <div className="settings-row">
        <div className="settings-row-label">Keyboard shortcuts</div>
        <label className="exam-choice">
          <input
            type="checkbox"
            checked={keyboardShortcuts}
            onChange={(e) => onChange({ accessibility: { keyboardShortcuts: e.target.checked } })}
          />
          Enable keyboard shortcuts (reserved for future use)
        </label>
      </div>
      <div className="toolbar">
        <button type="button" className="danger" onClick={() => void onReset()}>
          Reset all settings to defaults
        </button>
      </div>
    </div>
  );
}
