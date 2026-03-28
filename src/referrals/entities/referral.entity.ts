import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ReferralCode } from './referral-code.entity';
import { ContractRequest } from '../../contract-requests/entities/contract-request.entity';
import { ReferralStatus } from '../enums/referral-status.enum';

@Entity('referrals')
@Index('IDX_referrals_partner_user_id', ['partnerUserId'])
@Index('IDX_referrals_status', ['status'])
@Index('IDX_referrals_referral_code_id', ['referralCodeId'])
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'partner_user_id', type: 'uuid' })
  partnerUserId: string;

  @Column({ name: 'referred_user_id', type: 'uuid', unique: true })
  referredUserId: string;

  @Column({ name: 'referral_code_id', type: 'uuid' })
  referralCodeId: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: ReferralStatus.PENDING,
  })
  status: ReferralStatus;

  @Column({ name: 'qualified_at', type: 'timestamptz', nullable: true })
  qualifiedAt: Date | null;

  @Column({ name: 'qualifying_contract_request_id', type: 'uuid', nullable: true })
  qualifyingContractRequestId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'partner_user_id' })
  partnerUser: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'referred_user_id' })
  referredUser: User;

  @ManyToOne(() => ReferralCode)
  @JoinColumn({ name: 'referral_code_id' })
  referralCode: ReferralCode;

  @ManyToOne(() => ContractRequest)
  @JoinColumn({ name: 'qualifying_contract_request_id' })
  qualifyingContractRequest: ContractRequest | null;
}
