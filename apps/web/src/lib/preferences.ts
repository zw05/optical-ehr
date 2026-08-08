/**
 * Client-side mirror of apps/api/src/users/preferences.ts.
 * Keep shapes and defaults in sync with the API module.
 */

/** `light` renders as Paper and `dark` as Ink; both names are kept for stored values. */
export type ThemePreference =
  | 'light'
  | 'slate'
  | 'dark'
  | 'forest'
  | 'high-contrast'
  | 'system';
export type FontScale = 'sm' | 'md' | 'lg' | 'xl';
export type Density = 'compact' | 'comfortable';
export type FontFamilyPref = 'system' | 'serif' | 'dyslexic';
export type SidebarMode = 'expanded' | 'rail' | 'auto';

export const SIDEBAR_MIN_W = 180;
export const SIDEBAR_MAX_W = 400;
export const DEFAULT_SIDEBAR_W = 224;

export interface UserPreferences {
  appearance: {
    theme: ThemePreference;
    fontScale: FontScale;
    density: Density;
    fontFamily: FontFamilyPref;
  };
  sidebar: {
    mode: SidebarMode;
    width: number;
  };
  exam: {
    defaultTab: string;
    tabOrder: string[];
    hiddenTabs: string[];
    singlePageMode: boolean;
    fieldColumns: 1 | 2 | 3;
    stickyBanner: boolean;
    autoSaveSeconds: number | null;
  };
  dashboard: {
    panelOrder: string[];
    hiddenPanels: string[];
    landingRoute: string;
  };
  printing: {
    openInNewTab: boolean;
    copies: number;
  };
  accessibility: {
    reducedMotion: boolean;
    boldFocusRing: boolean;
    underlineLinks: boolean;
    idleTimeoutMinutes: number;
    idleWarningSeconds: number;
    announceSaves: boolean;
    keyboardShortcuts: boolean;
  };
}

export type PartialUserPreferences = {
  [K in keyof UserPreferences]?: Partial<UserPreferences[K]>;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  appearance: {
    theme: 'light',
    fontScale: 'md',
    density: 'comfortable',
    fontFamily: 'system',
  },
  sidebar: {
    mode: 'expanded',
    width: DEFAULT_SIDEBAR_W,
  },
  exam: {
    defaultTab: 'hpi',
    tabOrder: [],
    hiddenTabs: [],
    singlePageMode: false,
    fieldColumns: 2,
    stickyBanner: true,
    autoSaveSeconds: null,
  },
  dashboard: {
    panelOrder: [
      'patientFlow',
      'appointments',
      'unsignedEncounters',
      'myTasks',
      'orders',
      'recalls',
      'apptHistory',
    ],
    hiddenPanels: [],
    landingRoute: '/dashboard',
  },
  printing: {
    openInNewTab: true,
    copies: 1,
  },
  accessibility: {
    reducedMotion: false,
    boldFocusRing: false,
    underlineLinks: false,
    idleTimeoutMinutes: 15,
    idleWarningSeconds: 60,
    announceSaves: true,
    keyboardShortcuts: true,
  },
};

export const PREFS_STORAGE_KEY = 'ehr.prefs';

const SECTION_KEYS = Object.keys(DEFAULT_PREFERENCES) as (keyof UserPreferences)[];

/**
 * Clamp sidebar width to hard bounds (180–400) and optionally to 1/3 of the viewport
 * so a wide setting from a large monitor does not overwhelm a smaller screen.
 */
export function clampSidebarWidth(px: number, viewportWidth?: number): number {
  let w = Math.round(px);
  if (Number.isNaN(w)) w = DEFAULT_SIDEBAR_W;
  w = Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, w));
  if (typeof viewportWidth === 'number' && viewportWidth > 0) {
    const ceiling = Math.floor(viewportWidth / 3);
    if (ceiling >= SIDEBAR_MIN_W) {
      w = Math.min(w, ceiling);
    }
  }
  return w;
}

/** Deep-merge a stored/partial prefs object over defaults. */
export function mergePreferences(stored: unknown): UserPreferences {
  const result: UserPreferences = structuredClone(DEFAULT_PREFERENCES);
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return result;
  }
  const incoming = stored as Record<string, unknown>;
  for (const key of SECTION_KEYS) {
    const section = incoming[key];
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
    Object.assign(result[key], section);
  }
  const idle = result.accessibility.idleTimeoutMinutes;
  if (typeof idle !== 'number' || Number.isNaN(idle)) {
    result.accessibility.idleTimeoutMinutes = DEFAULT_PREFERENCES.accessibility.idleTimeoutMinutes;
  } else {
    result.accessibility.idleTimeoutMinutes = Math.min(30, Math.max(5, Math.round(idle)));
  }
  const warn = result.accessibility.idleWarningSeconds;
  if (typeof warn !== 'number' || Number.isNaN(warn) || warn < 15) {
    result.accessibility.idleWarningSeconds = DEFAULT_PREFERENCES.accessibility.idleWarningSeconds;
  } else {
    result.accessibility.idleWarningSeconds = Math.min(300, Math.round(warn));
  }
  const cols = result.exam.fieldColumns;
  if (cols !== 1 && cols !== 2 && cols !== 3) {
    result.exam.fieldColumns = 2;
  }
  const copies = result.printing.copies;
  if (typeof copies !== 'number' || copies < 1) {
    result.printing.copies = 1;
  } else {
    result.printing.copies = Math.min(5, Math.round(copies));
  }
  const sidebarMode = result.sidebar.mode;
  if (sidebarMode !== 'expanded' && sidebarMode !== 'rail' && sidebarMode !== 'auto') {
    result.sidebar.mode = DEFAULT_PREFERENCES.sidebar.mode;
  }
  const sidebarWidth = result.sidebar.width;
  if (typeof sidebarWidth !== 'number' || Number.isNaN(sidebarWidth)) {
    result.sidebar.width = DEFAULT_SIDEBAR_W;
  } else {
    result.sidebar.width = Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, Math.round(sidebarWidth)));
  }
  return result;
}

export function applyPreferencePatch(
  current: UserPreferences,
  patch: PartialUserPreferences,
): UserPreferences {
  const next = structuredClone(current);
  for (const key of SECTION_KEYS) {
    const section = patch[key];
    if (!section || typeof section !== 'object') continue;
    Object.assign(next[key], section);
  }
  return mergePreferences(next);
}

/** Persist prefs to localStorage for the pre-paint boot script. */
export function cachePreferences(prefs: UserPreferences) {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // private mode / quota — ignore
  }
}

/** Read cached prefs (or defaults) from localStorage. */
export function readCachedPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_PREFERENCES);
    return mergePreferences(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_PREFERENCES);
  }
}

/**
 * Apply preference-driven data attributes on <html> so CSS tokens take effect.
 * Safe to call from the browser only.
 */
export function applyPreferences(prefs: UserPreferences) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', prefs.appearance.theme);
  root.setAttribute('data-font-scale', prefs.appearance.fontScale);
  root.setAttribute('data-density', prefs.appearance.density);
  root.setAttribute('data-font-family', prefs.appearance.fontFamily);
  root.setAttribute('data-reduced-motion', prefs.accessibility.reducedMotion ? 'on' : 'off');
  root.setAttribute('data-focus-ring', prefs.accessibility.boldFocusRing ? 'bold' : 'default');
  root.setAttribute('data-underline-links', prefs.accessibility.underlineLinks ? 'on' : 'off');
  root.setAttribute('data-sidebar', prefs.sidebar.mode);
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : undefined;
  const width = clampSidebarWidth(prefs.sidebar.width, viewportW);
  root.style.setProperty('--sidebar-w', `${width}px`);
}
