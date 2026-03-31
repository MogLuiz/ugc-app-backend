import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * Protege rotas POST /internal/partners/* para operação manual (curl/Insomnia).
 * Nunca usar esta chave no frontend — apenas servidor ou cliente HTTP confiável.
 */
@Injectable()
export class InternalPartnerApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('INTERNAL_PARTNERS_API_KEY');
    if (expected == null || expected === '') {
      throw new ServiceUnavailableException(
        'INTERNAL_PARTNERS_API_KEY não está configurada no ambiente',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const raw = request.headers.authorization;
    if (raw == null || typeof raw !== 'string') {
      throw new UnauthorizedException('Authorization Bearer obrigatório');
    }

    const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
    if (!match) {
      throw new UnauthorizedException('Authorization deve ser Bearer');
    }

    const provided = match[1] ?? '';
    if (!this.timingSafeEqualUtf8(provided, expected)) {
      throw new ForbiddenException('Credencial inválida');
    }

    return true;
  }

  private timingSafeEqualUtf8(a: string, b: string): boolean {
    try {
      const bufA = Buffer.from(a, 'utf8');
      const bufB = Buffer.from(b, 'utf8');
      if (bufA.length !== bufB.length) {
        return false;
      }
      return timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }
}
