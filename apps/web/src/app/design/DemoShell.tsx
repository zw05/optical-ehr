'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MOCK_USER } from './mockData';

export type DemoScreen = 'dashboard' | 'patients' | 'exam';

export type DemoTheme = 'paper' | 'slate' | 'ink' | 'forest';

export const DEMO_THEMES: { id: DemoTheme; label: string; swatch: string }[] = [
  { id: 'paper', label: 'Paper', swatch: '#ffffff' },
  { id: 'slate', label: 'Slate', swatch: '#f1f5f9' },
  { id: 'ink', label: 'Ink', swatch: '#0f0f0e' },
  { id: 'forest', label: 'Forest', swatch: '#0c1210' },
];

const DARK_THEMES = new Set<DemoTheme>(['ink', 'forest']);

const NAV: { id: DemoScreen; label: string; icon: NavIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'patients', label: 'Patients', icon: 'patients' },
  { id: 'exam', label: 'Exam', icon: 'exams' },
];

type NavIcon = 'dashboard' | 'patients' | 'exams' | 'schedule' | 'orders' | 'settings';

function Icon({ name }: { name: NavIcon }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'dashboard':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'patients':
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'exams':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
    case 'schedule':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      );
    case 'orders':
      return (
        <svg {...props}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
        </svg>
      );
  }
}

const STATIC_NAV: { label: string; icon: NavIcon }[] = [
  { label: 'Schedule', icon: 'schedule' },
  { label: 'Orders', icon: 'orders' },
  { label: 'Settings', icon: 'settings' },
];

interface DemoShellProps {
  screen: DemoScreen;
  onScreenChange: (screen: DemoScreen) => void;
  theme: DemoTheme;
  onThemeChange: (theme: DemoTheme) => void;
  title: string;
  children: ReactNode;
}

export default function DemoShell({
  screen,
  onScreenChange,
  theme,
  onThemeChange,
  title,
  children,
}: DemoShellProps) {
  const [themeOpen, setThemeOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const activeTheme = DEMO_THEMES.find((t) => t.id === theme) ?? DEMO_THEMES[0];

  useEffect(() => {
    if (!themeOpen) return;
    function onPointerDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setThemeOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [themeOpen]);

  return (
    <div
      className="mn"
      data-mn-theme={theme}
      data-mn-scheme={DARK_THEMES.has(theme) ? 'dark' : 'light'}
    >
      <aside className="mn-sidebar">
        <div className="mn-brand">
          <span className="mn-brand-mark" aria-hidden>
            O
          </span>
          Optical EHR
        </div>

        <nav className="mn-nav" aria-label="Demo screens">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`mn-nav-item${screen === item.id ? ' active' : ''}`}
              onClick={() => onScreenChange(item.id)}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
          {STATIC_NAV.map((item) => (
            <button key={item.label} type="button" className="mn-nav-item" disabled title="Demo only">
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mn-sidebar-foot">
          <div className="mn-user-chip">
            <div className="mn-avatar" aria-hidden>
              {MOCK_USER.initials}
            </div>
            <div className="mn-user-meta">
              <span className="mn-user-name">
                {MOCK_USER.firstName} {MOCK_USER.lastName}
              </span>
              <span className="mn-user-role">{MOCK_USER.role}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="mn-main">
        <div className="mn-top">
          <h1 className="mn-page-title">{title}</h1>
          <div className="mn-demo-bar">
            <span className="mn-demo-pill">Design preview</span>
            <div className="mn-switcher" role="tablist" aria-label="Demo screen">
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={screen === item.id}
                  className={screen === item.id ? 'active' : ''}
                  onClick={() => onScreenChange(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mn-theme-picker" ref={pickerRef}>
              <button
                type="button"
                className="mn-btn secondary"
                aria-haspopup="listbox"
                aria-expanded={themeOpen}
                onClick={() => setThemeOpen((v) => !v)}
              >
                <span
                  className="mn-theme-swatch"
                  style={{ background: activeTheme.swatch }}
                  aria-hidden
                />
                Theme: {activeTheme.label}
              </button>
              {themeOpen && (
                <ul className="mn-theme-menu" role="listbox" aria-label="Demo themes">
                  {DEMO_THEMES.map((t) => (
                    <li key={t.id} role="option" aria-selected={theme === t.id}>
                      <button
                        type="button"
                        className={theme === t.id ? 'active' : ''}
                        onClick={() => {
                          onThemeChange(t.id);
                          setThemeOpen(false);
                        }}
                      >
                        <span className="mn-theme-swatch" style={{ background: t.swatch }} aria-hidden />
                        {t.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        <div className="mn-content">{children}</div>
      </div>
    </div>
  );
}
