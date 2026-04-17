import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';
import { User } from '../../users/entities/user.entity';

/**
 * Solicitação de reembolso do saldo interno.
 * Fluxo manual: empresa solicita → admin aprova → admin executa PIX externo → marca como paid.
 * Não tem dependência direta de Payment — opera sobre CompanyBalance.
 */
@Entity('refund_requests')
@Index('IDX_refund_requests_company_user_id', ['companyUserId'])
@Index('IDX_refund_requests_status', ['status'])
export class RefundRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_user_id', type: 'uuid' })
  companyUserId: string;

  @Column({ name: 'amount_cents', type: 'int' })
  amountCents: number;

  @Column({
    type: 'varchar',
    length: 30,
    default: RefundRequestStatus.PENDING,
  })
  status: RefundRequestStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote: string | null;

  /** Nome/ID do admin que processou o reembolso. */
  @Column({ name: 'processed_by', type: 'varchar', length: 100, nullable: true })
  processedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'company_user_id' })
  companyUser: User;
}
