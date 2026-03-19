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
import { JobType } from '../../job-types/entities/job-type.entity';
import { JobMode } from '../../common/enums/job-mode.enum';
import { BookingStatus } from '../../common/enums/booking-status.enum';
import { BookingOrigin } from '../../common/enums/booking-origin.enum';

@Entity('bookings')
@Index('IDX_bookings_creator_start_date_time', ['creatorUserId', 'startDateTime'])
@Index('IDX_bookings_company_start_date_time', ['companyUserId', 'startDateTime'])
@Index('IDX_bookings_status', ['status'])
@Index('IDX_bookings_job_type_id', ['jobTypeId'])
@Index('IDX_bookings_creator_status_start', ['creatorUserId', 'status', 'startDateTime'])
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'company_user_id', type: 'uuid' })
  companyUserId: string;

  @Column({ name: 'creator_user_id', type: 'uuid' })
  creatorUserId: string;

  @Column({ name: 'job_type_id', type: 'uuid' })
  jobTypeId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: JobMode })
  mode: JobMode;

  @Column({ type: 'enum', enum: BookingStatus, default: BookingStatus.PENDING })
  status: BookingStatus;

  @Column({ name: 'start_date_time', type: 'timestamptz' })
  startDateTime: Date;

  @Column({ name: 'end_date_time', type: 'timestamptz' })
  endDateTime: Date;

  @Column({ type: 'enum', enum: BookingOrigin })
  origin: BookingOrigin;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'job_type_name_snapshot', type: 'varchar', length: 120 })
  jobTypeNameSnapshot: string;

  @Column({ name: 'duration_minutes_snapshot', type: 'int' })
  durationMinutesSnapshot: number;

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
}
