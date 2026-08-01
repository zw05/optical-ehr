import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the listed roles, enforced by RolesGuard.
 * ADMIN always passes; routes without this decorator allow any signed-in user.
 * Example: `@Roles(Role.DOCTOR)` on the encounter sign endpoint.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
