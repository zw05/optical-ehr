import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedRequest } from './jwt-auth.guard';
import { JwtPayload } from './auth.service';

/**
 * Parameter decorator that injects the authenticated user's token claims into
 * a controller method, e.g. `findOne(@CurrentUser() user: JwtPayload, ...)`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
