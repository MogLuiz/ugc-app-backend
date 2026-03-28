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
import { User } from '../../users/entities/user.entity';
import { Referral } from './referral.entity';
import { ContractRequest } from '../../contract-requests/entities/contract-request.entity';
import { CommissionStatus } from '../enums/commission-status.enum';

const decimalTransformer = {
  to: (value?: number | null) => value ?? null,
  from: (value: string | null) => (value == null ? null : parseFloat(value)),
};

@Entity('commissions')
@Index('IDX_commissions_referral_id', ['referralId'])
@Index('IDX_commissions_partner_user_id_status', ['partnerUserId', 'status'])
@Index('IDX_commissions_status', ['status'])
@Index('IDX_commissions_created_at', ['createdAt'])
export class Commission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'referral_id', type: 'uuid' })
  referralId: string;

  @Column({ name: 'contract_request_id', type: 'uuid', unique: true })
  contractRequestId: string;

  @Column({ name: 'partner_user_id', type: 'uuid' })
  partnerUserId: string;

  @Column({ name: 'gross_amount_cents', type: 'int' })
  grossAmountCents: number;

  @Column({
    name: 'commission_rate_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    transformer: decimalTransformer,
  })
  commissionRatePercent: number;

  @Column({ name: 'commission_amount_cents', type: 'int' })
  commissionAmountCents: number;

  @Column({ type: 'varchar', length: 3, default: 'BRL' })
  currency: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: CommissionStatus.PENDING,
  })
  status: CommissionStatus;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Referral)
  @JoinColumn({ name: 'referral_id' })
  referral: Referral;

  @ManyToOne(() => ContractRequest)
  @JoinColumn({ name: 'contract_request_id' })
  contractRequest: ContractRequest;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'partner_user_id' })
  partnerUser: User;
}
