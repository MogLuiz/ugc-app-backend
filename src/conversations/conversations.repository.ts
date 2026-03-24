import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ConversationParticipantRole } from './enums/conversation-participant-role.enum';
import { MessageContentType } from './enums/message-content-type.enum';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';

type CreateConversationParams = {
  contractRequestId: string;
  closedAt?: Date | null;
};

type CreateParticipantParams = {
  conversationId: string;
  userId: string;
  role: ConversationParticipantRole;
  lastReadAt?: Date | null;
};

@Injectable()
export class ConversationsRepository {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ConversationParticipant)
    private readonly participantRepo: Repository<ConversationParticipant>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
  ) {}

  private conversationRepository(manager?: EntityManager): Repository<Conversation> {
    return manager ? manager.getRepository(Conversation) : this.conversationRepo;
  }

  private participantRepository(manager?: EntityManager): Repository<ConversationParticipant> {
    return manager ? manager.getRepository(ConversationParticipant) : this.participantRepo;
  }

  private messagesRepository(manager?: EntityManager): Repository<Message> {
    return manager ? manager.getRepository(Message) : this.messageRepo;
  }

  async findByIdWithParticipants(conversationId: string): Promise<Conversation | null> {
    return this.conversationRepo.findOne({
      where: { id: conversationId },
      relations: ['participants'],
    });
  }

  async findByContractRequestId(
    contractRequestId: string,
    manager?: EntityManager,
  ): Promise<Conversation | null> {
    return this.conversationRepository(manager).findOne({
      where: { contractRequestId },
      relations: ['participants'],
    });
  }

  async findByContractRequestIdForUpdate(
    contractRequestId: string,
    manager: EntityManager,
  ): Promise<Conversation | null> {
    return this.conversationRepository(manager).findOne({
      where: { contractRequestId },
      relations: ['participants'],
      lock: { mode: 'pessimistic_write' },
    });
  }

  async createConversation(
    params: CreateConversationParams,
    manager: EntityManager,
  ): Promise<Conversation> {
    const repository = this.conversationRepository(manager);
    const conversation = repository.create({
      contractRequestId: params.contractRequestId,
      closedAt: params.closedAt ?? null,
      lastMessageAt: null,
    });
    return repository.save(conversation);
  }

  async createParticipants(
    params: CreateParticipantParams[],
    manager: EntityManager,
  ): Promise<ConversationParticipant[]> {
    const repository = this.participantRepository(manager);
    const entities = params.map((item) =>
      repository.create({
        conversationId: item.conversationId,
        userId: item.userId,
        role: item.role,
        lastReadAt: item.lastReadAt ?? null,
      }),
    );
    return repository.save(entities);
  }

  async listByUserId(userId: string, contractRequestId?: string): Promise<Conversation[]> {
    const qb = this.conversationRepo
      .createQueryBuilder('conversation')
      .innerJoinAndSelect(
        'conversation.participants',
        'viewerParticipant',
        'viewerParticipant.user_id = :userId',
        { userId },
      )
      .leftJoinAndSelect('conversation.participants', 'participants')
      .leftJoinAndSelect('participants.user', 'participantUser')
      .leftJoinAndSelect('participantUser.profile', 'participantProfile')
      .orderBy('COALESCE(conversation.last_message_at, conversation.created_at)', 'DESC')
      .addOrderBy('conversation.id', 'DESC');

    if (contractRequestId) {
      qb.andWhere('conversation.contract_request_id = :contractRequestId', {
        contractRequestId,
      });
    }

    return qb.getMany();
  }

  async findParticipant(
    conversationId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<ConversationParticipant | null> {
    return this.participantRepository(manager).findOne({
      where: { conversationId, userId },
    });
  }

  async updateParticipantLastReadAt(
    participantId: string,
    lastReadAt: Date,
    manager?: EntityManager,
  ): Promise<void> {
    await this.participantRepository(manager)
      .createQueryBuilder()
      .update(ConversationParticipant)
      .set({ lastReadAt })
      .where('id = :participantId', { participantId })
      .andWhere('(last_read_at IS NULL OR last_read_at < :lastReadAt)', { lastReadAt })
      .execute();
  }

  async findMessagesPage(params: {
    conversationId: string;
    limit: number;
    before?: { createdAt: Date; id: string };
  }): Promise<{ items: Message[]; hasMore: boolean }> {
    const qb = this.messageRepo
      .createQueryBuilder('message')
      .where('message.conversation_id = :conversationId', {
        conversationId: params.conversationId,
      })
      .orderBy('message.created_at', 'DESC')
      .addOrderBy('message.id', 'DESC')
      .take(params.limit + 1);

    if (params.before) {
      qb.andWhere(
        '(message.created_at < :beforeCreatedAt OR (message.created_at = :beforeCreatedAt AND message.id < :beforeId))',
        {
          beforeCreatedAt: params.before.createdAt.toISOString(),
          beforeId: params.before.id,
        },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > params.limit;
    return {
      items: hasMore ? rows.slice(0, params.limit) : rows,
      hasMore,
    };
  }

  async findLatestMessageByConversationId(conversationId: string): Promise<Message | null> {
    return this.messageRepo.findOne({
      where: { conversationId },
      order: {
        createdAt: 'DESC',
        id: 'DESC',
      },
    });
  }

  async countUnreadMessages(
    conversationId: string,
    currentUserId: string,
    lastReadAt: Date | null,
  ): Promise<number> {
    const qb = this.messageRepo
      .createQueryBuilder('message')
      .where('message.conversation_id = :conversationId', { conversationId })
      .andWhere('message.sender_user_id != :currentUserId', { currentUserId });

    if (lastReadAt) {
      qb.andWhere('message.created_at > :lastReadAt', {
        lastReadAt: lastReadAt.toISOString(),
      });
    }

    return qb.getCount();
  }

  async createMessage(
    params: {
      conversationId: string;
      senderUserId: string;
      content: string;
      contentType?: MessageContentType;
    },
    manager: EntityManager,
  ): Promise<Message> {
    const repository = this.messagesRepository(manager);
    const message = repository.create({
      conversationId: params.conversationId,
      senderUserId: params.senderUserId,
      content: params.content,
      contentType: params.contentType ?? MessageContentType.TEXT,
    });
    return repository.save(message);
  }

  async updateConversationLastMessageAt(
    conversationId: string,
    lastMessageAt: Date,
    manager: EntityManager,
  ): Promise<void> {
    await this.conversationRepository(manager).update(conversationId, { lastMessageAt });
  }

  async closeConversation(conversationId: string, closedAt: Date, manager?: EntityManager): Promise<void> {
    await this.conversationRepository(manager)
      .createQueryBuilder()
      .update(Conversation)
      .set({ closedAt })
      .where('id = :conversationId', { conversationId })
      .andWhere('closed_at IS NULL')
      .execute();
  }
}
