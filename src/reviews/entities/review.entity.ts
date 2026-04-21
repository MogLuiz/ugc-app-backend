import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ContractRequest } from '../../contract-requests/entities/contract-request.entity';
import { User } from '../../users/entities/user.entity';
import { ReviewerRole } from '../enums/reviewer-role.enum';

@Entity('reviews')
@Unique('UQ_reviews_contract_reviewer', ['contractRequestId', 'reviewerUserId'])
@Index('IDX_reviews_contract_request_id', ['contractRequestId'])
@Index('IDX_reviews_reviewee_user_id', ['revieweeUserId'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'contract_request_id', type: 'uuid' })
  contractRequestId: string;

  @Column({ name: 'reviewer_user_id', type: 'uuid' })
  reviewerUserId: string;

  @Column({ name: 'reviewee_user_id', type: 'uuid' })
  revieweeUserId: string;

  @Column({ name: 'reviewer_role', type: 'enum', enum: ReviewerRole })
  reviewerRole: ReviewerRole;

  /** Rating inteiro de 1 a 5. */
  @Column({ type: 'int' })
  rating: number;

  /** Comentário opcional. Trim aplicado antes de persistir; null se vazio. */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => ContractRequest)
  @JoinColumn({ name: 'contract_request_id' })
  contractRequest: ContractRequest;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reviewer_user_id' })
  reviewer: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reviewee_user_id' })
  reviewee: User;
}
