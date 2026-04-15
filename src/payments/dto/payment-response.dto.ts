import { PaymentStatus } from '../enums/payment-status.enum';
import { PayoutStatus } from '../enums/payout-status.enum';

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
