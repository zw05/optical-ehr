/**
 * Shared shape for staff UI/accessibility preferences stored on User.preferences.
 * Not PHI — theme, layout knobs, and a11y toggles only.
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

/** Partial tree accepted by PATCH /users/me/preferences. */
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

const SECTION_KEYS = Object.keys(DEFAULT_PREFERENCES) as (keyof UserPreferences)[];

/** Deep-merge a stored/partial prefs object over defaults. Unknown top-level keys are ignored. */
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
  // Clamp idle timeout into the HIPAA-safe 5–30 minute band.
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

/**
 * Merge a PATCH body into the current stored preferences (already merged over defaults).
 * Returns the full merged tree ready to persist.
 */
export function applyPreferencePatch(
  current: UserPreferences,
  patch: PartialUserPreferences,
): UserPreferences {
  const next = structuredClone(current);
  for (const key of SECTION_KEYS) {
    const section = patch[key];
    if (!section || typeof section !== 'object') continue;
    // Skip undefined so Nest DTO class fields do not wipe sibling keys.
    for (const [field, value] of Object.entries(section)) {
      if (value !== undefined) {
        (next[key] as Record<string, unknown>)[field] = value;
      }
    }
  }
  return mergePreferences(next);
}
