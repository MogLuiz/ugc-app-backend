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
import { LegalTermType } from '../../common/enums/legal-term-type.enum';

@Entity('legal_acceptances')
@Index('UQ_legal_acceptances_user_term_version', ['userId', 'termType', 'termVersion'], {
  unique: true,
})
@Index('IDX_legal_acceptances_user_term_accepted_at', ['userId', 'termType', 'acceptedAt'])
export class LegalAcceptance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({
    name: 'term_type',
    type: 'enum',
    enum: LegalTermType,
  })
  termType: LegalTermType;

  @Column({ name: 'term_version', type: 'varchar', length: 50 })
  termVersion: string;

  @Column({ name: 'accepted_at', type: 'timestamptz' })
  acceptedAt: Date;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
