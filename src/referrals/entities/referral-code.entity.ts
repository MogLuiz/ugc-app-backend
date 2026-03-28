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

@Entity('referral_codes')
@Index('IDX_referral_codes_partner_user_id', ['partnerUserId'])
export class ReferralCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'partner_user_id', type: 'uuid' })
  partnerUserId: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'partner_user_id' })
  partnerUser: User;
}
