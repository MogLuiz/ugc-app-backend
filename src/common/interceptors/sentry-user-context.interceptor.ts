import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { AuthUser } from '../interfaces/auth-user.interface';

@Injectable()
export class SentryUserContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const scope = Sentry.getCurrentScope();

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();

    if (req.user?.authUserId) {
      scope.setUser({ id: req.user.authUserId });
      scope.setTag('role', req.user.role ?? 'unknown');
    }

    const rawRid = req.headers['x-request-id'] ?? req.headers['x-railway-request-id'];
    const requestId = Array.isArray(rawRid) ? rawRid[0] : rawRid;
    if (requestId) {
      scope.setTag('request_id', String(requestId));
    }

    return next.handle().pipe(
      finalize(() => {
        Sentry.setUser(null);
        const endScope = Sentry.getCurrentScope();
        // removeTag não existe no Scope público; undefined é Primitive e o pipeline descarta na serialização.
        endScope.setTag('role', undefined);
        endScope.setTag('request_id', undefined);
      }),
    );
  }
}
