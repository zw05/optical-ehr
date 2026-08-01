'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearSession, getSessionUser, getToken, SessionUser } from '@/lib/api';
import { usePreferences } from '@/components/PreferencesProvider';

type NavIcon =
  | 'dashboard'
  | 'patients'
  | 'schedule'
  | 'exams'
  | 'orders'
  | 'recalls'
  | 'inventory'
  | 'insurance'
  | 'audit'
  | 'settings'
  | 'logoff';

const NAV_ITEMS: {
  href: string;
  label: string;
  icon: NavIcon;
  roles?: SessionUser['role'][];
}[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/patients', label: 'Patients', icon: 'patients' },
  { href: '/schedule', label: 'Schedule', icon: 'schedule' },
  { href: '/exams', label: 'Exams', icon: 'exams', roles: ['TECHNICIAN', 'DOCTOR'] },
  { href: '/orders', label: 'Orders', icon: 'orders' },
  { href: '/recalls', label: 'Recalls', icon: 'recalls' },
  { href: '/insurance', label: 'Insurance', icon: 'insurance' },
  { href: '/inventory', label: 'Inventory', icon: 'inventory', roles: ['OPTICIAN', 'ADMIN'] },
  { href: '/audit', label: 'Audit', icon: 'audit', roles: ['ADMIN'] },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

function NavIconSvg({ name }: { name: NavIcon }) {
  const props = {
    width: 22,
    height: 22,
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
    case 'schedule':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      );
    case 'exams':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
        </svg>
      );
    case 'orders':
      return (
        <svg {...props}>
          <circle cx="8" cy="12" r="3.5" />
          <circle cx="16" cy="12" r="3.5" />
          <path d="M11.5 12h1" />
          <path d="M5.5 9.5 4 7M18.5 9.5 20 7" />
        </svg>
      );
    case 'recalls':
      return (
        <svg {...props}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.7 1.7 0 0 0 3.4 0" />
        </svg>
      );
    case 'inventory':
      return (
        <svg {...props}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      );
    case 'insurance':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
          <path d="M7 15h4" />
          <circle cx="16.5" cy="15" r="1.5" />
        </svg>
      );
    case 'audit':
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    case 'logoff':
      return (
        <svg {...props}>
          <path d="M12 2v10" />
          <path d="M6.3 5.7a8 8 0 1 0 11.4 0" />
        </svg>
      );
  }
}

function ShellChrome({ children, user }: { children: ReactNode; user: SessionUser }) {
  const router = useRouter();
  const pathname = usePathname();
  const { prefs, announcement, announce } = usePreferences();
  const [idleSecondsLeft, setIdleSecondsLeft] = useState<number | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningActiveRef = useRef(false);
  const logoutRef = useRef<() => void>(() => undefined);

  const idleMinutes = Math.min(30, Math.max(5, prefs.accessibility.idleTimeoutMinutes));
  const warnSeconds = Math.min(300, Math.max(15, prefs.accessibility.idleWarningSeconds));
  const idleLimitMs = idleMinutes * 60 * 1000;
  const warnAtMs = Math.max(0, idleLimitMs - warnSeconds * 1000);

  const logout = useCallback(() => {
    clearSession();
    router.replace('/login');
  }, [router]);

  logoutRef.current = logout;

  const clearIdleTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warnTimerRef.current) clearInterval(warnTimerRef.current);
    idleTimerRef.current = null;
    warnTimerRef.current = null;
  }, []);

  const scheduleIdle = useCallback(() => {
    clearIdleTimers();
    warningActiveRef.current = false;
    setIdleSecondsLeft(null);

    idleTimerRef.current = setTimeout(() => {
      warningActiveRef.current = true;
      setIdleSecondsLeft(warnSeconds);
      announce(`You will be signed out in ${warnSeconds} seconds due to inactivity`);
      warnTimerRef.current = setInterval(() => {
        setIdleSecondsLeft((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            if (warnTimerRef.current) clearInterval(warnTimerRef.current);
            logoutRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, warnAtMs);
  }, [announce, clearIdleTimers, warnAtMs, warnSeconds]);

  const staySignedIn = useCallback(() => {
    warningActiveRef.current = false;
    setIdleSecondsLeft(null);
    announce('Session extended');
    scheduleIdle();
  }, [announce, scheduleIdle]);

  useEffect(() => {
    scheduleIdle();
    function reset() {
      if (warningActiveRef.current) return;
      scheduleIdle();
    }
    const events = ['mousemove', 'keydown', 'click', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      clearIdleTimers();
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [scheduleIdle, clearIdleTimers]);

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(user.role) || user.role === 'ADMIN',
  );

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();

  function handleLogOff() {
    clearSession();
    router.replace('/login');
  }

  return (
    <div className="shell">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-brand-mark" aria-hidden>
            O
          </span>
          Optical EHR
        </div>
        <nav className="topbar-nav" aria-label="Main">
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`topbar-item${pathname.startsWith(item.href) ? ' active' : ''}`}
            >
              <NavIconSvg name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="topbar-foot">
          <button type="button" className="topbar-item" onClick={handleLogOff}>
            <NavIconSvg name="logoff" />
            <span>Log Off</span>
          </button>
          <Link href="/settings" className="topbar-user" title="Open settings">
            <div className="topbar-avatar" aria-hidden>
              {initials || '?'}
            </div>
            <div className="topbar-user-meta">
              <span className="topbar-user-name">
                {user.firstName} {user.lastName}
              </span>
              <span className="topbar-user-role">{user.role}</span>
            </div>
          </Link>
        </div>
      </header>
      <main id="main-content" className="main" tabIndex={-1}>
        {children}
      </main>
      <div className="live-region" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {idleSecondsLeft !== null && (
        <div className="idle-dialog-backdrop" role="presentation">
          <div
            className="idle-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="idle-title"
            aria-describedby="idle-desc"
          >
            <h2 id="idle-title">Still there?</h2>
            <p id="idle-desc">
              You will be signed out in <strong>{idleSecondsLeft}</strong> second
              {idleSecondsLeft === 1 ? '' : 's'} due to inactivity (HIPAA automatic logoff).
            </p>
            <div className="idle-dialog-actions">
              <button type="button" onClick={staySignedIn}>
                I&apos;m still here
              </button>
              <button type="button" className="secondary" onClick={logout}>
                Sign out now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Authenticated app chrome: left sidebar nav filtered by role, user chip,
 * log-off, preference-driven idle logout, and accessibility live region.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUser(getSessionUser());
  }, [router]);

  if (!user) return null;

  return <ShellChrome user={user}>{children}</ShellChrome>;
}
