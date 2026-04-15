import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Payment } from './payment.entity';
import { PayoutStatus } from '../enums/payout-status.enum';

/**
 * Representa o repasse devido ao creator.
 * Criado apenas quando Payment.status = 'paid'.
 *
 * No MVP, o repasse é manual via PIX fora do app.
 * O sistema controla pendência, histórico, status e rastreabilidade.
 * A plataforma realiza o PIX externamente e marca como pago via endpoint de admin.
 */
@Entity('creator_payouts')
@Index('IDX_creator_payouts_payment_id', ['paymentId'])
@Index('IDX_creator_payouts_creator_user_id_status', ['creatorUserId', 'status'])
@Index('IDX_creator_payouts_status', ['status'])
export class CreatorPayout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId: string;

  @Column({ name: 'creator_user_id', type: 'uuid' })
  creatorUserId: string;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({ type: 'varchar', length: 3, default: 'BRL' })
  currency: string;

  @Column({ name: 'status', type: 'varchar', length: 30, default: PayoutStatus.PENDING })
  status: PayoutStatus;

  @Column({ name: 'scheduled_for', type: 'timestamptz', nullable: true })
  scheduledFor: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  /** userId do admin que executou o repasse. */
  @Column({ name: 'marked_paid_by', type: 'varchar', length: 100, nullable: true })
  markedPaidBy: string | null;

  /** Nota interna obrigatória ao marcar como pago. */
  @Column({ name: 'internal_note', type: 'text', nullable: true })
  internalNote: string | null;

  /** URL do comprovante de transferência (opcional, uso futuro). */
  @Column({ name: 'receipt_url', type: 'varchar', length: 500, nullable: true })
  receiptUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Payment, (payment) => payment.payouts)
  @JoinColumn({ name: 'payment_id' })
  payment: Payment;
}
