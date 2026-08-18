import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from './permissions';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Requires every listed capability, enforced by PermissionsGuard.
 * Complements @Roles(): use @Roles() for job-function gates (only doctors sign
 * exams) and this for capabilities an administrator can reassign per person.
 * Example: `@RequirePermission(Permission.LENS_PRICING_EDIT)`.
 */
export const RequirePermission = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
