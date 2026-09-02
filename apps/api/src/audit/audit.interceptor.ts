import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditAction } from '@prisma/client';
import { AuditService } from './audit.service';
import { AuthenticatedRequest } from '../auth/jwt-auth.guard';

const METHOD_ACTION: Record<string, AuditAction> = {
  POST: AuditAction.CREATE,
  PATCH: AuditAction.UPDATE,
  PUT: AuditAction.UPDATE,
  DELETE: AuditAction.DELETE,
  GET: AuditAction.READ,
};

/**
 * Global interceptor recording every authenticated API call that touches PHI.
 * Entity type is derived from the route; patient context from route params or
 * response payloads. Detail never contains clinical values, only identifiers.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  /**
   * Wraps every authenticated request. After the handler succeeds it writes
   * one audit row: the HTTP method maps to the action (POST→CREATE,
   * PATCH/PUT→UPDATE, DELETE→DELETE, GET→READ), the first URL segment names
   * the entity, and the patient id is pulled from route params or body.
   * Reads of non-PHI reference data (templates, inventory, store settings, etc.)
   * are skipped to keep the log focused on patient-record access; every write is
   * recorded regardless of entity.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) return next.handle(); // public endpoints handle their own auditing

    const action = METHOD_ACTION[request.method];
    if (!action) return next.handle();

    // /api/<entity>/... — first path segment names the entity domain
    const segments = request.path.replace(/^\/api\//, '').split('/');
    const entityType = segments[0] ?? 'unknown';
    // Skip read-audit noise for non-PHI reference data. Writes to these still
    // record: a price list or a permission grant is exactly the kind of change
    // the practice needs to be able to trace back to a person.
    const nonPhi = new Set([
      'auth',
      'inventory',
      'audit',
      'templates',
      'appointment-types',
      'accepted-payers',
      'pricing',
      'contact-lens-pricing',
      'codes',
      'practice',
      'users',
    ]);
    if (action === AuditAction.READ && nonPhi.has(entityType)) return next.handle();

    const entityId = segments[1] && !segments[1].includes('?') ? segments[1] : undefined;
    const patientId =
      (request.params?.patientId as string | undefined) ??
      (request.body?.patientId as string | undefined) ??
      (entityType === 'patients' ? entityId : undefined);

    return next.handle().pipe(
      tap(() => {
        void this.audit.log({
          practiceId: user.practiceId,
          actorId: user.sub,
          action,
          entityType,
          entityId,
          patientId,
          ip: request.ip,
          detail: `${request.method} ${request.path}`,
        });
      }),
    );
  }
}
