import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';
import { JwtPayload } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

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
   * `request.user`. Rejects missing, malformed, or expired tokens with 401.
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
      select: { isActive: true },
    });
    if (!staff?.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }
    return true;
  }
}
