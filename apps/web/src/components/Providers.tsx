'use client';

import type { ReactNode } from 'react';
import { PreferencesProvider } from '@/components/PreferencesProvider';

/** Client-side providers mounted from the root layout. */
export default function Providers({ children }: { children: ReactNode }) {
  return <PreferencesProvider>{children}</PreferencesProvider>;
}
