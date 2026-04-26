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
import { User } from '../../users/entities/user.entity';
import { JobType } from '../../job-types/entities/job-type.entity';
import { JobMode } from '../../common/enums/job-mode.enum';
import { ContractRequestStatus } from '../../common/enums/contract-request-status.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { Review } from '../../reviews/entities/review.entity';
import { LegalAcceptance } from '../../legal/entities/legal-acceptance.entity';

const decimalTransformer = {
  to: (value?: number | null) => value ?? null,
  from: (value: string | null) => (value == null ? null : parseFloat(value)),
};

@Entity('contract_requests')
@Index('IDX_contract_requests_company_created_at', ['companyUserId', 'createdAt'])
@Index('IDX_contract_requests_company_status_created_at', [
  'companyUserId',
  'status',
  'createdAt',
])
@Index('IDX_contract_requests_creator_status_starts_at', [
  'creatorUserId',
  'status',
  'startsAt',
])
@Index('IDX_contract_requests_job_type_id', ['jobTypeId'])
export class ContractRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_user_id', type: 'uuid' })
  companyUserId: string;

  @Column({ name: 'creator_user_id', type: 'uuid' })
  creatorUserId: string;

  @Column({ name: 'job_type_id', type: 'uuid' })
  jobTypeId: string;

  @Column({ type: 'enum', enum: JobMode })
  mode: JobMode;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: ContractRequestStatus,
    default: ContractRequestStatus.PENDING_ACCEPTANCE,
  })
  status: ContractRequestStatus;

  @Column({
    name: 'payment_status',
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  paymentStatus: PaymentStatus;

  @Column({ type: 'varchar', length: 3, default: 'BRL' })
  currency: string;

  @Column({ name: 'terms_accepted_at', type: 'timestamptz' })
  termsAcceptedAt: Date;

  @Column({ name: 'hiring_terms_version', type: 'varchar', length: 50, nullable: true })
  hiringTermsVersion: string | null;

  @Column({ name: 'hiring_terms_accepted_at', type: 'timestamptz', nullable: true })
  hiringTermsAcceptedAt: Date | null;

  @Column({ name: 'hiring_terms_acceptance_id', type: 'uuid', nullable: true })
  hiringTermsAcceptanceId: string | null;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'duration_minutes', type: 'int' })
  durationMinutes: number;

  @Column({ name: 'location_address', type: 'text' })
  jobAddress: string;

  @Column({ name: 'job_formatted_address', type: 'varchar', length: 500, nullable: true })
  jobFormattedAddress: string | null;

  @Column({
    name: 'location_lat',
    type: 'decimal',
    precision: 10,
    scale: 7,
    transformer: decimalTransformer,
  })
  jobLatitude: number;

  @Column({
    name: 'location_lng',
    type: 'decimal',
    precision: 10,
    scale: 7,
    transformer: decimalTransformer,
  })
  jobLongitude: number;

  @Column({
    name: 'distance_km',
    type: 'decimal',
    precision: 8,
    scale: 2,
    transformer: decimalTransformer,
  })
  distanceKm: number;

  @Column({
    name: 'effective_service_radius_km_used',
    type: 'decimal',
    precision: 8,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  effectiveServiceRadiusKmUsed: number | null;

  @Column({ name: 'service_gross_amount_cents', type: 'int' })
  serviceGrossAmountCents: number;

  @Column({ name: 'platform_fee_bps_snapshot', type: 'int' })
  platformFeeBpsSnapshot: number;

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

  @Column({
    name: 'transport_price_per_km_used',
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  transportPricePerKmUsed: number;

  @Column({
    name: 'transport_minimum_fee_used',
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: decimalTransformer,
  })
  transportMinimumFeeUsed: number;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'creator_name_snapshot', type: 'varchar', length: 255 })
  creatorNameSnapshot: string;

  @Column({
    name: 'creator_avatar_url_snapshot',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  creatorAvatarUrlSnapshot: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'open_offer_id', type: 'uuid', nullable: true })
  openOfferId: string | null;

  /**
   * Data limite para o creator responder ao convite.
   * Calculado em criação como: now() + INVITE_EXPIRY_HOURS.
   * Nullable para contratos legados e contratos de oferta aberta (ACCEPTED direto).
   */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @ManyToOne(() => LegalAcceptance, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'hiring_terms_acceptance_id' })
  hiringTermsAcceptance?: LegalAcceptance | null;

  // ─── Campos de confirmação bilateral de conclusão ────────────────────────────

  /** Quando o creator confirmou que o serviço foi realizado. */
  @Column({ name: 'creator_confirmed_completed_at', type: 'timestamptz', nullable: true })
  creatorConfirmedCompletedAt: Date | null;

  /** Quando a empresa confirmou que o serviço foi realizado. */
  @Column({ name: 'company_confirmed_completed_at', type: 'timestamptz', nullable: true })
  companyConfirmedCompletedAt: Date | null;

  /**
   * Prazo de 48h para o lado que ainda não confirmou reagir após a primeira confirmação.
   * Null enquanto nenhuma das partes tiver confirmado.
   * Quando expirado com ≥1 confirmação, o cron auto-conclui o contrato.
   */
  @Column({ name: 'contest_deadline_at', type: 'timestamptz', nullable: true })
  contestDeadlineAt: Date | null;

  /** Motivo da disputa de conclusão (quando status = COMPLETION_DISPUTE). */
  @Column({ name: 'completion_dispute_reason', type: 'text', nullable: true })
  completionDisputeReason: string | null;

  /** Quando a disputa de conclusão foi aberta. */
  @Column({ name: 'completion_disputed_at', type: 'timestamptz', nullable: true })
  completionDisputedAt: Date | null;

  /** Usuário que abriu a disputa de conclusão. */
  @Column({ name: 'completion_disputed_by_user_id', type: 'uuid', nullable: true })
  completionDisputedByUserId: string | null;

  /**
   * Quando o contrato entrou em AWAITING_COMPLETION_CONFIRMATION.
   * Útil para dashboards de SLA e triagem de contratos travados.
   */
  @Column({ name: 'completion_phase_entered_at', type: 'timestamptz', nullable: true })
  completionPhaseEnteredAt: Date | null;

  /**
   * True quando o contrato foi concluído automaticamente por aprovação tácita
   * (prazo de 72h expirou sem nenhuma das partes confirmar nem contestar).
   * False em todas as outras formas de conclusão (confirmação explícita bilateral ou unilateral).
   */
  @Column({ name: 'completed_by_tacit_approval', type: 'boolean', default: false })
  completedByTacitApproval: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'company_user_id' })
  companyUser: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creator_user_id' })
  creatorUser: User;

  @ManyToOne(() => JobType)
  @JoinColumn({ name: 'job_type_id' })
  jobType: JobType;

  @OneToMany(() => Review, (review) => review.contractRequest)
  reviews: Review[];
}
