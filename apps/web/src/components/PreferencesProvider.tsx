'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import {
  applyPreferencePatch,
  applyPreferences,
  cachePreferences,
  DEFAULT_PREFERENCES,
  mergePreferences,
  readCachedPreferences,
  type PartialUserPreferences,
  type UserPreferences,
} from '@/lib/preferences';

interface PreferencesContextValue {
  prefs: UserPreferences;
  update: (partial: PartialUserPreferences) => Promise<void>;
  reset: () => Promise<void>;
  saving: boolean;
  announce: (message: string) => void;
  announcement: string;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/**
 * Loads/persists staff UI preferences. Mounted inside AppShell so it stays
 * authenticated-only. Applies optimistically to DOM + localStorage, then PATCHes.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UserPreferences>(() => readCachedPreferences());
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    applyPreferences(prefs);
    cachePreferences(prefs);
  }, [prefs]);

  useEffect(() => {
    // Skip server sync on public pages (no JWT yet).
    if (typeof window === 'undefined') return;
    if (!sessionStorage.getItem('ehr.token')) return;

    let cancelled = false;
    api<UserPreferences>('/users/me/preferences')
      .then((server) => {
        if (cancelled) return;
        const merged = mergePreferences(server);
        setPrefs(merged);
      })
      .catch(() => {
        // keep cached prefs on network failure
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback(async (partial: PartialUserPreferences) => {
    const next = applyPreferencePatch(prefsRef.current, partial);
    setPrefs(next);
    applyPreferences(next);
    cachePreferences(next);
    setSaving(true);
    try {
      const saved = await api<UserPreferences>('/users/me/preferences', {
        method: 'PATCH',
        body: partial,
      });
      const merged = mergePreferences(saved);
      setPrefs(merged);
      cachePreferences(merged);
    } catch {
      // optimistic local state already applied; next successful load will reconcile
    } finally {
      setSaving(false);
    }
  }, []);

  const reset = useCallback(async () => {
    const defaults = structuredClone(DEFAULT_PREFERENCES);
    setPrefs(defaults);
    applyPreferences(defaults);
    cachePreferences(defaults);
    setSaving(true);
    try {
      const saved = await api<UserPreferences>('/users/me/preferences', {
        method: 'PATCH',
        body: defaults,
      });
      setPrefs(mergePreferences(saved));
    } catch {
      // keep defaults locally
    } finally {
      setSaving(false);
    }
  }, []);

  const announce = useCallback((message: string) => {
    setAnnouncement('');
    // Force a DOM change so screen readers re-announce identical strings.
    requestAnimationFrame(() => setAnnouncement(message));
  }, []);

  const value = useMemo(
    () => ({ prefs, update, reset, saving, announce, announcement }),
    [prefs, update, reset, saving, announce, announcement],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return ctx;
}

/** Optional hook for pages that may render outside AppShell (e.g. login). */
export function usePreferencesOptional(): PreferencesContextValue | null {
  return useContext(PreferencesContext);
}
