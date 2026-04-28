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
import {
  formatStructuredLog,
  sanitizeMercadoPagoApiError,
  sanitizeMercadoPagoPayment,
} from './mercado-pago-logging.util';

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
  private readonly nodeEnv: string;
  private readonly statementDescriptor: string;

  constructor(private readonly configService: ConfigService) {
    const accessToken = this.configService.get<string>('MP_ACCESS_TOKEN') ?? '';
    this.webhookSecret = this.configService.get<string>('MP_WEBHOOK_SECRET') ?? '';
    this.publicKey = this.configService.get<string>('MP_PUBLIC_KEY') ?? '';
    this.apiBaseUrl = this.configService.get<string>('API_BASE_URL') ?? '';
    this.frontendBaseUrl = this.configService.get<string>('FRONTEND_BASE_URL') ?? '';
    this.nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';
    this.statementDescriptor = this.normalizeStatementDescriptor(
      this.configService.get<string>('MP_STATEMENT_DESCRIPTOR') ?? 'UGC LOCAL',
    );

    this.client = new MercadoPago({ accessToken });
  }

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult> {
    const preference = new Preference(this.client);
    const notificationUrl = `${this.apiBaseUrl}/webhooks/mercado-pago`;

    this.assertMercadoPagoUrl('notification_url', notificationUrl);
    this.assertMercadoPagoUrl('back_urls.success', input.callbackUrls.success);
    this.assertMercadoPagoUrl('back_urls.failure', input.callbackUrls.failure);
    this.assertMercadoPagoUrl('back_urls.pending', input.callbackUrls.pending);

    const response = await preference.create({
      body: {
        items: [
          {
            id: input.item.id,
            title: input.item.title,
            description: input.item.description,
            category_id: input.item.categoryId,
            quantity: input.item.quantity,
            unit_price: input.item.unitPrice,
            currency_id: input.currency,
          },
        ],
        payer: {
          email: input.payerEmail,
          ...(input.payerFirstName ? { first_name: input.payerFirstName } : {}),
          ...(input.payerLastName ? { last_name: input.payerLastName } : {}),
        },
        external_reference: input.paymentId,
        back_urls: {
          success: input.callbackUrls.success,
          failure: input.callbackUrls.failure,
          pending: input.callbackUrls.pending,
        },
        notification_url: notificationUrl,
        statement_descriptor: this.statementDescriptor,
      },
    });

    this.logger.log(
      formatStructuredLog('mercado_pago.preference.created', {
        paymentId: input.paymentId,
        contractRequestId: input.contractRequestId,
        preferenceId: response.id ?? null,
        externalReference: response.external_reference ?? input.paymentId,
        transactionAmount: input.amountCents / 100,
      }),
    );

    return {
      preferenceId: response.id ?? '',
      externalReference: input.paymentId,
    };
  }

  async processCardPayment(input: ProcessCardPaymentInput): Promise<NormalizedPaymentStatus> {
    const paymentClient = new MpPayment(this.client);
    try {
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

      this.logger.log(
        formatStructuredLog(
          'mercado_pago.card.payment_response',
          sanitizeMercadoPagoPayment(mpPayment, {
            paymentId: input.paymentId,
          }),
        ),
      );

      return this.normalizePaymentStatus(mpPayment);
    } catch (error) {
      this.logger.error(
        formatStructuredLog(
          'mercado_pago.card.payment_error',
          sanitizeMercadoPagoApiError(error, {
            paymentId: input.paymentId,
            paymentMethodId: input.paymentMethodId,
            installments: input.installments,
            transactionAmount: input.transactionAmount,
          }),
        ),
      );
      throw error;
    }
  }

  async processPixPayment(input: ProcessPixPaymentInput): Promise<PixPaymentResult> {
    const paymentClient = new MpPayment(this.client);

    // PIX expira em 30 minutos — explícito para controle da nossa lógica de retry.
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    try {
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

      this.logger.log(
        formatStructuredLog(
          'mercado_pago.pix.payment_response',
          sanitizeMercadoPagoPayment(mpPayment, {
            paymentId: input.paymentId,
          }),
        ),
      );

      if (!txData?.qr_code) {
        this.logger.warn(
          formatStructuredLog(
            'mercado_pago.pix.qr_code_missing',
            sanitizeMercadoPagoPayment(mpPayment, {
              paymentId: input.paymentId,
            }),
          ),
        );
      }

      return {
        ...this.normalizePaymentStatus(mpPayment),
        paymentMethod: 'pix',
        pixCopyPaste: txData?.qr_code ?? null,
        pixQrCodeBase64: txData?.qr_code_base64 ?? null,
        pixExpiresAt: mpPayment.date_of_expiration ? new Date(mpPayment.date_of_expiration) : expiresAt,
      };
    } catch (error) {
      this.logger.error(
        formatStructuredLog(
          'mercado_pago.pix.payment_error',
          sanitizeMercadoPagoApiError(error, {
            paymentId: input.paymentId,
            paymentMethodId: 'pix',
            transactionAmount: input.transactionAmount,
          }),
        ),
      );
      throw error;
    }
  }

  async getPaymentStatus(externalPaymentId: string): Promise<NormalizedPaymentStatus> {
    const paymentClient = new MpPayment(this.client);
    try {
      const mpPayment = await paymentClient.get({ id: externalPaymentId });

      this.logger.log(
        formatStructuredLog(
          'mercado_pago.payment_status.response',
          sanitizeMercadoPagoPayment(mpPayment, {
            externalPaymentId,
          }),
        ),
      );

      return this.normalizePaymentStatus(mpPayment, externalPaymentId);
    } catch (error) {
      this.logger.error(
        formatStructuredLog(
          'mercado_pago.payment_status.error',
          sanitizeMercadoPagoApiError(error, {
            externalPaymentId,
          }),
        ),
      );
      throw error;
    }
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

  private normalizeStatementDescriptor(value: string): string {
    const normalized = value.trim().replace(/\s+/g, ' ');
    const fallback = 'UGC LOCAL';

    if (!normalized) {
      return fallback;
    }

    return normalized.slice(0, 13);
  }

  private assertMercadoPagoUrl(field: string, value: string): void {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(`Mercado Pago ${field} inválida: ${value}`);
    }

    if (this.nodeEnv !== 'production') {
      return;
    }

    const hostname = parsed.hostname.toLowerCase();
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local');

    if (parsed.protocol !== 'https:' || isLocalhost) {
      throw new Error(`Mercado Pago ${field} deve usar HTTPS público em produção: ${value}`);
    }
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

  private normalizePaymentStatus(
    mpPayment: {
      id?: string | number | null;
      external_reference?: string | null;
      payment_method_id?: string | null;
      payment_type_id?: string | null;
      issuer_id?: string | number | null;
      installments?: number | null;
      date_approved?: string | null;
      status?: string | null;
      status_detail?: string | null;
      transaction_amount?: number | null;
      live_mode?: boolean | null;
      transaction_details?: unknown;
    },
    fallbackExternalPaymentId?: string,
  ): NormalizedPaymentStatus {
    const transactionDetails =
      typeof mpPayment.transaction_details === 'object' && mpPayment.transaction_details !== null
        ? mpPayment.transaction_details as Record<string, unknown>
        : null;

    return {
      status: this.mapMpStatus(mpPayment.status ?? ''),
      externalPaymentId: String(mpPayment.id ?? fallbackExternalPaymentId ?? ''),
      externalReference: mpPayment.external_reference ?? null,
      paymentMethod: mpPayment.payment_method_id ?? null,
      installments: mpPayment.installments ?? null,
      paidAt: mpPayment.date_approved ? new Date(mpPayment.date_approved) : null,
      rawStatus: mpPayment.status ?? '',
      statusDetail: mpPayment.status_detail ?? null,
      paymentTypeId: mpPayment.payment_type_id ?? null,
      issuerId: mpPayment.issuer_id != null ? String(mpPayment.issuer_id) : null,
      transactionAmount: mpPayment.transaction_amount ?? null,
      liveMode: mpPayment.live_mode ?? null,
      authorizationCode:
        typeof transactionDetails?.authorization_code === 'string'
          ? transactionDetails.authorization_code
          : null,
    };
  }
}
