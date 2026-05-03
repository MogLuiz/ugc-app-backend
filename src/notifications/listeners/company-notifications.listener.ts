import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CONTRACT_REQUEST_COMPLETED_EVENT,
  ContractRequestCompletedEvent,
} from '../../contract-requests/events/contract-request-completed.event';
import {
  CONTRACT_REQUEST_ACCEPTED_EVENT,
  ContractRequestAcceptedEvent,
} from '../../contract-requests/events/contract-request-accepted.event';
import {
  CONTRACT_AWAITING_COMPLETION_CONFIRMATION_EVENT,
  ContractAwaitingCompletionConfirmationEvent,
} from '../../contract-requests/events/contract-awaiting-completion-confirmation.event';
import { ConversationParticipantRole } from '../../conversations/enums/conversation-participant-role.enum';
import {
  MESSAGE_SENT_EVENT,
  MessageSentEvent,
} from '../../conversations/events/message-sent.event';
import {
  OPEN_OFFER_APPLICATION_CREATED_EVENT,
  OpenOfferApplicationCreatedEvent,
} from '../../open-offers/events/open-offer-application-created.event';
import { Review } from '../../reviews/entities/review.entity';
import { COMPANY_NOTIFICATION_TYPES } from '../company-notification-types';
import { NotificationsService } from '../notifications.service';

@Injectable()
export class CompanyNotificationsListener {
  private readonly logger = new Logger(CompanyNotificationsListener.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
  ) {}

  @OnEvent(OPEN_OFFER_APPLICATION_CREATED_EVENT)
  async handleOpenOfferApplicationCreated(
    event: OpenOfferApplicationCreatedEvent,
  ): Promise<void> {
    try {
      // TODO: agrupar candidaturas por oferta em uma janela de 15-30 minutos.
      await this.notificationsService.createNotification({
        userId: event.companyUserId,
        type: COMPANY_NOTIFICATION_TYPES.NEW_APPLICATION_RECEIVED,
        title: 'Nova candidatura recebida',
        body: `${event.creatorName} se candidatou para ${event.offerTitle}.`,
        data: {
          openOfferId: event.openOfferId,
          applicationId: event.applicationId,
          creatorId: event.creatorId,
          creatorName: event.creatorName,
          offerTitle: event.offerTitle,
        },
        sourceType: 'open_offer',
        sourceId: event.openOfferId,
        dedupeKey: `${COMPANY_NOTIFICATION_TYPES.NEW_APPLICATION_RECEIVED}:${event.applicationId}`,
        shouldPush: true,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create application notification for applicationId=${event.applicationId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  @OnEvent(MESSAGE_SENT_EVENT)
  async handleMessageSent(event: MessageSentEvent): Promise<void> {
    if (event.recipientRole !== ConversationParticipantRole.COMPANY) {
      return;
    }

    try {
      // TODO: agrupar mensagens por conversa antes de promover novos pushes.
      await this.notificationsService.createNotification({
        userId: event.recipientUserId,
        type: COMPANY_NOTIFICATION_TYPES.MESSAGE_RECEIVED,
        title: 'Nova mensagem recebida',
        body: `${event.senderName} enviou uma nova mensagem.`,
        data: {
          conversationId: event.conversationId,
          contractRequestId: event.contractRequestId,
          messageId: event.messageId,
          senderUserId: event.senderUserId,
          senderName: event.senderName,
        },
        sourceType: 'conversation',
        sourceId: event.conversationId,
        dedupeKey: `${COMPANY_NOTIFICATION_TYPES.MESSAGE_RECEIVED}:${event.messageId}`,
        shouldPush: true,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create company message notification for messageId=${event.messageId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  @OnEvent(CONTRACT_REQUEST_ACCEPTED_EVENT)
  async handleContractRequestAccepted(
    event: ContractRequestAcceptedEvent,
  ): Promise<void> {
    if (event.openOfferId) {
      return;
    }

    try {
      await this.notificationsService.createNotification({
        userId: event.companyUserId,
        type: COMPANY_NOTIFICATION_TYPES.DIRECT_INVITE_ACCEPTED,
        title: 'Convite aceito',
        body: `${event.creatorName} aceitou seu convite para ${event.offerTitle}.`,
        data: {
          contractRequestId: event.contractRequestId,
          creatorId: event.creatorId,
          creatorName: event.creatorName,
          offerTitle: event.offerTitle,
        },
        sourceType: 'contract_request',
        sourceId: event.contractRequestId,
        dedupeKey: `${COMPANY_NOTIFICATION_TYPES.DIRECT_INVITE_ACCEPTED}:${event.contractRequestId}`,
        shouldPush: true,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create invite-accepted notification for contractRequestId=${event.contractRequestId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  @OnEvent(CONTRACT_AWAITING_COMPLETION_CONFIRMATION_EVENT)
  async handleAwaitingCompletionConfirmation(
    event: ContractAwaitingCompletionConfirmationEvent,
  ): Promise<void> {
    try {
      await this.notificationsService.createNotification({
        userId: event.companyUserId,
        type: COMPANY_NOTIFICATION_TYPES.COMPLETION_CONFIRMATION_REQUIRED,
        title: 'Confirme a conclusão do trabalho',
        body: 'O creator marcou o job como concluído. Revise e confirme.',
        data: {
          contractRequestId: event.contractRequestId,
          contestDeadlineAt: event.contestDeadlineAt.toISOString(),
        },
        sourceType: 'contract_request',
        sourceId: event.contractRequestId,
        dedupeKey: `${COMPANY_NOTIFICATION_TYPES.COMPLETION_CONFIRMATION_REQUIRED}:${event.contractRequestId}:awaiting`,
        shouldPush: true,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create completion-confirmation notification for contractRequestId=${event.contractRequestId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  @OnEvent(CONTRACT_REQUEST_COMPLETED_EVENT)
  async handleContractRequestCompleted(
    event: ContractRequestCompletedEvent,
  ): Promise<void> {
    try {
      const existingReview = await this.reviewRepo.findOne({
        where: {
          contractRequestId: event.contractRequestId,
          reviewerUserId: event.companyUserId,
        },
      });

      if (existingReview) {
        return;
      }

      await this.notificationsService.createNotification({
        userId: event.companyUserId,
        type: COMPANY_NOTIFICATION_TYPES.REVIEW_CREATOR_REQUIRED,
        title: 'Avalie o creator',
        body: 'O trabalho foi concluído. Falta sua avaliação.',
        data: {
          contractRequestId: event.contractRequestId,
          creatorId: event.creatorUserId,
        },
        sourceType: 'contract_request',
        sourceId: event.contractRequestId,
        dedupeKey: `${COMPANY_NOTIFICATION_TYPES.REVIEW_CREATOR_REQUIRED}:${event.contractRequestId}`,
        shouldPush: false,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create review reminder notification for contractRequestId=${event.contractRequestId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
