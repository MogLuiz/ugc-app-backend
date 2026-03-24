import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ConversationParticipantRole } from '../enums/conversation-participant-role.enum';
import { Conversation } from './conversation.entity';

@Entity('conversation_participants')
@Index('IDX_conversation_participants_conversation_id', ['conversationId'])
@Index('IDX_conversation_participants_user_id', ['userId'])
@Index('UQ_conversation_participants_conversation_user', ['conversationId', 'userId'], {
  unique: true,
})
export class ConversationParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: ConversationParticipantRole })
  role: ConversationParticipantRole;

  @Column({ name: 'last_read_at', type: 'timestamptz', nullable: true })
  lastReadAt: Date | null;

  @ManyToOne(() => Conversation, (conversation) => conversation.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
