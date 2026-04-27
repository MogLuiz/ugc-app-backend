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

@Entity('notifications')
@Index('IDX_notifications_user_created_id_desc', ['userId', 'createdAt', 'id'])
@Index('IDX_notifications_user_read_created', ['userId', 'readAt', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  data: Record<string, unknown>;

  @Column({ name: 'source_type', type: 'varchar', length: 100 })
  sourceType: string;

  @Column({ name: 'source_id', type: 'text', nullable: true })
  sourceId: string | null;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 255, nullable: true })
  dedupeKey: string | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @Column({ name: 'pushed_at', type: 'timestamptz', nullable: true })
  pushedAt: Date | null;

  @Column({ name: 'last_push_error', type: 'text', nullable: true })
  lastPushError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
