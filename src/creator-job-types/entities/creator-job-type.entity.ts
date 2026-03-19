import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CreatorProfile } from '../../profiles/entities/creator-profile.entity';
import { JobType } from '../../job-types/entities/job-type.entity';

@Entity('creator_job_types')
export class CreatorJobType {
  @PrimaryColumn({ name: 'creator_profile_user_id', type: 'uuid' })
  creatorProfileUserId: string;

  @PrimaryColumn({ name: 'job_type_id', type: 'uuid' })
  jobTypeId: string;

  @Column({ name: 'base_price_cents', type: 'int', nullable: true })
  basePriceCents: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => CreatorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creator_profile_user_id' })
  creatorProfile: CreatorProfile;

  @ManyToOne(() => JobType, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_type_id' })
  @Index('IDX_creator_job_types_job_type')
  jobType: JobType;
}
