import { Role } from '@prisma/client';
import {
  effectivePermissions,
  parseOverrides,
  Permission,
  PERMISSION_CATALOG,
  ROLE_DEFAULT_PERMISSIONS,
} from './permissions';

describe('parseOverrides', () => {
  it('reads grant and deny lists', () => {
    expect(
      parseOverrides({ grant: [Permission.ACCOUNTS_MANAGE], deny: [Permission.CODES_EDIT] }),
    ).toEqual({ grant: [Permission.ACCOUNTS_MANAGE], deny: [Permission.CODES_EDIT] });
  });

  it('treats a missing or malformed column as no overrides', () => {
    const empty = { grant: [], deny: [] };
    expect(parseOverrides(null)).toEqual(empty);
    expect(parseOverrides(undefined)).toEqual(empty);
    expect(parseOverrides('nonsense')).toEqual(empty);
    expect(parseOverrides({ grant: 'not-an-array' })).toEqual(empty);
  });

  it('discards keys that are not in the catalog', () => {
    expect(parseOverrides({ grant: ['store.invented.key', Permission.FRAMES_EDIT], deny: [] })).toEqual(
      { grant: [Permission.FRAMES_EDIT], deny: [] },
    );
  });

  it('de-duplicates repeated keys', () => {
    expect(
      parseOverrides({ grant: [Permission.CODES_EDIT, Permission.CODES_EDIT], deny: [] }).grant,
    ).toEqual([Permission.CODES_EDIT]);
  });
});

describe('effectivePermissions', () => {
  it('gives every role the store catalogs by default', () => {
    for (const role of Object.values(Role)) {
      const held = effectivePermissions(role, null);
      expect(held).toContain(Permission.LENS_PRICING_EDIT);
      expect(held).toContain(Permission.CONTACT_LENS_PRICING_EDIT);
      expect(held).toContain(Permission.FRAMES_EDIT);
      expect(held).toContain(Permission.CODES_EDIT);
    }
  });

  it('reserves account management for administrators', () => {
    expect(effectivePermissions(Role.ADMIN, null)).toContain(Permission.ACCOUNTS_MANAGE);
    for (const role of Object.values(Role).filter((r) => r !== Role.ADMIN)) {
      expect(effectivePermissions(role, null)).not.toContain(Permission.ACCOUNTS_MANAGE);
    }
  });

  it('revokes a capability the role would otherwise hold', () => {
    const held = effectivePermissions(Role.RECEPTIONIST, {
      grant: [],
      deny: [Permission.LENS_PRICING_EDIT],
    });
    expect(held).not.toContain(Permission.LENS_PRICING_EDIT);
    expect(held).toContain(Permission.FRAMES_EDIT);
  });

  it('grants a capability the role does not carry', () => {
    expect(
      effectivePermissions(Role.OPTICIAN, { grant: [Permission.ACCOUNTS_MANAGE], deny: [] }),
    ).toContain(Permission.ACCOUNTS_MANAGE);
  });

  it('resolves a key listed in both lists as denied', () => {
    expect(
      effectivePermissions(Role.DOCTOR, {
        grant: [Permission.CODES_EDIT],
        deny: [Permission.CODES_EDIT],
      }),
    ).not.toContain(Permission.CODES_EDIT);
  });

  it('never strips account management from an administrator', () => {
    expect(
      effectivePermissions(Role.ADMIN, { grant: [], deny: [Permission.ACCOUNTS_MANAGE] }),
    ).toContain(Permission.ACCOUNTS_MANAGE);
  });

  it('returns catalog keys only, with no duplicates', () => {
    const keys = PERMISSION_CATALOG.map((p) => p.key);
    const held = effectivePermissions(Role.ADMIN, {
      grant: [Permission.FRAMES_EDIT],
      deny: [],
    });
    expect(new Set(held).size).toBe(held.length);
    for (const key of held) expect(keys).toContain(key);
  });
});

describe('ROLE_DEFAULT_PERMISSIONS', () => {
  it('covers every role in the enum', () => {
    for (const role of Object.values(Role)) {
      expect(ROLE_DEFAULT_PERMISSIONS[role]).toBeDefined();
    }
  });
});
