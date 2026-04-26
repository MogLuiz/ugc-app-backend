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
import { OpenOfferStatus } from '../../common/enums/open-offer-status.enum';
import { OpenOfferApplication } from './open-offer-application.entity';

const decimalTransformer = {
  to: (value?: number | null) => value ?? null,
  from: (value: string | null) => (value == null ? null : parseFloat(value)),
};

@Entity('open_offers')
@Index('IDX_open_offers_company_created_at', ['companyUserId', 'createdAt'])
@Index('IDX_open_offers_status_expires_at', ['status', 'expiresAt'])
@Index('IDX_open_offers_status_starts_at', ['status', 'startsAt'])
@Index('IDX_open_offers_job_type_id', ['jobTypeId'])
export class OpenOffer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_user_id', type: 'uuid' })
  companyUserId: string;

  @Column({ name: 'job_type_id', type: 'uuid' })
  jobTypeId: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'duration_minutes', type: 'int' })
  durationMinutes: number;

  @Column({ name: 'job_address', type: 'text' })
  jobAddress: string;

  @Column({ name: 'job_formatted_address', type: 'varchar', length: 500, nullable: true })
  jobFormattedAddress: string | null;

  @Column({ name: 'job_latitude', type: 'decimal', precision: 10, scale: 7, transformer: decimalTransformer })
  jobLatitude: number;

  @Column({ name: 'job_longitude', type: 'decimal', precision: 10, scale: 7, transformer: decimalTransformer })
  jobLongitude: number;

  @Column({ name: 'service_gross_amount_cents', type: 'int' })
  serviceGrossAmountCents: number;

  @Column({ name: 'platform_fee_bps_snapshot', type: 'int' })
  platformFeeBpsSnapshot: number;

  @Column({ name: 'platform_fee_amount_cents', type: 'int' })
  platformFeeAmountCents: number;

  @Column({ name: 'creator_net_service_amount_cents', type: 'int' })
  creatorNetServiceAmountCents: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'enum', enum: OpenOfferStatus, default: OpenOfferStatus.OPEN })
  status: OpenOfferStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'company_user_id' })
  companyUser: User;

  @ManyToOne(() => JobType)
  @JoinColumn({ name: 'job_type_id' })
  jobType: JobType;

  @OneToMany(() => OpenOfferApplication, (app) => app.openOffer)
  applications: OpenOfferApplication[];
}
