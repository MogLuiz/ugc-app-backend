import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, QueryFailedError, Repository } from 'typeorm';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { UsersRepository } from '../users/users.repository';
import { User } from '../users/entities/user.entity';
import {
  decodeMessageCursor,
  encodeMessageCursor,
} from './conversation-cursor.util';
import { GetConversationMessagesDto } from './dto/get-conversation-messages.dto';
import { ListConversationsDto } from './dto/list-conversations.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { ConversationParticipantRole } from './enums/conversation-participant-role.enum';
import { Conversation } from './entities/conversation.entity';
import { ConversationsRepository } from './conversations.repository';

const ACCESSIBLE_CHAT_STATUSES: ReadonlyArray<ContractRequestStatus> = [
  ContractRequestStatus.ACCEPTED,
  ContractRequestStatus.CANCELLED,
  ContractRequestStatus.COMPLETED,
] as const;

const SEND_BLOCKED_STATUSES: ReadonlyArray<ContractRequestStatus> = [
  ContractRequestStatus.PENDING_ACCEPTANCE,
  ContractRequestStatus.REJECTED,
  ContractRequestStatus.CANCELLED,
  ContractRequestStatus.COMPLETED,
] as const;

@Injectable()
export class ConversationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly usersRepository: UsersRepository,
    private readonly conversationsRepository: ConversationsRepository,
  ) {}

  async listMyConversations(user: AuthUser, query: ListConversationsDto) {
    const actor = await this.requireAuthenticatedUser(user.authUserId);

    if (query.contractRequestId) {
      await this.ensureConversationForContractRequest(query.contractRequestId, actor.id);
    } else {
      await this.ensureEligibleConversationsForUser(actor.id);
    }

    const conversations = await this.conversationsRepository.listByUserId(
      actor.id,
      query.contractRequestId,
    );

    return Promise.all(
      conversations.map(async (conversation) => {
        const viewerParticipant = conversation.participants.find(
          (participant) => participant.userId === actor.id,
        );
        if (!viewerParticipant) {
          return null;
        }

        const contractRequest = await this.getContractRequestOrThrow(conversation.contractRequestId);
        this.ensureActorBelongsToContractRequest(actor.id, contractRequest);
        this.ensureStatusAllowsAccess(contractRequest.status);
        await this.syncConversationClosedAt(conversation, contractRequest.status);

        const otherParticipant = conversation.participants.find(
          (participant) => participant.userId !== actor.id,
        );
        const latestMessage = await this.conversationsRepository.findLatestMessageByConversationId(
          conversation.id,
        );
        const unreadCount = await this.conversationsRepository.countUnreadMessages(
          conversation.id,
          actor.id,
          viewerParticipant.lastReadAt,
        );

        return {
          id: conversation.id,
          contractRequestId: conversation.contractRequestId,
          createdAt: conversation.createdAt.toISOString(),
          lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
          closedAt: conversation.closedAt?.toISOString() ?? null,
          unreadCount,
          participant: otherParticipant
            ? {
                userId: otherParticipant.userId,
                role: otherParticipant.role,
                name: otherParticipant.user?.profile?.name ?? 'Usuário',
                avatarUrl: otherParticipant.user?.profile?.photoUrl ?? null,
              }
            : null,
          lastMessage: latestMessage
            ? {
                id: latestMessage.id,
                senderUserId: latestMessage.senderUserId,
                content: latestMessage.content,
                contentType: latestMessage.contentType,
                createdAt: latestMessage.createdAt.toISOString(),
              }
            : null,
        };
      }),
    ).then((items) => items.filter(Boolean));
  }

  async getConversationMessages(
    user: AuthUser,
    conversationId: string,
    query: GetConversationMessagesDto,
  ) {
    if (query.cursor && query.afterCursor) {
      throw new BadRequestException('Use apenas cursor ou afterCursor por requisição');
    }
    if (query.afterCursor) {
      throw new BadRequestException('afterCursor ainda não está disponível nesta versão');
    }

    const actor = await this.requireAuthenticatedUser(user.authUserId);
    const context = await this.getAccessContextOrThrow(actor.id, conversationId);
    const limit = query.limit ?? 30;
    const beforeCursor = query.cursor ? decodeMessageCursor(query.cursor) : undefined;
    const page = await this.conversationsRepository.findMessagesPage({
      conversationId,
      limit,
      before: beforeCursor,
    });

    const items = page.items.map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      senderUserId: message.senderUserId,
      content: message.content,
      contentType: message.contentType,
      createdAt: message.createdAt.toISOString(),
    }));

    if (page.items.length > 0) {
      const latestVisibleMessage = page.items[0];
      await this.conversationsRepository.updateParticipantLastReadAt(
        context.viewerParticipant.id,
        latestVisibleMessage.createdAt,
      );
    }

    const nextCursor = page.hasMore
      ? encodeMessageCursor({
          createdAt: page.items[page.items.length - 1].createdAt,
          id: page.items[page.items.length - 1].id,
        })
      : null;
    const latestCursor = page.items.length
      ? encodeMessageCursor({
          createdAt: page.items[0].createdAt,
          id: page.items[0].id,
        })
      : null;

    return {
      items,
      nextCursor,
      hasMore: page.hasMore,
      polling: {
        latestCursor,
        supportsAfterCursor: false,
        dedupeKey: 'id',
      },
    };
  }

  async sendMessage(user: AuthUser, conversationId: string, dto: SendMessageDto) {
    const actor = await this.requireAuthenticatedUser(user.authUserId);
    const content = dto.content.trim();

    if (!content) {
      throw new BadRequestException('A mensagem não pode estar vazia');
    }

    if (content.length > 2000) {
      throw new BadRequestException('A mensagem deve ter no máximo 2000 caracteres');
    }

    return this.dataSource.transaction(async (manager) => {
      const context = await this.getAccessContextOrThrow(actor.id, conversationId, manager);
      this.ensureStatusAllowsSend(context.contractRequest.status);

      if (context.conversation.closedAt) {
        throw new BadRequestException('Esta conversa está fechada para envio de mensagens');
      }

      const message = await this.conversationsRepository.createMessage(
        {
          conversationId,
          senderUserId: actor.id,
          content,
        },
        manager,
      );
      await this.conversationsRepository.updateConversationLastMessageAt(
        conversationId,
        message.createdAt,
        manager,
      );
      await this.conversationsRepository.updateParticipantLastReadAt(
        context.viewerParticipant.id,
        message.createdAt,
        manager,
      );

      return {
        id: message.id,
        conversationId: message.conversationId,
        senderUserId: message.senderUserId,
        content: message.content,
        contentType: message.contentType,
        createdAt: message.createdAt.toISOString(),
      };
    });
  }

  async canUserAccessConversation(userId: string, conversationId: string): Promise<boolean> {
    const conversation = await this.conversationsRepository.findByIdWithParticipants(conversationId);
    if (!conversation) {
      return false;
    }

    const participant = conversation.participants.find((item) => item.userId === userId);
    if (!participant) {
      return false;
    }

    const contractRequest = await this.contractRequestsRepository().findOne({
      where: { id: conversation.contractRequestId },
    });
    if (!contractRequest) {
      return false;
    }

    if (
      userId !== contractRequest.companyUserId &&
      userId !== contractRequest.creatorUserId
    ) {
      return false;
    }

    if (contractRequest.status === ContractRequestStatus.PENDING_ACCEPTANCE) {
      return false;
    }

    const expectedRole =
      userId === contractRequest.companyUserId
        ? ConversationParticipantRole.COMPANY
        : ConversationParticipantRole.CREATOR;

    return participant.role === expectedRole;
  }

  async ensureConversationForContractRequest(
    contractRequestId: string,
    actorUserId: string,
    manager?: EntityManager,
  ): Promise<Conversation> {
    const repository = this.contractRequestsRepository(manager);
    const contractRequest = await repository.findOne({ where: { id: contractRequestId } });
    if (!contractRequest) {
      throw new NotFoundException('Contratação não encontrada');
    }

    this.ensureActorBelongsToContractRequest(actorUserId, contractRequest);
    this.ensureStatusAllowsAccess(contractRequest.status);

    const existing = manager
      ? await this.conversationsRepository.findByContractRequestIdForUpdate(
          contractRequestId,
          manager,
        )
      : await this.conversationsRepository.findByContractRequestId(contractRequestId);

    if (existing) {
      await this.syncConversationClosedAt(existing, contractRequest.status, manager);
      return existing;
    }

    if (manager) {
      return this.createConversationInternal(contractRequest, manager);
    }

    return this.dataSource.transaction(async (txManager) =>
      this.createConversationInternal(contractRequest, txManager),
    );
  }

  private async createConversationInternal(
    contractRequest: ContractRequest,
    manager: EntityManager,
  ): Promise<Conversation> {
    const closedAt = this.isClosedStatus(contractRequest.status) ? new Date() : null;

    try {
      const conversation = await this.conversationsRepository.createConversation(
        {
          contractRequestId: contractRequest.id,
          closedAt,
        },
        manager,
      );
      await this.conversationsRepository.createParticipants(
        [
          {
            conversationId: conversation.id,
            userId: contractRequest.companyUserId,
            role: ConversationParticipantRole.COMPANY,
          },
          {
            conversationId: conversation.id,
            userId: contractRequest.creatorUserId,
            role: ConversationParticipantRole.CREATOR,
          },
        ],
        manager,
      );

      const persisted = await this.conversationsRepository.findByContractRequestId(
        contractRequest.id,
        manager,
      );
      if (!persisted) {
        throw new NotFoundException('Conversa não encontrada após criação');
      }
      return persisted;
    } catch (error) {
      const maybeQueryError = error as QueryFailedError & { code?: string };
      if (maybeQueryError.code === '23505') {
        const existing = await this.conversationsRepository.findByContractRequestId(
          contractRequest.id,
          manager,
        );
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  private async ensureEligibleConversationsForUser(actorUserId: string): Promise<void> {
    const contractRequests = await this.contractRequestsRepository()
      .createQueryBuilder('contractRequest')
      .leftJoin(Conversation, 'conversation', 'conversation.contract_request_id = contractRequest.id')
      .where(
        '(contractRequest.company_user_id = :actorUserId OR contractRequest.creator_user_id = :actorUserId)',
        { actorUserId },
      )
      .andWhere('contractRequest.status IN (:...statuses)', {
        statuses: ACCESSIBLE_CHAT_STATUSES,
      })
      .andWhere('conversation.id IS NULL')
      .getMany();

    for (const contractRequest of contractRequests) {
      await this.ensureConversationForContractRequest(contractRequest.id, actorUserId);
    }
  }

  private async requireAuthenticatedUser(authUserId: string): Promise<User> {
    const user = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
    if (!user) {
      throw new NotFoundException(
        'Usuário não encontrado. Complete o cadastro em POST /users/bootstrap',
      );
    }
    return user;
  }

  private contractRequestsRepository(manager?: EntityManager): Repository<ContractRequest> {
    return manager
      ? manager.getRepository(ContractRequest)
      : this.dataSource.getRepository(ContractRequest);
  }

  private ensureActorBelongsToContractRequest(userId: string, contractRequest: ContractRequest): void {
    if (
      userId !== contractRequest.companyUserId &&
      userId !== contractRequest.creatorUserId
    ) {
      throw new ForbiddenException('Você não participa desta contratação');
    }
  }

  private ensureStatusAllowsAccess(status: ContractRequestStatus): void {
    if (!ACCESSIBLE_CHAT_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Chat indisponível para contratação com status ${status}`,
      );
    }
  }

  private ensureStatusAllowsSend(status: ContractRequestStatus): void {
    if (SEND_BLOCKED_STATUSES.includes(status)) {
      throw new BadRequestException(
        `Não é possível enviar mensagens para contratação com status ${status}`,
      );
    }
  }

  private isClosedStatus(status: ContractRequestStatus): boolean {
    return status === ContractRequestStatus.CANCELLED || status === ContractRequestStatus.COMPLETED;
  }

  private async syncConversationClosedAt(
    conversation: Conversation,
    status: ContractRequestStatus,
    manager?: EntityManager,
  ): Promise<void> {
    if (!this.isClosedStatus(status) || conversation.closedAt) {
      return;
    }

    const closedAt = new Date();
    await this.conversationsRepository.closeConversation(conversation.id, closedAt, manager);
    conversation.closedAt = closedAt;
  }

  private async getContractRequestOrThrow(contractRequestId: string): Promise<ContractRequest> {
    const contractRequest = await this.contractRequestsRepository().findOne({
      where: { id: contractRequestId },
    });
    if (!contractRequest) {
      throw new NotFoundException('Contratação não encontrada');
    }
    return contractRequest;
  }

  private async getAccessContextOrThrow(
    actorUserId: string,
    conversationId: string,
    manager?: EntityManager,
  ): Promise<{
    conversation: Conversation;
    contractRequest: ContractRequest;
    viewerParticipant: {
      id: string;
      role: ConversationParticipantRole;
    };
  }> {
    const conversation = await this.conversationsRepository.findByIdWithParticipants(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversa não encontrada');
    }

    const viewerParticipant = conversation.participants.find(
      (participant) => participant.userId === actorUserId,
    );
    if (!viewerParticipant) {
      throw new ForbiddenException('Você não participa desta conversa');
    }

    const contractRequest = await this.getContractRequestOrThrow(conversation.contractRequestId);
    this.ensureActorBelongsToContractRequest(actorUserId, contractRequest);
    this.ensureStatusAllowsAccess(contractRequest.status);
    await this.syncConversationClosedAt(conversation, contractRequest.status, manager);

    const expectedRole =
      actorUserId === contractRequest.companyUserId
        ? ConversationParticipantRole.COMPANY
        : ConversationParticipantRole.CREATOR;
    if (viewerParticipant.role !== expectedRole) {
      throw new ForbiddenException('Participante inválido para esta conversa');
    }

    return {
      conversation,
      contractRequest,
      viewerParticipant: {
        id: viewerParticipant.id,
        role: viewerParticipant.role,
      },
    };
  }
}
