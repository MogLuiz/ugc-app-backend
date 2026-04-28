import { PaymentStatus } from '../enums/payment-status.enum';
import { PayoutStatus } from '../enums/payout-status.enum';
import { SettlementStatus } from '../enums/settlement-status.enum';

export class InitiatePaymentResponseDto {
  paymentId: string;
  preferenceId: string;
  publicKey: string;
  serviceGrossAmountCents: number;
  platformFeeAmountCents: number;
  creatorNetServiceAmountCents: number;
  transportFeeAmountCents: number;
  creatorPayoutAmountCents: number;
  companyTotalAmountCents: number;
  currency: string;
  creditAppliedCents: number;
  remainderCents: number;
  alreadyPaid: boolean;
}

export class PaymentResponseDto {
  id: string;
  contractRequestId: string;
  serviceGrossAmountCents: number;
  platformFeeAmountCents: number;
  creatorNetServiceAmountCents: number;
  transportFeeAmountCents: number;
  creatorPayoutAmountCents: number;
  companyTotalAmountCents: number;
  creditAppliedCents: number;
  currency: string;
  status: PaymentStatus;
  payoutStatus: PayoutStatus;
  settlementStatus: SettlementStatus | null;
  gatewayName: string;
  paymentMethod: string | null;
  installments: number | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  paymentType: string | null;
  pixCopyPaste: string | null;
  pixQrCodeBase64: string | null;
  pixExpiresAt: Date | null;
}
