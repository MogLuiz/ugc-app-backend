import { PaymentStatus } from '../enums/payment-status.enum';
import { PayoutStatus } from '../enums/payout-status.enum';
import { SettlementStatus } from '../enums/settlement-status.enum';

export class InitiatePaymentResponseDto {
  paymentId: string;
  preferenceId: string;
  publicKey: string;
  grossAmountCents: number;
  platformFeeCents: number;
  creatorBaseAmountCents: number;
  transportFeeCents: number;
  creatorNetAmountCents: number;
  currency: string;
  /** Crédito de saldo aplicado (em centavos). 0 se não houver crédito. */
  creditAppliedCents: number;
  /** Valor a cobrar no gateway (gross - credit). 0 se 100% coberto por crédito. */
  remainderCents: number;
  /** true se o pagamento já foi confirmado (100% crédito, sem necessidade do Brick). */
  alreadyPaid: boolean;
}

export class PaymentResponseDto {
  id: string;
  contractRequestId: string;
  grossAmountCents: number;
  platformFeeCents: number;
  creatorBaseAmountCents: number;
  transportFeeCents: number;
  creatorNetAmountCents: number;
  currency: string;
  status: PaymentStatus;
  payoutStatus: PayoutStatus;
  gatewayName: string;
  paymentMethod: string | null;
  installments: number | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
