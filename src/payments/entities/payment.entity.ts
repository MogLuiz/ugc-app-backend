import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContractRequest } from '../../contract-requests/entities/contract-request.entity';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PayoutStatus } from '../enums/payout-status.enum';
import { SettlementStatus } from '../enums/settlement-status.enum';
import { CreatorPayout } from './creator-payout.entity';

@Entity('payments')
@Index('IDX_payments_company_user_id', ['companyUserId'])
@Index('IDX_payments_creator_user_id', ['creatorUserId'])
@Index('IDX_payments_status', ['status'])
@Index('IDX_payments_payout_status', ['payoutStatus'])
@Index('IDX_payments_external_payment_id', ['externalPaymentId'])
@Index('IDX_payments_external_reference', ['externalReference'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * MVP: 1 ContractRequest → 1 Payment.
   * Extensão futura: remover UNIQUE + adicionar PaymentAttempt para suportar retentativas.
   */
  @Column({ name: 'contract_request_id', type: 'uuid', unique: true })
  contractRequestId: string;

  @Column({ name: 'company_user_id', type: 'uuid' })
  companyUserId: string;

  @Column({ name: 'creator_user_id', type: 'uuid' })
  creatorUserId: string;

  /**
   * Snapshot financeiro congelado em centavos — copiado do ContractRequest na criação.
   * Nunca recalculado após criação.
   *
   * Invariantes garantidas por CHECK no banco:
   *   creator_net_service_amount_cents = service_gross_amount_cents - platform_fee_amount_cents
   *   creator_payout_amount_cents      = creator_net_service_amount_cents + transport_fee_amount_cents
   *   company_total_amount_cents       = service_gross_amount_cents + transport_fee_amount_cents
   */
  @Column({ name: 'service_gross_amount_cents', type: 'int' })
  serviceGrossAmountCents: number;

  @Column({ name: 'platform_fee_amount_cents', type: 'int' })
  platformFeeAmountCents: number;

  @Column({ name: 'creator_net_service_amount_cents', type: 'int' })
  creatorNetServiceAmountCents: number;

  @Column({ name: 'transport_fee_amount_cents', type: 'int' })
  transportFeeAmountCents: number;

  @Column({ name: 'creator_payout_amount_cents', type: 'int' })
  creatorPayoutAmountCents: number;

  @Column({ name: 'company_total_amount_cents', type: 'int' })
  companyTotalAmountCents: number;

  @Column({ type: 'varchar', length: 3, default: 'BRL' })
  currency: string;

  /** Status do pagamento no domínio da plataforma. */
  @Column({ name: 'status', type: 'varchar', length: 30, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  /**
   * Resumo operacional do repasse.
   * Fonte detalhada: tabela creator_payouts.
   */
  @Column({ name: 'payout_status', type: 'varchar', length: 30, default: PayoutStatus.NOT_DUE })
  payoutStatus: PayoutStatus;

  /**
   * Ciclo de vida financeiro do pagamento (ortogonal ao status de gateway).
   * HELD → aguardando resposta do creator.
   * APPLIED → creator aceitou, contrato em andamento.
   * CONVERTED_TO_CREDIT → virou crédito (rejeição ou expiração).
   * Nullable em pagamentos legados (anteriores a esta feature).
   */
  @Column({
    name: 'settlement_status',
    type: 'varchar',
    length: 30,
    nullable: true,
    default: null,
  })
  settlementStatus: SettlementStatus | null;

  /**
   * Crédito de saldo aplicado neste pagamento (em centavos).
   * 0 = nenhum crédito usado. > 0 = parte ou totalidade coberta por saldo.
   */
  @Column({ name: 'credit_applied_cents', type: 'int', default: 0 })
  creditAppliedCents: number;

  @Column({ name: 'gateway_name', type: 'varchar', length: 50, default: 'mercado_pago' })
  gatewayName: string;

  /** ID do pagamento no gateway (ex: ID do payment no Mercado Pago). */
  @Column({ name: 'external_payment_id', type: 'varchar', length: 100, nullable: true })
  externalPaymentId: string | null;

  /** ID da preference/intenção de pagamento no gateway. */
  @Column({ name: 'external_preference_id', type: 'varchar', length: 200, nullable: true })
  externalPreferenceId: string | null;

  /**
   * Nosso payment.id enviado ao gateway como external_reference.
   * Usado para conciliação: ao receber webhook, primeiro buscamos pelo externalReference,
   * depois pelo externalPaymentId como fallback.
   */
  @Column({ name: 'external_reference', type: 'varchar', length: 100, nullable: true })
  externalReference: string | null;

  @Column({ name: 'payment_method', type: 'varchar', length: 50, nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'int', nullable: true })
  installments: number | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  /** 'card' | 'pix' | 'credit' — null para pagamentos legados. */
  @Column({ name: 'payment_type', type: 'varchar', length: 10, nullable: true })
  paymentType: 'card' | 'pix' | 'credit' | null;

  /** Código EMV copia-e-cola do PIX (null para cartão). */
  @Column({ name: 'pix_copy_paste', type: 'text', nullable: true })
  pixCopyPaste: string | null;

  /** QR code como base64 PNG retornado pelo Mercado Pago (null para cartão). */
  @Column({ name: 'pix_qr_code_base64', type: 'text', nullable: true })
  pixQrCodeBase64: string | null;

  /** Data/hora de expiração do QR PIX (null para cartão). */
  @Column({ name: 'pix_expires_at', type: 'timestamptz', nullable: true })
  pixExpiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => ContractRequest)
  @JoinColumn({ name: 'contract_request_id' })
  contractRequest: ContractRequest;

  @OneToMany(() => CreatorPayout, (payout) => payout.payment)
  payouts: CreatorPayout[];
}
