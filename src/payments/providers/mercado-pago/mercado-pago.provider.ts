import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import MercadoPago, { Payment as MpPayment, Preference } from 'mercadopago';
import { PaymentStatus } from '../../enums/payment-status.enum';
import {
  CreatePaymentIntentInput,
  IPaymentProvider,
  NormalizedPaymentStatus,
  ParsedWebhookEvent,
  PaymentIntentResult,
  PixPaymentResult,
  ProcessCardPaymentInput,
  ProcessPixPaymentInput,
} from '../payment-provider.interface';

// point_of_interaction e date_of_expiration já estão nos tipos do SDK v2.12.0
// (PaymentResponse em payment/commonTypes.d.ts). Nenhum cast extra necessário.

type MpWebhookPayload = {
  id?: number | string;
  type?: string;
  action?: string;
  data?: { id?: string | number };
};

/**
 * Implementação do IPaymentProvider para Mercado Pago.
 *
 * O domínio nunca importa este provider diretamente.
 * Injetar via token PAYMENT_PROVIDER.
 */
@Injectable()
export class MercadoPagoProvider implements IPaymentProvider {
  private readonly logger = new Logger(MercadoPagoProvider.name);
  private readonly client: MercadoPago;
  private readonly webhookSecret: string;
  private readonly publicKey: string;
  private readonly apiBaseUrl: string;
  private readonly frontendBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const accessToken = this.configService.get<string>('MP_ACCESS_TOKEN') ?? '';
    this.webhookSecret = this.configService.get<string>('MP_WEBHOOK_SECRET') ?? '';
    this.publicKey = this.configService.get<string>('MP_PUBLIC_KEY') ?? '';
    this.apiBaseUrl = this.configService.get<string>('API_BASE_URL') ?? '';
    this.frontendBaseUrl = this.configService.get<string>('FRONTEND_BASE_URL') ?? '';

    this.client = new MercadoPago({ accessToken });
  }

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult> {
    const preference = new Preference(this.client);

    const response = await preference.create({
      body: {
        items: [
          {
            id: input.contractRequestId,
            title: input.description,
            quantity: 1,
            unit_price: input.amountCents / 100,
            currency_id: 'BRL',
          },
        ],
        payer: {
          email: input.payerEmail,
        },
        external_reference: input.paymentId,
        back_urls: {
          success: input.callbackUrls.success,
          failure: input.callbackUrls.failure,
          pending: input.callbackUrls.pending,
        },
        notification_url: `${this.apiBaseUrl}/webhooks/mercado-pago`,
        statement_descriptor: 'UGC PLATAFORMA',
      },
    });

    return {
      preferenceId: response.id ?? '',
      externalReference: input.paymentId,
    };
  }

  async processCardPayment(input: ProcessCardPaymentInput): Promise<NormalizedPaymentStatus> {
    const paymentClient = new MpPayment(this.client);
    const mpPayment = await paymentClient.create({
      body: {
        transaction_amount: input.transactionAmount,
        token: input.token,
        payment_method_id: input.paymentMethodId,
        issuer_id: input.issuerId ? Number(input.issuerId) : undefined,
        installments: input.installments,
        external_reference: input.paymentId,
        payer: {
          email: input.payerEmail,
          ...(input.payerDocument && {
            identification: {
              type: input.payerDocument.type,
              number: input.payerDocument.number,
            },
          }),
        },
      },
    });

    return {
      status: this.mapMpStatus(mpPayment.status ?? ''),
      externalPaymentId: String(mpPayment.id ?? ''),
      externalReference: mpPayment.external_reference ?? null,
      paymentMethod: mpPayment.payment_method_id ?? null,
      installments: mpPayment.installments ?? null,
      paidAt: mpPayment.date_approved ? new Date(mpPayment.date_approved) : null,
      rawStatus: mpPayment.status ?? '',
    };
  }

  async processPixPayment(input: ProcessPixPaymentInput): Promise<PixPaymentResult> {
    const paymentClient = new MpPayment(this.client);

    // PIX expira em 30 minutos — explícito para controle da nossa lógica de retry.
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const mpPayment = await paymentClient.create({
      body: {
        transaction_amount: input.transactionAmount,
        payment_method_id: 'pix',
        external_reference: input.paymentId,
        date_of_expiration: expiresAt.toISOString(),
        payer: {
          email: input.payerEmail,
          ...(input.payerDocument && {
            identification: {
              type: input.payerDocument.type,
              number: input.payerDocument.number,
            },
          }),
        },
      } as Parameters<typeof paymentClient.create>[0]['body'],
    });

    const txData = mpPayment.point_of_interaction?.transaction_data;

    if (!txData?.qr_code) {
      this.logger.warn(
        `PIX criado sem qr_code: mpId=${mpPayment.id} status=${mpPayment.status} — pode ser limitação de sandbox ou credenciais de teste`,
      );
    }

    return {
      status: this.mapMpStatus(mpPayment.status ?? ''),
      externalPaymentId: String(mpPayment.id ?? ''),
      externalReference: mpPayment.external_reference ?? null,
      paymentMethod: 'pix',
      pixCopyPaste: txData?.qr_code ?? null,
      pixQrCodeBase64: txData?.qr_code_base64 ?? null,
      pixExpiresAt: mpPayment.date_of_expiration ? new Date(mpPayment.date_of_expiration) : expiresAt,
      rawStatus: mpPayment.status ?? '',
    };
  }

  async getPaymentStatus(externalPaymentId: string): Promise<NormalizedPaymentStatus> {
    const paymentClient = new MpPayment(this.client);
    const mpPayment = await paymentClient.get({ id: externalPaymentId });

    return {
      status: this.mapMpStatus(mpPayment.status ?? ''),
      externalPaymentId: String(mpPayment.id ?? externalPaymentId),
      externalReference: mpPayment.external_reference ?? null,
      paymentMethod: mpPayment.payment_method_id ?? null,
      installments: mpPayment.installments ?? null,
      paidAt: mpPayment.date_approved ? new Date(mpPayment.date_approved) : null,
      rawStatus: mpPayment.status ?? '',
    };
  }

  parseWebhookEvent(
    payload: unknown,
    _headers: Record<string, string>,
  ): Promise<ParsedWebhookEvent> {
    const body = payload as MpWebhookPayload;

    const notificationId = String(body.id ?? '');
    const mpPaymentId = String(body.data?.id ?? '');
    const eventType = body.action ?? body.type ?? 'unknown';

    if (!notificationId || !mpPaymentId) {
      throw new Error(
        `Webhook MP inválido: id=${notificationId}, data.id=${mpPaymentId}`,
      );
    }

    return Promise.resolve({
      eventType,
      externalEventId: notificationId,
      externalPaymentId: mpPaymentId,
      rawPayload: body as object,
    });
  }

  validateWebhookSignature(payload: unknown, headers: Record<string, string>): boolean {
    if (!this.webhookSecret) {
      this.logger.warn(
        'MP_WEBHOOK_SECRET não configurado — validação de assinatura desabilitada',
      );
      return true;
    }

    try {
      const xSignature = headers['x-signature'] ?? '';
      const xRequestId = headers['x-request-id'] ?? '';
      const body = payload as MpWebhookPayload;
      const dataId = String(body.data?.id ?? '');

      // Extrai ts e v1 do header x-signature
      const parts = Object.fromEntries(
        xSignature.split(',').map((p) => p.split('=') as [string, string]),
      );
      const ts = parts['ts'] ?? '';
      const v1 = parts['v1'] ?? '';

      if (!ts || !v1) return false;

      // Manifesto assinado: id:<data.id>;request-id:<x-request-id>;ts:<timestamp>;
      const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
      const hmac = createHmac('sha256', this.webhookSecret).update(manifest).digest('hex');

      return timingSafeEqual(Buffer.from(hmac), Buffer.from(v1));
    } catch (err) {
      this.logger.warn('Falha ao validar assinatura do webhook MP', err);
      return false;
    }
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  // ---------------------------------------------------------------------------
  // Mapeamento de status MP → domínio
  // ---------------------------------------------------------------------------

  private mapMpStatus(mpStatus: string): PaymentStatus {
    switch (mpStatus) {
      case 'approved':
        return PaymentStatus.PAID;
      case 'authorized':
        return PaymentStatus.AUTHORIZED;
      case 'in_process':
      case 'pending':
        return PaymentStatus.PROCESSING;
      case 'rejected':
        return PaymentStatus.FAILED;
      case 'cancelled':
        return PaymentStatus.CANCELED;
      case 'refunded':
        return PaymentStatus.REFUNDED;
      case 'charged_back':
        return PaymentStatus.PARTIALLY_REFUNDED;
      default:
        this.logger.warn(`Status MP desconhecido: ${mpStatus} — mapeado para PROCESSING`);
        return PaymentStatus.PROCESSING;
    }
  }
}
