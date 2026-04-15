import { PaymentStatus } from '../enums/payment-status.enum';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface CreatePaymentIntentInput {
  /** Nosso payment.id interno — enviado ao gateway como external_reference para conciliação. */
  paymentId: string;
  amountCents: number;
  currency: string;
  payerEmail: string;
  description: string;
  contractRequestId: string;
  callbackUrls: {
    success: string;
    failure: string;
    pending: string;
  };
}

export interface PaymentIntentResult {
  /** ID da preference/intenção gerada pelo gateway. Usado pelo Brick no frontend. */
  preferenceId: string;
  /**
   * Nosso payment.id, ecoado de volta.
   * Confirma que o gateway registrou o external_reference corretamente.
   */
  externalReference: string;
}

export interface NormalizedPaymentStatus {
  status: PaymentStatus;
  externalPaymentId: string;
  /**
   * external_reference devolvido pelo gateway — deve corresponder ao nosso payment.id.
   * Usado para conciliação: busca Payment por externalReference primeiro.
   */
  externalReference: string | null;
  paymentMethod: string | null;
  installments: number | null;
  paidAt: Date | null;
  /** Status original do gateway — preservado para auditoria. */
  rawStatus: string;
}

export interface ParsedWebhookEvent {
  eventType: string;
  /** ID único do evento — usado para idempotência (UNIQUE constraint). */
  externalEventId: string;
  /** ID do pagamento no gateway — usado para buscar detalhes via API. */
  externalPaymentId: string;
  rawPayload: object;
}

export interface ProcessCardPaymentInput {
  /** Nosso payment.id interno. */
  paymentId: string;
  /** Token do cartão gerado pelo Brick. */
  token: string;
  paymentMethodId: string;
  issuerId: string | null;
  installments: number;
  transactionAmount: number;
  payerEmail: string;
  payerDocument: { type: string; number: string } | null;
}

export interface IPaymentProvider {
  createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntentResult>;
  processCardPayment(input: ProcessCardPaymentInput): Promise<NormalizedPaymentStatus>;
  getPaymentStatus(externalPaymentId: string): Promise<NormalizedPaymentStatus>;
  parseWebhookEvent(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<ParsedWebhookEvent>;
  validateWebhookSignature(payload: unknown, headers: Record<string, string>): boolean;
}
