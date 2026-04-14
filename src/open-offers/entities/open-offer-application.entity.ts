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
import { OpenOffer } from './open-offer.entity';
import { ApplicationStatus } from '../../common/enums/application-status.enum';

@Entity('open_offer_applications')
@Unique('UQ_open_offer_applications_offer_creator', ['openOfferId', 'creatorUserId'])
@Index('IDX_open_offer_applications_offer_status', ['openOfferId', 'status'])
@Index('IDX_open_offer_applications_creator_status', ['creatorUserId', 'status', 'appliedAt'])
export class OpenOfferApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'open_offer_id', type: 'uuid' })
  openOfferId: string;

  @Column({ name: 'creator_user_id', type: 'uuid' })
  creatorUserId: string;

  @Column({ type: 'enum', enum: ApplicationStatus, default: ApplicationStatus.PENDING })
  status: ApplicationStatus;

  @Column({ name: 'applied_at', type: 'timestamptz', default: () => 'now()' })
  appliedAt: Date;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => OpenOffer, (offer) => offer.applications)
  @JoinColumn({ name: 'open_offer_id' })
  openOffer: OpenOffer;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creator_user_id' })
  creatorUser: User;
}
