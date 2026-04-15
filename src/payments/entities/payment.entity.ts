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
   * Snapshot financeiro congelado em centavos no momento da criação.
   * Nunca relido do ContractRequest — imutável após criação.
   *
   * Invariantes garantidas por CHECK no banco:
   *   creatorNetAmountCents = creatorBaseAmountCents + transportFeeCents
   *   grossAmountCents      = platformFeeCents + creatorBaseAmountCents + transportFeeCents
   */
  @Column({ name: 'gross_amount_cents', type: 'int' })
  grossAmountCents: number;

  @Column({ name: 'platform_fee_cents', type: 'int' })
  platformFeeCents: number;

  /** Valor do serviço do creator (sem frete). */
  @Column({ name: 'creator_base_amount_cents', type: 'int' })
  creatorBaseAmountCents: number;

  /** Taxa de deslocamento (frete). Zero para contratos remotos ou legados sem breakdown. */
  @Column({ name: 'transport_fee_cents', type: 'int' })
  transportFeeCents: number;

  /** creatorBaseAmountCents + transportFeeCents. Total devido ao creator. */
  @Column({ name: 'creator_net_amount_cents', type: 'int' })
  creatorNetAmountCents: number;

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
