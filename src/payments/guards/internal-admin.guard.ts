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
 * Protege endpoints exclusivos de administração interna da plataforma.
 * Usa a chave INTERNAL_ADMIN_API_KEY — nunca exposta no frontend.
 *
 * Uso: curl/Insomnia/painel interno da plataforma.
 */
@Injectable()
export class InternalAdminGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.configService.get<string>('INTERNAL_ADMIN_API_KEY');
    if (!expected) {
      throw new ServiceUnavailableException('INTERNAL_ADMIN_API_KEY não configurada');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const raw = request.headers.authorization;

    if (!raw || typeof raw !== 'string') {
      throw new UnauthorizedException('Authorization Bearer obrigatório');
    }

    const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
    if (!match) {
      throw new UnauthorizedException('Authorization deve ser Bearer');
    }

    const provided = match[1] ?? '';
    if (!this.timingSafeEqual(provided, expected)) {
      throw new ForbiddenException('Credencial inválida');
    }

    return true;
  }

  private timingSafeEqual(a: string, b: string): boolean {
    try {
      const bufA = Buffer.from(a, 'utf8');
      const bufB = Buffer.from(b, 'utf8');
      if (bufA.length !== bufB.length) return false;
      return timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }
}
