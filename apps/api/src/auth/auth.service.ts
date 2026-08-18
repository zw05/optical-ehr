import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { mergePreferences } from '../users/preferences';
import { effectivePermissions } from './permissions';

/**
 * Claims embedded in every access token. Attached to `request.user` by
 * JwtAuthGuard and consumed by controllers via the @CurrentUser() decorator.
 */
export interface JwtPayload {
  /** User id (UUID) of the signed-in staff member. */
  sub: string;
  /** Practice the user belongs to; every query is scoped by this. */
  practiceId: string;
  /** Application role: DOCTOR | TECHNICIAN | OPTICIAN | RECEPTIONIST | ADMIN. */
  role: string;
  email: string;
  /**
   * Effective capability keys, resolved from the account row by JwtAuthGuard on
   * every request. Not a token claim — it is never signed into the JWT, because
   * a revoked permission must not survive in a token the user already holds.
   */
  permissions?: string[];
}

/**
 * Local credential auth for development and as a controlled fallback.
 * In production, staff authenticate via Microsoft Entra ID (OIDC); the web app
 * exchanges the Entra token for an application session with the same JWT shape.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Verifies email + password against the stored bcrypt hash and, on success,
   * issues a short-lived (15 min) JWT and writes a LOGIN audit event.
   *
   * @param email    Staff email address (unique per user).
   * @param password Plain-text password from the login form.
   * @param ip       Caller IP, recorded in the audit trail.
   * @returns `{ accessToken, user }` for the web client to store in session.
   * @throws UnauthorizedException on unknown user, deactivated account, or bad password.
   */
  async login(email: string, password: string, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      practiceId: user.practiceId,
      role: user.role,
      email: user.email,
    };
    const accessToken = await this.jwt.signAsync(payload);

    await this.audit.log({
      practiceId: user.practiceId,
      actorId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      ip,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      preferences: mergePreferences(user.preferences),
      permissions: effectivePermissions(user.role, user.permissionOverrides),
    };
  }
}
