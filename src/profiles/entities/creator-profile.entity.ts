import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('creator_profiles')
export class CreatorProfile {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cpf: string | null;

  @Column({ name: 'instagram_username', type: 'varchar', length: 100, nullable: true })
  instagramUsername: string | null;

  @Column({ name: 'tiktok_username', type: 'varchar', length: 100, nullable: true })
  tiktokUsername: string | null;

  @Column({ name: 'referral_source', type: 'varchar', length: 255, nullable: true })
  referralSource: string | null;

  @Column({ name: 'portfolio_url', type: 'varchar', length: 500, nullable: true })
  portfolioUrl: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;
}
