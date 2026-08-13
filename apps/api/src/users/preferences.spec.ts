import {
  applyPreferencePatch,
  DEFAULT_PREFERENCES,
  mergePreferences,
} from './preferences';

describe('mergePreferences', () => {
  it('returns defaults for null/invalid input', () => {
    expect(mergePreferences(null).appearance.theme).toBe('light');
    expect(mergePreferences('nope').exam.fieldColumns).toBe(2);
  });

  it('deep-merges known sections and ignores unknown top-level keys', () => {
    const merged = mergePreferences({
      appearance: { theme: 'dark', fontScale: 'xl' },
      unknown: { foo: 1 },
    });
    expect(merged.appearance.theme).toBe('dark');
    expect(merged.appearance.fontScale).toBe('xl');
    expect(merged.appearance.density).toBe(DEFAULT_PREFERENCES.appearance.density);
    expect(merged).not.toHaveProperty('unknown');
  });

  it('clamps idle timeout to 5–30 minutes', () => {
    expect(mergePreferences({ accessibility: { idleTimeoutMinutes: 2 } }).accessibility.idleTimeoutMinutes).toBe(5);
    expect(mergePreferences({ accessibility: { idleTimeoutMinutes: 99 } }).accessibility.idleTimeoutMinutes).toBe(30);
  });

  it('clamps sidebar width to 180–400 and rejects invalid modes', () => {
    expect(mergePreferences({ sidebar: { width: 50 } }).sidebar.width).toBe(180);
    expect(mergePreferences({ sidebar: { width: 999 } }).sidebar.width).toBe(400);
    expect(mergePreferences({ sidebar: { mode: 'floating' } }).sidebar.mode).toBe('expanded');
  });
});

describe('applyPreferencePatch', () => {
  it('patches a nested section without wiping siblings', () => {
    const current = structuredClone(DEFAULT_PREFERENCES);
    current.appearance.theme = 'dark';
    const next = applyPreferencePatch(current, { appearance: { fontScale: 'lg' } });
    expect(next.appearance.theme).toBe('dark');
    expect(next.appearance.fontScale).toBe('lg');
  });

  it('ignores undefined DTO fields so Nest class instances do not wipe siblings', () => {
    const current = structuredClone(DEFAULT_PREFERENCES);
    current.appearance.theme = 'slate';
    current.appearance.fontScale = 'lg';
    // Simulate Nest AppearanceDto with unset fields present as undefined.
    const nestLikePatch = {
      appearance: {
        theme: 'forest',
        fontScale: undefined,
        density: undefined,
        fontFamily: undefined,
      },
    };
    const next = applyPreferencePatch(current, nestLikePatch as never);
    expect(next.appearance.theme).toBe('forest');
    expect(next.appearance.fontScale).toBe('lg');
    expect(next.appearance.density).toBe('comfortable');
    expect(next.appearance.fontFamily).toBe('system');
  });
});
