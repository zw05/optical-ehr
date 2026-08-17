'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import AppShell from '@/components/AppShell';

const PRACTICE_LINKS = [
  { href: '/settings/store', label: 'Store' },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPracticeRoute = PRACTICE_LINKS.some(
    (l) => pathname === l.href || pathname.startsWith(`${l.href}/`),
  );

  return (
    <AppShell>
      <div className="settings-header">
        <h1 className="page-header" style={{ margin: 0 }}>
          Settings
        </h1>
      </div>
      <nav className="settings-subnav" aria-label="Settings sections">
        <Link
          href="/settings"
          className={`settings-subnav-link${!isPracticeRoute ? ' active' : ''}`}
        >
          My preferences
        </Link>
        <span className="settings-subnav-group">
          <span className="settings-subnav-label">Practice</span>
          {PRACTICE_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`settings-subnav-link${pathname === l.href ? ' active' : ''}`}
            >
              {l.label}
            </Link>
          ))}
        </span>
      </nav>
      {children}
    </AppShell>
  );
}
