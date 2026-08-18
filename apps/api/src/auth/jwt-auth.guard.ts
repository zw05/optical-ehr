import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JwtPayload } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { effectivePermissions } from './permissions';

/** Express request with the decoded token claims attached after authentication. */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

/**
 * Global authentication guard (registered as APP_GUARD in AppModule).
 * Runs on every request before controllers.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Allows @Public() routes through untouched; otherwise verifies the
   * `Authorization: Bearer <jwt>` header and attaches the decoded payload to
   * `request.user`, refreshed with the account's current role and effective
   * permissions. Rejects missing, malformed, or expired tokens with 401, and
   * deactivated accounts with 401 on their next call.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    try {
      request.user = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const staff = await this.prisma.user.findUnique({
      where: { id: request.user.sub },
      select: { isActive: true, role: true, permissionOverrides: true },
    });
    if (!staff?.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }
    // Role and capabilities come from the row, not the token, so an
    // administrator's change lands on the next request instead of the next login.
    request.user.role = staff.role;
    request.user.permissions = effectivePermissions(staff.role, staff.permissionOverrides);
    return true;
  }
}
