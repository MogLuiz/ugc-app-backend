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
import { MessageContentType } from '../enums/message-content-type.enum';
import { Conversation } from './conversation.entity';

@Entity('messages')
@Index('IDX_messages_conversation_created_id_desc', ['conversationId', 'createdAt', 'id'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @Column({ name: 'sender_user_id', type: 'uuid' })
  senderUserId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({
    name: 'content_type',
    type: 'enum',
    enum: MessageContentType,
    default: MessageContentType.TEXT,
  })
  contentType: MessageContentType;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sender_user_id' })
  senderUser: User;
}
