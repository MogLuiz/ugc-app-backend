import { Controller, Headers, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import { Request } from 'express';
import { WebhooksService } from './webhooks.service';

/**
 * Endpoint público para receber notificações do Mercado Pago.
 * Não possui SupabaseAuthGuard — a segurança é feita via validação de assinatura HMAC.
 *
 * Sempre retorna 200 OK para evitar retry storm.
 * O processamento assíncrono é feito internamente com persistência confiável.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('mercado-pago')
  @HttpCode(200)
  async handleMercadoPago(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string>,
  ): Promise<{ received: boolean }> {
    const payload = req.body as unknown;
    await this.webhooksService.processWebhook(payload, headers);
    return { received: true };
  }
}
