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

@Entity('user_push_tokens')
@Index('IDX_user_push_tokens_user_provider', ['userId', 'provider'])
@Index('IDX_user_push_tokens_user_invalidated_last_seen', ['userId', 'invalidatedAt', 'lastSeenAt'])
export class UserPushToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 30, default: 'expo' })
  provider: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  token: string;

  @Column({ name: 'device_id', type: 'varchar', length: 255, nullable: true })
  deviceId: string | null;

  @Column({ name: 'device_name', type: 'varchar', length: 255, nullable: true })
  deviceName: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  platform: string | null;

  @Column({ name: 'app_version', type: 'varchar', length: 50, nullable: true })
  appVersion: string | null;

  @Column({ name: 'permission_granted', type: 'boolean', default: true })
  permissionGranted: boolean;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;

  @Column({ name: 'invalidated_at', type: 'timestamptz', nullable: true })
  invalidatedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
