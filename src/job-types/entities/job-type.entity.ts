import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { JobMode } from '../../common/enums/job-mode.enum';

@Entity('job_types')
@Index('IDX_job_types_is_active', ['isActive'])
export class JobType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120, unique: true })
  name: string;

  @Column({ type: 'enum', enum: JobMode })
  mode: JobMode;

  @Column({ name: 'duration_minutes', type: 'int' })
  durationMinutes: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
