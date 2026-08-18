'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import AppShell from '@/components/AppShell';
import { api } from '@/lib/api';
import {
  cachePermissions,
  getPermissions,
  Permission,
  type PermissionKey,
} from '@/lib/permissions';

interface StoreLink {
  href: string;
  label: string;
  /** Hidden unless the signed-in user holds this capability. */
  requires?: PermissionKey;
}

/**
 * Store settings sections. Everything except accounts is open to any signed-in
 * role by default; an administrator can revoke individual sections per person,
 * at which point the link disappears here and the API refuses the write.
 */
const STORE_LINKS: StoreLink[] = [
  { href: '/settings/store', label: 'Store profile' },
  { href: '/settings/pricing', label: 'Lens pricing' },
  { href: '/settings/contact-lenses', label: 'Contact lenses' },
  { href: '/settings/frames', label: 'Frames' },
  { href: '/settings/codes', label: 'Codes' },
  { href: '/settings/insurance', label: 'Accepted insurances' },
  { href: '/settings/accounts', label: 'Accounts', requires: Permission.ACCOUNTS_MANAGE },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [permissions, setPermissions] = useState<string[]>(() => getPermissions());

  // Permissions can change while a session is open, so re-read them on entry to
  // settings rather than trusting what login cached.
  useEffect(() => {
    api<{ permissions: string[] }>('/users/me/permissions')
      .then((result) => {
        cachePermissions(result.permissions);
        setPermissions(result.permissions);
      })
      .catch(() => undefined);
  }, []);

  const visible = STORE_LINKS.filter(
    (link) => !link.requires || permissions.includes(link.requires),
  );
  const isStoreRoute = STORE_LINKS.some(
    (link) => pathname === link.href || pathname.startsWith(`${link.href}/`),
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
          className={`settings-subnav-link${!isStoreRoute ? ' active' : ''}`}
        >
          My preferences
        </Link>
        <span className="settings-subnav-group">
          <span className="settings-subnav-label">Store</span>
          {visible.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`settings-subnav-link${pathname === link.href ? ' active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </span>
      </nav>
      {children}
    </AppShell>
  );
}
