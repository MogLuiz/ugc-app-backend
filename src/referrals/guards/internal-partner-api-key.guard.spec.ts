import { ConfigService } from '@nestjs/config';
import { ExecutionContext, UnauthorizedException, ServiceUnavailableException, ForbiddenException } from '@nestjs/common';
import { InternalPartnerApiKeyGuard } from './internal-partner-api-key.guard';

function mockContext(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as ExecutionContext;
}

describe('InternalPartnerApiKeyGuard', () => {
  it('throws ServiceUnavailableException when key is not configured', () => {
    const guard = new InternalPartnerApiKeyGuard({
      get: () => undefined,
    } as unknown as ConfigService);

    expect(() => guard.canActivate(mockContext('Bearer x'))).toThrow(ServiceUnavailableException);
  });

  it('throws UnauthorizedException when Authorization is missing', () => {
    const guard = new InternalPartnerApiKeyGuard({
      get: () => 'secret',
    } as unknown as ConfigService);

    expect(() => guard.canActivate(mockContext(undefined))).toThrow(UnauthorizedException);
  });

  it('returns true when Bearer matches configured key', () => {
    const guard = new InternalPartnerApiKeyGuard({
      get: () => 'my-secret-key',
    } as unknown as ConfigService);

    expect(guard.canActivate(mockContext('Bearer my-secret-key'))).toBe(true);
  });

  it('throws ForbiddenException when Bearer does not match', () => {
    const guard = new InternalPartnerApiKeyGuard({
      get: () => 'expected',
    } as unknown as ConfigService);

    expect(() => guard.canActivate(mockContext('Bearer wrong'))).toThrow(ForbiddenException);
  });
});
