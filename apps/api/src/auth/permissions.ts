import { Role } from '@prisma/client';

/**
 * Capability keys layered on top of the coarse {@link Role} enum. Roles decide
 * what a job normally does; these keys let an administrator make exceptions for
 * one person without inventing a new role — revoking price editing from a
 * particular receptionist, say, or lending code maintenance to a technician.
 */
export const Permission = {
  STORE_PROFILE_EDIT: 'store.profile.edit',
  LENS_PRICING_EDIT: 'store.lensPricing.edit',
  CONTACT_LENS_PRICING_EDIT: 'store.contactLensPricing.edit',
  FRAMES_EDIT: 'store.frames.edit',
  CODES_EDIT: 'store.codes.edit',
  PAYERS_EDIT: 'store.payers.edit',
  ACCOUNTS_MANAGE: 'store.accounts.manage',
} as const;

export type PermissionKey = (typeof Permission)[keyof typeof Permission];

/** Catalog rendered by the account permissions screen. */
export const PERMISSION_CATALOG: {
  key: PermissionKey;
  label: string;
  description: string;
}[] = [
  {
    key: Permission.STORE_PROFILE_EDIT,
    label: 'Edit store profile',
    description: 'Store name, address, contact details, hours, and logo.',
  },
  {
    key: Permission.LENS_PRICING_EDIT,
    label: 'Edit spectacle lens pricing',
    description: 'Lens price lists, power bands, coatings and add-ons, and price imports.',
  },
  {
    key: Permission.CONTACT_LENS_PRICING_EDIT,
    label: 'Edit contact lens pricing',
    description: 'Contact lens products, supply pricing, and fitting fees.',
  },
  {
    key: Permission.FRAMES_EDIT,
    label: 'Edit frame catalog',
    description: 'Frame SKUs, measurements, cost and retail, and catalog imports.',
  },
  {
    key: Permission.CODES_EDIT,
    label: 'Edit code catalog',
    description: 'Diagnosis (ICD-10) and procedure (CPT/HCPCS) codes offered in exams.',
  },
  {
    key: Permission.PAYERS_EDIT,
    label: 'Edit accepted insurances',
    description: 'The accepted payer list with allowances, copays, and authorization flags.',
  },
  {
    key: Permission.ACCOUNTS_MANAGE,
    label: 'Manage staff accounts',
    description:
      'Create accounts, change roles, grant or revoke permissions, and deactivate staff.',
  },
];

const ALL_KEYS = PERMISSION_CATALOG.map((p) => p.key);

/**
 * What each role holds before any per-user override. Every signed-in role may
 * maintain the store catalogs — that is a front-of-house job, not an
 * administrative one — while account and permission management stays with
 * administrators.
 */
const STORE_KEYS = ALL_KEYS.filter((key) => key !== Permission.ACCOUNTS_MANAGE);

export const ROLE_DEFAULT_PERMISSIONS: Record<Role, PermissionKey[]> = {
  [Role.ADMIN]: ALL_KEYS,
  [Role.DOCTOR]: STORE_KEYS,
  [Role.OPTICIAN]: STORE_KEYS,
  [Role.TECHNICIAN]: STORE_KEYS,
  [Role.RECEPTIONIST]: STORE_KEYS,
};

/** Per-user departures from the role defaults, as stored on `User`. */
export interface PermissionOverrides {
  grant: PermissionKey[];
  deny: PermissionKey[];
}

function isKey(value: unknown): value is PermissionKey {
  return typeof value === 'string' && (ALL_KEYS as string[]).includes(value);
}

/** Reads the `permissionOverrides` JSON column, discarding unknown keys. */
export function parseOverrides(raw: unknown): PermissionOverrides {
  const source = (raw ?? {}) as { grant?: unknown; deny?: unknown };
  const pick = (value: unknown): PermissionKey[] =>
    Array.isArray(value) ? [...new Set(value.filter(isKey))] : [];
  return { grant: pick(source.grant), deny: pick(source.deny) };
}

/**
 * Resolves what a user may actually do: role defaults, plus explicit grants,
 * minus explicit denials. Administrators are never locked out of account
 * management, so a practice cannot strand itself without an administrator.
 */
export function effectivePermissions(role: Role, raw: unknown): PermissionKey[] {
  const { grant, deny } = parseOverrides(raw);
  const defaults = ROLE_DEFAULT_PERMISSIONS[role] ?? [];
  const granted = new Set<PermissionKey>([...defaults, ...grant]);
  for (const key of deny) granted.delete(key);
  if (role === Role.ADMIN) granted.add(Permission.ACCOUNTS_MANAGE);
  return ALL_KEYS.filter((key) => granted.has(key));
}
