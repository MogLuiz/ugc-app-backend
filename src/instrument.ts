import { HttpException } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled:
    process.env.SENTRY_ENABLED !== 'false' &&
    !!process.env.SENTRY_DSN &&
    process.env.NODE_ENV !== 'test',
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  release:
    process.env.SENTRY_RELEASE ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    undefined,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  // Descarta apenas HttpException com status 4xx (erros esperados de API).
  beforeSend(event, hint) {
    const originalException = hint.originalException;
    if (originalException instanceof HttpException) {
      const status = originalException.getStatus();
      if (status >= 400 && status < 500) {
        return null;
      }
    }
    return event;
  },
  // Reduz ruído de probes Railway e checks internos.
  beforeSendTransaction(event) {
    const name = event.transaction ?? '';
    if (name.includes('/health')) {
      return null;
    }
    return event;
  },
});
