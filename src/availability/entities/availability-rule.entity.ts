import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AvailabilityDayOfWeek } from '../../common/enums/availability-day-of-week.enum';

@Entity('availability_rules')
@Unique('UQ_availability_rules_creator_day', ['creatorUserId', 'dayOfWeek'])
@Index('IDX_availability_rules_creator_day', ['creatorUserId', 'dayOfWeek'])
export class AvailabilityRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'creator_user_id', type: 'uuid' })
  creatorUserId: string;

  @Column({ name: 'day_of_week', type: 'enum', enum: AvailabilityDayOfWeek })
  dayOfWeek: AvailabilityDayOfWeek;

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creator_user_id' })
  creatorUser: User;
}
