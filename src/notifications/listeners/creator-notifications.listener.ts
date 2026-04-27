import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContractRequest } from '../../contract-requests/entities/contract-request.entity';
import {
  CONTRACT_AWAITING_COMPLETION_CONFIRMATION_EVENT,
  ContractAwaitingCompletionConfirmationEvent,
} from '../../contract-requests/events/contract-awaiting-completion-confirmation.event';
import {
  CONTRACT_VISIBLE_TO_CREATOR_EVENT,
  ContractVisibleToCreatorEvent,
} from '../../contract-requests/events/contract-visible-to-creator.event';
import { ConversationParticipantRole } from '../../conversations/enums/conversation-participant-role.enum';
import {
  MESSAGE_SENT_EVENT,
  MessageSentEvent,
} from '../../conversations/events/message-sent.event';
import { CreatorPayout } from '../../payments/entities/creator-payout.entity';
import {
  CREATOR_PAYOUT_UPDATED_EVENT,
  CreatorPayoutUpdatedEvent,
} from '../../payments/events/creator-payout-updated.event';
import { PayoutStatus } from '../../payments/enums/payout-status.enum';
import { NotificationsService } from '../notifications.service';
import { CREATOR_NOTIFICATION_TYPES } from '../creator-notification-types';

@Injectable()
export class CreatorNotificationsListener {
  private readonly logger = new Logger(CreatorNotificationsListener.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectRepository(ContractRequest)
    private readonly contractRequestRepo: Repository<ContractRequest>,
    @InjectRepository(CreatorPayout)
    private readonly payoutRepo: Repository<CreatorPayout>,
  ) {}

  @OnEvent(MESSAGE_SENT_EVENT)
  async handleMessageSent(event: MessageSentEvent): Promise<void> {
    if (event.recipientRole !== ConversationParticipantRole.CREATOR) {
      return;
    }

    try {
      await this.notificationsService.createNotification({
        userId: event.recipientUserId,
        type: CREATOR_NOTIFICATION_TYPES.MESSAGE_RECEIVED,
        title: 'Nova mensagem recebida',
        body: `${event.senderName} enviou uma nova mensagem para você.`,
        data: {
          conversationId: event.conversationId,
          contractRequestId: event.contractRequestId,
          messageId: event.messageId,
        },
        sourceType: 'conversation',
        sourceId: event.conversationId,
        dedupeKey: `${CREATOR_NOTIFICATION_TYPES.MESSAGE_RECEIVED}:${event.messageId}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create message notification for messageId=${event.messageId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  @OnEvent(CONTRACT_VISIBLE_TO_CREATOR_EVENT)
  async handleContractVisibleToCreator(
    event: ContractVisibleToCreatorEvent,
  ): Promise<void> {
    try {
      const contract = await this.contractRequestRepo.findOne({
        where: { id: event.contractRequestId },
        relations: ['companyUser', 'companyUser.profile', 'companyUser.companyProfile'],
      });
      if (!contract) {
        this.logger.warn(
          `Contract not found while creating visibility notification: contractRequestId=${event.contractRequestId}`,
        );
        return;
      }

      const companyName =
        contract.companyUser?.companyProfile?.companyName ??
        contract.companyUser?.profile?.name ??
        'Empresa';
      const isDirectInvite = event.reason === 'direct_invite_received';

      await this.notificationsService.createNotification({
        userId: event.creatorUserId,
        type: isDirectInvite
          ? CREATOR_NOTIFICATION_TYPES.DIRECT_INVITE_RECEIVED
          : CREATOR_NOTIFICATION_TYPES.OPEN_OFFER_SELECTED,
        title: isDirectInvite ? 'Novo convite direto' : 'Você foi selecionado',
        body: isDirectInvite
          ? `${companyName} enviou um convite direto para você.`
          : `${companyName} selecionou você em uma oferta aberta.`,
        data: {
          contractRequestId: contract.id,
          openOfferId: contract.openOfferId,
          companyName,
          paymentId: event.paymentId,
        },
        sourceType: 'contract_request',
        sourceId: contract.id,
        dedupeKey: `${event.reason}:${contract.id}:visible`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create visibility notification for contractRequestId=${event.contractRequestId}: ${(error as Error).message}`,
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
        userId: event.creatorUserId,
        type: CREATOR_NOTIFICATION_TYPES.COMPLETION_CONFIRMATION_REQUIRED,
        title: 'Confirmação de conclusão pendente',
        body: 'Confirme a conclusão do job para finalizar esta etapa da campanha.',
        data: {
          contractRequestId: event.contractRequestId,
        },
        sourceType: 'contract_request',
        sourceId: event.contractRequestId,
        dedupeKey: `${CREATOR_NOTIFICATION_TYPES.COMPLETION_CONFIRMATION_REQUIRED}:${event.contractRequestId}:awaiting`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create completion-confirmation notification for contractRequestId=${event.contractRequestId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  @OnEvent(CREATOR_PAYOUT_UPDATED_EVENT)
  async handleCreatorPayoutUpdated(
    event: CreatorPayoutUpdatedEvent,
  ): Promise<void> {
    try {
      const payout = await this.payoutRepo.findOne({
        where: { id: event.payoutId },
      });
      if (!payout) {
        this.logger.warn(
          `Payout not found while creating payout notification: payoutId=${event.payoutId}`,
        );
        return;
      }

      await this.notificationsService.createNotification({
        userId: event.creatorUserId,
        type: CREATOR_NOTIFICATION_TYPES.PAYOUT_UPDATED,
        title:
          event.status === PayoutStatus.PAID ? 'Repasse pago' : 'Repasse atualizado',
        body:
          event.status === PayoutStatus.PAID
            ? 'Seu repasse foi marcado como pago.'
            : 'Um novo repasse foi gerado para você.',
        data: {
          payoutId: payout.id,
          paymentId: event.paymentId,
          contractRequestId: event.contractRequestId,
          status: event.status,
          amountCents: payout.amountCents,
          currency: payout.currency,
        },
        sourceType: 'payout',
        sourceId: payout.id,
        dedupeKey: `${CREATOR_NOTIFICATION_TYPES.PAYOUT_UPDATED}:${payout.id}:${event.status}`,
      });
    } catch (error) {
      this.logger.error(
        `Failed to create payout notification for payoutId=${event.payoutId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }
}
