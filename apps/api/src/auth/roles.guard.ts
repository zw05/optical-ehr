import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * Global authorization guard (registered as APP_GUARD after JwtAuthGuard).
 * Enforces the role list declared with @Roles() on each route.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /**
   * Passes when the route declares no roles, when the user is ADMIN, or when
   * the user's role is in the declared list; otherwise responds 403.
   */
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) return false;
    // ADMIN passes every role gate; clinical sign-off is additionally
    // restricted to DOCTOR inside the relevant services.
    if (user.role === Role.ADMIN) return true;
    if (!required.includes(user.role as Role)) {
      throw new ForbiddenException('Insufficient role for this action');
    }
    return true;
  }
}
