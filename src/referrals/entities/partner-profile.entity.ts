import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { PartnerStatus } from '../enums/partner-status.enum';

const decimalTransformer = {
  to: (value?: number | null) => value ?? null,
  from: (value: string | null) => (value == null ? null : parseFloat(value)),
};

@Entity('partner_profiles')
@Index('IDX_partner_profiles_status', ['status'])
export class PartnerProfile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: PartnerStatus.ACTIVE,
  })
  status: PartnerStatus;

  @Column({
    name: 'commission_rate_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 10.0,
    transformer: decimalTransformer,
  })
  commissionRatePercent: number;

  @Column({ name: 'display_name', type: 'varchar', length: 255, nullable: true })
  displayName: string | null;

  @Column({ name: 'activated_at', type: 'timestamptz' })
  activatedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
